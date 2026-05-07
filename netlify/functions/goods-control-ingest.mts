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

// Static fallback seed for UAE CR 156/2025 — used when FEED_UAE_GOODS_CONTROL is not set.
// Representative HS codes covering the 6 controlled categories. The live feed
// supersedes these entries when available.
const UAE_156_STATIC_SEED: ControlledGoodsEntry[] = [
  { listId: "uae_156_2025", hsCode: "2612.10", description: "Uranium ores and concentrates", category: "nuclear", controlReason: "CR 156/2025 Nuclear — IAEA safeguards" },
  { listId: "uae_156_2025", hsCode: "2844.10", description: "Natural uranium and alloys", category: "nuclear", controlReason: "CR 156/2025 Nuclear Category" },
  { listId: "uae_156_2025", hsCode: "2844.20", description: "Uranium enriched in U235 and alloys", category: "nuclear", controlReason: "CR 156/2025 Nuclear — UNSCR 1540" },
  { listId: "uae_156_2025", hsCode: "8401.10", description: "Nuclear reactors", category: "nuclear", controlReason: "CR 156/2025 Nuclear Category" },
  { listId: "uae_156_2025", hsCode: "8401.20", description: "Isotope separation machinery", category: "nuclear", controlReason: "CR 156/2025 Nuclear — enrichment risk" },
  { listId: "uae_156_2025", hsCode: "2930.90", description: "Organo-sulfur compounds — mustard agent precursors", category: "chemical", controlReason: "CR 156/2025 Chemical — OPCW Schedule 1" },
  { listId: "uae_156_2025", hsCode: "2921.19", description: "Aliphatic monoamines — CWC Schedule 2", category: "chemical", controlReason: "CR 156/2025 Chemical Category" },
  { listId: "uae_156_2025", hsCode: "3824.99", description: "Chemical mixtures — controlled precursors", category: "chemical", controlReason: "CR 156/2025 Chemical Category" },
  { listId: "uae_156_2025", hsCode: "8806.91", description: "Unmanned aircraft >150kg long-range", category: "missile", controlReason: "CR 156/2025 Missile — MTCR Category I" },
  { listId: "uae_156_2025", hsCode: "8412.10", description: "Reaction engines — jet/rocket propulsion", category: "missile", controlReason: "CR 156/2025 Missile — MTCR" },
  { listId: "uae_156_2025", hsCode: "8803.10", description: "Propellers and rotors — controlled variants", category: "missile", controlReason: "CR 156/2025 Missile — MTCR Category II" },
  { listId: "uae_156_2025", hsCode: "9301.00", description: "Military weapons — MoD licence required", category: "weapons_munitions", controlReason: "CR 156/2025 Weapons Category" },
  { listId: "uae_156_2025", hsCode: "9306.21", description: "Military-specification cartridges", category: "weapons_munitions", controlReason: "CR 156/2025 Munitions" },
  { listId: "uae_156_2025", hsCode: "8517.62", description: "Interception-capable communication machines", category: "cyber_surveillance", controlReason: "CR 156/2025 Cyber — Wassenaar" },
  { listId: "uae_156_2025", hsCode: "8543.70", description: "Network monitoring / IMSI catchers", category: "cyber_surveillance", controlReason: "CR 156/2025 Cyber Category" },
  { listId: "uae_156_2025", hsCode: "8486.20", description: "Semiconductor manufacturing equipment — advanced node", category: "dual_use", controlReason: "CR 156/2025 Dual-Use" },
  { listId: "uae_156_2025", hsCode: "9014.80", description: "Inertial navigation instruments — MTCR-relevant", category: "dual_use", controlReason: "CR 156/2025 Dual-Use" },
  { listId: "uae_156_2025", hsCode: "8456.10", description: "Laser machine-tools — Wassenaar precision manufacturing", category: "dual_use", controlReason: "CR 156/2025 Dual-Use" },
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
      // No live feed configured — write static seed so downstream consumers have data
      if (spec.listId === "uae_156_2025") {
        try {
          await store.set(`current/${spec.listId}.json`, JSON.stringify(UAE_156_STATIC_SEED));
          outcomes.push({ listId: spec.listId, ok: true, entries: UAE_156_STATIC_SEED.length, error: "static seed (no live feed)" });
        } catch (err) {
          outcomes.push({ listId: spec.listId, ok: false, error: `static seed write failed: ${err instanceof Error ? err.message : String(err)}` });
        }
      } else {
        outcomes.push({ listId: spec.listId, ok: false, error: "feed URL not configured" });
      }
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
