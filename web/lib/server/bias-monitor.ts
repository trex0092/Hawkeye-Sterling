// Bias & Fairness monitor for the AI screening engine (Cybersecurity spec item 1).
//
// After every screening, records the result grouped by name-script origin.
// Periodically computes bias ratios across language groups and flags if any
// group scores >15% above the global mean — indicating systematic over-scoring
// that could constitute discriminatory screening under FATF R.10.
//
// Storage: hs-bias/<tenant>/window.json  (rolling 30-day, max 5000 entries)
//          hs-bias/<tenant>/report.json  (latest computed report)

import { getJson, setJson } from "./store";
import { writeAuditChainEntry } from "./audit-chain";

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

export interface BiasReport {
  generatedAt:  string;
  sampleSize:   number;
  globalMean:   number;
  groups: Array<{
    script:     NameScript;
    count:      number;
    meanScore:  number;
    hitRate:    number;
    biasRatio:  number;    // meanScore / globalMean
    flagged:    boolean;   // biasRatio > 1.15
  }>;
  biasDetected: boolean;
}

function windowKey(tenant: string): string {
  return `hs-bias/${tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}/window.json`;
}
function reportKey(tenant: string): string {
  return `hs-bias/${tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}/report.json`;
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
const BIAS_THRESHOLD = 1.15; // 15% above global mean

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

export async function computeBiasReport(tenant: string, entries?: BiasEntry[]): Promise<BiasReport> {
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
      flagged:   biasRatio > BIAS_THRESHOLD,
    };
  }).sort((a, b) => b.biasRatio - a.biasRatio);

  const biasDetected = groups.some((g) => g.flagged && g.count >= 10);

  const report: BiasReport = {
    generatedAt: new Date().toISOString(),
    sampleSize:  recent.length,
    globalMean:  Math.round(globalMean * 10) / 10,
    groups,
    biasDetected,
  };

  await setJson(reportKey(tenant), report).catch(() => undefined);

  if (biasDetected) {
    void writeAuditChainEntry({
      event: "ai.bias_detected",
      actor: "system",
      biasDetected: true,
      flaggedGroups: groups.filter((g) => g.flagged && g.count >= 10).map((g) => g.script),
      sampleSize: recent.length,
    }, tenant).catch(() => undefined);
  }

  return report;
}

export async function getBiasReport(tenant: string): Promise<BiasReport | null> {
  return getJson<BiasReport>(reportKey(tenant)).catch(() => null);
}
