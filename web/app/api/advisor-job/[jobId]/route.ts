// Poll endpoint for the MLRO Advisor deep-reasoning background job.
//
// The synchronous /api/mlro-advisor route is hard-capped at ~22 s by
// Netlify's edge inactivity timeout. multi_perspective mode runs three
// stages (executor → advisor → challenger) and routinely exceeds that
// ceiling, surfacing as "Advisor error: HTTP 502" in the UI. The deep
// pipeline is therefore offloaded to the Netlify Background Function at
// /.netlify/functions/mlro-advisor-deep-background, which writes its
// progress + final result to Netlify Blobs under `advisor-jobs/<jobId>`.
// This route is the read side of that contract.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const KEY_PREFIX = "advisor-jobs";
const JOB_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const { jobId: rawJobId } = await params;
  const jobId = rawJobId?.trim() ?? "";
  if (!JOB_ID_RE.test(jobId)) {
    return NextResponse.json(
      { ok: false, error: "invalid jobId" },
      { status: 400 },
    );
  }

  const store = getStore();
  let raw: string | null;
  try {
    raw = await store.get(`${KEY_PREFIX}/${jobId}`);
  } catch {
    return NextResponse.json(
      { ok: true, status: "pending", jobId },
      { status: 200 },
    );
  }

  if (!raw) {
    return NextResponse.json(
      { ok: false, status: "pending", error: "job not found yet — keep polling" },
      { status: 404 },
    );
  }

  try {
    const record = JSON.parse(raw) as {
      status: "running" | "done" | "failed";
      startedAt: string;
      finishedAt?: string;
      question: string;
      mode: "balanced" | "multi_perspective";
      result?: unknown;
      error?: string;
    };
    return NextResponse.json({ ok: true, ...record });
  } catch {
    return NextResponse.json(
      { ok: true, status: "pending", jobId, note: "job record unreadable — keep polling" },
      { status: 200 },
    );
  }
}
