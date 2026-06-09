// Hawkeye Sterling — Sanctions List Freshness SLA Module
//
// Defines per-list staleness thresholds (warning / critical), minimum
// expected entity counts for truncation detection, corpus hash computation
// for genuine-update detection, and a structured alert generator.
//
// Used by /api/sanctions/status and /api/system-status to produce
// operator-actionable alerts that are differentiated by list criticality.
//
// Per-list SLA rationale:
//   · OFAC SDN / OpenSanctions — OFAC publishes daily; 24h warning / 48h critical
//   · UN 1267 / EU Consolidated  — published weekly but update cadence can spike;
//     48h warning / 72h critical is defensible for UAE FDL Art.20 compliance.
//   · UAE EOCN — highest-criticality for this deployment's UAE licence; 12h / 24h.
//   · All other lists default to the legacy 36h stale / 48h critical thresholds.
//
// Privacy: this module contains no PII. Only structural metadata.

import { createHash } from "node:crypto";

// ─── Freshness SLA definitions ────────────────────────────────────────────────

export interface FreshnessSla {
  /** listId matching SOURCE_ADAPTERS / ADAPTERS */
  listId: string;
  /** Hours of staleness that trigger a WARNING alert */
  warningHours: number;
  /** Hours of staleness that trigger a CRITICAL alert */
  criticalHours: number;
  /**
   * Minimum number of entities expected after a full, successful ingest.
   * If actualEntities < minEntities, raise a CRITICAL truncation alert.
   * Omit for lists where entity count is legitimately variable or unknown.
   */
  minEntities?: number;
}

/**
 * Per-list freshness SLAs.
 *
 * Lists not mentioned here fall back to FRESHNESS_SLA_DEFAULT.
 */
export const FRESHNESS_SLAS: readonly FreshnessSla[] = [
  // UAE EOCN — most critical for Federal Decree-Law No. 10 of 2025 Art.20 compliance.
  { listId: "uae_eocn",        warningHours: 12, criticalHours: 24 },
  { listId: "uae_ltl",         warningHours: 12, criticalHours: 24 },
  { listId: "lseg_uae_eocn",   warningHours: 12, criticalHours: 24 },
  { listId: "lseg_uae_ltl",    warningHours: 12, criticalHours: 24 },

  // OFAC SDN — daily publication; tight SLA.
  { listId: "ofac_sdn",        warningHours: 24, criticalHours: 48, minEntities: 12_000 },
  { listId: "lseg_ofac_sdn",   warningHours: 24, criticalHours: 48, minEntities: 12_000 },

  // OpenSanctions — aggregated, daily; same cadence as OFAC SDN.
  { listId: "opensanctions",   warningHours: 24, criticalHours: 48 },

  // UN 1267 Consolidated — Security Council updates are less frequent
  // but geopolitically critical; 48h / 72h.
  { listId: "un_consolidated",      warningHours: 48, criticalHours: 72, minEntities: 500 },
  { listId: "lseg_un_consolidated", warningHours: 48, criticalHours: 72, minEntities: 500 },

  // EU Financial Sanctions — weekly batch from webgate.ec.europa.eu.
  { listId: "eu_fsf",          warningHours: 48, criticalHours: 72, minEntities: 2_000 },
  { listId: "lseg_eu_fsf",     warningHours: 48, criticalHours: 72, minEntities: 2_000 },
];

/** Fallback SLA for lists without a specific entry. */
export const FRESHNESS_SLA_DEFAULT: Omit<FreshnessSla, "listId"> = {
  warningHours: 36,
  criticalHours: 48,
};

const SLA_BY_LIST_ID = new Map<string, FreshnessSla>(
  FRESHNESS_SLAS.map((s) => [s.listId, s]),
);

export function getSla(listId: string): FreshnessSla {
  return SLA_BY_LIST_ID.get(listId) ?? { listId, ...FRESHNESS_SLA_DEFAULT };
}

// ─── Alert level ──────────────────────────────────────────────────────────────

export type AlertLevel = "ok" | "warning" | "critical";

export interface ListAlert {
  listId: string;
  alertLevel: AlertLevel;
  reason: string;
  stalenessHours: number | null;
  expectedMinEntities?: number;
  actualEntities?: number;
}

/**
 * Compute the alert level and reason for a single list based on its current
 * staleness and entity count. Returns null if the list is unconfigured (no
 * alert warranted — unconfigured status is informational, not an SLA breach).
 */
