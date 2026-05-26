// Hawkeye Sterling — OpenSanctions integration.
//
// Loads ~67k sanctioned entities from a Netlify Blobs key (NOT bundled —
// see why below). Builds in-memory indices once per warm Lambda instance.
// First call costs ~1s (Blob fetch + parse + index build); subsequent
// O(1) per warm instance.
//
// AML use cases unlocked:
//   - Closes audit gap on Canada OSFI + Australia DFAT (both included
//     in OpenSanctions' aggregation)
//   - Fills UAE EOCN coverage where the seed file is empty
//   - Expands sanctions matching beyond the 6 primary feeds Hawkeye
//     already ingests directly from regulators
//   - Cross-program lookup: surfaces ALL programs hitting a subject
//
// License: dataset is CC BY-NC 4.0 — see NOTICE.md alongside.
//
// IMPORTANT — why the JSON is NOT in the repo / bundle:
//   The first attempt vendored sanctions.json (47 MB) into the repo
//   with a static `import`. That broke the Next.js build outright
//   (memory + bundle-size, exit code 2 — see failed deploy c239a4f).
//   The second attempt switched to fs.readFileSync + outputFileTracing
//   Includes — that pushed the Lambda bundle past Netlify's compressed
//   size limit, so the deploy still 404'd (PR #510, no improvement).
//   Storing the JSON in Netlify Blobs keeps the bundle small and lets
//   the operator refresh data independently of code deploys.
//
// Operator workflow:
//   1. Run `scripts/refresh-opensanctions.cjs` locally to download +
//      normalize the OpenSanctions sanctions/targets.simple.csv to a
//      compact JSON (~47 MB).
//   2. POST that JSON body to /api/admin/opensanctions-import with
//      `Authorization: Bearer $ADMIN_TOKEN`. The route writes it to
//      the `hawkeye-opensanctions` Blob store.
//   3. The adapter reads the Blob on first lookup per warm Lambda.
//      Until step 2 completes, lookups return null gracefully.

const STORE_NAME = "hawkeye-opensanctions";
const BLOB_KEY = "sanctions.json";
// E-05 alignment: STORE_NAME + BLOB_KEY must match what opensanctions-datasets.ts writes.
// refreshOpenSanctionsBlob() in opensanctions-datasets.ts writes to:
//   store "hawkeye-opensanctions", key "sanctions.json" with metadata.writtenAt.
// Any change to those values must be mirrored here.
const MAX_BLOB_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — trigger background refresh if stale

// ── Types ──────────────────────────────────────────────────────────────────

export type OpenSanctionsSchema =
  | "Person" | "Organization" | "Vessel" | "Aircraft"
  | "Company" | "LegalEntity" | "Trust" | "PublicBody" | "Position"
  | "CryptoWallet" | "Security" | "Airplane";

export interface OpenSanctionsRecord {
  id: string;
  schema: string;
  name: string;
  aliases?: string[];
  birthDate?: string;
  countries?: string[];
  identifiers?: string[];
  sanctions?: string[];
  programIds?: string[];
  datasets?: string[];
  lastChange?: string;
}

export interface OpenSanctionsRiskSignals {
  sanctioned: true;
  regimeCount: number;
  cahraNexus: boolean;
  usOfac: boolean;
  un: boolean;
  eu: boolean;
  uk: boolean;
}

const CAHRA_ISO2: ReadonlySet<string> = new Set([
  "ir", "ru", "kp", "sy", "sd", "af", "by", "cu", "mm", "ve", "ye", "lb", "iq", "ly", "ss",
]);

// ── Blobs-backed dataset load ─────────────────────────────────────────────

let _records: OpenSanctionsRecord[] | null = null;
let _loadAttempted = false;
let _loadError: string | null = null;
let _loadInFlight: Promise<OpenSanctionsRecord[]> | null = null;
let _refreshTriggered = false;

async function loadFromBlobs(): Promise<OpenSanctionsRecord[]> {
  if (_records !== null) return _records;
  if (_loadInFlight) return _loadInFlight;
  if (_loadAttempted) return [];
  _loadAttempted = true;
  _loadInFlight = _doLoadFromBlobs().finally(() => { _loadInFlight = null; });
  return _loadInFlight;
}

/** Trigger a background refresh of the OpenSanctions blob. Fire-and-forget —
 *  must not block the response path. Only triggered once per warm Lambda instance. */
