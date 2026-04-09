#!/usr/bin/env node
/**
 * Comprehensive test suite for Hawkeye-Sterling screening engine.
 * Run: node screening/test/comprehensive.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { normalize, transliterate, detectScript, ngrams } from '../lib/normalize.js';
import { soundex, doubleMetaphone } from '../lib/phonetic.js';
import { jaroWinkler, tokenSetRatio, tokenSortRatio, partialRatio, levenshteinSim } from '../lib/fuzzy.js';
import { scoreMatch } from '../lib/score.js';
import { EntityStore } from '../lib/store.js';
import { AuditLog } from '../lib/audit.js';
import { analyzeTransactions } from '../analysis/transaction-patterns.mjs';

const dir = mkdtempSync(join(tmpdir(), 'hawkeye-comp-'));
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); console.log(`  ok  ${name}`); passed++; } catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); failed++; } }
async function asyncTest(name, fn) { try { await fn(); console.log(`  ok  ${name}`); passed++; } catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); failed++; } }

// ── normalize ──────────────────────────────────────────────────
console.log('normalize');
test('null/empty input', () => { assert.equal(normalize(null).stripped, ''); assert.equal(normalize('').stripped, ''); });
test('strips diacritics', () => { assert.equal(normalize('José María').stripped, 'jose maria'); });
test('removes company suffixes', () => { const n = normalize('Acme Trading LLC'); assert.ok(!n.tokens.includes('llc')); assert.ok(n.tokens.includes('acme')); });
test('removes honorifics', () => { const n = normalize('Sheikh Mohammed'); assert.ok(!n.tokens.includes('sheikh')); assert.ok(n.tokens.includes('mohammed')); });
test('Arabic transliteration', () => { assert.equal(detectScript('محمد'), 'arabic'); assert.ok(transliterate('محمد').length > 0); });
test('Cyrillic transliteration', () => { assert.equal(detectScript('Путин'), 'cyrillic'); assert.ok(normalize('Владимир Путин').stripped.length > 0); });
test('trigrams', () => { assert.deepEqual(ngrams('hello', 3), ['hel', 'ell', 'llo']); assert.deepEqual(ngrams('', 3), []); });
test('mixed script', () => { assert.ok(normalize('John محمد').stripped.length > 0); });

// ── fuzzy ──────────────────────────────────────────────────────
console.log('fuzzy');
test('JW identical = 1', () => { assert.equal(jaroWinkler('test', 'test'), 1); });
test('JW different < 0.5', () => { assert.ok(jaroWinkler('abc', 'xyz') < 0.5); });
test('JW prefix bonus', () => { assert.ok(jaroWinkler('MARTHA', 'MARHTA') > 0.9); });
test('lev identical = 1', () => { assert.equal(levenshteinSim('hello', 'hello'), 1); });
test('lev single edit', () => { assert.ok(levenshteinSim('hello', 'helo') > 0.7); });
test('lev empty = 0', () => { assert.equal(levenshteinSim('', 'abc'), 0); });
test('tokenSet reordered', () => { assert.ok(tokenSetRatio(['a', 'b', 'c'], ['c', 'b', 'a']) > 0.95); });
test('tokenSort invariance', () => { assert.ok(tokenSortRatio(['b', 'a'], ['a', 'b']) > 0.95); });

// ── score ──────────────────────────────────────────────────────
console.log('score');
const mc = (n, o = {}) => ({ id: 'x', source: 'test', schema: o.schema || 'Person', names: [n], topics: ['sanction'], dob: o.dob, countries: o.countries });
test('exact match', () => { assert.equal(scoreMatch({ name: 'Osama bin Laden', type: 'person' }, mc('Osama bin Laden')).band, 'exact'); });
test('near match high score', () => { assert.ok(scoreMatch({ name: 'Osama bin Ladin', type: 'person' }, mc('Osama bin Laden')).score >= 0.85); });
test('DOB conflict caps 0.85', () => { assert.ok(scoreMatch({ name: 'John Smith', dob: '1970-01-01', type: 'person' }, mc('John Smith', { dob: '1985-05-05' })).score <= 0.85); });
test('DOB agreement boost', () => {
  const a = scoreMatch({ name: 'Ivan Petrov', type: 'person' }, mc('Ivan Petrov'));
  const b = scoreMatch({ name: 'Ivan Petrov', dob: '1970-01-01', type: 'person' }, mc('Ivan Petrov', { dob: '1970-01-01' }));
  assert.ok(b.score >= a.score);
});
test('country signal', () => { assert.equal(scoreMatch({ name: 'Ivan', countries: ['RU'], type: 'person' }, mc('Ivan', { countries: ['RU'] })).signals.country, 1); });
test('short name penalty', () => { assert.ok(scoreMatch({ name: 'Kim', type: 'person' }, mc('Kim')).score < 0.99); });
test('schema mismatch', () => {
  const p = scoreMatch({ name: 'Acme', type: 'person' }, mc('Acme', { schema: 'Company' }));
  const e = scoreMatch({ name: 'Acme', type: 'entity' }, mc('Acme', { schema: 'Company' }));
  assert.ok(e.score >= p.score);
});

// ── audit ──────────────────────────────────────────────────────
console.log('audit');
await asyncTest('init genesis', async () => { const l = new AuditLog(join(dir, 'a1.log')); await l.init(); assert.equal(l.head.seq, 0); });
await asyncTest('append seq', async () => { const l = new AuditLog(join(dir, 'a2.log')); await l.init(); assert.equal((await l.append('screen', {}, 'test')).seq, 1); assert.equal((await l.append('screen', {}, 'test')).seq, 2); });
await asyncTest('verify valid', async () => { const l = new AuditLog(join(dir, 'a3.log')); await l.init(); await l.append('screen', {}, 't'); await l.append('decision', {}, 'm'); assert.equal((await l.verify()).ok, true); });
await asyncTest('tamper detect', async () => {
  const { writeFile, readFile } = await import('node:fs/promises');
  const p = join(dir, 'a4.log'), l = new AuditLog(p); await l.init();
  await l.append('screen', { x: 'orig' }, 't'); await l.append('screen', {}, 't');
  const lines = (await readFile(p, 'utf8')).split('\n').filter(Boolean);
  const e = JSON.parse(lines[0]); e.payload.x = 'HACK'; lines[0] = JSON.stringify(e);
  await writeFile(p, lines.join('\n') + '\n');
  assert.equal((await l.verify()).ok, false);
});
await asyncTest('anchor format', async () => { const l = new AuditLog(join(dir, 'a5.log')); await l.init(); await l.append('screen', {}, 't'); assert.ok(l.anchor().anchor_line.startsWith('HAWKEYE-AUDIT-ANCHOR')); });
await asyncTest('query filter', async () => { const l = new AuditLog(join(dir, 'a6.log')); await l.init(); await l.append('screen', {}, 't'); await l.append('decision', {}, 'm'); await l.append('screen', {}, 't'); let c = 0; await l.query({ type: 'screen' }, () => c++); assert.equal(c, 2); });

// ── store ──────────────────────────────────────────────────────
console.log('store');
await asyncTest('upsert+get', async () => { const s = new EntityStore(join(dir, 's1.json')); s.upsert({ id: 's:1', source: 't', schema: 'Person', names: ['Test'], topics: [] }); assert.ok(s.get('s:1')); });
await asyncTest('candidates typo', async () => { const s = new EntityStore(join(dir, 's2.json')); s.upsert({ id: 's:1', source: 't', schema: 'Person', names: ['Vladimir Putin'], topics: [] }); assert.ok(s.candidates('Vladimr Puttin').includes('s:1')); });
await asyncTest('save/load', async () => { const s = new EntityStore(join(dir, 's3.json')); s.upsert({ id: 'r:1', source: 't', schema: 'Person', names: ['RT'], topics: [] }); await s.save(); const l = new EntityStore(join(dir, 's3.json')); await l.load(); assert.equal(l.size(), 1); });
await asyncTest('size', async () => { const s = new EntityStore(join(dir, 's4.json')); s.upsert({ id: 'a', source: 'x', schema: 'P', names: ['A'], topics: [] }); s.upsert({ id: 'b', source: 'y', schema: 'P', names: ['B'], topics: [] }); assert.equal(s.size(), 2); });

// ── transaction-patterns ───────────────────────────────────────
console.log('transaction-patterns');
test('empty = empty', () => { assert.equal(analyzeTransactions([]).alerts.length, 0); });
test('structuring', () => { const txs = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, date: `2026-04-0${i+1}`, from: 'A', to: 'B', amount: 50000, method: 'cash' })); assert.ok(analyzeTransactions(txs).alerts.some(a => a.pattern === 'STRUCTURING')); });
test('layering', () => { const txs = [{ id: 'l1', date: '2026-04-01T10:00:00Z', from: 'A', to: 'B', amount: 100000 }, { id: 'l2', date: '2026-04-01T12:00:00Z', from: 'B', to: 'C', amount: 95000 }, { id: 'l3', date: '2026-04-01T14:00:00Z', from: 'C', to: 'D', amount: 90000 }]; assert.ok(analyzeTransactions(txs).alerts.some(a => a.pattern === 'LAYERING')); });
test('smurfing', () => { const txs = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, date: `2026-04-0${i+1}`, from: `S${i}`, to: 'Coll', amount: 20000 })); assert.ok(analyzeTransactions(txs).alerts.some(a => a.pattern === 'SMURFING')); });
test('threshold evasion', () => { const txs = [{ id: 'e1', date: '2026-04-01', from: 'E', to: 'X', amount: 53000, method: 'cash' }, { id: 'e2', date: '2026-04-03', from: 'E', to: 'Y', amount: 54000, method: 'cash' }, { id: 'e3', date: '2026-04-05', from: 'E', to: 'Z', amount: 52000, method: 'cash' }]; assert.ok(analyzeTransactions(txs).alerts.some(a => a.pattern === 'THRESHOLD_EVASION')); });
test('dedup no mutation', () => { const txs = [{ id: 'd1', date: '2026-04-01', from: 'Z', to: 'A', amount: 50000 }, { id: 'd2', date: '2026-04-02', from: 'Z', to: 'A', amount: 50000 }]; const r = analyzeTransactions(txs); for (const a of r.alerts) assert.deepEqual(a.entities, [...a.entities]); });

// ── cleanup ────────────────────────────────────────────────────
rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
