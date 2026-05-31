#!/usr/bin/env node
// Hawkeye Sterling — CI prompt-hash integrity validator.
//
// Reads every SYSTEM_PROMPT constant in web/app/api/**/*.ts, computes its
// SHA-256 hash, and compares it against scripts/prompt-hash-manifest.json.
// Exits non-zero if any hash has changed without a corresponding manifest
// update — ensuring FDL 10/2025 Art.18 (prompt traceability) is maintained.
//
// Usage:
//   node scripts/validate-prompt-hashes.mjs              # validate
//   node scripts/validate-prompt-hashes.mjs --update     # regenerate manifest
//
// Run in CI after build: any prompt text change without a manifest update
// fails the build and requires the developer to either:
//   (a) update the manifest (intentional prompt edit) or
//   (b) revert the edit (accidental prompt change)

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const MANIFEST_PATH = join(__dir, 'prompt-hash-manifest.json');
const API_DIR = join(ROOT, 'web', 'app', 'api');
const UPDATE_MODE = process.argv.includes('--update');

// Extract the text content of SYSTEM_PROMPT or SYSTEM_PROMPT_TEMPLATE constants.
// Handles both backtick template literals and string concatenation up to 8KB.
function extractSystemPrompts(fileContent, filePath) {
  const results = [];

  // Match: const SYSTEM_PROMPT[_TEMPLATE]? = `...` (backtick literal)
  const backtickRe = /const SYSTEM_PROMPT(?:_TEMPLATE|_BASE)?\s*=\s*`([\s\S]*?)`(?:\s*;|\s*\n)/g;
  let m;
  while ((m = backtickRe.exec(fileContent)) !== null) {
    const text = m[1];
    if (text.length > 50) {  // skip trivial/empty prompts
      results.push({ text, match: m[0].slice(0, 80).replace(/\n/g, ' ') });
    }
  }

  // Match: const SYSTEM_PROMPT = [...] (array of objects, e.g. subject-brief)
  // For array-form prompts, hash the full array source text
  const arrayRe = /const SYSTEM_PROMPT\s*=\s*\[([\s\S]*?)\];/g;
  while ((m = arrayRe.exec(fileContent)) !== null) {
    const text = m[1];
    if (text.length > 50) {
      results.push({ text, match: m[0].slice(0, 80).replace(/\n/g, ' ') });
    }
  }

  return results;
}

function sha256slice(text) {
  // 32 hex chars = 128 bits — sufficient to make accidental collision negligible
  // while remaining human-readable in diff output. Upgrading from the original
  // 16-char (64-bit) truncation which approaches birthday-paradox collision risk
  // at tens of thousands of distinct prompts.
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32);
}

function walkDir(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(full);
    }
  }
  return files;
}

