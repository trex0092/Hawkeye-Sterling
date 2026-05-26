// Model drift monitor (Cybersecurity spec item 4).
//
// After every AI decision, appends the verdict + confidence to a rolling
// 30-day window. Computes weekly verdict distribution and flags if the
// "clear/approve" rate increases >20% week-on-week (could indicate the
// model is being gamed or has drifted away from conservative AML posture).
//
// Storage: hs-drift/<tenant>/window.json   (rolling 30d, max 5000 entries)
//          hs-drift/<tenant>/report.json   (latest computed report)

import { getJson, setJson } from "./store";
import { writeAuditChainEntry } from "./audit-chain";

export interface DriftEntry {
  ts:         number;    // epoch ms
  verdict:    string;    // approve|edd|escalate|str
  confidence: number;    // 0–100 or 0–1 (normalised to 0–100)
  riskScore:  number;
}

export interface DriftReport {
  generatedAt:    string;
  sampleSize:     number;
  thisWeek: {
    count:        number;
    approveRate:  number;
    eddRate:      number;
    escalateRate: number;
    strRate:      number;
    meanConfidence: number;
  };
  lastWeek: {
    count:        number;
    approveRate:  number;
    meanConfidence: number;
  } | null;
  driftDetected:  boolean;
  driftReason?:   string;
  // Composite risk score drift fields
  rollingBaselineScore: number | null;   // 30-day rolling mean risk score
  currentMeanScore:     number | null;   // mean risk score for this week
  scoreDrift:           number | null;   // currentMeanScore - rollingBaselineScore
  scoreDriftAlert:      boolean;         // true if |scoreDrift| > 15 points
}

function windowKey(tenant: string): string {
  return `hs-drift/${tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}/window.json`;
}
function reportKey(tenant: string): string {
  return `hs-drift/${tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}/report.json`;
}

const WINDOW_MS   = 30 * 24 * 3_600_000;
const WEEK_MS     = 7  * 24 * 3_600_000;
const MAX_ENTRIES = 5_000;

// Thresholds are operator-configurable via env vars so regulated institutions
// can apply institution-specific tolerance bands without a code deploy.
// DRIFT_APPROVE_DELTA_PCT: integer percentage points (default 20 → 0.20 fraction)
// DRIFT_SCORE_THRESHOLD_PTS: integer points of risk score deviation (default 15)
function getDriftApproveThreshold(): number {
  const raw = process.env["DRIFT_APPROVE_DELTA_PCT"];
  if (raw !== undefined && raw !== "") {
    const v = parseFloat(raw);
    if (isFinite(v) && v > 0 && v < 100) return v / 100;
  }
  return 0.20;
}
function getScoreDriftThreshold(): number {
  const raw = process.env["DRIFT_SCORE_THRESHOLD_PTS"];
  if (raw !== undefined && raw !== "") {
    const v = parseFloat(raw);
    if (isFinite(v) && v > 0 && v <= 100) return v;
  }
  return 15;
}

export async function recordDecision(
  tenant: string,
  verdict: string,
  confidence: number,
  riskScore: number,
): Promise<void> {
  try {
    const key = windowKey(tenant);
    const now = Date.now();
    // Normalise confidence to 0–100
    const normConf = confidence > 1 ? confidence : confidence * 100;
    const entry: DriftEntry = { ts: now, verdict, confidence: normConf, riskScore };
    const window = (await getJson<DriftEntry[]>(key).catch(() => null)) ?? [];
    const pruned = window.filter((e) => now - e.ts < WINDOW_MS).slice(-(MAX_ENTRIES - 1));
    pruned.push(entry);
    await setJson(key, pruned);

    // Recompute report every 50 entries
    if (pruned.length % 50 === 0) {
      void computeDriftReport(tenant, pruned).catch(() => undefined);
    }
  } catch (err) {
    console.warn("[drift-monitor] recordDecision failed (non-critical):", err instanceof Error ? err.message : String(err));
  }
}

