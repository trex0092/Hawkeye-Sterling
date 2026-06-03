#!/usr/bin/env node
// Hawkeye Sterling — Post-deploy production smoke check.
//
// Verifies the two regulator-facing live paths actually work against a running
// deployment — the failure modes that unit/integration tests cannot catch
// because they exercise neither real egress nor the live Blobs-backed corpus:
//
//   1. Screening corpus degradation — quick-screen silently falling back to the
//      65-entry static seed when Netlify Blobs is unbound / the refresh cron
//      lagged (asserts dataSourceHealth + clearVerdictReliable).
//   2. Adverse-media outage — news-search returning retrieval:"unavailable"
//      because datacenter egress to news.google.com / GDELT is blocked.
//
// Usage:
//   BASE_URL=https://hawkeye-sterling.netlify.app \
//   HAWKEYE_API_KEY=hs_live_xxx \
//   node scripts/prod-smoke-check.mjs
//
// Exit code 0 = all checks passed, 1 = at least one check failed. Intended to
// run as a Netlify post-deploy hook, a scheduled cron, or a CI gate.

const BASE_URL = (process.env.BASE_URL ?? "https://hawkeye-sterling.netlify.app").replace(/\/$/, "");
const API_KEY = process.env.HAWKEYE_API_KEY ?? process.env.ADMIN_TOKEN ?? "";
// A well-known, long-standing sanctioned individual — used only to assert the
// pipeline runs and matches against a live corpus. Override via SMOKE_SUBJECT.
const SUBJECT = process.env.SMOKE_SUBJECT ?? "Vladimir Putin";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);

const authHeaders = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function checkScreening() {
  try {
    const { status, json } = await fetchJson("/api/quick-screen", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ subject: { name: SUBJECT, entityType: "individual" } }),
    });
    if (status === 401) {
      record("screening: authenticated", false, "401 — set HAWKEYE_API_KEY / ADMIN_TOKEN");
      return;
    }
    if (json?.errorCode === "LISTS_MISSING") {
      record("screening: corpus loaded", false, "LISTS_MISSING — sanctions lists not loaded (run refresh / bind Blobs)");
      return;
    }
    if (status !== 200 || json?.ok !== true) {
      record("screening: 200 OK", false, `HTTP ${status} ${json?.error ?? ""}`);
      return;
    }
    record("screening: 200 OK", true, `severity=${json.severity}, hits=${json.hits?.length ?? 0}, ${json.latencyMs}ms`);

    // Corpus must be live, not the static seed.
    const dsh = json.dataSourceHealth;
    const live = dsh ? dsh.healthy !== false : true;
    record("screening: live corpus (not static seed)", live,
      dsh ? `source=${dsh.source ?? "?"} healthy=${dsh.healthy}` : "no dataSourceHealth field");

    // A clean verdict must be reliable (not produced against stale/empty lists).
    if (json.severity === "clear") {
      record("screening: clear verdict reliable", json.clearVerdictReliable !== false,
        json.verdictQualifier ?? "ok");
    }
  } catch (err) {
    record("screening: reachable", false, err?.name ?? String(err));
  }
}

async function checkNews() {
  try {
    const { status, json } = await fetchJson(`/api/news-search?q=${encodeURIComponent(SUBJECT)}`, {
      headers: { ...authHeaders },
    });
    if (status !== 200 || json?.ok !== true) {
      record("news: 200 OK", false, `HTTP ${status}`);
      return;
    }
    record("news: 200 OK", true,
      `retrieval=${json.retrieval}, articles=${json.articleCount}, feeds=${json.feedsReachable}/${json.feedsAttempted}, ${json.latencyMs}ms`);
    // retrieval must be "live" — "unavailable"/"degraded" means a real egress
    // outage that would turn every screen into a false "no adverse media".
    record("news: retrieval live", json.retrieval === "live",
      json.retrieval === "live" ? "ok" : `retrieval=${json.retrieval} (egress to news.google.com / GDELT blocked?)`);
  } catch (err) {
    record("news: reachable", false, err?.name ?? String(err));
  }
}

async function checkNewsHealth() {
  try {
    const { status, json } = await fetchJson("/api/news-search/health", {});
    record("news-health endpoint", status === 200 || status === 207,
      json ? `retrieval=${json.retrieval}` : `HTTP ${status}`);
  } catch (err) {
    record("news-health endpoint", false, err?.name ?? String(err));
  }
}

(async () => {
  console.log(`\nHawkeye Sterling — production smoke check`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Subject: ${SUBJECT}`);
  console.log(`Auth: ${API_KEY ? "yes" : "NO (screening will 401)"}\n`);

  await checkScreening();
  await checkNews();
  await checkNewsHealth();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.error(`\nFAILED: ${failed.map((f) => f.name).join(", ")}\n`);
    process.exit(1);
  }
  console.log("All production smoke checks passed.\n");
})().catch((err) => {
  console.error("smoke check crashed:", err);
  process.exit(1);
});