// Build the current hash map by scanning all route files
function buildCurrentHashes() {
  const hashes = {};
  const files = walkDir(API_DIR);

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    if (!content.includes('SYSTEM_PROMPT')) continue;

    const prompts = extractSystemPrompts(content, filePath);
    if (prompts.length === 0) continue;

    const relPath = filePath.replace(ROOT + '/', '');
    for (let i = 0; i < prompts.length; i++) {
      const key = prompts.length === 1 ? relPath : `${relPath}[${i}]`;
      hashes[key] = {
        hash: sha256slice(prompts[i].text),
        preview: prompts[i].match.trim(),
        chars: prompts[i].text.length,
      };
    }
  }

  // Also check src/policy/ for system charter
  const charterPaths = [
    join(ROOT, 'src', 'policy', 'systemPrompt.ts'),
    join(ROOT, 'src', 'brain', 'systemPrompt.ts'),
  ];
  for (const charterPath of charterPaths) {
    if (!existsSync(charterPath)) continue;
    const content = readFileSync(charterPath, 'utf8');
    const prompts = extractSystemPrompts(content, charterPath);
    for (let i = 0; i < prompts.length; i++) {
      const relPath = charterPath.replace(ROOT + '/', '');
      const key = prompts.length === 1 ? relPath : `${relPath}[${i}]`;
      hashes[key] = {
        hash: sha256slice(prompts[i].text),
        preview: prompts[i].match.trim(),
        chars: prompts[i].text.length,
      };
    }
  }

  return hashes;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Hawkeye Sterling — Prompt Hash Integrity Validator');
  console.log(`  Mode: ${UPDATE_MODE ? 'UPDATE manifest' : 'VALIDATE'}`);
  console.log('══════════════════════════════════════════════════════\n');

  const current = buildCurrentHashes();
  const promptCount = Object.keys(current).length;
  console.log(`Scanned ${promptCount} SYSTEM_PROMPT constant(s)\n`);

  if (UPDATE_MODE) {
    const manifest = {
      generatedAt: new Date().toISOString(),
      note: 'Auto-generated by scripts/validate-prompt-hashes.mjs --update. Commit alongside any intentional prompt text change.',
      prompts: current,
    };
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`✅ Manifest written to ${MANIFEST_PATH}`);
    console.log(`   ${promptCount} prompt(s) registered\n`);
    process.exit(0);
  }

  if (!existsSync(MANIFEST_PATH)) {
    console.error('❌ No manifest found. Run: node scripts/validate-prompt-hashes.mjs --update');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const recorded = manifest.prompts ?? {};

  const violations = [];
  const added = [];
  const removed = [];

  // Check for changed hashes
  for (const [key, entry] of Object.entries(current)) {
    if (!recorded[key]) {
      added.push(key);
    } else if (recorded[key].hash !== entry.hash) {
      violations.push({ key, recorded: recorded[key].hash, current: entry.hash, preview: entry.preview });
    }
  }

  // Check for removed prompts
  for (const key of Object.keys(recorded)) {
    if (!current[key]) removed.push(key);
  }

  if (added.length > 0) {
    console.log(`⚠️  New prompts not in manifest (run --update to register):`);
    added.forEach(k => console.log(`     + ${k}`));
    console.log('');
  }
  if (removed.length > 0) {
    console.log(`⚠️  Prompts removed since last manifest update:`);
    removed.forEach(k => console.log(`     - ${k}`));
    console.log('');
  }

  if (violations.length > 0) {
    console.error(`❌ PROMPT HASH MISMATCH — ${violations.length} violation(s):`);
    for (const v of violations) {
      console.error(`\n   File:     ${v.key}`);
      console.error(`   Recorded: ${v.recorded}`);
      console.error(`   Current:  ${v.current}`);
      console.error(`   Preview:  ${v.preview}`);
    }
    console.error('\n   A prompt text changed without a manifest update.');
    console.error('   If intentional: run --update, bump the version in PROMPT_REGISTRY, and commit both.');
    console.error('   If accidental: revert the prompt text change.');
    console.error('\n   FDL 10/2025 Art.18 requires prompt traceability for every AI compliance decision.\n');
    process.exit(1);
  }

  const allPresent = added.length === 0 && removed.length === 0 && violations.length === 0;
  if (allPresent) {
    console.log(`✅ All ${promptCount} prompt hashes match manifest\n`);
  } else {
    // New or removed prompts are warnings, not failures — prompt may have been added in this PR
    console.log(`⚠️  ${violations.length} violations, ${added.length} new, ${removed.length} removed`);
    console.log('   Run --update to sync the manifest.\n');
    // Exit 0 for new/removed (informational); violations already exit 1 above
  }
}

// NOTE (L-15): The top-level `main().catch()` pattern is safe here because this
// file is always executed directly via `node scripts/validate-prompt-hashes.mjs`
// or an npm script — it is not imported as a module. If it is ever imported,
// the unhandled rejection will surface at the import site. Do not add a
// synchronous `throw` at module scope; keep the async boundary here.
main().catch(err => {
  console.error('[validate-prompt-hashes] Fatal:', err);
  process.exit(1);
});
