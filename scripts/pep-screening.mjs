/**
 * PEP (Politically Exposed Person) screening layer.
 *
 * Cross-checks the counterparty register against a PEP source list
 * maintained by the MLRO at history/registers/pep-list.csv. The CSV
 * has columns: name, country, position, source, date_added.
 *
 * Matching logic is the same normalised-name approach used by the
 * sanctions screening: lowercase, strip diacritics, collapse whitespace,
 * substring match with a minimum length threshold.
 *
 * The report is archived and attached to the portfolio pinned task.
 * Deterministic. No Claude calls.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  readCounterpartyRegister,
  renderTable,
  parseCsvLine,
  CONFIRMED_REFERENCES,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";
import { renderDocxBuffer } from "./lib/docx-writer.mjs";

const env = readCommonEnv({ requireClaude: false });
const today = isoDate();
const asanaClient = createAsanaClient(env);

function normaliseName(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readPepList() {
  try {
    const text = await readFile(
      path.resolve(process.cwd(), "..", "history", "registers", "pep-list.csv"),
      "utf8",
    );
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) return [];
    const header = parseCsvLine(lines[0]);
    return lines.slice(1).map((l) => {
      const cells = parseCsvLine(l);
      const obj = {};
      header.forEach((h, i) => { obj[h.trim()] = (cells[i] ?? "").trim(); });
      return obj;
    });
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`pep-list.csv read: ${err.message}`);
    return [];
  }
}

function matchCounterparties(counterparties, pepList, minLen) {
  const hits = [];
  for (const row of counterparties) {
    const candidate = normaliseName(row.counterparty_name);
    if (!candidate || candidate.length < minLen) continue;
    const matches = pepList.filter((p) => {
      const pName = normaliseName(p.name);
      if (pName.length < minLen) return false;
      return pName === candidate || pName.includes(candidate) || candidate.includes(pName);
    });
    if (matches.length > 0) {
      hits.push({
        counterparty: row.counterparty_name,
        jurisdiction: row.jurisdiction ?? "",
        entities: row.entities_touching ?? "",
        pepMatches: matches.map((m) =>
          `${m.name} [${m.country ?? ""}, ${m.position ?? ""}]`
        ).join(" | "),
      });
    }
  }
  return hits;
}

function buildReport(hits, counts) {
  const body = [
    "SCOPE",
    "",
    "We performed the PEP screening cross-check today.",
    `We compared the counterparty register (${counts.counterparties} records) against the`,
    `PEP source list (${counts.pep} entries) maintained by the MLRO.`,
    "",
    "METHOD",
    "",
    "Names were normalised by lowercasing, removing diacritics and punctuation, and",
    "collapsing whitespace. A counterparty matches a PEP entry when either string",
    "fully contains the other after normalisation and both strings are at least four",
    "characters long. Matches are advisory and require manual confirmation by the MLRO.",
    "",
    "RESULT",
    "",
    hits.length === 0
      ? "No PEP match was recorded today. The counterparty register is clear against the PEP list."
      : `${hits.length} potential PEP match(es) recorded. Each requires MLRO review.`,
    "",
  ];

  if (hits.length > 0) {
    body.push("POTENTIAL PEP MATCHES");
    body.push("");
    body.push(renderTable(hits, [
      { key: "counterparty", header: "Counterparty", max: 35 },
      { key: "jurisdiction", header: "Jurisdiction", max: 15 },
      { key: "entities", header: "Entities", max: 25 },
      { key: "pepMatches", header: "PEP match(es)", max: 60 },
    ]));
    body.push("");
  }

  body.push("NEXT ACTIONS");
  body.push("");
  if (hits.length === 0) {
    body.push("File this screening record. No further action required today.");
  } else {
    body.push("Confirm whether each match is a true PEP, a relative or close associate of a PEP, or a false positive.");
    body.push("For any confirmed PEP, apply Enhanced Due Diligence and document the source of funds and source of wealth.");
    body.push("Update the counterparty register with the PEP status field.");
    body.push("Retain this record for the full ten-year retention period.");
  }

  return wrapDocument({
    title: "PEP Screening Record",
    reference: `HSV2-PEP-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Screening day ${today}`,
    preparedOn: today,
    body: body.join("\n"),
  });
}

async function main() {
  console.log(`▶ PEP screening ${today}`);

  const [counterparties, pepList] = await Promise.all([
    readCounterpartyRegister(),
    readPepList(),
  ]);
  const counts = { counterparties: counterparties.length, pep: pepList.length };
  console.log(`   counterparties: ${counts.counterparties}, PEP entries: ${counts.pep}`);

  const hits = matchCounterparties(counterparties, pepList, 4);
  console.log(`   matches: ${hits.length}`);

  const report = buildReport(hits, counts);
  await tryArchive(
    () => writeHistory(path.join("registers", "pep-screening", `${today}.md`), report),
    `pep-screening ${today}`,
  );

  if (env.DRY_RUN) { console.log("(dry) skipping Asana"); return; }

  try {
    const projects = await asanaClient.listProjects();
    const target = await asanaClient.findPortfolioPinned(projects);
    if (!target) { console.log("   no pinned task — skipping Asana"); return; }
    const docxBuf = renderDocxBuffer(report);
    await asanaClient.attachFile(target.taskGid, docxBuf, `pep-screening-${today}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const headline = [
      `HSV2 / PEP Screening / ${today}`,
      "",
      `Counterparties: ${counts.counterparties}  |  PEP list: ${counts.pep}  |  Matches: ${hits.length}`,
      "",
      hits.length > 0 ? "Potential PEP matches detected. Review attached report." : "No matches today.",
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
