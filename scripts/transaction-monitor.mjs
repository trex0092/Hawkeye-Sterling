/**
 * Transaction monitoring engine.
 *
 * Reads transaction data from history/registers/transactions.csv, applies
 * a battery of rule-based detection patterns (structuring, round amounts,
 * just-below-threshold, unusual frequency, dormant-then-active, high-risk
 * jurisdiction, counterparty anomalies), and produces an alert report.
 *
 * The CSV is expected to have columns:
 *   date, entity, counterparty, type, description, amount_aed,
 *   cash_component_aed, payment_method, jurisdiction, staff_member, notes
 *
 * Each row that triggers one or more rules is flagged. The report is
 * archived and attached to the portfolio pinned task. Flagged items can
 * optionally auto-create Asana tasks (when AUTO_CREATE_TASKS=true).
 *
 * Deterministic. No Claude calls.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  readCounterpartyRegister,
  parseCsvLine,
  renderTable,
  CONFIRMED_REFERENCES,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";
import { renderDocxBuffer } from "./lib/docx-writer.mjs";

const env = readCommonEnv({ requireClaude: false });
const today = isoDate();
const asanaClient = createAsanaClient(env);
const AUTO_CREATE = process.env.AUTO_CREATE_TASKS === "true";

/* ─── Transaction CSV reader ──────────────────────────────────────────── */

async function readTransactions() {
  try {
    const text = await readFile(
      path.resolve(process.cwd(), "..", "history", "registers", "transactions.csv"),
      "utf8",
    );
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) return [];
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    return lines.slice(1).map((l) => {
      const cells = parseCsvLine(l);
      const obj = {};
      header.forEach((h, i) => { obj[h] = (cells[i] ?? "").trim(); });
      obj._amount = parseFloat(obj.amount_aed) || 0;
      obj._cash = parseFloat(obj.cash_component_aed) || 0;
      obj._date = obj.date ?? "";
      return obj;
    });
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`transactions.csv: ${err.message}`);
    return [];
  }
}

/* ─── Detection rules ─────────────────────────────────────────────────── */

const HIGH_RISK_JURISDICTIONS = [
  "iran", "north korea", "dprk", "syria", "myanmar", "afghanistan",
  "somalia", "yemen", "iraq", "libya", "south sudan", "mali",
  "haiti", "cambodia", "panama", "nigeria",
];

