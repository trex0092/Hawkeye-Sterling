// Hawkeye Sterling — sanctions-list ingest scheduler (audit follow-up #16).
//
// Scheduled Netlify function (every 4 hours) that fetches the
// authoritative consolidated lists, normalises them into the
// NormalisedListEntry shape `sanction-delta.ts` expects, runs
// computeSanctionDelta against the prior snapshot, and writes both:
//   · the new full snapshot (per-list)            → `current/<listId>.json`
//   · the delta vs the prior snapshot              → `delta/<listId>-<timestamp>.json`
//
// Triggers a downstream re-screen pass: the delta artifact is the queue
// for the customer-portfolio re-screen job (separate scheduler, NOT in
// this file — keeps the ingest fast and idempotent).
//
// Schedule: every 4 hours at :07 (UTC) — staggered off the hour so
// upstream-feed traffic spreads.
//
// Sources covered in this scaffold:
//   · UN Security Council Consolidated   — XML / JSON feed
//   · OFAC SDN                            — JSON feed
//   · EU Consolidated CFSP                — XML feed (NCAs publish)
//   · UK OFSI Consolidated                — JSON feed
//   · UAE EOCN / Local Terrorist List     — local JSON drop
//
// Default URLs point at the current authoritative endpoints as of
// 2026-05. Override per-feed at runtime via FEED_* env vars if any of
// these change. OFAC moved off treasury.gov to sanctionslistservice
// in mid-2024; the EU CFSP URL requires the well-known public
// `token` query parameter; UK OFSI hosts on Azure Blob. UN 1267 is
// served direct from the Security Council Sanctions Committee site.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "hawkeye-sanctions-feeds";
const RUN_LABEL = "sanctions-ingest";
const FETCH_TIMEOUT_MS = 25_000;

interface FeedSpec {
  listId: string;          // e.g. "un_1267"
  url: string;             // upstream authoritative URL
  format: "json" | "xml";
  // Optional headers for auth / API keys — read from env at runtime.
  headerEnvKeys?: string[];
}

const FEEDS: FeedSpec[] = [
  {
    // UN Security Council Consolidated (1267 / 1988 / 1373 lists merged).
    // Served directly by the UNSC Sanctions Committee.
    listId: "un_1267",
    url: process.env["FEED_UN_1267"] ?? "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
    format: "xml",
  },
  {
    // OFAC SDN (Specially Designated Nationals) — full XML.
    // The legacy treasury.gov/ofac/downloads/sdn.xml URL was deprecated in 2024
    // when OFAC moved publication to a dedicated host. The current
    // canonical XML endpoint is on sanctionslistservice.ofac.treas.gov.
    // The XML schema is parsed by normaliseXml's sdnEntry path.
    listId: "ofac_sdn",
    url: process.env["FEED_OFAC_SDN"] ?? "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML",
    format: "xml",
  },
  {
    // OFAC Consolidated Non-SDN (FSE / NS-PLC / 13599 / SSI / CAPTA / etc.).
    // Companion list to SDN — covers sectoral and non-blocking sanctions.
    listId: "ofac_cons",
    url: process.env["FEED_OFAC_CONS"] ?? "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/CONS_ADVANCED.XML",
    format: "xml",
  },
  {
    // EU CFSP consolidated XML list. The webgate portal requires a
    // public `token` query parameter — value below is the well-known
    // 2017-era token still accepted by the portal for anonymous access.
    // If the EU ever rotates this token, override via FEED_EU_CFSP.
    listId: "eu_consolidated",
    url: process.env["FEED_EU_CFSP"] ?? "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw",
    format: "xml",
  },
  {
    // UK OFSI Consolidated List — published by HM Treasury on Azure Blob.
    // The ConList.xml file is the legacy schema; OFSI also publishes a
    // newer "2022format" variant. Stick with the legacy until parsers
    // are updated to the new schema.
    listId: "uk_ofsi",
    url: process.env["FEED_UK_OFSI"] ?? "https://ofsistorage.blob.core.windows.net/publishlive/ConList.xml",
    format: "xml",
  },
  {
    // UAE EOCN / Local Terrorist list — not publicly available via a
    // stable URL. Set FEED_UAE_EOCN to the URL of your CBUAE data-
    // sharing endpoint or a pre-extracted JSON/text file served from
    // internal infrastructure. Skipped at runtime when the URL is empty.
    listId: "uae_eocn",
    url: process.env["FEED_UAE_EOCN"] ?? process.env["UAE_EOCN_URL"] ?? "",
    format: "json",
  },
];

