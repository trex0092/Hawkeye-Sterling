// POST /api/cron/sanctions-sweep
//
// Scheduled sanctions list change detector. Called by Netlify cron or an
// external scheduler (Upstash, etc.) on a regular cadence (recommend every
// 6 hours).
//
// What it does:
//   1. Issues a conditional GET to the OFAC SDN XML endpoint using the
//      If-Modified-Since / If-None-Match headers to detect changes cheaply.
//   2. Compares the ETag (or Last-Modified) against the last-known value
//      stored in Netlify Blobs under "hawkeye-sanctions-meta/ofac-last-etag".
//   3. If the list has changed, appends a `sanctions.list_updated` event to
//      the audit chain so the compliance history is tamper-evidently recorded.
//   4. Returns { updated: boolean, deltaCount: number, etag: string }.
//
// Security: protected by CRON_SECRET (timing-safe compare).
// Pattern: follows the same conventions as /api/cron/transaction-monitor.
//
// OFAC SDN endpoint: https://www.treasury.gov/ofac/downloads/sdn.xml
// (The full XML is ~10 MB; we only read the response HEAD / metadata unless
// the list has changed, to keep the function fast and bandwidth-efficient.)

import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Constants ────────────────────────────────────────────────────────────────

const OFAC_SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml";
const META_STORE_NAME = "hawkeye-sanctions-meta";
const META_KEY = "ofac-last-etag";

// ── Blob helpers ─────────────────────────────────────────────────────────────

interface SanctionsMeta {
  etag: string | null;
  lastModified: string | null;
  lastCheckedAt: string;
  lastUpdatedAt: string | null;
  updateCount: number;
}

async function loadMetaStore() {
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  return siteID && token
    ? getStore({ name: META_STORE_NAME, siteID, token, consistency: "strong" })
    : getStore({ name: META_STORE_NAME });
}

