// OpenSanctions per-dataset fetcher.
//
// Pulls one or more `targets.simple.json` files directly from
// data.opensanctions.org, normalises into the OpenSanctionsRecord shape,
// merges, and writes the consolidated array to the
// `hawkeye-opensanctions` Netlify Blobs store under `sanctions.json`.
// The web/lib/intelligence/openSanctions.ts adapter reads from that
// blob on first lookup per warm Lambda.
//
// Why per-dataset instead of the 47 MB monolith:
//   - Each `targets.simple.json` is small (kilobytes to a few MB) so
//     the fetch + parse fits inside a Netlify Function budget.
//   - You only pay for the datasets you actually care about
//     (jurisdiction-relevant lists), keeping total Blob size small.
//   - Refresh can run on a Netlify scheduled function — no operator
//     action required after deploy.
//
// License note: OpenSanctions raw data is CC-BY-NC 4.0 — strictly
// non-commercial use. For production commercial AML use, switch to
// their hosted Match API (paid, commercial-licensed) by setting
// `OPENSANCTIONS_API_KEY` and pointing the screening pipeline at
// api.opensanctions.org instead. This file is the non-commercial
// bulk path.

const OPENSANCTIONS_BASE = "https://data.opensanctions.org/datasets/latest";
const FETCH_TIMEOUT_MS = 20_000;

// Default dataset list — start small with UAE-relevant lists. Operators
// can override or extend via the `OPENSANCTIONS_DATASETS` env var
// (comma-separated dataset IDs). Each ID is the slug from the OpenSanctions
// dataset URL — e.g. `ae_local_terrorists` from
// https://data.opensanctions.org/datasets/latest/ae_local_terrorists/.
const DEFAULT_DATASETS = [
  "ae_local_terrorists", // UAE Local Terrorist List — fills the existing UAE EOCN gap
];

export function resolveDatasetList(): string[] {
  const env = process.env["OPENSANCTIONS_DATASETS"];
  if (!env) return DEFAULT_DATASETS;
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

// OpenSanctions `targets.simple.json` record shape. Subset of the full
// FtM model — sufficient for our screening matcher.
interface RawTargetSimple {
  id?: string;
  schema?: string;
  name?: string;
  aliases?: string | string[];
  birth_date?: string;
  countries?: string | string[];
  identifiers?: string | string[];
  sanctions?: string | string[];
  programs?: string | string[];
  datasets?: string | string[];
  last_change?: string;
}

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

// `targets.simple.json` returns arrays as semicolon-separated strings in some
// older exports; newer ones return arrays directly. Normalise to arrays.
function asArray(v: string | string[] | undefined): string[] | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim().length > 0);
  const parts = v.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function normaliseRecord(raw: RawTargetSimple, datasetId: string): OpenSanctionsRecord | null {
  if (!raw.id || !raw.name) return null;
  const rec: OpenSanctionsRecord = {
    id: raw.id,
    schema: raw.schema ?? "LegalEntity",
    name: raw.name,
  };
  const aliases = asArray(raw.aliases);
  if (aliases) rec.aliases = aliases;
  if (raw.birth_date) rec.birthDate = raw.birth_date;
  const countries = asArray(raw.countries);
  if (countries) rec.countries = countries.map((c) => c.toLowerCase());
  const identifiers = asArray(raw.identifiers);
  if (identifiers) rec.identifiers = identifiers;
  const sanctions = asArray(raw.sanctions);
  if (sanctions) rec.sanctions = sanctions;
  const programs = asArray(raw.programs);
  if (programs) rec.programIds = programs;
  // Always tag the originating dataset id so multi-source matching can show
  // the operator which feeds hit. If the raw record already lists datasets,
  // union them with the source we fetched from.
  const datasets = new Set<string>([datasetId]);
  const rawDatasets = asArray(raw.datasets);
  if (rawDatasets) for (const d of rawDatasets) datasets.add(d);
  rec.datasets = [...datasets];
  if (raw.last_change) rec.lastChange = raw.last_change;
  return rec;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        "user-agent": "HawkeyeSterling/1.0 (+https://hawkeye-sterling.netlify.app)",
        accept: "application/json",
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export interface DatasetFetchOutcome {
  datasetId: string;
  ok: boolean;
  count: number;
  error?: string;
  durationMs: number;
}

export async function fetchOneDataset(datasetId: string): Promise<{
  outcome: DatasetFetchOutcome;
  records: OpenSanctionsRecord[];
}> {
  const start = Date.now();
  const url = `${OPENSANCTIONS_BASE}/${encodeURIComponent(datasetId)}/targets.simple.json`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      return {
        outcome: { datasetId, ok: false, count: 0, error: `HTTP ${res.status}`, durationMs: Date.now() - start },
        records: [],
      };
    }
    const text = await res.text();
    // targets.simple.json is NDJSON (newline-delimited JSON), one record per
    // line. Fall back to JSON-array parse for datasets that use the array
    // format — both are valid in the OpenSanctions catalogue.
    const records: OpenSanctionsRecord[] = [];
    if (text.startsWith("[")) {
      const parsed = JSON.parse(text) as RawTargetSimple[];
      if (!Array.isArray(parsed)) {
        return {
          outcome: { datasetId, ok: false, count: 0, error: "expected JSON array", durationMs: Date.now() - start },
          records: [],
        };
      }
      for (const raw of parsed) {
        const r = normaliseRecord(raw, datasetId);
        if (r) records.push(r);
      }
    } else {
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const raw = JSON.parse(trimmed) as RawTargetSimple;
          const r = normaliseRecord(raw, datasetId);
          if (r) records.push(r);
        } catch {
          // Skip malformed lines; OpenSanctions does occasionally publish a
          // trailing empty/partial line in NDJSON exports.
        }
      }
    }
    return {
      outcome: { datasetId, ok: true, count: records.length, durationMs: Date.now() - start },
      records,
    };
  } catch (err) {
    return {
      outcome: {
        datasetId,
        ok: false,
        count: 0,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      },
      records: [],
    };
  }
}