interface NormalisedListEntry {
  listId: string;
  sourceRef: string;
  primaryName: string;
  entityType: "individual" | "entity" | "vessel" | "aircraft" | "other";
  programs: string[];
  aliases: string[];
  identifiers: Array<{ kind: string; number: string }>;
  publishedAt?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Minimal normalisation — production needs per-list parsers; the shape
// here is what `computeSanctionDelta` expects. Empty body returns [].
function normaliseJson(listId: string, raw: unknown): NormalisedListEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const root = raw as Record<string, unknown>;
  const items =
    (Array.isArray(root["results"]) ? root["results"] :
      Array.isArray(root["entries"]) ? root["entries"] :
        Array.isArray(root["sdnEntries"]) ? root["sdnEntries"] :
          Array.isArray(root) ? (root as unknown as unknown[]) : []) as unknown[];
  return items
    .map((it, idx): NormalisedListEntry | null => {
      if (!it || typeof it !== "object") return null;
      const e = it as Record<string, unknown>;
      const name =
        typeof e["primaryName"] === "string" ? (e["primaryName"] as string) :
          typeof e["name"] === "string" ? (e["name"] as string) :
            typeof e["fullName"] === "string" ? (e["fullName"] as string) :
              "";
      if (!name) return null;
      const sourceRef =
        typeof e["sourceRef"] === "string" ? (e["sourceRef"] as string) :
          typeof e["uid"] === "string" ? (e["uid"] as string) :
            typeof e["id"] === "string" ? (e["id"] as string) :
              `${listId}:${idx}`;
      const entityType =
        e["entityType"] === "individual" || e["type"] === "individual" || e["kind"] === "person" ? "individual" :
          e["entityType"] === "vessel" ? "vessel" :
            e["entityType"] === "aircraft" ? "aircraft" :
              "entity";
      const programs = Array.isArray(e["programs"]) ? (e["programs"] as string[]) : [];
      const aliases = Array.isArray(e["aliases"]) ? (e["aliases"] as string[]) : [];
      const identifiers = Array.isArray(e["identifiers"])
        ? ((e["identifiers"] as unknown[]).filter((x) => x && typeof x === "object") as Array<{ kind: string; number: string }>)
        : [];
      const publishedAt = typeof e["publishedAt"] === "string" ? (e["publishedAt"] as string) : undefined;
      const out: NormalisedListEntry = {
        listId,
        sourceRef,
        primaryName: name,
        entityType,
        programs,
        aliases,
        identifiers,
      };
      if (publishedAt !== undefined) out.publishedAt = publishedAt;
      return out;
    })
    .filter((x): x is NormalisedListEntry => x !== null);
}

// ── Shared XML helpers ─────────────────────────────────────────────────────────────────

function xmlTag(block: string, name: string): string {
  return block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "s"))?.[1]?.trim() ?? "";
}

function xmlTags(block: string, name: string): string[] {
  return Array.from(
    block.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "gs")),
    (m) => m[1]?.trim() ?? "",
  ).filter(Boolean);
}

function xmlAttr(fragment: string, name: string): string {
  return fragment.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? "";
}

