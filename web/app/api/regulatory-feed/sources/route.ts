// Source-registry & manual-check scaffolding.
//
// GET  /api/regulatory-feed/sources          → list every source the brain
//                                              watches with the most recent
//                                              in-process check status.
// POST /api/regulatory-feed/sources { id }   → record a manual deep check
//                                              against the registered source.
//                                              Production deploys are expected
//                                              to call a source-specific parser
//                                              and propose brain updates here;
//                                              this scaffolding records the
//                                              trigger and returns "no parser
//                                              configured" so the workflow can
//                                              be wired without hiding the gap.
//
// Persistence: in-memory only (Lambda warm cache). For durable history wire
// to Netlify Blobs or an equivalent before shipping. We intentionally do NOT
// fake durable persistence so the gap is visible to operators.
//
// This is distinct from /api/regulatory-feed (the live news aggregator).
// That endpoint surfaces public news; this one tracks the canonical sources
// whose changes should update the brain (doctrines, FATF Recs, red flags).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { REGULATORY_SOURCES, getSource } from "@/lib/regulatorySources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export type CheckStatus =
  | "no_parser"
  | "no_change"
  | "candidate_pending_review"
  | "ingested"
  | "error";

export interface CheckEvent {
  id: string;
  sourceId: string;
  sourceName: string;
  status: CheckStatus;
  triggeredAt: string;
  triggeredBy: string;
  detail?: string;
  candidate?: {
    title: string;
    publishedAt?: string;
    summary: string;
    proposedDelta: string;
  };
}

const recentChecks: CheckEvent[] = [];
const MAX_RECENT = 50;

function record(ev: CheckEvent): void {
  recentChecks.unshift(ev);
  if (recentChecks.length > MAX_RECENT) recentChecks.length = MAX_RECENT;
}

interface PostBody {
  sourceId?: string;
  triggeredBy?: string;
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  return NextResponse.json(
    {
      ok: true,
      sources: REGULATORY_SOURCES,
      recentChecks,
      generatedAt: new Date().toISOString(),
    },
    { status: 200, headers: CORS },
  );
}

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;

  let body: PostBody = {};
  try { body = (await req.json()) as PostBody; } catch { /* allow empty body */ }

  if (!body.sourceId) {
    return NextResponse.json(
      { ok: false, error: "sourceId is required" },
      { status: 400, headers: CORS },
    );
  }
  const source = getSource(body.sourceId);
  if (!source) {
    return NextResponse.json(
      { ok: false, error: `unknown sourceId: ${body.sourceId}` },
      { status: 404, headers: CORS },
    );
  }

  const ev: CheckEvent = {
    id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceId: source.id,
    sourceName: source.name,
    status: "no_parser",
    triggeredAt: new Date().toISOString(),
    triggeredBy: body.triggeredBy ?? "manual",
    detail:
      `No parser configured for ${source.kind} sources from ${source.authority}. ` +
      `Wire a parser at server/feeds/${source.id}.ts to enable automatic ingestion.`,
  };
  record(ev);

  return NextResponse.json(
    { ok: true, event: ev, recentChecks },
    { status: 200, headers: CORS },
  );
}
