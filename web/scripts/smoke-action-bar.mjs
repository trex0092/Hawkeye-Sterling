// Hawkeye Sterling — action-bar smoke test.
// Phase A: every nav module page → bar renders 8 buttons, +ADD click produces
//          a visible response (form/toast), zero page errors.
// Phase B: precise per-button behaviour on representative pages.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3100";

const NAV = [
  "/governance/grievances-whistleblowing","/pkyc","/operations/onboard","/client-portal",
  "/ubo-declaration","/pep-profile","/esg-risk","/vendor-dd","/cdd-review",
  "/ownership","/employees","/training","/approvals",
  "/screening","/transaction-monitor","/ongoing-monitor","/cases","/ewra","/sar-qa",
  "/supply-chain","/rmi","/responsible-sourcing","/oecd-ddg","/rmap",
  "/lbma","/reg-change","/shipments","/eocn","/tfs-alerts","/cnmr","/pnmr","/dpmsr",
  "/moe-survey","/enforcement","/oversight","/fp-optimizer","/tm-rules","/audit-findings",
  "/bra","/dormant-accounts","/outsourcing-register","/coi-register","/voluntary-disclosure",
  "/eval-kpi",
  "/mlro-advisor","/responsible-ai","/governance/inspection-room","/regulatory","/policies",
  "/typology-library","/playbook","/corrections","/ai-incident-playbook","/ai-governance",
  "/shadow-ai","/vendor-ai-audit",
  "/osint","/gleif","/entity-graph","/domain-intel","/crypto-risk","/vessel-check",
  "/benford","/investigation","/country-risk?tab=single","/geopolitical","/country-risk-map",
  "/sanctions-evasion","/governance/intelligence-tools","/audit-trail",
  "/intel","/intelligence-hub?tab=workbench","/system-card","/security-scan","/analyst-behavior",
  "/board-dashboard","/kri-dashboard","/access-control",
];

// Pages that pass onAdd to the bar — +ADD runs the page handler (no toast).
const WIRED = new Set([
  "/pkyc","/client-portal","/ubo-declaration","/esg-risk","/vendor-dd","/cdd-review",
  "/employees","/training","/approvals","/screening","/ongoing-monitor","/lbma","/shipments",
  "/cnmr","/tm-rules","/audit-findings","/bra","/dormant-accounts","/outsourcing-register","/dpmsr",
  "/coi-register","/voluntary-disclosure","/oversight","/policies","/investigation","/rmi",
  "/ai-incident-playbook","/shadow-ai","/vendor-ai-audit","/access-control",
]);

const FALLBACK_TOASTS = ["Add form opened", "Jumped to this page's form", "This page has no add form"];

// Pages that intentionally render an API-gated splash (no ModuleLayout, no
// action bar) when their backing API is unreachable — true in local smoke
// runs without a data store. Detected via their "Try again" recovery copy.
const API_GATED = new Set(["/responsible-sourcing", "/moe-survey"]);

const failures = [];
const report = [];
let browser, ctx, page;

function fail(where, msg) { failures.push(`${where}: ${msg}`); }

async function newPage() {
  const p = await ctx.newPage();
  p.__errors = [];
  p.on("pageerror", (e) => p.__errors.push(String(e?.message ?? e)));
  return p;
}

async function open(p, href) {
  await p.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(700);
}

// exact:true → case-sensitive whole-name match, so "+ ADD" (bar) never
// collides with in-page buttons like "+ Add policy".
const barBtn = (p, label) => p.getByRole("button", { name: label, exact: true }).last();
const toast = (p) => p.locator("div.print-hide[style*='bottom']").last();

async function clickAdd(p) {
  await barBtn(p, "+ ADD").click({ timeout: 5000 });
  await p.waitForTimeout(600);
}

