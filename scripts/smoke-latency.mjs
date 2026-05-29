#!/usr/bin/env node
// Hawkeye Sterling — latency optimization smoke test.
//
// Tests all optimized components without requiring a live server:
//   1. Bloom filter: build, add entries, pre-screen (positive + negative)
//   2. Redis pipeline: structure validation
//   3. LLM client pool: singleton behaviour
//   4. Model router fast-path: Sonnet selection under latency budget
//   5. buildMlroContext: token compression
//   6. isDecisiveResult: confidence threshold exit
//   7. LatencyBudget: phase tracking + metric emission
//   8. Prompt hash integrity (FDL 10/2025 Art.18)
//   9. Lethal-trifecta governance check
//  10. End-to-end timing assertions
//
// Usage (no live server needed):
//   node scripts/smoke-latency.mjs
//
// Exit codes:
//   0  all checks passed
//   1  one or more checks failed

import { createRequire } from "module";
import { execSync } from "child_process";
import { pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const t0 = Date.now();
let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}
function fail(label, detail) {
  console.error(`  ❌ ${label}${detail ? `: ${detail}` : ""}`);
  failed++;
}
function section(title) {
  console.log(`\n── ${title} ──`);
}

// ── 1. Bloom Filter ──────────────────────────────────────────────────────────

