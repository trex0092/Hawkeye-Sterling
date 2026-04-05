/**
 * Regulatory update watcher.
 *
 * Fetches a fixed list of UAE and international regulator pages (MOE,
 * EOCN, CBUAE, FATF), stores a hash of each page body under
 * history/registers/regulatory-cache/, and produces a daily change
 * report at history/registers/regulatory-updates/YYYY-MM-DD.txt.
 *
 * When a page body hash changes compared to the most recent cached
 * snapshot, the change is reported and the new snapshot is stored. The
 * report is attached to the pinned task of the portfolio project and a
 * headline comment is posted.
 *
 * Deterministic. No Claude calls. No HTML parsing. Hash-based diffing
 * only, which is sufficient to surface "something changed on this
 * supervisory page today" and prompt the MLRO to open the page.
 */

import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
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

const env = readCommonEnv();
const today = isoDate();
const asanaClient = createAsanaClient(env);

async function readSourcesConfig() {
  const text = await readFile(path.resolve(process.cwd(), "regulatory-sources.json"), "utf8");
  return JSON.parse(text);
}

async function fetchBody(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "hawkeye-sterling-compliance-automation/1.0",
      Accept: "text/html, text/plain, */*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

function hashBody(body) {
  // Strip whitespace and script/style blocks to reduce noise from
  // tracking scripts that change on every request.
  const cleaned = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(cleaned).digest("hex");
}

async function readPreviousHash(sourceId) {
  const dir = path.resolve(process.cwd(), "..", "history", "registers", "regulatory-cache");
  try {
    const files = await readdir(dir);
    const matching = files
      .filter((f) => f.startsWith(`${sourceId}__`) && f.endsWith(".hash"))
      .sort();
    if (matching.length === 0) return null;
    const last = matching[matching.length - 1];
    const text = await readFile(path.join(dir, last), "utf8");
    return { file: last, hash: text.trim() };
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`  cache read: ${err.message}`);
    return null;
  }
}

function buildReport(results) {
  const changedRows = results
    .filter((r) => r.status === "changed" || r.status === "new")
    .map((r) => ({
      source: r.name,
      authority: r.authority,
      status: r.status,
      url: r.url,
    }));

  const unchangedRows = results
    .filter((r) => r.status === "unchanged")
    .map((r) => ({ source: r.name, authority: r.authority, url: r.url }));

  const errorRows = results
    .filter((r) => r.status === "error")
    .map((r) => ({ source: r.name, authority: r.authority, error: r.error }));

  const body = [
    "SCOPE",
    "",
    `We compared the current content hash of ${results.length} regulator and standard-setter pages`,
    "against the most recent stored snapshot. Any change is reported below and the new snapshot",
    "is committed to the audit archive. No natural-language analysis is performed by this job.",
    "The MLRO opens each changed URL to read the actual update.",
    "",
    "CHANGED OR NEW SOURCES",
    "",
    changedRows.length === 0
      ? "No change detected today against the stored snapshots."
      : renderTable(changedRows, [
          { key: "source", header: "Source", max: 45 },
          { key: "authority", header: "Authority", max: 35 },
          { key: "status", header: "Status", max: 10 },
          { key: "url", header: "URL", max: 60 },
        ]),
    "",
    "UNCHANGED SOURCES",
    "",
    unchangedRows.length === 0
      ? "(none)"
      : renderTable(unchangedRows, [
          { key: "source", header: "Source", max: 45 },
          { key: "authority", header: "Authority", max: 35 },
          { key: "url", header: "URL", max: 60 },
        ]),
    "",
  ];

  if (errorRows.length > 0) {
    body.push("FETCH ERRORS");
    body.push("");
    body.push(
      renderTable(errorRows, [
        { key: "source", header: "Source", max: 45 },
        { key: "authority", header: "Authority", max: 35 },
        { key: "error", header: "Error", max: 60 },
      ]),
    );
    body.push("");
  }

  body.push("NEXT ACTIONS");
  body.push("");
  if (changedRows.length === 0 && errorRows.length === 0) {
    body.push("Close the file for today. Repeat the cross-check tomorrow.");
  } else {
    if (changedRows.length > 0) {
      body.push("Open each changed URL listed above and read the updated page content.");
      body.push("If the change introduces a new obligation, open a task in the compliance workspace with a clear owner and deadline.");
      body.push("If the change revises an existing obligation, update the relevant control, procedure or training material.");
    }
    if (errorRows.length > 0) {
      body.push("Investigate every fetch error. A persistent error indicates the source URL may have moved and the configuration must be updated.");
    }
  }

  return wrapDocument({
    title: "Daily Regulatory Update Watch",
    reference: `HSV2-REG-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Monitoring day ${today}`,
    preparedOn: today,
    body: body.join("\n"),
  });
}

async function main() {
  console.log(`▶ Regulatory watcher ${today}`);

  const config = await readSourcesConfig();
  const results = [];

  for (const source of config.sources) {
    try {
      const body = await fetchBody(source.url);
      const hash = hashBody(body);
      const previous = await readPreviousHash(source.id);
      const status = !previous ? "new" : previous.hash === hash ? "unchanged" : "changed";
      results.push({ ...source, status, hash });
      if (status !== "unchanged") {
        await tryArchive(
          () =>
            writeHistory(
              path.join("registers", "regulatory-cache", `${source.id}__${today}.hash`),
              hash + "\n",
            ),
          `reg-cache ${source.id}`,
        );
      }
      console.log(`   ${source.id}: ${status}`);
    } catch (err) {
      results.push({ ...source, status: "error", error: err.message });
      console.warn(`   ${source.id}: error ${err.message}`);
    }
  }

  const report = buildReport(results);
  await tryArchive(
    () => writeHistory(path.join("registers", "regulatory-updates", `${today}.md`), report),
    `regulatory-updates ${today} (md + docx)`,
  );

  if (env.DRY_RUN) {
    console.log("(dry) skipping Asana posting");
    return;
  }

  try {
    const projects = await asanaClient.listProjects();
    const target = await asanaClient.findPortfolioPinned(projects);
    if (!target) {
      console.log(`   no pinned task in "${env.PORTFOLIO_PROJECT_NAME}" project — skipping Asana post`);
      return;
    }
    const docxBuf = renderDocxBuffer(report);
    const mdBuf = Buffer.from(report, "utf8");
    await asanaClient.attachFile(target.taskGid, mdBuf, `regulatory-watch-${today}.md`, "text/markdown");
    await asanaClient.attachFile(target.taskGid, docxBuf, `regulatory-watch-${today}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const changed = results.filter((r) => r.status === "changed" || r.status === "new");
    const headline = [
      `HSV2 / Regulatory Update Watch / ${today}`,
      "",
      `Sources monitored: ${results.length}`,
      `Changed or new: ${changed.length}`,
      `Errors: ${results.filter((r) => r.status === "error").length}`,
      "",
      changed.length > 0
        ? "Changes detected. Open the attached report to see which sources moved."
        : "No changes today.",
      "",
      `For review by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}.`,
    ].join("\n");
    await asanaClient.postComment(target.taskGid, headline);
    console.log(`   📎 attached + comment posted on ${target.projectName}`);
  } catch (err) {
    console.warn(`   Asana post failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