async function phaseA() {
  for (const href of NAV) {
    const p = await newPage();
    try {
      await open(p, href);
      if (API_GATED.has(href.split("?")[0])) {
        const splash = await p.getByText("Try again").first().isVisible().catch(() => false);
        if (splash) { report.push(`${href} → SKIP (API-gated splash — no data store in this environment)`); await p.close(); continue; }
      }
      // 1. bar present with all 8 buttons
      for (const label of ["ASANA", "AI", "CSV", "▷ RUN", "PDF", "↻ REFRESH", "+ ADD", "↻ SYNC"]) {
        const n = await p.getByRole("button", { name: label, exact: true }).count();
        if (n === 0) fail(href, `bar button "${label}" not found`);
      }
      // 2. +ADD produces a visible response and no crash
      await clickAdd(p);
      let outcome = "handler";
      if (!WIRED.has(href.split("?")[0])) {
        const t = await toast(p).textContent().catch(() => null);
        if (!t || !FALLBACK_TOASTS.includes(t.trim())) {
          fail(href, `+ADD produced no recognised response (toast=${JSON.stringify(t)})`);
          outcome = "NONE";
        } else outcome = t.trim();
      }
      if (p.__errors.length) fail(href, `page errors: ${p.__errors.join(" | ")}`);
      report.push(`${href} → ${outcome}`);
    } catch (e) {
      fail(href, `EXCEPTION ${String(e).slice(0, 160)}`);
    } finally {
      await p.close();
    }
  }
}

async function expectVisible(p, where, locator, desc) {
  const ok = await locator.first().isVisible().catch(() => false);
  if (!ok) fail(where, `expected visible: ${desc}`);
  return ok;
}

