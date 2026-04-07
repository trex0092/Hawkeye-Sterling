#!/usr/bin/env node
/**
 * Asana Task Reconciliation Script — v2
 *
 * Phase 1: DELETE all tasks created on or after 2026-04-06 (cleanup duplicates
 *          created by the reconciliation attempts). This restores each project
 *          to its original pre-reconciliation state.
 *
 * Phase 2: For each project, compare task names against FG BRANCH (reference).
 *          For tasks that share the same code prefix (e.g. MOE-01) but have
 *          different descriptive text, RENAME the target task to match FG BRANCH.
 *          For tasks genuinely missing, CREATE them.
 *
 * Phase 3: Verify all projects have the same count as FG BRANCH.
 *
 * Usage:
 *   export ASANA_TOKEN=1/...
 *   node scripts/reconcile-projects.mjs
 */

const TOKEN = process.env.ASANA_TOKEN;
if (!TOKEN) { console.error("Set ASANA_TOKEN"); process.exit(1); }

const HEADERS = { Authorization: `Bearer ${TOKEN}` };
const BASE = "https://app.asana.com/api/1.0";

const PROJECTS = {
  fg_branch: { gid: "1213908508433868", name: "FG BRANCH" },
  naples:    { gid: "1213908827982041", name: "NAPLES LLC" },
  madison:   { gid: "1213908611350810", name: "MADISON LLC" },
  fgllc:     { gid: "1213909833048586", name: "FG LLC" },
  gramaltin: { gid: "1213908611400789", name: "GRAMALTIN AS" },
  zoefze:    { gid: "1213908828069020", name: "ZOE FZE" },
};

const ASSIGNEE = "1213645083721304";
const WORKSPACE = "1213645083721316";
const DUE_DATE = "2026-10-03";
const CLEANUP_CUTOFF = "2026-04-06T00:00:00.000Z";

// Entity-specific name fragments to skip when comparing across projects
const ENTITY_NAMES = [
  "FINE GOLD", "Fine Gold", "NAPLES", "Naples",
  "MADISON", "Madison", "GRAMALTIN", "Gramaltin",
  "ZOE FZE", "Zoe Fze", "FG LLC", "Fg Llc",
];

async function fetchAllTasks(projectGid) {
  const tasks = [];
  let url = `${BASE}/tasks?project=${projectGid}&opt_fields=name,created_at&limit=100`;
  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    const json = await res.json();
    if (json.data) tasks.push(...json.data);
    url = json.next_page ? json.next_page.uri : null;
  }
  return tasks;
}