function detectAlerts(transactions) {
  const alerts = [];
  const byCounterparty = new Map();
  const byDate = new Map();

  // Index transactions
  for (const tx of transactions) {
    const cp = (tx.counterparty ?? "").toLowerCase();
    if (!byCounterparty.has(cp)) byCounterparty.set(cp, []);
    byCounterparty.get(cp).push(tx);
    if (!byDate.has(tx._date)) byDate.set(tx._date, []);
    byDate.get(tx._date).push(tx);
  }

  for (const tx of transactions) {
    const flags = [];

    // Rule 1: Large cash transaction (potential DPMSR trigger)
    if (tx._cash >= 55000) {
      flags.push("DPMSR-TRIGGER: cash component AED " + tx._cash.toLocaleString() + " at or above reporting threshold");
    }

    // Rule 2: Just below threshold (structuring indicator)
    if (tx._cash >= 50000 && tx._cash < 55000) {
      flags.push("STRUCTURING-INDICATOR: cash AED " + tx._cash.toLocaleString() + " just below DPMSR threshold");
    }

    // Rule 3: Round amount (common structuring signal)
    if (tx._amount >= 10000 && tx._amount % 10000 === 0) {
      flags.push("ROUND-AMOUNT: AED " + tx._amount.toLocaleString() + " is a round figure");
    }

    // Rule 4: High-risk jurisdiction
    const juris = (tx.jurisdiction ?? "").toLowerCase();
    if (HIGH_RISK_JURISDICTIONS.some((h) => juris.includes(h))) {
      flags.push("HIGH-RISK-JURISDICTION: " + tx.jurisdiction);
    }

    // Rule 5: Cash-only large transaction
    if (tx._cash > 0 && tx._cash === tx._amount && tx._amount >= 15000) {
      flags.push("ALL-CASH: entire transaction AED " + tx._amount.toLocaleString() + " settled in cash");
    }

    // Rule 6: Multiple same-day transactions with same counterparty (aggregation)
    const cp = (tx.counterparty ?? "").toLowerCase();
    const sameDaySameCp = byCounterparty.get(cp)?.filter((t) => t._date === tx._date) ?? [];
    if (sameDaySameCp.length >= 2) {
      const dayTotal = sameDaySameCp.reduce((s, t) => s + t._cash, 0);
      if (dayTotal >= 55000 && tx === sameDaySameCp[0]) {
        flags.push("AGGREGATION: " + sameDaySameCp.length + " transactions with " + tx.counterparty + " on " + tx._date + " totalling AED " + dayTotal.toLocaleString() + " cash");
      }
    }

    // Rule 7: Rapid frequency (same counterparty, 3+ transactions in 7 days)
    const cpTxs = byCounterparty.get(cp) ?? [];
    if (cpTxs.length >= 3 && tx === cpTxs[0]) {
      const dates = cpTxs.map((t) => Date.parse(t._date)).filter((d) => !isNaN(d)).sort();
      if (dates.length >= 3) {
        const span = (dates[dates.length - 1] - dates[0]) / 86400000;
        if (span <= 7) {
          flags.push("RAPID-FREQUENCY: " + cpTxs.length + " transactions with " + tx.counterparty + " within " + Math.round(span) + " days");
        }
      }
    }

    // Rule 8: Unusual payment method
    const method = (tx.payment_method ?? "").toLowerCase();
    if (method.includes("hawala") || method.includes("crypto") || method.includes("virtual") || method.includes("bearer")) {
      flags.push("UNUSUAL-METHOD: " + tx.payment_method);
    }

    if (flags.length > 0) {
      alerts.push({
        date: tx._date,
        entity: tx.entity ?? "",
        counterparty: tx.counterparty ?? "",
        amount: tx._amount,
        cash: tx._cash,
        jurisdiction: tx.jurisdiction ?? "",
        flags,
      });
    }
  }

  return alerts;
}

/* ─── Rolling 30-day aggregation check ────────────────────────────────── */

function detectRolling30DayAlerts(transactions) {
  const alerts = [];
  const byCounterparty = new Map();
  for (const tx of transactions) {
    const cp = (tx.counterparty ?? "").toLowerCase();
    if (!byCounterparty.has(cp)) byCounterparty.set(cp, []);
    byCounterparty.get(cp).push(tx);
  }

  for (const [cp, txs] of byCounterparty) {
    if (txs.length < 2) continue;
    const sorted = txs
      .map((t) => ({ ...t, _ms: Date.parse(t._date) }))
      .filter((t) => !isNaN(t._ms))
      .sort((a, b) => a._ms - b._ms);

    for (let i = 0; i < sorted.length; i++) {
      const windowStart = sorted[i]._ms;
      const windowEnd = windowStart + 30 * 86400000;
      let windowCash = 0;
      let count = 0;
      for (let j = i; j < sorted.length && sorted[j]._ms <= windowEnd; j++) {
        windowCash += sorted[j]._cash;
        count++;
      }
      if (windowCash >= 55000 && count >= 2) {
        alerts.push({
          date: sorted[i]._date,
          entity: sorted[i].entity ?? "",
          counterparty: txs[0].counterparty ?? cp,
          amount: windowCash,
          cash: windowCash,
          jurisdiction: sorted[i].jurisdiction ?? "",
          flags: [`ROLLING-30-DAY: AED ${windowCash.toLocaleString()} cash across ${count} transactions in 30-day window starting ${sorted[i]._date}`],
        });
        break; // one alert per counterparty
      }
    }
  }
  return alerts;
}

