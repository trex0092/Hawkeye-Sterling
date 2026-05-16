// Hawkeye Sterling — ring/cluster detector (audit follow-up #25).
//
// Given a population of subjects + their attached entities + counterparties,
// surfaces RINGS — sets of subjects connected via shared identifiers,
// addresses, beneficial owners, or counterparty wallets / accounts. Used
// to detect mule networks, professional-enabler clusters, and front-
// company webs. Pure function; no IO.

export interface SubjectFingerprint {
  subjectId: string;
  identifiers?: string[];      // passport / Emirates ID / LEI / IMO
  addresses?: string[];         // hashed / canonicalised address strings
  beneficialOwners?: string[]; // person ids
  counterparties?: string[];   // wallet / account / ip / phone
  director?: string[];          // shared director id
}

export interface Ring {
  id: string;
  subjectIds: string[];
  sharedDimensions: Array<{
    dimension: "identifier" | "address" | "beneficial_owner" | "counterparty" | "director";
    value: string;
    count: number;
  }>;
  size: number;
  density: number;             // 0..1, fraction of dimensions shared
}

interface IndexEntry {
  dimension: Ring["sharedDimensions"][number]["dimension"];
  subjectIds: Set<string>;
}

const DIMENSIONS: Array<{ key: keyof SubjectFingerprint; tag: Ring["sharedDimensions"][number]["dimension"] }> = [
  { key: "identifiers", tag: "identifier" },
  { key: "addresses", tag: "address" },
  { key: "beneficialOwners", tag: "beneficial_owner" },
  { key: "counterparties", tag: "counterparty" },
  { key: "director", tag: "director" },
];

/** Detect rings from a population of fingerprints. */
export function detectRings(population: readonly SubjectFingerprint[], minSize = 2): Ring[] {
  if (population.length < 2) return [];

  // Build inverted index: value → subjects sharing it.
  const index = new Map<string, IndexEntry>();
  for (const sub of population) {
    for (const d of DIMENSIONS) {
      const arr = (sub[d.key] as string[] | undefined) ?? [];
      for (const v of arr) {
        if (!v) continue;
        const key = `${d.tag}::${v}`;
        let entry = index.get(key);
        if (!entry) {
          entry = { dimension: d.tag, subjectIds: new Set<string>() };
          index.set(key, entry);
        }
        entry.subjectIds.add(sub.subjectId);
      }
    }
  }

  // Union-find over subjects connected via any shared dimension.
  const parent = new Map<string, string>();
  for (const sub of population) parent.set(sub.subjectId, sub.subjectId);
  function find(a: string): string {
    let cur = a;
    while ((parent.get(cur) ?? cur) !== cur) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, parent.get(next) ?? next);
      cur = next;
    }
    return cur;
  }
  function union(a: string, b: string): void {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const entry of index.values()) {
    if (entry.subjectIds.size < 2) continue;
    const ids = [...entry.subjectIds];
    const head = ids[0] ?? '';
    for (let i = 1; i < ids.length; i++) union(head, ids[i] ?? '');
  }

  // Group subjects by root.
  const byRoot = new Map<string, string[]>();
  for (const sub of population) {
    const r = find(sub.subjectId);
    let arr = byRoot.get(r);
    if (!arr) { arr = []; byRoot.set(r, arr); }
    arr.push(sub.subjectId);
  }

  // Derive shared dimensions per ring.
  const rings: Ring[] = [];
  let ringSeq = 0;
  for (const subjects of byRoot.values()) {
    if (subjects.length < minSize) continue;
    const subjectSet = new Set(subjects);
    const shared: Ring["sharedDimensions"] = [];
    for (const [key, entry] of index) {
      // count how many ring members share this value
      let count = 0;
      for (const sid of entry.subjectIds) if (subjectSet.has(sid)) count++;
      if (count >= 2) {
        const value = key.slice(key.indexOf("::") + 2);
        shared.push({ dimension: entry.dimension, value, count });
      }
    }
    shared.sort((a, b) => b.count - a.count);
    const totalDims = subjects.length * DIMENSIONS.length;
    const density = totalDims > 0 ? Math.min(1, shared.length / totalDims) : 0;
    rings.push({
      id: `ring_${++ringSeq}`,
      subjectIds: subjects,
      sharedDimensions: shared.slice(0, 40),
      size: subjects.length,
      density,
    });
  }

  return rings.sort((a, b) => b.size - a.size || b.density - a.density);
}

/** Classify a ring by which dimension dominates the linkage. */
export function classifyRing(r: Ring): "mule" | "front_company" | "professional_enabler" | "address_cluster" | "uncertain" {
  const counts: Record<Ring["sharedDimensions"][number]["dimension"], number> = {
    identifier: 0, address: 0, beneficial_owner: 0, counterparty: 0, director: 0,
  };
  for (const d of r.sharedDimensions) counts[d.dimension] += d.count;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) return "uncertain";
  const [dim] = top;
  if (dim === "counterparty") return "mule";
  if (dim === "beneficial_owner") return "front_company";
  if (dim === "director") return "professional_enabler";
  if (dim === "address") return "address_cluster";
  return "uncertain";
}
