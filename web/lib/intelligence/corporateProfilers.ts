// Hawkeye Sterling — corporate profilers (Layers 106-115).

export interface CorpEntity {
  id: string;
  name: string;
  jurisdiction?: string;
  registeredAddress?: string;
  incorporatedAt?: string;
  shareholders?: Array<{ entityId: string; pct: number }>;
  directors?: Array<{ name: string; appointedAt?: string }>;
  employees?: number;
  revenueUsd?: number;
  premisesArea?: "owned" | "leased" | "registered_address_only" | "virtual_office";
  legalForm?: "llc" | "fzco" | "fze" | "ltd" | "plc" | "trust" | "foundation" | "branch" | "soleprop" | "partnership" | "corp";
  businessType?: string;
}

// 106. Beneficial-ownership map walker (returns ultimate natural-person UBOs)
export function walkBeneficialOwnership(
  rootId: string,
  entitiesById: Record<string, CorpEntity>,
  natural: Set<string>,
  visited = new Set<string>(),
): Array<{ ubo: string; pct: number; depth: number }> {
  if (visited.has(rootId)) return [];
  visited.add(rootId);
  const root = entitiesById[rootId];
  if (!root) return [];
  const out: Array<{ ubo: string; pct: number; depth: number }> = [];
  for (const sh of root.shareholders ?? []) {
    if (natural.has(sh.entityId)) {
      out.push({ ubo: sh.entityId, pct: sh.pct, depth: 1 });
      continue;
    }
    const child = walkBeneficialOwnership(sh.entityId, entitiesById, natural, visited);
    for (const c of child) out.push({ ubo: c.ubo, pct: c.pct * sh.pct, depth: c.depth + 1 });
  }
  return out;
}

// 107. Layered-ownership detector (3+ corporate layers before reaching a UBO)
export function isLayered(
  rootId: string,
  entitiesById: Record<string, CorpEntity>,
  natural: Set<string>,
): { layered: boolean; maxDepth: number } {
  const ubos = walkBeneficialOwnership(rootId, entitiesById, natural);
  const maxDepth = ubos.reduce((m, u) => Math.max(m, u.depth), 0);
  return { layered: maxDepth >= 3, maxDepth };
}

// 108. Director-overlap clustering (same name on N+ entities)
export function clusterByDirector(entities: CorpEntity[], minCluster = 5): Array<{ director: string; entityIds: string[] }> {
  const map = new Map<string, string[]>();
  for (const e of entities) {
    for (const d of e.directors ?? []) {
      const k = d.name.trim().toLowerCase();
      const arr = map.get(k) ?? [];
      arr.push(e.id);
      map.set(k, arr);
    }
  }
  const out: Array<{ director: string; entityIds: string[] }> = [];
  for (const [d, ids] of map.entries()) if (ids.length >= minCluster) out.push({ director: d, entityIds: ids });
  return out;
}

// 109. UBO change-of-control alarm
export function detectUboChange(
  prev: Array<{ ubo: string; pct: number }>,
  cur: Array<{ ubo: string; pct: number }>,
  threshold = 0.1,
): { changed: boolean; deltas: Array<{ ubo: string; before: number; after: number }> } {
  const map = new Map<string, { before: number; after: number }>();
  for (const p of prev) map.set(p.ubo, { before: p.pct, after: 0 });
  for (const c of cur) {
    const e = map.get(c.ubo) ?? { before: 0, after: 0 };
    e.after = c.pct;
    map.set(c.ubo, e);
  }
  const deltas = [...map.entries()]
    .map(([ubo, v]) => ({ ubo, before: v.before, after: v.after }))
    .filter((d) => Math.abs(d.after - d.before) >= threshold);
  return { changed: deltas.length > 0, deltas };
}