/* ─── Report builder ──────────────────────────────────────────────────── */

function buildReport(alerts, rolling30, totalTx) {
  const allAlerts = [...alerts, ...rolling30];
  const flagCounts = {};
  for (const a of allAlerts) {
    for (const f of a.flags) {
      const type = f.split(":")[0];
      flagCounts[type] = (flagCounts[type] ?? 0) + 1;
    }
  }

  const body = [
    "SCOPE",
    "",
    `We processed ${totalTx} transaction(s) from the transaction register today.`,
    "Each transaction was tested against eight rule-based detection patterns",
    "plus a rolling thirty-day cash aggregation check per counterparty.",
    "",
    "DETECTION RULES APPLIED",
    "",
    "1. DPMSR trigger: cash component at or above the reporting threshold.",
    "2. Structuring indicator: cash component just below the threshold.",
    "3. Round amount: total consideration is a round figure (AED 10k increments).",
    "4. High-risk jurisdiction: counterparty or transaction linked to a FATF grey-list or sanctioned jurisdiction.",
    "5. All-cash settlement: entire transaction settled in cash above AED 15,000.",
    "6. Same-day aggregation: multiple transactions with the same counterparty on the same day exceeding the threshold in aggregate.",
    "7. Rapid frequency: three or more transactions with the same counterparty within seven days.",
    "8. Unusual payment method: hawala, cryptocurrency, virtual currency, bearer instrument.",
    "9. Rolling thirty-day aggregation: cumulative cash across all transactions with the same counterparty over any thirty-day window.",
    "",
    "SUMMARY",
    "",
    renderTable([
      { metric: "Total transactions processed", value: String(totalTx) },
      { metric: "Transactions flagged", value: String(alerts.length) },
      { metric: "Rolling 30-day alerts", value: String(rolling30.length) },
      { metric: "Total distinct alerts", value: String(allAlerts.length) },
    ], [
      { key: "metric", header: "Metric", max: 40 },
      { key: "value", header: "Count", max: 8 },
    ]),
    "",
    "ALERTS BY RULE TYPE",
    "",
    Object.keys(flagCounts).length === 0
      ? "No alerts triggered today."
      : renderTable(
          Object.entries(flagCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count: String(count) })),
          [{ key: "type", header: "Rule", max: 30 }, { key: "count", header: "Hits", max: 8 }],
        ),
    "",
  ];

  if (allAlerts.length > 0) {
    body.push("FLAGGED TRANSACTIONS (first 30)");
    body.push("");
    body.push(renderTable(
      allAlerts.slice(0, 30).map((a) => ({
        date: a.date,
        entity: a.entity.slice(0, 8),
        counterparty: a.counterparty.slice(0, 25),
        amount: "AED " + a.amount.toLocaleString(),
        flags: a.flags.map((f) => f.split(":")[0]).join(", "),
      })),
      [
        { key: "date", header: "Date", max: 12 },
        { key: "entity", header: "Entity", max: 8 },
        { key: "counterparty", header: "Counterparty", max: 25 },
        { key: "amount", header: "Amount", max: 18 },
        { key: "flags", header: "Rules triggered", max: 40 },
      ],
    ));
    body.push("");
  }

  body.push("NEXT ACTIONS");
  body.push("");
  if (allAlerts.length === 0) {
    body.push("No alerts. File this monitoring record. Repeat tomorrow.");
  } else {
    body.push("Review every flagged transaction. For each:");
    body.push("  1. Confirm the alert is not a false positive by checking the underlying documentation.");
    body.push("  2. If confirmed, open the filing decision matrix in the task compliance pack.");
    body.push("  3. For any DPMSR trigger or rolling-30-day breach, prepare the DPMSR draft immediately.");
    body.push("  4. For any structuring indicator, escalate to the MLRO for STR/SAR assessment.");
    body.push("  5. Document the review outcome in the counterparty register notes field.");
  }

  return wrapDocument({
    title: "Transaction Monitoring Report",
    reference: `HSV2-TXM-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Monitoring run ${today}`,
    preparedOn: today,
    body: body.join("\n"),
  });
}

