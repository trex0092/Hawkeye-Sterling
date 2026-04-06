/**
 * One-time cleanup: delete all automation comments from pinned tasks.
 *
 * Walks every project, finds the pinned task, reads its stories
 * (comments), and deletes every comment that starts with "HSV2 /".
 * This resets the pinned tasks to a clean state so the automation
 * starts fresh from today.
 *
 * Run manually: DRY_RUN=false node cleanup-old-comments.mjs
 * Dry run:      DRY_RUN=true  node cleanup-old-comments.mjs
 */

const {
  ASANA_TOKEN,
  ASANA_WORKSPACE_ID,
  ASANA_TEAM_ID,
  PINNED_TASK_NAME = "📌 Today's Priorities",
  DRY_RUN = "true",
} = process.env;

if (!ASANA_TOKEN || !ASANA_WORKSPACE_ID) {
  console.error("❌ Missing ASANA_TOKEN or ASANA_WORKSPACE_ID");
  process.exit(1);
}

const isDryRun = DRY_RUN === "true";

async function asana(reqPath, init = {}) {
  const res = await fetch(`https://app.asana.com/api/1.0${reqPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ASANA_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asana ${res.status} on ${reqPath}: ${body}`);
  }
  return res.json();
}

async function main() {
  console.log("▶ Cleanup old automation comments");
  if (isDryRun) console.log("  DRY RUN — nothing will be deleted");

  const params = new URLSearchParams({
    workspace: ASANA_WORKSPACE_ID,
    archived: "false",
    limit: "100",
    opt_fields: "gid,name",
  });
  if (ASANA_TEAM_ID) params.set("team", ASANA_TEAM_ID);

  const projects = [];
  let offset;
  do {
    if (offset) params.set("offset", offset);
    const page = await asana(`/projects?${params}`);
    projects.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset);

  console.log(`  projects: ${projects.length}`);
  let totalDeleted = 0;

  for (const project of projects) {
    // List ALL tasks in this project (not just pinned) so we also
    // clean up task-pack comments uploaded to every task.
    const allTasks = [];
    const taskParams = new URLSearchParams({
      project: project.gid,
      limit: "100",
      opt_fields: "gid,name,completed",
    });
    let taskOffset;
    do {
      if (taskOffset) taskParams.set("offset", taskOffset);
      const taskPage = await asana(`/tasks?${taskParams}`);
      allTasks.push(...taskPage.data);
      taskOffset = taskPage.next_page?.offset;
    } while (taskOffset);

    const openTasks = allTasks.filter((t) => !t.completed);
    console.log(`\n▶ ${project.name} — ${openTasks.length} open tasks`);

    for (const task of openTasks) {
    const storiesParams = new URLSearchParams({
      limit: "100",
      opt_fields: "gid,text,type,resource_subtype,created_by.name",
    });
    let storyOffset;
    const toDelete = [];
    do {
      if (storyOffset) storiesParams.set("offset", storyOffset);
      const page = await asana(`/tasks/${task.gid}/stories?${storiesParams}`);
      for (const story of page.data) {
        if (story.resource_subtype !== "comment_added") continue;
        const text = story.text ?? "";
        // Match ALL automation-generated comments broadly.
        // The MLRO wants a clean slate — delete anything the automation posted.
        if (
          text.startsWith("HSV2") ||
          text.startsWith("====") ||
          text.includes("HSV2") ||
          text.includes("For review by the MLRO") ||
          text.includes("compliance function") ||
          text.includes("Document reference:") ||
          text.includes("Federal Decree-Law") ||
          text.includes("compliance-pack") ||
          text.includes("hawkeye-sterling") ||
          text.includes("Today's Priorities") ||
          text.includes("Compliance Priorities") ||
          text.includes("Portfolio Digest") ||
          text.includes("Task Compliance Pack") ||
          text.includes("Sanctions Screening") ||
          text.includes("Regulatory Update") ||
          text.includes("CDD Refresh") ||
          text.includes("Deadline Calendar") ||
          text.includes("Retention period:")
        ) {
          toDelete.push({ gid: story.gid, preview: text.slice(0, 80) });
        }
      }
      storyOffset = page.next_page?.offset;
    } while (storyOffset);

    if (toDelete.length > 0) {
      console.log(`    ${task.name.slice(0, 50)}: ${toDelete.length} automation comment(s)`);
    }

    for (const story of toDelete) {
      if (isDryRun) {
        console.log(`    (dry) would delete story ${story.gid}: ${story.preview}`);
      } else {
        try {
          await asana(`/stories/${story.gid}`, { method: "DELETE" });
          totalDeleted++;
        } catch (err) {
          console.warn(`    ⚠  delete failed for ${story.gid}: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    } // end task loop
  } // end project loop

  console.log(`\n✓ done. deleted=${totalDeleted}`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
