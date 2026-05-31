// Bias & Fairness monitor for the AI screening engine (Cybersecurity spec item 1).
//
// After every screening, records the result grouped by name-script origin.
// Periodically computes bias ratios across language groups and flags if any
// group scores >15% above the global mean — indicating systematic over-scoring
// that could constitute discriminatory screening under FATF R.10.
//
// Also tracks PEP screening results by nationality to detect statistically
// significant false positive rate differences (>20% gap between nationalities).
//
// Storage: hs-bias/<tenant>/window.json      (rolling 30-day, max 5000 entries)
//          hs-bias/<tenant>/report.json      (latest computed report)
//          hs-bias/<tenant>/pep-window.json  (rolling 30-day PEP nationality entries)

import { getJson, setJson } from "./store";
import { writeAuditChainEntry } from "./audit-chain";
import { incrementCounter } from "./metrics-store";
import { startSpan, SpanStatus } from "./tracer";
import { emitAndLog } from "../../../src/integrations/webhook-emitter";

export type NameScript =
  | "arabic" | "cjk" | "cyrillic" | "devanagari" | "greek"
  | "hangul" | "hebrew" | "thai" | "latin" | "unknown";

export interface BiasEntry {
  ts:        number;       // epoch ms
  script:    NameScript;
  score:     number;       // 0–100
  severity:  string;       // clear|low|medium|high|critical
  hit:       boolean;      // any hit returned
}

// ── PEP nationality bias tracking ────────────────────────────────────────────

export interface PepNationalityEntry {
  ts:          number;   // epoch ms
  nationality: string;  // ISO 3166-1 alpha-2 or free-text country code
  isHit:       boolean;  // true = PEP match returned
  isFalsePos:  boolean;  // true = subsequently adjudicated as false positive
}

export interface NationalityBiasGroup {
  nationality:      string;
  count:            number;
  hitRate:          number;
  falsePositiveRate: number;
  biasRatio:        number;   // falsePositiveRate / globalFPRate
  flagged:          boolean;  // |fpRate - globalFPRate| > 0.20
}

export interface BiasReport {
  generatedAt:        string;
  sampleSize:         number;
  globalMean:         number;
  groups: Array<{
    script:     NameScript;
    count:      number;
    meanScore:  number;
    hitRate:    number;
    biasRatio:  number;    // meanScore / globalMean
    flagged:    boolean;   // biasRatio > 1.15
  }>;
  biasDetected:       boolean;
  // PEP nationality bias fields
  nationalityBiasScore: number;   // 0 = no bias detected; 100 = maximum disparity
  nationalityGroups:    NationalityBiasGroup[];
  nationalityBiasDetected: boolean;
}

function windowKey(tenant: string): string {
  return `hs-bias/${tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}/window.json`;
}
function reportKey(tenant: string): string {
  return `hs-bias/${tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}/report.json`;
}
function pepWindowKey(tenant: string): string {
  return `hs-bias/${tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}/pep-window.json`;
}

function detectScript(name: string): NameScript {
  if (!name) return "unknown";
  // Check dominant script in first 20 chars
  const sample = name.slice(0, 20);
  const counts: Record<NameScript, number> = {
    arabic: 0, cjk: 0, cyrillic: 0, devanagari: 0, greek: 0,
    hangul: 0, hebrew: 0, thai: 0, latin: 0, unknown: 0,
  };
  for (const ch of sample) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0600 && cp <= 0x06FF) counts.arabic++;
    else if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3040 && cp <= 0x30FF)) counts.cjk++;
    else if (cp >= 0x0400 && cp <= 0x04FF) counts.cyrillic++;
    else if (cp >= 0x0900 && cp <= 0x097F) counts.devanagari++;
    else if (cp >= 0x0370 && cp <= 0x03FF) counts.greek++;
    else if (cp >= 0xAC00 && cp <= 0xD7AF) counts.hangul++;
    else if (cp >= 0x0590 && cp <= 0x05FF) counts.hebrew++;
    else if (cp >= 0x0E00 && cp <= 0x0E7F) counts.thai++;
    else if ((cp >= 0x0041 && cp <= 0x007A) || (cp >= 0x00C0 && cp <= 0x024F)) counts.latin++;
  }
  let best: NameScript = "unknown";
  let bestCount = 0;
  for (const [s, c] of Object.entries(counts) as [NameScript, number][]) {
    if (c > bestCount) { bestCount = c; best = s; }
  }
  return bestCount > 0 ? best : "latin";
}

const WINDOW_MS  = 30 * 24 * 3_600_000; // 30 days
const MAX_ENTRIES = 5_000;
const MIN_NATIONALITY_SAMPLE = 5;   // minimum entries per nationality for bias calc

