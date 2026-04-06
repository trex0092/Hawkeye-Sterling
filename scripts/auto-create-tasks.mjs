/**
 * Auto-create Asana tasks for compliance red flags.
 *
 * Reads the latest sanctions screening, PEP screening, CDD refresh,
 * and transaction monitoring reports. For each alert or overdue item,
 * creates a task in the appropriate Asana project with the entity code,
 * a clear title, detailed notes, and a due date.
 *
 * This script consolidates alert-to-task creation across all detection
 * engines so the MLRO gets one actionable Asana task per red flag
 * instead of having to read through multiple reports.
 *
 * Deterministic. No Claude calls.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  readCounterpartyRegister,
  CONFIRMED_REFERENCES,
} from "./lib/report-scaffold.mjs";
import { isoDate } from "./history-writer.mjs";

const env = readCommonEnv({ requireClaude: false });
const today = isoDate();
const asanaClient = createAsanaClient(env);

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function in3Days() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

async function readLatestReport(subdir) {
  const dir = path.resolve(process.cwd(), "..", "history", "registers", subdir);
  try {
    const files = await readdir(dir);
    const reports = files.filter((f) => f.endsWith(".md") || f.endsWith(".txt")).sort();
    if (reports.length === 0) return null;
    const latest = reports[reports.length - 1];
    const dateMatch = latest.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch || dateMatch[1] !== today) return null; // only today's reports
    const text = await readFile(path.join(dir, latest), "utf8");
    return { file: latest, text };
  } catch { return null; }
}

function extractSanctionsAlerts(text) {
  if (!text) return [];
  if (text.includes("No match was recorded today")) return [];
  const alerts = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.includes("POTENTIAL MATCHES") || line.includes("---") || line.includes("Counterparty")) continue;
    // Try to parse table rows
    const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && !parts[0].startsWith("(")) {
      alerts.push({
        type: "SANCTIONS",
        counterparty: parts[0],
        detail: parts.slice(1).join(" | "),
        priority: "immediate",
      });
    }
  }
  return alerts;
}

function extractPepAlerts(text) {
  if (!text) return [];
  if (text.includes("No PEP match was recorded today")) return [];
  const alerts = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.includes("POTENTIAL PEP") || line.includes("---") || line.includes("Counterparty")) continue;
    const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && !parts[0].startsWith("(")) {
      alerts.push({
        type: "PEP",
        counterparty: parts[0],
        detail: parts.slice(1).join(" | "),
        priority: "within-48h",
      });
    }
  }
  return alerts;
}

function extractCddAlerts(text) {
  if (!text) return [];
  const alerts = [];
  // Look for overdue and critical items
  const sections = text.split(/\n(?=OVERDUE|CRITICAL)/);
  for (const section of sections) {
    if (!section.startsWith("OVERDUE") && !section.startsWith("CRITICAL")) continue;
    const isOverdue = section.startsWith("OVERDUE");
    const lines = section.split("\n");
    for (const line of lines) {
      const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 3 && !parts[0].startsWith("(") && !parts[0].startsWith("Counterparty") && !parts[0].startsWith("-")) {
        alerts.push({
          type: "CDD-" + (isOverdue ? "OVERDUE" : "CRITICAL"),
          counterparty: parts[0],
          detail: `Risk: ${parts[1]}, Due: ${parts[3] ?? ""}`,
          priority: isOverdue ? "immediate" : "within-48h",
        });
      }
    }
  }
  return alerts;
}

function extractTxmAlerts(text) {
  if (!text) return [];
  if (text.includes("No alerts triggered today") || text.includes("No alerts.")) return [];
  const alerts = [];
  const lines = text.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (line.includes("FLAGGED TRANSACTIONS")) { inTable = true; continue; }
    if (inTable && line.startsWith("NEXT ACTIONS")) break;
    if (!inTable) continue;
    const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 4 && /^\d{4}/.test(parts[0])) {
      alerts.push({
        type: "TXM-" + (parts[4] ?? "ALERT"),
        counterparty: parts[2] ?? "",
        detail: `${parts[3]} on ${parts[0]}. Rules: ${parts[4] ?? ""}`,
        priority: "within-48h",
      });
    }
  }
  return alerts;
}

async function findProjectForEntity(projects, entityCode) {
  const upper = entityCode.toUpperCase();
  for (const p of projects) {
    const re = new RegExp(`(^|[^A-Z0-9])${upper}([^A-Z0-9]|$)`);
    if (re.test(p.name.toUpperCase())) return p;
  }
  return null;
}

async function taskExists(projectGid, alertTitle) {
  // Check if a task with this exact name already exists (avoid duplicates)
  try {
    const page = await asanaClient.asana(
      `/tasks?${new URLSearchParams({
        project: projectGid,
        limit: "100",
        opt_fields: "name",
      })}`,
    );
    return page.data.some((t) => t.name === alertTitle);
  } catch { return false; }
}

async function main() {
  console.log(`▶ Auto-create tasks for red flags ${today}`);
  if (env.DRY_RUN) console.log("   DRY RUN — no tasks will be created");

  const [sanctionsReport, pepReport, cddReport, txmReport] = await Promise.all([
    readLatestReport("sanctions-screening"),
    readLatestReport("pep-screening"),
    readLatestReport("cdd-refresh"),
    readLatestReport("transaction-monitoring"),
  ]);

  const allAlerts = [
    ...extractSanctionsAlerts(sanctionsReport?.text),
    ...extractPepAlerts(pepReport?.text),
    ...extractCddAlerts(cddReport?.text),
    ...extractTxmAlerts(txmReport?.text),
  ];

  console.log(`   alerts found: ${allAlerts.length}`);
  if (allAlerts.length === 0) {
    console.log("   no red flags to create tasks for");
    return;
  }

  const projects = await asanaClient.listProjects();
  const mlro = CONFIRMED_REFERENCES.mlro.name;
  let created = 0;
  let skipped = 0;

  for (const alert of allAlerts.slice(0, 30)) {
    const dueDate = alert.priority === "immediate" ? tomorrow() : in3Days();
    const taskName = `⚠ ${alert.type}: ${alert.counterparty.slice(0, 50)} (${today})`;

    // Try to find the right project based on counterparty register entity
    const counterparties = await readCounterpartyRegister();
    const match = counterparties.find((c) =>
      (c.counterparty_name ?? "").toLowerCase() === alert.counterparty.toLowerCase(),
    );
    const entityCode = match?.entities_touching?.split(",")[0]?.trim() ?? "";
    const project = entityCode
      ? await findProjectForEntity(projects, entityCode)
      : projects[0];

    if (!project) {
      console.log(`   skip ${alert.type}/${alert.counterparty} — no project found`);
      skipped++;
      continue;
    }

    // Check for duplicate
    const exists = await taskExists(project.gid, taskName);
    if (exists) {
      console.log(`   skip ${taskName} — already exists`);
      skipped++;
      continue;
    }

    const notes = [
      `Auto-created by the compliance automation on ${today}.`,
      "",
      `Alert type:    ${alert.type}`,
      `Counterparty:  ${alert.counterparty}`,
      `Priority:      ${alert.priority}`,
      `Detail:        ${alert.detail}`,
      "",
      "Required action:",
      "1. Open this task and review the underlying data.",
      "2. Confirm or dismiss the alert.",
      "3. If confirmed, download the compliance pack attached to the counterparty's",
      "   original task and complete the red-flag assessment and filing decision sections.",
      "4. Update the counterparty register with the outcome.",
      "",
      `For review by the MLRO, ${mlro}.`,
    ].join("\n");

    if (env.DRY_RUN) {
      console.log(`   (dry) would create: ${taskName} in ${project.name}`);
      continue;
    }

    try {
      await asanaClient.asana(`/tasks`, {
        method: "POST",
        body: JSON.stringify({
          data: {
            name: taskName,
            notes,
            projects: [project.gid],
            due_on: dueDate,
          },
        }),
      });
      created++;
      console.log(`   ✓ ${taskName} → ${project.name}`);
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.warn(`   task create failed: ${err.message}`);
    }
  }

  console.log(`\n✓ created=${created} skipped=${skipped}`);
}

main().catch((err) => { console.error("fatal:", err); process.exit(1); });
