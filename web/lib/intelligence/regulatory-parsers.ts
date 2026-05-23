// Hawkeye Sterling — Regulatory Intelligence Feed Parsers
//
// Provides structured parsers for five key regulatory data sources:
//   1. FATF Grey/Blacklist — "Jurisdictions under Increased Monitoring" (grey)
//      and "High-Risk Jurisdictions subject to a Call for Action" (black)
//   2. OFAC Recent Actions RSS — new designations and delistings from the
//      US Treasury OFAC sanctions actions RSS feed
//   3. EU Sanctions Journal — new EU Council listings via the EU RSS/Atom feed
//   4. UAE EOCN Change Detection — hash-based polling to detect list updates
//
// All parsers return items in the unified RegulatoryUpdate format and are
// designed to be non-throwing: network/parse failures return [] so callers
// can fan-out in parallel without defensive wrappers.
//
// The combined digest is stored in Netlify Blobs under:
//   hawkeye-regulatory/fatf-lists    — FATF grey/black country arrays
//   hawkeye-regulatory/digest        — unified RegulatoryUpdate[] (6-hour TTL)
//   hawkeye-regulatory/eocn-hash     — last-known EOCN response hash

import { createHash } from "crypto";
import { getNamedStore } from "@/lib/server/blob-getter";

// ─── Unified update type ──────────────────────────────────────────────────────

export type RegulatoryUpdateType =
  | "new_designation"
  | "delisting"
  | "grey_list_add"
  | "grey_list_remove"
  | "black_list_change"
  | "eocn_change"
  | "eu_listing"
  | "eu_delisting"
  | "regulatory_notice";

export interface RegulatoryUpdate {
  /** Canonical source identifier */
  source: "FATF" | "OFAC" | "EU" | "EOCN" | "UN";
  updateType: RegulatoryUpdateType;
  /** Designated person / entity name (undefined for jurisdiction-level events) */
  entityName?: string;
  /** ISO-3166 alpha-2 or free-form country / jurisdiction */
  jurisdiction?: string;
  /** ISO-8601 date string */
  date: string;
  /** Authoritative URL for this update */
  url: string;
  /** Human-readable summary ≤ 300 chars */
  summary: string;
  /** OFAC list identifier (SDN, NS-ISA, etc.) when applicable */
  listId?: string;
  /** Additional structured identifiers (DOB, passport, etc.) */
  identifiers?: Record<string, string>;
  /** Action verb from the raw source (e.g. "added", "removed") */
  action?: "added" | "removed" | "updated";
}

// ─── Blob store keys ──────────────────────────────────────────────────────────

const BLOB_STORE = "hawkeye-regulatory";
const DIGEST_KEY = "digest";
const FATF_LISTS_KEY = "fatf-lists";
const EOCN_HASH_KEY = "eocn-hash";

export const DIGEST_TTL_MS = 6 * 60 * 60 * 1_000; // 6 hours

// ─── Fetch helpers ────────────────────────────────────────────────────────────

const AGENT_HEADER = "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; regulatory-parsers)";
const DEFAULT_TIMEOUT_MS = 8_000;

