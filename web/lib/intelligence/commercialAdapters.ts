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

// ── LSEG World-Check One via MCP server ──────────────────────────────────────
// When LSEG_WC1_MCP_URL is set, screen through the local WC1 MCP HTTP server
// instead of calling the REST API directly. The MCP server handles auth,
// rate-limiting, and retries; this adapter just talks JSON-RPC to it.
// Falls back transparently to lsegWorldCheckAdapter() when the env var is absent.
function lsegWc1McpAdapter(): CorporateRegistryAdapter {
  const mcpUrlRaw = process.env["LSEG_WC1_MCP_URL"];
  if (!mcpUrlRaw) return NULL_CORPORATE_ADAPTER;
  if (!mcpUrlRaw.startsWith("https://")) {
    console.warn("[commercialAdapters] LSEG_WC1_MCP_URL must use HTTPS — adapter disabled");
    return NULL_CORPORATE_ADAPTER;
  }
  const mcpUrl: string = mcpUrlRaw;

  let _toolName: string | null | undefined = undefined; // undefined = not yet discovered

  async function discoverScreenTool(): Promise<string | null> {
    if (_toolName !== undefined) return _toolName;
    try {
      const res = await abortable(
        fetch(mcpUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
        }),
      );
      if (!res.ok) { _toolName = null; return null; }
      const json = (await res.json()) as { result?: { tools?: Array<{ name: string }> } };
      const names = (json.result?.tools ?? []).map((t) => t.name);
      const preference = [
        "wc1_screen", "screen", "search_cases", "create_case",
        "wc1_search", "search", "screen_entity", "lookup",
      ];
      _toolName = preference.find((p) => names.includes(p)) ??
        names.find((n) => /screen|search|lookup/i.test(n)) ?? null;
    } catch {
      _toolName = null;
    }
    return _toolName;
  }

  return {
    isAvailable: () => true,
    lookup: async (name: string, _jurisdiction?: string): Promise<CorporateRecord[]> => {
      if (!name.trim()) return [];
      const toolName = await discoverScreenTool();
      if (!toolName) {
        console.warn("[lseg-wc1-mcp] no screening tool discovered on MCP server");
        return [];
      }
      try {
        let id = 2;
        const callRes = await abortable(
          fetch(mcpUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "tools/call",
              id: id++,
              params: { name: toolName, arguments: { name, entityType: "ORGANISATION" } },
            }),
          }),
        );
        if (!callRes.ok) {
          console.warn(`[lseg-wc1-mcp] tools/call HTTP ${callRes.status}`);
          return [];
        }
        const callJson = (await callRes.json()) as {
          result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
        };
        if (callJson.result?.isError) {
          console.warn("[lseg-wc1-mcp] tool returned isError=true");
          return [];
        }
        const textContent = callJson.result?.content?.find((c) => c.type === "text")?.text;
        if (!textContent) return [];

        let parsed: unknown;
        try { parsed = JSON.parse(textContent); } catch { return []; }

        const root = parsed as Record<string, unknown>;
        const arr: unknown[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(root["results"]) ? root["results"]
          : Array.isArray(root["hits"]) ? root["hits"]
          : Array.isArray(root["matches"]) ? root["matches"]
          : Array.isArray(root["data"]) ? root["data"]
          : [];

        return arr
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((o) => {
            const legalName =
              (typeof o["name"] === "string" ? o["name"] : null) ??
              (typeof o["primaryName"] === "string" ? o["primaryName"] : null) ??
              (typeof o["fullName"] === "string" ? o["fullName"] : null) ?? "";
            if (!legalName) return null;
            const countries = o["countries"] ?? o["country"] ?? o["nationality"];
            const country = Array.isArray(countries) ? (countries[0] ?? "?") :
              typeof countries === "string" ? countries : "?";
            const providers = o["sources"] ?? o["providers"] ?? o["lists"] ?? o["categories"];
            const providerStr = Array.isArray(providers) ? providers.slice(0, 4).join(", ") :
              typeof providers === "string" ? providers : undefined;
            const refId = o["entityId"] ?? o["id"] ?? o["uid"] ?? o["worldCheckId"];
            return {
              source: "lseg-wc1-mcp",
              jurisdiction: typeof country === "string" ? country : "?",
              legalName,
              ...(typeof refId === "string" ? { registrationNumber: refId } : {}),
              ...(providerStr ? { status: providerStr } : {}),
            } satisfies CorporateRecord;
          })
          .filter((r): r is CorporateRecord => r !== null);
      } catch (err) {
        console.warn("[lseg-wc1-mcp] lookup failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── LSEG World-Check One ──────────────────────────────────────────────────
// Auth: Basic (key:secret) when both vars are set; Bearer (key-only) when
// only LSEG_WORLDCHECK_API_KEY is present — covers single-key deployments.
function lsegWorldCheckAdapter(): CorporateRegistryAdapter {
  const key = process.env["LSEG_WORLDCHECK_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  const secret = process.env["LSEG_WORLDCHECK_API_SECRET"];
  const authHeader = secret
    ? `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`
    : `Bearer ${key}`;
  return {
    isAvailable: () => true,
    lookup: async (name: string, _jurisdiction?: string): Promise<CorporateRecord[]> => {
      void _jurisdiction;
      if (!name.trim()) return [];
      try {
        const res = await abortable(
          fetch("https://api-worldcheck.refinitiv.com/v2/cases", {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              name,
              entityType: "ORGANISATION",
              providerTypes: ["WATCHLIST", "REGULATORY_ENFORCEMENT_LIST", "STATE_OWNED_COMPANY", "PEP", "SANCTIONS"],
            }),
          }),
        );
        if (!res.ok) {
          console.warn(`[lseg-world-check] HTTP ${res.status} — check API key/secret validity`);
          return [];
        }
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
  if (!baseUrl.startsWith("https://")) {
    console.warn("[commercialAdapters] QUANTEXA_BASE_URL must use HTTPS — adapter disabled");
    return NULL_CORPORATE_ADAPTER;
  }
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

// ── LexisNexis Bridger Insight — premium ─────────────────────────────
function bridgerInsightAdapter(): CorporateRegistryAdapter {
  const key = process.env["BRIDGER_INSIGHT_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name, jurisdiction) => {
      if (!name.trim()) return [];
      try {
        const body = { name, ...(jurisdiction ? { country: jurisdiction } : {}), maxResults: 25 };
        const res = await abortable(
          fetch("https://api.bridger.lexisnexis.com/v2/screen", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { matches?: Array<{ entityName?: string; country?: string; entityId?: string; status?: string }> };
        return (json.matches ?? [])
          .filter((m) => m.entityName)
          .map((m) => ({
            source: "bridger-insight",
            jurisdiction: m.country ?? jurisdiction ?? "?",
            legalName: m.entityName!,
            ...(m.entityId ? { registrationNumber: m.entityId } : {}),
            ...(m.status ? { status: m.status } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[bridger-insight] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Sanctions.io — premium screening ─────────────────────────────────
function sanctionsIoAdapter(): CorporateRegistryAdapter {
  const key = process.env["SANCTIONS_IO_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name, jurisdiction) => {
      if (!name.trim()) return [];
      try {
        const params = new URLSearchParams({ q: name, ...(jurisdiction ? { nationality: jurisdiction } : {}), limit: "25" });
        const res = await abortable(
          fetch(`https://api.sanctions.io/search/?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ name?: string; nationality?: string; source?: string; entity_id?: string; designation?: string }> };
        return (json.results ?? [])
          .filter((r) => r.name)
          .map((r) => ({
            source: "sanctions.io",
            jurisdiction: r.nationality ?? jurisdiction ?? "?",
            legalName: r.name!,
            ...(r.entity_id ? { registrationNumber: r.entity_id } : {}),
            ...(r.designation ? { status: r.designation } : r.source ? { status: r.source } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[sanctions.io] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── OpenSanctions Pro — paid tier (same API, different rate limits) ─
function openSanctionsProAdapter(): CorporateRegistryAdapter {
  const key = process.env["OPENSANCTIONS_PRO_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name, jurisdiction) => {
      if (!name.trim()) return [];
      try {
        const params = new URLSearchParams({ q: name, limit: "25", ...(jurisdiction ? { countries: jurisdiction.toLowerCase() } : {}) });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, {
            headers: { Authorization: `ApiKey ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ caption?: string; properties?: { country?: string[]; idNumber?: string[]; status?: string[] } }> };
        return (json.results ?? [])
          .filter((r) => r.caption)
          .map((r) => ({
            source: "opensanctions-pro",
            jurisdiction: r.properties?.country?.[0]?.toUpperCase() ?? jurisdiction ?? "?",
            legalName: r.caption!,
            ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : {}),
            ...(r.properties?.status?.[0] ? { status: r.properties.status[0] } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[opensanctions-pro] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── SmartSearch — premium (UK market) ───────────────────────────────
function smartSearchAdapter(): CorporateRegistryAdapter {
  const key = process.env["SMARTSEARCH_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name, jurisdiction) => {
      if (!name.trim()) return [];
      try {
        const body = { name, ...(jurisdiction ? { countryCode: jurisdiction } : {}), limit: 25 };
        const res = await abortable(
          fetch("https://api.smartsearch.com/v1/search/business", {
            method: "POST",
            headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ businessName?: string; countryCode?: string; companyNumber?: string; status?: string }> };
        return (json.results ?? [])
          .filter((r) => r.businessName)
          .map((r) => ({
            source: "smartsearch",
            jurisdiction: r.countryCode ?? jurisdiction ?? "?",
            legalName: r.businessName!,
            ...(r.companyNumber ? { registrationNumber: r.companyNumber } : {}),
            ...(r.status ? { status: r.status } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[smartsearch] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Encompass — premium KYC orchestration ───────────────────────────
function encompassAdapter(): CorporateRegistryAdapter {
  const key = process.env["ENCOMPASS_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name, jurisdiction) => {
      if (!name.trim()) return [];
      try {
        const body = { searchString: name, ...(jurisdiction ? { jurisdictionCode: jurisdiction } : {}), limit: 25 };
        const res = await abortable(
          fetch("https://api.encompasscorporation.com/v3/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { matches?: Array<{ name?: string; jurisdictionCode?: string; entityId?: string; status?: string; incorporationDate?: string }> };
        return (json.matches ?? [])
          .filter((m) => m.name)
          .map((m) => ({
            source: "encompass",
            jurisdiction: m.jurisdictionCode ?? jurisdiction ?? "?",
            legalName: m.name!,
            ...(m.entityId ? { registrationNumber: m.entityId } : {}),
            ...(m.status ? { status: m.status } : {}),
            ...(m.incorporationDate ? { incorporatedAt: m.incorporationDate } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[encompass] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Themis — premium ────────────────────────────────────────────────
function themisAdapter(): CorporateRegistryAdapter {
  const key = process.env["THEMIS_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name, jurisdiction) => {
      if (!name.trim()) return [];
      try {
        const body = { query: name, ...(jurisdiction ? { country: jurisdiction } : {}) };
        const res = await abortable(
          fetch("https://api.themisservices.co.uk/v1/screening", {
            method: "POST",
            headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { hits?: Array<{ name?: string; country?: string; reference?: string; categories?: string[] }> };
        return (json.hits ?? [])
          .filter((h) => h.name)
          .map((h) => ({
            source: "themis",
            jurisdiction: h.country ?? jurisdiction ?? "?",
            legalName: h.name!,
            ...(h.reference ? { registrationNumber: h.reference } : {}),
            ...(h.categories?.length ? { status: h.categories.join(",") } : {}),
          } satisfies CorporateRecord));
      } catch (err) {
        console.warn("[themis] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Sigma Ratings — premium AML risk ratings ─────────────────────────
function sigmaRatingsAdapter(): CorporateRegistryAdapter {
  const key = process.env["SIGMA_RATINGS_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name, jurisdiction) => {
      if (!name.trim()) return [];
      try {
        const params = new URLSearchParams({ name, ...(jurisdiction ? { country: jurisdiction } : {}), limit: "25" });
        const res = await abortable(
          fetch(`https://api.sigmaratings.com/v1/entities/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ name?: string; country?: string; entityId?: string; rating?: string }> };
        return (json.results ?? []).filter((r) => r.name).map((r) => ({
          source: "sigma-ratings", jurisdiction: r.country ?? jurisdiction ?? "?", legalName: r.name!,
          ...(r.entityId ? { registrationNumber: r.entityId } : {}),
          ...(r.rating ? { status: `rating:${r.rating}` } : {}),
        } satisfies CorporateRecord));
      } catch (err) { console.warn("[sigma-ratings] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Polixis — premium PEP / sanctions screening ──────────────────────
function polixisAdapter(): CorporateRegistryAdapter {
  const key = process.env["POLIXIS_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name, jurisdiction) => {
      if (!name.trim()) return [];
      try {
        const body = { query: name, ...(jurisdiction ? { country: jurisdiction } : {}), limit: 25 };
        const res = await abortable(
          fetch("https://api.polixis.com/v1/screening/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { hits?: Array<{ name?: string; country?: string; reference?: string; categories?: string[] }> };
        return (json.hits ?? []).filter((h) => h.name).map((h) => ({
          source: "polixis", jurisdiction: h.country ?? jurisdiction ?? "?", legalName: h.name!,
          ...(h.reference ? { registrationNumber: h.reference } : {}),
          ...(h.categories?.length ? { status: h.categories.join(",") } : {}),
        } satisfies CorporateRecord));
      } catch (err) { console.warn("[polixis] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Salv — premium AML / sanctions ───────────────────────────────────
function salvAdapter(): CorporateRegistryAdapter {
  const key = process.env["SALV_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return {
    isAvailable: () => true,
    lookup: async (name, jurisdiction) => {
      if (!name.trim()) return [];
      try {
        const body = { name, ...(jurisdiction ? { countryIso: jurisdiction } : {}), maxResults: 25 };
        const res = await abortable(
          fetch("https://api.salv.com/v1/screening/search", {
            method: "POST",
            headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { matches?: Array<{ name?: string; country?: string; entityId?: string; status?: string }> };
        return (json.matches ?? []).filter((m) => m.name).map((m) => ({
          source: "salv", jurisdiction: m.country ?? jurisdiction ?? "?", legalName: m.name!,
          ...(m.entityId ? { registrationNumber: m.entityId } : {}),
          ...(m.status ? { status: m.status } : {}),
        } satisfies CorporateRecord));
      } catch (err) { console.warn("[salv] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── 6 more sanctions/PEP screening vendors (18 → 24) ────────────────────
function refineIntelligenceAdapter(): CorporateRegistryAdapter {
  const key = process.env["REFINE_INTELLIGENCE_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return { isAvailable: () => true, lookup: async (name, j) => {
    if (!name.trim()) return [];
    try {
      const res = await abortable(fetch(`https://api.refineintelligence.com/v1/screen?q=${encodeURIComponent(name)}${j ? `&country=${j}` : ""}`, { headers: { Authorization: `Bearer ${key}`, accept: "application/json" }}));
      if (!res.ok) return [];
      const data = (await res.json()) as { matches?: Array<{ name?: string; country?: string; entityId?: string; status?: string }> };
      return (data.matches ?? []).filter((m) => m.name).map((m) => ({ source: "refine-intelligence", jurisdiction: m.country ?? j ?? "?", legalName: m.name!, ...(m.entityId ? { registrationNumber: m.entityId } : {}), ...(m.status ? { status: m.status } : {}) } satisfies CorporateRecord));
    } catch (err) { console.warn("[refine-intelligence] failed:", err instanceof Error ? err.message : err); return []; }
  }};
}
function lucinityAdapter(): CorporateRegistryAdapter {
  const key = process.env["LUCINITY_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return { isAvailable: () => true, lookup: async (name, j) => {
    if (!name.trim()) return [];
    try {
      const res = await abortable(fetch("https://api.lucinity.com/v1/screening/search", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ name, country: j ?? null }) }));
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: Array<{ name?: string; country?: string; reference?: string; categories?: string[] }> };
      return (data.results ?? []).filter((r) => r.name).map((r) => ({ source: "lucinity", jurisdiction: r.country ?? j ?? "?", legalName: r.name!, ...(r.reference ? { registrationNumber: r.reference } : {}), ...(r.categories?.length ? { status: r.categories.join(",") } : {}) } satisfies CorporateRecord));
    } catch (err) { console.warn("[lucinity] failed:", err instanceof Error ? err.message : err); return []; }
  }};
}
function hummingbirdAdapter(): CorporateRegistryAdapter {
  const key = process.env["HUMMINGBIRD_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return { isAvailable: () => true, lookup: async (name, j) => {
    if (!name.trim()) return [];
    try {
      const res = await abortable(fetch(`https://api.hummingbird.co/v1/screen?q=${encodeURIComponent(name)}${j ? `&country=${j}` : ""}`, { headers: { Authorization: `Bearer ${key}`, accept: "application/json" }}));
      if (!res.ok) return [];
      const data = (await res.json()) as { matches?: Array<{ name?: string; country?: string; entityId?: string; designation?: string }> };
      return (data.matches ?? []).filter((m) => m.name).map((m) => ({ source: "hummingbird", jurisdiction: m.country ?? j ?? "?", legalName: m.name!, ...(m.entityId ? { registrationNumber: m.entityId } : {}), ...(m.designation ? { status: m.designation } : {}) } satisfies CorporateRecord));
    } catch (err) { console.warn("[hummingbird] failed:", err instanceof Error ? err.message : err); return []; }
  }};
}
function salvaresAdapter(): CorporateRegistryAdapter {
  const key = process.env["SALVARES_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return { isAvailable: () => true, lookup: async (name, j) => {
    if (!name.trim()) return [];
    try {
      const res = await abortable(fetch(`https://api.salvares.com/v2/search?q=${encodeURIComponent(name)}${j ? `&country=${j}` : ""}`, { headers: { "x-api-key": key, accept: "application/json" }}));
      if (!res.ok) return [];
      const data = (await res.json()) as { hits?: Array<{ name?: string; country?: string; entityId?: string; lists?: string[] }> };
      return (data.hits ?? []).filter((h) => h.name).map((h) => ({ source: "salvares", jurisdiction: h.country ?? j ?? "?", legalName: h.name!, ...(h.entityId ? { registrationNumber: h.entityId } : {}), ...(h.lists?.length ? { status: h.lists.join(",") } : {}) } satisfies CorporateRecord));
    } catch (err) { console.warn("[salvares] failed:", err instanceof Error ? err.message : err); return []; }
  }};
}
function fenergoAdapter(): CorporateRegistryAdapter {
  const key = process.env["FENERGO_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return { isAvailable: () => true, lookup: async (name, j) => {
    if (!name.trim()) return [];
    try {
      const res = await abortable(fetch("https://api.fenergo.com/v1/screening/customer-screen", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ name, country: j ?? null }) }));
      if (!res.ok) return [];
      const data = (await res.json()) as { matches?: Array<{ name?: string; country?: string; refId?: string; severity?: string }> };
      return (data.matches ?? []).filter((m) => m.name).map((m) => ({ source: "fenergo", jurisdiction: m.country ?? j ?? "?", legalName: m.name!, ...(m.refId ? { registrationNumber: m.refId } : {}), ...(m.severity ? { status: m.severity } : {}) } satisfies CorporateRecord));
    } catch (err) { console.warn("[fenergo] failed:", err instanceof Error ? err.message : err); return []; }
  }};
}
function napierAdapter(): CorporateRegistryAdapter {
  const key = process.env["NAPIER_API_KEY"];
  if (!key) return NULL_CORPORATE_ADAPTER;
  return { isAvailable: () => true, lookup: async (name, j) => {
    if (!name.trim()) return [];
    try {
      const res = await abortable(fetch("https://api.napier.ai/v2/screening/search", { method: "POST", headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ query: name, country: j ?? null }) }));
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: Array<{ name?: string; country?: string; entityId?: string; lists?: string[] }> };
      return (data.results ?? []).filter((r) => r.name).map((r) => ({ source: "napier", jurisdiction: r.country ?? j ?? "?", legalName: r.name!, ...(r.entityId ? { registrationNumber: r.entityId } : {}), ...(r.lists?.length ? { status: r.lists.join(",") } : {}) } satisfies CorporateRecord));
    } catch (err) { console.warn("[napier] failed:", err instanceof Error ? err.message : err); return []; }
  }};
}

/**
 * Returns the first available commercial adapter (priority order).
 * lseg-wc1-mcp takes highest priority when LSEG_WC1_MCP_URL is set —
 * it routes through the local WC1 MCP server rather than the REST API.
 */
export function bestCommercialAdapter(): CorporateRegistryAdapter {
  const candidates = [
    lsegWc1McpAdapter(),
    lsegWorldCheckAdapter(),
    dowJonesAdapter(),
    sayariAdapter(),
    complyAdvantageScreenAdapter(),
    acurisRdcAdapter(),
    quantexaAdapter(),
    castellumAiAdapter(),
    kompanyAdapter(),
    nameScanAdapter(),
    bridgerInsightAdapter(),
    sanctionsIoAdapter(),
    openSanctionsProAdapter(),
    smartSearchAdapter(),
    encompassAdapter(),
    themisAdapter(),
    sigmaRatingsAdapter(),
    polixisAdapter(),
    salvAdapter(),
    refineIntelligenceAdapter(),
    lucinityAdapter(),
    hummingbirdAdapter(),
    salvaresAdapter(),
    fenergoAdapter(),
    napierAdapter(),
  ];
  for (const c of candidates) if (c.isAvailable()) return c;
  return NULL_CORPORATE_ADAPTER;
}

export type CommercialProvider =
  | "lseg-wc1-mcp" | "lseg-world-check" | "dowjones-rc" | "sayari" | "complyadvantage"
  | "acuris-rdc" | "quantexa" | "castellum" | "kompany" | "namescan"
  | "bridger-insight" | "sanctions.io" | "opensanctions-pro" | "smartsearch"
  | "encompass" | "themis" | "sigma-ratings" | "polixis" | "salv" | "none";

export function activeCommercialProvider(): CommercialProvider {
  if (process.env["LSEG_WC1_MCP_URL"]) return "lseg-wc1-mcp";
  if (process.env["LSEG_WORLDCHECK_API_KEY"]) return "lseg-world-check";
  if (process.env["DOWJONES_RC_API_KEY"]) return "dowjones-rc";
  if (process.env["SAYARI_API_KEY"]) return "sayari";
  if (process.env["COMPLYADVANTAGE_API_KEY"]) return "complyadvantage";
  if (process.env["ACURIS_RDC_API_KEY"]) return "acuris-rdc";
  if (process.env["QUANTEXA_API_KEY"] && process.env["QUANTEXA_BASE_URL"]) return "quantexa";
  if (process.env["CASTELLUM_API_KEY"]) return "castellum";
  if (process.env["KOMPANY_API_KEY"]) return "kompany";
  if (process.env["NAMESCAN_API_KEY"]) return "namescan";
  if (process.env["BRIDGER_INSIGHT_API_KEY"]) return "bridger-insight";
  if (process.env["SANCTIONS_IO_API_KEY"]) return "sanctions.io";
  if (process.env["OPENSANCTIONS_PRO_API_KEY"]) return "opensanctions-pro";
  if (process.env["SMARTSEARCH_API_KEY"]) return "smartsearch";
  if (process.env["ENCOMPASS_API_KEY"]) return "encompass";
  if (process.env["THEMIS_API_KEY"]) return "themis";
  if (process.env["SIGMA_RATINGS_API_KEY"]) return "sigma-ratings";
  if (process.env["POLIXIS_API_KEY"]) return "polixis";
  if (process.env["SALV_API_KEY"]) return "salv";
  return "none";
}

export function activeCommercialProviders(): CommercialProvider[] {
  const all: Array<[boolean, CommercialProvider]> = [
    [!!process.env["LSEG_WC1_MCP_URL"], "lseg-wc1-mcp"],
    [!!process.env["LSEG_WORLDCHECK_API_KEY"], "lseg-world-check"],
    [!!process.env["DOWJONES_RC_API_KEY"], "dowjones-rc"],
    [!!process.env["SAYARI_API_KEY"], "sayari"],
    [!!process.env["COMPLYADVANTAGE_API_KEY"], "complyadvantage"],
    [!!process.env["ACURIS_RDC_API_KEY"], "acuris-rdc"],
    [!!(process.env["QUANTEXA_API_KEY"] && process.env["QUANTEXA_BASE_URL"]), "quantexa"],
    [!!process.env["CASTELLUM_API_KEY"], "castellum"],
    [!!process.env["KOMPANY_API_KEY"], "kompany"],
    [!!process.env["NAMESCAN_API_KEY"], "namescan"],
    [!!process.env["BRIDGER_INSIGHT_API_KEY"], "bridger-insight"],
    [!!process.env["SANCTIONS_IO_API_KEY"], "sanctions.io"],
    [!!process.env["OPENSANCTIONS_PRO_API_KEY"], "opensanctions-pro"],
    [!!process.env["SMARTSEARCH_API_KEY"], "smartsearch"],
    [!!process.env["ENCOMPASS_API_KEY"], "encompass"],
    [!!process.env["THEMIS_API_KEY"], "themis"],
    [!!process.env["SIGMA_RATINGS_API_KEY"], "sigma-ratings"],
    [!!process.env["POLIXIS_API_KEY"], "polixis"],
    [!!process.env["SALV_API_KEY"], "salv"],
  ];
  return all.filter(([on]) => on).map(([, n]) => n);
}
