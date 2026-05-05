// Hawkeye Sterling — commercial vendor adapters.
//
// Wrappers for Sayari, LSEG (Refinitiv) World-Check One, and Dow Jones
// Risk & Compliance. All env-key-gated — when the key is absent the
// wrapper returns the NULL adapter so callers transparently fall back.
//
// Once the operator drops a key into Netlify env vars and pushes a
// deploy, these wrappers light up automatically — no code change needed.

import type { CorporateRegistryAdapter, CorporateRecord } from "./externalAdapters";
import { NULL_CORPORATE_ADAPTER } from "./externalAdapters";

const FETCH_TIMEOUT_MS = 12_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`adapter exceeded ${ms}ms`)), ms),
    ),
  ]);
}

// ── Sayari Graph — corporate / shipping / litigation registry ────────────
function sayariAdapter(): CorporateRegistryAdapter {
  const key = process.env["SAYARI_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name: string, jurisdiction?: string): Promise<CorporateRecord[]> => {
      if (!name.trim()) return [];
      try {
        const url = `https://api.sayari.com/v1/search/entity?q=${encodeURIComponent(name)}${
          jurisdiction ? `&jurisdiction=${encodeURIComponent(jurisdiction)}` : ""
        }&types=company`;
        const res = await abortable(
          fetch(url, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{
            label?: string;
            jurisdiction?: string;
            registration_id?: string;
            status?: string;
            incorporation_date?: string;
            officers?: Array<{ name?: string; role?: string; appointment_date?: string }>;
          }>;
        };
        return (json.data ?? [])
          .filter((d) => d.label)
          .map((d) => ({
            source: "sayari",
            jurisdiction: d.jurisdiction ?? jurisdiction ?? "?",
            legalName: d.label!,
            ...(d.registration_id ? { registrationNumber: d.registration_id } : {}),
            ...(d.status ? { status: d.status } : {}),
            ...(d.incorporation_date ? { incorporatedAt: d.incorporation_date } : {}),
            ...(d.officers
              ? {
                  officers: d.officers
                    .filter((o) => o.name)
                    .map((o) => ({
                      name: o.name!,
                      role: o.role ?? "officer",
                      ...(o.appointment_date ? { appointedAt: o.appointment_date } : {}),
                    })),
                }
              : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[sayari] lookup failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── LSEG World-Check One ──────────────────────────────────────────────────
function lsegWorldCheckAdapter(): CorporateRegistryAdapter {
  const key = process.env["LSEG_WORLDCHECK_API_KEY"];
  const secret = process.env["LSEG_WORLDCHECK_API_SECRET"];
  if (!key || !secret) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name: string, _jurisdiction?: string): Promise<CorporateRecord[]> => {
      void _jurisdiction;
      if (!name.trim()) return [];
      try {
        const auth = Buffer.from(`${key}:${secret}`).toString("base64");
        const res = await abortable(
          fetch("https://api-worldcheck.refinitiv.com/v2/cases", {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              name,
              entityType: "ORGANISATION",
              providerTypes: ["WATCHLIST", "REGULATORY_ENFORCEMENT_LIST", "STATE_OWNED_COMPANY"],
            }),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{
            name?: string;
            countryLinks?: string[];
            categories?: string[];
            providers?: string[];
            references?: Array<{ name?: string }>;
          }>;
        };
        return (json.results ?? [])
          .filter((r) => r.name)
          .map((r) => ({
            source: "lseg-world-check",
            jurisdiction: r.countryLinks?.[0] ?? "?",
            legalName: r.name!,
            ...(r.references?.[0]?.name ? { registrationNumber: r.references[0].name } : {}),
            ...(r.providers ? { status: r.providers.join(", ") } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[lseg-world-check] lookup failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Dow Jones Risk & Compliance ───────────────────────────────────────────
function dowJonesAdapter(): CorporateRegistryAdapter {
  const key = process.env["DOWJONES_RC_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name: string, jurisdiction?: string): Promise<CorporateRecord[]> => {
      if (!name.trim()) return [];
      try {
        const params = new URLSearchParams({
          q: name,
          ...(jurisdiction ? { country: jurisdiction } : {}),
          contentType: "ENTITY",
        });
        const res = await abortable(
          fetch(`https://api.dowjones.com/risk-compliance/v1/profiles?${params.toString()}`, {
            headers: { "user-key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{
            attributes?: {
              firstName?: string;
              lastName?: string;
              entityName?: string;
              countries?: Array<{ code?: string }>;
              status?: string;
              registrationNumber?: string;
            };
          }>;
        };
        return (json.data ?? [])
          .map((d) => {
            const a = d.attributes;
            const legalName = a?.entityName ?? `${a?.firstName ?? ""} ${a?.lastName ?? ""}`.trim();
            if (!legalName) return null;
            return {
              source: "dowjones-rc",
              jurisdiction: a?.countries?.[0]?.code ?? jurisdiction ?? "?",
              legalName,
              ...(a?.registrationNumber ? { registrationNumber: a.registrationNumber } : {}),
              ...(a?.status ? { status: a.status } : {}),
            } satisfies CorporateRecord;
          })
          .filter((r): r is CorporateRecord => r !== null);
      } catch (err) {
        console.warn("[dowjones-rc] lookup failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── ComplyAdvantage Sanctions/PEP screening ───────────────────────────
function complyAdvantageScreenAdapter(): CorporateRegistryAdapter {
  const key = process.env["COMPLYADVANTAGE_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name: string, jurisdiction?: string): Promise<CorporateRecord[]> => {
      if (!name.trim()) return [];
      try {
        const body = {
          search_term: name,
          fuzziness: 0.6,
          ...(jurisdiction ? { filters: { country_codes: [jurisdiction] } } : {}),
          limit: 25,
        };
        const res = await abortable(
          fetch("https://api.complyadvantage.com/searches", {
            method: "POST",
            headers: { Authorization: `Token ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          content?: { data?: { hits?: Array<{ doc?: { name?: string; entity_type?: string; types?: string[]; fields?: Array<{ name?: string; value?: string; tag?: string }> } }> } };
        };
        return (json.content?.data?.hits ?? [])
          .map((h) => h.doc)
          .filter((d): d is NonNullable<typeof d> => !!d?.name)
          .map((d) => {
            const country = d.fields?.find((f) => f.tag === "country_names" || f.name === "Country")?.value;
            const regNo = d.fields?.find((f) => f.name === "Registration Number")?.value;
            return {
              source: "complyadvantage",
              jurisdiction: country ?? jurisdiction ?? "?",
              legalName: d.name!,
              ...(regNo ? { registrationNumber: regNo } : {}),
              ...(d.types?.length ? { status: d.types.join(",") } : {}),
            } satisfies CorporateRecord;
          });
      } catch (err) {
        console.warn("[complyadvantage-screen] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Quantexa — premium entity-resolution graph ────────────────────────
function quantexaAdapter(): CorporateRegistryAdapter {
  const key = process.env["QUANTEXA_API_KEY"];
  const baseUrl = process.env["QUANTEXA_BASE_URL"];
  if (!key || !baseUrl) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name: string, jurisdiction?: string): Promise<CorporateRecord[]> => {
      if (!name.trim()) return [];
      try {
        const body = {
          query: { name, ...(jurisdiction ? { country: jurisdiction } : {}) },
          limit: 25,
        };
        const res = await abortable(
          fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/entities/search`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          entities?: Array<{ name?: string; country?: string; identifiers?: Array<{ type?: string; value?: string }>; status?: string }>;
        };
        return (json.entities ?? [])
          .filter((e) => e.name)
          .map((e) => {
            const reg = e.identifiers?.find((i) => i.type === "registration_number" || i.type === "company_number");
            return {
              source: "quantexa",
              jurisdiction: e.country ?? jurisdiction ?? "?",
              legalName: e.name!,
              ...(reg?.value ? { registrationNumber: reg.value } : {}),
              ...(e.status ? { status: e.status } : {}),
            } satisfies CorporateRecord;
          });
      } catch (err) {
        console.warn("[quantexa] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Acuris/RDC (Regulatory DataCorp, now Moody's) — premium ───────────
function acurisRdcAdapter(): CorporateRegistryAdapter {
  const key = process.env["ACURIS_RDC_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name: string, jurisdiction?: string): Promise<CorporateRecord[]> => {
      if (!name.trim()) return [];
      try {
        const body = {
          searchString: name,
          ...(jurisdiction ? { country: jurisdiction } : {}),
          maxResults: 25,
        };
        const res = await abortable(
          fetch("https://api.acuris.com/risk/v1/screening/search", {
            method: "POST",
            headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          matches?: Array<{ entityName?: string; country?: string; entityId?: string; riskCategories?: string[]; status?: string }>;
        };
        return (json.matches ?? [])
          .filter((m) => m.entityName)
          .map((m) => ({
            source: "acuris-rdc",
            jurisdiction: m.country ?? jurisdiction ?? "?",
            legalName: m.entityName!,
            ...(m.entityId ? { registrationNumber: m.entityId } : {}),
            ...(m.status ? { status: m.status } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[acuris-rdc] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Castellum.AI — premium sanctions screening ────────────────────────
function castellumAiAdapter(): CorporateRegistryAdapter {
  const key = process.env["CASTELLUM_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name: string, jurisdiction?: string): Promise<CorporateRecord[]> => {
      if (!name.trim()) return [];
      try {
        const body = { name, ...(jurisdiction ? { country: jurisdiction } : {}), limit: 25 };
        const res = await abortable(
          fetch("https://api.castellum.ai/v1/screen", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ name?: string; country?: string; lists?: string[]; entityId?: string; status?: string }>;
        };
        return (json.results ?? [])
          .filter((r) => r.name)
          .map((r) => ({
            source: "castellum",
            jurisdiction: r.country ?? jurisdiction ?? "?",
            legalName: r.name!,
            ...(r.entityId ? { registrationNumber: r.entityId } : {}),
            ...(r.status ? { status: r.status } : r.lists?.length ? { status: r.lists.join(",") } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[castellum] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Kompany (Moody's KYC) — premium beneficial-ownership ─────────────
function kompanyAdapter(): CorporateRegistryAdapter {
  const key = process.env["KOMPANY_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name: string, jurisdiction?: string): Promise<CorporateRecord[]> => {
      if (!name.trim()) return [];
      try {
        const params = new URLSearchParams({
          name,
          ...(jurisdiction ? { country: jurisdiction } : {}),
        });
        const res = await abortable(
          fetch(`https://api.kompany.com/api/v2/company/search?${params.toString()}`, {
            headers: { "api_key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ name?: string; country?: string; companyNumber?: string; status?: string; incorporationDate?: string }>;
        };
        return (json.results ?? [])
          .filter((r) => r.name)
          .map((r) => ({
            source: "kompany",
            jurisdiction: r.country ?? jurisdiction ?? "?",
            legalName: r.name!,
            ...(r.companyNumber ? { registrationNumber: r.companyNumber } : {}),
            ...(r.status ? { status: r.status } : {}),
            ...(r.incorporationDate ? { incorporatedAt: r.incorporationDate } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[kompany] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── NameScan — sanctions/PEP screening, free + paid tiers ─────────────
function nameScanAdapter(): CorporateRegistryAdapter {
  const key = process.env["NAMESCAN_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name: string, jurisdiction?: string): Promise<CorporateRecord[]> => {
      if (!name.trim()) return [];
      try {
        const body = { name, match_rate: 75 };
        const res = await abortable(
          fetch("https://api.namescan.io/v3/person-scan/sanction-only", {
            method: "POST",
            headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          persons?: Array<{ name?: string; nationality?: string; reference_id?: string; categories?: string[] }>;
        };
        return (json.persons ?? [])
          .filter((p) => p.name)
          .map((p) => ({
            source: "namescan",
            jurisdiction: p.nationality ?? jurisdiction ?? "?",
            legalName: p.name!,
            ...(p.reference_id ? { registrationNumber: p.reference_id } : {}),
            ...(p.categories?.length ? { status: p.categories.join(",") } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[namescan] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

/**
 * Returns the first available commercial adapter, in priority order:
 *   LSEG World-Check One > Dow Jones R&C > Sayari >
 *   ComplyAdvantage > Acuris RDC > Quantexa > Castellum.AI > Kompany >
 *   NameScan > NULL
 */
export function bestCommercialAdapter(): CorporateRegistryAdapter {
  const candidates = [
    lsegWorldCheckAdapter(),
    dowJonesAdapter(),
    sayariAdapter(),
    complyAdvantageScreenAdapter(),
    acurisRdcAdapter(),
    quantexaAdapter(),
    castellumAiAdapter(),
    kompanyAdapter(),
    nameScanAdapter(),
  ];
  for (const c of candidates) if (c.isAvailable()) return c;
  return NULL_CORPORATE_ADAPTER;
}

export type CommercialProvider =
  | "lseg-world-check" | "dowjones-rc" | "sayari" | "complyadvantage"
  | "acuris-rdc" | "quantexa" | "castellum" | "kompany" | "namescan" | "none";

export function activeCommercialProvider(): CommercialProvider {
  if (process.env["LSEG_WORLDCHECK_API_KEY"] && process.env["LSEG_WORLDCHECK_API_SECRET"]) return "lseg-world-check";
  if (process.env["DOWJONES_RC_API_KEY"]) return "dowjones-rc";
  if (process.env["SAYARI_API_KEY"]) return "sayari";
  if (process.env["COMPLYADVANTAGE_API_KEY"]) return "complyadvantage";
  if (process.env["ACURIS_RDC_API_KEY"]) return "acuris-rdc";
  if (process.env["QUANTEXA_API_KEY"] && process.env["QUANTEXA_BASE_URL"]) return "quantexa";
  if (process.env["CASTELLUM_API_KEY"]) return "castellum";
  if (process.env["KOMPANY_API_KEY"]) return "kompany";
  if (process.env["NAMESCAN_API_KEY"]) return "namescan";
  return "none";
}

export function activeCommercialProviders(): CommercialProvider[] {
  const all: Array<[boolean, CommercialProvider]> = [
    [!!(process.env["LSEG_WORLDCHECK_API_KEY"] && process.env["LSEG_WORLDCHECK_API_SECRET"]), "lseg-world-check"],
    [!!process.env["DOWJONES_RC_API_KEY"], "dowjones-rc"],
    [!!process.env["SAYARI_API_KEY"], "sayari"],
    [!!process.env["COMPLYADVANTAGE_API_KEY"], "complyadvantage"],
    [!!process.env["ACURIS_RDC_API_KEY"], "acuris-rdc"],
    [!!(process.env["QUANTEXA_API_KEY"] && process.env["QUANTEXA_BASE_URL"]), "quantexa"],
    [!!process.env["CASTELLUM_API_KEY"], "castellum"],
    [!!process.env["KOMPANY_API_KEY"], "kompany"],
    [!!process.env["NAMESCAN_API_KEY"], "namescan"],
  ];
  return all.filter(([on]) => on).map(([, n]) => n);
}