async function readMeta(): Promise<SanctionsMeta | null> {
  try {
    const store = await loadMetaStore();
    const raw = await store.get(META_KEY, { type: "json" }) as SanctionsMeta | null;
    return raw ?? null;
  } catch (err) {
    console.warn("[sanctions-sweep] meta read failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function writeMeta(meta: SanctionsMeta): Promise<void> {
  try {
    const store = await loadMetaStore();
    await store.setJSON(META_KEY, meta);
  } catch (err) {
    console.warn("[sanctions-sweep] meta write failed:", err instanceof Error ? err.message : String(err));
  }
}

// ── CRON_SECRET validation (timing-safe) ─────────────────────────────────────

async function validateCronSecret(req: Request): Promise<boolean> {
  const cronSecret = process.env["CRON_SECRET"] ?? "";
  if (!cronSecret) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");
  const ha = createHmac("sha256", COMPARE_KEY).update(cronSecret).digest();
  const hb = createHmac("sha256", COMPARE_KEY).update(got).digest();
  return timingSafeEqual(ha, hb);
}

// ── Estimate delta count from Content-Length change ──────────────────────────
// We cannot parse the full XML without downloading it. Use the difference in
// Content-Length (bytes) as a rough proxy for the number of new entries.
// Empirically, each SDN entry is ~400-800 bytes in the XML, so dividing by 600
// gives a conservative estimate. Returns 0 if sizes are not available.

function estimateDeltaCount(prevSize: number | null, newSize: number | null): number {
  if (prevSize === null || newSize === null || newSize <= prevSize) return 0;
  const byteDiff = newSize - prevSize;
  return Math.max(1, Math.round(byteDiff / 600));
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Auth
  if (!(await validateCronSecret(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // 2. Load last-known metadata from Blobs
    const prevMeta = await readMeta();
    const prevEtag = prevMeta?.etag ?? null;
    const prevLastModified = prevMeta?.lastModified ?? null;
    const prevContentLength = (prevMeta as (SanctionsMeta & { contentLength?: number }) | null)?.contentLength ?? null;

    // 3. Conditional GET to OFAC SDN — use If-None-Match / If-Modified-Since
    //    to avoid downloading the full ~10 MB XML unless it changed.
    const reqHeaders: Record<string, string> = {
      "Accept": "application/xml, text/xml",
      "User-Agent": "Hawkeye-Sterling-SanctionsSweep/1.0 (compliance-monitoring)",
    };
    if (prevEtag) reqHeaders["If-None-Match"] = prevEtag;
    else if (prevLastModified) reqHeaders["If-Modified-Since"] = prevLastModified;

    let updated = false;
    let deltaCount = 0;
    let newEtag: string | null = null;
    let newLastModified: string | null = null;
    let newContentLength: number | null = null;
    let fetchError: string | null = null;

    try {
      const res = await fetch(OFAC_SDN_URL, {
        method: "GET",
        headers: reqHeaders,
        signal: AbortSignal.timeout(30_000),
      });

      newEtag = res.headers.get("etag");
      newLastModified = res.headers.get("last-modified");
      const clStr = res.headers.get("content-length");
      newContentLength = clStr ? parseInt(clStr, 10) : null;

      if (res.status === 304) {
        // Not Modified — list unchanged
        updated = false;
      } else if (res.ok) {
        // Consume response body (required to release the connection), but we only
        // need the first few bytes to detect real content vs. an empty/error body.
        // The full body is NOT stored — we just detect the change here.
        const bodyText = await res.text();
        const looksLikeSdn = bodyText.includes("<sdnList") || bodyText.includes("<publshInformation");

        if (!looksLikeSdn) {
          // Defensive: OFAC might have returned a redirect page or error
          console.warn("[sanctions-sweep] OFAC response doesn't look like SDN XML, skipping update");
          updated = false;
        } else {
          // Compare ETag or Last-Modified to previous known value
          const etagChanged = newEtag && newEtag !== prevEtag;
          const lastModifiedChanged = newLastModified && newLastModified !== prevLastModified;
          const isFirstRun = !prevEtag && !prevLastModified;

          updated = Boolean(etagChanged || lastModifiedChanged || isFirstRun);

          if (updated && !isFirstRun) {
            deltaCount = estimateDeltaCount(prevContentLength, newContentLength);
          }
        }
      } else {
        fetchError = `OFAC SDN HTTP ${res.status}`;
        console.warn(`[sanctions-sweep] ${fetchError}`);
      }
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
      console.warn("[sanctions-sweep] OFAC fetch error:", fetchError);
    }

    // 4. If changed: append audit chain event + update stored metadata
    if (updated) {
      const newMeta: SanctionsMeta & { contentLength?: number } = {
        etag: newEtag ?? prevEtag,
        lastModified: newLastModified ?? prevLastModified,
        lastCheckedAt: now,
        lastUpdatedAt: now,
        updateCount: (prevMeta?.updateCount ?? 0) + 1,
        ...(newContentLength !== null ? { contentLength: newContentLength } : {}),
      };
      await writeMeta(newMeta);

      // Tamper-evidently record the list-change event in the audit chain
      await writeAuditChainEntry(
        {
          event: "sanctions.list_updated",
          actor: "cron_internal",
          source: "OFAC SDN",
          url: OFAC_SDN_URL,
          etag: newEtag,
          lastModified: newLastModified,
          deltaCount,
          updateCount: newMeta.updateCount,
          detectedAt: now,
        },
        "default",
      );

      void `[sanctions-sweep] OFAC SDN list changed — etag=${newEtag ?? "n/a"}, estimatedDelta=${deltaCount}`;
    } else {
      // Always bump lastCheckedAt even when unchanged, so ops can see recency
      const checkedMeta: SanctionsMeta & { contentLength?: number } = {
        etag: newEtag ?? prevEtag,
        lastModified: newLastModified ?? prevLastModified,
        lastCheckedAt: now,
        lastUpdatedAt: prevMeta?.lastUpdatedAt ?? null,
        updateCount: prevMeta?.updateCount ?? 0,
        ...(newContentLength !== null ? { contentLength: newContentLength } : {}),
      };
      await writeMeta(checkedMeta);
    }

    return NextResponse.json({
      ok: true,
      updated,
      deltaCount,
      etag: newEtag ?? prevEtag,
      lastModified: newLastModified ?? prevLastModified,
      checkedAt: now,
      ...(fetchError ? { warning: fetchError } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sanctions-sweep] unhandled error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Also support GET for health-check probes (returns last-known meta without
// triggering a fetch — useful for monitoring dashboards).
export async function GET(req: Request): Promise<NextResponse> {
  // Reuse the same CRON_SECRET check so only authorised callers can read meta
  if (!(await validateCronSecret(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const meta = await readMeta();
  return NextResponse.json({
    ok: true,
    lastCheckedAt: meta?.lastCheckedAt ?? null,
    lastUpdatedAt: meta?.lastUpdatedAt ?? null,
    updateCount: meta?.updateCount ?? 0,
    etag: meta?.etag ?? null,
  });
}