// 110. Round-numbered shareholder pattern (50/50 / 33-33-33)
export function roundShareholderPattern(entity: CorpEntity): { suspicious: boolean; pattern?: string } {
  const sh = entity.shareholders ?? [];
  if (sh.length === 0) return { suspicious: false };
  const total = sh.reduce((s, x) => s + x.pct, 0);
  if (Math.abs(total - 1) > 0.02) return { suspicious: true, pattern: `shareholder total ${(total * 100).toFixed(0)}% ≠ 100%` };
  if (sh.length >= 2 && sh.every((x) => Math.abs(x.pct - 1 / sh.length) < 0.01)) {
    return { suspicious: true, pattern: `even ${sh.length}-way split (${(100 / sh.length).toFixed(0)}% each) — common nominee structure` };
  }
  return { suspicious: false };
}

// 111. Operating-substance test
export function substanceTest(e: CorpEntity): { score: number; missing: string[] } {
  const missing: string[] = [];
  if (!e.employees || e.employees < 1) missing.push("no employees");
  if (!e.revenueUsd || e.revenueUsd < 10_000) missing.push("no/low revenue");
  if (e.premisesArea === "registered_address_only" || e.premisesArea === "virtual_office") missing.push("no real premises");
  const score = 100 - missing.length * 33;
  return { score: Math.max(0, score), missing };
}

// 112. Place-of-effective-management heuristic
export function placeOfEffectiveManagement(e: CorpEntity, directorJurisdictions: string[]): {
  poem?: string; mismatch: boolean; rationale: string;
} {
  if (directorJurisdictions.length === 0) return { mismatch: false, rationale: "Insufficient director residency data." };
  const counts = new Map<string, number>();
  for (const j of directorJurisdictions) counts.set(j, (counts.get(j) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const mismatch = e.jurisdiction !== undefined && top[0] !== e.jurisdiction;
  return {
    poem: top[0],
    mismatch,
    rationale: mismatch
      ? `Effective management appears to be in ${top[0]} (${top[1]} of ${directorJurisdictions.length} directors), not registered jurisdiction (${e.jurisdiction}).`
      : `POEM aligned with registered jurisdiction (${e.jurisdiction}).`,
  };
}

// 113. Corporate vehicle profile
export function corporateVehicleProfile(e: CorpEntity): { riskTier: "low" | "medium" | "high"; notes: string[] } {
  const notes: string[] = [];
  let tier: "low" | "medium" | "high" = "low";
  if (e.legalForm === "trust" || e.legalForm === "foundation") {
    tier = "high"; notes.push("Trust/foundation — settlor/beneficiary opacity per FATF R.25.");
  }
  if (e.legalForm === "fze" || e.legalForm === "fzco") {
    tier = tier === "high" ? "high" : "medium"; notes.push("UAE Free Zone vehicle — substance test required.");
  }
  if (e.legalForm === "branch") {
    notes.push("Branch — pierce to parent for sanctions screening.");
    tier = tier === "high" ? "high" : "medium";
  }
  return { riskTier: tier, notes };
}

// 114. Group-company dependency map
export function groupDependency(entities: CorpEntity[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of entities) adj.set(e.id, new Set());
  for (const e of entities) {
    for (const sh of e.shareholders ?? []) {
      if (sh.pct >= 0.25) {
        const set = adj.get(sh.entityId) ?? new Set();
        set.add(e.id);
        adj.set(sh.entityId, set);
      }
    }
  }
  return adj;
}

// 115. Holding-co red flags (no operations, owns ≥3 subsidiaries)
export function holdingCoRedFlags(e: CorpEntity, owns: number): { flagged: boolean; rationale: string } {
  const noOps = (e.employees ?? 0) === 0 && (e.revenueUsd ?? 0) === 0;
  if (noOps && owns >= 3) {
    return { flagged: true, rationale: `Pure holding co with no operations and ${owns} subsidiaries — verify legitimate-purpose statement.` };
  }
  return { flagged: false, rationale: "Within tolerance." };
}
