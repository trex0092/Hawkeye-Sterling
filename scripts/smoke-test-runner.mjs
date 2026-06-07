#!/usr/bin/env node
// Hawkeye Sterling — comprehensive smoke test runner.
//
// Orchestrates every test layer in dependency order: static governance checks,
// TypeScript compile, brain audit, lint, unit tests, integration tests, latency
// smoke, and optional live-API / live-server checks.
//
// Usage:
//   node scripts/smoke-test-runner.mjs [--verbose]
//
// Optional env vars:
//   ANTHROPIC_API_KEY   enables Phase 8 compliance-agent smoke
//   SMOKE_BASE_URL      enables Phase 9 MCP-tools smoke (default http://localhost:3000)
//   SMOKE_API_KEY       API key forwarded to smoke-mcp-tools
//
// Exit codes:
//   0  all required layers passed (skipped optionals are not failures)
//   1  one or more required layers failed

import { spawnSync }           from "child_process";
import { existsSync }          from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath }       from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
const VERBOSE   = process.argv.includes("--verbose");

// ── Pre-flight probes ────────────────────────────────────────────────────────

const HAS_API_KEY        = !!process.env.ANTHROPIC_API_KEY;
const HAS_NODE_MODULES   = existsSync(join(ROOT, "node_modules/.bin/vitest"));
const HAS_WEB_MODULES    = existsSync(join(ROOT, "web/node_modules/next"));
const HAS_DIST           = existsSync(join(ROOT, "dist/src/brain/index.js"));

