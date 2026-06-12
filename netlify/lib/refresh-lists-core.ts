// Hawkeye Sterling — shared nightly sanctions-refresh pipeline.
//
// Extracted from netlify/functions/refresh-lists.ts (2026-06) so two entry
// points can run the identical pipeline with different per-adapter budgets:
//
//   netlify/functions/refresh-lists.ts             scheduled trigger (03:00 UTC,
//                                                  ~30 s class) — delegates to the
//                                                  background worker, falls back to
//                                                  running this in-process with the
//                                                  20 s default leash if delegation
//                                                  fails (self-fetch TLS issues have
//                                                  been observed on this platform).
//   netlify/functions/refresh-lists-background.mts background worker (15-min class)
//                                                  — runs this with the 60 s leash so
//                                                  au_dfat / ch_seco / eu_fsf get one
//                                                  full-budget refresh per day.
//
// Identity keys (lock, heartbeat, meta) are pinned to the "refresh-lists"
// label no matter which entry executes, so health-monitor.mts (heartbeat
// label "refresh-lists", 10 h max silence) and the idempotency lock keep
// working across the trigger/worker split.

import { getStore } from '@netlify/blobs';
import { runIngestionAll } from '../../src/ingestion/run-all.js';
import { buildSanctionsMeta } from '../../src/ingestion/sanctions-meta.js';

// Stable identity for locks / heartbeats / meta regardless of entry point.
export const REFRESH_LISTS_LABEL = 'refresh-lists';

// Lists to watch for designation changes. Matches LIST_IDS in quick-screen/route.ts.
const WATCHED_LIST_IDS = [
  'un_consolidated', 'ofac_sdn', 'ofac_cons', 'eu_fsf', 'uk_ofsi',
  'uae_eocn', 'uae_ltl', 'ca_osfi', 'ch_seco', 'au_dfat', 'fatf',
];

// Snapshot: listId → Map<listRef, name>
type ListSnapshot = Map<string, Map<string, string>>;

async function snapshotLists(store: ReturnType<typeof getStore>, runLabel: string): Promise<ListSnapshot> {
  const snap: ListSnapshot = new Map();
  await Promise.all(WATCHED_LIST_IDS.map(async (listId) => {
    try {
      // NormalisedEntity shape: { id, name, listings: [{ reference? }], ... }
      // listRef is NOT a top-level field — it is derived from listings[0].reference ?? id.
      const raw = await store.get(`${listId}/latest.json`, { type: 'json' }) as {
        entities?: Array<{ id?: string; name?: string; listings?: Array<{ reference?: string }> }>;
      } | null;
      const m = new Map<string, string>();
      for (const e of raw?.entities ?? []) {
        const listRef = e.listings?.[0]?.reference ?? e.id;
        if (listRef && e.name) m.set(listRef, e.name);
      }
      snap.set(listId, m);
    } catch (err) {
      // NETLIFY-009 (forensic audit batch 3): prior bare catch hid every
      // snapshot failure. A permissions issue or schema-drift on one list
      // would silently make change-detection think "no entities ever
      // existed" for that list — so every entity later loaded would
      // appear as an addition and no removals would be detected.
      console.warn(
        `[${runLabel}] snapshot load failed for ${listId} — changes against this list won't be detected:`,
        err instanceof Error ? err.message : String(err),
      );
      snap.set(listId, new Map());
    }
  }));
  return snap;
}

interface DesignationChange {
  listId: string;
  added: Array<{ listRef: string; name: string }>;
  removed: Array<{ listRef: string; name: string }>;
}

function diffSnapshots(before: ListSnapshot, after: ListSnapshot): DesignationChange[] {
  const changes: DesignationChange[] = [];
  const allIds = new Set([...before.keys(), ...after.keys()]);
  for (const listId of allIds) {
    const bMap = before.get(listId) ?? new Map<string, string>();
    const aMap = after.get(listId) ?? new Map<string, string>();
    // Skip first-run initialisation: if the list had no entities before,
    // every entity would appear as "added" — that's noise, not a real change.
    if (bMap.size === 0) continue;
    const added: Array<{ listRef: string; name: string }> = [];
    const removed: Array<{ listRef: string; name: string }> = [];
    for (const [ref, name] of aMap) {
      if (!bMap.has(ref)) added.push({ listRef: ref, name });
    }
    for (const [ref, name] of bMap) {
      if (!aMap.has(ref)) removed.push({ listRef: ref, name });
    }
    if (added.length || removed.length) changes.push({ listId, added, removed });
  }
  return changes;
}