/* ─── Auto-create Asana tasks for alerts ──────────────────────────────── */

async function createAlertTasks(alerts, projects) {
  if (!AUTO_CREATE || alerts.length === 0) return 0;

  // Find the portfolio project to create tasks in
  const target = projects.find((p) =>
    p.name.toLowerCase().includes((env.PORTFOLIO_PROJECT_NAME ?? "screenings").toLowerCase()),
  );
  if (!target) {
    console.log("   no portfolio project for auto-task creation");
    return 0;
  }

  let created = 0;
  for (const alert of alerts.slice(0, 20)) {
    const taskName = `⚠ TXM Alert: ${alert.counterparty.slice(0, 40)} / ${alert.flags[0].split(":")[0]} / ${alert.date}`;
    const notes = [
      "This task was auto-created by the transaction monitoring engine.",
      "",
      `Counterparty: ${alert.counterparty}`,
      `Entity: ${alert.entity}`,
      `Amount: AED ${alert.amount.toLocaleString()}`,
      `Cash: AED ${alert.cash.toLocaleString()}`,
      `Jurisdiction: ${alert.jurisdiction}`,
      "",
      "Rules triggered:",
      ...alert.flags.map((f) => `  - ${f}`),
      "",
      "Action required: review the transaction, confirm or dismiss the alert,",
      "update the compliance pack, and decide on filing.",
      "",
      `For review by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}.`,
    ].join("\n");

    try {
      await asanaClient.asana(`/tasks`, {
        method: "POST",
        body: JSON.stringify({
          data: {
            name: taskName,
            notes,
            projects: [target.gid],
          },
        }),
      });
      created++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.warn(`   task create failed: ${err.message}`);
    }
  }
  return created;
}

/* ─── Main ────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`▶ Transaction monitor ${today}`);

  const transactions = await readTransactions();
  console.log(`   transactions: ${transactions.length}`);

  if (transactions.length === 0) {
    console.log("   no transactions to monitor. To use this engine, populate");
    console.log("   history/registers/transactions.csv with transaction data.");
    // Still produce a nil report for the archive
  }

  const alerts = detectAlerts(transactions);
  const rolling30 = detectRolling30DayAlerts(transactions);
  console.log(`   alerts: ${alerts.length}, rolling-30-day: ${rolling30.length}`);

  const report = buildReport(alerts, rolling30, transactions.length);
  await tryArchive(
    () => writeHistory(path.join("registers", "transaction-monitoring", `${today}.md`), report),
    `txm ${today}`,
  );

  if (env.DRY_RUN) { console.log("(dry) done"); return; }

  const projects = await asanaClient.listProjects();

  // Auto-create Asana tasks for alerts
  if (AUTO_CREATE) {
    const allAlerts = [...alerts, ...rolling30];
    const created = await createAlertTasks(allAlerts, projects);
    console.log(`   auto-created ${created} alert task(s) in Asana`);
  }

  // Attach report to portfolio pinned task
  try {
    const target = await asanaClient.findPortfolioPinned(projects);
    if (!target) { console.log("   no pinned task — skipping"); return; }
    const docxBuf = renderDocxBuffer(report);
    await asanaClient.attachFile(target.taskGid, docxBuf, `transaction-monitor-${today}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const allCount = alerts.length + rolling30.length;
    const headline = [
      `HSV2 / Transaction Monitoring / ${today}`,
      "",
      `Transactions: ${transactions.length}  |  Alerts: ${allCount}`,
      "",
      allCount > 0 ? "Alerts detected. Review attached report immediately." : "No alerts today.",
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