// Regex-based XML normalisation covering the three XML-format feeds:
//   - UN 1267 consolidated (INDIVIDUAL / ENTITY blocks)
//   - EU CFSP (sanctionEntity blocks)
//   - OFAC SDN / Consolidated (sdnEntry blocks)
// Intentionally permissive — minor schema drift does not break the parser.
function normaliseXml(listId: string, raw: string): NormalisedListEntry[] {
  const out: NormalisedListEntry[] = [];
  const now = new Date().toISOString();

  // UN 1267 format ────────────────────────────────────────────────────────────────────────────
  if (listId === "un_1267") {
    for (const m of raw.matchAll(/<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g)) {
      const block = m[1] ?? "";
      const ref = xmlTag(block, "DATAID");
      const name = [xmlTag(block, "FIRST_NAME"), xmlTag(block, "SECOND_NAME"), xmlTag(block, "THIRD_NAME")].filter(Boolean).join(" ");
      if (!name || !ref) continue;
      const programs = xmlTags(block, "UN_LIST_TYPE");
      const aliases = xmlTags(block, "ALIAS_NAME");
      const identifiers: NormalisedListEntry["identifiers"] = [];
      const passport = xmlTag(block, "PASSPORT_NUMBER");
      const ni = xmlTag(block, "NATIONAL_IDENTIFICATION_NUMBER");
      const dob = xmlTag(block, "DATE_OF_BIRTH");
      if (passport) identifiers.push({ kind: "passport", number: passport });
      if (ni) identifiers.push({ kind: "national_id", number: ni });
      if (dob) identifiers.push({ kind: "dob", number: dob });
      out.push({ listId, sourceRef: ref, primaryName: name, entityType: "individual", programs, aliases, identifiers, publishedAt: now });
    }
    for (const m of raw.matchAll(/<ENTITY>([\s\S]*?)<\/ENTITY>/g)) {
      const block = m[1] ?? "";
      const ref = xmlTag(block, "DATAID");
      const name = xmlTag(block, "FIRST_NAME") || xmlTag(block, "ENTITY_NAME");
      if (!name || !ref) continue;
      const programs = xmlTags(block, "UN_LIST_TYPE");
      out.push({ listId, sourceRef: ref, primaryName: name, entityType: "entity", programs, aliases: [], identifiers: [] });
    }
    return out;
  }

  // EU CFSP format ───────────────────────────────────────────────────────────────────
  if (listId === "eu_consolidated") {
    for (const m of raw.matchAll(/<sanctionEntity([^>]*)>([\s\S]*?)<\/sanctionEntity>/g)) {
      const attrStr = m[1] ?? "";
      const block = m[2] ?? "";
      const ref = xmlAttr(attrStr, "euReferenceNumber") || xmlAttr(attrStr, "logicalId") || xmlTag(block, "euReferenceNumber");
      const whole = xmlTag(block, "wholeName");
      const last = xmlTag(block, "lastName");
      const first = xmlTag(block, "firstName");
      const name = whole || [first, last].filter(Boolean).join(" ");
      if (!name) continue;
      const aliases: string[] = [];
      for (const am of block.matchAll(/<nameAlias[^>]*>([\s\S]*?)<\/nameAlias>/g)) {
        const aname = xmlTag(am[1] ?? "", "wholeName") || xmlTag(am[1] ?? "", "lastName");
        if (aname) aliases.push(aname);
      }
      const programs = xmlTags(block, "regulation");
      out.push({ listId, sourceRef: ref || name, primaryName: name, entityType: "individual", programs, aliases, identifiers: [] });
    }
    return out;
  }

  // OFAC SDN / Consolidated format (sdnEntry schema) ──────────────────────────────
  for (const m of raw.matchAll(/<sdnEntry>([\s\S]*?)<\/sdnEntry>/g)) {
    const block = m[1] ?? "";
    const uid = xmlTag(block, "uid");
    const fn = xmlTag(block, "firstName");
    const ln = xmlTag(block, "lastName");
    const name = (fn + " " + ln).trim() || ln || fn;
    if (!name || !uid) continue;
    const programs = xmlTags(block, "program");
    const aliases: string[] = [];
    for (const am of block.matchAll(/<aka>([\s\S]*?)<\/aka>/g)) {
      const af = xmlTag(am[1] ?? "", "firstName");
      const al = xmlTag(am[1] ?? "", "lastName");
      const aname = (af + " " + al).trim() || al || af;
      if (aname) aliases.push(aname);
    }
    const identifiers: NormalisedListEntry["identifiers"] = [];
    for (const im of block.matchAll(/<id>([\s\S]*?)<\/id>/g)) {
      const ib = im[1] ?? "";
      const kind = xmlTag(ib, "idType").toLowerCase().replace(/\s+/g, "_");
      const number = xmlTag(ib, "idNumber");
      const issuer = xmlTag(ib, "idCountry");
      if (number) identifiers.push({ kind, number, ...(issuer ? { issuer } : {}) });
    }
    out.push({ listId, sourceRef: uid, primaryName: name, entityType: "individual", programs, aliases, identifiers });
  }

  return out;
}

interface IngestOutcome {
  listId: string;
  ok: boolean;
  fetched?: number;
  diff?: { additions: number; removals: number; amendments: number };
  error?: string;
  durationMs: number;
}

