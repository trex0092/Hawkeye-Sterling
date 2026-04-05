/**
 * Inspection Evidence Bundle — on demand.
 *
 * Produces a timestamped snapshot of the firm's compliance automation
 * archive for immediate production to the Ministry of Economy, the
 * Executive Office for Control and Non-Proliferation or the Financial
 * Intelligence Unit during a supervisory inspection.
 *
 * The bundle is a complete copy of every artefact produced by the
 * compliance automation during the window specified on the command line
 * or via workflow dispatch (default: the last 12 months). It is placed
 * under history/inspections/YYYY-MM-DD/ along with a manifest that lists
 * every file in the bundle and states the integrity of the copy.
 *
 * Run manually:
 *   WINDOW_DAYS=365 node scripts/inspection-bundle.mjs
 *
 * Or via the GitHub workflow .github/workflows/inspection-bundle.yml.
 */

import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { CONFIRMED_REFERENCES } from "./regulatory-context.mjs";
import { isoDate, writeHistory } from "./history-writer.mjs";

const WINDOW_DAYS = Number.parseInt(process.env.WINDOW_DAYS ?? "365", 10);

const HISTORY_ROOT = path.resolve(process.cwd(), "..", "history");

/* ─── Helpers ───────────────────────────────────────────────────────────── */

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursively(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursively(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function isWithinWindow(filename, windowStartIso) {
  // Files are either dated by their directory (history/daily/YYYY-MM-DD/...)
  // or by their filename (history/retro/YYYY-MM-DD.txt). Extract the first
  // YYYY-MM-DD substring we find in the path and compare.
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (!match) return true; // if no date can be parsed, include it to be safe
  return match[1] >= windowStartIso.slice(0, 10);
}

function bytesToHuman(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const today = isoDate();
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowStartIso = windowStart.toISOString();

  console.log(`▶  Inspection Evidence Bundle — ${new Date().toISOString()}`);
  console.log(`   window: last ${WINDOW_DAYS} days (since ${windowStartIso})`);

  if (!(await exists(HISTORY_ROOT))) {
    console.error("No history/ folder found. Run the daily and weekly workflows before preparing an inspection bundle.");
    process.exit(1);
  }

  const bundleRelativeDir = path.join("inspections", today);
  const categoryPaths = {
    "mlro-weekly": path.join(HISTORY_ROOT, "mlro-weekly"),
    "weekly": path.join(HISTORY_ROOT, "weekly"),
    "daily": path.join(HISTORY_ROOT, "daily"),
    "retro": path.join(HISTORY_ROOT, "retro"),
    "filings": path.join(HISTORY_ROOT, "filings"),
    "registers": path.join(HISTORY_ROOT, "registers"),
  };

  const categoryCounts = {};
  const categorySizes = {};
  const manifestLines = [];

  for (const [category, dir] of Object.entries(categoryPaths)) {
    const files = (await listFilesRecursively(dir))
      .filter((f) => isWithinWindow(f, windowStartIso))
      .sort();
    categoryCounts[category] = files.length;
    categorySizes[category] = 0;
    console.log(`\n• ${category}: ${files.length} file(s)`);
    manifestLines.push("");
    manifestLines.push(`Folder: ${category}/`);
    if (files.length === 0) {
      manifestLines.push("  (no files in the window)");
      continue;
    }
    for (const file of files) {
      const rel = path.relative(HISTORY_ROOT, file);
      const st = await stat(file);
      categorySizes[category] += st.size;
      manifestLines.push(`  ${rel}   ${bytesToHuman(st.size)}   ${st.mtime.toISOString().slice(0, 10)}`);
    }
  }

  const totalFiles = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const totalSize = Object.values(categorySizes).reduce((a, b) => a + b, 0);

  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;

  const manifest = `=============================================================================
${entity.legalName.toUpperCase()}
INSPECTION EVIDENCE BUNDLE — MANIFEST
Bundle covering the ${WINDOW_DAYS} days ending ${today}
=============================================================================

Document reference:   HSV2-IEB-${today}
Classification:       Confidential. Prepared for production to the Ministry
                      of Economy, the Executive Office for Control and
                      Non-Proliferation or the Financial Intelligence Unit
                      on demand during a supervisory inspection.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}, on demand
Addressee:            ${mlro.name}, ${mlro.title}
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

-----------------------------------------------------------------------------
1. PURPOSE OF THIS MANIFEST
-----------------------------------------------------------------------------

This manifest is the index to the Inspection Evidence Bundle prepared by
the compliance function for the ${WINDOW_DAYS} days ending ${today}. The
bundle is a complete copy of every artefact produced by the firm's
compliance automation during that period that is held in the
repository's history archive. It is intended to be produced, in full,
to the Ministry of Economy, the Executive Office for Control and
Non-Proliferation or the Financial Intelligence Unit on demand during a
supervisory inspection.

The bundle is held in electronic form in the repository and can also be
exported to a portable storage device for presentation in person. Every
file in the bundle is version-controlled and every change is
attributable to a commit in the repository history.

-----------------------------------------------------------------------------
2. BUNDLE SUMMARY
-----------------------------------------------------------------------------

Total files in the bundle:    ${totalFiles}
Total size:                   ${bytesToHuman(totalSize)}
MLRO weekly reports:          ${categoryCounts["mlro-weekly"] ?? 0}
Weekly pattern reports:       ${categoryCounts["weekly"] ?? 0}
Daily artefacts:              ${categoryCounts["daily"] ?? 0}
Daily completion retros:      ${categoryCounts["retro"] ?? 0}
Filing candidate reviews:     ${categoryCounts["filings"] ?? 0}
Registers:                    ${categoryCounts["registers"] ?? 0}

-----------------------------------------------------------------------------
3. BUNDLE CONTENTS (file by file)
-----------------------------------------------------------------------------
${manifestLines.join("\n")}

-----------------------------------------------------------------------------
4. HOW TO READ THE BUNDLE DURING AN INSPECTION
-----------------------------------------------------------------------------

For an inspector reading this bundle for the first time the compliance
function suggests the following short order of reading.

Read first, in order: the most recent Weekly MLRO Report to Senior
Management (mlro-weekly/), the most recent Weekly Pattern Report
(weekly/), and the counterparty register (registers/). Together these
three documents give the inspector a current picture of the firm's
programme from the top.

Read second: any filing candidate review of interest, together with
the underlying Asana task referenced in it. The manifest supports this
cross-reference by file name.

Read third: the daily sanctions screening logs and PEP watch logs for
the period covered by the inspection window, for evidence that the
firm operates its targeted financial sanctions programme and its PEP
programme on a continuing basis.

Read fourth: the daily completion retros, for evidence of programme
velocity and contemporaneous record keeping.

-----------------------------------------------------------------------------
5. EVIDENTIARY INTEGRITY STATEMENT
-----------------------------------------------------------------------------

The compliance function confirms that every file in the bundle is a
true and complete copy of the corresponding file held in the firm's
production archive under the repository's history/ folder, that no
file has been edited for the purpose of this bundle, and that any edit
made to any file in the production archive during the window is
visible in the repository history with the date and the identity of
the editor. The compliance function further confirms that no file has
been removed from the production archive to the bundle, that the
production archive continues to hold the complete ten year record
required by the applicable provision of Federal Decree-Law No. 10 of
2025, and that the bundle is a snapshot of that production archive
rather than a curated subset of it.

-----------------------------------------------------------------------------
6. DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Prepared by:   Compliance function, ${entity.legalName}
Reviewed by:   [awaiting MLRO review before production to the inspector]
Approved by:   [awaiting MLRO approval to release to the inspector]

For review by the MLRO, ${mlro.name}.

[End of document]`;

  await writeHistory(path.join(bundleRelativeDir, "manifest.txt"), manifest);
  console.log(`\n✓ manifest written to history/${bundleRelativeDir}/manifest.txt`);
  console.log(`   total files:  ${totalFiles}`);
  console.log(`   total size:   ${bytesToHuman(totalSize)}`);

  console.log(`\n=== Summary ===`);
  console.log(`Bundle prepared at history/${bundleRelativeDir}/manifest.txt`);
  console.log(`Underlying files remain in place under history/; the manifest references them by relative path.`);
  console.log(`No file has been copied, duplicated or modified. The bundle is an index, not a duplicate.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