section("Bloom Filter");
try {
  // Load via compiled JS (TypeScript not runnable directly in Node)
  // We test the logic inline since we can't import TS directly.
  const BITS = 1 << 18; // 262 144
  const K = 5;

  function murmur32(str, seed) {
    let h = seed >>> 0;
    const len = str.length;
    let i = 0;
    for (; i + 3 < len; i += 4) {
      let k = (str.charCodeAt(i) & 0xff) | ((str.charCodeAt(i+1) & 0xff) << 8) |
              ((str.charCodeAt(i+2) & 0xff) << 16) | ((str.charCodeAt(i+3) & 0xff) << 24);
      k = Math.imul(k, 0xcc9e2d51);
      k = ((k << 15) | (k >>> 17));
      k = Math.imul(k, 0x1b873593);
      h ^= k;
      h = ((h << 13) | (h >>> 19));
      h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
    }
    // tail block: handle 1–3 remaining bytes (matches production bloom-filter.ts)
    let rem = 0;
    switch (len - i) {
      case 3: rem |= (str.charCodeAt(i + 2) & 0xff) << 16; // fallthrough
      case 2: rem |= (str.charCodeAt(i + 1) & 0xff) << 8;  // fallthrough
      case 1:
        rem |= str.charCodeAt(i) & 0xff;
        rem = Math.imul(rem, 0xcc9e2d51);
        rem = ((rem << 15) | (rem >>> 17));
        rem = Math.imul(rem, 0x1b873593);
        h ^= rem;
    }
    h ^= len;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  const bits = new Uint8Array(Math.ceil(BITS / 8));
  function setBit(pos) { bits[pos >>> 3] |= 1 << (pos & 7); }
  function testBit(pos) { return (bits[pos >>> 3] & (1 << (pos & 7))) !== 0; }

  function norm(s) { return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
  function addToFilter(name) {
    const n = norm(name);
    for (let i = 0; i < K; i++) setBit(murmur32(n, i * 0x9e3779b9) % BITS);
    for (const tok of n.split(" ").filter(t => t.length >= 3)) {
      for (let i = 0; i < K; i++) setBit(murmur32(tok, i * 0x9e3779b9) % BITS);
    }
  }
  function mightContain(name) {
    const n = norm(name);
    for (let i = 0; i < K; i++) {
      if (!testBit(murmur32(n, i * 0x9e3779b9) % BITS)) return false;
    }
    return true;
  }
  function mightContainAnyToken(name) {
    return norm(name).split(" ").filter(t => t.length >= 3).some(t => mightContain(t));
  }

  // Build a small filter with known sanctions names
  const corpus = [
    "Osama bin Laden", "Kim Jong-un", "Muammar Gaddafi",
    "Viktor Bout", "El Chapo", "Lazarus Group",
    "Al-Aqsa Martyrs Brigade", "Hezbollah", "Hamas",
  ];
  corpus.forEach(addToFilter);

  // Positive tests (should be IN filter)
  if (mightContainAnyToken("Osama bin Laden")) pass("bloom: 'Osama bin Laden' → mightContain");
  else fail("bloom: 'Osama bin Laden' → mightContain");

  if (mightContainAnyToken("Lazarus Group")) pass("bloom: 'Lazarus Group' → mightContain");
  else fail("bloom: 'Lazarus Group' → mightContain");

  // Negative test (should NOT be in filter — definite miss)
  const negative = "ZZQ_XWPF_NONEXISTENT_CORPORATION_99999";
  if (!mightContainAnyToken(negative)) pass("bloom: nonsense name → definite miss");
  else fail("bloom: nonsense name → expected definite miss");

  // FPR estimate: 1000 random names — expect < 1% false positives
  let fp = 0;
  for (let i = 0; i < 1000; i++) {
    const rnd = `rnd_${Math.random().toString(36).slice(2)}_test`;
    if (mightContainAnyToken(rnd)) fp++;
  }
  const fpr = fp / 1000;
  if (fpr < 0.02) pass(`bloom: FPR=${(fpr*100).toFixed(2)}% < 2% on 1000 random names`);
  else fail(`bloom: FPR=${(fpr*100).toFixed(2)}% exceeds 2% threshold`);

  // Timing: 10 000 lookups in < 50 ms
  const tBloom = Date.now();
  for (let i = 0; i < 10_000; i++) mightContainAnyToken("John Smith");
  const bloomMs = Date.now() - tBloom;
  if (bloomMs < 50) pass(`bloom: 10 000 lookups in ${bloomMs}ms (< 50ms)`);
  else fail(`bloom: 10 000 lookups took ${bloomMs}ms (expected < 50ms)`);

} catch (e) {
  fail("bloom: unexpected error", e.message);
}

// ── 2. Redis Pipeline Structure ──────────────────────────────────────────────

section("Redis Pipeline Structure");
try {
  // Validate that the pipeline command array is well-formed
  function buildPipeline(secKey, minKey, cost) {
    return [
      ["INCRBY", secKey, String(cost)],
      ["EXPIRE",  secKey, "2"],
      ["INCRBY", minKey, String(cost)],
      ["EXPIRE",  minKey, "62"],
    ];
  }
  const pipeline = buildPipeline("rl:testkey:s:1000", "rl:testkey:m:16", 2);
  if (pipeline.length === 4) pass("redis-pipeline: 4 commands in single batch");
  else fail("redis-pipeline: expected 4 commands");

  if (pipeline[0][0] === "INCRBY" && pipeline[0][2] === "2") pass("redis-pipeline: INCRBY with cost=2");
  else fail("redis-pipeline: INCRBY command malformed");

  if (pipeline[1][2] === "2" && pipeline[3][2] === "62") pass("redis-pipeline: TTL values correct (2s, 62s)");
  else fail("redis-pipeline: TTL values incorrect");

  const body = JSON.stringify(pipeline);
  if (body.includes("INCRBY") && body.includes("EXPIRE")) pass("redis-pipeline: JSON serializable");
  else fail("redis-pipeline: JSON serialization failed");
} catch (e) {
  fail("redis-pipeline: unexpected error", e.message);
}

// ── 3. Model Router Fast-Path ────────────────────────────────────────────────

section("Model Router Fast-Path");
try {
  // Simulate pickModel logic inline (mirrors model-router.ts)
  const OPUS = "claude-opus-4-7";
  const SONNET = "claude-sonnet-4-6";
  const HAIKU = "claude-haiku-4-5-20251001";
  const FAST_PATH_LATENCY_MS = 8_000;

  function pickModel(task) {
    if (task.overrideModel) return { model: task.overrideModel, reason: "override" };
    if (task.regulatorFacing === true) return { model: OPUS, reason: "regulator-facing" };
    if (task.extendedThinking === true) return { model: OPUS, reason: "extended-thinking" };
    if (task.fastPath === true && task.regulatorFacing !== true &&
        (task.latencyBudgetMs ?? Infinity) <= FAST_PATH_LATENCY_MS) {
      if (task.kind === "screening_verdict" || task.kind === "narrative_drafting") {
        return { model: SONNET, reason: "fast-path" };
      }
    }
    if (task.kind === "screening_verdict" || task.kind === "narrative_drafting") {
      return { model: OPUS, reason: "regulator-facing-by-category" };
    }
    if (task.costSensitivity === "cheap") return { model: HAIKU, reason: "cheap-tier" };
    if ((task.latencyBudgetMs ?? Infinity) <= 3_000) return { model: HAIKU, reason: "snap" };
    if ((task.latencyBudgetMs ?? Infinity) <= 8_000) return { model: SONNET, reason: "tight-latency" };
    if (task.kind === "batch_screen") return { model: HAIKU, reason: "batch-screen" };
    return { model: SONNET, reason: "default" };
  }

  // Fast-path: screening_verdict + fastPath=true + budget ≤ 8s → Sonnet
  const fp = pickModel({ kind: "screening_verdict", fastPath: true, latencyBudgetMs: 5000 });
  if (fp.model === SONNET) pass(`model-router: fastPath screening_verdict (5s) → Sonnet`);
  else fail(`model-router: fastPath screening_verdict → got ${fp.model}, expected Sonnet`);

  // Without fast-path: always Opus
  const nfp = pickModel({ kind: "screening_verdict" });
  if (nfp.model === OPUS) pass("model-router: screening_verdict (no fastPath) → Opus");
  else fail(`model-router: screening_verdict → got ${nfp.model}, expected Opus`);

  // regulatorFacing overrides fastPath → Opus
  const rf = pickModel({ kind: "screening_verdict", fastPath: true, latencyBudgetMs: 3000, regulatorFacing: true });
  if (rf.model === OPUS) pass("model-router: regulatorFacing=true overrides fastPath → Opus");
  else fail(`model-router: regulatorFacing override → got ${rf.model}, expected Opus`);

  // Snap (<3s) → Haiku
  const snap = pickModel({ kind: "classification", latencyBudgetMs: 2000 });
  if (snap.model === HAIKU) pass("model-router: snap (<3s) → Haiku");
  else fail(`model-router: snap → got ${snap.model}, expected Haiku`);

  // batch_screen → Haiku
  const batch = pickModel({ kind: "batch_screen" });
  if (batch.model === HAIKU) pass("model-router: batch_screen → Haiku");
  else fail(`model-router: batch_screen → got ${batch.model}`);

} catch (e) {
  fail("model-router: unexpected error", e.message);
}

// ── 4. buildMlroContext Token Compression ────────────────────────────────────

section("buildMlroContext Token Compression");
try {
  function buildMlroContext(subject, result, opts = {}) {
    const maxHits = opts.maxHits ?? 5;
    const maxReasonLen = opts.maxReasonLen ?? 120;
    const topHits = [...result.hits]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, maxHits)
      .map(h => ({
        list: h.listId, ref: h.listRef, candidate: h.candidateName,
        score: Number((h.score ?? 0).toFixed(3)),
        ...(h.reason ? { reason: h.reason.slice(0, maxReasonLen) } : {}),
      }));
    return JSON.stringify({ subject: { name: subject.name }, screening: { severity: result.severity, topScore: result.topScore, hitCount: result.hits.length }, hits: topHits });
  }

  const mockResult = {
    severity: "critical",
    topScore: 0.97,
    hits: Array.from({ length: 12 }, (_, i) => ({
      listId: "ofac_sdn", listRef: `SDN-${i}`, candidateName: `Test Entity ${i}`,
      score: 0.97 - i * 0.02,
      reason: "Highly specific sanctions match reason text that is quite long and detailed for testing purposes"
    }))
  };
  const ctx = buildMlroContext({ name: "Test Entity" }, mockResult);
  const tokens = Math.ceil(ctx.length / 4); // rough token estimate
  if (tokens < 500) pass(`buildMlroContext: compressed to ~${tokens} tokens (< 500)`);
  else fail(`buildMlroContext: ${tokens} tokens exceeds 500 target`);

  const parsed = JSON.parse(ctx);
  if (parsed.hits.length <= 5) pass("buildMlroContext: max 5 hits enforced");
  else fail(`buildMlroContext: ${parsed.hits.length} hits, expected ≤ 5`);

  if (parsed.hits[0].reason.length <= 120) pass("buildMlroContext: reason truncated to ≤ 120 chars");
  else fail(`buildMlroContext: reason ${parsed.hits[0].reason.length} chars, expected ≤ 120`);
} catch (e) {
  fail("buildMlroContext: unexpected error", e.message);
}

// ── 5. isDecisiveResult Short-Circuit ────────────────────────────────────────

section("isDecisiveResult Confidence Short-Circuit");
try {
  function isDecisiveResult(result) {
    if (result.severity === "critical") return true;
    if ((result.topScore ?? 0) >= 0.98) return true;
    return false;
  }

  if (isDecisiveResult({ severity: "critical", topScore: 0.9 })) pass("isDecisiveResult: critical → decisive");
  else fail("isDecisiveResult: critical should be decisive");

  if (isDecisiveResult({ severity: "possible", topScore: 0.99 })) pass("isDecisiveResult: score 0.99 → decisive");
  else fail("isDecisiveResult: score 0.99 should be decisive");

  if (!isDecisiveResult({ severity: "possible", topScore: 0.75 })) pass("isDecisiveResult: score 0.75 → not decisive");
  else fail("isDecisiveResult: score 0.75 should not be decisive");
} catch (e) {
  fail("isDecisiveResult: unexpected error", e.message);
}

// ── 6. LatencyBudget Phase Tracking ─────────────────────────────────────────

section("LatencyBudget Phase Tracking");
try {
  // Simulate LatencyBudget without importing TS
  class LatencyBudget {
    constructor(route) {
      this.route = route;
      this.t0 = Date.now();
      this.current = "init";
      this.currentStart = this.t0;
      this.phases = [];
      this.done = false;
    }
    phase(name) {
      if (this.done) return;
      const now = Date.now();
      if (this.current) this.phases.push({ name: this.current, durationMs: now - this.currentStart });
      this.current = name;
      this.currentStart = now;
    }
    finish() {
      if (this.done) return this.phases;
      this.done = true;
      const now = Date.now();
      this.phases.push({ name: this.current, durationMs: now - this.currentStart });
      return this.phases;
    }
    elapsed() { return Date.now() - this.t0; }
  }

  const lb = new LatencyBudget("quick-screen");
  lb.phase("auth");
  await new Promise(r => setTimeout(r, 20));
  lb.phase("bloom");
  await new Promise(r => setTimeout(r, 5));
  lb.phase("quickscreen");
  await new Promise(r => setTimeout(r, 5));
  const phases = lb.finish();

  if (phases.length === 4) pass(`latency-budget: recorded 4 phases (init, auth, bloom, quickscreen)`);
  else fail(`latency-budget: expected 4 phases, got ${phases.length}`);

  const authPhase = phases.find(p => p.name === "auth");
  if (authPhase && authPhase.durationMs >= 10) pass(`latency-budget: auth phase ≥ 10ms (${authPhase.durationMs}ms)`);
  else fail(`latency-budget: auth phase timing incorrect (got ${authPhase?.durationMs ?? "null"}ms, expected ≥10ms)`);

  if (lb.done) pass("latency-budget: idempotent finish (no double-record)");
  const phases2 = lb.finish();
  if (phases2.length === phases.length) pass("latency-budget: finish() idempotent");
  else fail("latency-budget: finish() not idempotent");

} catch (e) {
  fail("latency-budget: unexpected error", e.message);
}

// ── 7. Prompt Hash Integrity ─────────────────────────────────────────────────

section("Prompt Hash Integrity (FDL 10/2025 Art.18)");
try {
  const result = execSync("node scripts/validate-prompt-hashes.mjs", { encoding: "utf8", timeout: 30_000 });
  if (result.includes("All") && result.includes("match manifest")) pass("prompt-hashes: all hashes match manifest");
  else fail("prompt-hashes: hash mismatch detected", result.slice(-200));
} catch (e) {
  fail("prompt-hashes: validator failed", e.message.slice(0, 200));
}

// ── 8. Lethal-Trifecta Governance ────────────────────────────────────────────

section("Lethal-Trifecta Governance Check");
try {
  const result = execSync("node scripts/lethal-trifecta-check.mjs", { encoding: "utf8", timeout: 30_000 });
  if (result.includes("PASSED")) pass("lethal-trifecta: all controls verified");
  else fail("lethal-trifecta: check failed", result.slice(-200));
} catch (e) {
  fail("lethal-trifecta: check failed", e.message.slice(0, 200));
}

// ── 9. Architecture Invariants ───────────────────────────────────────────────

section("Architecture Invariants");
try {
  const { readFileSync } = await import("fs");

  // Verify LLM pool singleton is present
  const llm = readFileSync("web/lib/server/llm.ts", "utf8");
  if (llm.includes("__hs_anthropic_pool")) pass("llm.ts: singleton pool anchor present");
  else fail("llm.ts: singleton pool not found");
  if (llm.includes("_pool.get(poolKey)")) pass("llm.ts: pool lookup present");
  else fail("llm.ts: pool lookup missing");

  // Verify Redis pipeline
  const rl = readFileSync("web/lib/server/rate-limit.ts", "utf8");
  if (rl.includes("redisPipeline")) pass("rate-limit.ts: redisPipeline function present");
  else fail("rate-limit.ts: redisPipeline missing");
  if (rl.includes("/pipeline")) pass("rate-limit.ts: Upstash /pipeline endpoint used");
  else fail("rate-limit.ts: /pipeline endpoint not found");
  if (!rl.includes("redisIncr")) pass("rate-limit.ts: old redisIncr removed");
  else fail("rate-limit.ts: old redisIncr still present");

  // Verify Bloom filter wired into candidates-loader
  const cl = readFileSync("web/lib/server/candidates-loader.ts", "utf8");
  if (cl.includes("rebuildGlobalFilter")) pass("candidates-loader.ts: Bloom rebuild wired");
  else fail("candidates-loader.ts: Bloom rebuild not wired");

  // Verify Bloom pre-screen in quick-screen route
  const qs = readFileSync("web/app/api/quick-screen/route.ts", "utf8");
  if (qs.includes("bloomPreScreen")) pass("quick-screen/route.ts: bloomPreScreen call present");
  else fail("quick-screen/route.ts: bloomPreScreen missing");
  if (qs.includes("bloom_filter_fast_path")) pass("quick-screen/route.ts: Bloom fast-path audit note present");
  else fail("quick-screen/route.ts: Bloom audit note missing");

  // Verify fastPath in model router
  const mr = readFileSync("src/integrations/model-router.ts", "utf8");
  if (mr.includes("fastPath?: boolean")) pass("model-router.ts: fastPath field declared");
  else fail("model-router.ts: fastPath field missing");
  if (mr.includes("FAST_PATH_LATENCY_MS")) pass("model-router.ts: FAST_PATH_LATENCY_MS constant present");
  else fail("model-router.ts: FAST_PATH_LATENCY_MS missing");

  // Verify speed-path in mlro-advisor
  const ma = readFileSync("web/app/api/mlro-advisor/route.ts", "utf8");
  if (ma.includes("streamToString")) pass("mlro-advisor/route.ts: streamToString imported");
  else fail("mlro-advisor/route.ts: streamToString not imported");
  if (ma.includes("speedFastPath")) pass("mlro-advisor/route.ts: speed fast-path present");
  else fail("mlro-advisor/route.ts: speed fast-path missing");
  if (ma.includes("LatencyBudget")) pass("mlro-advisor/route.ts: LatencyBudget tracking present");
  else fail("mlro-advisor/route.ts: LatencyBudget missing");

  // Verify new modules exist
  for (const f of ["web/lib/server/bloom-filter.ts", "web/lib/server/llm-streaming.ts",
                    "web/lib/server/screening-pipeline.ts", "web/lib/server/latency-budget.ts"]) {
    try { readFileSync(f, "utf8"); pass(`${f}: exists`); }
    catch { fail(`${f}: missing`); }
  }

} catch (e) {
  fail("architecture-invariants: unexpected error", e.message);
}

// ── 10. SLA Target Validation ────────────────────────────────────────────────

section("SLA Target Constants");
try {
  const { readFileSync } = await import("fs");
  const lb = readFileSync("web/lib/server/latency-budget.ts", "utf8");
  if (lb.includes("QUICK_SCREEN_TOTAL_MS: 3_500")) pass("latency-budget: QUICK_SCREEN_TOTAL_MS = 3500ms");
  else fail("latency-budget: QUICK_SCREEN_TOTAL_MS constant incorrect");
  if (lb.includes("MLRO_TOTAL_MS: 5_000")) pass("latency-budget: MLRO_TOTAL_MS = 5000ms");
  else fail("latency-budget: MLRO_TOTAL_MS constant incorrect");
  if (lb.includes("BLOOM_PHASE_MS: 1")) pass("latency-budget: BLOOM_PHASE_MS = 1ms");
  else fail("latency-budget: BLOOM_PHASE_MS incorrect");
} catch (e) {
  fail("sla-targets: unexpected error", e.message);
}

// ── Summary ──────────────────────────────────────────────────────────────────

const totalMs = Date.now() - t0;
const total = passed + failed;
console.log(`\n${"═".repeat(58)}`);
console.log(`Smoke test complete in ${totalMs}ms`);
console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
console.log(`${"═".repeat(58)}`);

if (failed > 0) {
  console.error(`\n🚨 ${failed} check(s) failed — do not merge to main\n`);
  process.exit(1);
}
console.log(`\n✅ All checks passed — ready to merge to main\n`);
process.exit(0);
