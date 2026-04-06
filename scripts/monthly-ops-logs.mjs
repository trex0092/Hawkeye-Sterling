/**
 * Monthly Operational Logs — two data-driven artefacts.
 *
 * Runs on the first business day of each month at 10:00 Asia/Dubai
 * (06:00 UTC). Produces:
 *
 *   1. Monthly CDD Refresh Reminder
 *   2. Monthly Enhanced Due Diligence Case Tracker
 *
 * Pure data-driven. No Claude call. The scripts walk the Asana task
 * base and the counterparty register for CDD-related and EDD-related
 * signals and assemble the reminders as text tables.
 */

import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  renderTable,
  readCounterpartyRegister,
  classifyTask,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";
import { notify } from "./notify.mjs";

const env = readCommonEnv({ requireClaude: false });
const { listProjects, listProjectTasks, postComment, findPortfolioPinned } = createAsanaClient(env);
const today = isoDate();
const yearMonth = today.slice(0, 7);

function buildCddReminder({ entries }) {
  const body = `1. PURPOSE

This reminder lists every task in the Asana base that carries language consistent with an outstanding Customer Due Diligence refresh, a CDD exemption dispute or a CDD procedure gap as at the start of ${yearMonth}. It is produced directly from the task base.

2. ENTRIES

${entries.length === 0 ? "No CDD-related items were identified in the task base." : renderTable(entries, [
  { key: "project", header: "PROGRAMME", max: 30 },
  { key: "task", header: "TASK", max: 42 },
  { key: "assignee", header: "ASSIGNEE", max: 20 },
])}

3. MLRO ACTION

Reconcile this list against the firm's internal customer file index. Any customer due for a CDD refresh in ${yearMonth} that is not reflected above should be added as an Asana task so the refresh is tracked.`;

  return wrapDocument({
    title: "Monthly CDD Refresh Reminder",
    subtitle: `Month ${yearMonth}`,
    reference: `HSV2-CDD-${yearMonth}`,
    timeOfDay: "10:00",
    coverage: `Open tasks with CDD-related language`,
    body,
  });
}

function buildEddTracker({ registerRows, pepEntries }) {
  const edd = registerRows.filter((r) => r.status === "under_review" || r.status === "escalated" || r.risk_rating === "critical");

  const body = `1. PURPOSE

This tracker lists every counterparty currently on the firm's Enhanced Due Diligence pathway, drawn from two sources: the cross-entity counterparty register and the Asana tasks tagged with PEP language. It supports the MLRO's monthly review of the EDD population.

2. POPULATION

Counterparty register entries on EDD pathway: ${edd.length}
PEP-tagged Asana tasks touched recently:      ${pepEntries.length}

3. COUNTERPARTIES UNDER EDD

${edd.length === 0 ? "No counterparties are currently on the EDD pathway in the register." : renderTable(edd, [
  { key: "counterparty_name", header: "COUNTERPARTY", max: 32 },
  { key: "jurisdiction", header: "JURISDICTION", max: 18 },
  { key: "risk_rating", header: "RATING", max: 10 },
  { key: "entities_touching", header: "ENTITIES", max: 30 },
])}

4. PEP FILES CURRENTLY TRACKED IN THE ASANA TASK BASE

${pepEntries.length === 0 ? "No PEP-tagged tasks were identified in the task base." : renderTable(pepEntries, [
  { key: "project", header: "PROGRAMME", max: 30 },
  { key: "task", header: "FILE", max: 42 },
  { key: "assignee", header: "ASSIGNEE", max: 20 },
])}

5. MLRO ACTION

For each entry above, confirm that the current EDD file is up to date, that the next review date is recorded in the firm's internal procedure log, and that any open question is assigned to a named reviewer.`;

  return wrapDocument({
    title: "Monthly EDD Case Tracker",
    subtitle: `Month ${yearMonth}`,
    reference: `HSV2-EDD-${yearMonth}`,
    timeOfDay: "10:00",
    coverage: `Counterparty register + Asana PEP-tagged tasks`,
    body,
  });
}

async function main() {
  console.log(`▶  Monthly Operational Logs — ${new Date().toISOString()}`);
  console.log(`   month: ${yearMonth}`);
  if (env.DRY_RUN) console.log("   DRY RUN");

  const projects = await listProjects();
  const cddEntries = [];
  const pepEntries = [];

  for (const project of projects) {
    try {
      const tasks = await listProjectTasks(project.gid, { completed_since: "now" });
      for (const task of tasks) {
        const cls = classifyTask(task);
        const base = {
          project: project.name,
          task: task.name,
          assignee: task.assignee?.name ?? "",
        };
        if (cls.cddGap > 0) cddEntries.push(base);
        if (cls.pep > 0) pepEntries.push(base);
      }
    } catch (err) {
      console.warn(`  ⚠  ${project.name}: ${err.message}`);
    }
  }

  const registerRows = await readCounterpartyRegister();
  console.log(`\nCDD: ${cddEntries.length}, PEP: ${pepEntries.length}, register rows: ${registerRows.length}`);

  const cddDoc = buildCddReminder({ entries: cddEntries });
  const eddDoc = buildEddTracker({ registerRows, pepEntries });

  await tryArchive(() => writeHistory(path.join("monthly-ops", `${yearMonth}-cdd-reminder.txt`), cddDoc), "cdd-reminder");
  await tryArchive(() => writeHistory(path.join("monthly-ops", `${yearMonth}-edd-tracker.txt`), eddDoc), "edd-tracker");

  const portfolio = await findPortfolioPinned(projects);
  if (portfolio && !env.DRY_RUN) {
    await postComment(portfolio.taskGid, `${cddDoc}\n\n${eddDoc}`);
    console.log(`\n✓ posted to "${portfolio.projectName}"`);
  }

  if (!env.DRY_RUN) {
    await notify({
      subject: `HSV2 / Monthly Operational Logs — ${yearMonth}`,
      body: `Monthly operational logs produced for ${yearMonth}. CDD: ${cddEntries.length}, EDD: ${registerRows.filter((r) => r.status === "under_review" || r.status === "escalated" || r.risk_rating === "critical").length}.`,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