export async function computeDriftReport(tenant: string, entries?: DriftEntry[]): Promise<DriftReport> {
  const key = windowKey(tenant);
  const window = entries ?? ((await getJson<DriftEntry[]>(key).catch(() => null)) ?? []);
  const now = Date.now();

  const thisWeekEntries = window.filter((e) => now - e.ts < WEEK_MS);
  const lastWeekEntries = window.filter((e) => {
    const age = now - e.ts;
    return age >= WEEK_MS && age < 2 * WEEK_MS;
  });

  function rates(items: DriftEntry[]) {
    if (items.length === 0) return null;
    const total = items.length;
    return {
      count:          total,
      approveRate:    items.filter((e) => e.verdict === "approve").length / total,
      eddRate:        items.filter((e) => e.verdict === "edd").length / total,
      escalateRate:   items.filter((e) => e.verdict === "escalate").length / total,
      strRate:        items.filter((e) => e.verdict === "str").length / total,
      meanConfidence: items.reduce((s, e) => s + e.confidence, 0) / total,
    };
  }

  const tw = rates(thisWeekEntries);
  const lw = rates(lastWeekEntries);

  let driftDetected = false;
  let driftReason: string | undefined;

  if (tw && lw && lw.count >= 10 && tw.count >= 10) {
    const approveIncrease = tw.approveRate - lw.approveRate;
    if (approveIncrease > getDriftApproveThreshold()) {
      driftDetected = true;
      driftReason = `Approve rate increased by ${(approveIncrease * 100).toFixed(1)}% this week vs last week — possible model drift or gaming`;
    }
    const confDrop = lw.meanConfidence - tw.meanConfidence;
    if (confDrop > 15) {
      driftDetected = true;
      driftReason = (driftReason ? driftReason + "; " : "") +
        `Mean confidence dropped ${confDrop.toFixed(1)} points — model uncertainty increasing`;
    }
  }

  // ── Composite risk score drift check ─────────────────────────────────────
  // Compare this week's mean risk score against the 30-day rolling baseline.
  // A drift of >15 points in either direction is flagged as a potential data
  // drift or model miscalibration event.
  const allRecent = window.filter((e) => now - e.ts < WINDOW_MS);
  const rollingBaselineScore = allRecent.length >= 10
    ? allRecent.reduce((s, e) => s + e.riskScore, 0) / allRecent.length
    : null;
  const currentMeanScore = thisWeekEntries.length >= 5
    ? thisWeekEntries.reduce((s, e) => s + e.riskScore, 0) / thisWeekEntries.length
    : null;

  let scoreDrift: number | null = null;
  let scoreDriftAlert = false;
  if (rollingBaselineScore !== null && currentMeanScore !== null) {
    scoreDrift = Math.round((currentMeanScore - rollingBaselineScore) * 10) / 10;
    if (Math.abs(scoreDrift) > getScoreDriftThreshold()) {
      scoreDriftAlert = true;
      const direction = scoreDrift > 0 ? "upward" : "downward";
      const driftMsg = `Composite risk score drifted ${direction} by ${Math.abs(scoreDrift).toFixed(1)} points from 30-day baseline (${rollingBaselineScore.toFixed(1)}) — possible data drift or model miscalibration`;
      driftDetected = true;
      driftReason = driftReason ? `${driftReason}; ${driftMsg}` : driftMsg;
    }
  }

  const report: DriftReport = {
    generatedAt:         new Date().toISOString(),
    sampleSize:          allRecent.length,
    thisWeek:            tw ?? { count: 0, approveRate: 0, eddRate: 0, escalateRate: 0, strRate: 0, meanConfidence: 0 },
    lastWeek:            lw ? { count: lw.count, approveRate: lw.approveRate, meanConfidence: lw.meanConfidence } : null,
    driftDetected,
    ...(driftReason ? { driftReason } : {}),
    rollingBaselineScore: rollingBaselineScore !== null ? Math.round(rollingBaselineScore * 10) / 10 : null,
    currentMeanScore:     currentMeanScore !== null ? Math.round(currentMeanScore * 10) / 10 : null,
    scoreDrift,
    scoreDriftAlert,
  };

  await setJson(reportKey(tenant), report).catch(() => undefined);

  if (driftDetected) {
    void writeAuditChainEntry({
      event: "ai.model_drift_detected",
      actor: "system",
      driftReason,
      thisWeekApproveRate: tw?.approveRate,
      lastWeekApproveRate: lw?.approveRate,
      scoreDrift,
      scoreDriftAlert,
    }, tenant).catch(() => undefined);
  }

  return report;
}

export async function getDriftReport(tenant: string): Promise<DriftReport | null> {
  return getJson<DriftReport>(reportKey(tenant)).catch(() => null);
}
