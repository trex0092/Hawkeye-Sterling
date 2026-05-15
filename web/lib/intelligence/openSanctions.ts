// Hawkeye Sterling — OpenSanctions integration.
//
// Wraps the vendored OpenSanctions consolidated sanctions dataset
// (`web/lib/data/opensanctions/sanctions.json`, ~67k entities across UN /
// US OFAC / EU / UK / Canada OSFI / Australia DFAT / UAE EOCN / etc.)
// into name / identifier / country lookups usable by the screening
// pipeline. Builds in-memory indices once per warm Lambda instance —
// first call costs ~600 ms (parsing the 47 MB JSON), subsequent O(1).
//
// AML use cases unlocked:
//   - Closes the audit gap on Canada OSFI + Australia DFAT (both
//     covered by OpenSanctions' aggregation)
//   - Fills UAE EOCN coverage where the seed file is empty
//   - Expands sanctions matching beyond the 6 primary feeds Hawkeye
//     already ingests directly from regulators
//   - Cross-program lookup: if a name appears on multiple regimes,
//     the response shows ALL programs (not just the first match)
//
// License: vendored data is CC BY-NC 4.0 — see NOTICE.md alongside.
//
// IMPORTANT: the JSON file is loaded at RUNTIME via fs.readFileSync, not
// `import`-ed statically. A static import of a 48 MB JSON file blew up
// the Next.js build (memory + bundle-size, exit code 2 — see deploy
// failure on c239a4f). Runtime load reads the file on first call inside
// the warm Lambda — ~600 ms one-time cost, then O(1). The file ships
// with the Lambda bundle via `outputFileTracingIncludes` in
// `web/next.config.mjs` for `/api/**/*` routes.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Types ──────────────────────────────────────────────────────────────────

export type OpenSanctionsSchema =
  | "Person" | "Organization" | "Vessel" | "Aircraft"
  | "Company" | "LegalEntity" | "Trust" | "PublicBody" | "Position"
  | "CryptoWallet" | "Security" | "Airplane";

export interface OpenSanctionsRecord {
  id: string;
  schema: string;          // OpenSanctionsSchema, but kept loose for forward-compat
  name: string;
  aliases?: string[];
  birthDate?: string;      // ISO date or year-only
  countries?: string[];    // ISO-2 lowercase
  identifiers?: string[];  // passport / company-reg / IMO / etc.
  sanctions?: string[];    // human-readable program descriptions
  programIds?: string[];   // canonical program codes (US-GLOMAG, EU-FSF-RUS, ...)
  datasets?: string[];     // originating sources
  lastChange?: string;     // ISO timestamp
}

/** Risk signals derived from a matched sanctioned entity. */
export interface OpenSanctionsRiskSignals {
  /** Subject is sanctioned by ≥1 regime — always true for any match. */
  sanctioned: true;
  /** Number of distinct sanctions regimes hitting this subject. */
  regimeCount: number;
  /** Subject is on a CAHRA-jurisdiction sanctions program. */
  cahraNexus: boolean;
  /** Subject is sanctioned by US OFAC (highest-priority for USD-denominated transactions). */
  usOfac: boolean;
  /** Subject is on the UN Security Council Consolidated List. */
  un: boolean;
  /** Subject is on EU consolidated. */
  eu: boolean;
  /** Subject is on UK OFSI. */
  uk: boolean;
}

const CAHRA_ISO2: ReadonlySet<string> = new Set([
  "ir", "ru", "kp", "sy", "sd", "af", "by", "cu", "mm", "ve", "ye", "lb", "iq", "ly", "ss",
]);

// ── Runtime dataset load ───────────────────────────────────────────────────

// Resolve the JSON path at first use. We try several candidate locations
// because the cwd inside a Netlify Lambda depends on Next.js' output layout
// (standalone vs default) and outputFileTracingRoot setting. First match wins.
let _records: OpenSanctionsRecord[] | null = null;
let _loadError: string | null = null;

function candidatePaths(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    // Same source-tree layout — works when traced files preserve relative paths.
    path.join(here, "..", "data", "opensanctions", "sanctions.json"),
    // Lambda cwd is the web/ project root (Next.js default).
    path.join(process.cwd(), "lib", "data", "opensanctions", "sanctions.json"),
    // Lambda cwd is the repo root (outputFileTracingRoot = repo root in this app).
    path.join(process.cwd(), "web", "lib", "data", "opensanctions", "sanctions.json"),
  ];
}

