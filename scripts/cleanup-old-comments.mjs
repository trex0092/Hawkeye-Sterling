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
    const taskParams = new URLSearchParams({
      project: project.gid,
      limit: "100",
      opt_fields: "gid,name",
    });
    const taskPage = await asana(`/tasks?${taskParams}`);
    const pinned = taskPage.data.find((t) => t.name.trim() === PINNED_TASK_NAME.trim());
    if (!pinned) continue;

    console.log(`\n▶ ${project.name} → pinned task ${pinned.gid}`);

    const storiesParams = new URLSearchParams({
      limit: "100",
      opt_fields: "gid,text,type,resource_subtype,created_by.name",
    });
    let storyOffset;
    const toDelete = [];
    do {
      if (storyOffset) storiesParams.set("offset", storyOffset);
      const page = await asana(`/tasks/${pinned.gid}/stories?${storiesParams}`);
      for (const story of page.data) {
        if (story.resource_subtype !== "comment_added") continue;
        const text = story.text ?? "";
        if (
          text.startsWith("HSV2 /") ||
          text.startsWith("HSV2 / Daily") ||
          text.startsWith("HSV2 / Task Compliance") ||
          text.includes("hawkeye-sterling") ||
          text.includes("compliance-pack") ||
          text.includes("For review by the MLRO")
        ) {
          toDelete.push({ gid: story.gid, preview: text.slice(0, 80) });
        }
      }
      storyOffset = page.next_page?.offset;
    } while (storyOffset);

    console.log(`  automation comments found: ${toDelete.length}`);

    for (const story of toDelete) {
      if (isDryRun) {
        console.log(`  (dry) would delete story ${story.gid}: ${story.preview}`);
      } else {
        try {
          await asana(`/stories/${story.gid}`, { method: "DELETE" });
          console.log(`  ✓ deleted ${story.gid}`);
          totalDeleted++;
        } catch (err) {
          console.warn(`  ⚠  delete failed for ${story.gid}: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  console.log(`\n✓ done. deleted=${totalDeleted}`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