function triggerBackgroundRefresh(reason: string): void {
  if (_refreshTriggered) return;
  _refreshTriggered = true;
  void (async () => {
    try {
      const { refreshOpenSanctionsBlob } = await import("./opensanctions-datasets.js");
      console.warn(
        JSON.stringify({
          level: "warn",
          route: "openSanctions",
          event: "opensanctions.degraded_mode",
          detail: reason,
          action: "background_refresh_triggered",
          _msg: `[hawkeye] warn openSanctions opensanctions.degraded_mode ${reason} — background refresh started`,
        }),
      );
      const result = await refreshOpenSanctionsBlob();
      if (result.ok) {
        // Invalidate the in-process cache so the next request picks up fresh data.
        _records = null;
        _loadAttempted = false;
        _byId = null;
        _byNameLower = null;
        _byIdentifier = null;
        _byCountry = null;
        console.warn(
          JSON.stringify({
            level: "warn",
            route: "openSanctions",
            event: "opensanctions.background_refresh_complete",
            detail: `${result.totalRecords} records written`,
            _msg: `[hawkeye] warn openSanctions opensanctions.background_refresh_complete ${result.totalRecords} records`,
          }),
        );
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          route: "openSanctions",
          event: "opensanctions.background_refresh_failed",
          detail: err instanceof Error ? err.message : String(err),
          _msg: `[hawkeye] warn openSanctions opensanctions.background_refresh_failed`,
        }),
      );
    }
  })().catch(() => undefined);
}

async function _doLoadFromBlobs(): Promise<OpenSanctionsRecord[]> {

  let mod: typeof import("@netlify/blobs") | null = null;
  try {
    mod = await import("@netlify/blobs");
  } catch (err) {
    _loadError = `@netlify/blobs unavailable — ${err instanceof Error ? err.message : String(err)}`;
    console.warn(
      JSON.stringify({
        level: "warn",
        route: "openSanctions",
        event: "opensanctions.degraded_mode",
        detail: _loadError,
        _msg: `[hawkeye] warn openSanctions opensanctions.degraded_mode blobs_unavailable — screening against empty OpenSanctions index`,
      }),
    );
    _records = [];
    return _records;
  }

  try {
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token =
      process.env["NETLIFY_BLOBS_TOKEN"] ??
      process.env["NETLIFY_API_TOKEN"] ??
      process.env["NETLIFY_AUTH_TOKEN"];
    const opts: { name: string; siteID?: string; token?: string; consistency: "strong" } = {
      name: STORE_NAME,
      consistency: "strong",
    };
    if (siteID) opts.siteID = siteID;
    if (token) opts.token = token;
    const store = mod.getStore(opts);

    // Use getWithMetadata to also retrieve writtenAt for freshness check.
    const result = await store.getWithMetadata(BLOB_KEY, { type: "json" }) as {
      data: OpenSanctionsRecord[] | null;
      metadata: Record<string, unknown>;
    } | null;

    if (result && Array.isArray(result.data) && result.data.length > 0) {
      _records = result.data;

      // Freshness check: trigger a background refresh if data is older than 24h.
      const writtenAt = typeof result.metadata?.["writtenAt"] === "string"
        ? new Date(result.metadata["writtenAt"]).getTime()
        : null;
      if (writtenAt !== null && Date.now() - writtenAt > MAX_BLOB_AGE_MS) {
        const ageHours = Math.round((Date.now() - writtenAt) / (60 * 60 * 1000));
        triggerBackgroundRefresh(`blob_stale (${ageHours}h old, threshold 24h)`);
      }

      return _records;
    }

    // Blob is missing or empty — operating in degraded mode.
    _loadError = "OpenSanctions blob missing or empty — operating in degraded mode. Screening will not match OpenSanctions entities until the blob is populated by the opensanctions-refresh scheduled function.";
    console.warn(
      JSON.stringify({
        level: "warn",
        route: "openSanctions",
        event: "opensanctions.degraded_mode",
        detail: _loadError,
        action: "background_refresh_triggered",
        _msg: `[hawkeye] warn openSanctions opensanctions.degraded_mode blob_missing — screening against empty OpenSanctions index`,
      }),
    );
    triggerBackgroundRefresh("blob_missing");
    _records = [];
    return _records;
  } catch (err) {
    _loadError = `Blobs read failed — ${err instanceof Error ? err.message : String(err)}`;
    console.warn(
      JSON.stringify({
        level: "warn",
        route: "openSanctions",
        event: "opensanctions.degraded_mode",
        detail: _loadError,
        _msg: `[hawkeye] warn openSanctions opensanctions.degraded_mode blobs_read_error — screening against empty OpenSanctions index`,
      }),
    );
    _records = [];
    return _records;
  }
}

// ── Lazy index construction (over the loaded records) ─────────────────────

let _byId: Map<string, OpenSanctionsRecord> | null = null;
let _byNameLower: Map<string, OpenSanctionsRecord[]> | null = null;
let _byIdentifier: Map<string, OpenSanctionsRecord> | null = null;
let _byCountry: Map<string, OpenSanctionsRecord[]> | null = null;

