/**
 * Session compressor — distills verbose observations into concise summaries.
 *
 * When a session accumulates more than COMPRESS_THRESHOLD observations,
 * this module generates a summary and stores it in the summaries table
 * at the appropriate tier (L1 for recent, L2 for older).
 *
 * Compression uses a simple extractive approach (no external API call)
 * to keep the system self-contained. High-importance observations are
 * preserved verbatim; lower-importance ones are collapsed by category.
 */

import * as db from '../db/sqlite.mjs';
import { CATEGORIES } from '../config.mjs';

/**
 * Compress a session's observations into a summary.
 *
 * @param {string} sessionId
 * @returns {string} The generated summary text.
 */
export async function compressSession(sessionId) {
  const observations = db.getObservations(sessionId);
  if (observations.length === 0) return 'Empty session.';

  const session = db.getSession(sessionId);

  // Group observations by category
  const grouped = {};
  for (const obs of observations) {
    if (!grouped[obs.category]) grouped[obs.category] = [];
    grouped[obs.category].push(obs);
  }

  const lines = [];
  const date = session?.started_at?.split('T')[0] || 'unknown';
  lines.push(`Session ${sessionId.slice(0, 8)} (${date}): ${observations.length} observations`);

  // Preserve high-importance observations verbatim
  const critical = observations.filter(o => o.importance >= 8);
  if (critical.length > 0) {
    lines.push('');
    lines.push('Critical:');
    for (const c of critical) {
      const entity = c.entity_name ? ` [${c.entity_name}]` : '';
      lines.push(`- (${c.category}${entity}) ${c.content.replace(/\n/g, ' ').slice(0, 200)}`);
    }
  }

  // Summarise each category
  for (const cat of CATEGORIES) {
    const items = grouped[cat];
    if (!items || items.length === 0) continue;
    if (cat === 'workflow_note' && items.every(i => i.importance < 5)) continue;

    const highItems = items.filter(i => i.importance >= 5);
    if (highItems.length === 0) {
      lines.push(`- ${cat}: ${items.length} observations (all low priority)`);
      continue;
    }

    lines.push('');
    lines.push(`${cat} (${items.length}):`);
    // Keep top 3 by importance
    const top = highItems
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3);
    for (const t of top) {
      const entity = t.entity_name ? ` [${t.entity_name}]` : '';
      lines.push(`  - ${entity}${t.content.replace(/\n/g, ' ').slice(0, 150)}`);
    }
    if (highItems.length > 3) {
      lines.push(`  - ... and ${highItems.length - 3} more`);
    }
  }

  const summary = lines.join('\n');

  // Store as L1 summary (will age into L2 as newer sessions arrive)
  db.addSummary({
    sessionId,
    tier: 'L1',
    content: summary,
    tokens: Math.ceil(summary.length / 4),
  });

  // Mark session as compressed
  const dbInstance = db.getDb();
  dbInstance.prepare('UPDATE sessions SET compressed = 1, token_count = ? WHERE id = ?')
    .run(Math.ceil(summary.length / 4), sessionId);

  return summary;
}

/**
 * Promote old L1 summaries to L2 (archive tier).
 * Call periodically to keep L1 focused on recent sessions.
 *
 * @param {number} [keepRecent=5] - Number of L1 summaries to keep.
 */
export function promoteToArchive(keepRecent = 5) {
  const dbInstance = db.getDb();
  const l1 = db.getSummariesByTier('L1', 100);

  if (l1.length <= keepRecent) return;

  const toPromote = l1.slice(keepRecent);
  const stmt = dbInstance.prepare('UPDATE summaries SET tier = ? WHERE id = ?');
  const tx = dbInstance.transaction(() => {
    for (const s of toPromote) {
      stmt.run('L2', s.id);
    }
  });
  tx();

  return toPromote.length;
}
