/**
 * Compliance Evidence Chain — Hash-linked tamper-evident audit trail.
 *
 * Every compliance action gets a hash-chained entry linking it to
 * the previous action. Any tampering breaks the chain and is
 * immediately detectable.
 *
 * Like blockchain for compliance evidence — but simple, local, and
 * zero-dependency.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');
const CHAIN_FILE = resolve(PROJECT_ROOT, '.screening', 'evidence-chain.ndjson');

/**
 * Append an evidence entry to the chain.
 *
 * @param {object} entry
 * @param {string} entry.action   - What happened (e.g., 'screening', 'filing', 'freeze')
 * @param {string} entry.actor    - Who did it (system, MLRO, etc.)
 * @param {string} entry.subject  - Entity/transaction affected
 * @param {string} entry.detail   - Description
 * @param {object} [entry.data]   - Additional structured data
 * @returns {{ hash, index, timestamp }}
 */
export async function appendEvidence(entry) {
  const dir = resolve(PROJECT_ROOT, '.screening');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const previousHash = await getLastHash();
  const timestamp = new Date().toISOString();
  const index = await getChainLength();

  const record = {
    index,
    timestamp,
    action: entry.action,
    actor: entry.actor || 'system',
    subject: entry.subject || '',
    detail: entry.detail || '',
    data: entry.data || null,
    previousHash,
  };

  // Calculate hash of this record (excluding the hash field itself)
  const payload = JSON.stringify(record);
  const hash = createHash('sha256').update(payload).digest('hex');
  record.hash = hash;

  // Append to chain file
  await appendFile(CHAIN_FILE, JSON.stringify(record) + '\n', 'utf8');

  return { hash, index, timestamp };
}

/**
 * Verify the entire evidence chain for tampering.
 *
 * @returns {{ valid, entries, brokenAt, message }}
 */
export async function verifyChain() {
  if (!existsSync(CHAIN_FILE)) {
    return { valid: true, entries: 0, message: 'No chain file (empty chain)' };
  }

  const content = await readFile(CHAIN_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);

  if (lines.length === 0) {
    return { valid: true, entries: 0, message: 'Empty chain' };
  }

  let previousHash = null;

  for (let i = 0; i < lines.length; i++) {
    let record;
    try {
      record = JSON.parse(lines[i]);
    } catch {
      return { valid: false, entries: i, brokenAt: i, message: `Malformed JSON at entry ${i}` };
    }

    // Verify previous hash link
    if (record.previousHash !== previousHash) {
      return {
        valid: false, entries: i, brokenAt: i,
        message: `Chain broken at entry ${i}: expected previousHash "${previousHash}", got "${record.previousHash}"`,
      };
    }

    // Verify this record's hash
    const storedHash = record.hash;
    delete record.hash;
    const payload = JSON.stringify(record);
    const expectedHash = createHash('sha256').update(payload).digest('hex');
    record.hash = storedHash;

    if (storedHash !== expectedHash) {
      return {
        valid: false, entries: i, brokenAt: i,
        message: `Hash mismatch at entry ${i}: record has been tampered with`,
      };
    }

    previousHash = storedHash;
  }

  return { valid: true, entries: lines.length, message: `Chain intact: ${lines.length} entries verified` };
}

/**
 * Get chain statistics.
 */
export async function chainStats() {
  if (!existsSync(CHAIN_FILE)) return { entries: 0, actions: {} };

  const content = await readFile(CHAIN_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  const actions = {};

  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      actions[record.action] = (actions[record.action] || 0) + 1;
    } catch { /* skip */ }
  }

  return { entries: lines.length, actions };
}

async function getLastHash() {
  if (!existsSync(CHAIN_FILE)) return null;
  const content = await readFile(CHAIN_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1]).hash;
  } catch { return null; }
}

async function getChainLength() {
  if (!existsSync(CHAIN_FILE)) return 0;
  const content = await readFile(CHAIN_FILE, 'utf8');
  return content.trim().split('\n').filter(Boolean).length;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === 'verify') {
    verifyChain().then(r => {
      console.log(r.valid ? `\x1b[32m${r.message}\x1b[0m` : `\x1b[31m${r.message}\x1b[0m`);
      process.exit(r.valid ? 0 : 1);
    });
  } else if (cmd === 'stats') {
    chainStats().then(r => console.log(JSON.stringify(r, null, 2)));
  } else {
    console.log('Usage: node evidence-chain.mjs [verify|stats]');
  }
}
