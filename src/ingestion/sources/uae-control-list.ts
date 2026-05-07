// UAE Cabinet Resolution 156/2025 — Dual-Use Goods Control List
// Provides lookupHsCode() for transaction-monitoring and screening paths.
//
// Runtime priority:
//   1. Netlify Blobs store `hawkeye-goods-control` (populated by goods-control-ingest.mts)
//   2. Static in-memory seed of CR 156/2025 representative HS codes (always available)
//
// The static seed is intentionally non-exhaustive; it covers the principal
// categories that generate TM alerts. The live ingest adds the full catalogue.

export interface ControlledGoodsEntry {
  listId: string;
  hsCode: string;
  description: string;
  category: "dual_use" | "weapons_munitions" | "chemical" | "nuclear" | "missile" | "cyber_surveillance";
  controlReason: string;
  effectiveAt?: string;
}

export interface HsLookupResult {
  matched: boolean;
  entries: ControlledGoodsEntry[];
  source: "blob" | "static_seed" | "none";
  lookupTs: string;
}

// ─── Static seed — CR 156/2025 representative entries ───────────────────────

const STATIC_SEED: ControlledGoodsEntry[] = [
  // Nuclear / radiological materials
  { listId: "uae_156_2025", hsCode: "2612.10", description: "Uranium ores and concentrates", category: "nuclear", controlReason: "CR 156/2025 Nuclear Category — IAEA safeguards", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "2844.10", description: "Natural uranium and alloys", category: "nuclear", controlReason: "CR 156/2025 Nuclear Category", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "2844.20", description: "Uranium enriched in U235 and alloys", category: "nuclear", controlReason: "CR 156/2025 Nuclear Category — UNSCR 1540", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "2844.30", description: "Depleted uranium and thorium alloys", category: "nuclear", controlReason: "CR 156/2025 Nuclear Category", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8401.10", description: "Nuclear reactors", category: "nuclear", controlReason: "CR 156/2025 Nuclear Category", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8401.20", description: "Machinery and apparatus for isotope separation", category: "nuclear", controlReason: "CR 156/2025 Nuclear Category — enrichment risk", effectiveAt: "2025-01-01" },
  // Chemical / biological
  { listId: "uae_156_2025", hsCode: "2811.29", description: "Other inorganic acids (CWC Schedule 3 precursors)", category: "chemical", controlReason: "CR 156/2025 Chemical — CWC Schedule 3", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "2921.19", description: "Aliphatic monoamines incl. TDG precursors", category: "chemical", controlReason: "CR 156/2025 Chemical — OPCW Schedule 2", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "2930.90", description: "Organo-sulfur compounds (thiodiglycol etc.)", category: "chemical", controlReason: "CR 156/2025 Chemical — mustard agent precursor", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "3824.99", description: "Chemical mixtures — controlled precursors", category: "chemical", controlReason: "CR 156/2025 Chemical Category", effectiveAt: "2025-01-01" },
  // Missiles / aerospace
  { listId: "uae_156_2025", hsCode: "8803.10", description: "Propellers and rotors for aircraft — controlled variants", category: "missile", controlReason: "CR 156/2025 Missile — MTCR Category II", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8803.30", description: "Other parts of aircraft — dual-use structures", category: "missile", controlReason: "CR 156/2025 Missile Category", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8806.91", description: "Unmanned aircraft >150kg — long range", category: "missile", controlReason: "CR 156/2025 Missile — MTCR Category I threshold", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8412.10", description: "Reaction engines (jet/rocket propulsion)", category: "missile", controlReason: "CR 156/2025 Missile — MTCR", effectiveAt: "2025-01-01" },
  // Conventional weapons / munitions
  { listId: "uae_156_2025", hsCode: "9301.00", description: "Military weapons other than revolvers, pistols and swords", category: "weapons_munitions", controlReason: "CR 156/2025 Weapons Category — MoD licence", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "9306.21", description: "Cartridges for shotguns — military specification", category: "weapons_munitions", controlReason: "CR 156/2025 Munitions", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "9307.00", description: "Swords, cutlasses, bayonets, lances and similar military weapons", category: "weapons_munitions", controlReason: "CR 156/2025 Weapons Category", effectiveAt: "2025-01-01" },
  // Cyber-surveillance / electronics
  { listId: "uae_156_2025", hsCode: "8517.62", description: "Machines for the reception / conversion of voice — interception-capable", category: "cyber_surveillance", controlReason: "CR 156/2025 Cyber — Wassenaar monitoring category", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8543.70", description: "Electric machines and apparatus — network monitoring / IMSI catchers", category: "cyber_surveillance", controlReason: "CR 156/2025 Cyber Category", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8524.91", description: "Flat-panel displays with special signal intelligence use", category: "cyber_surveillance", controlReason: "CR 156/2025 Cyber Category", effectiveAt: "2025-01-01" },
  // Dual-use electronics / sensors
  { listId: "uae_156_2025", hsCode: "9014.80", description: "Other navigational instruments — inertial navigation (MTCR-relevant)", category: "dual_use", controlReason: "CR 156/2025 Dual-Use — MTCR/Wassenaar navigation", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "9025.19", description: "Thermometers — cryogenic, nuclear-grade", category: "dual_use", controlReason: "CR 156/2025 Dual-Use — nuclear applications", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8486.20", description: "Machines for the manufacture of semiconductor devices", category: "dual_use", controlReason: "CR 156/2025 Dual-Use — semiconductor / advanced chip manufacturing", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8486.40", description: "Machines for the manufacture of flat panel displays", category: "dual_use", controlReason: "CR 156/2025 Dual-Use", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8419.89", description: "Industrial or laboratory machinery — controlled high-temp processing", category: "dual_use", controlReason: "CR 156/2025 Dual-Use — nuclear facility applicability", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8479.89", description: "Machines / apparatus — isostatic presses (nuclear-grade)", category: "dual_use", controlReason: "CR 156/2025 Dual-Use Nuclear Annex", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "8456.10", description: "Machine-tools operating by laser — dual-use precision cutting", category: "dual_use", controlReason: "CR 156/2025 Dual-Use — Wassenaar precision manufacturing", effectiveAt: "2025-01-01" },
  { listId: "uae_156_2025", hsCode: "9031.80", description: "Measuring instruments — LIDAR / precision alignment", category: "dual_use", controlReason: "CR 156/2025 Dual-Use — missile guidance applicability", effectiveAt: "2025-01-01" },
];

// Build HS-code index at module load (normalise to 4-digit prefix for fuzzy match)
const SEED_INDEX = new Map<string, ControlledGoodsEntry[]>();
for (const entry of STATIC_SEED) {
  const full = entry.hsCode.replace(/\./g, "");
  const keys = [entry.hsCode, full, full.slice(0, 6), full.slice(0, 4), full.slice(0, 2)];
  for (const k of keys) {
    const list = SEED_INDEX.get(k) ?? [];
    if (!list.includes(entry)) list.push(entry);
    SEED_INDEX.set(k, list);
  }
}

// ─── Blob store loader (runtime only) ───────────────────────────────────────

async function loadFromBlobs(hsCode: string): Promise<ControlledGoodsEntry[] | null> {
  try {
    // Dynamic import so this module remains importable outside Netlify
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("hawkeye-goods-control");
    const listIds = ["uae_156_2025", "eu_dual_use", "us_ccl"];
    const matched: ControlledGoodsEntry[] = [];
    for (const lid of listIds) {
      const raw = await store.get(`current/${lid}.json`).catch(() => null);
      if (!raw) continue;
      let entries: ControlledGoodsEntry[];
      try { entries = JSON.parse(raw) as ControlledGoodsEntry[]; }
      catch { continue; }
      const norm = hsCode.replace(/\./g, "");
      for (const e of entries) {
        const eNorm = e.hsCode.replace(/\./g, "");
        if (eNorm === norm || eNorm.startsWith(norm.slice(0, 4)) || norm.startsWith(eNorm.slice(0, 4))) {
          matched.push(e);
        }
      }
    }
    return matched.length > 0 ? matched : null;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Look up an HS code against the UAE CR 156/2025 controlled goods catalogue.
 * First attempts to read live data from the Netlify Blobs store populated by
 * goods-control-ingest.mts; falls back to the static seed.
 */
export async function lookupHsCode(hsCode: string): Promise<HsLookupResult> {
  const ts = new Date().toISOString();
  const norm = hsCode.trim().replace(/\./g, "");
  if (!norm) return { matched: false, entries: [], source: "none", lookupTs: ts };

  // Try live blob store first
  const blobHits = await loadFromBlobs(hsCode);
  if (blobHits && blobHits.length > 0) {
    return { matched: true, entries: blobHits, source: "blob", lookupTs: ts };
  }

  // Fall back to static seed
  const seedHits =
    SEED_INDEX.get(hsCode) ??
    SEED_INDEX.get(norm) ??
    SEED_INDEX.get(norm.slice(0, 6)) ??
    SEED_INDEX.get(norm.slice(0, 4)) ??
    [];

  return {
    matched: seedHits.length > 0,
    entries: seedHits,
    source: seedHits.length > 0 ? "static_seed" : "none",
    lookupTs: ts,
  };
}

/**
 * Returns the full static seed catalogue without a live blob lookup.
 * Useful for UI display and for the EOCN Control List tab category overview.
 */
export function getStaticSeed(): ControlledGoodsEntry[] {
  return STATIC_SEED;
}

/**
 * Summarise static seed by category for dashboard display.
 */
export function getStaticSeedSummary(): Record<ControlledGoodsEntry["category"], number> {
  const out: Record<ControlledGoodsEntry["category"], number> = {
    dual_use: 0, weapons_munitions: 0, chemical: 0, nuclear: 0, missile: 0, cyber_surveillance: 0,
  };
  for (const e of STATIC_SEED) out[e.category]++;
  return out;
}
