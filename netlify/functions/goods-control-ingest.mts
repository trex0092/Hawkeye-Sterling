// Hawkeye Sterling — goods-control list ingest (audit follow-up #19).
//
// Scheduled Netlify function (every 6h at :09 UTC) that fetches the
// UAE Cabinet Resolution 156/2025 dual-use / proliferation-sensitive
// goods catalogue + the EU dual-use list (Reg 2021/821 Annex I) + the
// US Commerce Control List (15 CFR Part 774). Normalises into HS-code
// keyed entries and writes a delta blob the transaction-monitoring
// path consumes.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "hawkeye-goods-control";
const RUN_LABEL = "goods-control-ingest";
const FETCH_TIMEOUT_MS = 25_000;

interface ControlledGoodsEntry {
  listId: string;
  hsCode: string;
  description: string;
  category: "dual_use" | "weapons_munitions" | "chemical" | "nuclear" | "missile" | "cyber_surveillance";
  controlReason: string;
  effectiveAt?: string;
}

interface FeedSpec { listId: string; url: string; format: "json" | "csv" | "xml" }

const DEFAULT_FEEDS: FeedSpec[] = [
  { listId: "uae_156_2025", url: process.env["FEED_UAE_GOODS_CONTROL"] ?? "", format: "json" },
  { listId: "eu_dual_use", url: process.env["FEED_EU_DUAL_USE"] ?? "", format: "json" },
  { listId: "us_ccl", url: process.env["FEED_US_CCL"] ?? "", format: "json" },
];

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { signal: ctrl.signal }); }
  catch { return null; }
  finally { clearTimeout(t); }
}

function normaliseJson(listId: string, raw: unknown): ControlledGoodsEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it): ControlledGoodsEntry | null => {
      if (!it || typeof it !== "object") return null;
      const e = it as Record<string, unknown>;
      const hs = String(e["hsCode"] ?? e["hs"] ?? e["code"] ?? "").trim();
      if (!hs) return null;
      const cat = e["category"];
      const category: ControlledGoodsEntry["category"] =
        cat === "weapons_munitions" || cat === "chemical" || cat === "nuclear" || cat === "missile" || cat === "cyber_surveillance"
          ? cat : "dual_use";
      const out: ControlledGoodsEntry = {
        listId,
        hsCode: hs,
        description: String(e["description"] ?? e["desc"] ?? ""),
        category,
        controlReason: String(e["controlReason"] ?? e["reason"] ?? "dual-use"),
      };
      if (typeof e["effectiveAt"] === "string") out.effectiveAt = e["effectiveAt"] as string;
      return out;
    })
    .filter((x): x is ControlledGoodsEntry => x !== null);
}

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();
  let store: ReturnType<typeof getStore>;
  try { store = getStore(STORE_NAME); }
  catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: err instanceof Error ? err.message : String(err) }, 503);
  }

  const outcomes: Array<{ listId: string; ok: boolean; entries?: number; error?: string }> = [];

  for (const spec of DEFAULT_FEEDS) {
    if (!spec.url) {
      outcomes.push({ listId: spec.listId, ok: false, error: "feed URL not configured" });
      continue;
    }
    try {
      const res = await fetchWithTimeout(spec.url);
      if (!res || !res.ok) {
        outcomes.push({ listId: spec.listId, ok: false, error: `feed ${res?.status ?? "no-response"}` });
        continue;
      }
      const text = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); }
      catch { outcomes.push({ listId: spec.listId, ok: false, error: "non-json feed" }); continue; }
      const entries = normaliseJson(spec.listId, parsed);
      await store.set(`current/${spec.listId}.json`, JSON.stringify(entries));
      outcomes.push({ listId: spec.listId, ok: true, entries: entries.length });
    } catch (err) {
      outcomes.push({ listId: spec.listId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return jsonResponse({
    ok: outcomes.every((o) => o.ok),
    label: RUN_LABEL,
    feeds: outcomes,
    durationMs: Date.now() - startedAt,
    note: "Cabinet Resolution 156/2025 + EU 2021/821 + US 15 CFR Part 774 ingested; transaction-monitoring path queries `current/<listId>.json` per HS code.",
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

export const config: Config = { schedule: "9 */6 * * *" };
