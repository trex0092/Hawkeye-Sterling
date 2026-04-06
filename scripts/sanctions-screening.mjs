/**
 * Daily sanctions screening loop.
 *
 * Fetches the UN Security Council Consolidated List (and, when
 * configured, the UAE Local Terrorist List maintained by EOCN), caches
 * the raw payload under history/registers/sanctions-cache/, extracts
 * normalised names, and cross-matches against the counterparty register
 * at history/registers/counterparties.csv.
 *
 * Any hit is recorded in a daily sanctions screening report at
 * history/registers/sanctions-screening/YYYY-MM-DD.md. A Word (.docx)
 * sibling is produced automatically by history-writer.
 *
 * If an Asana project named SCREENINGS (or the project named in
 * PORTFOLIO_PROJECT_NAME) carries a pinned task, the report is also
 * attached to that task and a headline comment is posted.
 *
 * Deterministic. No Claude calls. Designed to be trustworthy and
 * reproducible for a MOE inspector.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  readCounterpartyRegister,
  renderTable,
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

async function readSourcesConfig() {
  const text = await readFile(path.resolve(process.cwd(), "sanctions-sources.json"), "utf8");
  return JSON.parse(text);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "hawkeye-sterling-compliance-automation/1.0",
      Accept: "application/xml, text/xml, text/plain, */*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

function extractNamesFromUnscXml(xml) {
  const names = [];
  const individualRegex = /<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g;
  const entityRegex = /<ENTITY>([\s\S]*?)<\/ENTITY>/g;
  const firstName = /<FIRST_NAME>([^<]*)<\/FIRST_NAME>/;
  const secondName = /<SECOND_NAME>([^<]*)<\/SECOND_NAME>/;
  const thirdName = /<THIRD_NAME>([^<]*)<\/THIRD_NAME>/;
  const fourthName = /<FOURTH_NAME>([^<]*)<\/FOURTH_NAME>/;
  const firstNameEntity = /<FIRST_NAME>([^<]*)<\/FIRST_NAME>/;
  const dataid = /<DATAID>([^<]*)<\/DATAID>/;
  const aliasName = /<ALIAS_NAME>([^<]*)<\/ALIAS_NAME>/g;

  let m;
  while ((m = individualRegex.exec(xml)) !== null) {
    const block = m[1];
    const parts = [
      firstName.exec(block)?.[1],
      secondName.exec(block)?.[1],
      thirdName.exec(block)?.[1],
      fourthName.exec(block)?.[1],
    ].filter(Boolean);
    const id = dataid.exec(block)?.[1] ?? "";
    if (parts.length > 0) {
      names.push({ kind: "individual", id, name: parts.join(" "), raw: parts.join(" ") });
    }
    let a;
    while ((a = aliasName.exec(block)) !== null) {
      if (a[1]) names.push({ kind: "individual-alias", id, name: a[1] });
    }
  }
  while ((m = entityRegex.exec(xml)) !== null) {
    const block = m[1];
    const nm = firstNameEntity.exec(block)?.[1];
    const id = dataid.exec(block)?.[1] ?? "";
    if (nm) names.push({ kind: "entity", id, name: nm });
    let a;
    while ((a = aliasName.exec(block)) !== null) {
      if (a[1]) names.push({ kind: "entity-alias", id, name: a[1] });
    }
  }
  return names;
}

async function readLocalUaeList() {
  try {
    const text = await readFile(
      path.resolve(process.cwd(), "..", "history", "registers", "uae-local-list.csv"),
      "utf8",
    );
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) return [];
    const out = [];
    for (const line of lines.slice(1)) {
      const [id, name, kind = "entity", dateAdded = ""] = line.split(",").map((s) => s.trim());
      if (name) out.push({ kind: `uae-${kind}`, id, name, dateAdded });
    }
    return out;
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`uae-local-list.csv read: ${err.message}`);
    return [];
  }
}

function matchCounterparties(counterparties, sanctionsIndex, minLen) {
  const hits = [];
  for (const row of counterparties) {
    const candidate = normaliseName(row.counterparty_name);
    if (!candidate || candidate.length < minLen) continue;
    const matches = sanctionsIndex.filter((s) => {
      const sName = normaliseName(s.name);
      if (sName.length < minLen) return false;
      if (sName === candidate) return true;
      if (candidate.length >= minLen && sName.includes(candidate)) return true;
      if (sName.length >= minLen && candidate.includes(sName)) return true;
      return false;
    });
    if (matches.length > 0) {
      hits.push({
        counterparty: row.counterparty_name,
        jurisdiction: row.jurisdiction ?? "",
        entities: row.entities_touching ?? "",
        matches: matches.map((m) => `${m.name} [${m.kind}${m.id ? " id=" + m.id : ""}]`).join(" | "),
      });
    }
  }
  return hits;
}

