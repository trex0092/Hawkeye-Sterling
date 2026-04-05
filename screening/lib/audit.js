/**
 * Hash-chained append-only audit log.
 *
 * Every entry hashes the previous entry's hash together with the new
 * payload, so tampering with any prior entry breaks the chain. This is
 * the minimum auditors want to see for screening decisions, refresh
 * events, and overrides under FATF Rec. 11 and most national AML laws.
 *
 * Format: one JSON object per line (NDJSON) for O(1) append + easy tail:
 *   {"seq":1,"ts":"2026-04-05T10:00:00.000Z","type":"screen","actor":"mlro","payload":{...},"prev":"GENESIS","hash":"abcd..."}
 *
 * A daily "anchor" can be produced by hashing the current head into a Git
 * commit message, so the chain is tamper-evident against the repo history.
 *
 * The log is intentionally separate from the entity store — the store is
 * mutable (lists refresh), but decisions and overrides must be immutable.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, mkdir, stat, appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';

const GENESIS = 'GENESIS';

function hashEntry(prev, seq, ts, type, actor, payload) {
  const canonical = JSON.stringify({ seq, ts, type, actor, payload, prev });
  return createHash('sha256').update(canonical).digest('hex');
}

export class AuditLog {
  constructor(path) {
    this.path = path;
    this.head = null;  // { seq, hash, ts } of last entry
  }

  /**
   * Initialise by scanning the log file (or creating it) and caching the
   * head pointer. Called once per process.
   */
  async init() {
    await mkdir(dirname(this.path), { recursive: true });
    if (!existsSync(this.path)) {
      this.head = { seq: 0, hash: GENESIS, ts: null };
      return this;
    }
    // Read last line to get head. For small logs this is trivial; for
    // large logs we read the last 8 KiB and parse the final newline-
    // delimited JSON object — avoids loading the whole file.
    const st = await stat(this.path);
    if (st.size === 0) {
      this.head = { seq: 0, hash: GENESIS, ts: null };
      return this;
    }
    const tailSize = Math.min(8192, st.size);
    const fh = await open(this.path, 'r');
    const buf = Buffer.alloc(tailSize);
    await fh.read(buf, 0, tailSize, st.size - tailSize);
    await fh.close();
    const tail = buf.toString('utf8');
    const lines = tail.split('\n').filter(Boolean);
    const lastLine = lines[lines.length - 1];
    const last = JSON.parse(lastLine);
    this.head = { seq: last.seq, hash: last.hash, ts: last.ts };
    return this;
  }

  /**
   * Append an entry. Returns the new entry with hash + seq filled in.
   * Types used by this module:
   *   "screen"         — a screening request + result
   *   "decision"       — analyst accepts/rejects/escalates a hit
   *   "refresh.start"  — list refresh started
   *   "refresh.diff"   — list refresh completed with additions/removals
   *   "override"       — manual override (whitelist, false-positive)
   *   "export"         — regulator export snapshot taken
   */
  async append(type, payload, actor = 'system') {
    if (!this.head) await this.init();
    const seq = (this.head.seq || 0) + 1;
    const ts = new Date().toISOString();
    const prev = this.head.hash || GENESIS;
    const hash = hashEntry(prev, seq, ts, type, actor, payload);
    const entry = { seq, ts, type, actor, payload, prev, hash };
    await appendFile(this.path, JSON.stringify(entry) + '\n');
    this.head = { seq, hash, ts };
    return entry;
  }

  /**
   * Verify the chain from genesis to head. Returns { ok, entries, break }.
   * `break` is populated with { seq, reason } on the first tampered entry.
   */
  async verify() {
    if (!existsSync(this.path)) return { ok: true, entries: 0, break: null };
    const rl = createInterface({ input: createReadStream(this.path), crlfDelay: Infinity });
    let prev = GENESIS;
    let expectedSeq = 1;
    let count = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); }
      catch { return { ok: false, entries: count, break: { seq: expectedSeq, reason: 'invalid-json' } }; }
      if (entry.seq !== expectedSeq) {
        return { ok: false, entries: count, break: { seq: entry.seq, reason: 'seq-out-of-order' } };
      }
      if (entry.prev !== prev) {
        return { ok: false, entries: count, break: { seq: entry.seq, reason: 'prev-mismatch' } };
      }
      const recomputed = hashEntry(entry.prev, entry.seq, entry.ts, entry.type, entry.actor, entry.payload);
      if (recomputed !== entry.hash) {
        return { ok: false, entries: count, break: { seq: entry.seq, reason: 'hash-mismatch' } };
      }
      prev = entry.hash;
      expectedSeq++;
      count++;
    }
    return { ok: true, entries: count, break: null };
  }

  /**
   * Stream through entries matching a filter, calling visitor for each.
   * Filter: { type?, actor?, fromSeq?, toSeq?, since?, until? }.
   */
  async query(filter = {}, visitor) {
    if (!existsSync(this.path)) return 0;
    const rl = createInterface({ input: createReadStream(this.path), crlfDelay: Infinity });
    let n = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (filter.type && e.type !== filter.type) continue;
      if (filter.actor && e.actor !== filter.actor) continue;
      if (filter.fromSeq && e.seq < filter.fromSeq) continue;
      if (filter.toSeq && e.seq > filter.toSeq) continue;
      if (filter.since && e.ts < filter.since) continue;
      if (filter.until && e.ts > filter.until) continue;
      await visitor(e);
      n++;
    }
    return n;
  }

  /**
   * Produce a daily anchor — the head hash + seq + ts — for embedding in
   * a Git commit message so the chain is anchored to the repository's
   * own immutable history.
   */
  anchor() {
    if (!this.head) throw new Error('AuditLog.anchor: call init() first');
    return {
      seq: this.head.seq,
      hash: this.head.hash,
      ts: this.head.ts,
      anchor_line: `HAWKEYE-AUDIT-ANCHOR seq=${this.head.seq} hash=${this.head.hash}`,
    };
  }
}
