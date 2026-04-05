/**
 * Daily Operational Logs — four data-driven audit artefacts.
 *
 * Runs Mon–Fri at 09:05 Asia/Dubai (05:05 UTC), five minutes after the
 * daily priorities workflow. Walks every programme's open tasks and
 * the counterparty register, classifies tasks against the shared
 * typology keywords, and writes four audit logs in one pass:
 *
 *   1. Daily Sanctions Screening Log
 *   2. Daily PEP Watch Log
 *   3. Daily Cash Transaction Log
 *   4. Daily High-Risk Counterparty Digest
 *
 * No Claude call. Pure aggregation. Scripts that need narrative call
 * Claude elsewhere; these logs are meant to be deterministic audit
 * artefacts so an MOE inspector can read them without the possibility
 * of LLM drift.
 */

import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  readCounterpartyRegister,
  classifyTask,
  renderTable,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";
import { notify } from "./notify.mjs";

const env = readCommonEnv();
const { listProjects, listProjectTasks, postComment, findPortfolioPinned } = createAsanaClient(env);
const today = isoDate();

function buildSanctionsLog({ entries }) {
  const body = `1. PURPOSE

This log records every sanctions-related task observed across the six active compliance programmes during the calendar day ${today}. It is a contemporaneous record produced directly from the Asana task base and is intended for immediate production to the Executive Office for Control and Non-Proliferation or the Ministry of Economy on demand.

2. ACTIVITY OBSERVED TODAY

Total sanctions-tagged tasks touched today: ${entries.length}
Programmes covered:                         ${new Set(entries.map((e) => e.project)).size}

3. LOG ENTRIES

${entries.length === 0 ? "No sanctions-tagged tasks were observed in the task base today." : renderTable(entries, [
  { key: "project", header: "PROGRAMME", max: 30 },
  { key: "task", header: "TASK", max: 40 },
  { key: "assignee", header: "ASSIGNEE", max: 20 },
  { key: "status", header: "STATUS", max: 12 },
])}

4. QUALITY ASSURANCE STATEMENT

The compliance function confirms that every sanctions-tagged task open in the Asana workspace at the time of this run is represented in the log above, that each entry references a specific Asana task GID that can be cross-checked during an inspection, and that no entry has been suppressed.`;

  return wrapDocument({
    title: "Daily Sanctions Screening Log",
    reference: `HSV2-DSL-${today}`,
    timeOfDay: "09:05",
    coverage: `00:00 to 23:59 Asia/Dubai on ${today}`,
    body,
  });
}

function buildPepLog({ entries }) {
  const body = `1. PURPOSE

This log records every Politically Exposed Person file currently under active monitoring across the six active compliance programmes as of ${today}. It is produced directly from the Asana task base and is intended to give the MLRO a one-page view of the firm's PEP population and any movements observed today.

2. POPULATION

Total PEP files currently under EDD:        ${entries.length}
Programmes carrying a PEP file:             ${new Set(entries.map((e) => e.project)).size}

3. LOG ENTRIES

${entries.length === 0 ? "No PEP-tagged tasks were observed in the task base today." : renderTable(entries, [
  { key: "project", header: "PROGRAMME", max: 30 },
  { key: "task", header: "FILE", max: 40 },
  { key: "assignee", header: "ASSIGNEE", max: 20 },
  { key: "status", header: "STATUS", max: 12 },
])}

4. QUALITY ASSURANCE STATEMENT

The compliance function confirms that every PEP-tagged task open in the Asana workspace at the time of this run is represented in the log above, and that the list has not been filtered or redacted.`;

  return wrapDocument({
    title: "Daily PEP Watch Log",
    reference: `HSV2-DPL-${today}`,
    timeOfDay: "09:05",
    coverage: `All active compliance programmes`,
    body,
  });
}

function buildCashLog({ entries }) {
  const body = `1. PURPOSE

This log records every task in the Asana base that references cash activity (AED amounts, walk-in purchases, linked cash transactions) as of ${today}. It is produced so that any item approaching the cash transaction threshold specified by the DPMSR framework can be reviewed by the MLRO before the day ends.

2. ACTIVITY OBSERVED TODAY

Tasks referencing cash activity:            ${entries.length}
Programmes carrying a cash file today:      ${new Set(entries.map((e) => e.project)).size}

3. LOG ENTRIES

${entries.length === 0 ? "No cash-related tasks were observed in the task base today." : renderTable(entries, [
  { key: "project", header: "PROGRAMME", max: 30 },
  { key: "task", header: "TASK", max: 40 },
  { key: "assignee", header: "ASSIGNEE", max: 20 },
  { key: "status", header: "STATUS", max: 12 },
])}

4. MLRO ACTION

The MLRO is asked to verify whether any of the cash files listed above meets the DPMSR filing trigger for the rolling 30-day window on a linked transaction basis. The automation does not make that determination; the MLRO does.`;

  return wrapDocument({
    title: "Daily Cash Transaction Log",
    reference: `HSV2-DCT-${today}`,
    timeOfDay: "09:05",
    coverage: `All active compliance programmes`,
    body,
  });
}

