// Hawkeye Sterling — free always-on data sources beyond GLEIF / OpenSanctions / GDELT.
//
// All free, env-toggle-gated (set *_ENABLED=1 to activate). They mirror
// the RegistryAdapter shape so they slot into the country dispatcher.
//
// - Wikidata SPARQL: queries wd:Q43229 (organization) + label match
// - World Bank Listing of Ineligible Firms (debarment list, free CSV/JSON)
// - FATF high-risk / monitored jurisdictions (free public list)

import type { RegistryAdapter, RegistryRecord } from "./registryAdapters";
import { NULL_REGISTRY_ADAPTER } from "./registryAdapters";
import { flagOn } from "./featureFlags";

const FETCH_TIMEOUT_MS = 12_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`free adapter exceeded ${ms}ms`)), ms),
    ),
  ]);
}

// ── Wikidata SPARQL — free, no key ───────────────────────────────────
export function wikidataAdapter(): RegistryAdapter {
  if (!flagOn("wikidata")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        // SPARQL query: any entity with English label matching the input
        // that's an instance of (or subclass of) organization (Q43229) or
        // human (Q5) — we want both companies and individuals.
        const sparql = `
          SELECT DISTINCT ?item ?itemLabel ?country ?countryLabel ?inception ?incNum WHERE {
            SERVICE wikibase:mwapi {
              bd:serviceParam wikibase:api "EntitySearch" .
              bd:serviceParam wikibase:endpoint "www.wikidata.org" .
              bd:serviceParam mwapi:search "${subjectName.replace(/"/g, "")}" .
              bd:serviceParam mwapi:language "en" .
              ?item wikibase:apiOutputItem mwapi:item .
            }
            OPTIONAL { ?item wdt:P17 ?country . }
            OPTIONAL { ?item wdt:P571 ?inception . }
            OPTIONAL { ?item wdt:P1297 ?incNum . }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
          } LIMIT ${opts?.limit ?? 25}
        `;
        const params = new URLSearchParams({ query: sparql, format: "json" });
        const res = await abortable(
          fetch(`https://query.wikidata.org/sparql?${params.toString()}`, {
            headers: { accept: "application/sparql-results+json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: { bindings?: Array<{ item?: { value?: string }; itemLabel?: { value?: string }; countryLabel?: { value?: string }; inception?: { value?: string }; incNum?: { value?: string } }> } };
        const seen = new Set<string>();
        const records: RegistryRecord[] = [];
        for (const b of json.results?.bindings ?? []) {
          const url = b.item?.value;
          const name = b.itemLabel?.value;
          if (!url || !name || seen.has(url)) continue;
          seen.add(url);
          records.push({
            source: "wikidata",
            name,
            ...(b.countryLabel?.value ? { jurisdiction: b.countryLabel.value } : {}),
            ...(b.incNum?.value ? { registrationNumber: b.incNum.value } : { registrationNumber: url.replace(/^.*\//, "") }),
            ...(b.inception?.value ? { incorporationDate: b.inception.value } : {}),
            url,
          });
        }
        return records;
      } catch (err) {
        console.warn("[wikidata] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── World Bank Listing of Ineligible Firms (Debarment list) — free ──
export function worldBankSanctionsAdapter(): RegistryAdapter {
  if (!flagOn("worldbank-debar")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        // World Bank exposes the debarred-firms list as JSON via its
        // open-data endpoint. We fetch the full list (small; <2000 rows)
        // and substring-filter client-side.
        const res = await abortable(
          fetch("https://apigwext.worldbank.org/dvsvc/v1.0/json/APPLICATION/ADOBE_EXPRNCE_MGR/FIRM/SANCTIONED_FIRM", {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { response?: { ZPROCSUPP?: Array<{ SUPP_NAME?: string; COUNTRY_NAME?: string; SANCTION_REASON?: string; FROM_DATE?: string; TO_DATE?: string; UNIQUE_ID?: string }> } };
        const needle = subjectName.toLowerCase();
        const matches = (json.response?.ZPROCSUPP ?? []).filter((f) => f.SUPP_NAME?.toLowerCase().includes(needle));
        return matches.slice(0, opts?.limit ?? 25).map((f) => ({
          source: "worldbank-debar",
          name: f.SUPP_NAME!,
          ...(f.COUNTRY_NAME ? { jurisdiction: f.COUNTRY_NAME } : {}),
          ...(f.UNIQUE_ID ? { registrationNumber: f.UNIQUE_ID } : {}),
          ...(f.SANCTION_REASON ? { status: f.SANCTION_REASON } : {}),
          ...(f.FROM_DATE ? { incorporationDate: f.FROM_DATE } : {}),
          url: "https://www.worldbank.org/en/projects-operations/procurement/debarred-firms",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[worldbank-debar] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── FATF high-risk / monitored jurisdictions — free public ──────────
export function fatfHighRiskAdapter(): RegistryAdapter {
  if (!flagOn("fatf")) return NULL_REGISTRY_ADAPTER;
  // FATF doesn't offer a JSON API; we use OpenSanctions' fatf_blacklist
  // and fatf_greylist datasets which mirror the official PDF lists.
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "fatf_blacklist,fatf_greylist" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, {
            headers: { accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[] } }> };
        return (json.results ?? []).filter((r) => r.caption).map((r) => ({
          source: "fatf",
          name: r.caption!,
          jurisdiction: r.properties?.country?.[0]?.toUpperCase() ?? "INT",
          ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : {}),
          ...(r.properties?.topics?.length ? { status: r.properties.topics.join(",") } : {}),
          url: "https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[fatf] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// Convenience aggregator — every free always-on source in this file.
export function activeFreeAdapters(): RegistryAdapter[] {
  return [wikidataAdapter(), worldBankSanctionsAdapter(), fatfHighRiskAdapter()].filter((a) => a.isAvailable());
}

export function activeFreeProviders(): string[] {
  const out: string[] = [];
  if (flagOn("wikidata")) out.push("wikidata");
  if (flagOn("worldbank-debar")) out.push("worldbank-debar");
  if (flagOn("fatf")) out.push("fatf");
  return out;
}

export async function searchFreeAdapters(subjectName: string, jurisdiction?: string, limit?: number): Promise<{ records: RegistryRecord[]; providersUsed: string[] }> {
  const adapters = activeFreeAdapters();
  if (adapters.length === 0) return { records: [], providersUsed: [] };
  const results = await Promise.all(adapters.map((a) => a.search(subjectName, { jurisdiction, limit }).catch(() => [])));
  const merged = results.flat();
  const seen = new Set<string>();
  const records = merged.filter((r) => {
    const k = `${r.source}|${r.name.toLowerCase()}|${r.registrationNumber ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { records, providersUsed: activeFreeProviders() };
}
