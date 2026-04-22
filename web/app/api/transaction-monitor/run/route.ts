import { NextResponse } from "next/server";
import * as brain from "../../../../../dist/src/brain/index.js";
import { getJson, listKeys } from "@/lib/server/store";
import { postWebhook } from "@/lib/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EnrolledSubject {
  id: string;
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  group?: string;
  caseId?: string;
  enrolledAt: string;
}

interface Transaction {
  id: string;
  subjectId: string;
  amount: number;        // AED
  currency?: string;
  direction?: "credit" | "debit";
  counterparty?: string;
  occurredAt: string;    // ISO
  channel?: string;      // cash | wire | card | crypto
}

interface SubjectAlertRoll {
  subjectId: string;
  subjectName: string;
  txCount: number;
  structuringAlerts: number;
  smurfingAlerts: number;
  anomalies: number;
  thresholdBreaches: number;
  top?: { rule: string; detail: string } | null;
}

// DPMS cash threshold — MoE Circular 2/2024 / Cabinet Res 134/2025.
const DPMS_CASH_THRESHOLD_AED = 55_000;
// Classic structuring window: transactions clustering below a reporting
// threshold within a rolling 48-hour window.
const STRUCTURING_WINDOW_HOURS = 48;

function pickBrainFn(name: string): ((...args: unknown[]) => unknown) | null {
  const v = (brain as Record<string, unknown>)[name];
  return typeof v === "function" ? (v as (...args: unknown[]) => unknown) : null;
}

function detectStructuring(txs: Transaction[]): number {
  // Brain `structuringDetect` is the authoritative implementation — if it
  // exists and accepts our shape, prefer it. Fall back to a conservative
  // inline rule so the cron always produces a number.
  const fn = pickBrainFn("structuringDetect");
  if (fn) {
    try {
      const result = fn(txs) as { alerts?: unknown[] } | unknown[];
      if (Array.isArray(result)) return result.length;
      if (Array.isArray(result?.alerts)) return result.alerts.length;
    } catch {
      /* fall through */
    }
  }
  // Conservative fallback: count clusters of ≥3 transactions within
  // STRUCTURING_WINDOW_HOURS each 80–99% of the DPMS threshold.
  const sorted = [...txs]
    .filter((t) => t.amount >= DPMS_CASH_THRESHOLD_AED * 0.8 && t.amount < DPMS_CASH_THRESHOLD_AED)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  let hits = 0;
  for (let i = 0; i < sorted.length; i++) {
    let cluster = 1;
    for (let j = i + 1; j < sorted.length; j++) {
      const deltaH =
        (Date.parse(sorted[j]!.occurredAt) - Date.parse(sorted[i]!.occurredAt)) /
        (1000 * 60 * 60);
      if (deltaH > STRUCTURING_WINDOW_HOURS) break;
      cluster++;
    }
    if (cluster >= 3) hits++;
  }
  return hits;
}

function detectSmurfing(txs: Transaction[], subject: EnrolledSubject): number {
  const fn = pickBrainFn("smurfingDetect");
  if (fn) {
    try {
      const result = fn(txs, subject) as { alerts?: unknown[] } | unknown[];
      if (Array.isArray(result)) return result.length;
      if (Array.isArray(result?.alerts)) return result.alerts.length;
    } catch {
      /* fall through */
    }
  }
  // Fallback: ≥5 distinct counterparties in the same 24-hour window.
  const byDay = new Map<string, Set<string>>();
  for (const t of txs) {
    const day = t.occurredAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, new Set());
    if (t.counterparty) byDay.get(day)!.add(t.counterparty);
  }
  let hits = 0;
  for (const cps of byDay.values()) if (cps.size >= 5) hits++;
  return hits;
}

function detectAnomalies(txs: Transaction[]): number {
  const fn = pickBrainFn("detectAnomalies");
  if (fn) {
    try {
      const result = fn(txs) as { alerts?: unknown[] } | unknown[];
      if (Array.isArray(result)) return result.length;
      if (Array.isArray(result?.alerts)) return result.alerts.length;
    } catch {
      /* fall through */
    }
  }
  // Fallback z-score: amounts > 3 SD above mean of last 30.
  const recent = [...txs].slice(-30).map((t) => t.amount);
  if (recent.length < 5) return 0;
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance =
    recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;
  const sd = Math.sqrt(variance);
  return txs.filter((t) => sd > 0 && (t.amount - mean) / sd > 3).length;
}

function countThresholdBreaches(txs: Transaction[]): number {
  return txs.filter(
    (t) => (t.channel ?? "").toLowerCase() === "cash" && t.amount >= DPMS_CASH_THRESHOLD_AED,
  ).length;
}

