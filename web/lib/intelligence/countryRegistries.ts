// Hawkeye Sterling — country-specific public corporate registries.
//
// Each adapter wraps a single jurisdiction's authoritative business
// registry. Most are free with optional rate-limit keys; a few require
// commercial credentials. All env-key gated and degrade to NULL when
// keys (or toggle flags for free registries) are absent.
//
// Coverage targets jurisdictions on the FATF / EU AML high-risk lists
// plus the largest financial centres. Hawkeye Sterling routes use
// `searchCountryRegistries(name, jurisdiction)` which dispatches only
// to the registries serving the matching country code.

import type { RegistryAdapter, RegistryRecord } from "./registryAdapters";
import { NULL_REGISTRY_ADAPTER } from "./registryAdapters";
import { flagOn } from "./featureFlags";

const FETCH_TIMEOUT_MS = 12_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`country adapter exceeded ${ms}ms`)), ms),
    ),
  ]);
}

interface CountryAdapter extends RegistryAdapter {
  jurisdiction: string;     // ISO-2
}

function nullCountry(jurisdiction: string): CountryAdapter {
  return { ...NULL_REGISTRY_ADAPTER, jurisdiction };
}

// ── UK FCA Register — free, key-gated ─────────────────────────────────
function fcaRegisterAdapter(): CountryAdapter {
  const key = process.env["FCA_API_KEY"];
  const email = process.env["FCA_API_EMAIL"];
  if (!key || !email) return nullCountry("GB");
  return {
    jurisdiction: "GB",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const res = await abortable(
          fetch(`https://register.fca.org.uk/services/V0.1/Firm/Search?q=${encodeURIComponent(subjectName)}&type=firm`, {
            headers: { "X-Auth-Email": email, "X-Auth-Key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { Data?: Array<{ Name?: string; "Reference Number"?: string; Status?: string; URL?: string }> };
        return (json.Data ?? [])
          .slice(0, opts?.limit ?? 25)
          .filter((d) => d.Name)
          .map((d) => ({
            source: "fca-register",
            name: d.Name!,
            jurisdiction: "GB",
            ...(d["Reference Number"] ? { registrationNumber: d["Reference Number"] } : {}),
            ...(d.Status ? { status: d.Status } : {}),
            ...(d.URL ? { url: d.URL } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[fca] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Switzerland ZEFIX (Federal Commercial Registry) — free ────────────
function zefixAdapter(): CountryAdapter {
  if (!flagOn("zefix")) return nullCountry("CH");
  return {
    jurisdiction: "CH",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const res = await abortable(
          fetch("https://www.zefix.ch/ZefixPublicREST/api/v1/company/search", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
            body: JSON.stringify({ name: subjectName, languageKey: "en", maxEntries: opts?.limit ?? 25 }),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { list?: Array<{ name?: string; chid?: string; uid?: string; status?: string; legalSeat?: string; legalSeatId?: string }> };
        return (json.list ?? [])
          .filter((c) => c.name)
          .map((c) => ({
            source: "zefix",
            name: c.name!,
            jurisdiction: "CH",
            ...(c.uid ? { registrationNumber: c.uid } : c.chid ? { registrationNumber: c.chid } : {}),
            ...(c.status ? { status: c.status } : {}),
            ...(c.chid ? { url: `https://www.zefix.ch/en/search/entity/list/firm/${c.chid}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[zefix] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Netherlands KVK Handelsregister — free key tier ──────────────────
function kvkAdapter(): CountryAdapter {
  const key = process.env["KVK_API_KEY"];
  if (!key) return nullCountry("NL");
  return {
    jurisdiction: "NL",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ naam: subjectName, type: "hoofdvestiging,nevenvestiging,rechtspersoon", aantalPerPagina: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.kvk.nl/api/v1/zoeken?${params.toString()}`, {
            headers: { apikey: key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { resultaten?: Array<{ kvkNummer?: string; naam?: string; type?: string; vestigingsnummer?: string; links?: Array<{ rel?: string; href?: string }> }> };
        return (json.resultaten ?? [])
          .filter((r) => r.naam)
          .map((r) => ({
            source: "kvk",
            name: r.naam!,
            jurisdiction: "NL",
            ...(r.kvkNummer ? { registrationNumber: r.kvkNummer } : {}),
            ...(r.type ? { status: r.type } : {}),
            ...(r.links?.find((l) => l.rel === "basisprofiel")?.href ? { url: r.links.find((l) => l.rel === "basisprofiel")!.href! } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[kvk] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Norway Brønnøysund Registers — free, no key ──────────────────────
function bronnoysundAdapter(): CountryAdapter {
  if (!flagOn("bronnoysund")) return nullCountry("NO");
  return {
    jurisdiction: "NO",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ navn: subjectName, size: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://data.brreg.no/enhetsregisteret/api/enheter?${params.toString()}`, {
            headers: { accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { _embedded?: { enheter?: Array<{ navn?: string; organisasjonsnummer?: string; organisasjonsform?: { kode?: string }; stiftelsesdato?: string; konkurs?: boolean }> } };
        return (json._embedded?.enheter ?? [])
          .filter((e) => e.navn)
          .map((e) => ({
            source: "bronnoysund",
            name: e.navn!,
            jurisdiction: "NO",
            ...(e.organisasjonsnummer ? { registrationNumber: e.organisasjonsnummer } : {}),
            ...(e.organisasjonsform?.kode ? { status: e.konkurs ? "bankrupt" : e.organisasjonsform.kode } : {}),
            ...(e.stiftelsesdato ? { incorporationDate: e.stiftelsesdato } : {}),
            ...(e.organisasjonsnummer ? { url: `https://w2.brreg.no/enhet/sok/detalj.jsp?orgnr=${e.organisasjonsnummer}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[bronnoysund] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Denmark CVR — free, key-gated ────────────────────────────────────
function cvrAdapter(): CountryAdapter {
  const key = process.env["CVR_API_KEY"];
  if (!key) return nullCountry("DK");
  return {
    jurisdiction: "DK",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          query: { match: { "Vrvirksomhed.virksomhedMetadata.nyesteNavn.navn": subjectName } },
          size: opts?.limit ?? 25,
        };
        const res = await abortable(
          fetch("http://distribution.virk.dk/cvr-permanent/virksomhed/_search", {
            method: "POST",
            headers: { Authorization: `Basic ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { hits?: { hits?: Array<{ _source?: { Vrvirksomhed?: { cvrNummer?: number; virksomhedMetadata?: { nyesteNavn?: { navn?: string }; nyesteVirksomhedsstatus?: string; stiftelsesDato?: string } } } }> } };
        return (json.hits?.hits ?? [])
          .map((h) => h._source?.Vrvirksomhed)
          .filter((v): v is NonNullable<typeof v> => !!v?.virksomhedMetadata?.nyesteNavn?.navn)
          .map((v) => ({
            source: "cvr",
            name: v.virksomhedMetadata!.nyesteNavn!.navn!,
            jurisdiction: "DK",
            ...(v.cvrNummer ? { registrationNumber: String(v.cvrNummer) } : {}),
            ...(v.virksomhedMetadata!.nyesteVirksomhedsstatus ? { status: v.virksomhedMetadata!.nyesteVirksomhedsstatus } : {}),
            ...(v.virksomhedMetadata!.stiftelsesDato ? { incorporationDate: v.virksomhedMetadata!.stiftelsesDato } : {}),
            ...(v.cvrNummer ? { url: `https://datacvr.virk.dk/data/visenhed?enhedstype=virksomhed&id=${v.cvrNummer}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[cvr] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Finland YTJ Open Data — free, no key ─────────────────────────────
function ytjAdapter(): CountryAdapter {
  if (!flagOn("ytj")) return nullCountry("FI");
  return {
    jurisdiction: "FI",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ name: subjectName, totalResults: "true", maxResults: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://avoindata.prh.fi/bis/v1?${params.toString()}`, { headers: { accept: "application/json" } }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ name?: string; businessId?: string; registrationDate?: string; companyForm?: string }> };
        return (json.results ?? [])
          .filter((r) => r.name)
          .map((r) => ({
            source: "ytj",
            name: r.name!,
            jurisdiction: "FI",
            ...(r.businessId ? { registrationNumber: r.businessId } : {}),
            ...(r.companyForm ? { status: r.companyForm } : {}),
            ...(r.registrationDate ? { incorporationDate: r.registrationDate } : {}),
            ...(r.businessId ? { url: `https://www.ytj.fi/yritys/${r.businessId}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[ytj] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── New Zealand Companies Office — free key tier ─────────────────────
function nzCompaniesAdapter(): CountryAdapter {
  const key = process.env["NZ_COMPANIES_API_KEY"];
  if (!key) return nullCountry("NZ");
  return {
    jurisdiction: "NZ",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, "page-size": String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.business.govt.nz/services/v4/nzbn/entities?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ entityName?: string; nzbn?: string; entityStatusCode?: string; registrationDate?: string }> };
        return (json.items ?? [])
          .filter((i) => i.entityName)
          .map((i) => ({
            source: "nz-companies",
            name: i.entityName!,
            jurisdiction: "NZ",
            ...(i.nzbn ? { registrationNumber: i.nzbn } : {}),
            ...(i.entityStatusCode ? { status: i.entityStatusCode } : {}),
            ...(i.registrationDate ? { incorporationDate: i.registrationDate } : {}),
            ...(i.nzbn ? { url: `https://www.nzbn.govt.nz/mynzbn/nzbndetails/${i.nzbn}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[nz-companies] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Australia ABR (Business Register) — free, no key ────────────────
function abrAdapter(): CountryAdapter {
  const guid = process.env["ABR_API_GUID"];
  if (!guid) return nullCountry("AU");
  return {
    jurisdiction: "AU",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ name: subjectName, authenticationGuid: guid, maxResults: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://abr.business.gov.au/json/MatchingNames.aspx?${params.toString()}`),
        );
        if (!res.ok) return [];
        const txt = await res.text();
        // ABR returns JSONP-style "callback({...})"; strip wrapper.
        const cleaned = txt.replace(/^callback\(/, "").replace(/\)$/, "");
        const json = JSON.parse(cleaned) as { Names?: Array<{ Name?: string; Abn?: string; State?: string; AbnStatus?: string }> };
        return (json.Names ?? [])
          .filter((n) => n.Name)
          .map((n) => ({
            source: "abr",
            name: n.Name!,
            jurisdiction: "AU",
            ...(n.Abn ? { registrationNumber: `ABN-${n.Abn}` } : {}),
            ...(n.AbnStatus ? { status: n.AbnStatus } : {}),
            ...(n.Abn ? { url: `https://abr.business.gov.au/ABN/View?abn=${n.Abn}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[abr] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Singapore ACRA BizFile — premium ─────────────────────────────────
function acraAdapter(): CountryAdapter {
  const key = process.env["ACRA_API_KEY"];
  if (!key) return nullCountry("SG");
  return {
    jurisdiction: "SG",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://www.bizfile.gov.sg/ngbiz/api/v1/search?${params.toString()}`, {
            headers: { "x-api-key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ entityName?: string; uen?: string; entityStatus?: string; entityType?: string; registrationDate?: string }> };
        return (json.results ?? [])
          .filter((r) => r.entityName)
          .map((r) => ({
            source: "acra",
            name: r.entityName!,
            jurisdiction: "SG",
            ...(r.uen ? { registrationNumber: r.uen } : {}),
            ...(r.entityStatus ? { status: r.entityStatus } : {}),
            ...(r.registrationDate ? { incorporationDate: r.registrationDate } : {}),
            ...(r.uen ? { url: `https://www.bizfile.gov.sg/ngbportlet/web/extract/EntitySearchPublic.do?entityNo=${r.uen}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[acra] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Hong Kong Companies Registry — premium key ───────────────────────
function hkCompaniesAdapter(): CountryAdapter {
  const key = process.env["HK_COMPANIES_API_KEY"];
  if (!key) return nullCountry("HK");
  return {
    jurisdiction: "HK",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ companyName: subjectName, max: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://www.icris.cr.gov.hk/api/companySearch?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ companyName?: string; crNumber?: string; status?: string; incorporationDate?: string }> };
        return (json.results ?? [])
          .filter((r) => r.companyName)
          .map((r) => ({
            source: "hk-companies",
            name: r.companyName!,
            jurisdiction: "HK",
            ...(r.crNumber ? { registrationNumber: r.crNumber } : {}),
            ...(r.status ? { status: r.status } : {}),
            ...(r.incorporationDate ? { incorporationDate: r.incorporationDate } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[hk-companies] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Ireland CRO — premium key ────────────────────────────────────────
function croIeAdapter(): CountryAdapter {
  const key = process.env["IE_CRO_API_KEY"];
  if (!key) return nullCountry("IE");
  return {
    jurisdiction: "IE",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ company_name: subjectName, htmlEnc: "1" });
        const res = await abortable(
          fetch(`https://services.cro.ie/cws/companies?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as Array<{ company_name?: string; company_num?: number; company_status_desc?: string; company_reg_date?: string }>;
        return (Array.isArray(json) ? json : [])
          .slice(0, opts?.limit ?? 25)
          .filter((c) => c.company_name)
          .map((c) => ({
            source: "ie-cro",
            name: c.company_name!,
            jurisdiction: "IE",
            ...(c.company_num ? { registrationNumber: String(c.company_num) } : {}),
            ...(c.company_status_desc ? { status: c.company_status_desc } : {}),
            ...(c.company_reg_date ? { incorporationDate: c.company_reg_date } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[ie-cro] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Germany Bundesanzeiger / Handelsregister — premium ──────────────
function deBundesanzeigerAdapter(): CountryAdapter {
  const key = process.env["DE_HANDELSREGISTER_API_KEY"];
  if (!key) return nullCountry("DE");
  return {
    jurisdiction: "DE",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.handelsregister.de/v1/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ name?: string; registerNumber?: string; status?: string; courtName?: string; incorporationDate?: string }> };
        return (json.items ?? [])
          .filter((i) => i.name)
          .map((i) => ({
            source: "de-handelsregister",
            name: i.name!,
            jurisdiction: "DE",
            ...(i.registerNumber ? { registrationNumber: `${i.courtName ?? "HRB"}-${i.registerNumber}` } : {}),
            ...(i.status ? { status: i.status } : {}),
            ...(i.incorporationDate ? { incorporationDate: i.incorporationDate } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[de-handelsregister] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── France INSEE Sirene — free key tier ─────────────────────────────
function inseeAdapter(): CountryAdapter {
  const key = process.env["INSEE_API_KEY"];
  if (!key) return nullCountry("FR");
  return {
    jurisdiction: "FR",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `denominationUniteLegale:"${subjectName}"`,
          nombre: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://api.insee.fr/entreprises/sirene/V3.11/siren?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { unitesLegales?: Array<{ siren?: string; periodesUniteLegale?: Array<{ denominationUniteLegale?: string; etatAdministratifUniteLegale?: string; dateDebut?: string }>; dateCreationUniteLegale?: string }> };
        return (json.unitesLegales ?? [])
          .map((u) => {
            const period = u.periodesUniteLegale?.[0];
            const name = period?.denominationUniteLegale;
            if (!name) return null;
            const rec: RegistryRecord = {
              source: "insee-sirene",
              name,
              jurisdiction: "FR",
              ...(u.siren ? { registrationNumber: u.siren } : {}),
              ...(period?.etatAdministratifUniteLegale ? { status: period.etatAdministratifUniteLegale === "A" ? "active" : "ceased" } : {}),
              ...(u.dateCreationUniteLegale ? { incorporationDate: u.dateCreationUniteLegale } : {}),
              ...(u.siren ? { url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${u.siren}` } : {}),
            };
            return rec;
          })
          .filter((r): r is RegistryRecord => r !== null);
      } catch (err) {
        console.warn("[insee] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── India MCA21 — premium ────────────────────────────────────────────
function inMcaAdapter(): CountryAdapter {
  const key = process.env["IN_MCA_API_KEY"];
  if (!key) return nullCountry("IN");
  return {
    jurisdiction: "IN",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ companyName: subjectName, max: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://www.mca.gov.in/mcafoportal/api/companysearch?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ companyName?: string; cin?: string; status?: string; dateOfIncorporation?: string }> };
        return (json.results ?? [])
          .filter((r) => r.companyName)
          .map((r) => ({
            source: "in-mca",
            name: r.companyName!,
            jurisdiction: "IN",
            ...(r.cin ? { registrationNumber: r.cin } : {}),
            ...(r.status ? { status: r.status } : {}),
            ...(r.dateOfIncorporation ? { incorporationDate: r.dateOfIncorporation } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[in-mca] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── UAE: DED Dubai Trade Licence — premium ──────────────────────────
function uaeDedAdapter(): CountryAdapter {
  const key = process.env["UAE_DED_API_KEY"];
  if (!key) return nullCountry("AE");
  return {
    jurisdiction: "AE",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = { tradeName: subjectName, limit: opts?.limit ?? 25 };
        const res = await abortable(
          fetch("https://api.dubaided.gov.ae/v1/licences/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { licences?: Array<{ tradeName?: string; licenceNumber?: string; status?: string; issueDate?: string }> };
        return (json.licences ?? [])
          .filter((l) => l.tradeName)
          .map((l) => ({
            source: "uae-ded",
            name: l.tradeName!,
            jurisdiction: "AE",
            ...(l.licenceNumber ? { registrationNumber: l.licenceNumber } : {}),
            ...(l.status ? { status: l.status } : {}),
            ...(l.issueDate ? { incorporationDate: l.issueDate } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[uae-ded] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── UAE: DIFC Companies Registry — free public search ───────────────
// DIFC (Dubai International Financial Centre) entity search via
// OpenCorporates free tier, filtered to DIFC jurisdiction.
function uaeDifcAdapter(): CountryAdapter {
  return {
    jurisdiction: "AE",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: subjectName,
          jurisdiction_code: "ae_difc",
          per_page: String(Math.min(opts?.limit ?? 25, 30)),
        });
        const res = await abortable(
          fetch(`https://api.opencorporates.com/v0.4/companies/search?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: { companies?: Array<{ company?: { name?: string; company_number?: string; current_status?: string; incorporation_date?: string } }> } };
        return (json.results?.companies ?? [])
          .map((c) => c.company)
          .filter((c): c is NonNullable<typeof c> => !!c?.name)
          .map((c) => ({
            source: "uae-difc",
            name: c.name!,
            jurisdiction: "AE",
            ...(c.company_number ? { registrationNumber: c.company_number } : {}),
            ...(c.current_status ? { status: c.current_status } : {}),
            ...(c.incorporation_date ? { incorporationDate: c.incorporation_date } : {}),
            url: `https://www.difc.ae/business/companies/`,
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[uae-difc] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── UAE: ADGM Companies Register — free public search ───────────────
// ADGM (Abu Dhabi Global Market) entities via OpenCorporates free tier.
function uaeAdgmAdapter(): CountryAdapter {
  return {
    jurisdiction: "AE",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: subjectName,
          jurisdiction_code: "ae_adgm",
          per_page: String(Math.min(opts?.limit ?? 25, 30)),
        });
        const res = await abortable(
          fetch(`https://api.opencorporates.com/v0.4/companies/search?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: { companies?: Array<{ company?: { name?: string; company_number?: string; current_status?: string; incorporation_date?: string } }> } };
        return (json.results?.companies ?? [])
          .map((c) => c.company)
          .filter((c): c is NonNullable<typeof c> => !!c?.name)
          .map((c) => ({
            source: "uae-adgm",
            name: c.name!,
            jurisdiction: "AE",
            ...(c.company_number ? { registrationNumber: c.company_number } : {}),
            ...(c.current_status ? { status: c.current_status } : {}),
            ...(c.incorporation_date ? { incorporationDate: c.incorporation_date } : {}),
            url: `https://www.adgm.com/business/companies/`,
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[uae-adgm] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// LATIN AMERICA
// ─────────────────────────────────────────────────────────────────────

// ── Brazil Receita Federal CNPJ — free public ───────────────────────
function brReceitaAdapter(): CountryAdapter {
  if (!flagOn("br-receita")) return nullCountry("BR");
  return {
    jurisdiction: "BR",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const res = await abortable(
          fetch(`https://brasilapi.com.br/api/cnpj/v1/search?razao_social=${encodeURIComponent(subjectName)}&limit=${opts?.limit ?? 25}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ razao_social?: string; cnpj?: string; situacao_cadastral?: string; data_inicio_atividade?: string }> };
        return (json.items ?? [])
          .filter((i) => i.razao_social)
          .map((i) => ({
            source: "br-receita",
            name: i.razao_social!,
            jurisdiction: "BR",
            ...(i.cnpj ? { registrationNumber: i.cnpj } : {}),
            ...(i.situacao_cadastral ? { status: i.situacao_cadastral } : {}),
            ...(i.data_inicio_atividade ? { incorporationDate: i.data_inicio_atividade } : {}),
            ...(i.cnpj ? { url: `https://cnpj.biz/${i.cnpj.replace(/\D/g, "")}` } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[br-receita] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

function genericKeyAdapter(opts: {
  envKey: string; jurisdiction: string; source: string; baseUrl: string; queryParam: string;
  parser: (json: unknown) => RegistryRecord[];
  authHeader?: (key: string) => Record<string, string>;
}): CountryAdapter {
  const key = process.env[opts.envKey];
  if (!key) return nullCountry(opts.jurisdiction);
  return {
    jurisdiction: opts.jurisdiction,
    isAvailable: () => true,
    search: async (subjectName, query) => {
      try {
        const params = new URLSearchParams({ [opts.queryParam]: subjectName, limit: String(query?.limit ?? 25) });
        const headers: Record<string, string> = {
          accept: "application/json",
          ...(opts.authHeader ? opts.authHeader(key) : { Authorization: `Bearer ${key}` }),
        };
        const res = await abortable(fetch(`${opts.baseUrl}?${params.toString()}`, { headers }));
        if (!res.ok) return [];
        const json = await res.json();
        return opts.parser(json);
      } catch (err) {
        console.warn(`[${opts.source}] failed:`, err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

const mxSatAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "MX_SAT_API_KEY", jurisdiction: "MX", source: "mx-sat",
  baseUrl: "https://api.sat.gob.mx/v1/contribuyentes/search", queryParam: "razon_social",
  parser: (j) => ((j as { results?: Array<{ razon_social?: string; rfc?: string; estatus?: string; fecha_alta?: string }> }).results ?? [])
    .filter((r) => r.razon_social).map((r) => ({
      source: "mx-sat", name: r.razon_social!, jurisdiction: "MX",
      ...(r.rfc ? { registrationNumber: r.rfc } : {}),
      ...(r.estatus ? { status: r.estatus } : {}),
      ...(r.fecha_alta ? { incorporationDate: r.fecha_alta } : {}),
    } satisfies RegistryRecord)),
});

const arIgjAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "AR_IGJ_API_KEY", jurisdiction: "AR", source: "ar-igj",
  baseUrl: "https://api.igj.gob.ar/v1/sociedades/search", queryParam: "denominacion",
  parser: (j) => ((j as { results?: Array<{ denominacion?: string; cuit?: string; estado?: string; fecha_inscripcion?: string }> }).results ?? [])
    .filter((r) => r.denominacion).map((r) => ({
      source: "ar-igj", name: r.denominacion!, jurisdiction: "AR",
      ...(r.cuit ? { registrationNumber: r.cuit } : {}),
      ...(r.estado ? { status: r.estado } : {}),
      ...(r.fecha_inscripcion ? { incorporationDate: r.fecha_inscripcion } : {}),
    } satisfies RegistryRecord)),
});

function coRuesAdapter(): CountryAdapter {
  if (!flagOn("co-rues")) return nullCountry("CO");
  return {
    jurisdiction: "CO",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ razon_social: subjectName, page_size: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://www.rues.org.co/api/empresas/search?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ razon_social?: string; nit?: string; estado_matricula?: string; fecha_matricula?: string }> };
        return (json.results ?? [])
          .filter((r) => r.razon_social)
          .map((r) => ({
            source: "co-rues",
            name: r.razon_social!,
            jurisdiction: "CO",
            ...(r.nit ? { registrationNumber: r.nit } : {}),
            ...(r.estado_matricula ? { status: r.estado_matricula } : {}),
            ...(r.fecha_matricula ? { incorporationDate: r.fecha_matricula } : {}),
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[co-rues] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

const clSiiAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "CL_SII_API_KEY", jurisdiction: "CL", source: "cl-sii",
  baseUrl: "https://api.sii.cl/v1/contribuyentes", queryParam: "razon_social",
  parser: (j) => ((j as { resultados?: Array<{ razon_social?: string; rut?: string; estado?: string; fecha_inicio_actividades?: string }> }).resultados ?? [])
    .filter((r) => r.razon_social).map((r) => ({
      source: "cl-sii", name: r.razon_social!, jurisdiction: "CL",
      ...(r.rut ? { registrationNumber: r.rut } : {}),
      ...(r.estado ? { status: r.estado } : {}),
      ...(r.fecha_inicio_actividades ? { incorporationDate: r.fecha_inicio_actividades } : {}),
    } satisfies RegistryRecord)),
});

const peSunatAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "PE_SUNAT_API_KEY", jurisdiction: "PE", source: "pe-sunat",
  baseUrl: "https://api.sunat.gob.pe/v1/contribuyentes", queryParam: "razon_social",
  parser: (j) => ((j as { results?: Array<{ razonSocial?: string; ruc?: string; estado?: string; fechaInscripcion?: string }> }).results ?? [])
    .filter((r) => r.razonSocial).map((r) => ({
      source: "pe-sunat", name: r.razonSocial!, jurisdiction: "PE",
      ...(r.ruc ? { registrationNumber: r.ruc } : {}),
      ...(r.estado ? { status: r.estado } : {}),
      ...(r.fechaInscripcion ? { incorporationDate: r.fechaInscripcion } : {}),
    } satisfies RegistryRecord)),
});

// ─────────────────────────────────────────────────────────────────────
// EAST ASIA
// ─────────────────────────────────────────────────────────────────────

const jpEdinetAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "JP_EDINET_API_KEY", jurisdiction: "JP", source: "jp-edinet",
  baseUrl: "https://api.edinet-fsa.go.jp/api/v2/documents", queryParam: "filer",
  authHeader: (k) => ({ "Subscription-Key": k }),
  parser: (j) => ((j as { results?: Array<{ filerName?: string; edinetCode?: string; status?: string; submitDateTime?: string }> }).results ?? [])
    .filter((r) => r.filerName).map((r) => ({
      source: "jp-edinet", name: r.filerName!, jurisdiction: "JP",
      ...(r.edinetCode ? { registrationNumber: r.edinetCode } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.submitDateTime ? { incorporationDate: r.submitDateTime } : {}),
    } satisfies RegistryRecord)),
});

function krDartAdapter(): CountryAdapter {
  const key = process.env["KR_DART_API_KEY"];
  if (!key) return nullCountry("KR");
  return {
    jurisdiction: "KR",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ corp_name: subjectName, page_count: String(opts?.limit ?? 25), crtfc_key: key });
        const res = await abortable(fetch(`https://opendart.fss.or.kr/api/list.json?${params.toString()}`));
        if (!res.ok) return [];
        const json = (await res.json()) as { list?: Array<{ corp_name?: string; corp_code?: string; corp_cls?: string; rcept_dt?: string }> };
        return (json.list ?? []).filter((r) => r.corp_name).map((r) => ({
          source: "kr-dart", name: r.corp_name!, jurisdiction: "KR",
          ...(r.corp_code ? { registrationNumber: r.corp_code } : {}),
          ...(r.corp_cls ? { status: r.corp_cls } : {}),
          ...(r.rcept_dt ? { incorporationDate: r.rcept_dt } : {}),
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[kr-dart] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

const cnNecipsAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "CN_NECIPS_API_KEY", jurisdiction: "CN", source: "cn-necips",
  baseUrl: "https://api.gsxt.gov.cn/v1/enterprise/search", queryParam: "name",
  authHeader: (k) => ({ "x-api-key": k }),
  parser: (j) => ((j as { results?: Array<{ name?: string; uniscid?: string; status?: string; estDate?: string }> }).results ?? [])
    .filter((r) => r.name).map((r) => ({
      source: "cn-necips", name: r.name!, jurisdiction: "CN",
      ...(r.uniscid ? { registrationNumber: r.uniscid } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.estDate ? { incorporationDate: r.estDate } : {}),
    } satisfies RegistryRecord)),
});

const twMoeaAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "TW_MOEA_API_KEY", jurisdiction: "TW", source: "tw-moea",
  baseUrl: "https://data.gcis.nat.gov.tw/od/data/api/companysearch", queryParam: "companyName",
  parser: (j) => (Array.isArray(j) ? (j as Array<{ Company_Name?: string; Business_Accounting_NO?: string; Company_Status_Desc?: string; Company_Setup_Date?: string }>) : [])
    .filter((r) => r.Company_Name).map((r) => ({
      source: "tw-moea", name: r.Company_Name!, jurisdiction: "TW",
      ...(r.Business_Accounting_NO ? { registrationNumber: r.Business_Accounting_NO } : {}),
      ...(r.Company_Status_Desc ? { status: r.Company_Status_Desc } : {}),
      ...(r.Company_Setup_Date ? { incorporationDate: r.Company_Setup_Date } : {}),
    } satisfies RegistryRecord)),
});

// ─────────────────────────────────────────────────────────────────────
// EASTERN EUROPE / CIS / TURKEY
// ─────────────────────────────────────────────────────────────────────

const ruEgrulAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "RU_EGRUL_API_KEY", jurisdiction: "RU", source: "ru-egrul",
  baseUrl: "https://api.egrul.nalog.ru/v1/search", queryParam: "q",
  parser: (j) => ((j as { results?: Array<{ name?: string; ogrn?: string; inn?: string; status?: string; regDate?: string }> }).results ?? [])
    .filter((r) => r.name).map((r) => ({
      source: "ru-egrul", name: r.name!, jurisdiction: "RU",
      ...(r.ogrn ? { registrationNumber: `OGRN-${r.ogrn}` } : r.inn ? { registrationNumber: `INN-${r.inn}` } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.regDate ? { incorporationDate: r.regDate } : {}),
    } satisfies RegistryRecord)),
});

function uaYedrAdapter(): CountryAdapter {
  if (!flagOn("ua-yedr")) return nullCountry("UA");
  return {
    jurisdiction: "UA",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://opendatabot.ua/api/v3/companies?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ name?: string; code?: string; status?: string; date_registration?: string }> };
        return (json.items ?? []).filter((r) => r.name).map((r) => ({
          source: "ua-yedr", name: r.name!, jurisdiction: "UA",
          ...(r.code ? { registrationNumber: r.code } : {}),
          ...(r.status ? { status: r.status } : {}),
          ...(r.date_registration ? { incorporationDate: r.date_registration } : {}),
        } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[ua-yedr] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

const kzMneAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "KZ_MNE_API_KEY", jurisdiction: "KZ", source: "kz-mne",
  baseUrl: "https://api.stat.gov.kz/api/v1/enterprises/search", queryParam: "name",
  parser: (j) => ((j as { items?: Array<{ name?: string; bin?: string; status?: string; regDate?: string }> }).items ?? [])
    .filter((r) => r.name).map((r) => ({
      source: "kz-mne", name: r.name!, jurisdiction: "KZ",
      ...(r.bin ? { registrationNumber: r.bin } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.regDate ? { incorporationDate: r.regDate } : {}),
    } satisfies RegistryRecord)),
});

const trMersisAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "TR_MERSIS_API_KEY", jurisdiction: "TR", source: "tr-mersis",
  baseUrl: "https://api.mersis.gov.tr/v1/firma/search", queryParam: "unvan",
  parser: (j) => ((j as { results?: Array<{ unvan?: string; mersisNo?: string; durum?: string; tescilTarihi?: string }> }).results ?? [])
    .filter((r) => r.unvan).map((r) => ({
      source: "tr-mersis", name: r.unvan!, jurisdiction: "TR",
      ...(r.mersisNo ? { registrationNumber: r.mersisNo } : {}),
      ...(r.durum ? { status: r.durum } : {}),
      ...(r.tescilTarihi ? { incorporationDate: r.tescilTarihi } : {}),
    } satisfies RegistryRecord)),
});

// ─────────────────────────────────────────────────────────────────────
// MENA
// ─────────────────────────────────────────────────────────────────────

const saMocAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "SA_MOC_API_KEY", jurisdiction: "SA", source: "sa-moc",
  baseUrl: "https://api.mc.gov.sa/v1/businesses/search", queryParam: "name",
  parser: (j) => ((j as { results?: Array<{ name?: string; crNumber?: string; status?: string; issueDate?: string }> }).results ?? [])
    .filter((r) => r.name).map((r) => ({
      source: "sa-moc", name: r.name!, jurisdiction: "SA",
      ...(r.crNumber ? { registrationNumber: r.crNumber } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.issueDate ? { incorporationDate: r.issueDate } : {}),
    } satisfies RegistryRecord)),
});

const qaQfcAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "QA_QFC_API_KEY", jurisdiction: "QA", source: "qa-qfc",
  baseUrl: "https://api.qfc.qa/v1/firms/search", queryParam: "entityName",
  parser: (j) => ((j as { firms?: Array<{ name?: string; qfcNumber?: string; status?: string; licensingDate?: string }> }).firms ?? [])
    .filter((r) => r.name).map((r) => ({
      source: "qa-qfc", name: r.name!, jurisdiction: "QA",
      ...(r.qfcNumber ? { registrationNumber: r.qfcNumber } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.licensingDate ? { incorporationDate: r.licensingDate } : {}),
    } satisfies RegistryRecord)),
});

const bhMoictAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "BH_MOICT_API_KEY", jurisdiction: "BH", source: "bh-moict",
  baseUrl: "https://api.moic.gov.bh/v1/sijilat/search", queryParam: "name",
  parser: (j) => ((j as { results?: Array<{ name?: string; cr?: string; status?: string; date?: string }> }).results ?? [])
    .filter((r) => r.name).map((r) => ({
      source: "bh-moict", name: r.name!, jurisdiction: "BH",
      ...(r.cr ? { registrationNumber: r.cr } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.date ? { incorporationDate: r.date } : {}),
    } satisfies RegistryRecord)),
});

const egGafiAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "EG_GAFI_API_KEY", jurisdiction: "EG", source: "eg-gafi",
  baseUrl: "https://api.gafi.gov.eg/v1/companies/search", queryParam: "companyName",
  parser: (j) => ((j as { results?: Array<{ name?: string; commercialRegister?: string; status?: string; incorporationDate?: string }> }).results ?? [])
    .filter((r) => r.name).map((r) => ({
      source: "eg-gafi", name: r.name!, jurisdiction: "EG",
      ...(r.commercialRegister ? { registrationNumber: r.commercialRegister } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.incorporationDate ? { incorporationDate: r.incorporationDate } : {}),
    } satisfies RegistryRecord)),
});

// ─────────────────────────────────────────────────────────────────────
// SUB-SAHARAN AFRICA
// ─────────────────────────────────────────────────────────────────────

const zaCipcAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "ZA_CIPC_API_KEY", jurisdiction: "ZA", source: "za-cipc",
  baseUrl: "https://api.cipc.co.za/v1/enterprises/search", queryParam: "enterpriseName",
  parser: (j) => ((j as { enterprises?: Array<{ enterpriseName?: string; enterpriseNumber?: string; enterpriseStatus?: string; registrationDate?: string }> }).enterprises ?? [])
    .filter((r) => r.enterpriseName).map((r) => ({
      source: "za-cipc", name: r.enterpriseName!, jurisdiction: "ZA",
      ...(r.enterpriseNumber ? { registrationNumber: r.enterpriseNumber } : {}),
      ...(r.enterpriseStatus ? { status: r.enterpriseStatus } : {}),
      ...(r.registrationDate ? { incorporationDate: r.registrationDate } : {}),
    } satisfies RegistryRecord)),
});

const ngCacAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "NG_CAC_API_KEY", jurisdiction: "NG", source: "ng-cac",
  baseUrl: "https://api.cac.gov.ng/v2/companies/search", queryParam: "companyName",
  parser: (j) => ((j as { results?: Array<{ companyName?: string; rcNumber?: string; status?: string; dateOfRegistration?: string }> }).results ?? [])
    .filter((r) => r.companyName).map((r) => ({
      source: "ng-cac", name: r.companyName!, jurisdiction: "NG",
      ...(r.rcNumber ? { registrationNumber: r.rcNumber } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.dateOfRegistration ? { incorporationDate: r.dateOfRegistration } : {}),
    } satisfies RegistryRecord)),
});

const keBrsAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "KE_BRS_API_KEY", jurisdiction: "KE", source: "ke-brs",
  baseUrl: "https://api.brs.go.ke/v1/businesses/search", queryParam: "businessName",
  parser: (j) => ((j as { results?: Array<{ businessName?: string; registrationNumber?: string; status?: string; registrationDate?: string }> }).results ?? [])
    .filter((r) => r.businessName).map((r) => ({
      source: "ke-brs", name: r.businessName!, jurisdiction: "KE",
      ...(r.registrationNumber ? { registrationNumber: r.registrationNumber } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.registrationDate ? { incorporationDate: r.registrationDate } : {}),
    } satisfies RegistryRecord)),
});

const ghRgdAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "GH_RGD_API_KEY", jurisdiction: "GH", source: "gh-rgd",
  baseUrl: "https://api.rgd.gov.gh/v1/companies/search", queryParam: "name",
  parser: (j) => ((j as { results?: Array<{ name?: string; tin?: string; status?: string; registrationDate?: string }> }).results ?? [])
    .filter((r) => r.name).map((r) => ({
      source: "gh-rgd", name: r.name!, jurisdiction: "GH",
      ...(r.tin ? { registrationNumber: r.tin } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.registrationDate ? { incorporationDate: r.registrationDate } : {}),
    } satisfies RegistryRecord)),
});

// ─────────────────────────────────────────────────────────────────────
// OFFSHORE CARIBBEAN  (high-AML-risk centres)
// ─────────────────────────────────────────────────────────────────────

const kyCimaAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "KY_CIMA_API_KEY", jurisdiction: "KY", source: "ky-cima",
  baseUrl: "https://api.cima.ky/v1/entities/search", queryParam: "entityName",
  parser: (j) => ((j as { entities?: Array<{ name?: string; licenceNumber?: string; status?: string; licenceDate?: string }> }).entities ?? [])
    .filter((r) => r.name).map((r) => ({
      source: "ky-cima", name: r.name!, jurisdiction: "KY",
      ...(r.licenceNumber ? { registrationNumber: r.licenceNumber } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.licenceDate ? { incorporationDate: r.licenceDate } : {}),
    } satisfies RegistryRecord)),
});

const bmBmaAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "BM_BMA_API_KEY", jurisdiction: "BM", source: "bm-bma",
  baseUrl: "https://api.bma.bm/v1/entities/search", queryParam: "entityName",
  parser: (j) => ((j as { results?: Array<{ entityName?: string; registrationNumber?: string; status?: string; incorporationDate?: string }> }).results ?? [])
    .filter((r) => r.entityName).map((r) => ({
      source: "bm-bma", name: r.entityName!, jurisdiction: "BM",
      ...(r.registrationNumber ? { registrationNumber: r.registrationNumber } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.incorporationDate ? { incorporationDate: r.incorporationDate } : {}),
    } satisfies RegistryRecord)),
});

const vgFscAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "VG_FSC_API_KEY", jurisdiction: "VG", source: "vg-fsc",
  baseUrl: "https://api.bvifsc.vg/v1/entities/search", queryParam: "companyName",
  parser: (j) => ((j as { results?: Array<{ companyName?: string; bcNumber?: string; status?: string; incorporationDate?: string }> }).results ?? [])
    .filter((r) => r.companyName).map((r) => ({
      source: "vg-fsc", name: r.companyName!, jurisdiction: "VG",
      ...(r.bcNumber ? { registrationNumber: r.bcNumber } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.incorporationDate ? { incorporationDate: r.incorporationDate } : {}),
    } satisfies RegistryRecord)),
});

const bsScbAdapter = (): CountryAdapter => genericKeyAdapter({
  envKey: "BS_SCB_API_KEY", jurisdiction: "BS", source: "bs-scb",
  baseUrl: "https://api.scb.gov.bs/v1/registrants/search", queryParam: "entityName",
  parser: (j) => ((j as { results?: Array<{ entityName?: string; registrationNumber?: string; status?: string; registrationDate?: string }> }).results ?? [])
    .filter((r) => r.entityName).map((r) => ({
      source: "bs-scb", name: r.entityName!, jurisdiction: "BS",
      ...(r.registrationNumber ? { registrationNumber: r.registrationNumber } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.registrationDate ? { incorporationDate: r.registrationDate } : {}),
    } satisfies RegistryRecord)),
});

// ── ALL country adapters list ────────────────────────────────────────
const COUNTRY_ADAPTERS: Array<() => CountryAdapter> = [
  // Original 15
  fcaRegisterAdapter, zefixAdapter, kvkAdapter, bronnoysundAdapter, cvrAdapter,
  ytjAdapter, nzCompaniesAdapter, abrAdapter, acraAdapter, hkCompaniesAdapter,
  croIeAdapter, deBundesanzeigerAdapter, inseeAdapter, inMcaAdapter, uaeDedAdapter,
  // UAE free registries (DIFC + ADGM via OpenCorporates)
  uaeDifcAdapter, uaeAdgmAdapter,
  // Latin America
  brReceitaAdapter, mxSatAdapter, arIgjAdapter, coRuesAdapter, clSiiAdapter, peSunatAdapter,
  // East Asia
  jpEdinetAdapter, krDartAdapter, cnNecipsAdapter, twMoeaAdapter,
  // Eastern Europe / CIS / Turkey
  ruEgrulAdapter, uaYedrAdapter, kzMneAdapter, trMersisAdapter,
  // MENA
  saMocAdapter, qaQfcAdapter, bhMoictAdapter, egGafiAdapter,
  // Sub-Saharan Africa
  zaCipcAdapter, ngCacAdapter, keBrsAdapter, ghRgdAdapter,
  // Offshore Caribbean
  kyCimaAdapter, bmBmaAdapter, vgFscAdapter, bsScbAdapter,
];

/** All configured country adapters whose env keys are present. */
export function activeCountryRegistryAdapters(): CountryAdapter[] {
  return COUNTRY_ADAPTERS.map((f) => f()).filter((a) => a.isAvailable());
}

/**
 * Post-filter: require that the returned company name shares ≥75% of the
 * query's meaningful tokens (length ≥ 4). This prevents generic registries
 * (e.g. Brønnøysund) from flooding results with loosely-matched entities
 * when searching common English words like "Test Subject".
 */
function isRegistryRelevant(queryName: string, resultName: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const queryTokens = normalize(queryName).split(" ").filter((t) => t.length >= 4);
  if (queryTokens.length === 0) return true; // no meaningful tokens → pass all
  const resultNorm = normalize(resultName);
  const matched = queryTokens.filter((t) => resultNorm.includes(t)).length;
  return matched / queryTokens.length >= 0.75;
}

/**
 * Country-aware dispatcher. If a jurisdiction is provided, fan out only to
 * registries serving that ISO-2; otherwise hit every active country
 * registry in parallel.
 */
export async function searchCountryRegistries(
  subjectName: string,
  jurisdiction?: string,
  limit?: number,
): Promise<{ records: RegistryRecord[]; jurisdictions: string[] }> {
  const adapters = activeCountryRegistryAdapters();
  const targets = jurisdiction
    ? adapters.filter((a) => a.jurisdiction === jurisdiction.toUpperCase())
    : adapters;
  if (targets.length === 0) return { records: [], jurisdictions: [] };
  const results = await Promise.all(targets.map((a) => a.search(subjectName, { jurisdiction, limit }).catch((err: unknown) => {
    console.warn(`[hawkeye] countryRegistries[${a.jurisdiction}] search failed:`, err);
    return [];
  })));
  const merged = results.flat();
  // Relevance filter: only include records with meaningful name similarity
  const relevant = merged.filter((r) => isRegistryRelevant(subjectName, r.name));
  // Dedupe by (source, name, regNo)
  const seen = new Set<string>();
  const records = relevant.filter((r) => {
    const k = `${r.source}|${r.name.toLowerCase()}|${r.registrationNumber ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { records, jurisdictions: targets.map((a) => a.jurisdiction) };
}

export function activeCountryRegistries(): Array<{ jurisdiction: string; provider: string }> {
  return activeCountryRegistryAdapters().map((a) => ({
    jurisdiction: a.jurisdiction,
    provider: a.search.name || a.jurisdiction.toLowerCase(),
  }));
}
