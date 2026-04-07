#!/usr/bin/env node
/**
 * Asana Task Reconciliation Script — v3
 *
 * For each target project, compares against FG BRANCH (reference at 478 tasks).
 * - Tasks matching by exact name: skip (already aligned)
 * - Tasks matching by code prefix but different description: RENAME to FG BRANCH version
 * - Tasks in FG BRANCH but not in target (no code or name match): CREATE
 * - Logs every action and unmatched task for debugging
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

// Entity-specific name fragments — these tasks are unique per project
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
 * Extract a normalised code prefix for matching.
 * Returns null if no code can be extracted.
 */
function extractCode(name) {
  // Strip leading emoji / special chars
  const stripped = name.replace(/^[^\w[(-]*/u, "").trim();

  // Standard codes: "XXX-NN | description" or "XXX-XXNN | description"
  const m = stripped.match(/^([A-Z][\w/]+-[\w]+\d+)\s*\|/);
  if (m) return m[1];

  // GAP tasks: "GAP-001", "GAP-002 (Execution)"
  const m3 = stripped.match(/^(GAP-\d+(?:\s*\([^)]+\))?)\s*\|/);
  if (m3) return m3[1];

  // TRN tasks
  const m4 = stripped.match(/^(TRN-\d+)\s*\|/);
  if (m4) return m4[1];

  return null;
}

function isEntitySpecific(name) {
  return ENTITY_NAMES.some(e => name.includes(e));
}

async function main() {
  console.log("=== Fetching all tasks from all projects ===\n");

  // Fetch reference
  const refTasks = await fetchAllTasks(PROJECTS.fg_branch.gid);
  console.log(`FG BRANCH (reference): ${refTasks.length} tasks\n`);

  // Build reference maps
  const refByCode = new Map();
  const refByName = new Set();
  const refNoCode = []; // Tasks we can't extract a code from

  for (const t of refTasks) {
    refByName.add(t.name);
    const code = extractCode(t.name);
    if (code) {
      refByCode.set(code, t.name);
    } else {
      refNoCode.push(t.name);
    }
  }

  console.log(`  ${refByCode.size} tasks with extractable codes`);
  console.log(`  ${refNoCode.length} tasks without codes:`);
  for (const n of refNoCode) {
    console.log(`    - ${n}`);
  }
  console.log();

  // Process each target project
  for (const [key, proj] of Object.entries(PROJECTS)) {
    if (key === "fg_branch") continue;

    console.log(`\n=== ${proj.name} ===`);
    const tasks = await fetchAllTasks(proj.gid);
    console.log(`  Current: ${tasks.length} tasks`);

    // Build target maps
    const targetByCode = new Map();
    const targetByName = new Set();
    for (const t of tasks) {
      targetByName.add(t.name);
      const code = extractCode(t.name);
      if (code) targetByCode.set(code, t);
    }

    let renamed = 0;
    let created = 0;
    let alreadyMatch = 0;
    let entitySkipped = 0;

    for (const refTask of refTasks) {
      const refName = refTask.name;

      // Skip entity-specific FG BRANCH tasks
      if (isEntitySpecific(refName)) { entitySkipped++; continue; }

      // Already exists with exact same name
      if (targetByName.has(refName)) { alreadyMatch++; continue; }

      const refCode = extractCode(refName);

      // Same code exists but different name → rename
      if (refCode && targetByCode.has(refCode)) {
        const existing = targetByCode.get(refCode);
        if (!isEntitySpecific(existing.name)) {
          console.log(`  RENAME: "${existing.name}" → "${refName}"`);
          if (await renameTask(existing.gid, refName)) {
            renamed++;
            targetByName.add(refName); // Track so we don't create it too
          }
          continue;
        }
      }

      // No code match — try matching first 25 chars (stripped of emoji)
      const refStripped = refName.replace(/^[^\w]*/u, "").substring(0, 25);
      let fuzzyMatched = false;
      for (const t of tasks) {
        if (isEntitySpecific(t.name)) continue;
        if (targetByName.has(t.name) && t.name === refName) continue; // exact match handled above
        const tStripped = t.name.replace(/^[^\w]*/u, "").substring(0, 25);
        if (refStripped === tStripped && t.name !== refName) {
          console.log(`  RENAME (fuzzy): "${t.name}" → "${refName}"`);
          if (await renameTask(t.gid, refName)) {
            renamed++;
            targetByName.add(refName);
          }
          fuzzyMatched = true;
          break;
        }
      }
      if (fuzzyMatched) continue;

      // Genuinely missing → create
      console.log(`  CREATE: ${refName}`);
      const gid = await createTask(refName, proj.gid);
      if (gid) created++;
    }

    console.log(`  Summary: ${alreadyMatch} matched, ${renamed} renamed, ${created} created, ${entitySkipped} entity-specific skipped`);

    // Final count
    const final = await fetchAllTasks(proj.gid);
    console.log(`  Final: ${final.length} tasks`);
  }

  // Final verification
  console.log("\n=== FINAL COUNTS ===\n");
  for (const [key, proj] of Object.entries(PROJECTS)) {
    const tasks = await fetchAllTasks(proj.gid);
    const status = tasks.length === refTasks.length ? "✓" : "✗";
    console.log(`${status} ${proj.name}: ${tasks.length} tasks (target: ${refTasks.length})`);
  }
}

main().catch(console.error);