export async function POST(req: Request): Promise<NextResponse> {
  const expected = process.env["ONGOING_RUN_TOKEN"];
  if (expected) {
    const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (got !== expected) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const subjectKeys = await listKeys("ongoing/subject/");
  const subjects: EnrolledSubject[] = [];
  for (const key of subjectKeys) {
    const s = await getJson<EnrolledSubject>(key);
    if (s) subjects.push(s);
  }

  const rolls: SubjectAlertRoll[] = [];
  let totalTx = 0;
  let totalAlerts = 0;

  for (const s of subjects) {
    const txKeys = await listKeys(`tx/${s.id}/`);
    const txs: Transaction[] = [];
    for (const key of txKeys) {
      const t = await getJson<Transaction>(key);
      if (t) txs.push(t);
    }
    const structuringAlerts = detectStructuring(txs);
    const smurfingAlerts = detectSmurfing(txs, s);
    const anomalies = detectAnomalies(txs);
    const thresholdBreaches = countThresholdBreaches(txs);
    const subjectAlerts = structuringAlerts + smurfingAlerts + anomalies + thresholdBreaches;
    totalTx += txs.length;
    totalAlerts += subjectAlerts;

    const top =
      structuringAlerts > 0
        ? { rule: "structuring", detail: `${structuringAlerts} cluster(s) under AED 55k` }
        : smurfingAlerts > 0
          ? { rule: "smurfing", detail: `${smurfingAlerts} high-fan-out day(s)` }
          : thresholdBreaches > 0
            ? {
                rule: "dpms-threshold",
                detail: `${thresholdBreaches} cash transaction(s) ≥ AED 55,000`,
              }
            : anomalies > 0
              ? { rule: "anomaly", detail: `${anomalies} z-score > 3 outlier(s)` }
              : null;
    rolls.push({
      subjectId: s.id,
      subjectName: s.name,
      txCount: txs.length,
      structuringAlerts,
      smurfingAlerts,
      anomalies,
      thresholdBreaches,
      ...(top !== null ? { top } : {}),
    });
  }

  const runAt = new Date().toISOString();
  const asanaTask = await postDailyTMReport({
    runAt,
    subjects: subjects.length,
    totalTx,
    totalAlerts,
    rolls: rolls.filter((r) => r.txCount > 0 || r.top),
    originUrl: req.url,
  });

  const webhook = await postWebhook({
    type: "ongoing.rerun",
    subjectId: "TM-DAILY",
    subjectName: `Transaction monitor · ${subjects.length} subjects`,
    severity: totalAlerts > 0 ? "high" : "clear",
    topScore: totalAlerts,
    newHits: [],
    ...(asanaTask.url ? { asanaTaskUrl: asanaTask.url } : {}),
    generatedAt: runAt,
    source: "hawkeye-sterling",
  });

  return NextResponse.json({
    ok: true,
    runAt,
    subjectsMonitored: subjects.length,
    transactionsProcessed: totalTx,
    totalAlerts,
    asanaTask,
    webhook,
    rolls,
  });
}

async function postDailyTMReport(args: {
  runAt: string;
  subjects: number;
  totalTx: number;
  totalAlerts: number;
  rolls: SubjectAlertRoll[];
  originUrl: string;
}): Promise<{ delivered: boolean; url?: string; error?: string }> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return { delivered: false, error: "ASANA_TOKEN not set" };
  }

  // TM reports route to the "08 · Transaction Monitoring" board, not the
  // screening inbox. Override via ASANA_TM_PROJECT_GID if the board moves.
  const projectGid =
    process.env["ASANA_TM_PROJECT_GID"] ?? "1214148661083263";
  const workspaceGid =
    process.env["ASANA_WORKSPACE_GID"] ?? "1213645083721316";

  const date = new Date(args.runAt);
  const ymd = date.toISOString().slice(0, 10);
  const severity =
    args.totalAlerts === 0
      ? "CLEAR"
      : args.totalAlerts > 10
        ? "HIGH"
        : args.totalAlerts > 3
          ? "MEDIUM"
          : "LOW";
  const title = `[TM-DAILY] ${severity} · ${ymd} · ${args.subjects} subjects · ${args.totalAlerts} alerts · ${args.totalTx} tx`;

  const lines: string[] = [];
  lines.push(`Transaction monitoring — daily report`);
  lines.push(`Run at: ${args.runAt}`);
  lines.push(`Subjects monitored: ${args.subjects}`);
  lines.push(`Transactions processed: ${args.totalTx}`);
  lines.push(`Total alerts: ${args.totalAlerts}`);
  lines.push("");
  if (args.rolls.length === 0) {
    lines.push("No subject activity recorded in the last run window.");
  } else {
    lines.push("── Per-subject roll-up ──");
    for (const r of args.rolls) {
      lines.push(
        `• ${r.subjectName} (${r.subjectId}) · ${r.txCount} tx · structuring:${r.structuringAlerts} · smurfing:${r.smurfingAlerts} · anomalies:${r.anomalies} · DPMS-threshold:${r.thresholdBreaches}`,
      );
      if (r.top) lines.push(`    TOP: ${r.top.rule} — ${r.top.detail}`);
    }
  }
  lines.push("");
  lines.push(
    "Rules applied: FATF Rec. 20 · Cabinet Res 134/2025 · MoE Circular 2/2024 (DPMS)",
  );
  lines.push("Source: Hawkeye Sterling transaction-monitor/run");

  try {
    const res = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          name: title,
          notes: lines.join("\n"),
          projects: [projectGid],
          workspace: workspaceGid,
        },
      }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { data?: { permalink_url?: string } }
      | null;
    return {
      delivered: res.ok,
      ...(payload?.data?.permalink_url ? { url: payload.data.permalink_url } : {}),
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    return {
      delivered: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
