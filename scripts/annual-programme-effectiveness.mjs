/**
 * Annual Programme Effectiveness Self-Assessment.
 *
 * Runs on 31 January at 10:00 Asia/Dubai alongside the annual training
 * report. Scores the AML and CFT programme across the pillars MOE
 * inspectors look at during supervisory visits, using purely
 * deterministic evidence from the history archive and the counterparty
 * register.
 *
 * No Claude call. The output is a structured self-assessment scorecard
 * that the MLRO reviews, amends and presents to the Board.
 */

import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
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

const env = readCommonEnv({ TARGET_YEAR: process.env.TARGET_YEAR ?? "" });
const { listProjects, postComment, findPortfolioPinned } = createAsanaClient(env);
const targetYear = env.TARGET_YEAR
  ? Number.parseInt(env.TARGET_YEAR, 10)
  : new Date().getUTCFullYear() - 1;

async function countFilesInDir(dir, yearPrefix) {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.startsWith(String(yearPrefix))).length;
  } catch {
    return 0;
  }
}

async function countFilingDraftsForYear(year) {
  const base = path.resolve(process.cwd(), "..", "history", "filings");
  let total = 0;
  try {
    const days = await readdir(base);
    for (const day of days) {
      if (!day.startsWith(`${year}-`)) continue;
      const files = await readdir(path.join(base, day));
      total += files.length;
    }
  } catch {
    // no filings dir, leave total at 0
  }
  return total;
}

function scoreLabel(n) {
  if (n >= 90) return "strong";
  if (n >= 70) return "satisfactory";
  if (n >= 50) return "adequate";
  if (n >= 30) return "weak";
  return "unsatisfactory";
}

async function main() {
  console.log(`▶  Annual Programme Effectiveness — ${new Date().toISOString()}`);
  console.log(`   year: ${targetYear}`);
  if (env.DRY_RUN) console.log("   DRY RUN");

  const historyRoot = path.resolve(process.cwd(), "..", "history");

  // Evidence collection
  const monthlyReports = await countFilesInDir(path.join(historyRoot, "mlro-monthly"), targetYear);
  const quarterlyReports = await countFilesInDir(path.join(historyRoot, "mlro-quarterly"), targetYear);
  const weeklyPatterns = await countFilesInDir(path.join(historyRoot, "weekly"), targetYear);
  const dailyDir = path.join(historyRoot, "daily");
  let dailyCount = 0;
  try {
    dailyCount = (await readdir(dailyDir)).filter((d) => d.startsWith(`${targetYear}-`)).length;
  } catch {}
  const filingDrafts = await countFilingDraftsForYear(targetYear);
  const register = await readCounterpartyRegister();

  // Pillar scoring heuristics (weighted by completeness of the archive)
  const pillars = [
    {
      pillar: "Governance and MLRO reporting",
      evidence: `Monthly reports ${monthlyReports}/12, quarterly reports ${quarterlyReports}/4`,
      score: Math.min(100, (monthlyReports / 12) * 60 + (quarterlyReports / 4) * 40),
    },
    {
      pillar: "Daily operational discipline",
      evidence: `Daily folders ${dailyCount}`,
      score: Math.min(100, (dailyCount / 250) * 100),
    },
    {
      pillar: "Weekly pattern intelligence",
      evidence: `Weekly pattern reports ${weeklyPatterns}/52`,
      score: Math.min(100, (weeklyPatterns / 52) * 100),
    },
    {
      pillar: "Filing drafts prepared for MLRO review",
      evidence: `Filing drafts in archive: ${filingDrafts}`,
      score: filingDrafts === 0 ? 40 : Math.min(100, 60 + Math.log10(filingDrafts + 1) * 15),
    },
    {
      pillar: "Counterparty intelligence",
      evidence: `Counterparty register rows: ${register.length}; high or critical: ${register.filter((r) => r.risk_rating === "high" || r.risk_rating === "critical").length}`,
      score: register.length === 0 ? 30 : Math.min(100, 60 + Math.min(40, Math.log10(register.length + 1) * 20)),
    },
  ].map((p) => ({ ...p, score: Math.round(p.score), label: scoreLabel(Math.round(p.score)) }));

  const overall = Math.round(pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length);

  const body = `1. PURPOSE

This self-assessment scores the [Reporting Entity] AML and CFT programme for the year ${targetYear} against five pillars derived from the evidence held in the compliance automation archive. It is produced deterministically and contains no narrative that has not been supported by a file in history/.

The output is a DRAFT for the MLRO to review, amend, and present to the Board alongside the Annual MLRO Report and the Annual Enterprise-Wide Risk Assessment.

2. OVERALL SCORE

Overall programme effectiveness score: ${overall}/100 (${scoreLabel(overall)})

3. SCORES BY PILLAR

${renderTable(pillars, [
  { key: "pillar", header: "PILLAR", max: 38 },
  { key: "score", header: "SCORE", max: 7 },
  { key: "label", header: "RATING", max: 14 },
  { key: "evidence", header: "EVIDENCE", max: 50 },
])}

4. INTERPRETATION

The score in section 2 is an internal indicator only. It reflects the presence of archived artefacts in the repository, not the underlying quality of the decisions the MLRO recorded in those artefacts. The Board and the MLRO may reach a different view after reading the referenced documents.

5. MLRO ACTION

Review each pillar score above, read the referenced artefacts for any pillar scoring below 70, and record the MLRO's own rating in the space below on the final document. Any difference between the automation score and the MLRO rating is a useful audit signal and should be noted in the Board pack.`;

  const document = wrapDocument({
    title: "Annual Programme Effectiveness Self-Assessment",
    subtitle: `Year ${targetYear}`,
    reference: `HSV2-APE-${targetYear}`,
    timeOfDay: "10:00",
    coverage: `01 January ${targetYear} to 31 December ${targetYear}`,
    body,
  });

  await tryArchive(
    () => writeHistory(path.join("annual", `programme-effectiveness-${targetYear}.txt`), document),
    "programme-effectiveness",
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
      subject: `HSV2 / Annual Programme Effectiveness Self-Assessment — ${targetYear}`,
      body: document,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
