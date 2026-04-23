// Hawkeye Sterling — analyst false-positive feedback loop.
//
// Every time an analyst marks a screening hit as a false positive (or
// confirmed match) the decision is persisted here. The match calibrator
// reads the aggregated verdicts to down-weight hits that have repeatedly
// been dismissed across the tenant, producing a real learning signal on
// top of the static heuristics in src/brain/confidence.ts.

import { getJson, listKeys, setJson } from "./store";

const PREFIX = "feedback/";
const STATS_KEY = "feedback_stats";

export type Verdict = "false_positive" | "true_match" | "needs_review";

export interface FeedbackRecord {
  id: string;
  subjectId: string;
  listId: string;
  listRef: string;
  candidateName: string;
  verdict: Verdict;
  reason?: string;
  analyst: string;
  submittedAt: string;
}

export interface FeedbackStats {
  falsePositiveByPair: Record<string, number>;
  trueMatchByPair: Record<string, number>;
  totalVerdicts: number;
  lastUpdatedAt: string;
}

function pairKey(listId: string, listRef: string, candidate: string): string {
  return `${listId}|${listRef}|${candidate.toLowerCase()}`;
}

export async function submitFeedback(
  input: Omit<FeedbackRecord, "id" | "submittedAt">,
): Promise<FeedbackRecord> {
  const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record: FeedbackRecord = {
    ...input,
    id,
    submittedAt: new Date().toISOString(),
  };
  await setJson(`${PREFIX}${id}`, record);
  await bumpStats(record);
  return record;
}

async function bumpStats(record: FeedbackRecord): Promise<void> {
  const current = (await getJson<FeedbackStats>(STATS_KEY)) ?? {
    falsePositiveByPair: {},
    trueMatchByPair: {},
    totalVerdicts: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
  const key = pairKey(record.listId, record.listRef, record.candidateName);
  if (record.verdict === "false_positive") {
    current.falsePositiveByPair[key] = (current.falsePositiveByPair[key] ?? 0) + 1;
  } else if (record.verdict === "true_match") {
    current.trueMatchByPair[key] = (current.trueMatchByPair[key] ?? 0) + 1;
  }
  current.totalVerdicts += 1;
  current.lastUpdatedAt = new Date().toISOString();
  await setJson(STATS_KEY, current);
}

export async function listFeedback(): Promise<FeedbackRecord[]> {
  const keys = await listKeys(PREFIX);
  const out: FeedbackRecord[] = [];
  for (const k of keys) {
    const r = await getJson<FeedbackRecord>(k);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function stats(): Promise<FeedbackStats> {
  return (
    (await getJson<FeedbackStats>(STATS_KEY)) ?? {
      falsePositiveByPair: {},
      trueMatchByPair: {},
      totalVerdicts: 0,
      lastUpdatedAt: new Date().toISOString(),
    }
  );
}

/**
 * Apply the learnt false-positive signal to a raw match score. A hit that
 * has been dismissed N times against the same list reference loses
 * 0.02 × N from its normalised score, capped at 0.35. True-match history
 * reinforces the score by 0.01 × M (capped at 0.1).
 */
export function adjustScore(
  raw: number,
  listId: string,
  listRef: string,
  candidate: string,
  s: FeedbackStats,
): { score: number; delta: number; reason?: string } {
  const k = pairKey(listId, listRef, candidate);
  const fp = s.falsePositiveByPair[k] ?? 0;
  const tm = s.trueMatchByPair[k] ?? 0;
  const penalty = Math.min(0.35, fp * 0.02);
  const bonus = Math.min(0.1, tm * 0.01);
  const delta = bonus - penalty;
  const score = Math.max(0, Math.min(1, raw + delta));
  const reason =
    fp + tm === 0
      ? undefined
      : `feedback: ${fp} FP, ${tm} TM → ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
  return { score, delta, ...(reason ? { reason } : {}) };
}
