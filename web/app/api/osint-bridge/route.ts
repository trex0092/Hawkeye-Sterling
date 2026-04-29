// POST /api/osint-bridge
// Unified gateway to the OSINT Bridge Python microservice.
// Accepts { tool: string, ...params } and delegates to the appropriate
// osintBridge function.  All calls are fail-soft — tool errors surface as
// HTTP 503 rather than 500, so the client can distinguish tool failures
// from application bugs.
//
// Body: { tool: "sherlock" | "maigret" | "harvester" | "social-analyzer" | "anomaly" | "amlsim", ...params }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  sherlockSearch,
  maigretProfile,
  harvesterScan,
  socialAnalyzerSearch,
  detectAnomalies,
  amlSimPatterns,
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

interface SherlockBody { tool: "sherlock"; username: string }
interface MaigretBody { tool: "maigret"; username: string; sites?: number }
interface HarvesterBody { tool: "harvester"; domain: string; sources?: string[] }
interface SocialAnalyzerBody { tool: "social-analyzer"; person: string; platforms?: string[] }
interface AnomalyBody { tool: "anomaly"; features: number[][]; labels?: string[]; algorithm?: string }
interface AmlSimBody { tool: "amlsim"; pattern: string; n_accounts?: number; n_transactions?: number }

type OsintBridgeBody =
  | SherlockBody
  | MaigretBody
  | HarvesterBody
  | SocialAnalyzerBody
  | AnomalyBody
  | AmlSimBody;

const VALID_TOOLS = new Set([
  "sherlock",
  "maigret",
  "harvester",
  "social-analyzer",
  "anomaly",
  "amlsim",
]);

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: OsintBridgeBody;
  try {
    body = (await req.json()) as OsintBridgeBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400, headers: CORS },
    );
  }

  if (!body.tool || !VALID_TOOLS.has(body.tool)) {
    return NextResponse.json(
      {
        ok: false,
        error: `tool must be one of: ${[...VALID_TOOLS].join(", ")}`,
      },
      { status: 422, headers: CORS },
    );
  }

  let result: unknown;
  const tool = body.tool;

  if (tool === "sherlock") {
    const b = body as SherlockBody;
    if (!b.username?.trim()) {
      return NextResponse.json(
        { ok: false, error: "username is required for sherlock" },
        { status: 422, headers: CORS },
      );
    }
    result = await sherlockSearch(b.username).catch((err: unknown) => ({
      ok: false,
      username: b.username,
      profiles: [],
      totalFound: 0,
      error: String(err),
    }));
  } else if (tool === "maigret") {
    const b = body as MaigretBody;
    if (!b.username?.trim()) {
      return NextResponse.json(
        { ok: false, error: "username is required for maigret" },
        { status: 422, headers: CORS },
      );
    }
    result = await maigretProfile(b.username, {}, b.sites).catch((err: unknown) => ({
      ok: false,
      username: b.username,
      profiles: [],
      totalFound: 0,
      error: String(err),
    }));
  } else if (tool === "harvester") {
    const b = body as HarvesterBody;
    if (!b.domain?.trim()) {
      return NextResponse.json(
        { ok: false, error: "domain is required for harvester" },
        { status: 422, headers: CORS },
      );
    }
    result = await harvesterScan(b.domain, {}, b.sources).catch((err: unknown) => ({
      ok: false,
      domain: b.domain,
      emails: [],
      hosts: [],
      ips: [],
      error: String(err),
    }));
  } else if (tool === "social-analyzer") {
    const b = body as SocialAnalyzerBody;
    if (!b.person?.trim()) {
      return NextResponse.json(
        { ok: false, error: "person is required for social-analyzer" },
        { status: 422, headers: CORS },
      );
    }
    result = await socialAnalyzerSearch(b.person, {}, b.platforms).catch((err: unknown) => ({
      ok: false,
      person: b.person,
      profiles: [],
      error: String(err),
    }));
  } else if (tool === "anomaly") {
    const b = body as AnomalyBody;
    if (!Array.isArray(b.features) || b.features.length === 0) {
      return NextResponse.json(
        { ok: false, error: "features (non-empty 2D array) is required for anomaly" },
        { status: 422, headers: CORS },
      );
    }
    result = await detectAnomalies(b.features, b.algorithm ?? "IsolationForest").catch(
      (err: unknown) => ({
        ok: false,
        algorithm: b.algorithm ?? "IsolationForest",
        scores: [],
        outliers: [],
        error: String(err),
      }),
    );
  } else {
    // tool === "amlsim"
    const b = body as AmlSimBody;
    if (!b.pattern?.trim()) {
      return NextResponse.json(
        { ok: false, error: "pattern is required for amlsim" },
        { status: 422, headers: CORS },
      );
    }
    result = await amlSimPatterns(
      b.pattern,
      b.n_accounts ?? 5,
      b.n_transactions ?? 20,
    ).catch((err: unknown) => ({
      ok: false,
      pattern: b.pattern,
      accounts: [],
      transactions: [],
      error: String(err),
    }));
  }

  const res = result as { ok?: boolean };
  return NextResponse.json(result, {
    status: res.ok ? 200 : 503,
    headers: { ...CORS, ...gateHeaders },
  });
}
