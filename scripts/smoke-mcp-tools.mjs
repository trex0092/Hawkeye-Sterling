#!/usr/bin/env node
// Hawkeye Sterling — MCP smoke test for the 7 composite tools (Section A).
//
// Hits each merged tool via the /api/mcp JSON-RPC endpoint, exercising both
// discriminator branches where the tool accepts a mode/source/scope/depth
// enum.  Treats HTTP 200 + { result } as PASS, anything else as FAIL.
//
// Usage:
//   node scripts/smoke-mcp-tools.mjs [--base-url <url>] [--api-key <key>]
//
// Env vars (override CLI args):
//   SMOKE_BASE_URL   default http://localhost:3000
//   SMOKE_API_KEY    set to ADMIN_TOKEN value for authenticated endpoints
//
// Exit codes:
//   0  all tests passed
//   1  one or more tests failed

const BASE_URL = process.env["SMOKE_BASE_URL"] ?? "http://localhost:3000";
const API_KEY  = process.env["SMOKE_API_KEY"]  ?? "";

const MCP_URL = `${BASE_URL}/api/mcp`;

let passed = 0;
let failed = 0;

async function call(toolName, args, label) {
  const headers = { "content-type": "application/json" };
  if (API_KEY) headers["x-api-key"] = API_KEY;

  let res;
  let body;
  try {
    res = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    body = await res.json().catch(() => null);
  } catch (err) {
    console.error(`  FAIL  ${label}: network error — ${err.message}`);
    failed++;
    return;
  }

  // JSON-RPC error response
  if (body?.error) {
    console.error(`  FAIL  ${label}: RPC error ${body.error.code}: ${body.error.message}`);
    failed++;
    return;
  }

  // Outer HTTP failure
  if (!res.ok) {
    console.error(`  FAIL  ${label}: HTTP ${res.status}`);
    failed++;
    return;
  }

  // result must exist (even if the underlying API returned a soft error, the
  // tool wrapper should return a result object rather than a JSON-RPC error)
  if (body?.result !== undefined) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}: no result in response — ${JSON.stringify(body).slice(0, 200)}`);
    failed++;
  }
}

// ── Test cases ────────────────────────────────────────────────────────────
// Each entry: [ toolName, args, humanLabel ]
// Discriminator branches are tested as separate entries.

const TESTS = [
  // 1. screen — single subject
  ["screen", { subjects: [{ name: "ACME Holdings LLC", entityType: "organisation" }] }, "screen · single subject"],
  // 1b. screen — batch (>1 subjects)
  ["screen", { subjects: [{ name: "John Doe" }, { name: "Jane Smith" }] }, "screen · batch (2 subjects)"],

  // 2. intel_feed — gdelt branch
  ["intel_feed", { subjectName: "ACME Holdings LLC", source: "gdelt" }, "intel_feed · source=gdelt"],
  // 2b. intel_feed — news branch
  ["intel_feed", { subjectName: "ACME Holdings LLC", source: "news" }, "intel_feed · source=news"],

  // 3. pep — depth=0 (profile only)
  ["pep", { subject: "Test Individual", depth: 0 }, "pep · depth=0 (profile)"],
  // 3b. pep — depth=1 (network traversal)
  ["pep", { subject: "Test Individual", depth: 1 }, "pep · depth=1 (network)"],

  // 4. relationship_graph — corporate branch
  ["relationship_graph", { subject: "ACME Holdings LLC", type: "corporate" }, "relationship_graph · type=corporate"],
  // 4b. relationship_graph — political branch
  ["relationship_graph", { subject: "Test Individual", type: "political" }, "relationship_graph · type=political"],

  // 5. generate_report — screening scope
  ["generate_report", { subjectName: "ACME Holdings LLC", scope: "screening" }, "generate_report · scope=screening"],
  // 5b. generate_report — full scope
  ["generate_report", { subjectName: "ACME Holdings LLC", scope: "full" }, "generate_report · scope=full"],

  // 6. generate_sar_report (single mode — no discriminator)
  ["generate_sar_report", { subjectName: "Test Subject", subjectId: "smoke-001" }, "generate_sar_report"],

  // 7. mlro_analyze — quick branch
  ["mlro_analyze", { question: "Is this a PEP?", subjectName: "Test Individual", depth: "quick" }, "mlro_analyze · depth=quick"],
  // 7b. mlro_analyze — deep branch
  ["mlro_analyze", { question: "Is this a PEP?", subjectName: "Test Individual", depth: "deep" }, "mlro_analyze · depth=deep"],
];

// ── Runner ────────────────────────────────────────────────────────────────

console.log(`\nHawkeye Sterling — MCP composite tool smoke tests`);
console.log(`Target: ${MCP_URL}\n`);

// Run sequentially to avoid rate-limit hammering on slower deployments.
for (const [toolName, args, label] of TESTS) {
  await call(toolName, args, label);
}

console.log(`\n── Results ─────────────────────────────────────────────────────────`);
console.log(`Passed: ${passed} / ${passed + failed}`);
if (failed > 0) {
  console.log(`Failed: ${failed}`);
  console.log(`\nSome tests failed — check the output above for details.`);
  process.exit(1);
}
console.log(`All tests passed.`);