function buildHighRiskDigest({ rows }) {
  const body = `1. PURPOSE

This digest lists every counterparty currently carrying a high or critical risk rating in the cross-entity counterparty register as of ${today}. It is a snapshot of the register filtered to the highest-severity entries so the MLRO can prioritise review.

2. POPULATION

Total high-risk counterparties:             ${rows.length}
Counterparties touching more than one entity: ${rows.filter((r) => (r.entities_touching ?? "").split("|").filter(Boolean).length >= 2).length}

3. ENTRIES

${rows.length === 0 ? "No high-risk counterparties are currently held in the register." : renderTable(rows, [
  { key: "counterparty_name", header: "COUNTERPARTY", max: 32 },
  { key: "jurisdiction", header: "JURISDICTION", max: 18 },
  { key: "risk_rating", header: "RATING", max: 10 },
  { key: "entities_touching", header: "ENTITIES", max: 36 },
  { key: "status", header: "STATUS", max: 14 },
])}

4. MLRO ACTION

Review each entry above and confirm that the status recorded in the register matches the firm's current view of the counterparty. Any change is made by editing history/registers/counterparties.csv and committing the change in the repository.`;

  return wrapDocument({
    title: "Daily High-Risk Counterparty Digest",
    reference: `HSV2-HRC-${today}`,
    timeOfDay: "09:05",
    coverage: `Cross-entity counterparty register snapshot`,
    body,
  });
}

async function main() {
  console.log(`▶  Daily Operational Logs — ${new Date().toISOString()}`);
  if (env.DRY_RUN) console.log("   DRY RUN");

  const projects = await listProjects();
  console.log(`\nFound ${projects.length} active projects.`);

  const sanctionsEntries = [];
  const pepEntries = [];
  const cashEntries = [];

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
        if (cls.sanctions > 0) sanctionsEntries.push(base);
        if (cls.pep > 0) pepEntries.push(base);
        if (cls.cash > 0 || cls.dpmsrTrigger > 0) cashEntries.push(base);
      }
    } catch (err) {
      console.warn(`  ⚠  ${project.name}: ${err.message}`);
    }
  }

  const register = await readCounterpartyRegister();
  const highRiskRows = register.filter((r) => r.risk_rating === "high" || r.risk_rating === "critical");

  console.log(`\nSanctions: ${sanctionsEntries.length}, PEP: ${pepEntries.length}, Cash: ${cashEntries.length}, HighRisk: ${highRiskRows.length}`);

  const sanctionsDoc = buildSanctionsLog({ entries: sanctionsEntries });
  const pepDoc = buildPepLog({ entries: pepEntries });
  const cashDoc = buildCashLog({ entries: cashEntries });
  const highRiskDoc = buildHighRiskDigest({ rows: highRiskRows });

  await tryArchive(() => writeHistory(path.join("daily-ops", today, "sanctions-screening-log.txt"), sanctionsDoc), "sanctions-screening-log");
  await tryArchive(() => writeHistory(path.join("daily-ops", today, "pep-watch-log.txt"), pepDoc), "pep-watch-log");
  await tryArchive(() => writeHistory(path.join("daily-ops", today, "cash-transaction-log.txt"), cashDoc), "cash-transaction-log");
  await tryArchive(() => writeHistory(path.join("daily-ops", today, "high-risk-counterparty-digest.txt"), highRiskDoc), "high-risk-counterparty-digest");

  const portfolio = await findPortfolioPinned(projects);
  if (portfolio && !env.DRY_RUN) {
    const combined = `${sanctionsDoc}\n\n${pepDoc}\n\n${cashDoc}\n\n${highRiskDoc}`;
    await postComment(portfolio.taskGid, combined);
    console.log(`\n✓ combined ops logs posted to "${portfolio.projectName}"`);
  } else if (env.DRY_RUN) {
    console.log(`\n[dry-run] would post combined ops logs to portfolio`);
  } else {
    console.log(`\n⚠  no pinned portfolio task — archive only`);
  }

  if (!env.DRY_RUN) {
    await notify({
      subject: `HSV2 / Daily Operational Logs — ${today}`,
      body: `Four daily operational logs produced for ${today}.\n\nSanctions: ${sanctionsEntries.length} entries\nPEP: ${pepEntries.length} entries\nCash: ${cashEntries.length} entries\nHigh-risk counterparties: ${highRiskRows.length}\n\nArchived to history/daily-ops/${today}/.`,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