async function alertDesignationChanges(
  changes: DesignationChange[],
  webhookUrl: string | undefined,
  runLabel: string,
): Promise<void> {
  if (changes.length === 0) return;

  const totalAdded = changes.reduce((s, c) => s + c.added.length, 0);
  const totalRemoved = changes.reduce((s, c) => s + c.removed.length, 0);

  console.info(
    `[${runLabel}] designation changes: +${totalAdded} new, -${totalRemoved} delisted across ${changes.length} list(s)`,
  );

  const SAMPLE = 20;
  const lines: string[] = [
    `⚡ HAWKEYE STERLING — SANCTIONS LIST CHANGE DETECTED`,
    ``,
    `Detected at  : ${new Date().toISOString()}`,
    `Function     : ${runLabel}`,
    `Lists changed: ${changes.map((c) => c.listId).join(', ')}`,
    `New designations : ${totalAdded}`,
    `Delistings       : ${totalRemoved}`,
    ``,
  ];

  if (totalAdded > 0) {
    lines.push(`NEW DESIGNATIONS — ACTION REQUIRED`);
    lines.push(`Screen all active customers and monitored entities immediately.`);
    lines.push(`Legal basis: CBUAE AML guidance — freeze obligations arise at the moment of designation.`);
    lines.push(``);
    for (const c of changes) {
      if (!c.added.length) continue;
      lines.push(`  ${c.listId.toUpperCase()} +${c.added.length}`);
      for (const e of c.added.slice(0, SAMPLE)) {
        lines.push(`    + ${e.name}  [${e.listRef}]`);
      }
      if (c.added.length > SAMPLE) lines.push(`    … and ${c.added.length - SAMPLE} more`);
    }
    lines.push(``);
  }

  if (totalRemoved > 0) {
    lines.push(`DELISTINGS — ACTION REQUIRED`);
    lines.push(`Review all frozen assets / blocked relationships for these persons or entities.`);
    lines.push(`Delisted persons may be entitled to asset unblocking — consult MLRO before taking action.`);
    lines.push(``);
    for (const c of changes) {
      if (!c.removed.length) continue;
      lines.push(`  ${c.listId.toUpperCase()} -${c.removed.length}`);
      for (const e of c.removed.slice(0, SAMPLE)) {
        lines.push(`    - ${e.name}  [${e.listRef}]`);
      }
      if (c.removed.length > SAMPLE) lines.push(`    … and ${c.removed.length - SAMPLE} more`);
    }
    lines.push(``);
  }

  if (!webhookUrl) return;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8_000);
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: lines.join('\n'),
          event: 'sanctions_designation_change',
          totalAdded,
          totalRemoved,
          detectedAt: new Date().toISOString(),
          label: runLabel,
          changes: changes.map((c) => ({
            listId: c.listId,
            addedCount: c.added.length,
            removedCount: c.removed.length,
            added: c.added.slice(0, SAMPLE),
            removed: c.removed.slice(0, SAMPLE),
          })),
        }),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.warn(`[${runLabel}] designation-change webhook failed:`, err instanceof Error ? err.message : String(err));
  }
}

interface SanctionsStatusList { listId: string; displayName: string; status: 'healthy' | 'degraded' | 'stale' | 'missing' | 'unconfigured'; entityCount: number | null }
interface SanctionsStatusResponse { lists?: SanctionsStatusList[] }

/**
 * Shared auth gate for the refresh-lists trigger and the background worker.
 * Only the Netlify scheduler (x-nf-event header), the trigger→worker hop
 * (which forwards the legacy x-netlify-scheduled-function header), or
 * callers with ADMIN_TOKEN are permitted. The headers are technically
 * forgeable; a forged request only triggers an idempotent, lock-protected
 * public-list refresh (no data egress) — the documented, accepted trust
 * posture of the scheduled ingestion fleet.
 */
export function isAuthorizedRefreshRequest(req: Request): boolean {
  const isScheduled =
    req.headers.get('x-nf-event') === 'schedule' ||
    req.headers.get('x-netlify-scheduled-function') === 'true';
  if (isScheduled) return true;
  const adminToken = process.env['ADMIN_TOKEN'];
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return Boolean(adminToken) && bearer === adminToken;
}

