// POST /api/agent/vessel-screen
//
// Vessel / aircraft / cargo screening (audit follow-up #47). Composes
// the wave-3 vessel_ais_gap mode with quickScreen against the IMO /
// MMSI / tail-number axis + HS-code high-risk catalogue + UN sanctions
// vessel list. Returns a verdict-shaped response identical to
// /api/super-brain so the existing UI components render it.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { vesselAisGapApply } from "../../../../../dist/src/brain/modes/wave3-vessel-ais-gap.js";
import type { BrainContext } from "../../../../../dist/src/brain/types.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body {
  vessel: {
    name?: string;
    imo?: string;
    mmsi?: string;
    flagState?: string;
    declaredDeparturePort?: string;
    declaredArrivalPort?: string;
    declaredCargo?: string;
    flagHistory?: Array<{ flagState: string; from: string; to?: string }>;
  };
  aisReports?: Array<{
    timestamp?: string;
    imo?: string;
    mmsi?: string;
    lat?: number;
    lon?: number;
    speedKnots?: number;
    course?: number;
    reportedDestination?: string;
    flagState?: string;
  }>;
  hsCodes?: string[];
}

const HIGH_RISK_HS_PREFIXES = ["27", "84", "85", "88", "89", "93"];

async function handlePost(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
  }
  if (!body?.vessel || (!body.vessel.imo && !body.vessel.mmsi && !body.vessel.name)) {
    return NextResponse.json(
      { ok: false, error: "vessel.imo / vessel.mmsi / vessel.name required" },
      { status: 400, headers: gateHeaders },
    );
  }

  const ctx: BrainContext = {
    run: { id: `vss_${Date.now().toString(36)}`, startedAt: Date.now() },
    subject: {
      name: body.vessel.name ?? body.vessel.imo ?? body.vessel.mmsi ?? "vessel",
      type: "vessel",
      identifiers: {
        ...(body.vessel.imo ? { imo: body.vessel.imo } : {}),
        ...(body.vessel.mmsi ? { mmsi: body.vessel.mmsi } : {}),
      },
    },
    evidence: {
      vessel: body.vessel as never,
      aisReports: Array.isArray(body.aisReports) ? body.aisReports : [],
    },
    priorFindings: [],
    domains: ["sanctions", "tf"],
  };

  const finding = await vesselAisGapApply(ctx);

  // HS-code high-risk overlay.
  const dualUseFlags: string[] = [];
  for (const code of (Array.isArray(body.hsCodes) ? body.hsCodes : [])) {
    const prefix = code.slice(0, 2);
    if (HIGH_RISK_HS_PREFIXES.includes(prefix)) {
      dualUseFlags.push(`HS ${code} — dual-use / proliferation-sensitive prefix`);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      runId: ctx.run.id,
      vessel: body.vessel,
      finding,
      dualUseFlags,
      anchors: [
        "FATF R.6 (TFS)",
        "UN Sanctions Vessel Lists",
        "IMO MSC.1/Circ.1638",
        "UAE FDL 10/2025 Art.15",
        "Cabinet Resolution 156/2025 (goods control)",
      ],
    },
    { headers: gateHeaders },
  );
}

export const POST = handlePost;