// Thresholds are operator-configurable via env vars.
// BIAS_THRESHOLD_PCT: integer percentage above global mean that triggers a flag (default 15 → ratio 1.15)
// NATIONALITY_FP_DELTA_PCT: integer percentage gap in false-positive rates between nationalities (default 20 → 0.20)
//
// NOTE: Default threshold is 1.15, deliberately tighter than the FATF R.10 regulatory floor of 1.5.
// A 15% deviation triggers internal review; the 1.5 threshold at which point a FATF R.10 incident
// must be declared is checked separately in bias-report/route.ts (criticalGroups).
// Override via BIAS_THRESHOLD_PCT env var (e.g. "20" → ratio 1.20). Requires MLRO sign-off
// before loosening above 50 (ratio 1.5) in production — see COMPLIANCE_GAPS.md.
function getBiasThreshold(): number {
  const raw = process.env["BIAS_THRESHOLD_PCT"];
  if (raw !== undefined && raw !== "") {
    const v = parseFloat(raw);
    if (isFinite(v) && v > 0 && v < 100) return 1 + v / 100;
  }
  return 1.15;
}
function getNationalityFpDelta(): number {
  const raw = process.env["NATIONALITY_FP_DELTA_PCT"];
  if (raw !== undefined && raw !== "") {
    const v = parseFloat(raw);
    if (isFinite(v) && v > 0 && v < 100) return v / 100;
  }
  return 0.20;
}

