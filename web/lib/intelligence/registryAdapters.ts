// Hawkeye Sterling — corporate registry / beneficial-ownership vendor adapters.
//
// Each adapter is env-key gated and degrades to NULL_REGISTRY_ADAPTER when
// keys are absent. The shape mirrors newsAdapters.ts/commercialAdapters.ts
// so consumers can branch on availability uniformly.
//
// Free tiers: OpenCorporates (free w/ key, paid for bulk), UK Companies
// House (free w/ key), SEC EDGAR (no key — toggle via env flag),
// ICIJ Offshore Leaks Database (free, no key — toggle).
// Paid: Crunchbase, PitchBook.

import { flagOn } from "./featureFlags";

const FETCH_TIMEOUT_MS = 12_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`registry adapter exceeded ${ms}ms`)), ms),
    ),
  ]);
}

export interface RegistryRecord {
  source: string;             // provider id
  name: string;               // company / entity name
  jurisdiction?: string;      // ISO-2 / state
  registrationNumber?: string;
  status?: string;            // "active" | "dissolved" | etc.
  incorporationDate?: string;
  url?: string;               // link to canonical record on the registry
  officers?: Array<{ name: string; role?: string }>;
  beneficialOwners?: Array<{ name: string; ownershipPct?: number }>;
  raw?: unknown;              // pass-through for debugging / advanced views
}

export interface RegistryAdapter {
  isAvailable(): boolean;
  search(subjectName: string, opts?: { jurisdiction?: string; limit?: number }): Promise<RegistryRecord[]>;
}

export const NULL_REGISTRY_ADAPTER: RegistryAdapter = {
  isAvailable: () => false,
  search: async () => [],
};

