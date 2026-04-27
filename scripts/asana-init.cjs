#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// asana-init.cjs — Hawkeye Sterling one-time Asana setup
//
// What it does:
//   1. Fetches all projects from your Asana workspace
//   2. Matches each project by name to the right Hawkeye module
//   3. Creates the correct workflow sections in each project
//   4. Outputs the exact env vars to paste into Netlify
//
// Usage:
//   ASANA_TOKEN=your_token node scripts/asana-init.cjs
//
//   Get your personal access token at:
//   https://app.asana.com/0/my-apps → "Personal access tokens" → + Create token
// ─────────────────────────────────────────────────────────────────────────────

const WORKSPACE_GID = "1213645083721316";
const API           = "https://app.asana.com/api/1.0";

const token = process.env.ASANA_TOKEN;
if (!token) {
  console.error("\n❌  ASANA_TOKEN is not set.\n");
  console.error("    Run:  ASANA_TOKEN=your_token node scripts/asana-init.cjs\n");
  console.error("    Get a token at: https://app.asana.com/0/my-apps\n");
  process.exit(1);
}

// ── Project name → env var + module label mapping ──────────────────────────
// The script matches your actual Asana project names (substring match,
// case-insensitive) to the correct env var.
const PROJECT_MAP = [
  {
    match:   ["01", "screening", "sanctions", "watchlist"],
    envVar:  "ASANA_SCREENING_PROJECT_GID",
    label:   "01 · Screening — Sanctions & Watchlists",
    modules: ["Screening", "Ongoing Monitor", "Batch Screen"],
    sections: [
      "📥 New Screens",
      "🔍 Under Review",
      "⚠️  Hit — Escalated to MLRO",
      "✅ Cleared",
      "🗄️  Closed",
    ],
  },
  {
    match:   ["02", "mlro", "daily", "central"],
    envVar:  "ASANA_MLRO_DAILY_PROJECT_GID",
    label:   "02 · Central MLRO Daily Dashboard",
    modules: ["Daily Monitoring"],
    sections: [
      "📥 Today's Queue",
      "🔍 In Progress",
      "📋 Pending Sign-off",
      "✅ Completed",
    ],
  },
  {
    match:   ["05", "str", "sar", "ctr", "pmr"],
    envVar:  "ASANA_SAR_PROJECT_GID",
    label:   "05 · STR/SAR/CTR/PMR",
    modules: ["STR Cases"],
    sections: [
      "📥 New Reports",
      "✏️  Draft",
      "🔍 MLRO Review",
      "📤 Filed to goAML",
      "✅ Closed",
    ],
  },
  {
    match:   ["06", "ffr", "incident", "asset", "freeze"],
    envVar:  "ASANA_FFR_PROJECT_GID",
    label:   "06 · FFR Incidents & Asset Freeze",
    modules: ["Benford Analysis"],
    sections: [
      "📥 New Forensic Reports",
      "🔍 Under Investigation",
      "❄️  Freeze Request Sent",
      "✅ Resolved",
      "🗄️  Closed",
    ],
  },
  {
    match:   ["07", "cdd", "edd", "kyc", "sdd"],
    envVar:  "ASANA_KYC_PROJECT_GID",
    label:   "07 · CDD/SDD/EDD/KYC",
    modules: ["GLEIF / LEI", "Domain Intel", "Crypto Risk"],
    sections: [
      "📥 New Due Diligence",
      "📄 Pending Documents",
      "🔍 Under Review",
      "✅ Approved",
      "❌ Rejected",
      "🗄️  Closed",
    ],
  },
  {
    match:   ["08", "transaction", "monitoring", "tm"],
    envVar:  "ASANA_TM_PROJECT_GID",
    label:   "08 · Transaction Monitoring",
    modules: ["Transaction Monitor"],
    sections: [
      "📥 New Alerts",
      "🔍 Under Review",
      "⚠️  Escalated to MLRO",
      "📤 SAR Filed",
      "✅ Cleared",
    ],
  },
  {
    match:   ["10", "shipment", "tracking", "bullion", "cargo"],
    envVar:  "ASANA_SHIPMENTS_PROJECT_GID",
    label:   "10 · Shipments — Tracking",
    modules: ["Shipments"],
    sections: [
      "📥 New Consignments",
      "🔍 AML Screen Required",
      "✈️  In Transit",
      "🏦 At Vault",
      "🚨 Held — Review Required",
      "✅ Cleared & Delivered",
    ],
  },
  {
    match:   ["15", "mlro workbench", "workbench"],
    envVar:  "ASANA_MLRO_PROJECT_GID",
    label:   "15 · MLRO Workbench",
    modules: ["MLRO Advisor", "Investigation"],
    sections: [
      "📥 New Tasks",
      "🔍 In Progress",
      "⏳ Pending Decision",
      "✅ Approved",
      "🔄 Returned for Revision",
    ],
  },
  {
    match:   ["16", "supply chain", "esg", "trade"],
    envVar:  "ASANA_SUPPLYCHAIN_PROJECT_GID",
    label:   "16 · Supply Chain, ESG & Trade",
    modules: ["Vessel Check"],
    sections: [
      "📥 New Checks",
      "🔍 Under Review",
      "🚨 Sanctions Hit",
      "✅ Cleared",
    ],
  },
];

// ── API helpers ────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} on ${path}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.data;
}

