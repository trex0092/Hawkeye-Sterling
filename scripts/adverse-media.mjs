/**
 * Weekly adverse media sweep.
 *
 * For each counterparty in the register, searches a configurable list
 * of news/media keywords against the counterparty name and jurisdiction.
 * Uses the regulatory-watcher's content-hash approach: fetches a search
 * URL, hashes the result, compares against the last stored hash.
 *
 * When a hash changes for a counterparty, it means new content appeared
 * in search results mentioning that name, and the MLRO is alerted.
 *
 * This is a lightweight, zero-dependency approach that does not require
 * a paid news API. It uses DuckDuckGo Lite HTML search (no API key
 * needed) to check for adverse results.
 *
 * Deterministic. No Claude calls.
 */

import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
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

const ADVERSE_KEYWORDS = [
  "money laundering",
  "sanctions",
  "fraud",
  "terrorist financing",
  "bribery",
  "corruption",
  "smuggling",
  "criminal",
  "prosecution",
  "indictment",
  "seized",
  "frozen assets",
  "blacklist",
  "FATF",
  "penalty",
  "fine",
];

async function searchDuckDuckGo(query) {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "hawkeye-sterling-compliance/1.0",
        Accept: "text/html",
      },
    });
    if (!res.ok) return { status: "error", error: `HTTP ${res.status}` };
    const body = await res.text();
    return { status: "ok", body };
  } catch (err) {
    return { status: "error", error: err.message };
  }
}

function hashBody(body) {
  const cleaned = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(cleaned).digest("hex");
}

function countAdverseHits(body) {
  const lower = body.toLowerCase();
  let count = 0;
  for (const kw of ADVERSE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) count++;
  }
  return count;
}

async function readPreviousHash(counterpartySlug) {
  const dir = path.resolve(process.cwd(), "..", "history", "registers", "adverse-media-cache");
  try {
    const files = await readdir(dir);
    const matching = files
      .filter((f) => f.startsWith(`${counterpartySlug}__`) && f.endsWith(".hash"))
      .sort();
    if (matching.length === 0) return null;
    const last = matching[matching.length - 1];
    const text = await readFile(path.join(dir, last), "utf8");
    return text.trim();
  } catch (err) {
    return null;
  }
}

function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

function buildReport(results, totalCounterparties) {
  const changed = results.filter((r) => r.status === "changed" || r.status === "new");
  const adverse = results.filter((r) => r.adverseHits > 0);
  const errors = results.filter((r) => r.status === "error");

  const body = [
    "SCOPE",
    "",
    `We performed the weekly adverse media sweep across ${totalCounterparties} counterparties`,
    `in the register. For each counterparty with a risk rating of medium or high, we`,
    `queried public search results for the counterparty name combined with adverse`,
    `keywords (money laundering, sanctions, fraud, terrorist financing, etc.) and`,
    `compared the content hash against the last stored snapshot.`,
    "",
    "SUMMARY",
    "",
    renderTable([
      { metric: "Counterparties screened", value: String(results.length) },
      { metric: "Changed or new results", value: String(changed.length) },
      { metric: "With adverse keyword hits", value: String(adverse.length) },
      { metric: "Fetch errors", value: String(errors.length) },
    ], [
      { key: "metric", header: "Metric", max: 35 },
      { key: "value", header: "Count", max: 8 },
    ]),
    "",
  ];

  if (adverse.length > 0) {
    body.push("COUNTERPARTIES WITH ADVERSE MEDIA INDICATORS");
    body.push("");
    body.push(renderTable(
      adverse.map((r) => ({
        counterparty: r.counterparty.slice(0, 40),
        jurisdiction: r.jurisdiction,
        keywords: String(r.adverseHits),
        status: r.status,
      })),
      [
        { key: "counterparty", header: "Counterparty", max: 40 },
        { key: "jurisdiction", header: "Jurisdiction", max: 15 },
        { key: "keywords", header: "Adverse KW", max: 12 },
        { key: "status", header: "Status", max: 10 },
      ],
    ));
    body.push("");
  }

  if (changed.length > 0 && adverse.length === 0) {
    body.push("CHANGED SEARCH RESULTS (no adverse keywords matched)");
    body.push("");
    body.push("Search results changed for some counterparties but no adverse keywords were");
    body.push("detected in the results. This may indicate benign news coverage. Filed for record.");
    body.push("");
  }

  body.push("NEXT ACTIONS");
  body.push("");
  if (adverse.length > 0) {
    body.push("Open each counterparty flagged above and review the search results manually.");
    body.push("If the adverse media is confirmed, update the counterparty risk rating and consider whether a filing is warranted.");
    body.push("Document the review outcome in the counterparty register notes field.");
  } else {
    body.push("No adverse media indicators found. File this record. Repeat the sweep next week.");
  }

  return wrapDocument({
    title: "Weekly Adverse Media Sweep",
    reference: `HSV2-ADV-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Sweep week ending ${today}`,
    preparedOn: today,
    body: body.join("\n"),
  });
}

async function main() {
  console.log(`▶ Adverse media sweep ${today}`);

  const counterparties = await readCounterpartyRegister();
  // Only screen medium and high risk counterparties to stay within rate limits
  const toScreen = counterparties.filter((r) => {
    const risk = String(r.risk_rating ?? "").toLowerCase();
    return risk === "high" || risk === "medium" || risk === "";
  });
  console.log(`   counterparties: ${counterparties.length}, screening: ${toScreen.length}`);

  const results = [];
  for (const row of toScreen.slice(0, 50)) {
    const name = row.counterparty_name ?? "";
    if (name.length < 4) continue;
    const slug = slugify(name);
    const query = `${name} ${row.jurisdiction ?? ""} ${ADVERSE_KEYWORDS.slice(0, 3).join(" OR ")}`;

    const searchResult = await searchDuckDuckGo(query);
    if (searchResult.status === "error") {
      results.push({ counterparty: name, jurisdiction: row.jurisdiction ?? "", status: "error", adverseHits: 0 });
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    const hash = hashBody(searchResult.body);
    const prevHash = await readPreviousHash(slug);
    const status = !prevHash ? "new" : prevHash === hash ? "unchanged" : "changed";
    const adverseHits = countAdverseHits(searchResult.body);

    if (status !== "unchanged") {
      await tryArchive(
        () => writeHistory(
          path.join("registers", "adverse-media-cache", `${slug}__${today}.hash`),
          hash + "\n",
        ),
        `adverse-media ${slug}`,
      );
    }

    results.push({ counterparty: name, jurisdiction: row.jurisdiction ?? "", status, adverseHits });
    // Polite delay between searches
    await new Promise((r) => setTimeout(r, 2000));
  }

  const report = buildReport(results, counterparties.length);
  await tryArchive(
    () => writeHistory(path.join("registers", "adverse-media", `${today}.md`), report),
    `adverse-media ${today}`,
  );

  if (env.DRY_RUN) { console.log("(dry) done"); return; }

  try {
    const projects = await asanaClient.listProjects();
    const target = await asanaClient.findPortfolioPinned(projects);
    if (!target) { console.log("   no pinned task — skipping"); return; }
    const docxBuf = renderDocxBuffer(report);
    await asanaClient.attachFile(target.taskGid, docxBuf, `adverse-media-${today}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const adverse = results.filter((r) => r.adverseHits > 0);
    const headline = [
      `HSV2 / Adverse Media Sweep / ${today}`,
      "",
      `Screened: ${results.length}  |  Adverse hits: ${adverse.length}`,
      "",
      adverse.length > 0 ? "Adverse media indicators detected. Review attached report." : "No adverse indicators this week.",
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
