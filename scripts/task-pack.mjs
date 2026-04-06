/**
 * Per-task compliance pack generator.
 *
 * Walks every open task in every Asana project. For each task that is
 * not the pinned "📌 Today's Priorities" task and not already completed,
 * builds a comprehensive compliance pack (markdown + Word .docx) with
 * the task metadata pre-filled and blank fields for the compliance
 * function and the MLRO to complete. The pack is:
 *
 *   1. Archived under history/task-packs/YYYY-MM-DD/<entity>/<slug>.md
 *      (Word sibling emitted automatically by history-writer)
 *   2. Uploaded as attachments (.docx and .md) on the task in Asana
 *   3. Announced with a short comment on the task
 *
 * Entity classification: every project name is matched against the
 * six entity codes in CONFIRMED_REFERENCES.entityCodes (FB, FL, ML,
 * NL, GM, ZF). The first code matched wins. Projects that do not
 * match any code are labelled UNASSIGNED and the MLRO is asked to
 * rename the project or populate entities.json.
 *
 * Deterministic. No Claude calls. Designed to run idempotently: if
 * an older pack is already attached to a task, a new dated pack is
 * added alongside it and the history archive keeps every version.
 *
 * Intended cadence: weekly on Monday morning, plus manual dispatch
 * when the MLRO wants a fresh pack across the full workspace.
 */

import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  classifyTask,
  CONFIRMED_REFERENCES,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, slugify, isoDate } from "./history-writer.mjs";
import { renderDocxBuffer } from "./lib/docx-writer.mjs";

const env = readCommonEnv({
  requireClaude: false,
  MAX_TASKS_PER_PROJECT: Number.parseInt(process.env.MAX_TASKS_PER_PROJECT ?? "500", 10),
  THROTTLE_MS: Number.parseInt(process.env.THROTTLE_MS ?? "150", 10),
});
const today = isoDate();
const asanaClient = createAsanaClient(env);

function detectEntityCode(projectName) {
  const upper = String(projectName ?? "").toUpperCase();
  for (const code of CONFIRMED_REFERENCES.entityCodes) {
    const re = new RegExp(`(^|[^A-Z0-9])${code}([^A-Z0-9]|$)`);
    if (re.test(upper)) return code;
  }
  return "UNASSIGNED";
}

