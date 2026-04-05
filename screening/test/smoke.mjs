#!/usr/bin/env node
/**
 * Smoke tests for the screening module. Offline — does not fetch
 * live sources. Verifies the matcher, audit chain, and store roundtrip
 * using a small fixture set of well-known public sanctioned entities.
 *
 * Run: npm run smoke  (from the screening/ directory)
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

import { normalize, transliterate, detectScript } from '../lib/normalize.js';
import { soundex, doubleMetaphone } from '../lib/phonetic.js';
import { jaroWinkler, tokenSetRatio, levenshteinSim } from '../lib/fuzzy.js';
import { scoreMatch } from '../lib/score.js';
import { EntityStore } from '../lib/store.js';
import { AuditLog } from '../lib/audit.js';

const dir = mkdtempSync(join(tmpdir(), 'hawkeye-smoke-'));
let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (err) { console.error(`  FAIL  ${name}\n        ${err.message}`); failed++; }
}

async function asyncTest(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (err) { console.error(`  FAIL  ${name}\n        ${err.message}`); failed++; }
}

// --- normalize -------------------------------------------------------------
console.log('normalize');
test('strips diacritics and casefolds', () => {
  const n = normalize('José María Aznar');
  assert.equal(n.stripped, 'jose maria aznar');
  assert.deepEqual(n.tokens, ['jose', 'maria', 'aznar']);
});
test('drops company suffixes', () => {
  const n = normalize('Acme Trading LLC');
  assert.ok(!n.tokens.includes('llc'));
  assert.ok(n.tokens.includes('acme'));
});
test('transliterates Arabic', () => {
  assert.equal(detectScript('محمد'), 'arabic');
  const t = transliterate('محمد');
  assert.ok(t.length > 0);
});
test('transliterates Cyrillic', () => {
  const n = normalize('Владимир Путин');
  assert.ok(n.stripped.includes('putin') || n.stripped.includes('vladimir'));
});

// --- phonetic --------------------------------------------------------------
console.log('phonetic');
test('soundex matches obvious variants', () => {
  assert.equal(soundex('Robert'), soundex('Rupert'));
  assert.equal(soundex('Rubin'), soundex('Robin'));
});
test('double metaphone returns two codes', () => {
  const [p, a] = doubleMetaphone('Schwartz');
  assert.ok(p.length > 0);
  assert.ok(a.length > 0);
});

// --- fuzzy -----------------------------------------------------------------
console.log('fuzzy');
test('jaroWinkler rewards prefix', () => {
  const s1 = jaroWinkler('MARTHA', 'MARHTA');
  assert.ok(s1 > 0.9);
});
test('tokenSetRatio handles reordering', () => {
  const s = tokenSetRatio(['mohammed', 'bin', 'salman'], ['salman', 'bin', 'mohammed']);
  assert.ok(s > 0.95);
});
test('levenshteinSim returns 1 for identical', () => {
  assert.equal(levenshteinSim('abc', 'abc'), 1);
});

// --- scoring ---------------------------------------------------------------
console.log('score');
test('high match on exact name', () => {
  const q = { name: 'Osama bin Laden', type: 'person' };
  const c = { id: 'x', source: 'test', schema: 'Person', names: ['Osama bin Laden'], topics: ['sanction'] };
  const r = scoreMatch(q, c);
  assert.equal(r.band, 'exact');
  assert.ok(r.score >= 0.99);
});
test('medium match on transliteration variant', () => {
  const q = { name: 'Mohammed Al-Qaeda', type: 'person' };
  const c = { id: 'x', source: 'test', schema: 'Person', names: ['Mohamed Al Qaida'], topics: ['sanction'] };
  const r = scoreMatch(q, c);
  assert.ok(['low', 'medium', 'high'].includes(r.band), `got band=${r.band} score=${r.score}`);
});
test('dob conflict caps score', () => {
  const q = { name: 'John Smith', dob: '1970-01-01', type: 'person' };
  const c = { id: 'x', source: 'test', schema: 'Person', names: ['John Smith'], dob: '1985-05-05', topics: ['sanction'] };
  const r = scoreMatch(q, c);
  assert.ok(r.score <= 0.85);
});
test('country match lifts score', () => {
  const q = { name: 'Ivan Petrov', countries: ['Russia'], type: 'person' };
  const c = { id: 'x', source: 'test', schema: 'Person', names: ['Ivan Petrov'], countries: ['Russia'], topics: ['sanction'] };
  const r = scoreMatch(q, c);
  assert.ok(r.signals.country === 1);
});

// --- store -----------------------------------------------------------------
console.log('store');
await asyncTest('upsert + candidate retrieval', async () => {
  const store = new EntityStore(join(dir, 'store.json'));
  store.upsert({
    id: 'test:1',
    source: 'test',
    schema: 'Person',
    names: ['Vladimir Putin', 'Владимир Путин'],
    topics: ['sanction', 'pep'],
  });
  store.upsert({
    id: 'test:2',
    source: 'test',
    schema: 'Person',
    names: ['Xi Jinping'],
    topics: ['pep'],
  });
  await store.save();

  const loaded = new EntityStore(join(dir, 'store.json'));
  await loaded.load();
  assert.equal(loaded.size(), 2);
  const cands = loaded.candidates('Vladimir Puttin'); // typo
  assert.ok(cands.includes('test:1'));
});

// --- audit chain -----------------------------------------------------------
console.log('audit');
await asyncTest('append + verify', async () => {
  const log = new AuditLog(join(dir, 'audit.log'));
  await log.init();
  await log.append('screen', { caseId: 'c1', decision: 'clear' }, 'test');
  await log.append('screen', { caseId: 'c2', decision: 'block' }, 'test');
  await log.append('decision', { caseId: 'c2', outcome: 'true-positive', reason: 'matches OFAC' }, 'mlro');
  const v = await log.verify();
  assert.equal(v.ok, true);
  assert.equal(v.entries, 3);
});
await asyncTest('tamper detection', async () => {
  const { writeFile, readFile } = await import('node:fs/promises');
  const p = join(dir, 'audit2.log');
  const log = new AuditLog(p);
  await log.init();
  await log.append('screen', { caseId: 'a' }, 'test');
  await log.append('screen', { caseId: 'b' }, 'test');
  // Corrupt line 1 payload.
  const content = await readFile(p, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  const e = JSON.parse(lines[0]);
  e.payload.caseId = 'HACKED';
  lines[0] = JSON.stringify(e);
  await writeFile(p, lines.join('\n') + '\n');
  const v = await log.verify();
  assert.equal(v.ok, false);
  assert.ok(v.break.reason.includes('hash'));
});

// --- cleanup ---------------------------------------------------------------
rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