async function phaseB() {
  // B1 — oversight: tab-aware +ADD opens the right form on all four tabs
  {
    const p = await newPage();
    await open(p, "/oversight");
    await clickAdd(p);
    await expectVisible(p, "/oversight[approvals]", p.getByText("New approval request"), "approval form");
    await p.locator("button", { hasText: "Meeting minutes" }).first().click();
    await clickAdd(p);
    await expectVisible(p, "/oversight[minutes]", p.getByText("New meeting minutes"), "minutes form");
    await p.locator("button", { hasText: "Circulars" }).first().click();
    await clickAdd(p);
    await expectVisible(p, "/oversight[circulars]", p.getByText("New circular / report"), "circular form");
    await p.locator("button", { hasText: "Action tracker" }).first().click();
    await clickAdd(p);
    await expectVisible(p, "/oversight[action]", p.locator('textarea[placeholder="Describe the action required…"]'), "action form");
    // empty-state: wipe all seed rows via overlay, reload, expect message + recovery via +ADD
    await p.evaluate(() => {
      const seedApprovals = ["APV-2025-0089","APV-2025-0088","APV-2025-0085","APV-2025-0081","APV-2025-0077","APV-2025-0073","APV-2025-0068","APV-2025-0060"];
      localStorage.setItem("hawkeye.oversight.overlay.v1", JSON.stringify({ deletedApprovalIds: seedApprovals }));
    });
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForTimeout(600);
    await expectVisible(p, "/oversight[empty-state]", p.getByText("No approval requests on record"), "approvals empty state");
    await clickAdd(p);
    await expectVisible(p, "/oversight[empty-add]", p.getByText("New approval request"), "approval form from empty state");
    if (p.__errors.length) fail("/oversight[phaseB]", p.__errors.join(" | "));
    await p.close();
  }
  // B2 — responsible-ai: nested tab components claim the event
  {
    const p = await newPage();
    await open(p, "/responsible-ai");
    await p.locator("button", { hasText: "Model Registry" }).first().click();
    await clickAdd(p);
    await expectVisible(p, "/responsible-ai[models]", p.getByText("Register new model"), "model form");
    const t1 = await toast(p).textContent().catch(() => null);
    if (t1?.trim() !== "Add form opened") fail("/responsible-ai[models]", `expected 'Add form opened' toast, got ${JSON.stringify(t1)}`);
    await p.locator("button", { hasText: "Incident Log" }).first().click();
    await clickAdd(p);
    await expectVisible(p, "/responsible-ai[incidents]", p.getByText("Log new incident"), "incident form");
    if (p.__errors.length) fail("/responsible-ai[phaseB]", p.__errors.join(" | "));
    await p.close();
  }
  // B3 — direct wirings open their forms / perform their action
  {
    const cases = [
      ["/cnmr", async (p) => expectVisible(p, "/cnmr", p.getByText("New CNMR case"), "cnmr form")],
      ["/policies", async (p) => expectVisible(p, "/policies", p.getByText("New policy"), "policy form")],
      ["/investigation", async (p) => expectVisible(p, "/investigation", p.locator('input[placeholder="Name…"]'), "party form")],
      ["/rmi", async (p) => {
        // +ADD creates a blank smelter and opens it in edit mode, so the name
        // lives in an <input value="New Smelter">, not as text.
        const added = await p.locator("main input").evaluateAll((els) => els.some((e) => e.value === "New Smelter"));
        if (!added) fail("/rmi", "expected blank 'New Smelter' row in edit mode");
      }],
    ];
    for (const [href, check] of cases) {
      const p = await newPage();
      await open(p, href);
      await clickAdd(p);
      await check(p);
      if (p.__errors.length) fail(`${href}[phaseB]`, p.__errors.join(" | "));
      await p.close();
    }
    // client-portal: +ADD appends an individual row
    const p1 = await newPage();
    await open(p1, "/client-portal");
    const before = await p1.locator("main input").count();
    await clickAdd(p1);
    const after = await p1.locator("main input").count();
    if (after <= before) fail("/client-portal", `+ADD did not add fields (before=${before} after=${after})`);
    await p1.close();
    // esg-risk: +ADD pre-fills the sample entity
    const p2 = await newPage();
    await open(p2, "/esg-risk");
    await clickAdd(p2);
    const filled = await p2.locator("main input").evaluateAll((els) => els.some((e) => e.value && e.value.length > 2));
    if (!filled) fail("/esg-risk", "+ADD did not pre-fill sample entity");
    await p2.close();
  }
  // B4 — focus fallback on a form-centric page without onAdd. (/dpmsr moved
  // to the WIRED set when the rail +ADD became its append-transaction action;
  // /benford remains a plain lookup form with no add handler.)
  {
    const p = await newPage();
    await open(p, "/benford");
    await clickAdd(p);
    const t = await toast(p).textContent().catch(() => null);
    if (t?.trim() !== "Jumped to this page's form") fail("/benford", `expected jump toast, got ${JSON.stringify(t)}`);
    const focused = await p.evaluate(() => document.activeElement?.tagName);
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(focused ?? "")) fail("/benford", `expected form field focused, got ${focused}`);
    await p.close();
  }
  // B5 — CSV: table page downloads, non-table page says so
  {
    const p = await newPage();
    await open(p, "/oversight");
    await p.locator("button", { hasText: "Circulars" }).first().click();
    await p.waitForTimeout(300);
    const dl = p.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await barBtn(p, "CSV").click();
    const got = await dl;
    if (!got) fail("/oversight[csv]", "no CSV download event");
    const t = await toast(p).textContent().catch(() => null);
    if (t?.trim() !== "CSV downloaded") fail("/oversight[csv]", `expected 'CSV downloaded' toast, got ${JSON.stringify(t)}`);
    await p.close();
    // /investigation wires the rail CSV button to the evidence-pack export
    // (onCsv handler) — no toast contract; just assert no crash.
    const p2 = await newPage();
    await open(p2, "/investigation");
    await barBtn(p2, "CSV").click();
    await p2.waitForTimeout(500);
    if (p2.__errors.length) fail("/investigation[csv]", `page errors: ${p2.__errors.join(" | ")}`);
    await p2.close();
  }
  // B6 — AI opens the MLRO advisor in a new tab
  {
    const p = await newPage();
    await open(p, "/cnmr");
    const popup = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
    await barBtn(p, "AI").click();
    const np = await popup;
    if (!np || !np.url().includes("/mlro-advisor")) fail("/cnmr[ai]", `AI did not open /mlro-advisor (got ${np?.url()})`);
    await np?.close();
    await p.close();
  }
  // B7 — PDF calls window.print
  {
    const p = await newPage();
    await p.addInitScript(() => { window.print = () => { window.__printed = (window.__printed ?? 0) + 1; }; });
    await open(p, "/cnmr");
    await barBtn(p, "PDF").click();
    await p.waitForTimeout(300);
    const printed = await p.evaluate(() => window.__printed);
    if (!printed) fail("/cnmr[pdf]", "PDF did not invoke window.print()");
    await p.close();
  }
  // B8 — REFRESH reloads; RUN/SYNC with handlers do NOT reload; SYNC shows toast
  {
    const p = await newPage();
    await open(p, "/cnmr");
    await p.evaluate(() => { window.__marker = 1; });
    await barBtn(p, "▷ RUN").click();
    await p.waitForTimeout(800);
    if (await p.evaluate(() => window.__marker) !== 1) fail("/cnmr[run]", "RUN with onRun should not reload");
    await barBtn(p, "↻ SYNC").click();
    await p.waitForTimeout(400);
    const t = await toast(p).textContent().catch(() => null);
    if (t?.trim() !== "Synced ✓") fail("/cnmr[sync]", `expected 'Synced ✓' toast, got ${JSON.stringify(t)}`);
    if (await p.evaluate(() => window.__marker) !== 1) fail("/cnmr[sync]", "SYNC with onSync should not reload");
    const nav = p.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => null);
    await barBtn(p, "↻ REFRESH").click();
    if (!(await nav)) fail("/cnmr[refresh]", "REFRESH did not reload the page");
    await p.waitForTimeout(500);
    if (await p.evaluate(() => window.__marker).catch(() => undefined) === 1) fail("/cnmr[refresh]", "marker survived reload");
    if (p.__errors.length) fail("/cnmr[phaseB8]", p.__errors.join(" | "));
    await p.close();
  }
  // B9 — ASANA posts the module report and reflects the result
  {
    const p = await newPage();
    let posted = null;
    await p.route("**/api/module-report", async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await open(p, "/cnmr");
    await barBtn(p, "ASANA").click();
    await p.waitForTimeout(800);
    if (!posted) fail("/cnmr[asana]", "ASANA did not POST /api/module-report");
    else if (posted.module !== "cnmr") fail("/cnmr[asana]", `posted wrong module: ${JSON.stringify(posted)}`);
    const ok = await p.getByRole("button", { name: "ASANA ✓", exact: true }).count();
    if (!ok) fail("/cnmr[asana]", "button did not show ASANA ✓ after success");
    await p.close();
  }
}

(async () => {
  // PW_EXEC: explicit Chromium binary (sandbox containers pre-install a build
  // that may not match the npm package's pinned revision).
  browser = await chromium.launch(
    process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {},
  );
  ctx = await browser.newContext();
  // Authenticated session for the middleware.ts page gate (HS_COOKIE minted with
  // the same SESSION_SECRET the server was started with).
  if (process.env.HS_COOKIE) {
    await ctx.addCookies([{ name: "hs_session", value: process.env.HS_COOKIE, url: BASE }]);
  }
  // One-time compliance acknowledgement (screening / goAML tools) — the
  // equivalent of the operator accepting the consent interstitial once.
  await ctx.addInitScript(() => {
    localStorage.setItem("hawkeye.compliance.consent.v1", JSON.stringify({ grantedAt: Date.now() }));
  });
  await phaseA();
  await phaseB();
  await browser.close();
  console.log("=== PHASE A outcomes ===");
  for (const r of report) console.log("  " + r);
  console.log(`\n=== RESULT: ${failures.length === 0 ? "ALL PASS" : failures.length + " FAILURE(S)"} ===`);
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(failures.length ? 1 : 0);
})();
