#!/usr/bin/env node
/**
 * Attach Compliance Forms to Asana Tasks
 *
 * Generates and attaches relevant regulatory compliance forms to each
 * task in all 6 programme projects. Forms are formal, audit-ready
 * documents citing MOE, EOCN, FIU/goAML, FATF, and Federal Decree-Law
 * No. 10 of 2025.
 *
 * Each task receives a form matching its category (CDD, TFS, TM, RF,
 * FIU, etc.) as a .txt attachment in the Asana Attachments section.
 *
 * Usage:
 *   export ASANA_TOKEN=1/...
 *   node scripts/attach-compliance-forms.mjs
 */

const TOKEN = process.env.ASANA_TOKEN;
if (!TOKEN) { console.error("Set ASANA_TOKEN"); process.exit(1); }

const HEADERS = { Authorization: `Bearer ${TOKEN}` };
const BASE = "https://app.asana.com/api/1.0";

const PROJECTS = [
  { gid: "1213908508433868", name: "FG BRANCH" },
  { gid: "1213908827982041", name: "NAPLES LLC" },
  { gid: "1213908611350810", name: "MADISON LLC" },
  { gid: "1213909833048586", name: "FG LLC" },
  { gid: "1213908611400789", name: "GRAMALTIN AS" },
  { gid: "1213908828069020", name: "ZOE FZE" },
];

const TODAY = new Date().toISOString().slice(0, 10);

async function fetchAllTasks(projectGid) {
  const tasks = [];
  let url = `${BASE}/tasks?project=${projectGid}&opt_fields=name,attachments&limit=100`;
  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    const json = await res.json();
    if (json.data) tasks.push(...json.data);
    url = json.next_page ? json.next_page.uri : null;
  }
  return tasks;
}

