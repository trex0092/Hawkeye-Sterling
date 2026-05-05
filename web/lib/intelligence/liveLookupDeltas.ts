// Hawkeye Sterling — live-lookup daily deltas (Layers 227-231).
//
// Generic delta computer plus regime-specific helpers. Each helper is a
// thin wrapper around `computeDelta` so the per-regime call sites read
// cleanly in the audit log.

export interface ListSnapshot {
  fetchedAt: string;
  records: Array<{ id: string; name: string; programs?: string[]; designatedAt?: string }>;
}

export interface DeltaReport {
  regime: string;
  added: Array<{ id: string; name: string; programs: string[] }>;
  removed: Array<{ id: string; name: string }>;
  programChanges: Array<{ id: string; name: string; before: string[]; after: string[] }>;
  rationale: string;
}

function computeDelta(regime: string, prev: ListSnapshot, cur: ListSnapshot): DeltaReport {
  const prevById = new Map(prev.records.map((r) => [r.id, r]));
  const curById = new Map(cur.records.map((r) => [r.id, r]));
  const added: DeltaReport["added"] = [];
  const removed: DeltaReport["removed"] = [];
  const programChanges: DeltaReport["programChanges"] = [];
  for (const [id, c] of curById.entries()) {
    const p = prevById.get(id);
    if (!p) added.push({ id, name: c.name, programs: c.programs ?? [] });
    else {
      const before = (p.programs ?? []).slice().sort().join(",");
      const after = (c.programs ?? []).slice().sort().join(",");
      if (before !== after) programChanges.push({ id, name: c.name, before: p.programs ?? [], after: c.programs ?? [] });
    }
  }
  for (const [id, p] of prevById.entries()) if (!curById.has(id)) removed.push({ id, name: p.name });
  const rationale = `${regime}: ${added.length} added, ${removed.length} removed, ${programChanges.length} program-changed since ${prev.fetchedAt}.`;
  return { regime, added, removed, programChanges, rationale };
}

// 227. UN 1267 daily delta
export function un1267Delta(prev: ListSnapshot, cur: ListSnapshot): DeltaReport { return computeDelta("UN_1267", prev, cur); }
// 228. OFAC SDN daily delta
export function ofacSdnDelta(prev: ListSnapshot, cur: ListSnapshot): DeltaReport { return computeDelta("OFAC_SDN", prev, cur); }
// 229. EU CFSP daily delta
export function euCfspDelta(prev: ListSnapshot, cur: ListSnapshot): DeltaReport { return computeDelta("EU_CFSP", prev, cur); }
// 230. UK OFSI daily delta
export function ukOfsiDelta(prev: ListSnapshot, cur: ListSnapshot): DeltaReport { return computeDelta("UK_OFSI", prev, cur); }
// 231. UAE EOCN daily delta
export function uaeEocnDelta(prev: ListSnapshot, cur: ListSnapshot): DeltaReport { return computeDelta("UAE_EOCN", prev, cur); }
