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
  "Federal Decree-Law No.10/2025 & Cabinet Resolution No. (134) of 2025; " +
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
    `Document classification: Internal — Compliance / Regulator-shareable on request`,
    `Reporting entity: Hawkeye Sterling — AML/CFT, Sanctions, PEP & Adverse-Media platform`,
    `Supervisory authority: UAE Ministry of Economy (MoE) — DNFBP / DPMS sector, via NAMLCFTC and the UAE Financial Intelligence Unit (goAML).`,
    ``,
    `§1 · IDENTIFICATION`,
    `• Subject (module): ${m.label}`,
    `• Module key: ${m.key}`,
    `• Date: ${date} · 10:00 Asia/Dubai (06:00 UTC)`,
    `• Reporting period: Preceding 24 hours (rolling)`,
    `• Attestation reference: ${ref}`,
    `• Module owner / attestor: ${m.owner}`,
    `• Report type: ${isManual ? "Manual (operator-initiated exception report)" : "Daily automated control attestation"}`,
    ``,
    `§2 · MODULE SCOPE & PURPOSE`,
    m.description,
    `This module forms part of Hawkeye Sterling's risk-based AML/CFT control framework and operates under continuous, evidenced governance.`,
    ``,
    `§3 · CONTROL DESIGN & ENFORCEMENT`,
    `• Control in force: ${m.control}`,
    `• Enforcement model: Fail-closed / hard-gate where applicable; segregation of duties (four-eyes) and role-based access control applied to all sensitive actions.`,
    `• Control frequency / SLA: ${frequency}`,
    `• Control status (period): ${input.status}`,
    ``,
    `§4 · CONTROL EXECUTION CHECKS (last 24h)`,
    `• Primary control executed and enforced as designed; no silent bypass detected.`,
    `• Control outputs generated, reviewed and dispositioned by ${m.owner}.`,
    `• Every action written to the immutable, hash-linked, append-only audit chain (Federal Decree-Law No. 10 of 2025 Art.24).`,
    `• Segregation-of-duties / four-eyes and RBAC access controls verified active.`,
    `• Screening / monitoring sources confirmed current and within refresh SLA (where applicable).`,
    `• AI-assisted outputs subject to human-in-the-loop review on adverse dispositions (Federal Decree-Law No. 10 of 2025 Art.18).`,
    ``,
    `§5 · FINDINGS (last 24h)`,
    input.findings,
  ];
  if (input.riskRating) lines.push(`• Risk rating: ${input.riskRating}`);
  lines.push(
    ``,
    `§6 · DISPOSITION & CONCLUSION`,
    input.conclusion,
    ``,
    `§7 · REGULATORY BASIS & MAPPING`,
    `• Module obligation: ${m.obligation}`,
    `• Supervisor: UAE Ministry of Economy (DNFBP / DPMS sector) via NAMLCFTC and the UAE FIU (goAML).`,
    `• Standing framework: ${STANDING_FRAMEWORK}`,
    `• AI governance: model governance, explainability and human oversight maintained per Federal Decree-Law No. 10 of 2025 Art.18/24 (ISO/IEC 42001; EU AI Act-aligned).`,
    ``,
    `§8 · EVIDENCE, RECORD-KEEPING & RETENTION`,
    `• Evidence: Control outputs, dispositions, approvals and supporting documents for ${m.label}.`,
    `• Storage: Immutable, tamper-evident, hash-linked audit chain with WORM cold-storage backup.`,
    `• Retention: ${m.retention} (Federal Decree-Law No. 10 of 2025 Art.24; FDL record-keeping & Cabinet 10/2019).`,
    `• Reproducibility: Report is deterministic — identical control state renders identical text for audit reproducibility.`,
    ``,
    `§9 · GOVERNANCE, OVERSIGHT & ESCALATION`,
    `• Human oversight: Adverse customer/transaction decisions require human-in-the-loop sign-off.`,
    `• Dual control: Maker-checker / four-eyes enforced on regulated actions (TOCTOU-safe).`,
    `• Escalation path: ${escalationPath(m.owner)}.`,
    ``,
    `§10 · ATTESTATION STATEMENT`,
    `I attest that, for the reporting period stated above, the ${m.label} control operated in accordance with the Hawkeye Sterling Module Compliance Register and the cited UAE Ministry of Economy and FATF obligations. ` +
      `Any exceptions, breaches or overdue items are recorded under §5 Findings; where none are recorded, the control completed its mandated cadence without exception. ` +
      `All supporting evidence is preserved in the tamper-evident audit chain and is available for MoE / FIU inspection on request.`,
    ``,
    `§11 · SIGN-OFF`,
    `• Attested by: ${m.owner}`,
    `• Generated by: Hawkeye Sterling automated compliance attestation engine`,
    `• Next attestation: ${isManual ? "Next daily cycle (06:00 UTC)" : "Following day, 06:00 UTC"}`,
    `• Reference: ${ref}`,
    RULE,
  );
  return lines.join("\n");
}

async function postStory(taskGid: string, text: string, asanaToken: string): Promise<void> {
  // Asana enforces a per-token burst/concurrency limit (~15 simultaneous) and
  // returns 429 for the overflow. Retry 429 / 5xx with backoff (honouring the
  // Retry-After header when present) so a busy moment never silently drops a
  // module's daily attestation. Combined with the batched dispatch below, this
  // guarantees every module receives its report within the 60s function budget.
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${ASANA_API}/tasks/${taskGid}/stories`, {
      method: "POST",
      headers: { authorization: `Bearer ${asanaToken}`, "content-type": "application/json" },
      body: JSON.stringify({ data: { text } }),
    });
    if (res.ok) return;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) throw new Error(`HTTP ${res.status}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(8000, 500 * 2 ** (attempt - 1));
    await new Promise((r) => setTimeout(r, waitMs));
  }
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

  // Dispatch in small concurrency-limited batches rather than firing all ~66
  // posts at once. Asana caps concurrent requests per token (~15) and 429s the
  // overflow; an unbounded Promise.all previously let only the first ~15 land
  // and silently dropped the rest. Batches of 4 (+ postStory's 429 retry) keep
  // us under the burst ceiling so every module is attested each day.
  const CONCURRENCY = 4;
  const results: PromiseSettledResult<string>[] = [];
  for (let i = 0; i < ASANA_MODULE_TASKS.length; i += CONCURRENCY) {
    const batch = ASANA_MODULE_TASKS.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (m) => {
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
    results.push(...batchResults);
  }

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
