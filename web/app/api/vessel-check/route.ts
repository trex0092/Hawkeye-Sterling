// POST /api/vessel-check
// IMO number vessel sanctions screening via vessel-check-api.
// Returns ownership chain, flag state, and any sanction list hits.
//
// Body: { imoNumber: string }  — or batch: { imoNumbers: string[] }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { checkVessel, screenVessels } from "../../../../dist/src/integrations/vesselCheck.js";
import { withRetry } from "@/lib/server/circuitBreaker";

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
    let result: Awaited<ReturnType<typeof screenVessels>>;
    try {
      result = await withRetry("vessel-check", () => screenVessels(body.imoNumbers!));
    } catch (err) {
      console.error("[vessel-check] screenVessels failed", err);
      return NextResponse.json(
        { ok: false, error: "Vessel screening service unavailable — please retry. Do not treat absence of results as a clean screen." },
        { status: 503, headers: { ...CORS, ...gateHeaders } },
      );
    }
    return NextResponse.json({ ok: true, ...result }, { status: 200, headers: { ...CORS, ...gateHeaders } });
  }

  // Single mode
  if (!body.imoNumber?.trim()) {
    return NextResponse.json({ ok: false, error: "imoNumber or imoNumbers is required" }, { status: 400, headers: CORS });
  }

  const imoTrimmed = body.imoNumber.trim();
  if (!/^\d{7}$/.test(imoTrimmed)) {
    return NextResponse.json({ ok: false, error: "imoNumber must be exactly 7 digits (IMO format)" }, { status: 400, headers: CORS });
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
    return NextResponse.json(
      { ok: false, error: "Vessel screening service is not configured on the server. Do not treat absence of results as a clean screen." },
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
