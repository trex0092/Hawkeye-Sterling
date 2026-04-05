/**
 * History archive writer.
 *
 * Every artefact produced by the compliance automation is written to a
 * deterministic path under the repository's top-level `history/` folder so
 * that the material is retained for the 10 year period required by
 * Federal Decree-Law No. 10 of 2025 and is available to the MLRO and to
 * MOE inspectors on demand.
 *
 * Artefacts are plain UTF-8 text files. Nothing in this folder is pruned.
 *
 * The GitHub workflows commit any changes to `history/` back to the
 * repository at the end of each run, so the archive grows one commit per
 * run and every change is attributable by timestamp and author.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const HISTORY_ROOT = path.resolve(process.cwd(), "..", "history");

/**
 * Turn a free-form project or subject name into a safe filename slug.
 * Preserves casing, strips characters that do not belong in a path.
 */
export function slugify(input) {
  return String(input)
    .replace(/[/\\?%*:|"<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "_")
    .slice(0, 120);
}

/**
 * Today as YYYY-MM-DD. Uses UTC on GitHub runners; the calling script can
 * pass a pre-computed date if a specific timezone is required.
 */
export function isoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * ISO week identifier as YYYY-Www, matching the weekly-report archive path.
 */
export function isoWeek(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Write a single artefact to the archive at an absolute path relative to
 * the `history/` root. Creates intermediate directories as needed.
 *
 * @param {string} relativePath  e.g. "daily/2026-04-05/portfolio-digest.txt"
 * @param {string} content       plain text body to write
 * @returns {Promise<string>}    absolute path written
 */
export async function writeHistory(relativePath, content) {
  const absPath = path.join(HISTORY_ROOT, relativePath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
  return absPath;
}

/**
 * Convenience: write a daily per-project artefact under
 *   history/daily/YYYY-MM-DD/per-project/<slug>.txt
 */
export async function writeDailyPerProject(date, projectName, content) {
  return writeHistory(
    path.join("daily", date, "per-project", `${slugify(projectName)}.txt`),
    content,
  );
}

/**
 * Convenience: write the daily portfolio digest under
 *   history/daily/YYYY-MM-DD/portfolio-digest.txt
 */
export async function writeDailyPortfolio(date, content) {
  return writeHistory(
    path.join("daily", date, "portfolio-digest.txt"),
    content,
  );
}

/**
 * Convenience: write a daily investigation preparation note under
 *   history/daily/YYYY-MM-DD/investigation-notes/<slug>.txt
 */
export async function writeInvestigationNote(date, projectName, taskName, content) {
  const fname = `${slugify(projectName)}__${slugify(taskName)}.txt`;
  return writeHistory(
    path.join("daily", date, "investigation-notes", fname),
    content,
  );
}

/**
 * Convenience: write a daily filing-draft candidate under
 *   history/filings/YYYY-MM-DD/<draftReference>.txt
 *
 * draftReference is the string the template placed at the top of the
 * document (e.g. "HSV2-STR-2026-0042").
 */
export async function writeFilingDraft(date, draftReference, content) {
  return writeHistory(
    path.join("filings", date, `${slugify(draftReference)}.txt`),
    content,
  );
}

/**
 * Convenience: write the daily completion retro under
 *   history/retro/YYYY-MM-DD.txt
 */
export async function writeDailyRetro(date, content) {
  return writeHistory(path.join("retro", `${date}.txt`), content);
}

/**
 * Convenience: write the weekly pattern report under
 *   history/weekly/YYYY-Www.txt
 */
export async function writeWeeklyPatternReport(weekId, content) {
  return writeHistory(path.join("weekly", `${weekId}.txt`), content);
}

/**
 * Convenience: write the weekly MLRO report under
 *   history/mlro-weekly/YYYY-Www.txt
 */
export async function writeWeeklyMlroReport(weekId, content) {
  return writeHistory(path.join("mlro-weekly", `${weekId}.txt`), content);
}
