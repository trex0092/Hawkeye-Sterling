// GET /api/designation-alerts
//
// Returns recent sanctions designation alerts (new listings and delistings).
// Also fetches a live delta from the OpenSanctions API (if OPENSANCTIONS_API_KEY
// is configured) or falls back to the FATF grey/blacklist RSS feed.
//
// Query params:
//   ?since=ISO_DATE   Only return items newer than this timestamp (default: 24h ago)
//   ?limit=N          Max items to return (1–100, default 50)
//
// Combines:
//   1. Stored designation alerts from the Blobs store (populated by
//      designation-alert-check.mts every hour at :10 UTC).
//   2. Live delta from OpenSanctions or FATF RSS (fetched on each request
//      and merged with stored alerts by sourceRef to avoid duplicates).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { listAlerts, type DesignationAlert } from "@/lib/server/alerts-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── OpenSanctions delta fetch ─────────────────────────────────────────────────

interface OpenSanctionsStatement {
  id: string;
  entity_id: string;
  prop: string;
  value: string;
  dataset: string;
  first_seen?: string;
  last_seen?: string;
  lang?: string;
}

interface OpenSanctionsDeltaItem {
  id: string;           // entity id
  caption: string;
  schema: string;       // "Person" | "Company" | "Organization" | etc.
  datasets: string[];
  first_seen?: string;
  last_seen?: string;
}

function opensanctionsListId(datasets: string[]): string {
  for (const d of datasets) {
    if (d.includes("ofac")) return "ofac_sdn";
    if (d.includes("un_sc") || d.includes("un_1267")) return "un_1267";
    if (d.includes("eu_") || d.includes("europe")) return "eu_consolidated";
    if (d.includes("gb_") || d.includes("uk_") || d.includes("ofsi")) return "uk_ofsi";
    if (d.includes("ae_") || d.includes("uae")) return "uae_eocn";
  }
  return datasets[0] ?? "sanctions";
}

function opensanctionsListLabel(listId: string): string {
  const MAP: Record<string, string> = {
    ofac_sdn: "OFAC SDN",
    un_1267: "UN 1267",
    eu_consolidated: "EU CFSP",
    uk_ofsi: "UK OFSI",
    uae_eocn: "UAE EOCN",
  };
  return MAP[listId] ?? listId.toUpperCase();
}

async function fetchOpenSanctionsDelta(
  since: string,
  apiKey: string,
): Promise<DesignationAlert[]> {
  const url = new URL("https://api.opensanctions.org/statements");
  url.searchParams.set("dataset", "sanctions");
  url.searchParams.set("limit", "50");
  url.searchParams.set("since", since);
  url.searchParams.set("prop", "name");

  const res = await fetch(url.toString(), {
    headers: {
      "Authorization": `ApiKey ${apiKey}`,
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    console.warn(`[designation-alerts] OpenSanctions API ${res.status}: ${await res.text().catch(() => "")}`);
    return [];
  }

  const data = await res.json() as { results?: OpenSanctionsStatement[]; entities?: OpenSanctionsDeltaItem[] };

  // The /statements endpoint returns individual statements; group by entity_id
  const byEntity = new Map<string, OpenSanctionsStatement[]>();
  for (const stmt of (data.results ?? [])) {
    if (!byEntity.has(stmt.entity_id)) byEntity.set(stmt.entity_id, []);
    byEntity.get(stmt.entity_id)!.push(stmt);
  }

  const alerts: DesignationAlert[] = [];
  for (const [entityId, stmts] of byEntity) {
    const nameStmt = stmts.find((s) => s.prop === "name");
    const caption = nameStmt?.value ?? entityId;
    const datasets = [...new Set(stmts.map((s) => s.dataset))];
    const firstSeen = stmts
      .map((s) => s.first_seen)
      .filter(Boolean)
      .sort()[0] ?? new Date().toISOString();

    const listId = opensanctionsListId(datasets);
    const sourceRef = `os-${entityId}`;

    alerts.push({
      id: `os-${entityId}-${Date.now()}`,
      listId,
      listLabel: opensanctionsListLabel(listId),
      matchedEntry: caption,
      sourceRef,
      severity: listId === "ofac_sdn" || listId === "un_1267" ? "critical" : "high",
      detectedAt: firstSeen,
      read: false,
    });
  }

  return alerts;
}

// ── FATF RSS fallback ─────────────────────────────────────────────────────────
// Parses a minimal subset of the FATF RSS feed to extract new-designation news.

interface FatfItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseRssItem(xml: string): FatfItem[] {
  const items: FatfItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] ?? "";
    const title = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/s.exec(block);
    const link = /<link>(.*?)<\/link>/s.exec(block);
    const pubDate = /<pubDate>(.*?)<\/pubDate>/s.exec(block);
    const description = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s.exec(block);

    items.push({
      title: (title?.[1] ?? title?.[2] ?? "").trim(),
      link: (link?.[1] ?? "").trim(),
      pubDate: (pubDate?.[1] ?? "").trim(),
      description: (description?.[1] ?? description?.[2] ?? "").trim(),
    });
  }
  return items;
}

