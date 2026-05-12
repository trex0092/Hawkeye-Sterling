// Sanctions list health gate for MCP tool dispatch.
//
// Tools that perform entity screening must block when critical sanctions lists
// are absent — a missing list produces false CLEAR verdicts which violates
// FDL No. 10/2025 Art. 15 and Cabinet Resolution No. 134/2025.
//
// Health is cached for CACHE_TTL_MS to avoid hammering Blobs on every call.

import type { getStore as GetStoreFn } from "@netlify/blobs";

const CRITICAL_LISTS = ["ofac_sdn", "un_consolidated", "eu_fsf"] as const;
const ALL_LISTS = [
  "ofac_sdn", "un_consolidated", "eu_fsf",
  "uk_ofsi", "uae_eocn", "uae_ltl",
] as const;

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

// Tools that must be blocked when any critical sanctions list is missing.
// These tools produce screening verdicts, risk decisions, or compliance reports
// that could result in false CLEAR outcomes if the list corpus is incomplete.
export const GATE_BLOCKED_TOOLS = new Set([
  "screen_subject",
  "batch_screen",
  "super_brain",
  "ai_decision",
  "compliance_report",
  "generate_screening_report",
  "generate_sar_report",
  "pep_profile",
  "vessel_check",
]);

// Tools explicitly allowed when lists are degraded — they don't depend on
// the sanctions corpus or they are needed to diagnose the degradation.
export const GATE_ALLOWED_TOOLS = new Set([
  "system_status",
  "sanctions_status",
  "regulatory_feed",
  "news_search",
  "transaction_anomaly",
  "get_cases",
  "audit_trail",
  "typology_match",
  "country_risk",
  "adverse_media_live",
  "domain_intel",
  "crypto_risk",
  "lei_lookup",
  "pep_network",
  "entity_graph",
  "smart_disambiguate",
  "mlro_advisor",
  "mlro_advisor_quick",
]);

export interface SanctionsHealth {
  listsVerified: boolean;
  missingCritical: string[];
  missingAll: string[];
  checkedAt: string;
}

// Module-level cache — shared across warm Lambda invocations.
let _cachedHealth: SanctionsHealth | null = null;
let _cacheTime = 0;

export async function getSanctionsHealth(): Promise<SanctionsHealth> {
  const now = Date.now();
  if (_cachedHealth && now - _cacheTime < CACHE_TTL_MS) {
    return _cachedHealth;
  }

  const checkedAt = new Date().toISOString();

  try {
    // Dynamic import to stay compatible with non-Netlify build environments.
    const mod = await import("@netlify/blobs").catch(() => null);
    if (!mod) {
      const health: SanctionsHealth = {
        listsVerified: false,
        missingCritical: [...CRITICAL_LISTS],
        missingAll: [...ALL_LISTS],
        checkedAt,
      };
      _cachedHealth = health;
      _cacheTime = now;
      return health;
    }

    const getStore = mod.getStore as typeof GetStoreFn;
    const store = getStore({ name: "hawkeye-lists" });

    const missingCritical: string[] = [];
    const missingAll: string[] = [];

    // Check all lists; treat each independently so a single failure doesn't
    // report all lists as missing.
    await Promise.allSettled(
      (ALL_LISTS as readonly string[]).map(async (listId) => {
        try {
          const meta = await store.getMetadata(listId);
          if (!meta) {
            missingAll.push(listId);
            if ((CRITICAL_LISTS as readonly string[]).includes(listId)) {
              missingCritical.push(listId);
            }
          }
        } catch {
          missingAll.push(listId);
          if ((CRITICAL_LISTS as readonly string[]).includes(listId)) {
            missingCritical.push(listId);
          }
        }
      }),
    );

    const health: SanctionsHealth = {
      listsVerified: missingCritical.length === 0,
      missingCritical,
      missingAll,
      checkedAt,
    };
    _cachedHealth = health;
    _cacheTime = now;
    return health;
  } catch {
    const health: SanctionsHealth = {
      listsVerified: false,
      missingCritical: [...CRITICAL_LISTS],
      missingAll: [...ALL_LISTS],
      checkedAt,
    };
    _cachedHealth = health;
    _cacheTime = now;
    return health;
  }
}

// Evict the cache — call after a successful list refresh so the next tool
// call immediately reflects the updated corpus.
export function evictSanctionsHealthCache(): void {
  _cachedHealth = null;
  _cacheTime = 0;
}