function loadRecords(): OpenSanctionsRecord[] {
  if (_records !== null) return _records;

  for (const candidate of candidatePaths()) {
    try {
      if (!existsSync(candidate)) continue;
      const raw = readFileSync(candidate, "utf-8");
      const parsed = JSON.parse(raw) as OpenSanctionsRecord[];
      if (Array.isArray(parsed)) {
        _records = parsed;
        return _records;
      }
    } catch (err) {
      _loadError = err instanceof Error ? err.message : String(err);
    }
  }

  // Degraded mode: file is missing from the bundle. Log once, return empty.
  // The route layer surfaces this as "no OpenSanctions matches found" rather
  // than throwing — screening still proceeds against the 6 primary feeds.
  if (!_loadError) {
    _loadError = `sanctions.json not found in any candidate path: ${candidatePaths().join(", ")}`;
  }
  console.warn("[openSanctions] dataset unavailable — degrading to empty index:", _loadError);
  _records = [];
  return _records;
}

// ── Lazy index construction ────────────────────────────────────────────────

let _byId: Map<string, OpenSanctionsRecord> | null = null;
let _byNameLower: Map<string, OpenSanctionsRecord[]> | null = null;
let _byIdentifier: Map<string, OpenSanctionsRecord> | null = null;
let _byCountry: Map<string, OpenSanctionsRecord[]> | null = null;

function buildIndices(): void {
  if (_byId !== null) return;

  const byId = new Map<string, OpenSanctionsRecord>();
  const byName = new Map<string, OpenSanctionsRecord[]>();
  const byIdentifier = new Map<string, OpenSanctionsRecord>();
  const byCountry = new Map<string, OpenSanctionsRecord[]>();

  const records = loadRecords();
  for (const r of records) {
    if (!r.id || !r.name) continue;
    byId.set(r.id, r);

    // Index primary name + every alias under lowercase normalised key.
    // OpenSanctions consolidates duplicates across feeds, but the same
    // person can still appear under variant transliterations across
    // datasets, so keep the value as an array.
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

export function lookupById(id: string): OpenSanctionsRecord | null {
  if (!id) return null;
  buildIndices();
  return _byId!.get(id) ?? null;
}

/** Returns ALL records matching this name across feeds (often 0 or 1; can be >1 for shared names). */
export function lookupByName(name: string): OpenSanctionsRecord[] {
  if (!name) return [];
  buildIndices();
  return _byNameLower!.get(name.toLowerCase().trim()) ?? [];
}

/** Lookup by passport / company-reg / IMO / etc. Returns one record. */
export function lookupByIdentifier(identifier: string): OpenSanctionsRecord | null {
  if (!identifier) return null;
  buildIndices();
  const k = identifier.replace(/\s+/g, "").toUpperCase();
  return _byIdentifier!.get(k) ?? null;
}

/** All sanctioned entities tied to a given country (ISO-2 lowercase). */
export function lookupByCountry(iso2: string): OpenSanctionsRecord[] {
  if (!iso2) return [];
  buildIndices();
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
  /** Best matched record (highest-precedence: identifier > name). */
  match: OpenSanctionsRecord | null;
  /** How the match was made. */
  matchedBy: "identifier" | "name" | null;
  /** All matched records when looked up by name (often more than one for common names). */
  allNameMatches: OpenSanctionsRecord[];
  /** Risk signals derived from the best match. */
  signals: OpenSanctionsRiskSignals | null;
}

export function enrichSubject(input: {
  name?: string;
  identifier?: string;
  id?: string;
}): OpenSanctionsEnrichment {
  let match: OpenSanctionsRecord | null = null;
  let matchedBy: OpenSanctionsEnrichment["matchedBy"] = null;
  let allNameMatches: OpenSanctionsRecord[] = [];

  if (input.id) {
    match = lookupById(input.id);
  }
  if (!match && input.identifier) {
    match = lookupByIdentifier(input.identifier);
    if (match) matchedBy = "identifier";
  }
  if (input.name) {
    allNameMatches = lookupByName(input.name);
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

// ── Stats (for /api/status surfacing) ──────────────────────────────────────

export function openSanctionsStats(): {
  total: number;
  persons: number;
  organizations: number;
  vessels: number;
  withAliases: number;
  withIdentifiers: number;
  uniqueDatasets: number;
} {
  buildIndices();
  const records = loadRecords();
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
  };
}
