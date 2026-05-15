// Hawkeye Sterling — Open Banking Tracker integration.
//
// Wraps the vendored not-a-bank/open-banking-tracker-data dataset
// (`web/lib/data/open-banking/*.json`) into name/BIC/domain/id lookups
// usable by the screening pipeline. Builds in-memory indices once per
// warm Lambda instance — first call costs ~150 ms (parsing the 11 MB
// providers.json), subsequent calls are O(1).
//
// AML use cases unlocked:
//   - BIC lookup to attribute SWIFT counterparties to a regulated bank
//   - State-owned flag for sovereign / political-risk reasoning
//   - Ownership chain to surface parent banks for UBO inference
//   - PSD2 / Open Banking compliance verification at onboarding
//   - Bank ↔ aggregator relationship edges for the relationship graph
//
// License: vendored data is CC BY-NC-SA 4.0 — see NOTICE.md alongside.

import providersRaw from "@/lib/data/open-banking/providers.json";
import aggregatorsRaw from "@/lib/data/open-banking/aggregators.json";
import tppsRaw from "@/lib/data/open-banking/third-party-providers.json";

// ── Types ──────────────────────────────────────────────────────────────────

export interface OpenBankingProvider {
  id: string;
  name: string;
  legalName?: string;
  countryHQ?: string;
  countries?: string[];
  bic?: string;
  websiteUrl?: string;
  verified?: boolean;
  stateOwned?: boolean;
  status?: string;
  bankType?: string[];
  compliance?: Array<{ regulation: string; status?: string }>;
  apiAggregators?: string[];
  ownership?: Array<{ providerId?: string; name?: string }>;
  ipoStatus?: string;
  stockSymbol?: string;
}

export interface OpenBankingAggregator {
  id: string;
  name: string;
  websiteUrl?: string;
  countryHQ?: string;
  marketCoverage?: { live?: string[]; upcoming?: string[] };
  countries?: string[];
  verified?: boolean;
  bankConnectionsCount?: number;
  compliance?: unknown;
}

/** Risk signals derived from a matched provider — surfaced in screening. */
export interface OpenBankingRiskSignals {
  /** Bank is state-owned — sovereign / political-risk uplift. */
  stateOwned: boolean;
  /** Bank has no PSD2 record (not registered as Open Banking participant). */
  noPsd2Compliance: boolean;
  /** Bank's PSD2 status is "unknown" or non-compliant. */
  psd2StatusUncertain: boolean;
  /** Bank has unverified profile (legalName + identity not third-party verified). */
  unverifiedProfile: boolean;
  /** Bank operates in CAHRA jurisdiction(s). */
  cahraJurisdictions: string[];
  /** Bank is publicly listed (lower opacity risk vs. private). */
  publiclyListed: boolean;
}

// FATF + UAE FDL 10/2025 high-risk jurisdictions (subset for sovereign-risk uplift).
const CAHRA_ISO2: ReadonlySet<string> = new Set([
  "IR", "RU", "KP", "SY", "SD", "AF", "BY", "CU", "MM", "VE", "YE", "LB", "IQ", "LY", "SS",
]);

// ── Lazy index construction ────────────────────────────────────────────────

const providers = providersRaw as OpenBankingProvider[];
const aggregators = aggregatorsRaw as OpenBankingAggregator[];
const tpps = tppsRaw as OpenBankingProvider[];

let _byId: Map<string, OpenBankingProvider> | null = null;
let _byBic: Map<string, OpenBankingProvider> | null = null;
let _byNameLower: Map<string, OpenBankingProvider> | null = null;
let _byDomain: Map<string, OpenBankingProvider> | null = null;
let _aggsById: Map<string, OpenBankingAggregator> | null = null;
let _providersByAggregator: Map<string, OpenBankingProvider[]> | null = null;