export interface RefreshResult {
  ok: boolean;
  at: string;
  durationMs: number;
  totalRecords: number;
  outcomes: DatasetFetchOutcome[];
}

/**
 * Fetch every configured dataset, merge by id (later writes win for
 * duplicates), and write the consolidated array to the
 * `hawkeye-opensanctions` Blob store. Returns a structured summary.
 *
 * `@netlify/blobs` is loaded dynamically so this module can be imported
 * by both Next.js Lambdas and Netlify Functions without an awkward
 * top-level dependency on a Netlify-only package.
 */
export async function refreshOpenSanctionsBlob(): Promise<RefreshResult> {
  const startedAt = Date.now();
  const datasets = resolveDatasetList();
  const outcomes: DatasetFetchOutcome[] = [];
  const merged = new Map<string, OpenSanctionsRecord>();

  for (const id of datasets) {
    const { outcome, records } = await fetchOneDataset(id);
    outcomes.push(outcome);
    for (const r of records) {
      // Last-writer-wins on duplicate id. Use Set semantics for the
      // datasets field so cross-dataset duplicates carry both source tags.
      const prior = merged.get(r.id);
      if (prior) {
        const allDatasets = new Set<string>([...(prior.datasets ?? []), ...(r.datasets ?? [])]);
        merged.set(r.id, { ...r, datasets: [...allDatasets] });
      } else {
        merged.set(r.id, r);
      }
    }
  }

  const consolidated = [...merged.values()];

  // Write to the same Blob key the openSanctions.ts adapter reads from.
  // Dynamic import so this module stays loadable in non-Netlify environments
  // (CI type-check, local Vitest runs, etc.).
  const blobsMod = await import("@netlify/blobs");
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  const storeOpts: { name: string; siteID?: string; token?: string; consistency: "strong" } = {
    name: "hawkeye-opensanctions",
    consistency: "strong",
  };
  if (siteID) storeOpts.siteID = siteID;
  if (token) storeOpts.token = token;
  const store = blobsMod.getStore(storeOpts);
  await store.set("sanctions.json", JSON.stringify(consolidated), {
    metadata: {
      writtenAt: new Date().toISOString(),
      datasets,
      totalRecords: consolidated.length,
    },
  });

  return {
    ok: outcomes.some((o) => o.ok), // partial success is still considered ok
    at: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totalRecords: consolidated.length,
    outcomes,
  };
}