async function attachFile(taskGid, filename, content) {
  const boundary = "----FormBoundary" + Date.now();
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch(`${BASE}/tasks/${taskGid}/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  return res.ok;
}

function extractCategory(name) {
  const stripped = name.replace(/^[^\w[(-]*/u, "").trim();
  const cleaned = stripped.replace(/^\[(Critical|High|Medium)\]\s*/i, "").trim();

  if (cleaned.startsWith("CDD-")) return "CDD";
  if (cleaned.startsWith("TFS-")) return "TFS";
  if (cleaned.startsWith("TM-")) return "TM";
  if (cleaned.startsWith("RF-R")) return "RF-RECYCLED";
  if (cleaned.startsWith("RF-M")) return "RF-MINED";
  if (cleaned.startsWith("RF-")) return "RF-GENERAL";
  if (cleaned.startsWith("NRA-RF")) return "NRA";
  if (cleaned.startsWith("RS-RF")) return "RS";
  if (cleaned.startsWith("FIU-RF")) return "FIU-RF";
  if (cleaned.startsWith("FIU-")) return "FIU";
  if (cleaned.startsWith("LBMA-")) return "LBMA";
  if (cleaned.startsWith("RA-")) return "RA";
  if (cleaned.startsWith("HR-")) return "HR";
  if (cleaned.startsWith("RK-")) return "RK";
  if (cleaned.startsWith("ACE-")) return "ACE";
  if (cleaned.startsWith("AIG-")) return "AIG";
  if (cleaned.startsWith("POL-")) return "POL";
  if (cleaned.startsWith("MA-")) return "MA";
  if (cleaned.startsWith("GAP-")) return "GAP";
  if (cleaned.startsWith("TRN-")) return "TRN";
  if (cleaned.startsWith("MOE-")) return "MOE";
  if (cleaned.startsWith("OEC-")) return "OEC";
  if (cleaned.startsWith("ACEP-")) return "ACEP";
  if (cleaned.startsWith("REG-")) return "REG";
  if (cleaned.startsWith("OPS-")) return "OPS";
  if (cleaned.startsWith("QA-")) return "QA";
  if (cleaned.startsWith("GRP-")) return "GRP";
  if (cleaned.startsWith("CBUAE-")) return "CBUAE";
  if (name.includes("MILESTONE")) return "MILESTONE";
  if (name.includes("CDD-CRITICAL")) return "CDD";
  return null;
}

function generateForm(category, taskName) {
  const header = [
    "=============================================================================",
    "[Reporting Entity]",
    `COMPLIANCE SUPPORT FORM — ${category}`,
    `Task: ${taskName}`,
    "=============================================================================",
    "",
    `Document reference:   HSV2-CSF-${category}-${TODAY}`,
    "Classification:       Confidential. For MLRO review only.",
    "Version:              1.0",
    "Prepared by:          Compliance function, [Reporting Entity]",
    `Prepared on:          ${TODAY}`,
    "Addressee:            the MLRO, Money Laundering Reporting Officer",
    "Retention period:     10 years, in accordance with the applicable provision",
    "                      of Federal Decree-Law No. 10 of 2025.",
  ];

  const forms = {
    CDD: {
      alignment: "FATF Recommendation 22 (DNFBPs: customer due diligence).",
      sections: [
        ["REGULATORY BASIS",
          "This task falls under the firm's Customer Due Diligence obligations",
          "as set out in Federal Decree-Law No. 10 of 2025 and aligned with",
          "FATF Recommendation 22 (customer due diligence for DNFBPs).",
          "",
          "The Ministry of Economy, as the supervisory authority for Designated",
          "Non-Financial Businesses and Professions, requires the firm to apply",
          "CDD at the opening of every customer relationship, at the point of",
          "any occasional transaction above the firm's internal threshold, and",
          "at periodic refresh intervals set by the customer risk rating.",
        ],
        ["REQUIRED ACTIONS",
          "1. Verify the identity of the customer using reliable, independent",
          "   source documents, data or information.",
          "2. Identify and verify the beneficial owner.",
          "3. Understand the nature and purpose of the business relationship.",
          "4. Conduct ongoing due diligence on the business relationship.",
          "5. Record and retain all CDD documentation for a minimum of 10 years.",
          "6. Apply Enhanced Due Diligence where the customer is a PEP, is from",
          "   a high-risk jurisdiction on the FATF increased monitoring list,",
          "   or where the risk assessment indicates elevated risk.",
        ],
        ["FILING OBLIGATIONS",
          "If at any point during the CDD process a suspicion arises, the",
          "compliance function must prepare a draft Suspicious Transaction",
          "Report or Suspicious Activity Report for the MLRO's review. The",
          "MLRO is the sole authority for all filings to the Financial",
          "Intelligence Unit through the goAML platform.",
        ],
      ],
    },
    TFS: {
      alignment: "FATF Recommendation 20 (suspicious transaction reporting); EOCN targeted financial sanctions framework.",
      sections: [
        ["REGULATORY BASIS",
          "This task falls under the firm's Targeted Financial Sanctions",
          "obligations as implemented by the Executive Office for Control",
          "and Non-Proliferation (EOCN). The firm must screen all",
          "counterparties against the UN Security Council Consolidated List",
          "and the UAE Local Terrorist List on a daily basis.",
          "",
          "Federal Decree-Law No. 10 of 2025 requires immediate action on",
          "confirmed matches, including asset freezing and reporting to the",
          "EOCN and the Financial Intelligence Unit.",
        ],
        ["REQUIRED ACTIONS",
          "1. Screen the counterparty against the UNSC Consolidated List and",
          "   the UAE Local Terrorist List.",
          "2. If a match is identified, escalate immediately to the MLRO.",
          "3. If the match is confirmed, freeze the counterparty's assets and",
          "   file a Funds Freeze Report with the Financial Intelligence Unit",
          "   through the goAML platform.",
          "4. If the match is partial, file a Partial Name Match Report.",
          "5. Record all screening results in the daily sanctions screening log.",
          "6. Retain all records for a minimum of 10 years.",
        ],
        ["EOCN OBLIGATIONS",
          "The Executive Office for Control and Non-Proliferation administers",
          "the UAE targeted financial sanctions framework. The firm must:",
          "  a. Register on the EOCN National Anti-Money Laundering System.",
          "  b. Screen within 24 hours of list updates.",
          "  c. Report confirmed matches without delay.",
          "  d. Not tip off the customer about any screening or reporting.",
        ],
      ],
    },
    TM: {
      alignment: "FATF Recommendation 20 (suspicious transaction reporting).",
      sections: [
        ["REGULATORY BASIS",
          "This task falls under the firm's Transaction Monitoring programme",
          "maintained under Federal Decree-Law No. 10 of 2025. The firm",
          "applies nine detection rules covering DPMSR triggers, structuring,",
          "round amounts, high-risk jurisdictions, all-cash settlement,",
          "same-day aggregation, rapid frequency, unusual payment methods,",
          "and rolling 30-day aggregation.",
        ],
        ["REQUIRED ACTIONS",
          "1. Review all flagged transactions against the detection rules.",
          "2. Determine whether the alert warrants a filing decision.",
          "3. If a Dealers in Precious Metals and Stones Report is required,",
          "   prepare the draft for the MLRO's review.",
          "4. If the transaction is suspicious, prepare an STR or SAR draft.",
          "5. The MLRO files all reports through the goAML platform operated",
          "   by the Financial Intelligence Unit.",
          "6. Retain all monitoring records for a minimum of 10 years.",
        ],
        ["REPORTING OBLIGATIONS",
          "The firm must report through the goAML platform:",
          "  a. Suspicious Transaction Reports (STR)",
          "  b. Suspicious Activity Reports (SAR)",
          "  c. Dealers in Precious Metals and Stones Reports (DPMSR)",
          "  d. Partial Name Match Reports (PNMR)",
          "  e. Funds Freeze Reports (FFR)",
          "",
          "The MLRO is the sole authority for all filings.",
        ],
      ],
    },
    FIU: {
      alignment: "FATF Recommendation 20 (suspicious transaction reporting). FIU/goAML reporting.",
      sections: [
        ["REGULATORY BASIS",
          "This task relates to the firm's obligations to the Financial",
          "Intelligence Unit (FIU) as the national centre for receiving,",
          "analysing and disseminating suspicious transaction reports.",
          "",
          "Federal Decree-Law No. 10 of 2025 requires the firm to file",
          "reports through the goAML platform. The MLRO is the designated",
          "person responsible for all filings.",
        ],
        ["REQUIRED ACTIONS",
          "1. Prepare the draft filing in the format required by the goAML",
          "   platform (STR, SAR, DPMSR, PNMR, or FFR as applicable).",
          "2. Submit the draft to the MLRO for personal review and approval.",
          "3. The MLRO files the report through goAML using personal",
          "   credentials.",
          "4. Record the filing reference and date in the filing register.",
          "5. Retain all supporting evidence for a minimum of 10 years.",
          "6. Do not tip off the customer about the filing.",
        ],
      ],
    },
    MOE: {
      alignment: "FATF Recommendation 28 (regulation and supervision of DNFBPs). Ministry of Economy supervisory requirements.",
      sections: [
        ["REGULATORY BASIS",
          "This task relates to the firm's obligations to the Ministry of",
          "Economy (MOE) as the supervisory authority for Designated",
          "Non-Financial Businesses and Professions, including Dealers in",
          "Precious Metals and Stones.",
          "",
          "The MOE supervises the firm's compliance with Federal Decree-Law",
          "No. 10 of 2025 and may conduct on-site and off-site inspections.",
        ],
        ["REQUIRED ACTIONS",
          "1. Maintain all AML/CFT policies and procedures current.",
          "2. Ensure the firm's DPMS registration and annual renewal are",
          "   up to date.",
          "3. Complete the DNFBP Self-Assessment Questionnaire as required.",
          "4. Prepare and maintain a standing inspection readiness binder.",
          "5. Respond to all MOE circulars and guidance within the stated",
          "   deadline.",
          "6. Retain all regulatory correspondence for a minimum of 10 years.",
        ],
      ],
    },
    LBMA: {
      alignment: "LBMA Responsible Gold Guidance (RGG) 5-Step Framework; OECD Due Diligence Guidance.",
      sections: [
        ["REGULATORY BASIS",
          "This task relates to the firm's responsible sourcing obligations",
          "under the LBMA Responsible Gold Guidance (RGG), aligned with the",
          "OECD Due Diligence Guidance for Responsible Supply Chains of",
          "Minerals from Conflict-Affected and High-Risk Areas.",
        ],
        ["REQUIRED ACTIONS",
          "1. Implement and maintain management systems for supply chain",
          "   due diligence (Step 1).",
          "2. Identify and assess risks in the supply chain (Step 2).",
          "3. Design and implement a strategy to respond to identified",
          "   risks (Step 3).",
          "4. Commission an independent third-party audit (Step 4).",
          "5. Prepare and publish an annual report on supply chain due",
          "   diligence (Step 5).",
          "6. Monitor CAHRA (Conflict-Affected and High-Risk Areas) lists.",
        ],
      ],
    },
    RA: {
      alignment: "FATF Recommendation 22 (DNFBPs: customer due diligence); Recommendation 28 (supervision).",
      sections: [
        ["REGULATORY BASIS",
          "This task relates to the firm's risk assessment obligations under",
          "Federal Decree-Law No. 10 of 2025, aligned with the FATF",
          "risk-based approach as set out in Recommendations 22 and 28.",
        ],
        ["REQUIRED ACTIONS",
          "1. Conduct and document the enterprise-wide risk assessment",
          "   covering customer, product, geographic, delivery channel,",
          "   and internal controls risk.",
          "2. Align the risk assessment with the UAE National Risk Assessment.",
          "3. Present the assessment to the MLRO for sign-off and to the",
          "   Board for acknowledgement.",
          "4. Review and update at least annually.",
          "5. Retain all risk assessment records for a minimum of 10 years.",
        ],
      ],
    },
    RK: {
      alignment: "FATF Recommendation 11 (record-keeping).",
      sections: [
        ["REGULATORY BASIS",
          "This task relates to the firm's record-keeping obligations under",
          "Federal Decree-Law No. 10 of 2025 and FATF Recommendation 11.",
          "Records must be maintained for a minimum of 10 years.",
        ],
        ["REQUIRED ACTIONS",
          "1. Maintain all CDD records, transaction records, screening logs,",
          "   training records, and MLRO reports in the compliance archive.",
          "2. Ensure the archive is tamper-evident (hash-manifested).",
          "3. Make records available to the supervisory authority (MOE)",
          "   and the Financial Intelligence Unit upon request.",
          "4. Implement a document version control and retention schedule.",
        ],
      ],
    },
  };

  // Default form for categories not explicitly defined
  const DEFAULT = {
    alignment: "Federal Decree-Law No. 10 of 2025; FATF Recommendations.",
    sections: [
      ["REGULATORY BASIS",
        "This task forms part of the firm's AML/CFT compliance programme",
        "maintained under Federal Decree-Law No. 10 of 2025. The firm is",
        "classified as a Designated Non-Financial Business and Profession",
        "and is supervised by the Ministry of Economy.",
        "",
        "The FATF Recommendations, in particular Recommendation 22 (CDD",
        "for DNFBPs) and Recommendation 28 (supervision of DNFBPs),",
        "underpin the UAE AML/CFT framework.",
      ],
      ["REQUIRED ACTIONS",
        "1. Complete this task in accordance with the firm's internal",
        "   compliance procedures.",
        "2. Record all actions taken and retain documentation for a",
        "   minimum of 10 years.",
        "3. Escalate to the MLRO if any suspicion arises.",
        "4. The MLRO files all reports through the goAML platform",
        "   operated by the Financial Intelligence Unit.",
      ],
      ["SUPERVISORY FRAMEWORK",
        "Supervisory authority: Ministry of Economy (MOE)",
        "Sanctions authority: Executive Office for Control and",
        "  Non-Proliferation (EOCN)",
        "Reporting channel: Financial Intelligence Unit via goAML",
        "  (STR, SAR, DPMSR, PNMR, FFR)",
        "International standard: Financial Action Task Force (FATF)",
        "Record retention: 10 years minimum",
      ],
    ],
  };

  // Map similar categories to main forms
  const categoryMap = {
    "RF-RECYCLED": "CDD", "RF-MINED": "CDD", "RF-GENERAL": "CDD",
    "NRA": "TM", "FIU-RF": "FIU",
    "RS": "LBMA",
    "HR": "DEFAULT", "ACE": "DEFAULT", "AIG": "DEFAULT",
    "POL": "DEFAULT", "GAP": "DEFAULT", "TRN": "DEFAULT",
    "OEC": "DEFAULT", "ACEP": "DEFAULT", "REG": "DEFAULT",
    "OPS": "DEFAULT", "QA": "DEFAULT", "GRP": "DEFAULT",
    "CBUAE": "DEFAULT", "MILESTONE": "DEFAULT", "MA": "DEFAULT",
  };

  const formKey = categoryMap[category] || category;
  const form = forms[formKey] || DEFAULT;

  const lines = [...header];
  lines.push(`Regulatory alignment: ${form.alignment}`);
  lines.push("");

  for (const [title, ...body] of form.sections) {
    lines.push("-----------------------------------------------------------------------------");
    lines.push(title);
    lines.push("-----------------------------------------------------------------------------");
    lines.push("");
    for (const line of body) lines.push(line);
    lines.push("");
  }

  lines.push("");
  lines.push("=============================================================================");
  lines.push(`END OF COMPLIANCE SUPPORT FORM — ${category}`);
  lines.push("=============================================================================");

  return lines.join("\n");
}

async function main() {
  console.log("=== Attaching Compliance Forms to Asana Tasks ===\n");

  for (const proj of PROJECTS) {
    console.log(`\n--- ${proj.name} ---`);
    const tasks = await fetchAllTasks(proj.gid);
    console.log(`  ${tasks.length} tasks`);

    let attached = 0;
    let skipped = 0;
    let noCategory = 0;

    for (const task of tasks) {
      // Skip pinned task
      if (task.name.includes("Today's Priorities") || task.name.includes("\u{1F4CC}")) {
        skipped++;
        continue;
      }

      // Skip tasks that already have attachments
      if (task.attachments && task.attachments.length > 0) {
        skipped++;
        continue;
      }

      const category = extractCategory(task.name);
      if (!category) {
        noCategory++;
        continue;
      }

      const form = generateForm(category, task.name);
      const filename = `compliance-form-${category.toLowerCase()}.txt`;

      if (await attachFile(task.gid, filename, form)) {
        attached++;
      }

      // Rate limit: 50ms between attachments
      await new Promise(r => setTimeout(r, 50));
    }

    console.log(`  Attached: ${attached}, Skipped: ${skipped}, No category: ${noCategory}`);
  }

  console.log("\n=== COMPLETE ===");
}

main().catch(console.error);
