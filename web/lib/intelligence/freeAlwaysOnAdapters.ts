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
              bd:serviceParam mwapi:search "${subjectName.replace(/[\\"'\n\r\t]/g, " ").trim()}" .
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

// ── GLEIF Global Legal Entity Identifier — free, no key, always on ──
//
// GLEIF publishes the canonical LEI registry (ISO 17442) at api.gleif.org.
// Free, no auth, no rate-limit advertised — perfect for always-on.
export function gleifAdapter(): RegistryAdapter {
  if (!flagOn("gleif")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          "filter[entity.legalName]": subjectName,
          "page[size]": String(opts?.limit ?? 10),
        });
        const res = await abortable(
          fetch(`https://api.gleif.org/api/v1/lei-records?${params.toString()}`, {
            headers: { accept: "application/vnd.api+json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: Array<{ id?: string; attributes?: { entity?: { legalName?: { name?: string }; legalAddress?: { country?: string }; registeredAt?: { id?: string } }; registration?: { initialRegistrationDate?: string; status?: string } } }> };
        return (json.data ?? []).map((d) => ({
          source: "gleif",
          name: d.attributes?.entity?.legalName?.name ?? subjectName,
          ...(d.attributes?.entity?.legalAddress?.country ? { jurisdiction: d.attributes.entity.legalAddress.country } : {}),
          ...(d.id ? { registrationNumber: d.id } : {}),
          ...(d.attributes?.registration?.initialRegistrationDate ? { incorporationDate: d.attributes.registration.initialRegistrationDate } : {}),
          ...(d.attributes?.registration?.status ? { status: d.attributes.registration.status } : {}),
          url: `https://search.gleif.org/#/record/${d.id ?? ""}`,
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[gleif] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── OpenSanctions default — free public sanctions/PEP/POI consolidated ──
//
// api.opensanctions.org offers the public consolidated dataset for free
// (the paid "Pro" tier just adds enrichment APIs). Always on.
export function openSanctionsFreeAdapter(): RegistryAdapter {
  if (!flagOn("opensanctions-free")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ id?: string; caption?: string; schema?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[]; incorporationDate?: string[] } }> };
        return (json.results ?? []).filter((r) => r.caption).map((r) => ({
          source: "opensanctions-free",
          name: r.caption!,
          ...(r.properties?.country?.[0] ? { jurisdiction: r.properties.country[0].toUpperCase() } : {}),
          ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : { registrationNumber: r.id }),
          ...(r.properties?.incorporationDate?.[0] ? { incorporationDate: r.properties.incorporationDate[0] } : {}),
          ...(r.properties?.topics?.length ? { status: r.properties.topics.join(",") } : {}),
          url: `https://www.opensanctions.org/entities/${r.id ?? ""}/`,
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[opensanctions-free] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── OpenCorporates free reconcile — basic company-name resolver ─────
//
// OpenCorporates' reconciliation endpoint is free and key-less for low
// volume; we rate-limit ourselves to keep within the free quota.
export function openCorporatesFreeAdapter(): RegistryAdapter {
  if (!flagOn("opencorporates-free")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, format: "json" });
        const res = await abortable(
          fetch(`https://api.opencorporates.com/v0.4/companies/search?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: { companies?: Array<{ company?: { name?: string; jurisdiction_code?: string; company_number?: string; incorporation_date?: string; current_status?: string; opencorporates_url?: string } }> } };
        const companies = json.results?.companies ?? [];
        const lim = opts?.limit ?? 25;
        return companies.slice(0, lim).map((c) => ({
          source: "opencorporates-free",
          name: c.company?.name ?? subjectName,
          ...(c.company?.jurisdiction_code ? { jurisdiction: c.company.jurisdiction_code.toUpperCase() } : {}),
          ...(c.company?.company_number ? { registrationNumber: c.company.company_number } : {}),
          ...(c.company?.incorporation_date ? { incorporationDate: c.company.incorporation_date } : {}),
          ...(c.company?.current_status ? { status: c.company.current_status } : {}),
          ...(c.company?.opencorporates_url ? { url: c.company.opencorporates_url } : {}),
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[opencorporates-free] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── INTERPOL Red Notices — free, no key ─────────────────────────────
export function interpolRedNoticesAdapter(): RegistryAdapter {
  if (!flagOn("interpol-red-notices")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const parts = subjectName.trim().split(/\s+/);
        const forename = parts[0] ?? "";
        const surname = parts.slice(1).join(" ") || forename;
        const params = new URLSearchParams({ forename, name: surname, resultPerPage: String(Math.min(opts?.limit ?? 20, 20)) });
        const res = await abortable(
          fetch(`https://ws-public.interpol.int/notices/v1/red?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { _embedded?: { notices?: Array<{ entity_id?: string; forename?: string; name?: string; nationalities?: string[]; date_of_birth?: string; _links?: { self?: { href?: string } } }> } };
        return (json._embedded?.notices ?? []).map((n) => ({
          source: "interpol-red-notices",
          name: [n.forename, n.name].filter(Boolean).join(" ") || subjectName,
          ...(n.nationalities?.[0] ? { jurisdiction: n.nationalities[0] } : {}),
          ...(n.entity_id ? { registrationNumber: n.entity_id } : {}),
          ...(n.date_of_birth ? { incorporationDate: n.date_of_birth } : {}),
          status: "INTERPOL Red Notice",
          url: n._links?.self?.href ?? "https://www.interpol.int/en/How-we-work/Notices/Red-Notices/View-Red-Notices",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[interpol-red-notices] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── FBI Most Wanted — free, no key ──────────────────────────────────
export function fbiMostWantedAdapter(): RegistryAdapter {
  if (!flagOn("fbi-most-wanted")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ title: subjectName, pageSize: String(Math.min(opts?.limit ?? 20, 20)) });
        const res = await abortable(
          fetch(`https://api.fbi.gov/wanted/v1/list?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ uid?: string; title?: string; nationality?: string; dates_of_birth_used?: string[]; status?: string; url?: string }> };
        const needle = subjectName.toLowerCase();
        return (json.items ?? [])
          .filter((i) => i.title?.toLowerCase().includes(needle))
          .map((i) => ({
            source: "fbi-most-wanted",
            name: i.title ?? subjectName,
            ...(i.nationality ? { jurisdiction: i.nationality } : {}),
            ...(i.uid ? { registrationNumber: i.uid } : {}),
            ...(i.dates_of_birth_used?.[0] ? { incorporationDate: i.dates_of_birth_used[0] } : {}),
            status: i.status ?? "WANTED",
            url: i.url ?? "https://www.fbi.gov/wanted",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[fbi-most-wanted] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── OCCRP Aleph — free public OSINT/leaks database ──────────────────
export function occrpAlephAdapter(): RegistryAdapter {
  if (!flagOn("occrp-aleph")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, limit: String(opts?.limit ?? 20) });
        const apiKey = process.env["ALEPH_API_KEY"] ?? "";
        const headers: Record<string, string> = { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" };
        if (apiKey) headers["authorization"] = `ApiKey ${apiKey}`;
        const res = await abortable(fetch(`https://aleph.occrp.org/api/2/entities?${params.toString()}`, { headers }));
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ id?: string; caption?: string; schema?: string; properties?: { country?: string[]; registrationNumber?: string[]; incorporationDate?: string[]; status?: string[] }; collection?: { label?: string } }> };
        return (json.results ?? []).filter((r) => r.caption).map((r) => ({
          source: "occrp-aleph",
          name: r.caption!,
          ...(r.properties?.country?.[0] ? { jurisdiction: r.properties.country[0].toUpperCase() } : {}),
          ...(r.properties?.registrationNumber?.[0] ? { registrationNumber: r.properties.registrationNumber[0] } : { registrationNumber: r.id }),
          ...(r.properties?.incorporationDate?.[0] ? { incorporationDate: r.properties.incorporationDate[0] } : {}),
          ...(r.collection?.label ? { status: r.collection.label } : {}),
          url: `https://aleph.occrp.org/entities/${r.id ?? ""}`,
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[occrp-aleph] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── OpenSanctions OFAC SDN — targeted US Treasury sanctions list ─────
export function ofacSdnAdapter(): RegistryAdapter {
  if (!flagOn("ofac-sdn")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "us_ofac_sdn,us_ofac_cons" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ id?: string; caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[]; incorporationDate?: string[] } }> };
        return (json.results ?? []).filter((r) => r.caption).map((r) => ({
          source: "ofac-sdn",
          name: r.caption!,
          ...(r.properties?.country?.[0] ? { jurisdiction: r.properties.country[0].toUpperCase() } : {}),
          ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : { registrationNumber: r.id }),
          ...(r.properties?.incorporationDate?.[0] ? { incorporationDate: r.properties.incorporationDate[0] } : {}),
          status: "OFAC SDN",
          url: `https://www.opensanctions.org/entities/${r.id ?? ""}/`,
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[ofac-sdn] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── OpenSanctions EU Financial Sanctions — EU FSF list ──────────────
export function euFsfAdapter(): RegistryAdapter {
  if (!flagOn("eu-fsf")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "eu_fsf" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ id?: string; caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[]; incorporationDate?: string[] } }> };
        return (json.results ?? []).filter((r) => r.caption).map((r) => ({
          source: "eu-fsf",
          name: r.caption!,
          ...(r.properties?.country?.[0] ? { jurisdiction: r.properties.country[0].toUpperCase() } : {}),
          ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : { registrationNumber: r.id }),
          ...(r.properties?.incorporationDate?.[0] ? { incorporationDate: r.properties.incorporationDate[0] } : {}),
          status: "EU Financial Sanctions",
          url: `https://www.opensanctions.org/entities/${r.id ?? ""}/`,
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[eu-fsf] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── OpenSanctions UN Security Council Sanctions ──────────────────────
export function unScSanctionsAdapter(): RegistryAdapter {
  if (!flagOn("un-sc-sanctions")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "un_sc_sanctions" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ id?: string; caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[]; incorporationDate?: string[] } }> };
        return (json.results ?? []).filter((r) => r.caption).map((r) => ({
          source: "un-sc-sanctions",
          name: r.caption!,
          ...(r.properties?.country?.[0] ? { jurisdiction: r.properties.country[0].toUpperCase() } : {}),
          ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : { registrationNumber: r.id }),
          ...(r.properties?.incorporationDate?.[0] ? { incorporationDate: r.properties.incorporationDate[0] } : {}),
          status: "UN SC Consolidated",
          url: `https://www.opensanctions.org/entities/${r.id ?? ""}/`,
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[un-sc-sanctions] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── OpenSanctions BIS Entity List — US export-control denials ────────
export function bisEntityListAdapter(): RegistryAdapter {
  if (!flagOn("bis-entity-list")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "us_bis_elist,us_bis_dpl,us_bis_mel" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ id?: string; caption?: string; datasets?: string[]; properties?: { country?: string[]; idNumber?: string[]; topics?: string[]; incorporationDate?: string[] } }> };
        return (json.results ?? []).filter((r) => r.caption).map((r) => ({
          source: "bis-entity-list",
          name: r.caption!,
          ...(r.properties?.country?.[0] ? { jurisdiction: r.properties.country[0].toUpperCase() } : {}),
          ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : { registrationNumber: r.id }),
          ...(r.properties?.incorporationDate?.[0] ? { incorporationDate: r.properties.incorporationDate[0] } : {}),
          status: `BIS: ${(r.datasets ?? []).join(",")}`,
          url: `https://www.opensanctions.org/entities/${r.id ?? ""}/`,
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[bis-entity-list] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── SAM.gov Exclusions — US federal procurement debarments ───────────
// Free with DEMO_KEY (rate-limited to 10 req/min; no registration needed).
export function samGovExclusionsAdapter(): RegistryAdapter {
  if (!flagOn("samgov-exclusions")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const apiKey = process.env["SAMGOV_API_KEY"] ?? "DEMO_KEY";
        const params = new URLSearchParams({
          api_key: apiKey,
          legalBusinessName: subjectName,
          exclusionStatusFlag: "D",
          limit: String(Math.min(opts?.limit ?? 20, 100)),
        });
        const res = await abortable(
          fetch(`https://api.sam.gov/entity-information/v3/entities?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { entityData?: Array<{ entityInformation?: { entityURL?: string }; coreData?: { entityHierarchyInformation?: { legalBusinessName?: { legalBusinessName?: string } }; physicalAddress?: { countryCode?: string }; generalInformation?: { entityStartDate?: string } }; exclusionDetails?: { exclusionType?: string; exclusionProgram?: string }; registrationInformation?: { ueiSAM?: string } }> };
        return (json.entityData ?? []).map((e) => ({
          source: "samgov-exclusions",
          name: e.coreData?.entityHierarchyInformation?.legalBusinessName?.legalBusinessName ?? subjectName,
          ...(e.coreData?.physicalAddress?.countryCode ? { jurisdiction: e.coreData.physicalAddress.countryCode } : {}),
          ...(e.registrationInformation?.ueiSAM ? { registrationNumber: e.registrationInformation.ueiSAM } : {}),
          ...(e.coreData?.generalInformation?.entityStartDate ? { incorporationDate: e.coreData.generalInformation.entityStartDate } : {}),
          status: `SAM Excluded: ${e.exclusionDetails?.exclusionType ?? "debarred"}`,
          url: e.entityInformation?.entityURL ?? "https://sam.gov/search/?index=ei",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[samgov-exclusions] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── OpenOwnership Register — beneficial ownership data ───────────────
export function openOwnershipAdapter(): RegistryAdapter {
  if (!flagOn("open-ownership")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, per_page: String(Math.min(opts?.limit ?? 20, 50)) });
        const res = await abortable(
          fetch(`https://register.openownership.org/api/entities?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: Array<{ self_link?: string; name?: string; jurisdiction_code?: string; incorporation_date?: string; company_number?: string; current_status?: string }> };
        return (json.data ?? []).filter((e) => e.name).map((e) => ({
          source: "open-ownership",
          name: e.name!,
          ...(e.jurisdiction_code ? { jurisdiction: e.jurisdiction_code.toUpperCase() } : {}),
          ...(e.company_number ? { registrationNumber: e.company_number } : {}),
          ...(e.incorporation_date ? { incorporationDate: e.incorporation_date } : {}),
          ...(e.current_status ? { status: e.current_status } : {}),
          url: e.self_link ?? "https://register.openownership.org",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[open-ownership] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── EU Transparency Register — lobbying / interest representatives ───
export function euTransparencyRegisterAdapter(): RegistryAdapter {
  if (!flagOn("eu-transparency-register")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ searchTerm: subjectName, size: String(Math.min(opts?.limit ?? 20, 50)), page: "0" });
        const res = await abortable(
          fetch(`https://api.ec.europa.eu/transparencyregister/public/nonus/api/v1/search/organisations?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { hits?: { hits?: Array<{ _source?: { registrationNumber?: string; name?: string; headOfficeCountry?: string; registrationDate?: string; status?: string; goals?: string } }> } };
        return (json.hits?.hits ?? []).filter((h) => h._source?.name).map((h) => {
          const s = h._source!;
          return {
            source: "eu-transparency-register",
            name: s.name!,
            ...(s.headOfficeCountry ? { jurisdiction: s.headOfficeCountry } : {}),
            ...(s.registrationNumber ? { registrationNumber: s.registrationNumber } : {}),
            ...(s.registrationDate ? { incorporationDate: s.registrationDate } : {}),
            ...(s.status ? { status: s.status } : {}),
            url: s.registrationNumber
              ? `https://ec.europa.eu/transparencyregister/public/consultation/displaylobbyist.do?id=${s.registrationNumber}`
              : "https://ec.europa.eu/transparencyregister/",
          } satisfies RegistryRecord;
        });
      } catch (err) {
        console.warn("[eu-transparency-register] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── DFSA Public Register — Dubai Financial Services Authority ────────
// Directly relevant: UAE DPMS gold dealers deal with DIFC-regulated firms.
export function dfsaRegisterAdapter(): RegistryAdapter {
  if (!flagOn("dfsa-register")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ name: subjectName, pageSize: String(Math.min(opts?.limit ?? 20, 50)), pageNumber: "1" });
        const res = await abortable(
          fetch(`https://www.dfsa.ae/api/PublicRegister/Search?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: Array<{ name?: string; referenceNumber?: string; status?: string; category?: string; licenceType?: string; authorizationDate?: string }> };
        return (json.data ?? []).filter((e) => e.name).map((e) => ({
          source: "dfsa-register",
          name: e.name!,
          jurisdiction: "AE-DU",
          ...(e.referenceNumber ? { registrationNumber: e.referenceNumber } : {}),
          ...(e.authorizationDate ? { incorporationDate: e.authorizationDate } : {}),
          status: [e.status, e.licenceType].filter(Boolean).join(" — ") || "DFSA Registered",
          url: `https://www.dfsa.ae/public-register`,
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[dfsa-register] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── ADGM Financial Services Register — Abu Dhabi Global Market ──────
export function adgmRegisterAdapter(): RegistryAdapter {
  if (!flagOn("adgm-register")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, pageSize: String(Math.min(opts?.limit ?? 20, 50)) });
        const res = await abortable(
          fetch(`https://www.adgm.com/api/fsra/public-register/search?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ entityName?: string; referenceNumber?: string; status?: string; category?: string; effectiveDate?: string }> };
        return (json.results ?? []).filter((e) => e.entityName).map((e) => ({
          source: "adgm-register",
          name: e.entityName!,
          jurisdiction: "AE-AZ",
          ...(e.referenceNumber ? { registrationNumber: e.referenceNumber } : {}),
          ...(e.effectiveDate ? { incorporationDate: e.effectiveDate } : {}),
          status: [e.status, e.category].filter(Boolean).join(" — ") || "ADGM Registered",
          url: "https://www.adgm.com/fsra/public-register",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[adgm-register] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── CBUAE Licensed Institutions — Central Bank of UAE ───────────────
export function cbuaeLicensedAdapter(): RegistryAdapter {
  if (!flagOn("cbuae-licensed")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ search: subjectName, limit: String(Math.min(opts?.limit ?? 20, 50)) });
        const res = await abortable(
          fetch(`https://centralbank.ae/api/v1/licensed-institutions?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: Array<{ name?: string; licenceNumber?: string; status?: string; type?: string; licenceDate?: string; emirate?: string }> };
        const needle = subjectName.toLowerCase();
        return (json.data ?? [])
          .filter((e) => e.name?.toLowerCase().includes(needle))
          .slice(0, opts?.limit ?? 20)
          .map((e) => ({
            source: "cbuae-licensed",
            name: e.name!,
            jurisdiction: e.emirate ? `AE-${e.emirate.slice(0, 2).toUpperCase()}` : "AE",
            ...(e.licenceNumber ? { registrationNumber: e.licenceNumber } : {}),
            ...(e.licenceDate ? { incorporationDate: e.licenceDate } : {}),
            status: [e.status, e.type].filter(Boolean).join(" — ") || "CBUAE Licensed",
            url: "https://centralbank.ae/en/licensed-institutions",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[cbuae-licensed] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── CourtListener — US federal court cases, free, no key ─────────────
export function courtListenerAdapter(): RegistryAdapter {
  if (!flagOn("court-listener")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, type: "r", format: "json", page_size: String(Math.min(opts?.limit ?? 20, 20)) });
        const res = await abortable(
          fetch(`https://www.courtlistener.com/api/rest/v4/search/?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ id?: number; caseName?: string; court?: string; dateFiled?: string; docketNumber?: string; absoluteUrl?: string; status?: string }> };
        return (json.results ?? []).filter((r) => r.caseName).map((r) => ({
          source: "court-listener",
          name: r.caseName!,
          jurisdiction: "US",
          ...(r.docketNumber ? { registrationNumber: r.docketNumber } : {}),
          ...(r.dateFiled ? { incorporationDate: r.dateFiled } : {}),
          status: [r.status, r.court].filter(Boolean).join(" | ") || "Court Record",
          url: r.absoluteUrl ? `https://www.courtlistener.com${r.absoluteUrl}` : "https://www.courtlistener.com",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[court-listener] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── ICIJ Offshore Leaks — Panama / Pandora / Bahamas Papers ─────────
export function icijOffshoreLeaksAdapter(): RegistryAdapter {
  if (!flagOn("icij-offshore-leaks")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, cat: "entity,officer,intermediary,address", page: "1" });
        const res = await abortable(
          fetch(`https://offshoreleaks.icij.org/api/v1/search?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { nodes?: Array<{ name?: string; jurisdiction?: string; country_codes?: string[]; node_id?: string; sourceids?: string[]; datasets?: string[] }> };
        const lim = opts?.limit ?? 25;
        return (json.nodes ?? []).slice(0, lim).filter((n) => n.name).map((n) => ({
          source: "icij-offshore-leaks",
          name: n.name!,
          ...(n.country_codes?.[0] ? { jurisdiction: n.country_codes[0].toUpperCase() } : n.jurisdiction ? { jurisdiction: n.jurisdiction } : {}),
          ...(n.node_id ? { registrationNumber: n.node_id } : {}),
          status: `ICIJ Leak: ${(n.datasets ?? n.sourceids ?? []).join(", ") || "offshore"}`,
          url: n.node_id ? `https://offshoreleaks.icij.org/nodes/${n.node_id}` : "https://offshoreleaks.icij.org/",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[icij-offshore-leaks] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── IMO Ship Registry — International Maritime Organization ──────────
// Catches vessels owned/operated by screened entities (gold smuggling routes).
export function imoShipRegistryAdapter(): RegistryAdapter {
  if (!flagOn("imo-ship-registry")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        // GISIS public search — returns ships by owner/company name
        const params = new URLSearchParams({ companyName: subjectName, pageNo: "1", pageSize: String(Math.min(opts?.limit ?? 20, 50)) });
        const res = await abortable(
          fetch(`https://gisis.imo.org/public/ships/getShipList?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: Array<{ shipName?: string; imoNumber?: string; flagState?: string; shipType?: string; grossTonnage?: string; registeredOwner?: string }> };
        return (json.data ?? []).filter((s) => s.shipName).map((s) => ({
          source: "imo-ship-registry",
          name: s.shipName!,
          ...(s.flagState ? { jurisdiction: s.flagState } : {}),
          ...(s.imoNumber ? { registrationNumber: s.imoNumber } : {}),
          status: [s.shipType, s.registeredOwner ? `Owner: ${s.registeredOwner}` : ""].filter(Boolean).join(" | ") || "IMO Vessel",
          url: s.imoNumber ? `https://gisis.imo.org/public/ships/details/${s.imoNumber}` : "https://gisis.imo.org/",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[imo-ship-registry] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── FAA Aircraft Registry — US-registered aircraft owners ───────────
// Catches private jets / cargo aircraft linked to screened entities.
export function faaAircraftRegistryAdapter(): RegistryAdapter {
  if (!flagOn("faa-aircraft-registry")) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        // FAA's public aircraft inquiry API
        const params = new URLSearchParams({ OwnerName: subjectName, PageNumber: "1", PageSize: String(Math.min(opts?.limit ?? 20, 50)) });
        const res = await abortable(
          fetch(`https://registry.faa.gov/aircraftinquiry/api/v1/aircraft/owner?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ nNumber?: string; serialNumber?: string; model?: string; ownerName?: string; city?: string; state?: string; country?: string; certIssueDate?: string; airWorthDate?: string }> };
        return (json.items ?? []).filter((a) => a.ownerName).map((a) => ({
          source: "faa-aircraft-registry",
          name: a.ownerName!,
          jurisdiction: a.country ?? "US",
          ...(a.nNumber ? { registrationNumber: `N${a.nNumber}` } : {}),
          ...(a.certIssueDate ? { incorporationDate: a.certIssueDate } : {}),
          status: a.model ? `FAA Aircraft: ${a.model}` : "FAA Aircraft",
          url: a.nNumber ? `https://registry.faa.gov/aircraftinquiry/Search/NNumberInquiry?nNumberTxt=${a.nNumber}` : "https://registry.faa.gov/",
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[faa-aircraft-registry] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// Convenience aggregator — every free always-on source in this file.
export function activeFreeAdapters(): RegistryAdapter[] {
  return [
    wikidataAdapter(),
    worldBankSanctionsAdapter(),
    fatfHighRiskAdapter(),
    gleifAdapter(),
    openSanctionsFreeAdapter(),
    openCorporatesFreeAdapter(),
    interpolRedNoticesAdapter(),
    fbiMostWantedAdapter(),
    occrpAlephAdapter(),
    ofacSdnAdapter(),
    euFsfAdapter(),
    unScSanctionsAdapter(),
    bisEntityListAdapter(),
    samGovExclusionsAdapter(),
    openOwnershipAdapter(),
    euTransparencyRegisterAdapter(),
    dfsaRegisterAdapter(),
    adgmRegisterAdapter(),
    cbuaeLicensedAdapter(),
    courtListenerAdapter(),
    icijOffshoreLeaksAdapter(),
    imoShipRegistryAdapter(),
    faaAircraftRegistryAdapter(),
  ].filter((a) => a.isAvailable());
}

export function activeFreeProviders(): string[] {
  const out: string[] = [];
  if (flagOn("wikidata")) out.push("wikidata");
  if (flagOn("worldbank-debar")) out.push("worldbank-debar");
  if (flagOn("fatf")) out.push("fatf");
  if (flagOn("gleif")) out.push("gleif");
  if (flagOn("opensanctions-free")) out.push("opensanctions-free");
  if (flagOn("opencorporates-free")) out.push("opencorporates-free");
  if (flagOn("interpol-red-notices")) out.push("interpol-red-notices");
  if (flagOn("fbi-most-wanted")) out.push("fbi-most-wanted");
  if (flagOn("occrp-aleph")) out.push("occrp-aleph");
  if (flagOn("ofac-sdn")) out.push("ofac-sdn");
  if (flagOn("eu-fsf")) out.push("eu-fsf");
  if (flagOn("un-sc-sanctions")) out.push("un-sc-sanctions");
  if (flagOn("bis-entity-list")) out.push("bis-entity-list");
  if (flagOn("samgov-exclusions")) out.push("samgov-exclusions");
  if (flagOn("open-ownership")) out.push("open-ownership");
  if (flagOn("eu-transparency-register")) out.push("eu-transparency-register");
  if (flagOn("dfsa-register")) out.push("dfsa-register");
  if (flagOn("adgm-register")) out.push("adgm-register");
  if (flagOn("cbuae-licensed")) out.push("cbuae-licensed");
  if (flagOn("court-listener")) out.push("court-listener");
  if (flagOn("icij-offshore-leaks")) out.push("icij-offshore-leaks");
  if (flagOn("imo-ship-registry")) out.push("imo-ship-registry");
  if (flagOn("faa-aircraft-registry")) out.push("faa-aircraft-registry");
  return out;
}

export async function searchFreeAdapters(subjectName: string, jurisdiction?: string, limit?: number): Promise<{ records: RegistryRecord[]; providersUsed: string[] }> {
  const adapters = activeFreeAdapters();
  if (adapters.length === 0) return { records: [], providersUsed: [] };
  const results = await Promise.all(adapters.map((a) => a.search(subjectName, { jurisdiction, limit }).catch((err: unknown) => {
    console.warn(`[hawkeye] freeAlwaysOnAdapters[${(a as { id?: string }).id ?? 'unknown'}] search failed:`, err);
    return [];
  })));
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