// ── OpenCorporates — free key tier ─────────────────────────────────────
function openCorporatesAdapter(): RegistryAdapter {
  const key = process.env["OPENCORPORATES_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: subjectName,
          per_page: String(opts?.limit ?? 25),
          api_token: key,
          ...(opts?.jurisdiction ? { jurisdiction_code: opts.jurisdiction.toLowerCase() } : {}),
        });
        const res = await abortable(
          fetch(`https://api.opencorporates.com/v0.4/companies/search?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: { companies?: Array<{ company?: { name?: string; jurisdiction_code?: string; company_number?: string; incorporation_date?: string; current_status?: string; opencorporates_url?: string } }> };
        };
        return (json.results?.companies ?? [])
          .map((c) => c.company)
          .filter((c): c is NonNullable<typeof c> => !!c?.name)
          .map((c) => ({
            source: "opencorporates",
            name: c.name!,
            ...(c.jurisdiction_code ? { jurisdiction: c.jurisdiction_code.toUpperCase() } : {}),
            ...(c.company_number ? { registrationNumber: c.company_number } : {}),
            ...(c.current_status ? { status: c.current_status } : {}),
            ...(c.incorporation_date ? { incorporationDate: c.incorporation_date } : {}),
            ...(c.opencorporates_url ? { url: c.opencorporates_url } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[opencorporates] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── UK Companies House — free key ──────────────────────────────────────
function companiesHouseAdapter(): RegistryAdapter {
  const key = process.env["COMPANIES_HOUSE_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  const auth = Buffer.from(`${key}:`).toString("base64");
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: subjectName,
          items_per_page: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://api.company-information.service.gov.uk/search/companies?${params.toString()}`, {
            headers: { Authorization: `Basic ${auth}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          items?: Array<{ title?: string; company_number?: string; company_status?: string; date_of_creation?: string; links?: { self?: string } }>;
        };
        return (json.items ?? [])
          .filter((i) => i.title)
          .map((i) => ({
            source: "companies-house",
            name: i.title!,
            jurisdiction: "GB",
            ...(i.company_number ? { registrationNumber: i.company_number } : {}),
            ...(i.company_status ? { status: i.company_status } : {}),
            ...(i.date_of_creation ? { incorporationDate: i.date_of_creation } : {}),
            ...(i.links?.self ? { url: `https://find-and-update.company-information.service.gov.uk${i.links.self}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[companies-house] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── SEC EDGAR — public, no key. Default-on (HS_DISABLED=sec-edgar to opt out).
function secEdgarAdapter(): RegistryAdapter {
  if (!flagOn("sec-edgar")) return NULL_REGISTRY_ADAPTER;
  // SEC requires a User-Agent identifying the requestor
  const ua = process.env["SEC_EDGAR_USER_AGENT"] ?? "Hawkeye Sterling compliance@hawkeye-sterling.netlify.app";
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          company: subjectName,
          owner: "include",
          action: "getcompany",
          output: "atom",
          count: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://www.sec.gov/cgi-bin/browse-edgar?${params.toString()}`, {
            headers: { "user-agent": ua, accept: "application/atom+xml" },
          }),
        );
        if (!res.ok) return [];
        const xml = await res.text();
        // Cheap atom parsing — pull <entry> blocks via regex; we only need
        // company name + CIK + URL for triage. A full XML parser is
        // unnecessary for the discovery surface here.
        const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
        const records: RegistryRecord[] = [];
        for (const entry of entries) {
          const title = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1]?.trim();
          if (!title) continue;
          const link = /<link[^>]*href="([^"]+)"/.exec(entry)?.[1];
          const cik = /CIK=(\d+)/.exec(entry)?.[1];
          const updated = /<updated>([\s\S]*?)<\/updated>/.exec(entry)?.[1]?.trim();
          const rec: RegistryRecord = {
            source: "sec-edgar",
            name: title.replace(/\s*\(\d+\)\s*$/, ""),
            jurisdiction: "US",
            ...(cik ? { registrationNumber: `CIK-${cik}` } : {}),
            ...(updated ? { incorporationDate: updated } : {}),
            ...(link ? { url: link } : {}),
          };
          records.push(rec);
        }
        return records;
      } catch (err) {
        console.warn("[sec-edgar] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── ICIJ Offshore Leaks — public DB. Default-on (HS_DISABLED=icij-offshore-leaks to opt out).
function icijOffshoreLeaksAdapter(): RegistryAdapter {
  if (!flagOn("icij-offshore-leaks")) return NULL_REGISTRY_ADAPTER;
  // ICIJ offers offshoreleaks.icij.org search; programmatic access is via
  // their public Neo4j export. This adapter performs a server-side search
  // and parses the basic-results JSON the search endpoint returns.
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: subjectName,
          c: "Entities",
          j: "All",
          d: "All",
        });
        const res = await abortable(
          fetch(`https://offshoreleaks.icij.org/search?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as
          | { results?: Array<{ name?: string; jurisdiction?: string; node_id?: string; status?: string; incorporation_date?: string }> }
          | unknown;
        const arr = (json as { results?: unknown }).results;
        if (!Array.isArray(arr)) return [];
        return (arr as Array<{ name?: string; jurisdiction?: string; node_id?: string; status?: string; incorporation_date?: string }>)
          .slice(0, opts?.limit ?? 25)
          .filter((r) => r.name)
          .map((r) => ({
            source: "icij-offshore-leaks",
            name: r.name!,
            ...(r.jurisdiction ? { jurisdiction: r.jurisdiction } : {}),
            ...(r.node_id ? { registrationNumber: `OL-${r.node_id}` } : {}),
            ...(r.status ? { status: r.status } : {}),
            ...(r.incorporation_date ? { incorporationDate: r.incorporation_date } : {}),
            ...(r.node_id ? { url: `https://offshoreleaks.icij.org/nodes/${r.node_id}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[icij-offshore-leaks] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Crunchbase — premium ────────────────────────────────────────────
function crunchbaseAdapter(): RegistryAdapter {
  const key = process.env["CRUNCHBASE_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          field_ids: ["identifier", "name", "short_description", "location_identifiers", "founded_on", "operating_status", "permalink"],
          query: [{ type: "predicate", field_id: "name", operator_id: "starts", values: [subjectName] }],
          limit: opts?.limit ?? 25,
        };
        const res = await abortable(
          fetch("https://api.crunchbase.com/api/v4/searches/organizations", {
            method: "POST",
            headers: {
              "X-cb-user-key": key,
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          entities?: Array<{ properties?: { name?: string; permalink?: string; founded_on?: { value?: string }; operating_status?: string } }>;
        };
        return (json.entities ?? [])
          .filter((e) => e.properties?.name)
          .map((e) => {
            const p = e.properties!;
            return {
              source: "crunchbase",
              name: p.name!,
              ...(p.operating_status ? { status: p.operating_status } : {}),
              ...(p.founded_on?.value ? { incorporationDate: p.founded_on.value } : {}),
              ...(p.permalink ? { url: `https://www.crunchbase.com/organization/${p.permalink}` } : {}),
            } satisfies RegistryRecord;
          });
      } catch (err) {
        console.warn("[crunchbase] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── PitchBook — premium ─────────────────────────────────────────────
function pitchbookAdapter(): RegistryAdapter {
  const key = process.env["PITCHBOOK_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: subjectName,
          limit: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://api.pitchbook.com/v1/companies/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{ companyName?: string; companyId?: string; status?: string; foundedYear?: string; pbWebUrl?: string; hqLocation?: { country?: string } }>;
        };
        return (json.data ?? [])
          .filter((c) => c.companyName)
          .map((c) => ({
            source: "pitchbook",
            name: c.companyName!,
            ...(c.hqLocation?.country ? { jurisdiction: c.hqLocation.country } : {}),
            ...(c.companyId ? { registrationNumber: c.companyId } : {}),
            ...(c.status ? { status: c.status } : {}),
            ...(c.foundedYear ? { incorporationDate: c.foundedYear } : {}),
            ...(c.pbWebUrl ? { url: c.pbWebUrl } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[pitchbook] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Dun & Bradstreet — premium ────────────────────────────────────────
function dunBradstreetAdapter(): RegistryAdapter {
  const key = process.env["DNB_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          searchTerm: subjectName,
          pageSize: String(opts?.limit ?? 25),
          ...(opts?.jurisdiction ? { countryISOAlpha2Code: opts.jurisdiction.toUpperCase() } : {}),
        });
        const res = await abortable(
          fetch(`https://plus.dnb.com/v1/search/companyList?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          searchCandidates?: Array<{ organization?: { duns?: string; primaryName?: string; primaryAddress?: { addressCountry?: { isoAlpha2Code?: string } }; dunsControlStatus?: { operatingStatus?: { description?: string } }; registrationNumbers?: Array<{ registrationNumber?: string }> } }>;
        };
        return (json.searchCandidates ?? [])
          .map((c) => c.organization)
          .filter((o): o is NonNullable<typeof o> => !!o?.primaryName)
          .map((o) => ({
            source: "dnb",
            name: o.primaryName!,
            ...(o.primaryAddress?.addressCountry?.isoAlpha2Code ? { jurisdiction: o.primaryAddress.addressCountry.isoAlpha2Code } : {}),
            ...(o.duns ? { registrationNumber: `DUNS-${o.duns}` } : (o.registrationNumbers?.[0]?.registrationNumber ? { registrationNumber: o.registrationNumbers[0].registrationNumber } : {})),
            ...(o.dunsControlStatus?.operatingStatus?.description ? { status: o.dunsControlStatus.operatingStatus.description } : {}),
            ...(o.duns ? { url: `https://www.dnb.com/business-directory/company-profiles.${o.duns}.html` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[dnb] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Bureau van Dijk Orbis (Moody's) — premium ─────────────────────────
function bvdOrbisAdapter(): RegistryAdapter {
  const key = process.env["BVD_ORBIS_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          WHERE: [{ MATCH: { Criteria: "MatchOnNameOnly", Query: subjectName } }],
          SELECT: ["NAME", "COUNTRY", "BVDID", "STATUSDATE", "STATUS", "INCORPORATIONDATE"],
          PAGE_SIZE: opts?.limit ?? 25,
        };
        const res = await abortable(
          fetch("https://api.bvdinfo.com/api/orbis/Companies/data", {
            method: "POST",
            headers: { ApiToken: key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          Data?: Array<{ NAME?: string; COUNTRY?: string; BVDID?: string; STATUS?: string; INCORPORATIONDATE?: string }>;
        };
        return (json.Data ?? [])
          .filter((d) => d.NAME)
          .map((d) => ({
            source: "bvd-orbis",
            name: d.NAME!,
            ...(d.COUNTRY ? { jurisdiction: d.COUNTRY } : {}),
            ...(d.BVDID ? { registrationNumber: d.BVDID } : {}),
            ...(d.STATUS ? { status: d.STATUS } : {}),
            ...(d.INCORPORATIONDATE ? { incorporationDate: d.INCORPORATIONDATE } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[bvd-orbis] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Kyckr — premium official-source registry aggregator ──────────────
function kyckrAdapter(): RegistryAdapter {
  const key = process.env["KYCKR_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: subjectName,
          ...(opts?.jurisdiction ? { country: opts.jurisdiction } : {}),
          limit: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://api.kyckr.com/v2/companies/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ name?: string; country?: string; companyNumber?: string; status?: string; incorporationDate?: string; registryUrl?: string }>;
        };
        return (json.results ?? [])
          .filter((r) => r.name)
          .map((r) => ({
            source: "kyckr",
            name: r.name!,
            ...(r.country ? { jurisdiction: r.country } : {}),
            ...(r.companyNumber ? { registrationNumber: r.companyNumber } : {}),
            ...(r.status ? { status: r.status } : {}),
            ...(r.incorporationDate ? { incorporationDate: r.incorporationDate } : {}),
            ...(r.registryUrl ? { url: r.registryUrl } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[kyckr] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── ZoomInfo — premium B2B intelligence ──────────────────────────────
function zoomInfoAdapter(): RegistryAdapter {
  const key = process.env["ZOOMINFO_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          companyName: subjectName,
          rpp: opts?.limit ?? 25,
          ...(opts?.jurisdiction ? { country: opts.jurisdiction } : {}),
        };
        const res = await abortable(
          fetch("https://api.zoominfo.com/search/company", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{ name?: string; country?: string; id?: number; foundedYear?: number; companyStatus?: string; website?: string }>;
        };
        return (json.data ?? [])
          .filter((d) => d.name)
          .map((d) => ({
            source: "zoominfo",
            name: d.name!,
            ...(d.country ? { jurisdiction: d.country } : {}),
            ...(d.id ? { registrationNumber: `ZI-${d.id}` } : {}),
            ...(d.companyStatus ? { status: d.companyStatus } : {}),
            ...(d.foundedYear ? { incorporationDate: String(d.foundedYear) } : {}),
            ...(d.website ? { url: d.website } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[zoominfo] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── S&P Capital IQ — premium financials ──────────────────────────────
function capitalIqAdapter(): RegistryAdapter {
  const key = process.env["CAPITALIQ_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          inputRequests: [{
            function: "GDSPV",
            identifier: subjectName,
            mnemonic: "IQ_COMPANY_NAME",
            ...(opts?.jurisdiction ? { properties: { country: opts.jurisdiction } } : {}),
          }],
        };
        const res = await abortable(
          fetch("https://api-ciq.marketintelligence.spglobal.com/gdsapi/rest/v3/clientservice.json", {
            method: "POST",
            headers: { Authorization: `Basic ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          GDSSDKResponse?: Array<{ Headers?: string[]; Rows?: Array<{ Row?: string[] }>; Properties?: { country?: string } }>;
        };
        const responses = json.GDSSDKResponse ?? [];
        const records: RegistryRecord[] = [];
        for (const r of responses) {
          for (const row of r.Rows ?? []) {
            const nm = row.Row?.[0];
            if (!nm) continue;
            records.push({
              source: "capitaliq",
              name: nm,
              ...(r.Properties?.country ? { jurisdiction: r.Properties.country } : {}),
            });
          }
        }
        return records;
      } catch (err) {
        console.warn("[capitaliq] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── LexisNexis Diligence (RDC successor) — premium ────────────────────
function lexisNexisDiligenceAdapter(): RegistryAdapter {
  const key = process.env["LEXISNEXIS_DILIGENCE_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          searchTerm: subjectName,
          ...(opts?.jurisdiction ? { country: opts.jurisdiction } : {}),
          maxResults: opts?.limit ?? 25,
        };
        const res = await abortable(
          fetch("https://api.diligence.lexisnexis.com/v1/entities/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          entities?: Array<{ name?: string; country?: string; entityId?: string; status?: string; incorporationDate?: string }>;
        };
        return (json.entities ?? [])
          .filter((e) => e.name)
          .map((e) => ({
            source: "lexisnexis-diligence",
            name: e.name!,
            ...(e.country ? { jurisdiction: e.country } : {}),
            ...(e.entityId ? { registrationNumber: e.entityId } : {}),
            ...(e.status ? { status: e.status } : {}),
            ...(e.incorporationDate ? { incorporationDate: e.incorporationDate } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[lexisnexis-diligence] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Northdata.com — DE/EU corporate registry, premium ──────────────
function northdataAdapter(): RegistryAdapter {
  const key = process.env["NORTHDATA_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ name: subjectName, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://www.northdata.com/_api/company/v1/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ name?: string; address?: { country?: string }; id?: string; status?: string; firstSeen?: string; url?: string }> };
        return (json.results ?? []).filter((r) => r.name).map((r) => ({
          source: "northdata", name: r.name!,
          ...(r.address?.country ? { jurisdiction: r.address.country } : {}),
          ...(r.id ? { registrationNumber: r.id } : {}),
          ...(r.status ? { status: r.status } : {}),
          ...(r.firstSeen ? { incorporationDate: r.firstSeen } : {}),
          ...(r.url ? { url: r.url } : {}),
        } satisfies RegistryRecord));
      } catch (err) { console.warn("[northdata] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── BoardEx — premium executive / board registry ───────────────────
function boardExAdapter(): RegistryAdapter {
  const key = process.env["BOARDEX_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ companyName: subjectName, max: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.boardex.com/v2/companies/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ companyName?: string; companyId?: string; country?: string; status?: string; foundedYear?: string }> };
        return (json.items ?? []).filter((i) => i.companyName).map((i) => ({
          source: "boardex", name: i.companyName!,
          ...(i.country ? { jurisdiction: i.country } : {}),
          ...(i.companyId ? { registrationNumber: i.companyId } : {}),
          ...(i.status ? { status: i.status } : {}),
          ...(i.foundedYear ? { incorporationDate: i.foundedYear } : {}),
        } satisfies RegistryRecord));
      } catch (err) { console.warn("[boardex] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Mergent Online (FactSet) — premium ─────────────────────────────
function mergentAdapter(): RegistryAdapter {
  const key = process.env["MERGENT_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ name: subjectName, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.mergent.com/v3/companies/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: Array<{ name?: string; mergent_id?: string; country?: string; status?: string; incorporation_date?: string }> };
        return (json.data ?? []).filter((d) => d.name).map((d) => ({
          source: "mergent", name: d.name!,
          ...(d.country ? { jurisdiction: d.country } : {}),
          ...(d.mergent_id ? { registrationNumber: d.mergent_id } : {}),
          ...(d.status ? { status: d.status } : {}),
          ...(d.incorporation_date ? { incorporationDate: d.incorporation_date } : {}),
        } satisfies RegistryRecord));
      } catch (err) { console.warn("[mergent] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Refinitiv Workspace Companies — premium ────────────────────────
function refinitivWorkspaceAdapter(): RegistryAdapter {
  const key = process.env["REFINITIV_WORKSPACE_API_KEY"];
  if (!key) return NULL_REGISTRY_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.refinitiv.com/data/companies/v1/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ name?: string; permId?: string; country?: string; status?: string; incorporationDate?: string }> };
        return (json.results ?? []).filter((r) => r.name).map((r) => ({
          source: "refinitiv-workspace", name: r.name!,
          ...(r.country ? { jurisdiction: r.country } : {}),
          ...(r.permId ? { registrationNumber: `PermID-${r.permId}` } : {}),
          ...(r.status ? { status: r.status } : {}),
          ...(r.incorporationDate ? { incorporationDate: r.incorporationDate } : {}),
        } satisfies RegistryRecord));
      } catch (err) { console.warn("[refinitiv-workspace] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Aggregator ────────────────────────────────────────────────────────
export function activeRegistryAdapters(): RegistryAdapter[] {
  return [
    openCorporatesAdapter(),
    companiesHouseAdapter(),
    secEdgarAdapter(),
    icijOffshoreLeaksAdapter(),
    crunchbaseAdapter(),
    pitchbookAdapter(),
    dunBradstreetAdapter(),
    bvdOrbisAdapter(),
    kyckrAdapter(),
    zoomInfoAdapter(),
    capitalIqAdapter(),
    lexisNexisDiligenceAdapter(),
    northdataAdapter(),
    boardExAdapter(),
    mergentAdapter(),
    refinitivWorkspaceAdapter(),
  ].filter((a) => a.isAvailable());
}

export function activeRegistryProviders(): string[] {
  // Free flags handled via featureFlags (default-on)
  const flags: Array<[boolean, string]> = [
    [flagOn("sec-edgar"), "sec-edgar"],
    [flagOn("icij-offshore-leaks"), "icij-offshore-leaks"],
  ];
  // Keyed providers — env var must be present
  const keys: Array<[string, string]> = [
    ["OPENCORPORATES_API_KEY", "opencorporates"],
    ["COMPANIES_HOUSE_API_KEY", "companies-house"],
    ["CRUNCHBASE_API_KEY", "crunchbase"],
    ["PITCHBOOK_API_KEY", "pitchbook"],
    ["DNB_API_KEY", "dnb"],
    ["BVD_ORBIS_API_KEY", "bvd-orbis"],
    ["KYCKR_API_KEY", "kyckr"],
    ["ZOOMINFO_API_KEY", "zoominfo"],
    ["CAPITALIQ_API_KEY", "capitaliq"],
    ["LEXISNEXIS_DILIGENCE_API_KEY", "lexisnexis-diligence"],
    ["NORTHDATA_API_KEY", "northdata"],
    ["BOARDEX_API_KEY", "boardex"],
    ["MERGENT_API_KEY", "mergent"],
    ["REFINITIV_WORKSPACE_API_KEY", "refinitiv-workspace"],
  ];
  const out: string[] = flags.filter(([on]) => on).map(([, n]) => n);
  for (const [envKey, name] of keys) {
    if (process.env[envKey]) out.push(name);
  }
  return out;
}

export async function searchAllRegistries(
  subjectName: string,
  opts?: { jurisdiction?: string; limit?: number },
): Promise<{ records: RegistryRecord[]; providersUsed: string[] }> {
  const adapters = activeRegistryAdapters();
  if (adapters.length === 0) return { records: [], providersUsed: [] };
  const results = await Promise.all(adapters.map((a) => a.search(subjectName, opts)));
  const merged = results.flat();
  // Dedupe by (source, name, registrationNumber)
  const seen = new Set<string>();
  const records = merged.filter((r) => {
    const k = `${r.source}|${r.name.toLowerCase()}|${r.registrationNumber ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { records, providersUsed: activeRegistryProviders() };
}