export interface RefreshListsRunOptions {
  /** Per-adapter leash forwarded to runIngestionAll(). */
  adapterTimeoutMs: number;
  /**
   * Log/observability label for this execution path
   * ("refresh-lists" in-process fallback, "refresh-lists-background" worker).
   * Lock, heartbeat and meta keys stay pinned to REFRESH_LISTS_LABEL.
   */
  runLabel: string;
}

export interface RefreshListsRunResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * The full nightly refresh pipeline: idempotency lock → before-snapshot →
 * runIngestionAll(adapterTimeoutMs) → after-snapshot diff + designation
 * alerts → sanctions_status read-back → zero-entity checks → degraded-run
 * webhook → heartbeat + sanctions/meta.json on success.
 *
 * Behaviour is identical to the pre-split refresh-lists.ts handler except
 * that the per-adapter leash is now a parameter.
 */
export async function runRefreshListsPipeline(opts: RefreshListsRunOptions): Promise<RefreshListsRunResult> {
  const { adapterTimeoutMs, runLabel } = opts;
  const alertWebhook = process.env['ALERT_WEBHOOK_URL'];
  const hbStore = getStore('hawkeye-function-heartbeats');

  // Idempotency lock — prevents concurrent ingestion under Lambda warm-instance
  // overlap AND double-running when the scheduled trigger's delegation POST
  // succeeds but the trigger then (incorrectly) also runs the fallback.
  // A stale lock (> 10 min) is silently broken to recover from a crashed run.
  const LOCK_TTL_MS = 10 * 60 * 1000;
  const existingLock = await hbStore.get(`${REFRESH_LISTS_LABEL}/lock`, { type: 'json' }) as { lockedAt: string } | null;
  if (existingLock) {
    const lockAge = Date.now() - new Date(existingLock.lockedAt).getTime();
    if (lockAge < LOCK_TTL_MS) {
      console.info(`[${runLabel}] already running (lock age ${Math.round(lockAge / 1000)}s) — skipping`);
      return {
        status: 200,
        body: { skipped: true, reason: 'lock_held', lockedAt: existingLock.lockedAt },
      };
    }
  }
  await hbStore.setJSON(`${REFRESH_LISTS_LABEL}/lock`, { lockedAt: new Date().toISOString(), label: runLabel });

  try {
    // Snapshot the current list entities BEFORE ingestion so we can diff
    // and fire immediate designation-change / delisting alerts.
    const listStore = getStore('hawkeye-lists');
    const beforeSnap = await snapshotLists(listStore, runLabel);

    const result = await runIngestionAll(runLabel, { adapterTimeoutMs });

    // Snapshot AFTER ingestion and diff — fire immediate alert on any change.
    const afterSnap = await snapshotLists(listStore, runLabel);
    const changes = diffSnapshots(beforeSnap, afterSnap);
    await alertDesignationChanges(changes, alertWebhook, runLabel);

    // Call sanctions_status to confirm storage state from the read path.
    const baseUrl =
      process.env['URL'] ??
      process.env['DEPLOY_PRIME_URL'] ??
      'https://hawkeye-sterling.netlify.app';
    // Audit H-03 / P2-07: a list can write successfully but parse to zero
    // entities (parser bug or empty upstream feed). Detect those by reading
    // sanctions_status after the refresh and surfacing any healthy or degraded
    // adapter whose entityCount is 0.
    const zeroEntityLists: string[] = [];
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 10_000);
      try {
        const res = await fetch(`${baseUrl}/api/sanctions/status`, {
          headers: process.env['SANCTIONS_CRON_TOKEN']
            ? { authorization: `Bearer ${process.env['SANCTIONS_CRON_TOKEN']}` }
            : {},
          signal: ctl.signal,
        });
        if (res.ok) {
          const status = await res.json() as SanctionsStatusResponse;
          console.info(`[${runLabel}] sanctions_status after refresh: ${JSON.stringify(status)}`);
          for (const l of status.lists ?? []) {
            if (l.entityCount === 0 && (l.status === 'healthy' || l.status === 'degraded')) {
              zeroEntityLists.push(`${l.listId} (${l.displayName}) [${l.status}]`);
            }
          }
        } else {
          console.warn(`[${runLabel}] sanctions_status returned HTTP ${res.status}`);
        }
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      console.warn(`[${runLabel}] sanctions_status call failed (non-critical):`, err instanceof Error ? err.message : String(err));
    }

    // UAE mandatory lists (EOCN + LTL) must never ingest with zero entities.
    // A zero-entity ingest means the XLSX download or parser failed completely —
    // Cabinet Resolution 134/2025 Art.18 requires these lists to be current.
    const uaeZeroLists = zeroEntityLists.filter(
      (l) => l.startsWith('uae_eocn') || l.startsWith('uae_ltl'),
    );
    if (uaeZeroLists.length > 0) {
      console.error(
        `[${runLabel}] CRITICAL: UAE mandatory lists ingested with zero entities — screening corpus INCOMPLETE:`,
        uaeZeroLists.join(', '),
      );
    }

    // Fire alert webhook on write failure OR zero-entity ingest.
    if (alertWebhook && (result.anyWriteFailed || zeroEntityLists.length > 0)) {
      try {
        const reasons: string[] = [];
        if (result.anyWriteFailed) reasons.push(`${result.failed_count} adapter write(s) failed`);
        if (zeroEntityLists.length > 0) reasons.push(`zero-entity ingest: ${zeroEntityLists.join(', ')}`);
        await fetch(alertWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `[Hawkeye Sterling] ${runLabel} DEGRADED — ${reasons.join('; ')} at ${result.at}. Screening is degraded until the next successful run.`,
            summary: result.summary,
            zeroEntityLists,
          }),
        });
      } catch (webhookErr) {
        console.warn(`[${runLabel}] alert webhook failed (non-critical):`, webhookErr instanceof Error ? webhookErr.message : webhookErr);
      }
    }

    // Write heartbeat on success so health-monitor can detect silent cron failures.
    // Key stays "refresh-lists" whichever entry ran — health-monitor.mts pins it.
    if (!result.anyWriteFailed) {
      try {
        await hbStore.setJSON(REFRESH_LISTS_LABEL, { lastSuccess: new Date().toISOString(), label: REFRESH_LISTS_LABEL });
      } catch (hbErr) {
        console.warn(`[${runLabel}] heartbeat write failed (non-critical):`, hbErr instanceof Error ? hbErr.message : hbErr);
      }

      // Write sanctions/meta.json to the default app store so /api/screening/health
      // can detect corpus freshness. Without this key the health route reports
      // CORPUS_MISSING permanently because the ingestion writes per-list data to
      // `hawkeye-lists/<listId>/latest.json` but never updates the summary key
      // that the read path expects. Schema must match the reader in
      // web/app/api/screening/health/route.ts:checkSanctionsLists().
      try {
        const appStore = getStore('hawkeye-sterling');
        await appStore.setJSON('sanctions/meta.json', buildSanctionsMeta(result, runLabel));
      } catch (metaErr) {
        // BLOBS-02: this WAS labelled "non-critical" but downstream
        // /api/screening/health uses this key to determine corpus
        // freshness. A silent failure here means the health endpoint
        // reports CORPUS_MISSING indefinitely despite a successful
        // per-list write. Elevate the log to ERROR so SLA monitors can
        // catch it and operators don't dismiss it as benign.
        console.error(
          `[${runLabel}] sanctions/meta.json write FAILED — /api/screening/health will report CORPUS_MISSING until next successful ingest. Detail:`,
          metaErr instanceof Error ? metaErr.message : String(metaErr),
        );
      }
    }

    const totalAdded = changes.reduce((s, c) => s + c.added.length, 0);
    const totalRemoved = changes.reduce((s, c) => s + c.removed.length, 0);

    return {
      status: result.anyWriteFailed ? 500 : 200,
      body: {
        at: result.at,
        summary: result.summary,
        anyWriteFailed: result.anyWriteFailed,
        zeroEntityLists,
        designationChanges: { totalAdded, totalRemoved, listsAffected: changes.length },
        adapterTimeoutMs,
        ranVia: runLabel,
      },
    };
  } finally {
    // Release idempotency lock regardless of outcome.
    try { await hbStore.delete(`${REFRESH_LISTS_LABEL}/lock`); } catch {}
  }
}
