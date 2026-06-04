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

import { randomBytes } from "node:crypto";
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { emit } from "../../dist/src/integrations/webhook-emitter.js";
import { writeHeartbeat, fireAlert } from "../lib/heartbeat.js";

const STORE_NAME = "hawkeye-pep";
const RUN_LABEL = "pep-refresh";
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_FEED_URL =
  "https://data.opensanctions.org/datasets/latest/peps/entities.ftm.json";

// AfricaPEP supplementary feed — OpenSanctions Africa-specific dataset.
// Augments the main PEPs corpus with deeper coverage of African PEPs
// not yet in Wikidata/EveryPolitician. Same FTM line-delimited JSON format.
// Override via FEED_AFRICAPEP_URL; disable by setting it to "disabled".
const AFRICAPEP_FEED_URL =
  process.env["FEED_AFRICAPEP_URL"] ??
  "https://data.opensanctions.org/datasets/latest/africapep/entities.ftm.json";

// If OPENSANCTIONS_DATA_TOKEN is set, use the authenticated Data Delivery Service
// endpoint. If unset, fall back to the public URL (requires a commercial license
// for business use — see https://www.opensanctions.org/licensing/).
function resolveFeedUrl(): string {
  const override = process.env["FEED_PEP_URL"];
  if (override) return override;
  const token = process.env["OPENSANCTIONS_DATA_TOKEN"];
  if (!token) {
    console.warn(
      "[pep-refresh] OPENSANCTIONS_DATA_TOKEN is not set — using the public OpenSanctions URL. " +
      "A commercial license is required for business use: https://www.opensanctions.org/licensing/",
    );
  }
  return DEFAULT_FEED_URL;
}

function buildFeedHeaders(): Record<string, string> {
  const token = process.env["OPENSANCTIONS_DATA_TOKEN"];
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers["authorization"] = `ApiKey ${token}`;
  return headers;
}

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

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS, headers?: Record<string, string>): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: headers ?? { accept: "application/json" } });
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
    const id = String(obj["id"] ?? `pep_${randomBytes(4).toString("hex")}`);
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

const LOCK_TTL_MS = 10 * 60 * 1000;

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();
  const feedUrl = resolveFeedUrl();
  const feedHeaders = buildFeedHeaders();

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: err instanceof Error ? err.message : String(err) }, 503);
  }

  // Idempotency lock — prevents overlapping runs under Lambda warm-instance reuse.
  const hbStore = getStore("hawkeye-function-heartbeats");
  const existingLock = await hbStore.get(`${RUN_LABEL}/lock`, { type: "json" }).catch(() => null) as { lockedAt: string } | null;
  if (existingLock) {
    const lockAge = Date.now() - new Date(existingLock.lockedAt).getTime();
    if (lockAge < LOCK_TTL_MS) {
      console.info(`[${RUN_LABEL}] already running (lock age ${Math.round(lockAge / 1000)}s) — skipping`);
      return jsonResponse({ ok: true, skipped: true, reason: "lock_active", lockAgeMs: lockAge });
    }
  }
  await hbStore.setJSON(`${RUN_LABEL}/lock`, { lockedAt: new Date().toISOString() }).catch(() => undefined);

  const res = await fetchWithTimeout(feedUrl, FETCH_TIMEOUT_MS, feedHeaders);
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

  // Supplementary AfricaPEP feed — merge net-new records (by ID) into corpus.
  let africaPepAdded = 0;
  if (AFRICAPEP_FEED_URL !== "disabled") {
    const africaRes = await fetchWithTimeout(AFRICAPEP_FEED_URL, FETCH_TIMEOUT_MS, feedHeaders);
    if (africaRes?.ok) {
      const africaText = await africaRes.text();
      const existingIds = new Set(records.map((r) => r.id));
      for (const line of africaText.split(/\n+/)) {
        if (!line.trim()) continue;
        const rec = normalisePepLine(line);
        if (rec && !existingIds.has(rec.id)) {
          records.push(rec);
          existingIds.add(rec.id);
          africaPepAdded++;
        }
      }
      if (africaPepAdded > 0) {
        console.info(`[${RUN_LABEL}] AfricaPEP: merged ${africaPepAdded} net-new records`);
      }
    } else {
      console.warn(`[${RUN_LABEL}] AfricaPEP feed unavailable (${africaRes?.status ?? "no-response"}) — skipping supplementary load`);
    }
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

  // E6: 12-month historical PEP retention.
  // Removed PEPs are moved to pep/archive.json with a removedAt timestamp.
  // Records older than 12 months are pruned. The archive is loaded by
  // pep-match alongside the live corpus so recently-departed PEPs remain
  // flagged for the mandatory retention window (FATF R.12 — EDD must
  // continue for 12 months after an individual leaves a PEP position).
  interface ArchivedPepRecord extends PepRecord { removedAt: string }
  const RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
  const now12 = Date.now();
  let archive: ArchivedPepRecord[] = [];
  try {
    const archRaw = await store.get("pep/archive.json", { type: "text" });
    if (archRaw) archive = JSON.parse(archRaw) as ArchivedPepRecord[];
  } catch { /* first run */ }
  // Prune records past 12-month retention window.
  archive = archive.filter((a) => now12 - Date.parse(a.removedAt) < RETENTION_MS);
  // Add newly removed records (skip those already in the archive).
  const archiveIds = new Set(archive.map((a) => a.id));
  for (const r of removals) {
    if (!archiveIds.has(r.id)) {
      archive.push({ ...r, removedAt: new Date().toISOString() });
    }
  }
  // Cap archive at 50,000 to guard against unbounded growth.
  if (archive.length > 50_000) archive = archive.slice(-50_000);
  try {
    await store.set("pep/archive.json", JSON.stringify(archive));
  } catch { /* best-effort */ }

  // Persist.
  try {
    await store.set("pep/current.json", JSON.stringify(records));
  } catch (err) {
    const errMsg = `snapshot write failed: ${err instanceof Error ? err.message : String(err)}`;
    await fireAlert(RUN_LABEL, errMsg, "high");
    return jsonResponse({ ok: false, label: RUN_LABEL, error: errMsg, durationMs: Date.now() - startedAt }, 503);
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
          archivedTotal: archive.length,
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

  await writeHeartbeat(RUN_LABEL);
  await hbStore.delete(`${RUN_LABEL}/lock`).catch(() => undefined);

  return jsonResponse({
    ok: true,
    label: RUN_LABEL,
    total: records.length,
    additions: additions.length,
    removals: removals.length,
    archived: archive.length,
    africaPepAdded,
    retentionMonths: 12,
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
