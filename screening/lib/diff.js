/**
 * Source-list diff utilities.
 *
 * When a sanctions source is refreshed we want to know exactly what
 * changed so we can:
 *   1. Log additions/removals/updates in the audit chain.
 *   2. Re-screen every active customer against the additions.
 *   3. Alert the MLRO about removals (potential de-listings).
 */

import { createHash } from 'node:crypto';

function entityFingerprint(ent) {
  // Stable fingerprint of the fields that matter for screening. Changes
  // to source-specific raw payload do not bump the fingerprint.
  const canonical = JSON.stringify({
    schema: ent.schema || null,
    names: [...(ent.names || [])].sort(),
    dob: ent.dob || null,
    countries: [...(ent.countries || [])].sort(),
    identifiers: [...(ent.identifiers || [])].sort(),
    programs: [...(ent.programs || [])].sort(),
    topics: [...(ent.topics || [])].sort(),
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Compute the diff between a previous snapshot (Map<id, fingerprint>) and
 * a fresh set of entities. Returns { added, removed, updated, unchanged }
 * each as arrays of entity IDs.
 */
export function diffSnapshots(prevFingerprints, freshEntities) {
  const added = [];
  const updated = [];
  const unchanged = [];
  const freshIds = new Set();
  const newFingerprints = new Map();

  for (const ent of freshEntities) {
    freshIds.add(ent.id);
    const fp = entityFingerprint(ent);
    newFingerprints.set(ent.id, fp);
    const prev = prevFingerprints.get(ent.id);
    if (!prev) added.push(ent.id);
    else if (prev !== fp) updated.push(ent.id);
    else unchanged.push(ent.id);
  }

  const removed = [];
  for (const id of prevFingerprints.keys()) {
    if (!freshIds.has(id)) removed.push(id);
  }

  return { added, removed, updated, unchanged, newFingerprints };
}

/**
 * Build a fingerprint map from the current entity store, scoped to a
 * particular source. Used before a refresh to capture the baseline.
 */
export function snapshotSource(store, source) {
  const fps = new Map();
  for (const [id, ent] of store.entities) {
    if (ent.source === source) fps.set(id, entityFingerprint(ent));
  }
  return fps;
}

export { entityFingerprint };
