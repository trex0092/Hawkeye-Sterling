/**
 * STR / SAR quality self-score rubric.
 *
 * Reads every filing draft in history/filings/ produced today (or a
 * target date), scores each against a 12-point quality rubric, and
 * produces a quality assessment report. The rubric checks whether the
 * draft contains the minimum content goAML expects.
 *
 * Deterministic. No Claude calls. Designed to run after the daily
 * priorities script which generates filing drafts via filing-drafts.mjs.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  renderTable,
  CONFIRMED_REFERENCES,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";
import { renderDocxBuffer } from "./lib/docx-writer.mjs";

const env = readCommonEnv({ requireClaude: false });
const TARGET_DATE = process.env.TARGET_DATE || isoDate();
const asanaClient = createAsanaClient(env);

const RUBRIC = [
  { id: 1, label: "Subject identification", keywords: ["full name", "legal name", "customer", "counterparty", "identification"] },
  { id: 2, label: "Subject nationality or incorporation", keywords: ["nationality", "incorporation", "country", "jurisdiction", "passport", "emirates id"] },
  { id: 3, label: "Subject address", keywords: ["address", "registered office", "premises", "location"] },
  { id: 4, label: "Transaction date(s)", keywords: ["transaction date", "date of transaction", "on or about"] },
  { id: 5, label: "Transaction amount(s)", keywords: ["aed", "amount", "value", "consideration", "total"] },
  { id: 6, label: "Transaction description", keywords: ["description", "purchase", "sale", "trade", "refining", "exchange"] },
  { id: 7, label: "Red-flag or suspicion narrative", keywords: ["suspicion", "suspicious", "red flag", "concern", "indicator", "unusual", "inconsistent"] },
  { id: 8, label: "Typology linkage", keywords: ["typology", "money laundering", "terrorist financing", "sanctions evasion", "structuring", "layering", "trade-based"] },
  { id: 9, label: "Supporting evidence referenced", keywords: ["evidence", "attachment", "document", "screen", "screening", "certificate", "invoice"] },
  { id: 10, label: "CDD status stated", keywords: ["cdd", "due diligence", "kyc", "enhanced due diligence", "simplified"] },
  { id: 11, label: "MLRO decision or recommendation", keywords: ["mlro", "decision", "recommend", "file", "escalat", "review by"] },
  { id: 12, label: "Regulatory hook cited", keywords: ["federal decree", "decree-law", "ministry of economy", "financial intelligence", "goaml", "fiu"] },
];

function scoreDraft(text) {
  const lower = text.toLowerCase();
  const results = [];
  let total = 0;
  for (const criterion of RUBRIC) {
    const hit = criterion.keywords.some((kw) => lower.includes(kw));
    results.push({ id: criterion.id, label: criterion.label, pass: hit });
    if (hit) total++;
  }
  return { results, total, max: RUBRIC.length, pct: Math.round((total / RUBRIC.length) * 100) };
}

async function readFilingDrafts(date) {
  const dir = path.resolve(process.cwd(), "..", "history", "filings", date);
  try {
    const files = await readdir(dir);
    const drafts = [];
    for (const file of files.sort()) {
      if (!file.endsWith(".txt") && !file.endsWith(".md")) continue;
      const content = await readFile(path.join(dir, file), "utf8");
      drafts.push({ file, content });
    }
    return drafts;
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`filings read: ${err.message}`);
    return [];
  }
}

function buildReport(scoredDrafts) {
  const summaryRows = scoredDrafts.map((d) => ({
    draft: d.file.slice(0, 40),
    score: `${d.score.total}/${d.score.max}`,
    pct: `${d.score.pct}%`,
    grade: d.score.pct >= 90 ? "A" : d.score.pct >= 75 ? "B" : d.score.pct >= 60 ? "C" : d.score.pct >= 40 ? "D" : "F",
  }));

  const body = [
    "SCOPE",
    "",
    `We assessed the quality of ${scoredDrafts.length} filing draft(s) produced on ${TARGET_DATE}`,
    "against a twelve-point rubric that checks whether the draft contains the minimum",
    "content the goAML platform and the Financial Intelligence Unit expect to see.",
    "",
    "GRADING SCALE",
    "",
    "A (90-100%): ready for MLRO review and filing.",
    "B (75-89%): minor gaps, one revision expected.",
    "C (60-74%): material gaps, the MLRO should request a redraft.",
    "D (40-59%): significant gaps, the draft needs substantial rework.",
    "F (below 40%): the draft is incomplete and should not be submitted.",
    "",
    "SUMMARY",
    "",
    scoredDrafts.length === 0
      ? "No filing drafts were found for this date."
      : renderTable(summaryRows, [
          { key: "draft", header: "Draft", max: 40 },
          { key: "score", header: "Score", max: 8 },
          { key: "pct", header: "%", max: 6 },
          { key: "grade", header: "Grade", max: 6 },
        ]),
    "",
  ];

  for (const d of scoredDrafts) {
    body.push(`DETAIL: ${d.file}`);
    body.push("");
    body.push(renderTable(
      d.score.results.map((r) => ({
        criterion: `${r.id}. ${r.label}`,
        result: r.pass ? "PASS" : "FAIL",
      })),
      [
        { key: "criterion", header: "Criterion", max: 45 },
        { key: "result", header: "Result", max: 8 },
      ],
    ));
    body.push("");
  }

  body.push("NEXT ACTIONS");
  body.push("");
  const failing = scoredDrafts.filter((d) => d.score.pct < 75);
  if (failing.length === 0 && scoredDrafts.length > 0) {
    body.push("All drafts meet the minimum quality threshold. Proceed with MLRO review.");
  } else if (failing.length > 0) {
    body.push(`${failing.length} draft(s) scored below 75%. The compliance function should revise these before presenting to the MLRO.`);
    body.push("Focus on the FAIL items in each detail section above.");
  } else {
    body.push("No drafts to assess today. This is normal if no filing candidates were flagged.");
  }

  return wrapDocument({
    title: "Filing Draft Quality Assessment",
    reference: `HSV2-QAS-${TARGET_DATE}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Drafts produced on ${TARGET_DATE}`,
    preparedOn: isoDate(),
    body: body.join("\n"),
  });
}

async function main() {
  console.log(`▶ STR quality score ${TARGET_DATE}`);

  const drafts = await readFilingDrafts(TARGET_DATE);
  console.log(`   drafts found: ${drafts.length}`);

  const scoredDrafts = drafts.map((d) => ({ ...d, score: scoreDraft(d.content) }));

  const report = buildReport(scoredDrafts);
  await tryArchive(
    () => writeHistory(path.join("registers", "quality-scores", `${TARGET_DATE}.md`), report),
    `quality-score ${TARGET_DATE}`,
  );

  if (env.DRY_RUN || drafts.length === 0) {
    console.log(drafts.length === 0 ? "   no drafts to score" : "(dry) done");
    return;
  }

  try {
    const projects = await asanaClient.listProjects();
    const target = await asanaClient.findPortfolioPinned(projects);
    if (!target) { console.log("   no pinned task — skipping"); return; }
    const docxBuf = renderDocxBuffer(report);
    await asanaClient.attachFile(target.taskGid, docxBuf, `quality-score-${TARGET_DATE}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const headline = [
      `HSV2 / Filing Quality Score / ${TARGET_DATE}`,
      "",
      `Drafts assessed: ${scoredDrafts.length}`,
      ...scoredDrafts.map((d) => `  ${d.file}: ${d.score.pct}% (${d.score.total}/${d.score.max})`),
      "",
      `For review by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}.`,
    ].join("\n");
    await asanaClient.postComment(target.taskGid, headline);
    console.log(`   📎 attached + posted`);
  } catch (err) {
    console.warn(`   Asana post failed: ${err.message}`);
  }
}

main().catch((err) => { console.error("fatal:", err); process.exit(1); });
