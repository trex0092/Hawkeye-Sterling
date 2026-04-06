/**
 * Quarterly Operational Logs — two artefacts.
 *
 * Runs on the first business day after each quarter end at 10:30
 * Asia/Dubai. Produces:
 *
 *   1. Quarterly Typology Library Update
 *   2. Quarterly Beneficial Ownership Clarity Report
 *
 * Data-driven. No Claude call. Both artefacts aggregate directly from
 * the Asana task base and the counterparty register.
 */

import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  renderTable,
  readCounterpartyRegister,
  classifyTask,
  TYPOLOGY_KEYWORDS,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory } from "./history-writer.mjs";
import { notify } from "./notify.mjs";

const env = readCommonEnv({ requireClaude: false });
const { listProjects, listProjectTasks, postComment, findPortfolioPinned } = createAsanaClient(env);

function quarterLabel() {
  const now = new Date();
  const m = now.getUTCMonth();
  if (m < 3) return `${now.getUTCFullYear() - 1}-Q4`;
  if (m < 6) return `${now.getUTCFullYear()}-Q1`;
  if (m < 9) return `${now.getUTCFullYear()}-Q2`;
  return `${now.getUTCFullYear()}-Q3`;
}

function buildTypologyUpdate({ counts }) {
  const rows = Object.entries(counts).map(([key, count]) => ({ typology: key, occurrences: count }));
  rows.sort((a, b) => b.occurrences - a.occurrences);

  const label = quarterLabel();
  const body = `1. PURPOSE

This update records every typology keyword occurrence observed across the firm's Asana task base as at the close of ${label}. It is produced directly from the compliance function's internal typology keyword list held in scripts/lib/report-scaffold.mjs and is intended to support the annual refresh of the firm's typology library.

2. OBSERVED OCCURRENCES BY TYPOLOGY

${renderTable(rows, [
  { key: "typology", header: "TYPOLOGY", max: 24 },
  { key: "occurrences", header: "OCCURRENCES", max: 12 },
])}

3. MLRO ACTION

Review the occurrences above. Any typology with zero occurrences in two consecutive quarters should be marked as dormant in the firm's internal typology library. Any typology that has not been in the library before and has been observed this quarter should be formally added.`;

  return wrapDocument({
    title: "Quarterly Typology Library Update",
    subtitle: label,
    reference: `HSV2-TYP-${label}`,
    timeOfDay: "10:30",
    coverage: `All active compliance programmes`,
    body,
  });
}

function buildBeneficialOwnershipClarity({ registerRows }) {
  const label = quarterLabel();
  const corporateRows = registerRows.filter((r) =>
    /\b(llc|fz|fze|dmcc|limited|ltd|trading|bullion|jewellery|jewelry|metals)\b/i.test(r.counterparty_name ?? ""),
  );
  const incomplete = corporateRows.filter((r) => {
    const notes = r.mlro_notes ?? "";
    return !/beneficial owner/i.test(notes) && !/ubo/i.test(notes);
  });

  const body = `1. PURPOSE

This report identifies every corporate counterparty in the register whose MLRO notes do not currently record a beneficial ownership determination. It is produced so the MLRO can plan the quarterly UBO refresh cycle.

2. POPULATION

Total corporate counterparties in the register: ${corporateRows.length}
Corporate counterparties without a recorded UBO note: ${incomplete.length}

3. COUNTERPARTIES REQUIRING UBO CLARIFICATION

${incomplete.length === 0 ? "Every corporate counterparty in the register carries a beneficial ownership note." : renderTable(incomplete, [
  { key: "counterparty_name", header: "COUNTERPARTY", max: 34 },
  { key: "jurisdiction", header: "JURISDICTION", max: 18 },
  { key: "risk_rating", header: "RATING", max: 10 },
  { key: "entities_touching", header: "ENTITIES", max: 30 },
])}

4. MLRO ACTION

For each counterparty above, either record the beneficial owner in the mlro_notes column of history/registers/counterparties.csv or open an Asana task to request the missing documentation from the counterparty.`;

  return wrapDocument({
    title: "Quarterly Beneficial Ownership Clarity Report",
    subtitle: label,
    reference: `HSV2-BO-${label}`,
    timeOfDay: "10:30",
    coverage: `Cross-entity counterparty register`,
    body,
  });
}

async function main() {
  const label = quarterLabel();
  console.log(`▶  Quarterly Operational Logs — ${new Date().toISOString()}`);
  console.log(`   quarter: ${label}`);
  if (env.DRY_RUN) console.log("   DRY RUN");

  const projects = await listProjects();
  const counts = Object.fromEntries(Object.keys(TYPOLOGY_KEYWORDS).map((k) => [k, 0]));

  for (const project of projects) {
    try {
      const tasks = await listProjectTasks(project.gid, { completed_since: "now" });
      for (const task of tasks) {
        const cls = classifyTask(task);
        for (const [key, c] of Object.entries(cls)) counts[key] += c;
      }
    } catch (err) {
      console.warn(`  ⚠  ${project.name}: ${err.message}`);
    }
  }

  const registerRows = await readCounterpartyRegister();
  console.log(`\nTypology counts: ${JSON.stringify(counts)}, register rows: ${registerRows.length}`);

  const typologyDoc = buildTypologyUpdate({ counts });
  const boDoc = buildBeneficialOwnershipClarity({ registerRows });

  await tryArchive(() => writeHistory(path.join("quarterly-ops", `${label}-typology-update.txt`), typologyDoc), "typology-update");
  await tryArchive(() => writeHistory(path.join("quarterly-ops", `${label}-bo-clarity.txt`), boDoc), "bo-clarity");

  const portfolio = await findPortfolioPinned(projects);
  if (portfolio && !env.DRY_RUN) {
    await postComment(portfolio.taskGid, `${typologyDoc}\n\n${boDoc}`);
    console.log(`\n✓ posted to "${portfolio.projectName}"`);
  }

  if (!env.DRY_RUN) {
    await notify({
      subject: `HSV2 / Quarterly Operational Logs — ${label}`,
      body: `Quarterly ops logs produced for ${label}.`,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
