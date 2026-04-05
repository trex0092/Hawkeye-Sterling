/**
 * MLRO Handover Report — on demand.
 *
 * Produced when the current MLRO is being replaced or when continuity
 * evidence is required by an inspection, an auditor or an internal
 * succession process. The report packages a structured snapshot of
 * the current state of the compliance programme from the history
 * archive and the counterparty register, addressed from the outgoing
 * MLRO to the incoming MLRO.
 *
 * Triggered only by workflow_dispatch. No schedule.
 */

import path from "node:path";
import { readdir } from "node:fs/promises";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  readCounterpartyRegister,
  renderTable,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";
import { notify } from "./notify.mjs";

const env = readCommonEnv({ INCOMING_MLRO_NAME: process.env.INCOMING_MLRO_NAME ?? "" });
const { listProjects, postComment, findPortfolioPinned } = createAsanaClient(env);
const today = isoDate();

async function countFiles(dir) {
  try {
    return (await readdir(dir)).length;
  } catch {
    return 0;
  }
}

async function main() {
  console.log(`▶  MLRO Handover Report — ${new Date().toISOString()}`);
  console.log(`   incoming MLRO: ${env.INCOMING_MLRO_NAME || "[not specified]"}`);
  if (env.DRY_RUN) console.log("   DRY RUN");

  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const counts = {
    dailyDays: await countFiles(path.join(historyRoot, "daily")),
    retros: await countFiles(path.join(historyRoot, "retro")),
    weeklyPatterns: await countFiles(path.join(historyRoot, "weekly")),
    mlroWeekly: await countFiles(path.join(historyRoot, "mlro-weekly")),
    mlroMonthly: await countFiles(path.join(historyRoot, "mlro-monthly")),
    mlroQuarterly: await countFiles(path.join(historyRoot, "mlro-quarterly")),
    mlroAnnual: await countFiles(path.join(historyRoot, "mlro-annual")),
    dailyOps: await countFiles(path.join(historyRoot, "daily-ops")),
    weeklyOps: await countFiles(path.join(historyRoot, "weekly-ops")),
    monthlyOps: await countFiles(path.join(historyRoot, "monthly-ops")),
    quarterlyOps: await countFiles(path.join(historyRoot, "quarterly-ops")),
    annual: await countFiles(path.join(historyRoot, "annual")),
    filings: await countFiles(path.join(historyRoot, "filings")),
  };

  const register = await readCounterpartyRegister();
  const critical = register.filter((r) => r.risk_rating === "critical");
  const high = register.filter((r) => r.risk_rating === "high");
  const crossEntity = register.filter((r) => (r.entities_touching ?? "").split("|").filter(Boolean).length >= 2);

  const archiveRows = Object.entries(counts).map(([key, value]) => ({ category: key, entries: value }));

  // Outgoing MLRO name is read from CONFIRMED_REFERENCES.mlro.name, which is
  // itself sourced from the MLRO_NAME environment variable in
  // regulatory-context.mjs. If the variable is not set, the fallback
  // "the Money Laundering Reporting Officer" is used. The public source
  // code carries no identifying name.
  const { CONFIRMED_REFERENCES } = await import("./regulatory-context.mjs");
  const mlroName = CONFIRMED_REFERENCES.mlro.name;
  const incomingName = env.INCOMING_MLRO_NAME || "[incoming MLRO]";

  const body = `1. PURPOSE AND STANDING OF THIS DOCUMENT

This is the Money Laundering Reporting Officer handover report of [Reporting Entity], prepared by the outgoing MLRO, ${mlroName}, for the attention of the incoming MLRO, ${incomingName}. It is an internal continuity record and is retained for ten years under Federal Decree-Law No. 10 of 2025.

The report does not replace the direct verbal handover the outgoing MLRO owes the incoming MLRO. It is a structured artefact the incoming MLRO can read in the first week to understand the shape of the programme as it stood on the handover date.

2. STATE OF THE HISTORY ARCHIVE AT HANDOVER

${renderTable(archiveRows, [
  { key: "category", header: "CATEGORY", max: 24 },
  { key: "entries", header: "ENTRIES", max: 10 },
])}

All artefacts listed above are committed to the git repository under history/ and are retrievable by path. The incoming MLRO is encouraged to clone the repository and read the most recent Weekly MLRO Report, the most recent Monthly MLRO Consolidation and the current annual risk assessment before any other handover document.

3. STATE OF THE COUNTERPARTY REGISTER AT HANDOVER

Total counterparty rows:             ${register.length}
Critical risk rating:                ${critical.length}
High risk rating:                    ${high.length}
Touching two or more HSV2 entities:  ${crossEntity.length}

The counterparty register is the single most important file for continuity. It is held at history/registers/counterparties.csv and is updated on every daily run of the automation. The incoming MLRO should read every row with a critical or high rating in the first week.

4. FILING MODE CONFIGURATION AT HANDOVER

The file scripts/filing-mode.json controls whether each of the five goAML filing types generates drafts automatically or only on demand. The handover instruction is that the incoming MLRO inspects this file, confirms that the defaults match her judgement, and commits any change under her own identity so the repository history records the handover explicitly.

5. OUTSTANDING MATTERS THE INCOMING MLRO SHOULD EXPECT IN THE FIRST WEEK

The outgoing MLRO should insert, before handover, a bulleted list of specific open matters here. The automation cannot generate this list; it is a personal handover note. The outgoing MLRO should replace this paragraph with the real list before signing.

[MLRO TO INSERT: open matters for the first week]

6. CONTACTS AND CREDENTIALS THE INCOMING MLRO WILL NEED

[MLRO TO INSERT: Asana access, Anthropic API key rotation plan, Gmail credentials if used, GitHub access to this repository, goAML credentials, MOE portal login]

7. ACKNOWLEDGEMENT

The incoming MLRO should sign this document on the line below as acknowledgement of receipt, and the firm should retain the signed copy in the ten-year compliance archive.`;

  const document = wrapDocument({
    title: "MLRO Handover Report",
    subtitle: `From ${mlroName} to ${incomingName}`,
    reference: `HSV2-HANDOVER-${today}`,
    timeOfDay: "on demand",
    coverage: `Handover date ${today}`,
    body,
    signOffType: "issued",
  });

  await tryArchive(
    () => writeHistory(path.join("handover", `${today}.txt`), document),
    "mlro-handover",
  );

  const projects = await listProjects();
  const portfolio = await findPortfolioPinned(projects);
  if (portfolio && !env.DRY_RUN) {
    await postComment(portfolio.taskGid, document);
    console.log(`\n✓ posted to "${portfolio.projectName}"`);
  }

  if (!env.DRY_RUN) {
    await notify({
      subject: `HSV2 / MLRO Handover Report — ${today}`,
      body: document,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
