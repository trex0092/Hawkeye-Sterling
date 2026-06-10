// Hawkeye Sterling — per-module attestation history for the status-card
// graphic's 7-day strip (CCL-2026-023). Read-modify-write on the blob
// store; every failure degrades to an empty history rather than throwing —
// the attestation post must never block on history bookkeeping.

import { getJson, setJson } from "@/lib/server/store";
import type { AttestationState } from "@/lib/server/attestation-chart";

export interface HistoryEntry {
  date: string;
  state: AttestationState;
}

const KEEP = 7;

function keyFor(moduleKey: string): string {
  return `hs-attest/history/${moduleKey}.json`;
}

export async function readHistory(moduleKey: string): Promise<HistoryEntry[]> {
  const raw = await getJson<HistoryEntry[]>(keyFor(moduleKey)).catch(() => null);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is HistoryEntry =>
      typeof e?.date === "string" && (e.state === "C" || e.state === "A" || e.state === "E" || e.state === "M"),
  );
}

/** Records today's state (idempotent per date) and returns the PRIOR days for the card strip. */
export async function recordAndGetPrior(
  moduleKey: string,
  date: string,
  state: AttestationState,
): Promise<HistoryEntry[]> {
  const history = await readHistory(moduleKey);
  const prior = history.filter((e) => e.date !== date);
  const next = [...prior, { date, state }].slice(-KEEP);
  await setJson(keyFor(moduleKey), next).catch(() => undefined);
  return prior.slice(-(KEEP - 1));
}
