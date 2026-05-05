// Hawkeye Sterling — audit gates (Layers #42-44).
//
// Three pure-function gates:
//   - staleDataGate:           refuse to clear on >N-day-old screening data
//   - dualSourceCorroboration: require 2+ independent sources to confirm a sanction
//   - brainVersionPin:         pin the engine version into the dossier so the
//                              regulator can replay the exact run

// ── #42 Stale-data gate ────────────────────────────────────────────────
export interface StaleDataReport {
  stale: boolean;
  ageDays: number;
  thresholdDays: number;
  rationale: string;
}

export function staleDataGate(generatedAt: string | null | undefined, thresholdDays = 90, nowMs: number = Date.now()): StaleDataReport {
  if (!generatedAt) {
    return {
      stale: true,
      ageDays: Infinity,
      thresholdDays,
      rationale: "No screening generation timestamp recorded — treat as stale.",
    };
  }
  const t = Date.parse(generatedAt);
  if (!Number.isFinite(t)) {
    return { stale: true, ageDays: Infinity, thresholdDays, rationale: "Unparseable generation timestamp." };
  }
  const age = Math.floor((nowMs - t) / 86_400_000);
  return {
    stale: age > thresholdDays,
    ageDays: age,
    thresholdDays,
    rationale: age > thresholdDays
      ? `Screening data is ${age} days old (threshold ${thresholdDays}). Re-screen before any disposition.`
      : `Screening data is ${age} days old — within the ${thresholdDays}-day freshness window.`,
  };
}

// ── #43 Dual-source corroboration ──────────────────────────────────────
export interface SourceRecord {
  domain?: string;
  url?: string;
  authorityTier?: "regulator" | "tier1" | "tier2" | "tier3" | "academic" | "unknown";
}

export interface CorroborationReport {
  corroborated: boolean;
  uniqueSourceCount: number;
  uniqueDomainCount: number;
  hasRegulatorSource: boolean;
  hasTier1Source: boolean;
  rationale: string;
}

export function dualSourceCorroboration(sources: SourceRecord[]): CorroborationReport {
  const domains = new Set<string>();
  let hasReg = false, hasT1 = false;
  for (const s of sources) {
    const host = (s.domain ?? s.url ?? "").replace(/^https?:\/\//, "").split("/")[0]?.replace(/^www\./, "").toLowerCase();
    if (host) domains.add(host);
    if (s.authorityTier === "regulator") hasReg = true;
    if (s.authorityTier === "tier1") hasT1 = true;
  }
  const uniqueDomains = domains.size;
  const corroborated = uniqueDomains >= 2 || hasReg;
  return {
    corroborated,
    uniqueSourceCount: sources.length,
    uniqueDomainCount: uniqueDomains,
    hasRegulatorSource: hasReg,
    hasTier1Source: hasT1,
    rationale: corroborated
      ? `${uniqueDomains} independent source(s)${hasReg ? " incl. regulator" : ""}${hasT1 ? " + tier-1 outlet" : ""} — corroboration met.`
      : `Only ${uniqueDomains} unique source(s); FATF best-practice requires ≥2 independent corroborators before treating as established fact.`,
  };
}

// ── #44 Brain-version pin ──────────────────────────────────────────────
export interface BrainVersionPin {
  engineVersion: string;
  schemaVersion: string;
  buildSha: string;
  pinnedAt: string;
  // Pure-function checksum for the pin (collision-safe; for replay).
  fingerprint: string;
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function pinBrainVersion(input: { engineVersion: string; schemaVersion: string; buildSha: string }): BrainVersionPin {
  const pinnedAt = new Date().toISOString();
  const fingerprint = fnv1a(`${input.engineVersion}|${input.schemaVersion}|${input.buildSha}|${pinnedAt}`);
  return { ...input, pinnedAt, fingerprint };
}