function isDesignationNews(item: FatfItem): boolean {
  const needle = /designat|sancti|list(ing|ed)|grey.?list|black.?list|high.?risk|increas(ed|ing).+monitor/i;
  return needle.test(item.title) || needle.test(item.description);
}

async function fetchFatfRssDelta(since: string): Promise<DesignationAlert[]> {
  const res = await fetch(
    "https://www.fatf-gafi.org/media/fatf/rss/fatf-en.rss",
    {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!res.ok) {
    console.warn(`[designation-alerts] FATF RSS ${res.status}`);
    return [];
  }

  const xml = await res.text();
  const sinceMs = Date.parse(since);

  const items = parseRssItem(xml).filter((item) => {
    if (!isDesignationNews(item)) return false;
    if (!item.pubDate) return true; // include if no date
    const itemMs = Date.parse(item.pubDate);
    return isNaN(itemMs) || itemMs >= sinceMs;
  });

  return items.map((item, i) => {
    const id = `fatf-${Date.now()}-${i}`;
    return {
      id,
      listId: "fatf_advisory",
      listLabel: "FATF Advisory",
      matchedEntry: item.title.slice(0, 120),
      sourceRef: item.link || id,
      severity: "high" as const,
      detectedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      read: false,
    };
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "designation-alerts_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? "50", 10) || 50));

  // `since` defaults to 24 hours ago if not specified
  const sinceParam = url.searchParams.get("since");
  const sinceMs = sinceParam ? Date.parse(sinceParam) : Date.now() - 24 * 60 * 60 * 1000;
  const since = new Date(isNaN(sinceMs) ? Date.now() - 24 * 60 * 60 * 1000 : sinceMs).toISOString();

  // 1. Load stored alerts from Blobs (populated by hourly cron)
  let stored: DesignationAlert[] = [];
  try {
    const all = await listAlerts(false);
    const sanctionsSources = new Set([
      "OFAC SDN", "UN 1267", "EU Consolidated", "UK OFSI", "UAE EOCN",
      "ofac_sdn", "un_1267", "eu_consolidated", "uk_ofsi", "uae_eocn",
    ]);
    stored = all.filter(
      (a) =>
        sanctionsSources.has(a.listId ?? "") ||
        a.severity === "critical" ||
        a.severity === "high",
    );
  } catch (err) {
    console.warn("[designation-alerts] alerts store read failed:", err instanceof Error ? err.message : String(err));
  }

  // 2. Fetch live delta from OpenSanctions or FATF RSS
  let liveDelta: DesignationAlert[] = [];
  let deltaSource: "opensanctions" | "fatf_rss" | "none" = "none";

  const openSanctionsKey = process.env["OPENSANCTIONS_API_KEY"];
  try {
    if (openSanctionsKey) {
      liveDelta = await fetchOpenSanctionsDelta(since, openSanctionsKey);
      deltaSource = "opensanctions";
    } else {
      liveDelta = await fetchFatfRssDelta(since);
      deltaSource = "fatf_rss";
    }
  } catch (err) {
    console.warn(
      `[designation-alerts] live delta fetch (${deltaSource || "?"}) failed:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 3. Merge: deduplicate live delta against stored alerts by sourceRef
  const storedRefs = new Set(stored.map((a) => a.sourceRef));
  const newFromLive = liveDelta.filter((a) => !storedRefs.has(a.sourceRef));

  // 4. Combine, filter by since, sort descending by detectedAt
  const combined = [...stored, ...newFromLive]
    .filter((a) => {
      const ts = Date.parse(a.detectedAt ?? "");
      return isNaN(ts) || ts >= sinceMs;
    })
    .sort((a, b) => (b.detectedAt ?? "").localeCompare(a.detectedAt ?? ""))
    .slice(0, limit);

  return NextResponse.json(
    {
      ok: true,
      since,
      total: combined.length,
      unread: combined.filter((a) => !a.read).length,
      newFromLiveFeed: newFromLive.length,
      deltaSource,
      alerts: combined,
      note: openSanctionsKey
        ? "Live delta fetched from OpenSanctions API. Stored alerts populated hourly by designation-alert-check.mts."
        : "Live delta fetched from FATF RSS (set OPENSANCTIONS_API_KEY for richer delta). Stored alerts: GET /api/alerts",
    },
    { headers: gate.headers },
  );
}