function buildReport(hits, counts) {
  const body = [
    "SCOPE",
    "",
    "We performed the daily sanctions screening cross-check today.",
    `We compared the counterparty register (${counts.counterparties} records) against the`,
    `UN Security Council Consolidated List (${counts.unsc} names) and the UAE Local Terrorist`,
    `List (${counts.uae} names) as implemented by the ${CONFIRMED_REFERENCES.sanctionsAuthority.name}.`,
    "",
    "METHOD",
    "",
    "Names were normalised by lowercasing, removing diacritics and punctuation, and",
    "collapsing whitespace. A counterparty matches a listed name when either string",
    "fully contains the other after normalisation and both strings are at least four",
    "characters long. Partial matches are treated as potential Partial Name Match Reports",
    "and must be reviewed manually before any filing decision.",
    "",
    "RESULT",
    "",
    hits.length === 0
      ? "No match was recorded today. The counterparty register is clear against both lists."
      : `${hits.length} potential match(es) recorded. Each requires MLRO review before any further action.`,
    "",
  ];

  if (hits.length > 0) {
    body.push("POTENTIAL MATCHES");
    body.push("");
    body.push(
      renderTable(hits, [
        { key: "counterparty", header: "Counterparty", max: 35 },
        { key: "jurisdiction", header: "Jurisdiction", max: 15 },
        { key: "entities", header: "Entities touching", max: 25 },
        { key: "matches", header: "Listed name(s) matched", max: 60 },
      ]),
    );
    body.push("");
  }

  body.push("NEXT ACTIONS");
  body.push("");
  if (hits.length === 0) {
    body.push("File this screening record in the audit archive. No further action required today.");
  } else {
    body.push("Escalate every potential match above to the MLRO within one business hour.");
    body.push("Confirm whether each match is a true match, a Partial Name Match, or a false positive.");
    body.push("For any true match, initiate the Funds Freeze Report workflow through the goAML platform.");
    body.push("Retain this record for the full ten-year retention period.");
  }

  const reference = `HSV2-SCN-${today}`;
  return wrapDocument({
    title: "Daily Sanctions Screening Record",
    reference,
    classification: "Confidential. For MLRO review only.",
    coverage: `Screening day ${today}`,
    preparedOn: today,
    body: body.join("\n"),
  });
}

async function main() {
  console.log(`▶ Sanctions screening ${today}`);

  const sourcesConfig = await readSourcesConfig();
  let sanctionsIndex = [];
  const counts = { unsc: 0, uae: 0, counterparties: 0 };

  for (const source of sourcesConfig.sources) {
    if (source.format === "xml" && source.url) {
      try {
        const xml = await fetchText(source.url);
        await tryArchive(
          () => writeHistory(path.join("registers", "sanctions-cache", `${source.id}-${today}.xml`), xml),
          `sanctions cache ${source.id}`,
        );
        const names = extractNamesFromUnscXml(xml);
        counts.unsc += source.id === "unsc-consolidated" ? names.length : 0;
        sanctionsIndex = sanctionsIndex.concat(names);
        console.log(`   ${source.id}: ${names.length} names`);
      } catch (err) {
        console.warn(`   ${source.id}: fetch failed: ${err.message}`);
      }
    } else if (source.format === "manual") {
      const local = await readLocalUaeList();
      counts.uae = local.length;
      sanctionsIndex = sanctionsIndex.concat(local);
      console.log(`   ${source.id}: ${local.length} names (from local CSV)`);
    }
  }

  const counterparties = await readCounterpartyRegister();
  counts.counterparties = counterparties.length;
  console.log(`   counterparty register: ${counterparties.length} rows`);

  const hits = matchCounterparties(counterparties, sanctionsIndex, sourcesConfig.match?.minNameLength ?? 4);
  console.log(`   matches: ${hits.length}`);

  const report = buildReport(hits, counts);
  const mdRelPath = path.join("registers", "sanctions-screening", `${today}.md`);
  await tryArchive(() => writeHistory(mdRelPath, report), `sanctions-screening ${today} (md + docx)`);

  if (env.DRY_RUN) {
    console.log("(dry) skipping Asana posting");
    return;
  }

  try {
    const projects = await asanaClient.listProjects();
    const target = await asanaClient.findPortfolioPinned(projects);
    if (!target) {
      console.log(`   no pinned task found in any "${env.PORTFOLIO_PROJECT_NAME}" project — skipping Asana post`);
      return;
    }
    const docxBuf = renderDocxBuffer(report);
    const mdBuf = Buffer.from(report, "utf8");
    await asanaClient.attachFile(target.taskGid, mdBuf, `sanctions-screening-${today}.md`, "text/markdown");
    await asanaClient.attachFile(target.taskGid, docxBuf, `sanctions-screening-${today}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const headline = [
      `HSV2 / Daily Sanctions Screening / ${today}`,
      "",
      `Counterparties screened: ${counts.counterparties}`,
      `UNSC names loaded: ${counts.unsc}`,
      `UAE Local List names loaded: ${counts.uae}`,
      `Potential matches: ${hits.length}`,
      "",
      hits.length > 0
        ? "Potential matches detected. Review the attached record immediately."
        : "No matches today.",
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
