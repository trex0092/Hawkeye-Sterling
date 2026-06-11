#!/usr/bin/env node
// Hawkeye Sterling — AI-powered security review gate.
//
// Inspired by anthropics/claude-code-security-review: uses Claude to check
// a PR diff against Hawkeye's 10 architecture invariants. Called from
// .github/workflows/ai-security-review.yml on PRs touching critical files.
//
// Usage:
//   git diff origin/main...HEAD | node scripts/ai-security-review.mjs
//   node scripts/ai-security-review.mjs  (reads stdin, or uses git diff)
//
// Exit codes:
//   0 — no violations found (or script not applicable)
//   1 — violation found (CI fails)
//   2 — script error (non-blocking in CI to avoid false positives on infra errors)

import { createReadStream } from "node:fs";
import { execSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";

const INVARIANTS = `
Hawkeye Sterling Architecture Invariants — check the diff for violations:

1. FAIL-CLOSED AUTH: Every new or modified route handler (export async function GET/POST/PUT/DELETE/PATCH in web/app/api/) must call enforce(req). No route may pass requireAuth: false unless it explicitly handles anonymous traffic for a sandbox/demo purpose. Anonymous callers on compliance routes must be rejected.

2. AUDIT CHAIN APPEND-ONLY: writeAuditChainEntry() must be called for every AI decision, screening result, SAR filing, four-eyes action, and egress check. No code path may bypass it. Calls must be fire-and-forget (void ... .catch(() => undefined)).

3. DUAL-SECRET JWT: The JWT_SIGNING_SECRET_PREV code path in jwt.ts must remain intact. Never collapse to single-secret verification.

4. EGRESS GATE FAIL-CLOSED: In egress-check.ts and any file that calls it: missing API key, LLM failure, or parse failure must return held_review — never 'allowed'. No return { allowed: true } or return { verdict: 'allowed' } inside a catch block.

5. HALLUCINATION GATE FIRE-AND-FORGET: The hallucination gate must never block the response path. Any await on it must be wrapped: void hallucinationGate(...).catch(() => undefined).

6. OTel NO-OP TRACER: Never import from '@opentelemetry/sdk-node' or similar directly. Always use web/lib/server/tracer.ts which wraps with a no-op fallback.

7. PROMETHEUS METRICS ONCE PER FAMILY: # HELP and # TYPE must be emitted exactly once per metric family (guaranteed by the emittedFamilies set in metrics/route.ts). Never break this deduplication.

8. PROMPT HASHES IN MANIFEST: Every new SYSTEM_PROMPT constant must be added to scripts/prompt-hash-manifest.json. Do not introduce SYSTEM_PROMPT constants without a corresponding manifest entry.

9. MODEL REGISTRY COMPLETENESS: All entries in MODEL_REGISTRY in ai-governance.ts must have riskTier, approval, and cardRef populated. Never add a registry entry with undefined/null fields.

10. RAW IP NEVER LOGGED: req.headers.get('cf-connecting-ip'), x-real-ip, and x-forwarded-for values must never appear directly in console.log/warn/error or be stored in audit entries. Always HMAC-hash with anonIpKey() first.

11. NEVER TRUST FIRST X-FORWARDED-FOR: When splitting x-forwarded-for by comma, always use the LAST element (proxy-appended), never [0] (client-supplied, forgeable).

12. JWT DECODE ONLY IN jwt.ts: jwt.verify() and jwt.decode() must only be called from web/lib/server/jwt.ts. Other files must import verifyJwt/signJwt from there.
`.trim();

async function getDiff() {
  // Try stdin first (piped usage)
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const diff = Buffer.concat(chunks).toString("utf8").trim();
    if (diff.length > 0) return diff;
  }
  // Fall back to git diff
  try {
    return execSync("git diff origin/main...HEAD", { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  } catch {
    return execSync("git diff HEAD~1...HEAD", { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  }
}

async function main() {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.warn("[ai-security-review] ANTHROPIC_API_KEY not set — skipping review");
    process.exit(0);
  }

  let diff;
  try {
    diff = await getDiff();
  } catch (err) {
    console.error("[ai-security-review] Failed to get diff:", err.message);
    process.exit(2);
  }

  if (!diff || diff.trim().length < 10) {
    console.log("[ai-security-review] No diff to review — skipping");
    process.exit(0);
  }

  // Only review diffs touching security-critical files
  const CRITICAL_PATHS = [
    "web/lib/server/",
    "web/app/api/",
    "src/brain/",
    "src/integrations/",
    "scripts/",
  ];
  const hasCriticalChange = CRITICAL_PATHS.some((p) => diff.includes(`+++ b/${p}`));
  if (!hasCriticalChange) {
    console.log("[ai-security-review] No changes to critical paths — skipping");
    process.exit(0);
  }

  const client = new Anthropic({ apiKey });

  const truncatedDiff = diff.length > 80_000 ? diff.slice(0, 80_000) + "\n... (diff truncated)" : diff;

  // The model sometimes wraps its verdict in a ```json fence and appends a
  // prose rationale after it; the verdict is still inside. Pull the first
  // fenced JSON block, else the outermost brace span, before parsing.
  function extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
    if (fenced) return fenced[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) return text.slice(start, end + 1).trim();
    return text.trim();
  }

  let response;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You are a security reviewer for Hawkeye Sterling, a production AML/CFT compliance platform.
Your task is to review a git diff for violations of the platform's architecture invariants.
Be precise and conservative — only flag clear violations, not hypothetical ones.
You see ONLY the diff hunks, not the full files: never flag the ABSENCE of code
(e.g. a missing enforce(req) call or audit-chain write) unless the diff itself
shows the relevant region — code outside the hunks may already satisfy the
invariant. Only flag violations introduced by lines visible in the diff.
Respond with raw JSON only — no markdown fences, no prose before or after.`,
      messages: [
        {
          role: "user",
          content: `Review this diff for violations of the following invariants:\n\n${INVARIANTS}\n\nDiff:\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n\nRespond with JSON: { "violations": [{ "invariant": number, "file": string, "line": string, "description": string }], "clean": boolean }`,
        },
      ],
    });
  } catch (err) {
    console.error("[ai-security-review] Claude API error:", err.message);
    process.exit(2);
  }

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  let result;
  try {
    result = JSON.parse(extractJson(raw));
  } catch {
    console.error("[ai-security-review] Could not parse Claude response as JSON:", raw.slice(0, 500));
    process.exit(2);
  }

  if (!Array.isArray(result.violations)) {
    console.error("[ai-security-review] Unexpected response shape:", raw.slice(0, 500));
    process.exit(2);
  }

  if (result.violations.length === 0) {
    console.log("[ai-security-review] ✓ No invariant violations found");
    process.exit(0);
  }

  console.error("\n[ai-security-review] ✗ INVARIANT VIOLATIONS FOUND:\n");
  for (const v of result.violations) {
    console.error(`  Invariant #${v.invariant} — ${v.file}:${v.line}`);
    console.error(`  ${v.description}\n`);
  }
  console.error(`${result.violations.length} violation(s) detected. Fix before merging.\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error("[ai-security-review] Fatal:", err.message);
  process.exit(2);
});
