#!/usr/bin/env node
/**
 * Asana Task Reconciliation Script
 *
 * Makes all 6 compliance programme projects have exactly the same tasks
 * as the reference project (FG BRANCH).
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
  fg_branch:  { gid: "1213908508433868", name: "FG BRANCH" },
  naples:     { gid: "1213908827982041", name: "NAPLES LLC" },
  madison:    { gid: "1213908611350810", name: "MADISON LLC" },
  fgllc:      { gid: "1213909833048586", name: "FG LLC" },
  gramaltin:  { gid: "1213908611400789", name: "GRAMALTIN AS" },
  zoefze:     { gid: "1213908828069020", name: "ZOE FZE" },
};

const ASSIGNEE = "1213645083721304"; // Luisa Fernanda
const WORKSPACE = "1213645083721316";
const DUE_DATE = "2026-10-03";

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

function getCodePrefix(name) {
  // Extract code prefix like "GRP-01", "MOE-01", "OPS-01", "RF-R05", etc.
  // Handle emoji prefixes
  const cleaned = name.replace(/^[^\w[(-]*/u, "").trim();
  const match = cleaned.match(/^([A-Z][\w-]+(?:\s*\d+)?)\s*\|/);
  if (match) return match[1].trim();
  // MILESTONE tasks
  if (name.includes("MILESTONE")) {
    const m = name.match(/MILESTONE\s*\|\s*(.+)/);
    return m ? `MILESTONE|${m[1].split(/\s*[-–]\s*/)[0].trim()}` : null;
  }
  // Special tasks
  if (name.includes("CDD-CRITICAL")) return "CDD-CRITICAL";
  if (name.includes("CO Annual Report")) return "CO-ANNUAL";
  if (name.includes("COMPLIANCE MANUAL")) return "COMPLIANCE-MANUAL";
  if (name.includes("Today's Priorities")) return "PINNED";
  return null;
}

async function deleteTask(gid) {
  const res = await fetch(`${BASE}/tasks/${gid}`, {
    method: "DELETE",
    headers: HEADERS,
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

async function main() {
  console.log("=== Fetching all tasks from all 6 projects ===\n");

  const allTasks = {};
  for (const [key, proj] of Object.entries(PROJECTS)) {
    const tasks = await fetchAllTasks(proj.gid);
    allTasks[key] = tasks;
    console.log(`${proj.name}: ${tasks.length} tasks`);
  }

  const ref = allTasks.fg_branch;
  const refByName = new Map(ref.map(t => [t.name, t]));
  console.log(`\nReference: FG BRANCH with ${ref.length} tasks\n`);

  // Process each target project
  for (const [key, proj] of Object.entries(PROJECTS)) {
    if (key === "fg_branch") continue;

    console.log(`\n=== Processing ${proj.name} ===`);
    const tasks = allTasks[key];
    const targetByName = new Map(tasks.map(t => [t.name, t]));

    // Step 1: Find tasks with same code prefix but different names (duplicates from our creation)
    const targetByCode = new Map();
    for (const t of tasks) {
      const code = getCodePrefix(t.name);
      if (!code) continue;
      if (!targetByCode.has(code)) targetByCode.set(code, []);
      targetByCode.get(code).push(t);
    }

    let deleted = 0;
    for (const [code, group] of targetByCode) {
      if (group.length <= 1) continue;
      // Sort by created_at - keep newest (FG BRANCH style), delete oldest
      group.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      for (let i = 1; i < group.length; i++) {
        console.log(`  DELETE (old dupe): ${group[i].name} [${group[i].gid}]`);
        if (await deleteTask(group[i].gid)) deleted++;
      }
    }
    console.log(`  Deleted ${deleted} old duplicates`);

    // Re-fetch after deletions
    const updatedTasks = await fetchAllTasks(proj.gid);
    const updatedByName = new Map(updatedTasks.map(t => [t.name, t]));

    // Step 2: Find tasks in FG BRANCH not in this project (by exact name)
    let created = 0;
    for (const [name] of refByName) {
      // Skip entity-specific FG BRANCH tasks
      if (name.includes("FINE GOLD") || name.includes("Fine Gold")) continue;
      if (!updatedByName.has(name)) {
        console.log(`  CREATE: ${name}`);
        const gid = await createTask(name, proj.gid);
        if (gid) created++;
      }
    }
    console.log(`  Created ${created} missing tasks`);

    // Final count
    const finalTasks = await fetchAllTasks(proj.gid);
    console.log(`  Final count: ${finalTasks.length} tasks`);
  }

  // Final verification
  console.log("\n=== FINAL COUNTS ===");
  for (const [key, proj] of Object.entries(PROJECTS)) {
    const tasks = await fetchAllTasks(proj.gid);
    console.log(`${proj.name}: ${tasks.length} tasks`);
  }
}

main().catch(console.error);
