import { getJson, setJson } from "@/lib/server/store";
import type { CaseRecord } from "@/lib/types";

// Server-side case vault — persists the operator's case register beyond
// browser localStorage so:
//   - the same operator on a different device sees the same cases
//   - a regulator reviewing a deployment can audit the full register
//   - cases survive a localStorage clear / private window
//
// Storage shape: a single blob keyed CASES_BLOB containing the full
// CaseRecord[]. Mirrors the client-side localStorage shape exactly so
// the sync layer can swap arrays without per-case rehydration. For
// deployments that grow past ~1000 cases we'd switch to per-case
// blobs + an index — kept simple here while the case count is small.

const CASES_BLOB = "hawkeye-cases/all.v1.json";

interface VaultPayload {
  version: 1;
  updatedAt: string;
  cases: CaseRecord[];
}

export async function loadAllCases(): Promise<CaseRecord[]> {
  const payload = await getJson<VaultPayload>(CASES_BLOB);
  if (!payload || !Array.isArray(payload.cases)) return [];
  return payload.cases;
}

export async function saveAllCases(cases: CaseRecord[]): Promise<void> {
  const payload: VaultPayload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    cases,
  };
  await setJson(CASES_BLOB, payload);
}

// Merge `incoming` (client-side state) with the existing server state.
// Strategy:
//   - dedupe by case id; the higher `lastActivity` wins
//   - records present only on one side are preserved
//   - asanaTaskUrl / mlroDisposition / evidence-array length all default
//     to the winning record's values (no per-field deep merge — keeps
//     conflict semantics predictable)
// Returns the merged array so the caller can write it back to both
// localStorage and the blob in a single round-trip.
export async function mergeCases(
  incoming: CaseRecord[],
): Promise<CaseRecord[]> {
  const existing = await loadAllCases();
  const byId = new Map<string, CaseRecord>();
  for (const r of existing) byId.set(r.id, r);
  for (const r of incoming) {
    const prior = byId.get(r.id);
    if (!prior) {
      byId.set(r.id, r);
      continue;
    }
    // last-write-wins by lastActivity (ISO string compare works because
    // these are all UTC ISO timestamps from new Date().toISOString())
    const winner =
      r.lastActivity >= prior.lastActivity ? r : prior;
    byId.set(r.id, winner);
  }
  const merged = Array.from(byId.values()).sort((a, b) =>
    a.lastActivity < b.lastActivity ? 1 : -1,
  );
  await saveAllCases(merged);
  return merged;
}

export async function deleteCaseById(id: string): Promise<CaseRecord[]> {
  const existing = await loadAllCases();
  const next = existing.filter((c) => c.id !== id);
  if (next.length !== existing.length) {
    await saveAllCases(next);
  }
  return next;
}
