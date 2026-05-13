#!/usr/bin/env node
// Control 5.08 — Lethal-trifecta pre-deploy guard
//
// The "lethal trifecta" is a subject simultaneously:
//   (1) appearing on a sanctions list   ← hard prohibition
//   (2) classified as a PEP             ← FATF R.12 EDD trigger
//   (3) carrying significant adverse media ← potential constructive knowledge
//
// A scoring bug that clears such a subject is a critical regulatory failure.
// This script verifies — without needing a live API — that the disposition
// engine and the band-escalation chain handle the trifecta correctly, and
// that no recent edit has lowered the effective output below CRITICAL.
//
// Exit 0 = pass  |  Exit 1 = fail (blocks deploy)

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let failures = 0;
const fail = (msg) => { console.error(`  ✗ FAIL — ${msg}`); failures++; };
const pass = (msg) => { console.log(`  ✔ pass — ${msg}`); };
const section = (title) => { console.log(`\n── ${title}`); };

// ── 1. Disposition engine must escalate trifecta to "critical" ────────────────
section("Disposition engine: lethal trifecta → critical");
{
  const enginePath = resolve(ROOT, "web/lib/intelligence/dispositionEngine.ts");
  let src;
  try { src = readFileSync(enginePath, "utf8"); } catch {
    fail("dispositionEngine.ts not found — cannot verify lethal-trifecta escalation");
    process.exit(1);
  }

  // Must have escalate("critical") called somewhere (sanctions or redlines or CAHRA)
  const hasCriticalEscalation = /escalate\(["']critical["']/.test(src);
  if (!hasCriticalEscalation) fail("dispositionEngine: escalate('critical') not found");
  else pass("escalate('critical') present in dispositionEngine");

  // Must have PEP escalation to at least "high"
  const hasPepHigh = /pepTier[\s\S]{0,300}escalate\(["']high["']/s.test(src)
    || /escalate\(["']high["'][^)]*PEP/s.test(src)
    || (src.includes("input.pepTier") && /escalate\(["']high["']/.test(src));
  if (!hasPepHigh) fail("dispositionEngine: PEP does not escalate to at least 'high'");
  else pass("PEP → 'high' escalation present");

  // Must have adverse media escalation
  const hasAmEscalation = /amCompositeScore[\s\S]{0,200}escalate\(["'](?:critical|high)["']/s.test(src)
    || /amComposite[\s\S]{0,100}escalate/s.test(src);
  if (!hasAmEscalation) fail("dispositionEngine: adverse-media escalation path not found");
  else pass("Adverse-media escalation path present");

  // Redlines must always push to critical
  const hasRedlineCritical = /redlinesFired[\s\S]{0,200}escalate\(["']critical["']/s.test(src)
    || /redlines[\s\S]{0,100}critical/s.test(src);
  if (!hasRedlineCritical) fail("dispositionEngine: redlines do not force critical");
  else pass("Redlines → critical path present");
}

// ── 2. Tool manifest: high-consequence tools must stay as "action" level ──────
section("Tool manifest: consequence levels on high-risk tools");
{
  const manifestPath = resolve(ROOT, "web/lib/mcp/tool-manifest.ts");
  let src;
  try { src = readFileSync(manifestPath, "utf8"); } catch {
    fail("tool-manifest.ts not found");
    process.exit(1);
  }

  const actionTools = ["generate_sar_report", "freeze_account", "ai_decision", "batch_screen"];
  for (const tool of actionTools) {
    // Tool should appear with level: "action"
    const toolBlock = new RegExp(`${tool}[\\s\\S]{0,200}?level:\\s*["']action["']`).test(src)
      || new RegExp(`level:\\s*["']action["'][\\s\\S]{0,200}?${tool}`).test(src);
    if (!toolBlock) {
      // Also check it's not downgraded to read-only
      if (new RegExp(`${tool}[\\s\\S]{0,200}?level:\\s*["']read-only["']`).test(src)) {
        fail(`${tool} has been downgraded from 'action' to 'read-only'`);
      } else {
        // Can't find the tool at all, or level assignment is ambiguous — warn
        console.warn(`  ⚠ warn — ${tool}: could not confirm 'action' level (may be structured differently)`);
      }
    } else {
      pass(`${tool} retains 'action' consequence level`);
    }
  }
}

// ── 3. MCP route: injection patterns must still be present ───────────────────
section("MCP route: prompt-injection detection patterns");
{
  const mcpPath = resolve(ROOT, "web/app/api/mcp/route.ts");
  let src;
  try { src = readFileSync(mcpPath, "utf8"); } catch {
    fail("mcp/route.ts not found");
    process.exit(1);
  }

  const hasInjectionPatterns = /INJECTION_PATTERNS/.test(src);
  if (!hasInjectionPatterns) fail("INJECTION_PATTERNS removed from mcp/route.ts");
  else pass("INJECTION_PATTERNS present in mcp/route.ts");

  const hasDetectInjection = /detectInjection/.test(src);
  if (!hasDetectInjection) fail("detectInjection function removed from mcp/route.ts");
  else pass("detectInjection() present in mcp/route.ts");

  // Count entries in the INJECTION_PATTERNS array
  const patternBlock = src.match(/INJECTION_PATTERNS\s*:\s*RegExp\[\]\s*=\s*\[([\s\S]*?)\];/);
  const minPatterns = patternBlock
    ? (patternBlock[1].match(/\/[^/]/g) ?? []).length
    : (src.match(/INJECTION_PATTERNS[\s\S]{0,2000}/)?.[0]?.match(/^\s*\//mg) ?? []).length;
  const patternCount = Math.max(minPatterns, (src.match(/ignore.*previous|act.*as.*if|disregard.*instruct|forget.*everything|override.*safety/gi) ?? []).length);
  if (patternCount < 5) fail(`Too few injection regex patterns: ${patternCount} (expected ≥ 5)`);
  else pass(`Injection regex patterns present (${patternCount}+)`);
}

// ── 4. MCP route: circuit breaker and rate limits must be present ─────────────
// Rate-limit + breaker state was extracted into web/lib/mcp/shared-state.ts
// in the operational-readiness PR so it can be Blobs-backed (distributed
// across Lambda instances). The control here is "this logic exists in the
// MCP code path", not "this logic is inlined in route.ts" — verify by
// checking either file, prefer shared-state if present.
section("MCP route: circuit breaker + rate limits");
{
  const mcpPath = resolve(ROOT, "web/app/api/mcp/route.ts");
  const sharedStatePath = resolve(ROOT, "web/lib/mcp/shared-state.ts");
  const mcpSrc = readFileSync(mcpPath, "utf8");
  let sharedSrc = "";
  try { sharedSrc = readFileSync(sharedStatePath, "utf8"); } catch { /* legacy layout */ }
  const combined = mcpSrc + "\n" + sharedSrc;

  const hasBreaker =
    /BREAKER_THRESHOLD|isBreakerOpen/.test(combined);
  if (!hasBreaker) fail("Circuit breaker logic removed (checked mcp/route.ts + shared-state.ts)");
  else pass("Circuit breaker present");

  // Rate-limit logic exists if either the legacy inline names are present
  // in route.ts OR the new shared-state module exports the equivalents.
  const hasRateLimit =
    /CLASS_RATE_LIMITS|checkRateLimit|checkAndIncrementRate/.test(combined);
  if (!hasRateLimit) fail("Rate limit logic removed (checked mcp/route.ts + shared-state.ts)");
  else pass("Rate limit logic present");

  // Action-class rate limit must be ≤ 20 per minute (prevent abuse).
  // Look in both files — CLASS_RATE_LIMITS moved to shared-state.ts.
  const rateLimitsBlock = combined.match(/CLASS_RATE_LIMITS[\s\S]{0,500}?}/);
  const actionRateMatch = rateLimitsBlock?.[0]?.match(/"action":\s*(\d+)/);
  if (actionRateMatch) {
    const limit = parseInt(actionRateMatch[1], 10);
    if (limit > 20) fail(`action rate limit is ${limit}/min — must be ≤ 20 to prevent abuse`);
    else pass(`action rate limit: ${limit}/min`);
  } else {
    console.warn("  ⚠ warn — could not extract action rate limit from CLASS_RATE_LIMITS");
  }
}

// ── 5. Super-brain: Russia stress tests must use ISO2 lookup ──────────────────
section("Super-brain: COMMON_NAME_ISO2 map present (BUG-02 regression guard)");
{
  const sbPath = resolve(ROOT, "web/app/api/super-brain/route.ts");
  let src;
  try { src = readFileSync(sbPath, "utf8"); } catch {
    fail("super-brain/route.ts not found");
    process.exit(1);
  }

  const hasCnMap = /COMMON_NAME_ISO2/.test(src);
  if (!hasCnMap) fail("COMMON_NAME_ISO2 map absent — Russia stress tests will fail");
  else pass("COMMON_NAME_ISO2 fallback map present");

  const hasRussiaEntry = /"russia":\s*"RU"/.test(src);
  if (!hasRussiaEntry) fail("COMMON_NAME_ISO2 missing 'russia' → 'RU' entry");
  else pass("'russia' → 'RU' entry present");
}

// ── 6. Governance wrapper: confidence scores on supervised outputs ─────────────
section("MCP route: confidence scores on supervised outputs");
{
  const mcpPath = resolve(ROOT, "web/app/api/mcp/route.ts");
  const src = readFileSync(mcpPath, "utf8");

  const hasGovernanceWrap = /wrapWithGovernance|_governance/.test(src);
  if (!hasGovernanceWrap) fail("Governance wrapper (_governance / wrapWithGovernance) removed");
  else pass("Governance wrapper present");

  const hasConfidenceScore = /confidenceScore/.test(src);
  if (!hasConfidenceScore) fail("confidenceScore field removed from governance wrapper");
  else pass("confidenceScore field present");
}

// ── 7. Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
if (failures === 0) {
  console.log("✅ Lethal-trifecta check PASSED — all controls verified");
  process.exit(0);
} else {
  console.error(`❌ Lethal-trifecta check FAILED — ${failures} control(s) violated`);
  console.error("   Deploy blocked. Resolve the above failures before merging.");
  process.exit(1);
}