function buildIndices(): void {
  if (_byId !== null) return;

  const byId = new Map<string, OpenBankingProvider>();
  const byBic = new Map<string, OpenBankingProvider>();
  const byName = new Map<string, OpenBankingProvider>();
  const byDomain = new Map<string, OpenBankingProvider>();
  const providersByAggregator = new Map<string, OpenBankingProvider[]>();

  const all = [...providers, ...tpps];
  for (const p of all) {
    if (!p.id) continue;
    byId.set(p.id, p);
    if (p.bic) byBic.set(p.bic.toUpperCase(), p);
    if (p.name) byName.set(p.name.toLowerCase().trim(), p);
    if (p.legalName && p.legalName !== p.name) {
      byName.set(p.legalName.toLowerCase().trim(), p);
    }
    if (p.websiteUrl) {
      const d = extractDomain(p.websiteUrl);
      if (d) byDomain.set(d, p);
    }
    if (Array.isArray(p.apiAggregators)) {
      for (const aggId of p.apiAggregators) {
        const list = providersByAggregator.get(aggId);
        if (list) list.push(p);
        else providersByAggregator.set(aggId, [p]);
      }
    }
  }

  const aggsById = new Map<string, OpenBankingAggregator>();
  for (const a of aggregators) {
    if (a.id) aggsById.set(a.id, a);
  }

  _byId = byId;
  _byBic = byBic;
  _byNameLower = byName;
  _byDomain = byDomain;
  _aggsById = aggsById;
  _providersByAggregator = providersByAggregator;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeBic(bic: string): string {
  // BICs may be 8 or 11 chars; the 8-char form is the institution code
  // shared across branches. Try the full input first, then the prefix.
  return bic.replace(/\s+/g, "").toUpperCase();
}

// ── Public lookup API ──────────────────────────────────────────────────────

export function lookupProviderById(id: string): OpenBankingProvider | null {
  buildIndices();
  return _byId!.get(id) ?? null;
}

export function lookupProviderByBic(bic: string): OpenBankingProvider | null {
  if (!bic) return null;
  buildIndices();
  const norm = normalizeBic(bic);
  // Try full BIC, then 8-char prefix.
  return _byBic!.get(norm) ?? (norm.length >= 8 ? _byBic!.get(norm.slice(0, 8)) ?? null : null);
}

export function lookupProviderByName(name: string): OpenBankingProvider | null {
  if (!name) return null;
  buildIndices();
  return _byNameLower!.get(name.toLowerCase().trim()) ?? null;
}

export function lookupProviderByDomain(domain: string): OpenBankingProvider | null {
  if (!domain) return null;
  buildIndices();
  const d = extractDomain(domain) ?? domain.toLowerCase().replace(/^www\./, "");
  return _byDomain!.get(d) ?? null;
}

export function lookupAggregatorById(id: string): OpenBankingAggregator | null {
  if (!id) return null;
  buildIndices();
  return _aggsById!.get(id) ?? null;
}

/** Banks that integrate with the named API aggregator (relationship graph edge). */
export function providersForAggregator(aggId: string): OpenBankingProvider[] {
  if (!aggId) return [];
  buildIndices();
  return _providersByAggregator!.get(aggId) ?? [];
}

// ── Risk signal derivation ─────────────────────────────────────────────────

export function deriveRiskSignals(p: OpenBankingProvider): OpenBankingRiskSignals {
  const psd2 = (p.compliance ?? []).find(c => c.regulation === "PSD2");
  const noPsd2 = !psd2;
  const psd2Uncertain = Boolean(psd2 && (!psd2.status || psd2.status === "unknown"));
  const cahra = (p.countries ?? []).filter(c => CAHRA_ISO2.has(c.toUpperCase()));
  return {
    stateOwned: Boolean(p.stateOwned),
    noPsd2Compliance: noPsd2,
    psd2StatusUncertain: psd2Uncertain,
    unverifiedProfile: !p.verified,
    cahraJurisdictions: cahra,
    publiclyListed: p.ipoStatus === "public",
  };
}

// ── Convenience: enrich a screening subject ────────────────────────────────

export interface OpenBankingEnrichment {
  /** The matched provider, or null if no match. */
  provider: OpenBankingProvider | null;
  /** How the match was made. */
  matchedBy: "bic" | "name" | "domain" | "id" | null;
  /** Risk signals derived from the match. */
  signals: OpenBankingRiskSignals | null;
  /** Linked API aggregators (relationship graph nodes). */
  aggregators: OpenBankingAggregator[];
  /** Parent / shareholder providers from ownership[]. */
  ownership: Array<{ providerId?: string; name?: string }>;
  /** Whether a TPP relationship was discovered. */
  isTpp: boolean;
}

export function enrichSubject(input: {
  name?: string;
  bic?: string;
  domain?: string;
  websiteUrl?: string;
  id?: string;
}): OpenBankingEnrichment {
  let provider: OpenBankingProvider | null = null;
  let matchedBy: OpenBankingEnrichment["matchedBy"] = null;

  if (input.id) {
    provider = lookupProviderById(input.id);
    if (provider) matchedBy = "id";
  }
  if (!provider && input.bic) {
    provider = lookupProviderByBic(input.bic);
    if (provider) matchedBy = "bic";
  }
  if (!provider && input.domain) {
    provider = lookupProviderByDomain(input.domain);
    if (provider) matchedBy = "domain";
  }
  if (!provider && input.websiteUrl) {
    provider = lookupProviderByDomain(input.websiteUrl);
    if (provider) matchedBy = "domain";
  }
  if (!provider && input.name) {
    provider = lookupProviderByName(input.name);
    if (provider) matchedBy = "name";
  }

  if (!provider) {
    return {
      provider: null,
      matchedBy: null,
      signals: null,
      aggregators: [],
      ownership: [],
      isTpp: false,
    };
  }

  const aggIds = provider.apiAggregators ?? [];
  const aggs = aggIds.map(id => lookupAggregatorById(id)).filter((a): a is OpenBankingAggregator => a !== null);
  const isTpp = tpps.some(t => t.id === provider!.id);

  return {
    provider,
    matchedBy,
    signals: deriveRiskSignals(provider),
    aggregators: aggs,
    ownership: provider.ownership ?? [],
    isTpp,
  };
}

// ── Stats (for /api/status surfacing) ──────────────────────────────────────

export function openBankingStats(): {
  providerCount: number;
  aggregatorCount: number;
  tppCount: number;
  withBic: number;
  stateOwned: number;
  withCompliance: number;
} {
  buildIndices();
  return {
    providerCount: providers.length,
    aggregatorCount: aggregators.length,
    tppCount: tpps.length,
    withBic: _byBic!.size,
    stateOwned: providers.filter(p => p.stateOwned).length,
    withCompliance: providers.filter(p => p.compliance && p.compliance.length > 0).length,
  };
}
