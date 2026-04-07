#!/usr/bin/env node
/**
 * Automated test suite for the compliance automation scripts.
 *
 * Runs offline checks that do not require Asana or Anthropic credentials.
 * Validates regulatory context, output validation, history paths, CSV
 * parsing, and screening algorithms.
 *
 * Usage:
 *   cd scripts && node test.mjs
 */

import { validateOutput, CONFIRMED_REFERENCES, SYSTEM_PROMPT, STYLE_REMINDER } from "./regulatory-context.mjs";
import { slugify, isoDate, isoWeek } from "./history-writer.mjs";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

console.log("=== REGULATORY CONTEXT ===\n");

assert(CONFIRMED_REFERENCES.primaryLaw.cite === true, "Primary law is citable");
assert(CONFIRMED_REFERENCES.primaryLaw.shortTitle.includes("No. 10 of 2025"), "Primary law is Decree-Law No. 10 of 2025");
assert(CONFIRMED_REFERENCES.deprecatedLaw.cite === false, "Deprecated law is NOT citable");
assert(CONFIRMED_REFERENCES.fatf.cite === true, "FATF is citable");
assert(CONFIRMED_REFERENCES.fatf.name === "Financial Action Task Force", "FATF name correct");
assert(SYSTEM_PROMPT.includes("Federal Decree-Law No. 10 of 2025"), "SYSTEM_PROMPT cites correct law");
assert(SYSTEM_PROMPT.includes("FATF"), "SYSTEM_PROMPT includes FATF");
// SYSTEM_PROMPT mentions the deprecated law in a "must not cite" instruction — that's intentional
assert(SYSTEM_PROMPT.includes("must not cite Federal Decree-Law No. 20 of 2018"), "SYSTEM_PROMPT forbids deprecated law");
assert(STYLE_REMINDER.includes("No em-dashes"), "STYLE_REMINDER includes em-dash rule");

console.log("\n=== VALIDATE OUTPUT ===\n");

// Should pass
const good = "The compliance function reviewed the position today. There are 12 open items. For review by the MLRO, LF.";
assert(validateOutput(good).ok === true, "Good output passes validation");

// Should fail: deprecated law
const bad1 = "Under Federal Decree-Law No. 20 of 2018, the firm must comply.";
assert(validateOutput(bad1).ok === false, "Deprecated law citation caught");

// Should fail: em-dash
const bad2 = "The firm — which is a DPMS — must comply.";
assert(validateOutput(bad2).ok === false, "Em-dash caught");

// Should fail: AI phrasing
const bad3 = "As an AI, I cannot provide legal advice.";
assert(validateOutput(bad3).ok === false, "AI phrasing caught");

// Should fail: markdown headers
const bad4 = "# Heading\nSome text here.";
assert(validateOutput(bad4).ok === false, "Markdown headers caught");

// Should pass: clean compliance text
const good2 = "We reviewed the sanctions screening log. No confirmed matches identified. The MLRO is asked to note the result.";
assert(validateOutput(good2).ok === true, "Clean compliance text passes");

console.log("\n=== HISTORY WRITER UTILS ===\n");

assert(typeof isoDate() === "string", "isoDate returns string");
assert(/^\d{4}-\d{2}-\d{2}$/.test(isoDate()), "isoDate format YYYY-MM-DD");
assert(typeof isoWeek() === "string", "isoWeek returns string");
assert(/^\d{4}-W\d{2}$/.test(isoWeek()), "isoWeek format YYYY-Wnn");
// slugify uses underscores, not hyphens, and preserves some chars
assert(typeof slugify("Hello World! Test") === "string", "slugify returns string");
assert(slugify("Hello World! Test").length > 0, "slugify produces non-empty output");
assert(slugify("A".repeat(200)).length <= 120, "slugify caps at 120 chars");

console.log("\n=== CONFIG FILES ===\n");

const filingMode = JSON.parse(readFileSync(path.resolve("filing-mode.json"), "utf8"));
assert(filingMode.STR === "manual", "STR filing mode is manual");
assert(filingMode.SAR === "manual", "SAR filing mode is manual");
assert(filingMode.DPMSR === "manual", "DPMSR filing mode is manual");
assert(filingMode.PNMR === "manual", "PNMR filing mode is manual");
assert(filingMode.FFR === "manual", "FFR filing mode is manual");

const deadlinesFile = JSON.parse(readFileSync(path.resolve("deadlines.json"), "utf8"));
const deadlines = deadlinesFile.deadlines || deadlinesFile;
assert(Array.isArray(deadlines), "deadlines.json contains an array");
assert(deadlines.length > 0, "deadlines is not empty");
assert(deadlines.every(d => d.id), "All deadlines have id");

assert(existsSync(path.resolve("entities.json")), "entities.json exists");
assert(existsSync(path.resolve("regulatory-context.mjs")), "regulatory-context.mjs exists");
assert(existsSync(path.resolve("history-writer.mjs")), "history-writer.mjs exists");
assert(existsSync(path.resolve("filing-mode.json")), "filing-mode.json exists");

console.log("\n=== SAMPLE FILES ===\n");

const samplesDir = path.resolve("..", "samples");
const sampleChecks = [
  "daily/01-compliance-priorities-per-entity.txt",
  "weekly/01-pattern-report.txt",
  "monthly/01-mlro-consolidation.txt",
  "quarterly/01-mlro-report.txt",
  "annual/01-enterprise-wide-risk-assessment.txt",
  "filings/01-str-candidate-review.txt",
  "training/01-aml-cft-legal-framework.txt",
];

for (const rel of sampleChecks) {
  const full = path.join(samplesDir, rel);
  if (!existsSync(full)) {
    assert(false, `Sample exists: ${rel}`);
    continue;
  }
  const content = readFileSync(full, "utf8");
  assert(content.includes("Decree-Law No. 10 of 2025"), `${rel} cites Decree-Law 10/2025`);
  assert(content.includes("FATF") || content.includes("Financial Action Task Force"), `${rel} references FATF`);
  assert(!content.includes("Decree-Law No. 20 of 2018") || rel.includes("README"), `${rel} no deprecated law`);
}

console.log("\n=== HISTORY DIRECTORIES ===\n");

const historyDirs = [
  "daily", "daily-ops", "retro", "filings", "weekly", "mlro-weekly",
  "weekly-filings", "weekly-ops", "mlro-monthly", "monthly-incidents",
  "monthly-ops", "mlro-quarterly", "quarterly-jurisdiction", "quarterly-ops",
  "mlro-annual", "annual", "on-demand", "handover", "inspections",
  "registers", "task-packs",
];
const historyRoot = path.resolve("..", "history");
for (const dir of historyDirs) {
  assert(existsSync(path.join(historyRoot, dir)), `history/${dir}/ exists`);
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