export function computeListAlert(opts: {
  listId: string;
  ageHours: number | null;
  entityCount: number | null;
  status: string;
  configured: boolean;
  present: boolean;
}): ListAlert | null {
  const { listId, ageHours, entityCount, status, configured, present } = opts;

  // Unconfigured lists don't generate alerts — they are intentionally absent.
  if (!configured || status === "unconfigured") return null;

  const sla = getSla(listId);

  // Missing from blob storage → always critical.
  if (!present || status === "missing") {
    return {
      listId,
      alertLevel: "critical",
      reason: "List is missing from blob storage — no snapshot available for screening.",
      stalenessHours: null,
    };
  }

  // Entity count below minimum → critical (truncated download / parser regression).
  if (
    sla.minEntities !== undefined &&
    entityCount !== null &&
    entityCount < sla.minEntities
  ) {
    return {
      listId,
      alertLevel: "critical",
      reason: `Entity count ${entityCount} is below the minimum expected ${sla.minEntities} — possible truncated download or parser regression.`,
      stalenessHours: ageHours,
      expectedMinEntities: sla.minEntities,
      actualEntities: entityCount,
    };
  }

  // Staleness checks.
  if (ageHours !== null) {
    if (ageHours >= sla.criticalHours) {
      return {
        listId,
        alertLevel: "critical",
        reason: `List is ${ageHours.toFixed(1)}h stale — exceeds the ${sla.criticalHours}h critical SLA threshold.`,
        stalenessHours: ageHours,
        ...(sla.minEntities !== undefined ? { expectedMinEntities: sla.minEntities } : {}),
        ...(entityCount !== null ? { actualEntities: entityCount } : {}),
      };
    }
    if (ageHours >= sla.warningHours) {
      return {
        listId,
        alertLevel: "warning",
        reason: `List is ${ageHours.toFixed(1)}h stale — exceeds the ${sla.warningHours}h warning SLA threshold (critical at ${sla.criticalHours}h).`,
        stalenessHours: ageHours,
        ...(sla.minEntities !== undefined ? { expectedMinEntities: sla.minEntities } : {}),
        ...(entityCount !== null ? { actualEntities: entityCount } : {}),
      };
    }
  }

  // Degraded means blob present but zero entities (unexpected for a hardcoded-URL adapter).
  if (status === "degraded") {
    return {
      listId,
      alertLevel: "critical",
      reason: "Blob is present but contains zero entities — likely a parser or upstream feed regression.",
      stalenessHours: ageHours,
      actualEntities: 0,
    };
  }

  // All clear.
  return {
    listId,
    alertLevel: "ok",
    reason: "Within SLA thresholds.",
    stalenessHours: ageHours,
    ...(entityCount !== null ? { actualEntities: entityCount } : {}),
  };
}

/**
 * Compute the list of active alerts across all provided list states.
 * Returns only warning and critical items (sorted: critical first, then
 * by staleness descending) unless `includeOk` is true.
 */
export function computeActiveAlerts(
  lists: Array<{
    listId: string;
    ageHours: number | null;
    entityCount: number | null;
    status: string;
    configured: boolean;
    present: boolean;
  }>,
  includeOk = false,
): ListAlert[] {
  const alerts: ListAlert[] = [];
  for (const l of lists) {
    const alert = computeListAlert(l);
    if (!alert) continue;
    if (!includeOk && alert.alertLevel === "ok") continue;
    alerts.push(alert);
  }
  // Sort: critical first, then warning, then by staleness descending.
  alerts.sort((a, b) => {
    const levelOrder = { critical: 0, warning: 1, ok: 2 } as const;
    const la = levelOrder[a.alertLevel];
    const lb = levelOrder[b.alertLevel];
    if (la !== lb) return la - lb;
    return (b.stalenessHours ?? 0) - (a.stalenessHours ?? 0);
  });
  return alerts;
}

// ─── Corpus hash ──────────────────────────────────────────────────────────────

export interface CorpusHashInput {
  listId: string;
  entityCount: number | null;
  lastModified: string | null;
}

/**
 * Compute a SHA-256 hash of the concatenated list metadata
 * (listId + entityCount + lastModified) across all provided lists.
 *
 * If the hash changes between checks, the corpus has genuinely changed.
 * If the hash is the same, report "no change" to suppress noisy refreshes.
 *
 * Lists are sorted by listId before hashing so insertion order doesn't matter.
 */