export async function recordScreeningBias(
  tenant: string,
  subjectName: string,
  score: number,
  severity: string,
  hitCount: number,
): Promise<void> {
  try {
    const key   = windowKey(tenant);
    const now   = Date.now();
    const entry: BiasEntry = {
      ts: now,
      script: detectScript(subjectName),
      score,
      severity,
      hit: hitCount > 0,
    };
    const window = (await getJson<BiasEntry[]>(key).catch(() => null)) ?? [];
    // Prune entries older than 30 days and cap at MAX_ENTRIES
    const pruned = window
      .filter((e) => now - e.ts < WINDOW_MS)
      .slice(-(MAX_ENTRIES - 1));
    pruned.push(entry);
    await setJson(key, pruned);

    // Recompute report every 100 entries
    if (pruned.length % 100 === 0) {
      void computeBiasReport(tenant, pruned).catch(() => undefined);
    }
  } catch (err) {
    console.warn("[bias-monitor] recordScreeningBias failed (non-critical):", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Record a PEP screening result by nationality for demographic bias analysis.
 * Call this after each PEP screening. Once the subject's PEP status is later
 * adjudicated (confirmed vs. false positive), call again with isFalsePos=true
 * to update the record.
 */
export async function recordPepNationalityScreening(
  tenant: string,
  nationality: string,
  isHit: boolean,
  isFalsePos = false,
): Promise<void> {
  try {
    const key = pepWindowKey(tenant);
    const now = Date.now();
    const entry: PepNationalityEntry = {
      ts: now,
      nationality: nationality.trim().toLowerCase().slice(0, 8),
      isHit,
      isFalsePos,
    };
    const window = (await getJson<PepNationalityEntry[]>(key).catch(() => null)) ?? [];
    const pruned = window
      .filter((e) => now - e.ts < WINDOW_MS)
      .slice(-(MAX_ENTRIES - 1));
    pruned.push(entry);
    await setJson(key, pruned);
  } catch (err) {
    console.warn("[bias-monitor] recordPepNationalityScreening failed (non-critical):", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Compute nationality-level PEP bias statistics.
 * Returns a bias score 0–100 and per-nationality group metrics.
 * Score = max false-positive-rate gap across nationalities × 100.
 * E.g. if the worst nationality pair differs by 35% in FP rate, score = 35.
 */
function computeNationalityBias(pepEntries: PepNationalityEntry[]): {
  nationalityBiasScore: number;
  nationalityGroups: NationalityBiasGroup[];
  nationalityBiasDetected: boolean;
} {
  if (pepEntries.length === 0) {
    return { nationalityBiasScore: 0, nationalityGroups: [], nationalityBiasDetected: false };
  }

  // Only consider entries that have been adjudicated (isHit=true so FP status is meaningful)
  const adjudicated = pepEntries.filter((e) => e.isHit);

  const globalFP = adjudicated.length > 0
    ? adjudicated.filter((e) => e.isFalsePos).length / adjudicated.length
    : 0;

  const byNationality = new Map<string, PepNationalityEntry[]>();
  for (const e of adjudicated) {
    const arr = byNationality.get(e.nationality) ?? [];
    arr.push(e);
    byNationality.set(e.nationality, arr);
  }

  const groups: NationalityBiasGroup[] = [];
  for (const [nationality, items] of byNationality.entries()) {
    if (items.length < MIN_NATIONALITY_SAMPLE) continue;
    const total = items.length;
    const hitRate = items.filter((e) => e.isHit).length / total;
    const fpRate  = items.filter((e) => e.isFalsePos).length / total;
    const biasRatio = globalFP > 0 ? fpRate / globalFP : (fpRate > 0 ? Infinity : 1);
    const flagged = Math.abs(fpRate - globalFP) > getNationalityFpDelta();
    groups.push({
      nationality,
      count: total,
      hitRate: Math.round(hitRate * 1000) / 1000,
      falsePositiveRate: Math.round(fpRate * 1000) / 1000,
      biasRatio: isFinite(biasRatio) ? Math.round(biasRatio * 1000) / 1000 : 99,
      flagged,
    });
  }

  groups.sort((a, b) => Math.abs(b.falsePositiveRate - globalFP) - Math.abs(a.falsePositiveRate - globalFP));

  // Bias score = max absolute FP-rate deviation from global mean × 100
  const maxDeviation = groups.reduce((max, g) => Math.max(max, Math.abs(g.falsePositiveRate - globalFP)), 0);
  const nationalityBiasScore = Math.round(Math.min(maxDeviation * 100, 100));
  const nationalityBiasDetected = groups.some((g) => g.flagged);

  return { nationalityBiasScore, nationalityGroups: groups, nationalityBiasDetected };
}

export async function computeBiasReport(tenant: string, entries?: BiasEntry[]): Promise<BiasReport> {
  const span = startSpan('bias-monitor.compute', { 'aml.tenant': tenant });
  try {
    return await _computeBiasReport(tenant, entries);
  } catch (err) {
    span.setStatus({ code: SpanStatus.ERROR });
    throw err;
  } finally {
    span.end();
  }
}

async function _computeBiasReport(tenant: string, entries?: BiasEntry[]): Promise<BiasReport> {
  const key = windowKey(tenant);
  const window = entries ?? ((await getJson<BiasEntry[]>(key).catch(() => null)) ?? []);

  const now = Date.now();
  const recent = window.filter((e) => now - e.ts < WINDOW_MS);

  const globalMean = recent.length > 0
    ? recent.reduce((s, e) => s + e.score, 0) / recent.length
    : 0;

  const byScript = new Map<NameScript, BiasEntry[]>();
  for (const e of recent) {
    const arr = byScript.get(e.script) ?? [];
    arr.push(e);
    byScript.set(e.script, arr);
  }

  const groups = Array.from(byScript.entries()).map(([script, items]) => {
    const meanScore = items.reduce((s, e) => s + e.score, 0) / items.length;
    const hitRate   = items.filter((e) => e.hit).length / items.length;
    const biasRatio = globalMean > 0 ? meanScore / globalMean : 1;
    return {
      script,
      count: items.length,
      meanScore: Math.round(meanScore * 10) / 10,
      hitRate:   Math.round(hitRate * 1000) / 1000,
      biasRatio: Math.round(biasRatio * 1000) / 1000,
      flagged:   biasRatio > getBiasThreshold(),
    };
  }).sort((a, b) => b.biasRatio - a.biasRatio);

  const biasDetected = groups.some((g) => g.flagged && g.count >= 10);

  // ── Nationality PEP bias analysis ────────────────────────────────────────
  const pepKey = pepWindowKey(tenant);
  const pepWindow = (await getJson<PepNationalityEntry[]>(pepKey).catch(() => null)) ?? [];
  const recentPep = pepWindow.filter((e) => now - e.ts < WINDOW_MS);
  const { nationalityBiasScore, nationalityGroups, nationalityBiasDetected } =
    computeNationalityBias(recentPep);

  const report: BiasReport = {
    generatedAt: new Date().toISOString(),
    sampleSize:  recent.length,
    globalMean:  Math.round(globalMean * 10) / 10,
    groups,
    biasDetected,
    nationalityBiasScore,
    nationalityGroups,
    nationalityBiasDetected,
  };

  await setJson(reportKey(tenant), report).catch(() => undefined);

  if (biasDetected) {
    const flaggedScripts = groups.filter((g) => g.flagged && g.count >= 10).map((g) => g.script);
    flaggedScripts.forEach((script) =>
      incrementCounter("hawkeye_bias_alert_total", 1, { tenant, script }),
    );
    void writeAuditChainEntry({
      event: "ai.bias_detected",
      actor: "system",
      biasDetected: true,
      flaggedGroups: flaggedScripts,
      sampleSize: recent.length,
    }, tenant).catch(() => undefined);
    void emitAndLog('alert_bias', {
      event: 'bias_alert',
      tenant,
      flaggedGroups: flaggedScripts,
      sampleSize: recent.length,
      fatfR10: true,
      detectedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }

  if (nationalityBiasDetected) {
    void writeAuditChainEntry({
      event: "ai.nationality_bias_detected",
      actor: "system",
      nationalityBiasScore,
      flaggedNationalities: nationalityGroups.filter((g) => g.flagged).map((g) => g.nationality),
      pepSampleSize: recentPep.length,
    }, tenant).catch(() => undefined);
    void emitAndLog('alert_bias', {
      event: 'nationality_bias_alert',
      tenant,
      nationalityBiasScore,
      flaggedNationalities: nationalityGroups.filter((g) => g.flagged).map((g) => g.nationality),
      pepSampleSize: recentPep.length,
      detectedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }

  return report;
}

export async function getBiasReport(tenant: string): Promise<BiasReport | null> {
  return getJson<BiasReport>(reportKey(tenant)).catch(() => null);
}
