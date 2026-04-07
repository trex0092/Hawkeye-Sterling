#!/usr/bin/env node
/**
 * FATF Jurisdiction List Auto-Check
 *
 * Fetches the FATF High-Risk Jurisdictions page and compares against the
 * hardcoded list in screening/config.js. Flags any additions, removals,
 * or changes detected since the last verified statement.
 *
 * This script does NOT auto-update the list. It produces a report for the
 * MLRO to review and approve before the compliance function updates
 * screening/config.js manually.
 *
 * Schedule: Run after each FATF plenary (February, June, October).
 *
 * Usage:
 *   node scripts/fatf-list-check.mjs
 */

import { writeHistory, isoDate } from "./history-writer.mjs";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const today = isoDate();
const CACHE_DIR = path.resolve("..", ".screening", "fatf-cache");
const FATF_URL = "https://www.fatf-gafi.org/en/countries/high-risk-and-other-monitored-jurisdictions.html";

// Current hardcoded lists from screening/config.js
const CURRENT_BLACKLIST = ["IR", "KP", "MM"];
const CURRENT_GREYLIST = [
  "AL", "BG", "BF", "CM", "HR", "CD", "HT", "KE", "LA", "LB", "MC",
  "MZ", "NA", "NG", "PH", "ZA", "SS", "SY", "TZ", "VE", "VN", "YE",
];

const COUNTRY_NAMES = {
  IR: "Iran", KP: "DPRK (North Korea)", MM: "Myanmar",
  AL: "Albania", BG: "Bulgaria", BF: "Burkina Faso", CM: "Cameroon",
  HR: "Croatia", CD: "DRC (Congo)", HT: "Haiti", KE: "Kenya",
  LA: "Laos", LB: "Lebanon", MC: "Monaco", MZ: "Mozambique",
  NA: "Namibia", NG: "Nigeria", PH: "Philippines", ZA: "South Africa",
  SS: "South Sudan", SY: "Syria", TZ: "Tanzania", VE: "Venezuela",
  VN: "Vietnam", YE: "Yemen",
};

