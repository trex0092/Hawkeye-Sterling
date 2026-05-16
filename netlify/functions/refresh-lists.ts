// Hawkeye Sterling — scheduled refresh function (daily 03:00 UTC).
//
// Delegates the per-adapter ingestion to runIngestionAll() so the
// parallel runner + error-log wiring + blob-write verification stays
// in one place (src/ingestion/run-all.ts). This function adds the
// refresh-lists-specific tail: a post-refresh sanctions_status read,
// designation-change diffing (new listings + delistings → immediate
// alert), and an optional ALERT_WEBHOOK_URL fanout on write failure.

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { runIngestionAll } from '../../src/ingestion/run-all.js';

const LABEL = 'refresh-lists';

// Lists to watch for designation changes. Matches LIST_IDS in quick-screen/route.ts.
const WATCHED_LIST_IDS = [
  'un_consolidated', 'ofac_sdn', 'ofac_cons', 'eu_fsf', 'uk_ofsi',
  'uae_eocn', 'uae_ltl', 'ca_osfi', 'ch_seco', 'au_dfat', 'fatf',
];

// Snapshot: listId → Map<listRef, name>
type ListSnapshot = Map<string, Map<string, string>>;

async function snapshotLists(store: ReturnType<typeof getStore>): Promise<ListSnapshot> {
  const snap: ListSnapshot = new Map();
  await Promise.all(WATCHED_LIST_IDS.map(async (listId) => {
    try {
      const raw = await store.get(`${listId}/latest.json`, { type: 'json' }) as {
        entities?: Array<{ listRef?: string; name?: string }>;
      } | null;
      const m = new Map<string, string>();
      for (const e of raw?.entities ?? []) {
        if (e.listRef && e.name) m.set(e.listRef, e.name);
      }
      snap.set(listId, m);
    } catch {
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
): Promise<void> {
  if (changes.length === 0) return;

  const totalAdded = changes.reduce((s, c) => s + c.added.length, 0);
  const totalRemoved = changes.reduce((s, c) => s + c.removed.length, 0);

  console.info(
    `[${LABEL}] designation changes: +${totalAdded} new, -${totalRemoved} delisted across ${changes.length} list(s)`,
  );

  const SAMPLE = 20;
  const lines: string[] = [
    `⚡ HAWKEYE STERLING — SANCTIONS LIST CHANGE DETECTED`,
    ``,
    `Detected at  : ${new Date().toISOString()}`,
    `Function     : ${LABEL}`,
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
          label: LABEL,
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
    console.warn(`[${LABEL}] designation-change webhook failed:`, err instanceof Error ? err.message : String(err));
  }
}

interface SanctionsStatusList { listId: string; displayName: string; status: string; entityCount: number | null }
interface SanctionsStatusResponse { lists?: SanctionsStatusList[] }

export default async (): Promise<Response> => {
  const alertWebhook = process.env['ALERT_WEBHOOK_URL'];

  // Snapshot the current list entities BEFORE ingestion so we can diff
  // and fire immediate designation-change / delisting alerts.
  const listStore = getStore('hawkeye-lists');
  const beforeSnap = await snapshotLists(listStore);

  const result = await runIngestionAll(LABEL);

  // Snapshot AFTER ingestion and diff — fire immediate alert on any change.
  const afterSnap = await snapshotLists(listStore);
  const changes = diffSnapshots(beforeSnap, afterSnap);
  await alertDesignationChanges(changes, alertWebhook);

  // Call sanctions_status to confirm storage state from the read path.
  const baseUrl =
    process.env['URL'] ??
    process.env['DEPLOY_PRIME_URL'] ??
    'https://hawkeye-sterling.netlify.app';
  // Audit H-03 / P2-07: a list can write successfully but parse to zero
  // entities (parser bug or empty upstream feed). Detect those by reading
  // sanctions_status after the refresh and surfacing any `status: healthy`
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
        console.log(`[${LABEL}] sanctions_status after refresh: ${JSON.stringify(status)}`);
        for (const l of status.lists ?? []) {
          if (l.status === 'healthy' && l.entityCount === 0) {
            zeroEntityLists.push(`${l.listId} (${l.displayName})`);
          }
        }
      } else {
        console.warn(`[${LABEL}] sanctions_status returned HTTP ${res.status}`);
      }
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.warn(`[${LABEL}] sanctions_status call failed (non-critical):`, err instanceof Error ? err.message : String(err));
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
          text: `[Hawkeye Sterling] ${LABEL} DEGRADED — ${reasons.join('; ')} at ${result.at}. Screening is degraded until the next successful run.`,
          summary: result.summary,
          zeroEntityLists,
        }),
      });
    } catch (webhookErr) {
      console.warn(`[${LABEL}] alert webhook failed (non-critical):`, webhookErr instanceof Error ? webhookErr.message : webhookErr);
    }
  }

  // Write heartbeat on success so health-monitor can detect silent cron failures.
  if (!result.anyWriteFailed) {
    try {
      const hbStore = getStore('hawkeye-function-heartbeats');
      await hbStore.setJSON(LABEL, { lastSuccess: new Date().toISOString(), label: LABEL });
    } catch (hbErr) {
      console.warn(`[${LABEL}] heartbeat write failed (non-critical):`, hbErr instanceof Error ? hbErr.message : hbErr);
    }
  }

  const totalAdded = changes.reduce((s, c) => s + c.added.length, 0);
  const totalRemoved = changes.reduce((s, c) => s + c.removed.length, 0);

  const statusCode = result.anyWriteFailed ? 500 : 200;
  return new Response(
    JSON.stringify({
      at: result.at,
      summary: result.summary,
      anyWriteFailed: result.anyWriteFailed,
      zeroEntityLists,
      designationChanges: { totalAdded, totalRemoved, listsAffected: changes.length },
    }),
    { status: statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
};

export const config: Config = { schedule: '0 3 * * *' };