async function deleteTask(gid) {
  const res = await fetch(`${BASE}/tasks/${gid}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  return res.ok;
}

async function renameTask(gid, newName) {
  const res = await fetch(`${BASE}/tasks/${gid}`, {
    method: "PUT",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { name: newName } }),
  });
  return res.ok;
}

async function createTask(name, projectGid) {
  const res = await fetch(`${BASE}/tasks`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        name,
        projects: [projectGid],
        assignee: ASSIGNEE,
        workspace: WORKSPACE,
        due_on: DUE_DATE,
      },
    }),
  });
  const json = await res.json();
  return json.data ? json.data.gid : null;
}

/**
 * Extract a normalised code from a task name for matching purposes.
 * Examples:
 *   "🔴 MOE-01 | DPMS Registration and Annual Renewal (Ministry of Economy)"
 *     → "MOE-01"
 *   "MILESTONE | LBMA Audit Complete - Final Report Received"
 *     → "MILESTONE-LBMA Audit Complete"
 *   "CO Annual Report: FINE GOLD BRANCH"
 *     → "CO-ANNUAL" (entity-specific, handled separately)
 */
function extractCode(name) {
  // Strip leading emoji / special chars
  const stripped = name.replace(/^[^A-Za-z[(\u2460-\u24FF]*/u, "").trim();

  // Standard code: "XXX-NN | description"
  const m = stripped.match(/^([A-Z][\w/]+-\d+)\s*\|/);
  if (m) return m[1];

  // Codes like "RF-R05", "NRA-RF01", "FIU-RF01"
  const m2 = stripped.match(/^([A-Z]+-[A-Z]*\d+)\s*\|/);
  if (m2) return m2[1];

  // GAP tasks: "GAP-001", "GAP-002 (Execution)"
  const m3 = stripped.match(/^(GAP-\d+(?:\s*\([^)]+\))?)\s*\|/);
  if (m3) return m3[1];

  // MILESTONE tasks
  if (name.includes("MILESTONE")) {
    const mm = name.match(/MILESTONE\s*\|\s*(\w[\w\s]+?)(?:\s*[-–]|$)/);
    return mm ? "MILESTONE-" + mm[1].trim() : "MILESTONE";
  }

  // TRN tasks
  const m4 = stripped.match(/^(TRN-\d+)\s*\|/);
  if (m4) return m4[1];

  // Special
  if (name.includes("CDD-CRITICAL")) return "CDD-CRITICAL";
  if (name.includes("CO Annual Report")) return "CO-ANNUAL";
  if (name.includes("COMPLIANCE MANUAL")) return "COMPLIANCE-MANUAL";
  if (name.includes("Today's Priorities") || name.includes("📌")) return "PINNED";

  return null;
}

function isEntitySpecific(name) {
  return ENTITY_NAMES.some(e => name.includes(e));
}

async function main() {
  // ===================== PHASE 1: CLEANUP =====================
  console.log("=== PHASE 1: Delete tasks created on/after 2026-04-06 (cleanup) ===\n");

  for (const [key, proj] of Object.entries(PROJECTS)) {
    if (key === "fg_branch") continue;

    const tasks = await fetchAllTasks(proj.gid);
    const toDelete = tasks.filter(t =>
      new Date(t.created_at) >= new Date(CLEANUP_CUTOFF) &&
      !t.name.includes("📌") // never delete the pinned task
    );

    console.log(`${proj.name}: ${tasks.length} tasks, ${toDelete.length} created after cutoff`);
    let deleted = 0;
    for (const t of toDelete) {
      console.log(`  DELETE: ${t.name} (created ${t.created_at})`);
      if (await deleteTask(t.gid)) deleted++;
    }
    console.log(`  Deleted ${deleted} tasks\n`);
  }

  // ===================== PHASE 2: RECONCILE =====================
  console.log("=== PHASE 2: Reconcile each project to match FG BRANCH ===\n");

  // Re-fetch FG BRANCH (reference)
  const refTasks = await fetchAllTasks(PROJECTS.fg_branch.gid);
  console.log(`FG BRANCH reference: ${refTasks.length} tasks\n`);

  // Build reference map: code → task name
  const refByCode = new Map();
  const refByName = new Set();
  for (const t of refTasks) {
    const code = extractCode(t.name);
    if (code) refByCode.set(code, t.name);
    refByName.add(t.name);
  }

  for (const [key, proj] of Object.entries(PROJECTS)) {
    if (key === "fg_branch") continue;

    console.log(`--- ${proj.name} ---`);
    const tasks = await fetchAllTasks(proj.gid);
    console.log(`  Current: ${tasks.length} tasks`);

    // Build target map: code → task
    const targetByCode = new Map();
    const targetByName = new Set();
    for (const t of tasks) {
      const code = extractCode(t.name);
      if (code) targetByCode.set(code, t);
      targetByName.add(t.name);
    }

    let renamed = 0;
    let created = 0;
    let skipped = 0;

    // For each FG BRANCH task
    for (const refTask of refTasks) {
      // Skip entity-specific FG BRANCH tasks
      if (isEntitySpecific(refTask.name)) { skipped++; continue; }

      const refCode = extractCode(refTask.name);
      const refName = refTask.name;

      // Already exists with exact same name
      if (targetByName.has(refName)) continue;

      // Same code exists but different name → rename
      if (refCode && targetByCode.has(refCode)) {
        const existing = targetByCode.get(refCode);
        if (existing.name !== refName && !isEntitySpecific(existing.name)) {
          console.log(`  RENAME: "${existing.name}" → "${refName}"`);
          if (await renameTask(existing.gid, refName)) renamed++;
          continue;
        }
      }

      // No code match found — try fuzzy match by first few words
      // e.g. "🔴 MOE-01 | DPMS Registration" vs "🔴 MOE-01 | DPMS Registration and Annual Renewal (Ministry of Economy)"
      let fuzzyMatched = false;
      if (refCode) {
        for (const t of tasks) {
          const tCode = extractCode(t.name);
          if (tCode === refCode && t.name !== refName && !isEntitySpecific(t.name)) {
            // Already handled above, skip
            fuzzyMatched = true;
            break;
          }
        }
      }
      if (!fuzzyMatched && !refCode) {
        // Try matching by first 20 chars (for tasks without extractable codes)
        const refStart = refName.replace(/^[^\w]*/u, "").substring(0, 20);
        for (const t of tasks) {
          const tStart = t.name.replace(/^[^\w]*/u, "").substring(0, 20);
          if (refStart === tStart && t.name !== refName) {
            console.log(`  RENAME (fuzzy): "${t.name}" → "${refName}"`);
            if (await renameTask(t.gid, refName)) renamed++;
            fuzzyMatched = true;
            break;
          }
        }
      }
      if (fuzzyMatched) continue;

      // Genuinely missing → create
      console.log(`  CREATE: ${refName}`);
      const gid = await createTask(refName, proj.gid);
      if (gid) created++;
    }

    console.log(`  Renamed: ${renamed}, Created: ${created}`);

    // Final count
    const final = await fetchAllTasks(proj.gid);
    console.log(`  Final: ${final.length} tasks\n`);
  }

  // ===================== PHASE 3: VERIFY =====================
  console.log("=== PHASE 3: FINAL COUNTS ===\n");
  for (const [key, proj] of Object.entries(PROJECTS)) {
    const tasks = await fetchAllTasks(proj.gid);
    const status = tasks.length === refTasks.length ? "✓" : "✗";
    console.log(`${status} ${proj.name}: ${tasks.length} tasks`);
  }
}

main().catch(console.error);