function buildTaskPack({ task, entityCode, projectName }) {
  const cls = classifyTask(task);
  const hits = Object.entries(cls).filter(([, v]) => v > 0).map(([k]) => k);
  const mlroName = CONFIRMED_REFERENCES.mlro.name;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.shortTitle;

  const reference = `HSV2-TPK-${today}-${entityCode}-${slugify(task.name ?? "").slice(0, 20) || task.gid}`;
  const taskNotes = String(task.notes ?? "").slice(0, 1000);

  const body = [
    "SECTION 1. TASK IDENTIFICATION",
    "",
    `Task name:         ${task.name ?? ""}`,
    `Task reference:    ${task.gid ?? ""}`,
    `Project:           ${projectName}`,
    `Reporting entity:  ${entityCode}`,
    `Assignee:          ${task.assignee?.name ?? "unassigned"}`,
    `Created:           ${task.created_at ? task.created_at.slice(0, 10) : ""}`,
    `Due date:          ${task.due_on ?? "not set"}`,
    `Completed:         ${task.completed ? "yes" : "no"}`,
    `Asana permalink:   ${task.permalink_url ?? ""}`,
    "",
    "Task notes on file (first 1 000 characters):",
    taskNotes.length === 0 ? "(no notes recorded in the Asana task)" : taskNotes,
    "",
    "SECTION 2. AUTOMATION PRE-SCREEN",
    "",
    hits.length === 0
      ? "The automation pre-scan did not match any typology keyword in the task name or notes."
      : `The automation pre-scan matched the following typology keywords: ${hits.join(", ")}.`,
    "",
    "The pre-scan is advisory only. The compliance function remains responsible for",
    "the final typology assessment and for any filing decision.",
    "",
    "SECTION 3. CUSTOMER IDENTIFICATION AND DUE DILIGENCE",
    "",
    "Full legal name of customer or counterparty:  [                                              ]",
    "Trading name, if different:                   [                                              ]",
    "Customer type:                                [ natural person ] [ legal person ] [ arrangement ]",
    "Nationality or place of incorporation:        [                                              ]",
    "Date of birth or incorporation date:          [                                              ]",
    "Identification document type:                 [ passport ] [ Emirates ID ] [ trade licence ] [ other ]",
    "Document number:                              [                                              ]",
    "Document issue date:                          [                                              ]",
    "Document expiry date:                         [                                              ]",
    "Address of record:                            [                                              ]",
    "Beneficial owner(s) identified:               [ yes ] [ no ]",
    "Source of funds stated by the customer:       [                                              ]",
    "Source of wealth stated by the customer:      [                                              ]",
    "CDD depth applied:                            [ simplified ] [ standard ] [ enhanced ]",
    "PEP status:                                   [ yes ] [ no ]   if yes, attach the PEP screen",
    "Adverse media reviewed:                       [ yes ] [ no ]",
    "Customer risk rating assigned:                [ low ] [ medium ] [ high ]",
    "Date of latest CDD review:                    [                                              ]",
    "",
    "SECTION 4. TRANSACTION DETAILS (if the task concerns a specific transaction)",
    "",
    "Transaction date:                 [                                              ]",
    "Transaction type:                 [ cash purchase ] [ cash sale ] [ trade-in ] [ refining ] [ other ]",
    "Item description:                 [                                              ]",
    "Assay or certification reference: [                                              ]",
    "Total consideration (AED):        [                                              ]",
    "Cash component (AED):             [                                              ]",
    "Non-cash component and method:    [                                              ]",
    "Counterparty role in transaction: [ buyer ] [ seller ] [ agent ] [ introducer ]",
    "Aggregation applied:              [ yes ] [ no ]",
    "Rolling thirty-day aggregated AED:[                                              ]",
    "DPMSR threshold assessment:       [ below ] [ at or above ] the cash transaction threshold",
    "                                  specified by the DPMSR framework",
    "",
    "SECTION 5. RED-FLAG ASSESSMENT",
    "",
    "Red flag identified:              [ yes ] [ no ]",
    "Typology cited:                   [                                              ]",
    "",
    "Narrative of concern (short paragraphs, facts only):",
    "",
    "  [                                                                                    ]",
    "  [                                                                                    ]",
    "  [                                                                                    ]",
    "  [                                                                                    ]",
    "  [                                                                                    ]",
    "",
    "SECTION 6. SANCTIONS AND PEP SCREENING RECORD",
    "",
    "UNSC Consolidated List screen:            [ clear ] [ potential match ] [ confirmed match ]",
    "UAE Local Terrorist List screen (EOCN):   [ clear ] [ potential match ] [ confirmed match ]",
    "PEP source list screen:                   [ clear ] [ potential match ] [ confirmed match ]",
    "Adverse media screen:                     [ clear ] [ adverse hit ]",
    "Screen date:                              [                                              ]",
    "Screen performed by:                      [                                              ]",
    "Evidence reference in the archive:        [                                              ]",
    "",
    "SECTION 7. FILING DECISION MATRIX",
    "",
    "Does this matter require a filing to the Financial Intelligence Unit through the",
    "goAML platform?",
    "",
    "[ ] Suspicious Transaction Report (STR)",
    "[ ] Suspicious Activity Report (SAR)",
    "[ ] Dealers in Precious Metals and Stones Report (DPMSR)",
    "[ ] Partial Name Match Report (PNMR)",
    "[ ] Funds Freeze Report (FFR)",
    "[ ] No filing required at this stage",
    "",
    "Filing reference assigned internally:  [                                              ]",
    "Internal filing deadline:              [                                              ]",
    "goAML submission date, if filed:       [                                              ]",
    "goAML receipt reference, if filed:     [                                              ]",
    "",
    "SECTION 8. MLRO DECISION AND SIGN-OFF",
    "",
    "MLRO decision:          [ file ] [ do not file ] [ further review requested ]",
    "Date of decision:       [                                              ]",
    "",
    "Reasoning (one short paragraph, factual):",
    "",
    "  [                                                                                    ]",
    "  [                                                                                    ]",
    "  [                                                                                    ]",
    "",
    `Decided by:   ${mlroName}, Money Laundering Reporting Officer`,
    "Signature:    __________________________",
    "Date:         __________________________",
    "",
    "SECTION 9. RETENTION AND CONFIDENTIALITY NOTE",
    "",
    `This pack and every supporting document are retained for a minimum of ${retentionYears} years`,
    `in accordance with the applicable provision of ${primaryLaw}. Access is restricted`,
    "to the MLRO, the compliance function and any authorised representative of the",
    "Ministry of Economy or the Financial Intelligence Unit acting in an official capacity.",
  ].join("\n");

  return wrapDocument({
    title: "Task Compliance Pack",
    subtitle: `Entity ${entityCode} / Task ${task.gid ?? ""}`,
    reference,
    classification: "Confidential. For MLRO review and regulator disclosure only.",
    coverage: `Pack generated for Asana task ${task.gid ?? ""} on ${today}`,
    preparedOn: today,
    body,
  });
}