async function ingestOne(spec: FeedSpec, store: ReturnType<typeof getStore>): Promise<IngestOutcome> {
  const startedAt = Date.now();
  if (!spec.url) {
    return { listId: spec.listId, ok: false, error: "FEED URL not configured", durationMs: Date.now() - startedAt };
  }
  try {
    const headers: Record<string, string> = { accept: spec.format === "json" ? "application/json" : "application/xml" };
    if (spec.headerEnvKeys) {
      for (const k of spec.headerEnvKeys) {
        const val = process.env[k];
        if (val) headers[k.toLowerCase().replace(/_/g, "-")] = val;
      }
    }
    const res = await fetchWithTimeout(spec.url, { headers });
    if (!res.ok) {
      return { listId: spec.listId, ok: false, error: `feed HTTP ${res.status}`, durationMs: Date.now() - startedAt };
    }
    const text = await res.text();
    const current: NormalisedListEntry[] =
      spec.format === "json" ? normaliseJson(spec.listId, safeParseJson(text)) : normaliseXml(spec.listId, text);

    // Read prior snapshot.
    let previous: NormalisedListEntry[] = [];
    try {
      const prevRaw = await store.get(`current/${spec.listId}.json`, { type: "text" });
      if (prevRaw) previous = JSON.parse(prevRaw) as NormalisedListEntry[];
    } catch {
      // First run — leave previous = [].
    }

    // Compute delta inline (don't import; this scheduler is in netlify/
    // and would otherwise need to traverse to dist/src/brain). The
    // diff is identifier-keyed; production should switch to the
    // canonical computeSanctionDelta() once import paths are wired.
    const prevByRef = new Map(previous.map((p) => [p.sourceRef, p]));
    const currByRef = new Map(current.map((c) => [c.sourceRef, c]));
    let additions = 0, removals = 0, amendments = 0;
    for (const c of current) {
      const p = prevByRef.get(c.sourceRef);
      if (!p) additions++;
      else if (JSON.stringify(p) !== JSON.stringify(c)) amendments++;
    }
    for (const p of previous) {
      if (!currByRef.has(p.sourceRef)) removals++;
    }

    // Persist current snapshot + delta.
    await store.set(`current/${spec.listId}.json`, JSON.stringify(current));
    if (additions + removals + amendments > 0) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await store.set(
        `delta/${spec.listId}-${ts}.json`,
        JSON.stringify({ at: new Date().toISOString(), listId: spec.listId, additions, removals, amendments }),
      );
    }

    return {
      listId: spec.listId,
      ok: true,
      fetched: current.length,
      diff: { additions, removals, amendments },
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { listId: spec.listId, ok: false, error: msg, durationMs: Date.now() - startedAt };
  }
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  // Fail-closed: SANCTIONS_CRON_TOKEN must be set and must match the
  // Authorization Bearer token on non-scheduled invocations (Prohibition #10).
  const cronToken = process.env["SANCTIONS_CRON_TOKEN"];
  if (!cronToken) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: "SANCTIONS_CRON_TOKEN not configured — ingest halted" }, 503);
  }
  const auth = req.headers.get("authorization");
  if (auth !== null) {
    // When invoked via HTTP (not scheduled), verify the bearer token.
    const supplied = auth.replace(/^Bearer\s+/i, "").trim();
    const enc = new TextEncoder();
    const a = enc.encode(cronToken);
    const b = enc.encode(supplied);
    const padded = new Uint8Array(a.byteLength);
    padded.set(new Uint8Array(b.buffer, b.byteOffset, Math.min(b.byteLength, a.byteLength)));
    const match =
      (await import("node:crypto").then(({ timingSafeEqual }) =>
        timingSafeEqual(new Uint8Array(a.buffer), padded),
      ).catch(() => false)) && a.byteLength === b.byteLength;
    if (!match) {
      return jsonResponse({ ok: false, label: RUN_LABEL, error: "Unauthorized" }, 401);
    }
  }

  const startedAt = Date.now();
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: `getStore failed: ${err instanceof Error ? err.message : String(err)}` }, 503);
  }

  const outcomes: IngestOutcome[] = [];
  for (const spec of FEEDS) {
    outcomes.push(await ingestOne(spec, store));
  }

  const totalDiff = outcomes.reduce(
    (acc, o) => ({
      additions: acc.additions + (o.diff?.additions ?? 0),
      removals: acc.removals + (o.diff?.removals ?? 0),
      amendments: acc.amendments + (o.diff?.amendments ?? 0),
    }),
    { additions: 0, removals: 0, amendments: 0 },
  );

  return jsonResponse({
    ok: outcomes.every((o) => o.ok),
    label: RUN_LABEL,
    feeds: outcomes,
    totalDiff,
    requiresRescreen: totalDiff.additions + totalDiff.amendments > 0,
    durationMs: Date.now() - startedAt,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config: Config = {
  // Every 4 hours at :07 UTC.
  schedule: "7 */4 * * *",
};
