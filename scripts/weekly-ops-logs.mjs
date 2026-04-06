/**
 * Weekly Operational Logs — three data-driven artefacts.
 *
 * Runs every Friday at 18:00 Asia/Dubai (14:00 UTC), after the weekly
 * MLRO report and the weekly filings summary. Produces:
 *
 *   1. Weekly Training and Attestation Summary
 *   2. Weekly Dormant File Review Reminder
 *   3. Weekly Escalation Log
 *
 * Pure data-driven. No Claude call.
 */

import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  renderTable,
  classifyTask,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate, isoWeek } from "./history-writer.mjs";
import { notify } from "./notify.mjs";

const env = readCommonEnv({ requireClaude: false });
const { listProjects, listProjectTasks, postComment, findPortfolioPinned } = createAsanaClient(env);
const today = isoDate();
const weekId = isoWeek();

const DORMANT_THRESHOLD_DAYS = 60;

function daysSince(isoStr) {
  if (!isoStr) return null;
  const ms = Date.now() - Date.parse(isoStr);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function buildTrainingSummary({ entries }) {
  const body = `1. PURPOSE

This summary records every task in the Asana base that references AML or CFT training activity for the week ending ${today}. It is produced directly from the task base and is intended to support the MLRO's tracking of attendance and competence.

2. ACTIVITY OBSERVED

Training-related tasks touched this week: ${entries.length}

3. ENTRIES

${entries.length === 0 ? "No training-related tasks were observed in the task base this week." : renderTable(entries, [
  { key: "project", header: "PROGRAMME", max: 30 },
  { key: "task", header: "TASK", max: 42 },
  { key: "assignee", header: "ASSIGNEE", max: 20 },
  { key: "status", header: "STATUS", max: 12 },
])}

4. MLRO ACTION

Reconcile the list above against the firm's internal training log. Any training event not in Asana should be added to the log separately.`;

  return wrapDocument({
    title: "Weekly Training and Attestation Summary",
    subtitle: `Week ${weekId}`,
    reference: `HSV2-WTS-${weekId}`,
    timeOfDay: "18:00",
    coverage: `Week ending ${today}`,
    body,
  });
}

function buildDormantReview({ entries }) {
  const body = `1. PURPOSE

This reminder lists every open Asana task that has had no modification in the last ${DORMANT_THRESHOLD_DAYS} calendar days. A dormant file is not a problem by itself, but it is an item the MLRO should actively review or formally close.

2. POPULATION

Dormant files identified: ${entries.length}

3. ENTRIES

${entries.length === 0 ? "No open tasks have been dormant for more than " + DORMANT_THRESHOLD_DAYS + " days." : renderTable(entries, [
  { key: "project", header: "PROGRAMME", max: 28 },
  { key: "task", header: "TASK", max: 40 },
  { key: "assignee", header: "ASSIGNEE", max: 20 },
  { key: "days", header: "DAYS", max: 6 },
])}

4. MLRO ACTION

For each dormant file above, the MLRO should decide whether to reactivate, reassign or formally close the task. A dormant file left open without a documented reason is precisely the kind of item an MOE inspector flags during a supervisory visit.`;

  return wrapDocument({
    title: "Weekly Dormant File Review Reminder",
    subtitle: `Week ${weekId}`,
    reference: `HSV2-WDR-${weekId}`,
    timeOfDay: "18:00",
    coverage: `Open tasks with no modification in the last ${DORMANT_THRESHOLD_DAYS} days`,
    body,
  });
}

function buildEscalationLog({ entries }) {
  const body = `1. PURPOSE

This log records every task in the Asana base that carries language indicating an escalation to the MLRO during the week. It is a contemporaneous index of escalations for the MLRO's own review and for the weekly MLRO report.

2. ACTIVITY

Escalations identified this week: ${entries.length}

3. ENTRIES

${entries.length === 0 ? "No escalation language was identified in the task base this week." : renderTable(entries, [
  { key: "project", header: "PROGRAMME", max: 28 },
  { key: "task", header: "TASK", max: 40 },
  { key: "assignee", header: "ASSIGNEE", max: 20 },
  { key: "status", header: "STATUS", max: 12 },
])}

4. MLRO ACTION

Confirm that every escalation listed above has been acknowledged in the MLRO's review queue, and that the corresponding disposition is recorded on the Asana task.`;

  return wrapDocument({
    title: "Weekly Escalation Log",
    subtitle: `Week ${weekId}`,
    reference: `HSV2-WEL-${weekId}`,
    timeOfDay: "18:00",
    coverage: `Week ending ${today}`,
    body,
  });
}

async function main() {
  console.log(`▶  Weekly Operational Logs — ${new Date().toISOString()}`);
  console.log(`   week: ${weekId}`);
  if (env.DRY_RUN) console.log("   DRY RUN");

  const projects = await listProjects();

  const training = [];
  const dormant = [];
  const escalation = [];

  for (const project of projects) {
    try {
      const tasks = await listProjectTasks(project.gid, { completed_since: "now" });
      for (const task of tasks) {
        const cls = classifyTask(task);
        const base = {
          project: project.name,
          task: task.name,
          assignee: task.assignee?.name ?? "",
          status: task.completed ? "completed" : "open",
        };
        if (cls.training > 0) training.push(base);
        if (cls.escalation > 0) escalation.push(base);

        const days = daysSince(task.modified_at ?? task.created_at);
        if (!task.completed && Number.isFinite(days) && days >= DORMANT_THRESHOLD_DAYS) {
          dormant.push({ ...base, days });
        }
      }
    } catch (err) {
      console.warn(`  ⚠  ${project.name}: ${err.message}`);
    }
  }

  console.log(`\nTraining: ${training.length}, Dormant: ${dormant.length}, Escalations: ${escalation.length}`);

  const trainingDoc = buildTrainingSummary({ entries: training });
  const dormantDoc = buildDormantReview({ entries: dormant });
  const escalationDoc = buildEscalationLog({ entries: escalation });

  await tryArchive(() => writeHistory(path.join("weekly-ops", `${weekId}-training-summary.txt`), trainingDoc), "training-summary");
  await tryArchive(() => writeHistory(path.join("weekly-ops", `${weekId}-dormant-review.txt`), dormantDoc), "dormant-review");
  await tryArchive(() => writeHistory(path.join("weekly-ops", `${weekId}-escalation-log.txt`), escalationDoc), "escalation-log");

  const portfolio = await findPortfolioPinned(projects);
  if (portfolio && !env.DRY_RUN) {
    const combined = `${trainingDoc}\n\n${dormantDoc}\n\n${escalationDoc}`;
    await postComment(portfolio.taskGid, combined);
    console.log(`\n✓ posted to "${portfolio.projectName}"`);
  }

  if (!env.DRY_RUN) {
    await notify({
      subject: `HSV2 / Weekly Operational Logs — ${weekId}`,
      body: `Weekly operational logs produced for week ${weekId}.\n\nTraining: ${training.length} entries\nDormant files: ${dormant.length}\nEscalations: ${escalation.length}\n\nArchived to history/weekly-ops/.`,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
