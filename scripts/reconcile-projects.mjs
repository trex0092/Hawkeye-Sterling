#!/usr/bin/env node
/**
 * Asana Task Reconciliation Script — v4
 *
 * Makes all 5 target projects have exactly the same number of tasks
 * as FG BRANCH (reference). For each FG BRANCH task:
 *   1. If exact name exists in target → skip
 *   2. If same code prefix exists (unused) → rename to FG BRANCH version
 *   3. If fuzzy match by first 25 chars (unused) → rename
 *   4. Otherwise → create the task
 *
 * Tracks which target tasks have been "consumed" to prevent many-to-one matching.
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

function extractCode(name) {
  let stripped = name.replace(/^[^\w[(-]*/u, "").trim();
  stripped = stripped.replace(/^\[(Critical|High|Medium)\]\s*/i, "").trim();

  const m = stripped.match(/^([A-Z][\w/]+-[\w]+\d+)\s*\|/);
  if (m) return m[1];

  const m2 = stripped.match(/^([A-Z]-\d+)\s*\|/);
  if (m2) return m2[1];

  const m3 = stripped.match(/^(GAP-[\d/]+(?:\s*\([^)]+\))?)\s*\|/);
  if (m3) return m3[1];

  const m4 = stripped.match(/^(TRN-\d+)\s*\|/);
  if (m4) return m4[1];

  if (stripped.startsWith("MILESTONE")) {
    const mm = stripped.match(/MILESTONE\s*\|\s*(.+)/);
    if (mm) {
      const key = mm[1].replace(/\s*[-–].+$/, "").trim();
      return "MILESTONE|" + key;
    }
  }

  if (name.includes("CDD-CRITICAL")) return "CDD-CRITICAL";
  if (name.includes("Today's Priorities") || name.includes("📌")) return "PINNED";

  return null;
}

function fuzzyKey(name) {
  return name.replace(/^[^\w]*/u, "").substring(0, 25);
}

function isEntitySpecific(name) {
  return ENTITY_NAMES.some(e => name.includes(e));
}

async function main() {
  console.log("=== Fetching FG BRANCH (reference) ===\n");
  const refTasks = await fetchAllTasks(PROJECTS.fg_branch.gid);
  console.log(`FG BRANCH: ${refTasks.length} tasks\n`);

  for (const [key, proj] of Object.entries(PROJECTS)) {
    if (key === "fg_branch") continue;

    console.log(`\n=== ${proj.name} ===`);
    const tasks = await fetchAllTasks(proj.gid);
    console.log(`  Current: ${tasks.length} tasks, need: ${refTasks.length}`);
    const gap = refTasks.length - tasks.length;
    if (gap <= 0) {
      console.log(`  Already at or above target. Skipping.`);
      continue;
    }
    console.log(`  Gap: ${gap} tasks to add\n`);

    // Build target lookup — track which tasks are "consumed" (matched to a ref task)
    const consumed = new Set(); // GIDs of target tasks already matched
    const targetByName = new Map(); // name → task
    const targetByCode = new Map(); // code → [tasks]
    const targetByFuzzy = new Map(); // fuzzyKey → [tasks]

    for (const t of tasks) {
      targetByName.set(t.name, t);
      const code = extractCode(t.name);
      if (code) {
        if (!targetByCode.has(code)) targetByCode.set(code, []);
        targetByCode.get(code).push(t);
      }
      const fk = fuzzyKey(t.name);
      if (!targetByFuzzy.has(fk)) targetByFuzzy.set(fk, []);
      targetByFuzzy.get(fk).push(t);
    }

    let renamed = 0;
    let created = 0;
    let matched = 0;
    let entitySkipped = 0;

    for (const refTask of refTasks) {
      const refName = refTask.name;

      // Skip entity-specific FG BRANCH tasks
      if (isEntitySpecific(refName)) { entitySkipped++; continue; }

      // 1. Exact name match
      if (targetByName.has(refName)) {
        const t = targetByName.get(refName);
        if (!consumed.has(t.gid)) {
          consumed.add(t.gid);
          matched++;
          continue;
        }
        // If already consumed, this is a duplicate in FG BRANCH — fall through to create
      }

      // 2. Code prefix match (find unconsumed target task with same code)
      const refCode = extractCode(refName);
      if (refCode && targetByCode.has(refCode)) {
        const candidates = targetByCode.get(refCode).filter(t => !consumed.has(t.gid));
        if (candidates.length > 0) {
          const existing = candidates[0];
          if (existing.name !== refName && !isEntitySpecific(existing.name)) {
            console.log(`  RENAME: "${existing.name}" → "${refName}"`);
            await renameTask(existing.gid, refName);
            renamed++;
          } else {
            matched++;
          }
          consumed.add(existing.gid);
          continue;
        }
      }

      // 3. Fuzzy match (first 25 chars, unconsumed)
      const refFuzzy = fuzzyKey(refName);
      if (targetByFuzzy.has(refFuzzy)) {
        const candidates = targetByFuzzy.get(refFuzzy).filter(t => !consumed.has(t.gid));
        if (candidates.length > 0) {
          const existing = candidates[0];
          if (existing.name !== refName && !isEntitySpecific(existing.name)) {
            console.log(`  RENAME (fuzzy): "${existing.name}" → "${refName}"`);
            await renameTask(existing.gid, refName);
            renamed++;
          } else {
            matched++;
          }
          consumed.add(existing.gid);
          continue;
        }
      }

      // 4. No match found → create
      console.log(`  CREATE: ${refName}`);
      const gid = await createTask(refName, proj.gid);
      if (gid) created++;
    }

    console.log(`\n  Summary: ${matched} matched, ${renamed} renamed, ${created} created, ${entitySkipped} entity-skipped`);
    const finalTasks = await fetchAllTasks(proj.gid);
    console.log(`  Final: ${finalTasks.length} tasks (target: ${refTasks.length})\n`);
  }

  // Final verification
  console.log("\n=== FINAL COUNTS ===\n");
  for (const [key, proj] of Object.entries(PROJECTS)) {
    const tasks = await fetchAllTasks(proj.gid);
    const status = tasks.length === refTasks.length ? "✓" : "✗";
    console.log(`${status} ${proj.name}: ${tasks.length} (target: ${refTasks.length})`);
  }
}

main().catch(console.error);
