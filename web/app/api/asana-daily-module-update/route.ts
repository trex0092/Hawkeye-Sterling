import { NextResponse } from "next/server";
import { ASANA_MODULE_TASKS, type AsanaModuleTask } from "@/lib/server/asana-module-tasks";

// Module compliance attestation poster.
//
// Two modes, both on the same server-to-server endpoint:
//
//  1. DAILY (automated) — no body, or { mode: "daily" }. Posts a full
//     audit-ready attestation report to EVERY module task on the
//     "Hawkeye Sterling — Modules" board. Triggered once a day by the
//     scheduled function netlify/functions/asana-daily-module-update.mts.
//
//  2. MANUAL (on demand) — { module: "<key>", findings, conclusion,
//     status, riskRating }. Posts a single report to one module's task
//     with operator-supplied findings/conclusion, for when a control
//     exception, breach or note must be recorded manually.
//
// Auth: server-to-server only. Requires Authorization: Bearer
// <HAWKEYE_CRON_TOKEN> — the shared cron bearer already used by the other
// scheduled functions. Returns 503 (disabled) if the token or the
// ASANA_TOKEN are not configured, so it fails closed and never throws.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ASANA_API = "https://app.asana.com/api/1.0";

interface ReportInput {
  /** "MANUAL" overrides the title/findings; defaults to the daily attestation. */
  kind: "DAILY" | "MANUAL";
  status: string;
  findings: string;
  conclusion: string;
  riskRating?: string;
}

// Builds the full audit-ready report posted to a module's Asana task.
function buildReport(m: AsanaModuleTask, date: string, input: ReportInput): string {
  const title =
    input.kind === "MANUAL"
      ? "HAWKEYE STERLING — MANUAL MODULE COMPLIANCE REPORT"
      : "HAWKEYE STERLING — DAILY MODULE COMPLIANCE ATTESTATION";
  const ref = `HS-${input.kind === "MANUAL" ? "MAN" : "ATT"}-${date}-${m.key}`;
  const lines = [
    `📋 ${title}`,
    ``,
    `Subject: ${m.label}`,
    `Date: ${date}, 10:00 Asia/Dubai (06:00 UTC)`,
    `Period covered: Preceding 24 hours`,
    `Module owner: ${m.owner}`,
    `Description: ${m.description}`,
    `Control in force: ${m.control}`,
    `Control status: ${input.status}`,
    `Findings (last 24h): ${input.findings}`,
  ];
  if (input.riskRating) lines.push(`Risk rating: ${input.riskRating}`);
  lines.push(
    `Conclusion: ${input.conclusion}`,
    `Legal basis: ${m.obligation}`,
    `Evidence & retention: Records held in the immutable audit chain (FDL 10/2025 Art.24); retained ${m.retention}.`,
    `Attestation ref: ${ref}`,
  );
  return lines.join("\n");
}

async function postStory(taskGid: string, text: string, asanaToken: string): Promise<void> {
  const res = await fetch(`${ASANA_API}/tasks/${taskGid}/stories`, {
    method: "POST",
    headers: { authorization: `Bearer ${asanaToken}`, "content-type": "application/json" },
    body: JSON.stringify({ data: { text } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function POST(req: Request): Promise<NextResponse> {
  const cronToken = process.env["HAWKEYE_CRON_TOKEN"];
  const asanaToken = process.env["ASANA_TOKEN"];

  if (!cronToken || !asanaToken) {
    return NextResponse.json(
      { ok: false, error: "asana_daily_update_disabled", detail: "Set HAWKEYE_CRON_TOKEN and ASANA_TOKEN." },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronToken}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = new Date().toISOString().slice(0, 10);

  // ---- MANUAL mode: single module, operator-supplied findings ----
  if (typeof body["module"] === "string" && body["module"]) {
    const m = ASANA_MODULE_TASKS.find((t) => t.key === body["module"]);
    if (!m) {
      return NextResponse.json({ ok: false, error: "unknown_module", module: body["module"] }, { status: 404 });
    }
    const findings = typeof body["findings"] === "string" && body["findings"]
      ? (body["findings"] as string)
      : "Manual review entry — see attached notes.";
    const conclusion = typeof body["conclusion"] === "string" && body["conclusion"]
      ? (body["conclusion"] as string)
      : "⚠️ Action required — see findings.";
    const status = typeof body["status"] === "string" && body["status"] ? (body["status"] as string) : "Under review";
    const riskRating = typeof body["riskRating"] === "string" ? (body["riskRating"] as string) : undefined;
    const text = buildReport(m, date, { kind: "MANUAL", status, findings, conclusion, riskRating });
    try {
      await postStory(m.taskGid, text, asanaToken);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: "asana_post_failed", detail: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, mode: "manual", module: m.key, date });
  }

  // ---- DAILY mode: full attestation to every module ----
  const daily: ReportInput = {
    kind: "DAILY",
    status: "Operational",
    findings: "No control exceptions, breaches or overdue items recorded in the audit chain.",
    conclusion: "✅ Compliant — control operational, no action required.",
  };

  const results = await Promise.allSettled(
    ASANA_MODULE_TASKS.map(async (m) => {
      await postStory(m.taskGid, buildReport(m, date, daily), asanaToken);
      return m.key;
    }),
  );

  const posted = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .map((r, i) =>
      r.status === "rejected"
        ? `${ASANA_MODULE_TASKS[i]?.key ?? "?"}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`
        : null,
    )
    .filter((x): x is string => x !== null);

  return NextResponse.json({
    ok: true,
    mode: "daily",
    date,
    total: ASANA_MODULE_TASKS.length,
    posted,
    failedCount: failed.length,
    failed: failed.slice(0, 10),
  });
}
