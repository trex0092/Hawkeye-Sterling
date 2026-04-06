/**
 * Annual Customer Exit Report.
 *
 * Runs on 31 January at 10:30 Asia/Dubai. Walks the counterparty
 * register for rows whose status is `cleared` or `escalated` during
 * the target year and produces a formal annual record of customer
 * relationships that were exited for AML or CFT reasons.
 *
 * Data-driven. No Claude call.
 */

import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  readCounterpartyRegister,
  renderTable,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory } from "./history-writer.mjs";
import { notify } from "./notify.mjs";

const env = readCommonEnv({ requireClaude: false, TARGET_YEAR: process.env.TARGET_YEAR ?? "" });
const { listProjects, postComment, findPortfolioPinned } = createAsanaClient(env);
const targetYear = env.TARGET_YEAR && env.TARGET_YEAR.trim()
  ? Number.parseInt(env.TARGET_YEAR.trim(), 10)
  : new Date().getUTCFullYear() - 1;
if (Number.isNaN(targetYear)) {
  console.error("❌ TARGET_YEAR is not a valid integer");
  process.exit(1);
}

async function main() {
  console.log(`▶  Annual Customer Exit Report — ${new Date().toISOString()}`);
  console.log(`   year: ${targetYear}`);
  if (env.DRY_RUN) console.log("   DRY RUN");

  const rows = await readCounterpartyRegister();
  const exited = rows.filter((r) => {
    const last = (r.last_seen ?? "").slice(0, 4);
    return last === String(targetYear) && (r.status === "cleared" || r.status === "escalated");
  });

  const body = `1. PURPOSE

This record lists every counterparty in the cross-entity counterparty register whose status was set to "cleared" or "escalated" during the year ${targetYear}. A status of "cleared" indicates a relationship the firm exited after review, and a status of "escalated" indicates a relationship the firm escalated out of the ordinary monitoring track. Both are material for the annual audit and for the firm's continuing obligations under Federal Decree-Law No. 10 of 2025.

2. POPULATION

Total counterparties exited or escalated during ${targetYear}: ${exited.length}

3. ENTRIES

${exited.length === 0 ? "No counterparties were exited or escalated during the year." : renderTable(exited, [
  { key: "counterparty_name", header: "COUNTERPARTY", max: 34 },
  { key: "jurisdiction", header: "JURISDICTION", max: 18 },
  { key: "risk_rating", header: "RATING", max: 10 },
  { key: "status", header: "STATUS", max: 12 },
  { key: "last_seen", header: "LAST SEEN", max: 12 },
])}

4. MLRO ACTION

Review each entry above against the firm's internal customer exit log and confirm that the reason for exit is documented. Any entry in the register that is missing an exit rationale should have the rationale added to the mlro_notes column of history/registers/counterparties.csv before the Board meeting at which this record is presented.`;

  const document = wrapDocument({
    title: "Annual Customer Exit Report",
    subtitle: `Year ${targetYear}`,
    reference: `HSV2-CXR-${targetYear}`,
    timeOfDay: "10:30",
    coverage: `Cross-entity counterparty register`,
    body,
  });

  await tryArchive(
    () => writeHistory(path.join("annual", `customer-exit-${targetYear}.txt`), document),
    "customer-exit-report",
  );

  const projects = await listProjects();
  const portfolio = await findPortfolioPinned(projects);
  if (portfolio && !env.DRY_RUN) {
    try {
      const __doc = document.length > 60000 ? document.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : document;
      await postComment(portfolio.taskGid, __doc);
    } catch (__err) {
      console.warn(`⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
    }
    console.log(`\n✓ posted to "${portfolio.projectName}"`);
  }

  if (!env.DRY_RUN) {
    await notify({
      subject: `HSV2 / Annual Customer Exit Report — ${targetYear}`,
      body: document,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