async function main() {
  console.log(`▶ Task pack generator ${today}`);
  console.log(`   MLRO: ${CONFIRMED_REFERENCES.mlro.name}`);
  console.log(`   entity codes: ${CONFIRMED_REFERENCES.entityCodes.join(", ")}`);
  if (env.DRY_RUN) console.log("   DRY RUN — no Asana uploads");

  const projects = await asanaClient.listProjects();
  console.log(`   projects: ${projects.length}`);

  const results = { generated: 0, attached: 0, skipped: 0, failed: 0 };
  const byEntity = {};

  for (const project of projects) {
    const entityCode = detectEntityCode(project.name);
    console.log(`\n▶ ${project.name} [${entityCode}]`);

    let tasks;
    try {
      tasks = await asanaClient.listProjectTasks(project.gid);
    } catch (err) {
      console.warn(`  listProjectTasks failed: ${err.message}`);
      continue;
    }

    const open = tasks.filter(
      (t) =>
        !t.completed &&
        t.name &&
        t.name.trim() !== env.PINNED_TASK_NAME.trim(),
    );
    console.log(`  open tasks: ${open.length}`);

    const capped = open.slice(0, env.MAX_TASKS_PER_PROJECT);
    if (capped.length < open.length) {
      console.log(`  (capped to ${capped.length} tasks per project)`);
    }

    for (const task of capped) {
      const pack = buildTaskPack({
        task,
        entityCode,
        projectName: project.name,
      });
      const slug = slugify(task.name).slice(0, 60) || task.gid;
      const relPath = path.join(
        "task-packs",
        today,
        entityCode,
        `${slug}__${task.gid}.md`,
      );
      await tryArchive(() => writeHistory(relPath, pack), `task-pack ${entityCode}/${slug}`);
      results.generated++;
      byEntity[entityCode] = (byEntity[entityCode] ?? 0) + 1;

      if (env.DRY_RUN) {
        await new Promise((r) => setTimeout(r, 10));
        continue;
      }

      try {
        const docxBuf = renderDocxBuffer(pack);
        const mdBuf = Buffer.from(pack, "utf8");
        await asanaClient.attachFile(
          task.gid,
          docxBuf,
          `compliance-pack-${today}.docx`,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        await asanaClient.attachFile(
          task.gid,
          mdBuf,
          `compliance-pack-${today}.md`,
          "text/markdown",
        );
        const headline = [
          `HSV2 / Task Compliance Pack / ${today}`,
          "",
          `Entity: ${entityCode}`,
          "",
          "Attached above. Word (.docx) and markdown. The pack contains sections 1 to 9 with",
          "customer identification, transaction details, red-flag assessment, sanctions and PEP",
          "screening, filing decision matrix and MLRO sign-off. Complete the blank fields and",
          "upload the signed version when ready.",
          "",
          `For review by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}.`,
        ].join("\n");
        await asanaClient.postComment(task.gid, headline);
        results.attached++;
        console.log(`  📎 ${slug}`);
      } catch (err) {
        console.warn(`  attach failed for ${slug}: ${err.message}`);
        results.failed++;
      }

      await new Promise((r) => setTimeout(r, env.THROTTLE_MS));
    }
  }

  console.log(`\n✓ done. generated=${results.generated} attached=${results.attached} failed=${results.failed}`);
  console.log("   by entity:");
  for (const [code, n] of Object.entries(byEntity).sort()) {
    console.log(`     ${code}: ${n}`);
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
