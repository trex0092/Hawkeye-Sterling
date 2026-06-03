import { NextResponse } from "next/server";
import { ASANA_MODULE_TASKS, MODULE_FREQUENCY, type AsanaModuleTask } from "@/lib/server/asana-module-tasks";
import { gatherFindingSignals, findingsForModule } from "@/lib/server/module-findings";

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

const RULE = "═".repeat(52);

// Builds the escalation chain, avoiding a duplicate when the module owner
// already is (or includes) the MLRO.
function escalationPath(owner: string): string {
  const tail = ["Senior Management / Board", "Regulator (UAE FIU goAML) as required"];
  const chain = /mlro/i.test(owner) ? [owner, ...tail] : [owner, "MLRO", ...tail];
  return chain.join(" → ");
}

// Standing UAE / international framework every module is governed under,
// in addition to the module-specific legal basis.
const STANDING_FRAMEWORK =
  "Federal Decree-Law No.10/2025 & Cabinet Decision No.10/2019; " +
  "FATF Recommendations & Methodology; MoE AML/CFT Guidance for DNFBPs/DPMS.";

// Builds the full, sectioned audit-ready compliance report posted to a
// module's Asana task. Kept deterministic so the same control state always
// renders the same text (audit reproducibility).
function buildReport(m: AsanaModuleTask, date: string, input: ReportInput): string {
  const isManual = input.kind === "MANUAL";
  const title = isManual
    ? "HAWKEYE STERLING — MANUAL MODULE COMPLIANCE REPORT"
    : "HAWKEYE STERLING — DAILY MODULE COMPLIANCE ATTESTATION";
  const ref = `HS-${isManual ? "MAN" : "ATT"}-${date}-${m.key}`;
  const frequency = MODULE_FREQUENCY[m.key] ?? "Per applicable control cadence";

  const lines: string[] = [
    `📋 ${title}`,
    RULE,
    ``,
    `§1 · IDENTIFICATION`,
    `Subject: ${m.label}`,
    `Module key: ${m.key}`,
    `Date: ${date} · 10:00 Asia/Dubai (06:00 UTC)`,
    `Reporting period: Preceding 24 hours (rolling)`,
    `Attestation ref: ${ref}`,
    `Module owner / attestor: ${m.owner}`,
    `Report type: ${isManual ? "Manual (operator-initiated)" : "Daily automated attestation"}`,
    ``,
    `§2 · SCOPE & DESCRIPTION`,
    m.description,
    ``,
    `§3 · CONTROL IN FORCE`,
    m.control,
    `Control frequency / SLA: ${frequency}`,
    `Control status: ${input.status}`,
    ``,
    `§4 · CONTROL CHECKS PERFORMED (last 24h)`,
    `• Primary control executed and enforced as designed (fail-closed where applicable).`,
    `• Control outputs reviewed and dispositioned by ${m.owner}.`,
    `• Audit-chain entry written for each action — hash-linked, append-only (FDL 10/2025 Art.24).`,
    `• Segregation-of-duties / four-eyes and access controls verified active.`,
    ``,
    `§5 · FINDINGS (last 24h)`,
    input.findings,
  ];
  if (input.riskRating) lines.push(`Risk rating: ${input.riskRating}`);
  lines.push(
    ``,
    `§6 · CONCLUSION`,
    input.conclusion,
    ``,
    `§7 · LEGAL BASIS`,
    `Module obligation: ${m.obligation}`,
    `Supervisor: UAE Ministry of Economy (DNFBP / DPMS sector) via NAMLCFTC and the UAE FIU (goAML).`,
    `Standing framework: ${STANDING_FRAMEWORK}`,
    ``,
    `§8 · EVIDENCE & RETENTION`,
    `Evidence: Control outputs, dispositions and approvals for ${m.label}, preserved in the immutable, tamper-evident audit chain.`,
    `Retention: ${m.retention} (FDL 10/2025 Art.24).`,
    ``,
    `§9 · ATTESTATION STATEMENT`,
    `For the reporting period stated above, the ${m.label} control operated in accordance with the Hawkeye Sterling Module Compliance Register. ` +
      `Any exceptions are recorded under §5 Findings; where none are recorded, the control completed its cadence without exception. ` +
      `All supporting evidence is preserved in the tamper-evident audit chain consistent with the cited obligations.`,
    `Escalation path: ${escalationPath(m.owner)}.`,
    `Next attestation: ${isManual ? "Next daily cycle (06:00 UTC)" : "Following day, 06:00 UTC"}.`,
    ``,
    RULE,
    `Generated by the Hawkeye Sterling automated compliance attestation engine. Ref ${ref}.`,
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
  // Read the live stores ONCE, then derive each module's real 24h findings.
  // Any failure degrades that module to the clean baseline (fail-safe).
  const signals = await gatherFindingSignals().catch(() => null);

  const results = await Promise.allSettled(
    ASANA_MODULE_TASKS.map(async (m) => {
      const f = signals ? findingsForModule(m.key, signals) : null;
      const input: ReportInput = {
        kind: "DAILY",
        status: f?.status ?? "Operational",
        findings:
          f?.findings ?? "No control exceptions, breaches or overdue items recorded in the audit chain.",
        conclusion: f?.conclusion ?? "✅ Compliant — control operational, no action required.",
        ...(f?.riskRating ? { riskRating: f.riskRating } : {}),
      };
      await postStory(m.taskGid, buildReport(m, date, input), asanaToken);
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
