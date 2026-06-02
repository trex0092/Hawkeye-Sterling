// Configurable list weight table.
// Weights drive the totalWeightedScore composite in quickScreen().
// Higher = more consequential for the UAE AML/CFT regulatory framework.
//
// Operators can override individual weights without a code deploy via:
//   SCREENING_LIST_WEIGHT_OVERRIDES='{"ofac_sdn":45,"uae_eocn":50}'
//
// FDL 10/2025 Art.18: weight changes that materially alter verdict outputs
// must be documented, audited, and MLRO-signed before going live.

const BASE_WEIGHTS: Record<string, number> = {
  un_consolidated: 40,
  un_1267:         40,
  ofac_sdn:        38,
  ofac_cons:       30,
  uae_eocn:        40,
  uae_ltl:         35,
  eu_fsf:          25,
  uk_ofsi:         22,
  ca_osfi:         20,
  ch_seco:         20,
  au_dfat:         20,
  jp_mof:          15,
};

const DEFAULT_LIST_WEIGHT = 10;

let _weights: Record<string, number> | null = null;

function buildWeights(): Record<string, number> {
  const result = { ...BASE_WEIGHTS };
  const raw = process.env["SCREENING_LIST_WEIGHT_OVERRIDES"];
  if (raw) {
    try {
      const overrides = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(overrides)) {
        if (typeof v === "number" && isFinite(v) && v >= 1 && v <= 100) {
          result[k] = v;
        }
      }
    } catch {
      // malformed JSON — silently use defaults
    }
  }
  return result;
}

export function getListWeights(): Record<string, number> {
  if (!_weights) _weights = buildWeights();
  return _weights;
}

export function getListWeight(listId: string): number {
  return getListWeights()[listId] ?? DEFAULT_LIST_WEIGHT;
}

/** Reload from env (tests / hot-reload). */
export function clearListWeightCache(): void {
  _weights = null;
}
