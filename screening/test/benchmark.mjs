#!/usr/bin/env node
/**
 * Screening Engine Performance Benchmarks
 *
 * Measures throughput and latency of the core screening algorithms
 * under realistic load conditions. Reports results in a format
 * suitable for the quarterly programme effectiveness review.
 *
 * Usage:
 *   cd screening && node test/benchmark.mjs
 */

import { normalize } from "../lib/normalize.js";
import { levenshtein, jaroWinkler, tokenSetRatio } from "../lib/fuzzy.js";
import { soundex, doubleMetaphone } from "../lib/phonetic.js";
import { compositeScore } from "../lib/score.js";

function time(label, fn, iterations = 10000) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const perOp = (elapsed / iterations * 1000).toFixed(2);
  console.log(`  ${label}: ${elapsed.toFixed(1)}ms total, ${perOp}µs/op (${iterations} iterations)`);
  return elapsed;
}

console.log("=== SCREENING ENGINE PERFORMANCE BENCHMARKS ===\n");
console.log(`Date: ${new Date().toISOString()}`);
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log(`Node: ${process.version}\n`);

// Test data: realistic counterparty names
const names = [
  "Al Rashid Metal Recyclers LLC",
  "Goldmark Trading FZE",
  "Precious Refining AG Zurich",
  "Emirates Scrap Metals LLC Dubai",
  "Meridian Bullion DMCC",
  "Silk Road Commodities Pte Ltd Singapore",
  "Al Noor Gold Recycling Ajman",
  "Atlas Gold FZE Ras Al Khaimah",
  "Gulf Commodities FZE JAFZA",
  "Palm Trading Group LLC Dubai",
];

const normalized = names.map(normalize);

console.log("--- Normalization ---");
time("normalize (10 names)", () => names.forEach(normalize));

console.log("\n--- Fuzzy Matching ---");
time("levenshtein (pair)", () => levenshtein(normalized[0], normalized[1]));
time("jaroWinkler (pair)", () => jaroWinkler(normalized[0], normalized[1]));
time("tokenSetRatio (pair)", () => tokenSetRatio(normalized[0], normalized[1]));

console.log("\n--- Phonetic Encoding ---");
time("soundex", () => soundex("Al Rashid"));
time("doubleMetaphone", () => doubleMetaphone("Al Rashid"));

console.log("\n--- Composite Scoring ---");
const query = { names: [normalized[0]], dob: null, countries: ["AE"], schema: "entity" };
const candidate = { names: [normalized[1]], dob: null, countries: ["AE"], schema: "entity" };
time("compositeScore (full)", () => compositeScore(query, candidate));

console.log("\n--- Batch Screening Simulation ---");
// Simulate screening 100 counterparties against 1000 list entries
const listSize = 1000;
const batchSize = 100;
const fakeList = Array.from({ length: listSize }, (_, i) => ({
  names: [normalize(`Entity ${i} Trading LLC`)],
  dob: null,
  countries: ["AE"],
  schema: "entity",
}));
const fakeQueries = Array.from({ length: batchSize }, (_, i) => ({
  names: [normalize(names[i % names.length])],
  dob: null,
  countries: ["AE"],
  schema: "entity",
}));

const batchStart = performance.now();
let totalComparisons = 0;
for (const q of fakeQueries) {
  for (const c of fakeList) {
    compositeScore(q, c);
    totalComparisons++;
  }
}
const batchElapsed = performance.now() - batchStart;
console.log(`  ${batchSize} queries x ${listSize} entries = ${totalComparisons.toLocaleString()} comparisons`);
console.log(`  Total: ${batchElapsed.toFixed(0)}ms`);
console.log(`  Per comparison: ${(batchElapsed / totalComparisons * 1000).toFixed(2)}µs`);
console.log(`  Throughput: ${(totalComparisons / batchElapsed * 1000).toFixed(0)} comparisons/sec`);

console.log("\n=== BENCHMARK COMPLETE ===\n");
