// Hawkeye Sterling — PEP database refresh scheduler (audit follow-up #17).
//
// Daily Netlify scheduled function (04:23 UTC ≈ 08:23 UAE) that fetches
// the OpenSanctions PEP dataset (or a configured equivalent) and writes
// the canonicalised list to a Netlify Blob. Downstream classifyPepRole
// consumes individual roles; this scheduler keeps the corpus fresh so
// new PEPs (newly elected ministers, regulatory appointments, etc.)
// are picked up within 24h.
//
// Persistence: writes 'pep/current.json' with the entire PEP record
// set, plus 'pep/delta-<ts>.json' on every diff with new arrivals.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { emit } from "../../dist/src/integrations/webhook-emitter.js";

const STORE_NAME = "hawkeye-pep";
const RUN_LABEL = "pep-refresh";
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_FEED_URL =
  "https://data.opensanctions.org/datasets/latest/peps/entities.ftm.json";

interface PepRecord {
  id: string;
  name: string;
  aliases?: string[];
  countries?: string[];
  topics?: string[];
  positions?: string[];
  birthDate?: string;
  endDate?: string;
}

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function normalisePepLine(line: string): PepRecord | null {
  try {
    const obj = JSON.parse(line) as Record<string, unknown>;
    const props = (obj["properties"] as Record<string, unknown> | undefined) ?? {};
    const name = firstString(props["name"]) ?? firstString(obj["caption"]);
    if (!name) return null;
    const id = String(obj["id"] ?? `pep_${Math.random().toString(36).slice(2, 10)}`);
    const out: PepRecord = { id, name };
    const aliases = arrayString(props["alias"]);
    const countries = arrayString(props["country"]);
    const topics = arrayString(props["topics"]);
    const positions = arrayString(props["position"]);
    const birthDate = firstString(props["birthDate"]);
    const endDate = firstString(props["endDate"]);
    if (aliases.length) out.aliases = aliases;
    if (countries.length) out.countries = countries;
    if (topics.length) out.topics = topics;
    if (positions.length) out.positions = positions;
    if (birthDate) out.birthDate = birthDate;
    if (endDate) out.endDate = endDate;
    return out;
  } catch {
    return null;
  }
}

function firstString(v: unknown): string | undefined {
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0] as string;
  if (typeof v === "string") return v;
  return undefined;
}

function arrayString(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return [v];
  return [];
}

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();
  const feedUrl = process.env["FEED_PEP_URL"] ?? DEFAULT_FEED_URL;

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: err instanceof Error ? err.message : String(err) }, 503);
  }

  const res = await fetchWithTimeout(feedUrl);
  if (!res || !res.ok) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: `feed ${res?.status ?? "no-response"}`, durationMs: Date.now() - startedAt }, 503);
  }

  // OpenSanctions ships line-delimited JSON.
  const text = await res.text();
  const records: PepRecord[] = [];
  for (const line of text.split(/\n+/)) {
    if (!line.trim()) continue;
    const rec = normalisePepLine(line);
    if (rec) records.push(rec);
  }

  if (records.length === 0) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: "feed parse yielded zero records", durationMs: Date.now() - startedAt }, 502);
  }

  // Read prior snapshot for delta computation.
  let previous: PepRecord[] = [];
  try {
    const prevRaw = await store.get("pep/current.json", { type: "text" });
    if (prevRaw) previous = JSON.parse(prevRaw) as PepRecord[];
  } catch {
    // first run
  }

  const prevById = new Map(previous.map((p) => [p.id, p]));
  const additions: PepRecord[] = [];
  const removals: PepRecord[] = [];
  const currentIds = new Set(records.map((r) => r.id));
  for (const r of records) if (!prevById.has(r.id)) additions.push(r);
  for (const p of previous) if (!currentIds.has(p.id)) removals.push(p);

  // Persist.
  try {
    await store.set("pep/current.json", JSON.stringify(records));
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: `snapshot write failed: ${err instanceof Error ? err.message : String(err)}`, durationMs: Date.now() - startedAt }, 503);
  }
  if (additions.length + removals.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    try {
      await store.set(
        `pep/delta-${ts}.json`,
        JSON.stringify({
          at: new Date().toISOString(),
          additions: additions.length,
          removals: removals.length,
          sampleAdditions: additions.slice(0, 25),
          sampleRemovals: removals.slice(0, 25),
        }),
      );
    } catch {
      // best-effort
    }
    if (additions.length >= 5) {
      try {
        await emit("audit_drift", {
          kind: "pep_refresh_additions",
          count: additions.length,
          sample: additions.slice(0, 8).map((p) => p.name),
        });
      } catch {
        // best-effort
      }
    }
  }

  return jsonResponse({
    ok: true,
    label: RUN_LABEL,
    total: records.length,
    additions: additions.length,
    removals: removals.length,
    durationMs: Date.now() - startedAt,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

export const config: Config = {
  // Daily at 04:23 UTC.
  schedule: "23 4 * * *",
};