async function probeServer(url, timeoutMs = 2000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

const SMOKE_BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const HAS_SERVER     = await probeServer(SMOKE_BASE_URL);

// ── Result tracking ──────────────────────────────────────────────────────────

/** @type {Array<{label:string, status:'pass'|'fail'|'skip', required:boolean, durationMs:number, reason?:string}>} */
const results = [];

const BANNER_WIDTH = 64;

function header(title) {
  console.log(`\n${"─".repeat(BANNER_WIDTH)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(BANNER_WIDTH));
}

/**
 * Run a child process and record its result.
 * @param {string}   label
 * @param {string}   cmd
 * @param {string[]} args
 * @param {{ cwd?:string, env?:Record<string,string>, optional?:boolean, timeout?:number }} [opts]
 */
function run(label, cmd, args, opts = {}) {
  const {
    cwd      = ROOT,
    env      = {},
    optional = false,
    timeout  = 120_000,
  } = opts;

  process.stdout.write(`  → ${label}... `);
  const t0 = Date.now();

  const result = spawnSync(cmd, args, {
    cwd,
    timeout,
    env:      { ...process.env, ...env },
    // In verbose mode pipe through to the terminal live; otherwise capture.
    stdio:    VERBOSE ? "inherit" : "pipe",
    encoding: "utf8",
    shell:    false,
  });

  const ms   = Date.now() - t0;
  const pass = result.status === 0 && !result.error;

  if (VERBOSE) {
    // stdio already went to terminal above
    console.log(pass ? `  ✓ ${label}  (${ms}ms)` : `  ✗ ${label}  (${ms}ms)`);
  } else {
    console.log(pass ? `PASS  (${ms}ms)` : `FAIL  (${ms}ms)`);
    if (!pass) {
      const combined = ((result.stdout ?? "") + (result.stderr ?? "")).trim();
      if (combined) {
        const tail = combined.slice(-800);
        console.error("    " + tail.replace(/\n/g, "\n    "));
      }
      if (result.error) {
        console.error("    error:", result.error.message);
      }
    }
  }

  results.push({ label, status: pass ? "pass" : "fail", required: !optional, durationMs: ms });
}

/**
 * Record a skipped layer (prerequisite absent or optional condition unmet).
 * @param {string}  label
 * @param {string}  reason
 * @param {boolean} [optional=false]
 */
function skip(label, reason, optional = false) {
  console.log(`  → ${label}... SKIP  (${reason})`);
  results.push({ label, status: "skip", required: !optional, durationMs: 0, reason });
}

// ── Phase 0: Prerequisites ───────────────────────────────────────────────────

header("PREREQ  Dependency check");

if (!HAS_NODE_MODULES) {
  run(
    "Install root node_modules",
    "npm", ["ci", "--include=dev"],
    { cwd: ROOT, timeout: 600_000 },
  );
} else {
  console.log("  → root node_modules... present");
}

if (!HAS_WEB_MODULES) {
  run(
    "Install web node_modules",
    "npm", ["ci", "--include=dev"],
    { cwd: join(ROOT, "web"), timeout: 600_000 },
  );
} else {
  console.log("  → web node_modules... present");
}

// Re-probe after potential install
const nowHasNodeModules = HAS_NODE_MODULES || existsSync(join(ROOT, "node_modules/.bin/vitest"));
const nowHasWebModules  = HAS_WEB_MODULES  || existsSync(join(ROOT, "web/node_modules/next"));

// ── Phase 1: TypeScript compile ──────────────────────────────────────────────

header("BUILD  TypeScript → dist/");

if (!nowHasNodeModules) {
  skip("tsc → dist/", "root node_modules absent — cannot run tsc");
} else if (HAS_DIST) {
  console.log("  → dist/... present (skipping recompile)");
} else {
  run("tsc → dist/", "npm", ["run", "build"], { cwd: ROOT, timeout: 180_000 });
}

const nowHasDist = HAS_DIST || existsSync(join(ROOT, "dist/src/brain/index.js"));

// ── Phase 2: Governance ──────────────────────────────────────────────────────

header("TIER 1  Governance (FDL 10/2025)");

run(
  "Prompt hash integrity",
  "node", ["scripts/validate-prompt-hashes.mjs"],
  { cwd: ROOT },
);

run(
  "Lethal-trifecta controls",
  "node", ["scripts/lethal-trifecta-check.mjs"],
  { cwd: ROOT },
);

if (nowHasDist) {
  run(
    "Mode version pins (production)",
    "node", ["scripts/check-mode-versions.mjs"],
    { cwd: ROOT, env: { NODE_ENV: "production" } },
  );
} else {
  skip("Mode version pins", "dist/ absent — run npm run build first");
}

// ── Phase 3: Brain audit ─────────────────────────────────────────────────────

header("TIER 2  Brain subsystem audit");

if (nowHasDist) {
  // The npm run brain:audit script does NOT exit 1 when report.ok===false.
  // Use a node one-liner that explicitly checks the return value.
  const brainAuditOneliner = [
    "import('./dist/src/brain/index.js')",
    ".then(m => {",
    "  const r = m.auditBrain();",
    "  if (!r.ok) {",
    "    console.error('Brain audit FAILED. Problems:', JSON.stringify(r.problems, null, 2));",
    "    process.exit(1);",
    "  }",
    "  console.log('Brain audit passed. Coverage:', r.coveragePct + '%');",
    "})",
    ".catch(e => { console.error(e); process.exit(1); });",
  ].join(" ");

  run(
    "Brain subsystem audit",
    "node", ["--input-type=module", "-e", brainAuditOneliner],
    { cwd: ROOT, timeout: 120_000 },
  );
} else {
  skip("Brain subsystem audit", "dist/ absent");
}

// ── Phase 4: Static analysis ─────────────────────────────────────────────────

header("TIER 3  Static analysis");

if (nowHasNodeModules) {
  run("TypeScript typecheck", "npm", ["run", "typecheck"], { cwd: ROOT, timeout: 120_000 });
  run("Lint (src/ netlify/)",  "npm", ["run", "lint"],     { cwd: ROOT });
  if (nowHasWebModules) {
    run("Lint (web/)", "npm", ["run", "lint"], { cwd: join(ROOT, "web") });
  } else {
    skip("Lint (web/)", "web node_modules absent");
  }
} else {
  skip("TypeScript typecheck", "node_modules absent");
  skip("Lint (src/ netlify/)",  "node_modules absent");
  skip("Lint (web/)",           "node_modules absent");
}

// ── Phase 5: Unit tests ──────────────────────────────────────────────────────

header("TIER 4  Unit tests");

if (nowHasNodeModules) {
  run(
    "Unit tests (211)",
    "npx", ["vitest", "run"],
    { cwd: ROOT, timeout: 180_000 },
  );
} else {
  skip("Unit tests", "node_modules absent");
}

// ── Phase 6: Integration tests ───────────────────────────────────────────────

header("TIER 5  Integration tests");

if (nowHasNodeModules && nowHasDist) {
  run(
    "Integration tests (7)",
    "npx", ["vitest", "run", "--config", "vitest.integration.ts"],
    { cwd: ROOT, timeout: 180_000 },
  );
} else {
  skip(
    "Integration tests",
    !nowHasNodeModules ? "node_modules absent" : "dist/ absent",
  );
}

// ── Phase 7: Latency smoke ───────────────────────────────────────────────────

header("TIER 6  Latency smoke");

run(
  "Latency smoke (10 inline checks)",
  "node", ["scripts/smoke-latency.mjs"],
  { cwd: ROOT, timeout: 60_000 },
);

// ── Phase 8: Compliance agent (optional) ─────────────────────────────────────

header("TIER 7  Compliance agent smoke  [optional]");

const compAgentOk =
  nowHasDist &&
  existsSync(join(ROOT, "dist/src/integrations/complianceAgent.js")) &&
  existsSync(join(ROOT, "dist/src/integrations/egressGate.js"));

if (HAS_API_KEY && compAgentOk) {
  run(
    "Compliance agent smoke",
    "node", ["scripts/smoke-compliance-agent.mjs"],
    { cwd: ROOT, timeout: 90_000, optional: true },
  );
} else {
  const reason = !HAS_API_KEY
    ? "ANTHROPIC_API_KEY not set"
    : !nowHasDist
      ? "dist/ absent"
      : "dist/src/integrations not compiled";
  skip("Compliance agent smoke", reason, true);
}

// ── Phase 9: MCP tools smoke (optional) ──────────────────────────────────────

header("TIER 8  MCP tools smoke  [optional]");

// Re-probe: the server may have started during the preceding test phases even
// if it wasn't up at script-start (e.g. when smoke-test-runner launches after
// `npm run dev` in a parallel terminal).
const serverReadyNow = HAS_SERVER || await probeServer(SMOKE_BASE_URL);

if (serverReadyNow) {
  run(
    "MCP tools smoke (14 cases)",
    "node", ["scripts/smoke-mcp-tools.mjs"],
    {
      cwd:     ROOT,
      timeout: 90_000,
      optional: true,
      env: {
        SMOKE_BASE_URL: SMOKE_BASE_URL,
        ...(process.env.SMOKE_API_KEY ? { SMOKE_API_KEY: process.env.SMOKE_API_KEY } : {}),
      },
    },
  );
} else {
  skip(
    "MCP tools smoke",
    `no server at ${SMOKE_BASE_URL} — start with: cd web && npm run dev`,
    true,
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

(function printSummary() {
  const line     = "═".repeat(BANNER_WIDTH);
  const subline  = "─".repeat(BANNER_WIDTH - 2);
  const passed   = results.filter(r => r.status === "pass").length;
  const failed   = results.filter(r => r.status === "fail").length;
  const skipped  = results.filter(r => r.status === "skip").length;
  const reqFail  = results.filter(r => r.required && r.status === "fail").length;

  console.log(`\n${line}`);
  console.log(`  HAWKEYE STERLING — SMOKE TEST RESULTS`);
  console.log(line);

  for (const r of results) {
    const icon  = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "–";
    const label = r.label.padEnd(42);
    const right = r.status === "skip"
      ? (r.reason ?? "").slice(0, 20)
      : r.durationMs >= 1000
        ? `${(r.durationMs / 1000).toFixed(1)}s`
        : `${r.durationMs}ms`;
    console.log(`  ${icon} ${label} ${right}`);
  }

  console.log(`\n  ${subline}`);
  console.log(`  ${passed} passed  ·  ${failed} failed  ·  ${skipped} skipped`);

  if (reqFail > 0) {
    console.error(`\n  ✗  SMOKE TEST FAILED — ${reqFail} required layer(s) failed`);
    console.error(`     Review the output above for failure details.\n`);
    process.exit(1);
  }

  if (skipped > 0) {
    console.log(`\n  ✓  All required smoke tests passed`);
    console.log(`     (${skipped} layer(s) skipped — see output above for reasons)\n`);
  } else {
    console.log(`\n  ✓  All smoke tests passed — ready to merge\n`);
  }
  process.exit(0);
})();
