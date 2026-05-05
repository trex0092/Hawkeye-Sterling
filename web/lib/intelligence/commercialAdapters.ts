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

/**
 * Returns the first available commercial adapter, in priority order:
 *   LSEG World-Check One > Dow Jones R&C > Sayari > NULL
 *
 * Routes that need stronger entity coverage (entity-graph, screening,
 * UBO walker) call this — when at least one commercial key is set the
 * extra coverage lights up automatically.
 */
export function bestCommercialAdapter(): CorporateRegistryAdapter {
  const l = lsegWorldCheckAdapter();
  if (l.isAvailable()) return l;
  const d = dowJonesAdapter();
  if (d.isAvailable()) return d;
  const s = sayariAdapter();
  if (s.isAvailable()) return s;
  return NULL_CORPORATE_ADAPTER;
}

export function activeCommercialProvider(): "lseg-world-check" | "dowjones-rc" | "sayari" | "none" {
  if (process.env["LSEG_WORLDCHECK_API_KEY"] && process.env["LSEG_WORLDCHECK_API_SECRET"]) return "lseg-world-check";
  if (process.env["DOWJONES_RC_API_KEY"]) return "dowjones-rc";
  if (process.env["SAYARI_API_KEY"]) return "sayari";
  return "none";
}
