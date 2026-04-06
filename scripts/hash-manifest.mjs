/**
 * Cryptographic hash manifest generator.
 *
 * Walks the entire history/ folder, computes a SHA256 fingerprint of
 * every file, and writes a rolling manifest at
 * history/registers/hash-manifest/YYYY-MM-DD.txt.
 *
 * If a previous manifest exists, the script compares and reports any
 * files whose hash has changed (possible tampering), any files that
 * were deleted, and any new files added since the last manifest.
 *
 * The manifest itself is committed to the repo, so any attempt to
 * alter a historical artefact without also updating the manifest is
 * detectable by comparing the manifest against the actual file hashes.
 *
 * Deterministic. No Claude calls. No Asana posting (pure integrity check).
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  readCommonEnv,
  wrapDocument,
  renderTable,
  CONFIRMED_REFERENCES,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";

const env = readCommonEnv({ requireClaude: false });
const today = isoDate();
const HISTORY_ROOT = path.resolve(process.cwd(), "..", "history");

async function walkDir(dir) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip the hash-manifest folder itself to avoid circular hashing
      if (entry.name === "hash-manifest") continue;
      files.push(...await walkDir(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function hashFile(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function readPreviousManifest() {
  const dir = path.join(HISTORY_ROOT, "registers", "hash-manifest");
  try {
    const files = await readdir(dir);
    const manifests = files.filter((f) => f.endsWith(".manifest")).sort();
    if (manifests.length === 0) return null;
    const last = manifests[manifests.length - 1];
    const text = await readFile(path.join(dir, last), "utf8");
    const map = new Map();
    for (const line of text.split("\n")) {
      const parts = line.split("  ");
      if (parts.length >= 2) {
        map.set(parts[1], parts[0]);
      }
    }
    return { file: last, entries: map };
  } catch (err) {
    return null;
  }
}

function buildReport(current, previous, diffResults) {
  const body = [
    "SCOPE",
    "",
    `We computed the SHA256 fingerprint of every file in the history/ archive today.`,
    `Total files hashed: ${current.size}.`,
    "",
    "PURPOSE",
    "",
    "This manifest provides cryptographic integrity assurance for the compliance",
    "archive. If any file in history/ is modified after the fact, the next manifest",
    "run will detect the hash mismatch and report it as a potential tampering event.",
    "The manifest is committed to the repository alongside the archive, so the git",
    "history provides an independent record of when each hash was computed.",
    "",
    "INTEGRITY CHECK RESULT",
    "",
  ];

  if (!previous) {
    body.push("This is the first manifest. No comparison is possible. Baseline established.");
  } else {
    body.push(`Compared against previous manifest: ${previous.file}`);
    body.push("");

    if (diffResults.changed.length === 0 && diffResults.deleted.length === 0) {
      body.push("All existing files match their previously recorded hashes. No tampering detected.");
    }

    if (diffResults.changed.length > 0) {
      body.push("");
      body.push("HASH MISMATCHES (possible tampering or legitimate update)");
      body.push("");
      body.push(renderTable(
        diffResults.changed.map((c) => ({
          file: c.file.slice(0, 70),
          oldHash: c.oldHash.slice(0, 16) + "...",
          newHash: c.newHash.slice(0, 16) + "...",
        })),
        [
          { key: "file", header: "File", max: 70 },
          { key: "oldHash", header: "Previous hash", max: 20 },
          { key: "newHash", header: "Current hash", max: 20 },
        ],
      ));
    }

    if (diffResults.deleted.length > 0) {
      body.push("");
      body.push("DELETED FILES (present in previous manifest but missing today)");
      body.push("");
      for (const d of diffResults.deleted.slice(0, 30)) {
        body.push(`  ${d}`);
      }
    }

    body.push("");
    body.push(`New files since last manifest: ${diffResults.added.length}`);
  }

  body.push("");
  body.push("NEXT ACTIONS");
  body.push("");
  if (diffResults.changed.length > 0) {
    body.push("Investigate every hash mismatch. If the change was an authorised correction, document it.");
    body.push("If the change was not authorised, treat it as a potential integrity breach and escalate to the MLRO.");
  } else {
    body.push("File this manifest. No action required.");
  }

  return wrapDocument({
    title: "Archive Integrity Manifest",
    reference: `HSV2-HAS-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Integrity check ${today}`,
    preparedOn: today,
    body: body.join("\n"),
  });
}

async function main() {
  console.log(`▶ Hash manifest ${today}`);

  const allFiles = await walkDir(HISTORY_ROOT);
  console.log(`   files found: ${allFiles.length}`);

  const current = new Map();
  for (const filePath of allFiles) {
    const relPath = path.relative(HISTORY_ROOT, filePath);
    try {
      const hash = await hashFile(filePath);
      current.set(relPath, hash);
    } catch (err) {
      console.warn(`   hash failed: ${relPath}: ${err.message}`);
    }
  }
  console.log(`   hashed: ${current.size}`);

  const previous = await readPreviousManifest();
  const diffResults = { changed: [], deleted: [], added: [] };

  if (previous) {
    for (const [file, oldHash] of previous.entries) {
      const newHash = current.get(file);
      if (!newHash) {
        diffResults.deleted.push(file);
      } else if (newHash !== oldHash) {
        diffResults.changed.push({ file, oldHash, newHash });
      }
    }
    for (const file of current.keys()) {
      if (!previous.entries.has(file)) {
        diffResults.added.push(file);
      }
    }
    console.log(`   changed: ${diffResults.changed.length}, deleted: ${diffResults.deleted.length}, new: ${diffResults.added.length}`);
  } else {
    console.log("   first manifest — baseline");
  }

  // Write the raw manifest (hash  filepath)
  const manifestLines = [];
  for (const [file, hash] of [...current.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    manifestLines.push(`${hash}  ${file}`);
  }
  const manifestText = manifestLines.join("\n") + "\n";
  await tryArchive(
    () => writeHistory(path.join("registers", "hash-manifest", `${today}.manifest`), manifestText),
    `manifest ${today}`,
  );

  // Write the human-readable report
  const report = buildReport(current, previous, diffResults);
  await tryArchive(
    () => writeHistory(path.join("registers", "hash-manifest", `${today}-report.md`), report),
    `manifest report ${today}`,
  );

  console.log(`✓ done`);
}

main().catch((err) => { console.error("fatal:", err); process.exit(1); });
