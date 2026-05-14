// POST /api/vessel-check
// IMO number vessel sanctions screening via vessel-check-api.
// Returns ownership chain, flag state, and any sanction list hits.
//
// Body: { imoNumber: string }  — or batch: { imoNumbers: string[] }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { checkVessel, screenVessels } from "../../../../dist/src/integrations/vesselCheck.js";
import { withRetry } from "@/lib/server/circuitBreaker";
import { lookupLsegVesselByImo } from "@/lib/lseg/vessel-index";

// IMO check digit validation
function validateImo(imo: string): boolean {
  const digits = imo.split("").map(Number);
  const check = digits[6]!;
  const sum = digits.slice(0, 6).reduce((acc, d, i) => acc + d * (7 - i), 0);
  return sum % 10 === check;
}

const HIGH_RISK_FLAG_STATES: Record<string, string> = {
  "KP": "DPRK — comprehensively sanctioned",
  "IR": "Iran — comprehensively sanctioned",
  "SY": "Syria — comprehensively sanctioned",
  "RU": "Russia — sectoral sanctions (EU 14th package)",
  "BY": "Belarus — sectoral sanctions",
  "VE": "Venezuela — sectoral sanctions",
  "MM": "Myanmar — sectoral sanctions",
  "SS": "South Sudan — arms embargo",
  "PW": "Palau — flag of convenience, high IUU risk",
  "PA": "Panama — flag of convenience",
  "LR": "Liberia — flag of convenience",
  "MH": "Marshall Islands — flag of convenience",
  "TG": "Togo — flag of convenience, elevated risk",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface VesselCheckBody {
  imoNumber?: string;
  imoNumbers?: string[];
}

export async function POST(req: Request): Promise<NextResponse> {
  const _handlerStart = Date.now();
  try {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: VesselCheckBody;
  try {
    body = (await req.json()) as VesselCheckBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  // Batch mode
  if (Array.isArray(body.imoNumbers) && body.imoNumbers.length > 0) {
    if (body.imoNumbers.length > 50) {
      return NextResponse.json({ ok: false, error: "batch limit is 50 IMO numbers" }, { status: 400, headers: CORS });
    }
    // Audit C-02: probe LSEG vessel index for every IMO first. Each IMO
    // that resolves locally bypasses the external provider entirely; only
    // the leftover ones fall through to screenVessels(). When LSEG covers
    // every requested IMO the external call is skipped completely.
    const lsegHits = await Promise.all(
      body.imoNumbers.map((imo) => lookupLsegVesselByImo(imo.trim()).catch(() => null)),
    );
    const remainder: string[] = [];
    const lsegResults: Array<{ imoNumber: string; vessel: { vesselName: string; flag?: string; sanctionsLists: string[] }; sanctioned: boolean; source: "lseg-cfs" }> = [];
    body.imoNumbers.forEach((imo, idx) => {
      const hit = lsegHits[idx];
      if (hit) {
        lsegResults.push({
          imoNumber: imo.trim(),
          vessel: { vesselName: hit.primaryName, ...(hit.flag ? { flag: hit.flag } : {}), sanctionsLists: hit.sanctionsLists },
          sanctioned: hit.sanctionsLists.length > 0,
          source: "lseg-cfs",
        });
      } else {
        remainder.push(imo);
      }
    });
    if (remainder.length === 0) {
      return NextResponse.json(
        { ok: true, total: lsegResults.length, sources: { lseg: lsegResults.length, external: 0 }, results: lsegResults },
        { status: 200, headers: { ...CORS, ...gateHeaders } },
      );
    }
    let result: Awaited<ReturnType<typeof screenVessels>>;
    try {
      result = await withRetry("vessel-check", () => screenVessels(remainder));
    } catch (err) {
      console.error("[vessel-check] screenVessels failed", err);
      return NextResponse.json(
        {
          ok: lsegResults.length > 0,
          partial: true,
          sources: { lseg: lsegResults.length, external: 0 },
          lsegResults,
          error: "External vessel screening unavailable — LSEG-only coverage returned. Do not treat absence of external results as a clean screen.",
        },
        { status: lsegResults.length > 0 ? 200 : 503, headers: { ...CORS, ...gateHeaders } },
      );
    }
    return NextResponse.json(
      { ok: true, sources: { lseg: lsegResults.length, external: result.total }, lsegResults, ...result },
      { status: 200, headers: { ...CORS, ...gateHeaders } },
    );
  }

  // Single mode
  if (!body.imoNumber?.trim()) {
    return NextResponse.json({ ok: false, error: "imoNumber or imoNumbers is required" }, { status: 400, headers: CORS });
  }

  const imoTrimmed = body.imoNumber.trim();
  if (!/^\d{7}$/.test(imoTrimmed)) {
    return NextResponse.json({ ok: false, error: "imoNumber must be exactly 7 digits (IMO format)" }, { status: 400, headers: CORS });
  }

  // Audit C-02 (closeout): consult the LSEG CFS vessel index FIRST. If
  // /api/admin/import-cfs has been run and LSEG carries this vessel, we
  // return its sanctions/regime attribution without touching any external
  // provider. Equasis ToS forbid programmatic access; commercial provider
  // (Datalastic, Lloyd's) is optional.
  const lsegHit = await lookupLsegVesselByImo(imoTrimmed).catch(() => null);
  if (lsegHit) {
    const sanctioned = lsegHit.sanctionsLists.length > 0;
    const flagRiskHigh = lsegHit.flag ? HIGH_RISK_FLAG_STATES[lsegHit.flag] : undefined;
    const riskLevel: "blocked" | "high" | "elevated" | "clean" =
      lsegHit.sanctionsLists.some((s) => s.includes("ofac") || s.includes("un_consolidated")) ? "blocked"
        : sanctioned ? "high"
        : flagRiskHigh ? "elevated"
        : "clean";
    const latencyMs = Date.now() - _handlerStart;
    return NextResponse.json(
      {
        ok: true,
        source: "lseg-cfs",
        imoNumber: imoTrimmed,
        vessel: {
          imoNumber: imoTrimmed,
          vesselName: lsegHit.primaryName,
          aliases: lsegHit.aliases,
          ...(lsegHit.flag ? { flag: lsegHit.flag } : {}),
          ...(lsegHit.vesselType ? { type: lsegHit.vesselType } : {}),
          ...(lsegHit.mmsi ? { mmsi: lsegHit.mmsi } : {}),
          ...(lsegHit.callSign ? { callSign: lsegHit.callSign } : {}),
          owners: [],
          sanctionHits: lsegHit.sanctionsLists.map((listId) => ({
            list: listId.replace(/^lseg_/, "").toUpperCase().replace(/_/g, " "),
            entryId: lsegHit.imoNumber,
          })),
          lastUpdated: lsegHit.lastUpdated,
        },
        sanctioned,
        riskLevel,
        riskDetail: sanctioned
          ? `${lsegHit.sanctionsLists.length} LSEG sanctions regime(s): ${lsegHit.sanctionsLists.join(", ")}`
          : `No LSEG sanctions hits for IMO ${imoTrimmed} (${lsegHit.primaryName}); flag state ${lsegHit.flag ?? "unknown"}${flagRiskHigh ? ` — ${flagRiskHigh}` : ""}`,
        latencyMs,
      },
      { status: 200, headers: { ...CORS, ...gateHeaders } },
    );
  }

  let result: Awaited<ReturnType<typeof checkVessel>>;
  try {
    result = await withRetry("vessel-check", () => checkVessel(imoTrimmed));
  } catch (err) {
    console.error("[vessel-check] checkVessel failed", err);
    // Offline fallback: validate IMO check digit and assess flag-state risk
    const imoValid = validateImo(imoTrimmed);
    // Extract flag state from first two digits (simplified heuristic — real flag state
    // requires the vessel registry lookup). Return structured offline response.
    return NextResponse.json(
      {
        ok: true,
        offline: true,
        imoNumber: imoTrimmed,
        imoValid,
        flagStateRisk: null,
        warning: "Vessel screening service unavailable — this is an offline placeholder. IMO check digit validation only. Do not treat absence of sanctions results as a clean screen.",
        simulationWarning: "Vessel intelligence service offline — no real ownership, sanctions, or flag-state data has been retrieved. Do not use for compliance decisions.",
      },
      { status: 200, headers: { ...CORS, ...gateHeaders } },
    );
  }

  if (!result.ok && result.error?.includes("not configured")) {
    // Audit C-02: prior response was a flat error string that read-only MCP
    // wrappers pass through without governance. Surface an explicit
    // degradedService + humanReviewRequired block so dashboards, audit
    // trails, and MLRO operators see this as a critical deficit rather
    // than a silent "no hits" outcome.
    return NextResponse.json(
      {
        ok: false,
        tool: "vessel_check",
        errorCode: "UPSTREAM_UNAVAILABLE",
        errorType: "upstream",
        message: "Vessel screening service is not configured on the server. Do not treat absence of results as a clean screen. Configure a vessel-intelligence provider (Equasis, World Fleet Register, or equivalent) before relying on vessel screening for compliance decisions.",
        _governance: {
          humanReviewRequired: true,
          degradedServices: ["vessel_screening"],
          reviewNote: "FDL No.10/2025 Art.15: AI-generated screening results are invalid when an upstream data source is offline.",
        },
      },
      { status: 503, headers: { ...CORS, ...gateHeaders } },
    );
  }

  const latencyMs = Date.now() - _handlerStart;
  if (latencyMs > 5000) console.warn(`[vessel-check] latencyMs=${latencyMs} exceeds 5000ms`);
  return NextResponse.json({ ...result, latencyMs }, { status: 200, headers: { ...CORS, ...gateHeaders } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      errorCode: "HANDLER_EXCEPTION",
      errorType: "internal",
      tool: "vessel_check",
      message,
      retryAfterSeconds: null,
      requestId: Math.random().toString(36).slice(2, 10),
      latencyMs: Date.now() - _handlerStart,
    }, { status: 500, headers: CORS });
  }
}
