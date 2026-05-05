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

function envOn(envKey: string): boolean {
  const v = process.env[envKey];
  if (!v) return false;
  if (v === "0" || v.toLowerCase() === "false") return false;
  return true;
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
  if (!envOn("ZEFIX_ENABLED")) return nullCountry("CH");
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
  if (!envOn("BRONNOYSUND_ENABLED")) return nullCountry("NO");
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
  if (!envOn("YTJ_ENABLED")) return nullCountry("FI");
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

// ── ALL country adapters list ────────────────────────────────────────
const COUNTRY_ADAPTERS: Array<() => CountryAdapter> = [
  fcaRegisterAdapter,
  zefixAdapter,
  kvkAdapter,
  bronnoysundAdapter,
  cvrAdapter,
  ytjAdapter,
  nzCompaniesAdapter,
  abrAdapter,
  acraAdapter,
  hkCompaniesAdapter,
  croIeAdapter,
  deBundesanzeigerAdapter,
  inseeAdapter,
  inMcaAdapter,
  uaeDedAdapter,
];

/** All configured country adapters whose env keys are present. */
export function activeCountryRegistryAdapters(): CountryAdapter[] {
  return COUNTRY_ADAPTERS.map((f) => f()).filter((a) => a.isAvailable());
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
  const results = await Promise.all(targets.map((a) => a.search(subjectName, { jurisdiction, limit }).catch(() => [])));
  const merged = results.flat();
  // Dedupe by (source, name, regNo)
  const seen = new Set<string>();
  const records = merged.filter((r) => {
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