function mkAbort(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
  const { signal, clear } = mkAbort(timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": AGENT_HEADER, accept: "text/html,application/xml,application/rss+xml,*/*" },
      signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clear();
  }
}

// ─── XML/HTML helpers (no external parser) ───────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return stripHtml((m[1] ?? "").trim().replace(/^<!\[CDATA\[|\]\]>$/g, ""));
}

function splitItems(xml: string, tag = "item"): string[] {
  return xml.split(new RegExp(`<${tag}[\\s>]`, "i")).slice(1).map((chunk) => {
    const end = chunk.indexOf(`</${tag}>`);
    return end >= 0 ? chunk.slice(0, end) : chunk;
  });
}

function stripHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── FATF Grey / Blacklist Parser ─────────────────────────────────────────────
//
// FATF publishes two HTML pages:
//   Grey list: https://www.fatf-gafi.org/en/topics/grey-list.html
//   Black list: https://www.fatf-gafi.org/en/topics/fatf-blacklist.html  (call-for-action)
//
// Both pages list countries in <h3>, <li>, or <p> elements next to keywords like
// "Increased Monitoring" or "Call for Action".  Since FATF does not expose a
// machine-readable API we fall back to their RSS for update events, then overlay
// with the static country lists scraped from the HTML pages.

export interface FatfLists {
  greyList: string[];   // country names on the grey list
  blackList: string[];  // country names on the black list
  fetchedAt: string;
}

const FATF_GREY_URL = "https://www.fatf-gafi.org/en/topics/grey-list.html";
const FATF_BLACK_URL = "https://www.fatf-gafi.org/en/topics/fatf-blacklist.html";
const FATF_RSS_URL = "https://www.fatf-gafi.org/en/topics/fatf-latest-news.rss";

// Known jurisdictions from FATF plenary outcomes (maintained as a well-known
// baseline when scraping fails — keeps the parser usable offline / after
// minor FATF page redesigns).
const KNOWN_GREY_LIST = [
  "Algeria", "Angola", "Bulgaria", "Burkina Faso", "Cameroon", "Côte d'Ivoire",
  "Croatia", "Democratic Republic of the Congo", "Haiti", "Kenya", "Lebanon",
  "Mali", "Monaco", "Mozambique", "Namibia", "Nigeria", "Philippines",
  "Senegal", "South Africa", "South Sudan", "Syria", "Tanzania", "Venezuela",
  "Vietnam", "Yemen",
];
const KNOWN_BLACK_LIST = [
  "Democratic People's Republic of Korea", "Iran", "Myanmar",
];

/**
 * Extract country names from a FATF HTML page.
 * Looks for patterns like <li>Country Name</li> within the main body, and
 * short paragraphs that look like jurisdiction names (capitalised, ≤ 40 chars).
 */
function extractFatfCountries(html: string): string[] {
  const candidates = new Set<string>();

  // Strategy 1: <li> items that look like country names (no sub-clauses)
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  for (const m of html.matchAll(liRe)) {
    const text = stripHtml(m[1] ?? "").trim();
    if (text.length >= 3 && text.length <= 50 && /^[A-Z]/.test(text) && !/\s{2,}/.test(text)) {
      candidates.add(text);
    }
  }

  // Strategy 2: <h3> or <h4> headings that contain only a country name
  const hRe = /<h[34][^>]*>([\s\S]*?)<\/h[34]>/gi;
  for (const m of html.matchAll(hRe)) {
    const text = stripHtml(m[1] ?? "").trim();
    if (text.length >= 3 && text.length <= 50 && /^[A-Z]/.test(text)) {
      candidates.add(text);
    }
  }

  // Strategy 3: strong/bold inline country mentions inside known FATF keywords
  const contextRe = /(?:Increased Monitoring|Call for Action|grey list|blacklist)[\s\S]{0,500}/gi;
  for (const section of html.matchAll(contextRe)) {
    const boldRe = /<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi;
    for (const bold of section[0].matchAll(boldRe)) {
      const text = stripHtml(bold[1] ?? "").trim();
      if (text.length >= 3 && text.length <= 60 && /^[A-Z]/.test(text)) {
        candidates.add(text);
      }
    }
  }

  // Filter out clearly non-country strings (contains numbers, URLs, etc.)
  return Array.from(candidates).filter(
    (c) => !/http|www|\d{4}|FATF|plenary|meeting|statement|report/i.test(c),
  );
}

/**
 * Parse the FATF RSS feed for grey/black list events, return RegulatoryUpdates.
 */
async function parseFatfRssUpdates(): Promise<RegulatoryUpdate[]> {
  const xml = await fetchText(FATF_RSS_URL);
  if (!xml) return [];

  const items = splitItems(xml);
  const updates: RegulatoryUpdate[] = [];

  for (const block of items.slice(0, 20)) {
    const title = extractTag(block, "title");
    if (!title) continue;
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const description = extractTag(block, "description");
    const combined = `${title} ${description}`.toLowerCase();

    // Detect grey/black list events from title keywords
    const isGrey = /grey.?list|increased monitoring|jurisdictions under/i.test(combined);
    const isBlack = /black.?list|call for action|high.risk jurisdiction/i.test(combined);
    if (!isGrey && !isBlack) continue;

    const updateType: RegulatoryUpdateType = isBlack ? "black_list_change" : "grey_list_add";
    updates.push({
      source: "FATF",
      updateType,
      date: pubDate ? new Date(pubDate).toISOString() : nowIso(),
      url: link || FATF_GREY_URL,
      summary: description.slice(0, 300) || title.slice(0, 300),
    });
  }

  return updates;
}

/**
 * Fetch and parse FATF grey/black country lists, persist to Blobs.
 * Returns both the parsed lists and any RegulatoryUpdates from the RSS.
 */
export async function parseFatfLists(): Promise<{ lists: FatfLists; updates: RegulatoryUpdate[] }> {
  const [greyHtml, blackHtml, rssUpdates] = await Promise.all([
    fetchText(FATF_GREY_URL, 10_000),
    fetchText(FATF_BLACK_URL, 10_000),
    parseFatfRssUpdates(),
  ]);

  const greyList = greyHtml ? extractFatfCountries(greyHtml) : [];
  const blackList = blackHtml ? extractFatfCountries(blackHtml) : [];

  // Merge scraped results with the known baseline — ensures the list is never
  // empty even when FATF HTML structure changes temporarily.
  const finalGrey = greyList.length >= 5 ? greyList : KNOWN_GREY_LIST;
  const finalBlack = blackList.length >= 1 ? blackList : KNOWN_BLACK_LIST;

  const lists: FatfLists = {
    greyList: [...new Set(finalGrey)].sort(),
    blackList: [...new Set(finalBlack)].sort(),
    fetchedAt: nowIso(),
  };

  // Persist to Netlify Blobs
  const store = await getNamedStore(BLOB_STORE, { consistency: "eventual", silent: true });
  if (store?.set) {
    try {
      await store.set(FATF_LISTS_KEY, JSON.stringify(lists));
    } catch (err) {
      console.warn("[regulatory-parsers] FATF lists blob write failed:", err instanceof Error ? err.message : err);
    }
  }

  // Produce RegulatoryUpdates for every country on each list
  const listUpdates: RegulatoryUpdate[] = [
    ...lists.greyList.map((country): RegulatoryUpdate => ({
      source: "FATF",
      updateType: "grey_list_add",
      jurisdiction: country,
      date: lists.fetchedAt,
      url: FATF_GREY_URL,
      summary: `${country} is on the FATF Jurisdictions under Increased Monitoring (grey list).`,
    })),
    ...lists.blackList.map((country): RegulatoryUpdate => ({
      source: "FATF",
      updateType: "black_list_change",
      jurisdiction: country,
      date: lists.fetchedAt,
      url: FATF_BLACK_URL,
      summary: `${country} is on the FATF High-Risk Jurisdictions subject to a Call for Action (black list).`,
    })),
  ];

  return { lists, updates: [...rssUpdates, ...listUpdates] };
}

/**
 * Read the persisted FATF lists from Blobs without re-fetching.
 * Returns null if the store is unavailable or the entry is absent.
 */
export async function readFatfLists(): Promise<FatfLists | null> {
  const store = await getNamedStore(BLOB_STORE, { consistency: "eventual", silent: true });
  if (!store) return null;
  try {
    const raw = await store.get(FATF_LISTS_KEY, { type: "json" });
    return raw as FatfLists | null;
  } catch {
    return null;
  }
}

// ─── OFAC Recent Actions Parser ───────────────────────────────────────────────
//
// OFAC publishes a sanctions-actions RSS at:
//   https://home.treasury.gov/system/files/126/ofac.rss
// and an XML actions file at:
//   https://ofac.treasury.gov/system/files/126/ofac_sanctions_actions.xml
//
// Each <item> carries:
//   <title> — action description (often "OFAC Designates X…")
//   <link>  — detail page
//   <pubDate> — date of action
//   <description> — full text including entity names, list IDs, identifiers

const OFAC_RSS_URL = "https://home.treasury.gov/system/files/126/ofac.rss";
const OFAC_XML_URL = "https://ofac.treasury.gov/system/files/126/ofac_sanctions_actions.xml";

/**
 * Infer the action type ("added" / "removed") from an OFAC title/description.
 */
function inferOfacAction(text: string): "added" | "removed" | "updated" {
  const t = text.toLowerCase();
  if (/delist|remov|terminat|unblock/.test(t)) return "removed";
  if (/designat|add|identif|sanction/.test(t)) return "added";
  return "updated";
}

/**
 * Extract entity names from an OFAC action description.
 * OFAC uses patterns like "OFAC Designates ENTITY NAME for…" or
 * "… has been identified as an SDN: ENTITY NAME."
 */
function extractOfacEntityNames(title: string, description: string): string[] {
  const names: string[] = [];
  const combined = `${title} ${description}`;

  // Pattern: "Designates [Names] for ..." — extract first proper-noun phrase
  const designatMatch = combined.match(/designates?\s+([^,;(]{3,80}?)(?:\s+for|\s+pursuant|\s+under)/i);
  if (designatMatch?.[1]) names.push(designatMatch[1].trim());

  // Pattern: "OFAC Targets NAME"
  const targetMatch = combined.match(/targets?\s+([^,;(]{3,80}?)(?:\s+for|\s+in|\s+\()/i);
  if (targetMatch?.[1]) {
    const candidate = targetMatch[1].trim();
    if (!names.some((n) => n.toLowerCase() === candidate.toLowerCase())) names.push(candidate);
  }

  // Fallback: the title itself (trimmed to first 80 chars)
  if (names.length === 0 && title.length > 5) names.push(title.slice(0, 80));

  return names;
}

/**
 * Extract OFAC list IDs (SDN, NS-ISA, IRAN, etc.) from text.
 */
function extractOfacListIds(text: string): string[] {
  const hits = text.match(/\b(SDN|SDGT|NS-ISA|IRAN|UKRAINE|DPRK|CUBA|EO\s*\d+|CAATSA|GLOBAL MAGNITSKY)\b/gi);
  return hits ? [...new Set(hits.map((h) => h.toUpperCase().replace(/\s+/, "")))] : [];
}

/**
 * Parse the OFAC RSS / XML feed into RegulatoryUpdates.
 */
export async function parseOfacActions(): Promise<RegulatoryUpdate[]> {
  // Try RSS first, fall back to XML
  const [rssText, xmlText] = await Promise.all([
    fetchText(OFAC_RSS_URL),
    fetchText(OFAC_XML_URL),
  ]);

  const source = rssText || xmlText;
  if (!source) return [];

  const items = splitItems(source);
  const updates: RegulatoryUpdate[] = [];

  for (const block of items.slice(0, 30)) {
    const title = extractTag(block, "title");
    if (!title) continue;
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "date");
    const description = extractTag(block, "description");

    const action = inferOfacAction(`${title} ${description}`);
    const entityNames = extractOfacEntityNames(title, description);
    const listIds = extractOfacListIds(`${title} ${description}`);

    for (const entityName of entityNames) {
      updates.push({
        source: "OFAC",
        updateType: action === "removed" ? "delisting" : "new_designation",
        entityName: entityName.slice(0, 200),
        date: pubDate ? new Date(pubDate).toISOString() : nowIso(),
        url: link || "https://ofac.treasury.gov/recent-actions",
        summary: description.slice(0, 300) || title.slice(0, 300),
        listId: listIds[0],
        action,
        ...(listIds.length > 0 ? { identifiers: { listIds: listIds.join(", ") } } : {}),
      });
    }
  }

  return updates;
}

// ─── EU Sanctions Journal Parser ──────────────────────────────────────────────
//
// The EU publishes a "What's new" Atom feed for the EU sanctions map at:
//   https://www.sanctionsmap.eu/api/v1/updated.json  (JSON — preferred)
// and an RSS feed on the EUR-Lex sanctions page:
//   https://eur-lex.europa.eu/oj/daily-view/L-series/default.html
//
// We check two sources:
//   1. EU sanctions REST API (what's-new endpoint) — JSON
//   2. EUR-Lex L-series RSS for Official Journal entries
//
// Both may return generic "OJ published" events; we filter to items that
// reference sanctions or restrictive measures.

const EU_SANCTIONS_API = "https://www.sanctionsmap.eu/api/v1/updated.json";
const EU_OJ_RSS = "https://op.europa.eu/en/web/eu-law-and-publications/publication-detail/-/publication/rss-feed?output=rss&type=oj";

interface EuUpdatedEntry {
  regime?: string;
  lastUpdated?: string;
  measures?: number;
  url?: string;
}

/**
 * Parse the EU Sanctions Map API "updated" endpoint.
 */
async function parseEuSanctionsApi(): Promise<RegulatoryUpdate[]> {
  const { signal, clear } = mkAbort(8_000);
  try {
    const res = await fetch(EU_SANCTIONS_API, {
      headers: { "user-agent": AGENT_HEADER, accept: "application/json" },
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json() as { data?: EuUpdatedEntry[] } | EuUpdatedEntry[];
    const entries: EuUpdatedEntry[] = Array.isArray(data) ? data : (
      Array.isArray((data as { data?: EuUpdatedEntry[] }).data) ? (data as { data: EuUpdatedEntry[] }).data : []
    );

    return entries.slice(0, 20).map((entry): RegulatoryUpdate => ({
      source: "EU",
      updateType: "eu_listing",
      jurisdiction: entry.regime?.slice(0, 100),
      date: entry.lastUpdated ? new Date(entry.lastUpdated).toISOString() : nowIso(),
      url: entry.url || "https://www.sanctionsmap.eu",
      summary: [
        entry.regime ? `EU sanctions regime updated: ${entry.regime}.` : "EU sanctions regime updated.",
        entry.measures !== undefined ? `${entry.measures} measures currently in force.` : "",
      ].filter(Boolean).join(" ").slice(0, 300),
    }));
  } catch {
    return [];
  } finally {
    clear();
  }
}

/**
 * Parse the EUR-Lex Official Journal RSS for EU sanctions-related entries.
 */
async function parseEuOjRss(): Promise<RegulatoryUpdate[]> {
  const xml = await fetchText(EU_OJ_RSS);
  if (!xml) return [];

  const items = splitItems(xml);
  const updates: RegulatoryUpdate[] = [];

  for (const block of items.slice(0, 30)) {
    const title = extractTag(block, "title");
    if (!title) continue;
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const description = extractTag(block, "description");
    const combined = `${title} ${description}`;

    // Only keep sanctions/restrictive measures entries
    if (!/sanction|restrictive measure|list|designat|annex|amend/i.test(combined)) continue;

    const isDelisting = /remov|repeal|delist|amendment.*delete/i.test(combined);
    updates.push({
      source: "EU",
      updateType: isDelisting ? "eu_delisting" : "eu_listing",
      date: pubDate ? new Date(pubDate).toISOString() : nowIso(),
      url: link || "https://eur-lex.europa.eu",
      summary: description.slice(0, 300) || title.slice(0, 300),
      action: isDelisting ? "removed" : "added",
    });
  }

  return updates;
}

/**
 * Parse all EU sanctions sources into RegulatoryUpdates.
 */
export async function parseEuSanctions(): Promise<RegulatoryUpdate[]> {
  const [apiUpdates, ojUpdates] = await Promise.all([
    parseEuSanctionsApi(),
    parseEuOjRss(),
  ]);
  return [...apiUpdates, ...ojUpdates];
}

// ─── UAE EOCN Change Detection ────────────────────────────────────────────────
//
// The EOCN list is published at https://www.eocn.gov.ae and updated
// irregularly (typically a few times per year following Cabinet Resolutions).
// There is no machine-readable diff API; we detect changes by:
//   1. Fetching the EOCN listing page
//   2. Computing a SHA-256 of the normalised response body
//   3. Comparing to the hash stored in hawkeye-regulatory/eocn-hash
//   4. On mismatch: emit a RegulatoryUpdate of type "eocn_change" and update
//      the stored hash so subsequent polls don't re-alert until the next change

const EOCN_URL = "https://www.eocn.gov.ae/en/DesignatedLists";

export interface EocnHashState {
  hash: string;       // SHA-256 hex of the normalised page body
  checkedAt: string;  // ISO-8601
  changedAt?: string; // ISO-8601 of the last detected change
}

/** Normalise EOCN HTML before hashing: strip dynamic tokens (timestamps, CSRF). */
function normaliseEocnBody(body: string): string {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/__RequestVerificationToken[^"]*"[^"]*"/gi, "")
    .replace(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/g, "")
    .trim();
}

/**
 * Poll the EOCN list page; emit a change event when the content hash shifts.
 */
export async function checkEocnChange(): Promise<{ update: RegulatoryUpdate | null; state: EocnHashState }> {
  const body = await fetchText(EOCN_URL, 12_000);
  const checkedAt = nowIso();

  if (!body) {
    return {
      update: null,
      state: { hash: "", checkedAt },
    };
  }

  const hash = createHash("sha256").update(normaliseEocnBody(body)).digest("hex");

  // Read stored hash from Blobs
  const store = await getNamedStore(BLOB_STORE, { consistency: "strong", silent: true });
  let previousState: EocnHashState | null = null;
  if (store) {
    try {
      previousState = await store.get(EOCN_HASH_KEY, { type: "json" }) as EocnHashState | null;
    } catch { /* new store — no prior state */ }
  }

  const changed = previousState && previousState.hash !== "" && previousState.hash !== hash;
  const newState: EocnHashState = {
    hash,
    checkedAt,
    changedAt: changed ? checkedAt : previousState?.changedAt,
  };

  // Write updated hash
  if (store?.set) {
    try {
      await store.set(EOCN_HASH_KEY, JSON.stringify(newState));
    } catch (err) {
      console.warn("[regulatory-parsers] EOCN hash blob write failed:", err instanceof Error ? err.message : err);
    }
  }

  const update: RegulatoryUpdate | null = changed
    ? {
        source: "EOCN",
        updateType: "eocn_change",
        date: checkedAt,
        url: EOCN_URL,
        summary:
          "UAE EOCN Designated Lists page content has changed — a manual review and re-ingest of the list file is recommended. " +
          "All active cases should be re-screened immediately.",
        action: "updated",
      }
    : null;

  return { update, state: newState };
}

// ─── Digest builder ───────────────────────────────────────────────────────────

export interface RegulatoryDigest {
  items: RegulatoryUpdate[];
  fetchedAt: string;
  sources: Array<"FATF" | "OFAC" | "EU" | "EOCN" | "UN">;
  fatfLists?: {
    greyList: string[];
    blackList: string[];
  };
  eocnChanged: boolean;
  ttlMs: number;
}

/**
 * Build the full regulatory digest by running all parsers in parallel.
 * Writes the result to Netlify Blobs with a 6-hour TTL marker.
 * Returns the digest regardless of blob availability.
 */
export async function buildRegulatoryDigest(): Promise<RegulatoryDigest> {
  const [fatfResult, ofacUpdates, euUpdates, eocnResult] = await Promise.all([
    parseFatfLists(),
    parseOfacActions(),
    parseEuSanctions(),
    checkEocnChange(),
  ]);

  const allItems: RegulatoryUpdate[] = [
    ...fatfResult.updates,
    ...ofacUpdates,
    ...euUpdates,
    ...(eocnResult.update ? [eocnResult.update] : []),
  ];

  // Deduplicate by (source + updateType + entityName/jurisdiction + date)
  const seen = new Set<string>();
  const deduped = allItems.filter((item) => {
    const key = `${item.source}:${item.updateType}:${item.entityName ?? item.jurisdiction ?? ""}:${item.date.slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort most recent first
  deduped.sort((a, b) => b.date.localeCompare(a.date));

  const sources = [...new Set(deduped.map((i) => i.source))] as RegulatoryDigest["sources"];

  const digest: RegulatoryDigest = {
    items: deduped,
    fetchedAt: nowIso(),
    sources,
    fatfLists: {
      greyList: fatfResult.lists.greyList,
      blackList: fatfResult.lists.blackList,
    },
    eocnChanged: eocnResult.update !== null,
    ttlMs: DIGEST_TTL_MS,
  };

  // Persist to Netlify Blobs
  const store = await getNamedStore(BLOB_STORE, { consistency: "eventual", silent: true });
  if (store?.set) {
    try {
      await store.set(DIGEST_KEY, JSON.stringify(digest));
    } catch (err) {
      console.warn("[regulatory-parsers] digest blob write failed:", err instanceof Error ? err.message : err);
    }
  }

  return digest;
}

/**
 * Read the cached digest from Netlify Blobs.
 * Returns null if unavailable or expired beyond TTL.
 */
export async function readRegulatoryDigest(): Promise<RegulatoryDigest | null> {
  const store = await getNamedStore(BLOB_STORE, { consistency: "eventual", silent: true });
  if (!store) return null;
  try {
    const raw = await store.get(DIGEST_KEY, { type: "json" }) as RegulatoryDigest | null;
    if (!raw) return null;
    // Check TTL
    const age = Date.now() - new Date(raw.fetchedAt).getTime();
    if (age > DIGEST_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}
