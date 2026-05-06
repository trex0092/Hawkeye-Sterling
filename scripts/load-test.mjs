#!/usr/bin/env node
// Hawkeye Sterling — load-test harness.
//
// World-Check parity goal: 50,000 subjects/day = ~35 subjects/min.
// This script fires a configurable rate of /api/quick-screen requests
// against any environment URL, measures latency p50/p95/p99 and
// success / 5xx / 4xx rates.
//
// Usage:
//   node scripts/load-test.mjs --base https://hawkeye-sterling.netlify.app --rps 5 --total 1000
//   node scripts/load-test.mjs --base http://localhost:3000 --rps 20 --total 5000

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith("--")) acc.push([arg.slice(2), all[i + 1]]);
    return acc;
  }, []),
);

const BASE = args.base || "http://localhost:3000";
const RPS = Number(args.rps || 5);
const TOTAL = Number(args.total || 100);
const ENDPOINT = args.endpoint || "/api/quick-screen";

const SAMPLE_SUBJECTS = [
  "John Smith",
  "Mohamed Ali",
  "Maria Garcia",
  "Wang Wei",
  "Maduro Moros, Nicolas",
  "Lazarus Group",
  "Acme Trading FZE",
  "Istanbul Gold Refinery",
  "Generic Holdings Ltd",
  "Anonymous Corporation",
];

function pickSubject() {
  return SAMPLE_SUBJECTS[Math.floor(Math.random() * SAMPLE_SUBJECTS.length)];
}

const results = {
  total: 0,
  ok2xx: 0,
  err4xx: 0,
  err5xx: 0,
  network: 0,
  latencies: [],
};

async function fireOne() {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${ENDPOINT}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: { name: pickSubject() } }),
    });
    const dt = Date.now() - t0;
    results.total += 1;
    results.latencies.push(dt);
    if (res.status >= 200 && res.status < 300) results.ok2xx += 1;
    else if (res.status >= 400 && res.status < 500) results.err4xx += 1;
    else if (res.status >= 500) results.err5xx += 1;
  } catch (err) {
    results.total += 1;
    results.network += 1;
    results.latencies.push(Date.now() - t0);
  }
}

function pct(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[i] || 0;
}

(async () => {
  console.log(
    `[load-test] base=${BASE} endpoint=${ENDPOINT} rps=${RPS} total=${TOTAL}`,
  );
  console.log(`[load-test] starting at ${new Date().toISOString()}`);

  const intervalMs = Math.max(1, Math.floor(1000 / RPS));
  const t0 = Date.now();

  for (let i = 0; i < TOTAL; i += 1) {
    fireOne();
    if (i % 50 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const rate = results.total > 0 ? (results.total / (Date.now() - t0) * 1000).toFixed(1) : "0";
      console.log(`[load-test] fired ${i}/${TOTAL} (${rate} rps avg) — elapsed ${elapsed}s`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  // Drain in-flight requests
  console.log(`[load-test] all requests fired, draining...`);
  for (let i = 0; i < 30; i += 1) {
    if (results.total >= TOTAL) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const p50 = pct(results.latencies, 0.5);
  const p95 = pct(results.latencies, 0.95);
  const p99 = pct(results.latencies, 0.99);
  const errPct = ((results.err5xx + results.network) / Math.max(1, results.total) * 100).toFixed(2);

  console.log("");
  console.log(`[load-test] === RESULTS ===`);
  console.log(`[load-test] Duration:      ${dt}s`);
  console.log(`[load-test] Total fired:   ${results.total}`);
  console.log(`[load-test] 2xx:           ${results.ok2xx}`);
  console.log(`[load-test] 4xx:           ${results.err4xx}`);
  console.log(`[load-test] 5xx:           ${results.err5xx}`);
  console.log(`[load-test] Network errs:  ${results.network}`);
  console.log(`[load-test] Error rate:    ${errPct}%`);
  console.log(`[load-test] Latency p50:   ${p50}ms`);
  console.log(`[load-test] Latency p95:   ${p95}ms`);
  console.log(`[load-test] Latency p99:   ${p99}ms`);

  // World-Check baseline: <1% error rate, p95 <2s
  const passed = Number(errPct) < 1 && p95 < 2000;
  console.log(`[load-test] SLO ${passed ? "PASS ✓" : "FAIL ✗"} (target: error<1%, p95<2s)`);
  process.exit(passed ? 0 : 1);
})();