async function buildIndices(): Promise<void> {
  if (_byId !== null) return;

  const records = await loadFromBlobs();

  const byId = new Map<string, OpenSanctionsRecord>();
  const byName = new Map<string, OpenSanctionsRecord[]>();
  const byIdentifier = new Map<string, OpenSanctionsRecord>();
  const byCountry = new Map<string, OpenSanctionsRecord[]>();

  for (const r of records) {
    if (!r.id || !r.name) continue;
    byId.set(r.id, r);

    const indexName = (n: string) => {
      const k = n.toLowerCase().trim();
      if (!k) return;
      const list = byName.get(k);
      if (list) list.push(r);
      else byName.set(k, [r]);
    };
    indexName(r.name);
    if (r.aliases) for (const a of r.aliases) indexName(a);

    if (r.identifiers) {
      for (const ident of r.identifiers) {
        const k = ident.replace(/\s+/g, "").toUpperCase();
        if (k) byIdentifier.set(k, r);
      }
    }

    if (r.countries) {
      for (const c of r.countries) {
        const k = c.toLowerCase();
        const list = byCountry.get(k);
        if (list) list.push(r);
        else byCountry.set(k, [r]);
      }
    }
  }

  _byId = byId;
  _byNameLower = byName;
  _byIdentifier = byIdentifier;
  _byCountry = byCountry;
}

// ── Public lookup API ──────────────────────────────────────────────────────

export async function lookupById(id: string): Promise<OpenSanctionsRecord | null> {
  if (!id) return null;
  await buildIndices();
  return _byId!.get(id) ?? null;
}

export async function lookupByName(name: string): Promise<OpenSanctionsRecord[]> {
  if (!name) return [];
  await buildIndices();
  return _byNameLower!.get(name.toLowerCase().trim()) ?? [];
}

export async function lookupByIdentifier(identifier: string): Promise<OpenSanctionsRecord | null> {
  if (!identifier) return null;
  await buildIndices();
  const k = identifier.replace(/\s+/g, "").toUpperCase();
  return _byIdentifier!.get(k) ?? null;
}

export async function lookupByCountry(iso2: string): Promise<OpenSanctionsRecord[]> {
  if (!iso2) return [];
  await buildIndices();
  return _byCountry!.get(iso2.toLowerCase()) ?? [];
}

// ── Risk signal derivation ─────────────────────────────────────────────────

export function deriveRiskSignals(r: OpenSanctionsRecord): OpenSanctionsRiskSignals {
  const datasets = r.datasets ?? [];
  const programIds = r.programIds ?? [];
  const countries = r.countries ?? [];
  const datasetsJoined = datasets.join(" | ").toLowerCase();

  return {
    sanctioned: true,
    regimeCount: datasets.length,
    cahraNexus: countries.some(c => CAHRA_ISO2.has(c.toLowerCase())),
    usOfac: datasetsJoined.includes("ofac") || programIds.some(p => p.startsWith("US-")),
    un: datasetsJoined.includes("un security") || datasetsJoined.includes("united nations"),
    eu: datasetsJoined.includes("eu consolidated") || datasetsJoined.includes("european union"),
    uk: datasetsJoined.includes("hm treasury") || datasetsJoined.includes("ofsi"),
  };
}

// ── Convenience: enrich a screening subject ────────────────────────────────

export interface OpenSanctionsEnrichment {
  match: OpenSanctionsRecord | null;
  matchedBy: "identifier" | "name" | null;
  allNameMatches: OpenSanctionsRecord[];
  signals: OpenSanctionsRiskSignals | null;
}

export async function enrichSubject(input: {
  name?: string;
  identifier?: string;
  id?: string;
}): Promise<OpenSanctionsEnrichment> {
  let match: OpenSanctionsRecord | null = null;
  let matchedBy: OpenSanctionsEnrichment["matchedBy"] = null;
  let allNameMatches: OpenSanctionsRecord[] = [];

  if (input.id) {
    match = await lookupById(input.id);
  }
  if (!match && input.identifier) {
    match = await lookupByIdentifier(input.identifier);
    if (match) matchedBy = "identifier";
  }
  if (input.name) {
    allNameMatches = await lookupByName(input.name);
    if (!match && allNameMatches.length > 0) {
      match = allNameMatches[0]!;
      matchedBy = "name";
    }
  }

  return {
    match,
    matchedBy,
    allNameMatches,
    signals: match ? deriveRiskSignals(match) : null,
  };
}

// ── Stats ──────────────────────────────────────────────────────────────────

export async function openSanctionsStats(): Promise<{
  total: number;
  persons: number;
  organizations: number;
  vessels: number;
  withAliases: number;
  withIdentifiers: number;
  uniqueDatasets: number;
  source: "blobs" | "missing";
  loadError: string | null;
}> {
  await buildIndices();
  const records = await loadFromBlobs();
  const datasetSet = new Set<string>();
  for (const r of records) {
    if (r.datasets) for (const d of r.datasets) datasetSet.add(d);
  }
  return {
    total: records.length,
    persons: records.filter(r => r.schema === "Person").length,
    organizations: records.filter(r => r.schema === "Organization").length,
    vessels: records.filter(r => r.schema === "Vessel").length,
    withAliases: records.filter(r => r.aliases && r.aliases.length > 0).length,
    withIdentifiers: records.filter(r => r.identifiers && r.identifiers.length > 0).length,
    uniqueDatasets: datasetSet.size,
    source: records.length > 0 ? "blobs" : "missing",
    loadError: _loadError,
  };
}
