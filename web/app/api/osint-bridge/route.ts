import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  harvesterScan,
  sherlockSearch,
  socialAnalyzerSearch,
} from "../../../../dist/src/integrations/osintBridge.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Supported OSINT modes:
//   domain   — theHarvester domain intelligence (emails, hosts, IPs)
//   username — Sherlock + Social-Analyzer profile search
interface Body {
  mode: "domain" | "username";
  target: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body?.target?.trim()) {
    return NextResponse.json({ ok: false, error: "target is required" }, { status: 400, headers: CORS });
  }
  if (body.mode !== "domain" && body.mode !== "username") {
    return NextResponse.json({ ok: false, error: "mode must be 'domain' or 'username'" }, { status: 400, headers: CORS });
  }

  const target = body.target.trim();

  try {
    if (body.mode === "domain") {
      const result = await harvesterScan(target, {});
      return NextResponse.json({ ok: true, mode: "domain", target, result }, { headers: { ...CORS, ...gateHeaders } });
    }

    const [sherlock, social] = await Promise.allSettled([
      sherlockSearch(target, {}),
      socialAnalyzerSearch(target, {}),
    ]);

    return NextResponse.json({
      ok: true,
      mode: "username",
      target,
      sherlock: sherlock.status === "fulfilled" ? sherlock.value : null,
      social: social.status === "fulfilled" ? social.value : null,
      scannedAt: new Date().toISOString(),
    }, { headers: { ...CORS, ...gateHeaders } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("not configured") || msg.toLowerCase().includes("econnrefused")) {
      return NextResponse.json(
        { ok: false, error: "OSINT bridge not configured", detail: "Ensure theHarvester/Sherlock containers are running." },
        { status: 503, headers: CORS },
      );
    }
    return NextResponse.json({ ok: false, error: "OSINT scan failed", detail: msg }, { status: 502, headers: CORS });
  }
}