export function computeCorpusHash(lists: readonly CorpusHashInput[]): string {
  const sorted = [...lists].sort((a, b) => a.listId.localeCompare(b.listId));
  const payload = sorted
    .map(
      (l) =>
        `${l.listId}|${l.entityCount ?? "null"}|${l.lastModified ?? "null"}`,
    )
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

// ─── Last successful ingest tracking ──────────────────────────────────────────

export const INGEST_TIMESTAMP_STORE = "hawkeye-list-ingest-meta";
export const INGEST_TIMESTAMP_KEY = "last-successful-ingest.json";

export interface LastIngestTimestamps {
  /** ISO timestamp of the last successful full-corpus ingest run */
  lastFullIngestAt: string | null;
  /** Per-list ISO timestamps of the last time each list completed successfully */
  perList: Record<string, string>;
  /** ISO timestamp when this record was last written */
  updatedAt: string;
}

/**
 * Load the last-ingest timestamps from Netlify Blobs.
 * Returns null if the store is unavailable or the key doesn't exist yet.
 */
export async function loadLastIngestTimestamps(
  store: IngestMetaStore | null,
): Promise<LastIngestTimestamps | null> {
  if (!store) return null;
  try {
    const raw = await store.get(INGEST_TIMESTAMP_KEY, { type: "json" });
    return (raw as LastIngestTimestamps | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist a per-list last-ingest timestamp after a successful ingest.
 * Merges with any existing timestamps to avoid overwriting other lists.
 */
export async function recordSuccessfulIngest(
  store: IngestMetaStore,
  listId: string,
  at: string,
): Promise<void> {
  let existing: LastIngestTimestamps = {
    lastFullIngestAt: null,
    perList: {},
    updatedAt: new Date().toISOString(),
  };
  try {
    const raw = await store.get(INGEST_TIMESTAMP_KEY, { type: "json" });
    if (raw) existing = raw as LastIngestTimestamps;
  } catch {
    // Start fresh.
  }
  existing.perList[listId] = at;
  existing.updatedAt = new Date().toISOString();
  try {
    await (store as RawIngestMetaStore).setJSON(INGEST_TIMESTAMP_KEY, existing);
  } catch {
    // Best-effort — never block the ingest on a metadata write failure.
  }
}

/**
 * Mark a full-corpus ingest run as completed successfully.
 */
export async function recordFullIngestComplete(
  store: IngestMetaStore,
  at: string,
): Promise<void> {
  let existing: LastIngestTimestamps = {
    lastFullIngestAt: null,
    perList: {},
    updatedAt: new Date().toISOString(),
  };
  try {
    const raw = await store.get(INGEST_TIMESTAMP_KEY, { type: "json" });
    if (raw) existing = raw as LastIngestTimestamps;
  } catch {
    // Start fresh.
  }
  existing.lastFullIngestAt = at;
  existing.updatedAt = new Date().toISOString();
  try {
    await (store as RawIngestMetaStore).setJSON(INGEST_TIMESTAMP_KEY, existing);
  } catch {
    // Best-effort.
  }
}

// ─── Ingest meta store interface ──────────────────────────────────────────────

export interface IngestMetaStore {
  get: (_key: string, _opts?: { type?: string }) => Promise<unknown>;
}

// Internal — setJSON is available on Netlify Blob store handles but not
// in our minimal public interface; we cast to this where needed.
interface RawIngestMetaStore extends IngestMetaStore {
  setJSON: (_key: string, _value: unknown) => Promise<void>;
}

/**
 * Build an IngestMetaStore from @netlify/blobs, or return null if unavailable.
 */
export async function loadIngestMetaStore(): Promise<IngestMetaStore | null> {
  let mod: {
    getStore: (_opts: {
      name: string;
      siteID?: string;
      token?: string;
      consistency?: string;
    }) => IngestMetaStore;
  };
  try {
    mod = (await import("@netlify/blobs")) as unknown as typeof mod;
  } catch {
    return null;
  }
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  const opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: string;
  } =
    siteID && token
      ? { name: INGEST_TIMESTAMP_STORE, siteID, token, consistency: "strong" }
      : { name: INGEST_TIMESTAMP_STORE };
  try {
    return mod.getStore(opts);
  } catch {
    return null;
  }
}
