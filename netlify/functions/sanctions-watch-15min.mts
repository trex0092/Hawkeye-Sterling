// Netlify Scheduled Function — fast-cadence sanctions-list watch.
//
// Runs every 15 minutes. Calls runIngestionAll() in-process — the
// previous self-fetch+fast-mode design was unwired (the HTTP route
// never read the `mode: fast` flag) so the cron silently performed a
// full fan-out every tick, then failed at the maxDuration ceiling.
//
// With the in-process call and the 12 s per-adapter timeout in
// run-all.ts, the full sweep finishes well inside the 26 s Netlify
// scheduled-function budget. OFAC / EU FSF / UK OFSI publish updates
// throughout the trading day, so this cadence is the difference
// between same-quarter and next-day list freshness.
//
// On every run the function diffs the entity sets before and after
// ingestion. New designations fire an immediate webhook alert ("screen
// all active customers now"). Delistings fire a separate alert
// ("review frozen assets — delisted entity may be entitled to
// unblocking"). Both alerts fire within 15 minutes of the upstream
// list update.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { runIngestionAll } from "../../src/ingestion/run-all.js";

const LABEL = "sanctions-watch-15min";

const WATCHED_LIST_IDS = [
  "un_consolidated", "ofac_sdn", "ofac_cons", "eu_fsf", "uk_ofsi",
  "uae_eocn", "uae_ltl", "ca_osfi", "ch_seco", "au_dfat", "fatf",
];

type ListSnapshot = Map<string, Map<string, string>>; // listId → listRef → name

async function snapshotLists(store: ReturnType<typeof getStore>): Promise<ListSnapshot> {
  const snap: ListSnapshot = new Map();
  await Promise.all(WATCHED_LIST_IDS.map(async (listId) => {
    try {
      const raw = await store.get(`${listId}/latest.json`, { type: "json" }) as {
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
    // Skip first-run init: if before was empty, every entity would appear "added".
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
    `Lists changed: ${changes.map((c) => c.listId).join(", ")}`,
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: lines.join("\n"),
          event: "sanctions_designation_change",
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
    console.warn(
      `[${LABEL}] designation-change webhook failed:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export default async (_req: Request): Promise<Response> => {
  const alertWebhook = process.env["ALERT_WEBHOOK_URL"];

  // Snapshot entity sets BEFORE ingestion.
  const listStore = getStore("hawkeye-lists");
  const beforeSnap = await snapshotLists(listStore);

  let result: Awaited<ReturnType<typeof runIngestionAll>>;
  try {
    result = await runIngestionAll(LABEL);
  } catch (err) {
    return new Response(
      JSON.stringify({
        cadence: "15min",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  // Snapshot AFTER and diff — fire immediate alert on any change.
  const afterSnap = await snapshotLists(listStore);
  const changes = diffSnapshots(beforeSnap, afterSnap);
  await alertDesignationChanges(changes, alertWebhook);

  const totalAdded = changes.reduce((s, c) => s + c.added.length, 0);
  const totalRemoved = changes.reduce((s, c) => s + c.removed.length, 0);

  // Write heartbeat so health-monitor can detect if this function stops running.
  // Only written on successful ingestion runs.
  if (result.ok) {
    try {
      const hbStore = getStore("hawkeye-function-heartbeats");
      await hbStore.setJSON(LABEL, { lastSuccess: new Date().toISOString(), label: LABEL });
    } catch (err) {
      console.warn(`[${LABEL}] heartbeat write failed (non-critical):`, err instanceof Error ? err.message : String(err));
    }
  }

  return new Response(
    JSON.stringify({
      cadence: "15min",
      ...result,
      designationChanges: { totalAdded, totalRemoved, listsAffected: changes.length },
    }),
    { status: result.ok ? 200 : 502, headers: { "content-type": "application/json" } },
  );
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
