// Hawkeye Sterling — OutcomeFeedbackJournal persistence to Netlify Blobs.
//
// Closes the calibration loop's last gap: the in-process singleton from
// feedback-journal-instance.ts is wiped on every Lambda cold start. This
// module wraps the singleton with two best-effort persistence helpers:
//
//   · snapshotJournalToBlobs() — fire-and-forget; called after every
//     recordCaseDisposition() append by the route handler. Writes the
//     full journal as JSON to a fixed key.
//   · hydrateJournalFromBlobs() — called once per Lambda warm-up (the
//     module-level `_hydrated` flag prevents repeats). Reads the JSON,
//     replays records into the singleton via hydrateJournal().
//
// Both helpers swallow errors and log them — the journal stays usable
// in-memory even if Blobs is unavailable (e.g. local dev without
// NETLIFY_BLOBS_TOKEN). Persistence is opportunistic, not authoritative.
//
// Charter P9 compliance: every record persisted is the same OutcomeRecord
// the brain produces; no transformation or scoring happens here.

import { getStore } from '@netlify/blobs';
import { getJournal, hydrateJournal } from './feedback-journal-instance.js';
import type { OutcomeRecord } from './outcome-feedback.js';

const STORE_NAME = 'hawkeye-feedback-journal';
const SNAPSHOT_KEY = 'all-records.json';

let _hydrated = false;

/** Best-effort: persist the current journal state to Netlify Blobs.
 *  Safe to call after every append; the write is small (one JSON doc). */
export async function snapshotJournalToBlobs(): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  try {
    const store = getStore(STORE_NAME);
    const records = [...getJournal().list()];
    const json = JSON.stringify(records);
    await store.set(SNAPSHOT_KEY, json);
    return { ok: true, bytes: json.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[feedback-journal-blobs] snapshot failed:', msg);
    return { ok: false, error: msg };
  }
}

/** Best-effort: load the journal snapshot from Blobs and replay it into
 *  the in-process singleton. Idempotent — subsequent calls are no-ops via
 *  the module-level `_hydrated` flag (Lambda instances stay warm for
 *  hundreds of requests; we only pay the cold-start cost once). */
export async function hydrateJournalFromBlobs(): Promise<{ ok: boolean; appended?: number; error?: string }> {
  if (_hydrated) return { ok: true, appended: 0 };
  try {
    const store = getStore(STORE_NAME);
    const raw = await store.get(SNAPSHOT_KEY, { type: 'text' });
    if (raw === null || raw === undefined || raw === '') {
      _hydrated = true;
      return { ok: true, appended: 0 };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      _hydrated = true;
      return { ok: false, error: 'snapshot is not an array' };
    }
    const records = parsed as OutcomeRecord[];
    const appended = hydrateJournal(records);
    _hydrated = true;
    return { ok: true, appended };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[feedback-journal-blobs] hydrate failed:', msg);
    return { ok: false, error: msg };
  }
}

/** TEST UTILITY: clear the hydrate-once flag so a fresh call to
 *  hydrateJournalFromBlobs() actually runs. Production code MUST NOT
 *  call this — it costs an extra Blobs read per Lambda invocation. */
export function _resetHydrationGuardForTest(): void {
  _hydrated = false;
}
