/**
 * Base utilities shared by all source adapters.
 *
 * A source adapter is any module that exports an async `ingest(ctx)`
 * function where `ctx` provides:
 *   {
 *     source:   { id, url, ... }  // the entry from config.SOURCES
 *     store:    EntityStore       // to upsert / remove entities
 *     audit:    AuditLog          // to record refresh events
 *     cacheDir: string            // HTTP cache directory
 *     maxAgeMs: number            // cache TTL
 *     logger:   function          // diagnostic logger
 *   }
 *
 * It must return:
 *   { added, removed, updated, total, version }
 *
 * The orchestrator (ingest/refresh.js) calls adapters in priority order,
 * computes the diff, logs it, and persists the store.
 */

import { fetchCached, contentHash } from '../lib/http.js';
import { snapshotSource, diffSnapshots } from '../lib/diff.js';

/**
 * Helper: run a standard ingest lifecycle.
 *
 *   1. Fetch the bulk payload (cached / conditional).
 *   2. Snapshot the current store state for this source.
 *   3. Call the adapter-specific `parse(body)` → canonical entities.
 *   4. Replace-in-place: remove-then-upsert every parsed entity.
 *   5. Diff against the snapshot and return the summary.
 *
 * Each adapter just writes `parse(body) → Entity[]` and calls this helper.
 */
export async function runBulkIngest(ctx, parse) {
  const { source, store, audit, cacheDir, maxAgeMs, logger } = ctx;
  logger?.(`[${source.id}] fetching ${source.url}`);
  const { body, fromCache, meta } = await fetchCached(source.url, {
    cacheDir,
    maxAgeMs,
  });
  const version = contentHash(body);
  logger?.(`[${source.id}] ${fromCache ? 'cache' : 'fresh'} size=${body.length} hash=${version.slice(0, 12)}`);

  await audit.append('refresh.start', {
    source: source.id,
    url: source.url,
    bytes: body.length,
    content_hash: version,
    from_cache: fromCache,
    http_meta: {
      etag: meta.etag,
      last_modified: meta.last_modified,
      fetched_at: meta.fetched_at,
    },
  });

  const prevFingerprints = snapshotSource(store, source.id);
  const entities = await parse(body, source);
  logger?.(`[${source.id}] parsed ${entities.length} entities`);

  // Replace-in-place. We remove the entire source first so stale IDs
  // (entities de-listed by the publisher) are dropped, then re-insert.
  store.removeSource(source.id);
  for (const ent of entities) store.upsert(ent);

  const diff = diffSnapshots(prevFingerprints, entities);
  store.setSourceMeta(source.id, {
    version,
    total: entities.length,
    added: diff.added.length,
    removed: diff.removed.length,
    updated: diff.updated.length,
  });

  await audit.append('refresh.diff', {
    source: source.id,
    version,
    total: entities.length,
    added: diff.added.length,
    removed: diff.removed.length,
    updated: diff.updated.length,
    // Sample of first 20 of each for reviewer context.
    sample_added: diff.added.slice(0, 20),
    sample_removed: diff.removed.slice(0, 20),
  });

  return { total: entities.length, ...diff, version };
}

/**
 * Minimal CSV parser for source payloads. Handles quoted fields,
 * embedded commas, embedded newlines inside quotes, and CRLF line
 * endings. Sufficient for OFAC / OFSI / OpenSanctions CSV dumps; avoids
 * pulling in a dependency.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Turn a parsed CSV into an array of header-keyed objects.
 */
export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === '') continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = r[j] ?? '';
    out.push(obj);
  }
  return out;
}

/**
 * Very small XML parser tuned for flat sanctions list shapes (UN, EU).
 * It handles nested elements, attributes, and repeated children. It is
 * not a full XML parser — namespaces are preserved as part of tag names
 * but not validated; CDATA is collapsed to text; DTDs are ignored.
 */
export function parseXml(text) {
  // Strip XML declaration, comments, processing instructions.
  text = text.replace(/<\?[^?]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  // Expand CDATA as-is.
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner) => inner.replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch])));

  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<\/?([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[4] !== undefined) {
      const t = m[4];
      stack[stack.length - 1].text += t;
      continue;
    }
    const tag = m[1];
    const attrsRaw = m[2] || '';
    const selfClose = m[3] === '/';
    const isClose = m[0].startsWith('</');
    if (isClose) {
      const node = stack.pop();
      node.text = node.text.trim();
      continue;
    }
    const attrs = {};
    const aRe = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = aRe.exec(attrsRaw)) !== null) attrs[a[1]] = decodeEntities(a[2]);
    const node = { tag, attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Walk an XML tree yielding nodes whose tag (local part, no namespace)
 * equals `name`. Iterative, no recursion limit.
 */
export function* findAll(node, name) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    const local = n.tag.includes(':') ? n.tag.split(':').pop() : n.tag;
    if (local === name) yield n;
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
}

/**
 * Return the text content of the first child matching `name`, or ''.
 */
export function childText(node, name) {
  for (const c of node.children) {
    const local = c.tag.includes(':') ? c.tag.split(':').pop() : c.tag;
    if (local === name) return (c.text || '').trim();
  }
  return '';
}

/**
 * Return every child matching `name`.
 */
export function childrenOf(node, name) {
  const out = [];
  for (const c of node.children) {
    const local = c.tag.includes(':') ? c.tag.split(':').pop() : c.tag;
    if (local === name) out.push(c);
  }
  return out;
}
