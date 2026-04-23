// Hawkeye Sterling — advanced query-filter parser.
//
// Takes URLSearchParams and returns a normalised Filter[] the API layer can
// apply uniformly across queue, audit, analytics and batch endpoints.
// Supported keys:
//   listType         CSV multi-value — e.g. listType=ofac,un
//   jurisdiction     CSV multi-value — ISO2 or name
//   riskCategory     CSV multi-value — e.g. pep,sanctions,adverse-media
//   minScore         number 0..100
//   maxScore         number 0..100
//   since            ISO date / timestamp — inclusive lower bound
//   until            ISO date / timestamp — inclusive upper bound
//   escalated        boolean (true/false/1/0/yes/no)
//   subjectType      CSV: individual,organisation,vessel,aircraft,other
//   tenant           string (single)
// Unknown keys are ignored so new consumers can extend without breaking old.

export type FilterKey =
  | "listType"
  | "jurisdiction"
  | "riskCategory"
  | "minScore"
  | "maxScore"
  | "since"
  | "until"
  | "escalated"
  | "subjectType"
  | "tenant";

export type Filter =
  | { key: "listType"; values: string[] }
  | { key: "jurisdiction"; values: string[] }
  | { key: "riskCategory"; values: string[] }
  | { key: "subjectType"; values: string[] }
  | { key: "minScore"; value: number }
  | { key: "maxScore"; value: number }
  | { key: "since"; value: Date }
  | { key: "until"; value: Date }
  | { key: "escalated"; value: boolean }
  | { key: "tenant"; value: string };

const MULTI: ReadonlySet<FilterKey> = new Set([
  "listType",
  "jurisdiction",
  "riskCategory",
  "subjectType",
]);

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseBoolean(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "y") return true;
  if (v === "false" || v === "0" || v === "no" || v === "n") return false;
  return null;
}

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept "YYYY-MM-DD" plain, or any Date-parseable string.
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00Z`
    : trimmed;
  const d = new Date(candidate);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseScore(raw: string): number | null {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

export function parseFilters(params: URLSearchParams): Filter[] {
  const filters: Filter[] = [];
  const seen = new Set<FilterKey>();

  const push = (f: Filter): void => {
    if (seen.has(f.key) && !MULTI.has(f.key)) {
      // single-value key already set; last wins
      const idx = filters.findIndex((x) => x.key === f.key);
      if (idx >= 0) filters[idx] = f;
      return;
    }
    seen.add(f.key);
    filters.push(f);
  };

  for (const [rawKey, rawValue] of params.entries()) {
    switch (rawKey as FilterKey) {
      case "listType":
      case "jurisdiction":
      case "riskCategory":
      case "subjectType": {
        const values = splitCsv(rawValue);
        if (values.length === 0) continue;
        const existing = filters.find((x) => x.key === rawKey) as
          | Extract<Filter, { values: string[] }>
          | undefined;
        if (existing) {
          existing.values.push(...values);
        } else {
          push({ key: rawKey as FilterKey, values } as Filter);
        }
        break;
      }
      case "minScore": {
        const v = parseScore(rawValue);
        if (v !== null) push({ key: "minScore", value: v });
        break;
      }
      case "maxScore": {
        const v = parseScore(rawValue);
        if (v !== null) push({ key: "maxScore", value: v });
        break;
      }
      case "since": {
        const d = parseDate(rawValue);
        if (d) push({ key: "since", value: d });
        break;
      }
      case "until": {
        const d = parseDate(rawValue);
        if (d) push({ key: "until", value: d });
        break;
      }
      case "escalated": {
        const b = parseBoolean(rawValue);
        if (b !== null) push({ key: "escalated", value: b });
        break;
      }
      case "tenant": {
        if (rawValue.trim()) push({ key: "tenant", value: rawValue.trim() });
        break;
      }
      default:
        // Unknown key — ignore (forward-compatible).
        break;
    }
  }

  // Dedupe multi-value sets.
  for (const f of filters) {
    if (MULTI.has(f.key) && "values" in f) {
      f.values = Array.from(new Set(f.values));
    }
  }
  return filters;
}

/** Round-trip helper — serialise Filter[] back into URLSearchParams. Useful
 *  for generating canonical filter URLs (e.g. saved-search links). */
export function serialiseFilters(filters: ReadonlyArray<Filter>): URLSearchParams {
  const p = new URLSearchParams();
  for (const f of filters) {
    switch (f.key) {
      case "listType":
      case "jurisdiction":
      case "riskCategory":
      case "subjectType":
        if (f.values.length > 0) p.set(f.key, f.values.join(","));
        break;
      case "minScore":
      case "maxScore":
        p.set(f.key, String(f.value));
        break;
      case "since":
      case "until":
        p.set(f.key, f.value.toISOString());
        break;
      case "escalated":
        p.set(f.key, f.value ? "true" : "false");
        break;
      case "tenant":
        p.set(f.key, f.value);
        break;
    }
  }
  return p;
}