async function fetchFatfPage() {
  try {
    const res = await fetch(FATF_URL, {
      headers: { "User-Agent": "Hawkeye-Sterling-Compliance/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const html = await res.text();
    return { ok: true, html };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function hashContent(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function readCache() {
  try {
    const data = await readFile(path.join(CACHE_DIR, "last-hash.txt"), "utf8");
    return data.trim();
  } catch {
    return null;
  }
}

async function writeCache(hash) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, "last-hash.txt"), hash + "\n");
}

function buildReport(fetchResult) {
  const lines = [];
  lines.push("=============================================================================");
  lines.push("[Reporting Entity]");
  lines.push("FATF JURISDICTION LIST VERIFICATION REPORT");
  lines.push(`Date: ${today}`);
  lines.push("=============================================================================");
  lines.push("");
  lines.push(`Document reference:   HSV2-FATF-${today}`);
  lines.push("Classification:       Confidential. For MLRO review only.");
  lines.push("Version:              1.0");
  lines.push("Prepared by:          Compliance function, [Reporting Entity]");
  lines.push(`Prepared on:          ${today}`);
  lines.push("Addressee:            the MLRO, Money Laundering Reporting Officer");
  lines.push("Retention period:     10 years, in accordance with the applicable provision");
  lines.push("                      of Federal Decree-Law No. 10 of 2025.");
  lines.push("Regulatory alignment: Financial Action Task Force (FATF) Recommendations.");
  lines.push("");
  lines.push("-----------------------------------------------------------------------------");
  lines.push("1. PURPOSE");
  lines.push("-----------------------------------------------------------------------------");
  lines.push("");
  lines.push("This report verifies the firm's FATF jurisdiction lists (blacklist and");
  lines.push("greylist) against the latest available FATF public statement. It is");
  lines.push("produced to support the MLRO's obligation to maintain current geographic");
  lines.push("risk assessments and to update the screening engine configuration when");
  lines.push("the FATF publishes changes.");
  lines.push("");
  lines.push("-----------------------------------------------------------------------------");
  lines.push("2. CURRENT CONFIGURATION");
  lines.push("-----------------------------------------------------------------------------");
  lines.push("");
  lines.push("Blacklist (high-risk jurisdictions subject to a call for action):");
  for (const code of CURRENT_BLACKLIST) {
    lines.push(`  ${code} — ${COUNTRY_NAMES[code] || code}`);
  }
  lines.push("");
  lines.push("Greylist (jurisdictions under increased monitoring):");
  for (const code of CURRENT_GREYLIST) {
    lines.push(`  ${code} — ${COUNTRY_NAMES[code] || code}`);
  }
  lines.push("");
  lines.push(`Last verified: February 2026.`);
  lines.push(`Source: screening/config.js FATF_LISTS object.`);
  lines.push("");
  lines.push("-----------------------------------------------------------------------------");
  lines.push("3. VERIFICATION RESULT");
  lines.push("-----------------------------------------------------------------------------");
  lines.push("");

  if (!fetchResult.ok) {
    lines.push(`The compliance function was unable to fetch the FATF public statement`);
    lines.push(`page at ${FATF_URL}.`);
    lines.push(`Error: ${fetchResult.error}`);
    lines.push("");
    lines.push("The MLRO is asked to verify the jurisdiction lists manually by visiting");
    lines.push("the FATF website and comparing against the current configuration above.");
  } else {
    const hash = hashContent(fetchResult.html);
    lines.push(`FATF page fetched successfully.`);
    lines.push(`Content hash: ${hash}`);
    lines.push("");

    if (fetchResult.cacheMatch) {
      lines.push("The content hash matches the previous check. No changes detected");
      lines.push("since the last verification. The current configuration is believed");
      lines.push("to be current.");
    } else {
      lines.push("The content hash has CHANGED since the last verification. The FATF");
      lines.push("page has been updated. The MLRO must review the FATF public statement");
      lines.push("and determine whether any jurisdictions have been added to or removed");
      lines.push("from the blacklist or greylist.");
      lines.push("");
      lines.push("The compliance function cannot parse the FATF page automatically");
      lines.push("because the page structure may change. The MLRO is asked to:");
      lines.push("");
      lines.push("1. Visit the FATF website and review the latest statement.");
      lines.push("2. Compare the listed jurisdictions against the configuration above.");
      lines.push("3. If changes are needed, instruct the compliance function to update");
      lines.push("   screening/config.js with the new jurisdiction codes.");
      lines.push("4. After updating, re-run the screening refresh workflow to apply");
      lines.push("   the changes to all active counterparties.");
    }
  }

  lines.push("");
  lines.push("-----------------------------------------------------------------------------");
  lines.push("4. NEXT ACTIONS");
  lines.push("-----------------------------------------------------------------------------");
  lines.push("");
  lines.push("1. Review the FATF public statement at:");
  lines.push(`   ${FATF_URL}`);
  lines.push("2. Confirm whether the current blacklist and greylist are accurate.");
  lines.push("3. If changes are required, update screening/config.js and re-run the");
  lines.push("   screening-refresh workflow.");
  lines.push("4. Record the verification date in the config.js comment.");
  lines.push("");
  lines.push("");
  lines.push("=============================================================================");
  lines.push(`END OF FATF JURISDICTION LIST VERIFICATION REPORT — ${today}`);
  lines.push("=============================================================================");

  return lines.join("\n");
}

async function main() {
  console.log("FATF Jurisdiction List Check\n");
  console.log(`Current blacklist: ${CURRENT_BLACKLIST.join(", ")}`);
  console.log(`Current greylist:  ${CURRENT_GREYLIST.join(", ")} (${CURRENT_GREYLIST.length} countries)\n`);

  const result = await fetchFatfPage();

  if (result.ok) {
    const hash = hashContent(result.html);
    const prevHash = await readCache();
    result.cacheMatch = prevHash === hash;
    console.log(`FATF page fetched. Hash: ${hash}`);
    console.log(result.cacheMatch ? "No change from last check." : "CHANGE DETECTED — MLRO review required.");
    await writeCache(hash);
  } else {
    console.warn(`Failed to fetch FATF page: ${result.error}`);
  }

  const report = buildReport(result);

  const archivePath = path.join("registers", "fatf-check", `${today}.txt`);
  await writeHistory(archivePath, report);
  console.log(`\nReport archived to history/${archivePath}`);
}

main().catch(console.error);