function nameMatches(projectName, keywords) {
  const lower = projectName.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

// ── Sections ───────────────────────────────────────────────────────────────

async function getExistingSections(projectGid) {
  const sections = await api(`/projects/${projectGid}/sections`);
  return sections.map((s) => s.name.toLowerCase().trim());
}

async function createSection(projectGid, name) {
  await api(`/projects/${projectGid}/sections`, {
    method: "POST",
    body: JSON.stringify({ data: { name } }),
  });
}

async function setupSections(projectGid, sections, projectLabel) {
  let existing;
  try {
    existing = await getExistingSections(projectGid);
  } catch {
    console.log(`    ⚠  Could not fetch sections — skipping`);
    return;
  }

  let created = 0;
  let skipped = 0;
  for (const section of sections) {
    const clean = section.replace(/^[^\w]+/, "").toLowerCase().trim();
    const alreadyExists = existing.some(
      (e) => e.includes(clean) || clean.includes(e.replace(/^[^\w]+/, "").toLowerCase().trim()),
    );
    if (alreadyExists) {
      skipped++;
      continue;
    }
    try {
      await createSection(projectGid, section);
      created++;
    } catch (err) {
      console.log(`    ⚠  Failed to create section "${section}": ${err.message}`);
    }
  }
  if (created > 0) console.log(`    ✓  Created ${created} sections (${skipped} already existed)`);
  else console.log(`    ✓  All sections already exist`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const BOLD  = "\x1b[1m";
  const GREEN = "\x1b[32m";
  const CYAN  = "\x1b[36m";
  const DIM   = "\x1b[2m";
  const RESET = "\x1b[0m";

  console.log(`\n${BOLD}Hawkeye Sterling · Asana Setup${RESET}`);
  console.log(`${"─".repeat(54)}\n`);

  // 1. Verify token
  console.log("1/3  Connecting to Asana…");
  let me;
  try {
    me = await api("/users/me");
  } catch (err) {
    console.error(`\n❌  Cannot reach Asana: ${err.message}\n`);
    process.exit(1);
  }
  console.log(`     ✓  Authenticated as ${me.name} (${me.email})\n`);

  // 2. Fetch all projects in workspace
  console.log("2/3  Fetching workspace projects…");
  let projects;
  try {
    projects = await api(`/workspaces/${WORKSPACE_GID}/projects?limit=100`);
  } catch (err) {
    console.error(`\n❌  Failed to fetch projects: ${err.message}\n`);
    process.exit(1);
  }
  console.log(`     ✓  Found ${projects.length} projects in workspace\n`);

  // 3. Match projects and set up sections
  console.log("3/3  Matching projects and creating workflow sections…\n");

  const results = [];
  const unmatched = [];

  for (const mapping of PROJECT_MAP) {
    const found = projects.find((p) => nameMatches(p.name, mapping.match));
    if (!found) {
      unmatched.push(mapping);
      results.push({ ...mapping, gid: null, projectName: null });
      continue;
    }

    console.log(`  ${CYAN}${found.name}${RESET}`);
    console.log(`  ${DIM}GID: ${found.gid}${RESET}`);
    console.log(`  Modules: ${mapping.modules.join(", ")}`);
    await setupSections(found.gid, mapping.sections, found.name);
    console.log();

    results.push({ ...mapping, gid: found.gid, projectName: found.name });
  }

  // ── Output Netlify env vars ─────────────────────────────────────────────
  console.log(`\n${"─".repeat(54)}`);
  console.log(`${BOLD}Netlify Environment Variables${RESET}`);
  console.log(`${"─".repeat(54)}`);
  console.log(`${DIM}Netlify → hawkeye-sterling → Site configuration → Environment variables → Add variable${RESET}\n`);

  const matched = results.filter((r) => r.gid);
  const missing = results.filter((r) => !r.gid);

  for (const r of matched) {
    console.log(`  ${GREEN}${r.envVar}${RESET}`);
    console.log(`  ${r.gid}`);
    console.log(`  ${DIM}→ ${r.label}${RESET}\n`);
  }

  if (missing.length > 0) {
    console.log(`\n${"─".repeat(54)}`);
    console.log(`${BOLD}⚠  Projects not found in workspace:${RESET}\n`);
    for (const r of missing) {
      console.log(`  ${r.label}`);
      console.log(`  ${DIM}Expected keywords: ${r.match.join(", ")}${RESET}\n`);
    }
    console.log(`  These modules will fall back to Master Inbox until the`);
    console.log(`  env vars are set.\n`);
  }

  // ── Also output the always-needed vars ─────────────────────────────────
  console.log(`${"─".repeat(54)}`);
  console.log(`${BOLD}Other required env vars (if not already set):${RESET}\n`);
  console.log(`  ASANA_TOKEN`);
  console.log(`  ${DIM}Your Asana personal access token (already working ✓)${RESET}\n`);
  console.log(`  ASANA_WORKSPACE_GID`);
  console.log(`  ${WORKSPACE_GID}${RESET}\n`);
  console.log(`  ASANA_ASSIGNEE_GID`);
  console.log(`  ${DIM}GID of the MLRO who should be assigned tasks${RESET}`);
  console.log(`  ${DIM}(current default: 1213645083721304 — Luisa Fernanda)${RESET}\n`);

  console.log(`${"─".repeat(54)}`);
  if (matched.length === PROJECT_MAP.length) {
    console.log(`\n${GREEN}${BOLD}✓  All ${matched.length} projects matched and configured.${RESET}\n`);
  } else {
    console.log(`\n${BOLD}${matched.length}/${PROJECT_MAP.length} projects matched.${RESET}`);
    console.log(`Modules without a matched project use Master Inbox as fallback.\n`);
  }
}

main().catch((err) => {
  console.error("\n❌  Unexpected error:", err.message, "\n");
  process.exit(1);
});
