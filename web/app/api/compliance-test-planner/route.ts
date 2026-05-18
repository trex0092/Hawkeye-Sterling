export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface ComplianceTestPlanResult {
  testPlan: Array<{
    testId: string;
    area: string;
    objective: string;
    methodology: string;
    sampleSize: string;
    frequency: string;
    outputRequired: string;
    legalBasis: string;
  }>;
  priorityAreas: string[];
  estimatedDuration: string;
  reportingRequirements: string[];
  managementResponseRequired: boolean;
  regulatoryBasis: string;
}

const FALLBACK: ComplianceTestPlanResult = {
  testPlan: [
    {
      testId: "CT-2026-01",
      area: "Customer Due Diligence (CDD) — Walk-in Cash Customers",
      objective: "Verify that CDD procedures for walk-in cash customers are consistently applied, documentation is complete, and risk ratings are appropriate per the DNFBP AML Policy",
      methodology: "Random sample review of 30 transaction records for walk-in customers who purchased gold ≥AED 10,000 in Q1 2026. Review each record for: identity document (copy taken and certified), sanctions screening evidence, STR/CTR trigger assessment, and risk rating documentation. Interview 2 frontline staff on CDD procedures.",
      sampleSize: "30 transaction records (random sample from Q1 2026); 2 frontline staff interviews",
      frequency: "Quarterly",
      outputRequired: "Testing working paper documenting sample selection, findings per transaction, compliance rate (%), deficiencies identified, root cause analysis, and recommended remedial actions",
      legalBasis: "UAE FDL 10/2025 Art.11 (CDD); FATF R.22 (DNFBP CDD); CBUAE DNFBP AML Guidelines §4",
    },
    {
      testId: "CT-2026-02",
      area: "Cash Transaction Report (CTR) Filing Completeness",
      objective: "Verify that all cash transactions ≥AED 55,000 are reported via goAML within the same business day, filings are complete and accurate, and no transactions are structured to avoid the threshold",
      methodology: "Extract all cash transactions in test period from POS/register records. Cross-reference against goAML CTR filing log. Identify any transactions ≥AED 55,000 without corresponding CTR. Analyse transactions in AED 40,000–54,999 range for structuring patterns (multiple transactions by same customer on same day or consecutive days).",
      sampleSize: "Full population review of all cash transactions in a 30-day sample period",
      frequency: "Quarterly",
      outputRequired: "CTR reconciliation report showing: total qualifying transactions, CTR filing rate (%), missed filings identified, timeliness analysis, and structuring pattern analysis with any suspicious findings escalated to MLRO",
      legalBasis: "UAE FDL 10/2025 Art.17 (CTR obligation); MoE Circular 2/2024 (AED 55,000 threshold); goAML CTR filing requirements",
    },
    {
      testId: "CT-2026-03",
      area: "Suspicious Transaction Report (STR) Quality and Timeliness",
      objective: "Assess the quality of STR narratives, timeliness of filing from MLRO determination, adequacy of underlying investigation, and completeness of goAML submission fields",
      methodology: "Review all STRs filed in the past 6 months (expected 8-15). For each STR: assess narrative quality against goAML standards, verify filing date vs MLRO decision date (must be ≤2 business days), review underlying investigation file for completeness, confirm all mandatory goAML fields are populated. Interview MLRO on STR decision-making process.",
      sampleSize: "100% of STRs filed in past 6 months",
      frequency: "Semi-annual",
      outputRequired: "STR quality assessment report scoring each filing on: narrative adequacy, timeliness compliance, investigation completeness, and goAML field accuracy. Overall compliance rate and recommendations for training/process improvement.",
      legalBasis: "UAE FDL 10/2025 Art.17 (STR obligation, 2-business-day deadline); goAML Reporting Standards; CBUAE STR Quality Guidance",
    },
    {
      testId: "CT-2026-04",
      area: "Sanctions Screening — Completeness and Hit Management",
      objective: "Verify that all customers are screened against required sanctions lists, screening is conducted at onboarding and upon list updates, and all hits are appropriately managed and documented",
      methodology: "Test screening system configuration to confirm EOCN, OFAC SDN, UN Consolidated, EU, and UK HMT lists are loaded and updated daily. Extract sample of 20 onboarding records and verify screening was conducted at point of sale. Review all screening hits in test period — confirm each hit was escalated, investigated, and outcome documented. Test a known positive result against the screening system to verify detection.",
      sampleSize: "20 onboarding records; 100% of screening hits in test period; 1 system test with known positive",
      frequency: "Quarterly",
      outputRequired: "Screening compliance report: list coverage and update frequency, screening rate at onboarding (%), hit management quality assessment, system test result, and identification of any false negatives or process gaps",
      legalBasis: "UAE FDL 10/2025 Art.23 (targeted financial sanctions); Cabinet Decision 74/2020; UNSCR 1267/1373/1540; FATF R.6/7",
    },
    {
      testId: "CT-2026-05",
      area: "AML Training — Completion, Content, and Effectiveness",
      objective: "Verify that all staff have completed mandatory annual AML/CFT training, training content is current and covers FDL 10/2025 requirements, and training effectiveness is assessed",
      methodology: "Review training completion records for all 12 staff against the 100% completion requirement. Verify training content for coverage of: UAE FDL 10/2025 key obligations, STR/CTR reporting procedures, CDD requirements, PEP identification, tipping off prohibition, and sanctions screening. Conduct a 10-question knowledge assessment with 4 randomly selected frontline staff to test effectiveness.",
      sampleSize: "100% of staff completion records; 4 staff knowledge assessments",
      frequency: "Annual",
      outputRequired: "Training compliance report: completion rate (%), content gap analysis, knowledge assessment results (pass/fail vs 80% threshold), recommendations for curriculum enhancements, and identification of staff requiring remedial training",
      legalBasis: "UAE FDL 10/2025 Art.20 (training obligation); FATF R.18; CBUAE AML Training Guidelines",
    },
    {
      testId: "CT-2026-06",
      area: "Record-Keeping — Retention and Accessibility",
      objective: "Verify that all required CDD records, transaction records, and STR/CTR filing records are retained for the legally required minimum 5-year period and can be produced within 3 working days as required by CBUAE",
      methodology: "Select 10 customer files — including 2 exited relationships from 2021 (5-year retention test). Verify all required documents are present and accessible. Test production capability by requesting 2 customer files from an archive system and measuring retrieval time. Review document management system configuration for automated deletion schedules.",
      sampleSize: "10 customer files (including 2 historical); 2 timed retrieval tests",
      frequency: "Annual",
      outputRequired: "Record-keeping compliance report: documentation completeness rate (%), retrieval time test results vs 3-day standard, identification of any records approaching or past retention limits, and system configuration review findings",
      legalBasis: "UAE FDL 10/2025 Art.19 (5-year retention); CBUAE record-keeping requirements; FATF R.11",
    },
  ],
  priorityAreas: [
    "CTR filing completeness — regulatory penalty risk is highest for systematic non-filing",
    "CDD walk-in customers — highest volume, highest inherent risk, most common CBUAE finding",
    "Sanctions screening — zero-tolerance regulatory requirement with criminal exposure",
    "STR quality — CBUAE inspections consistently focus on STR narrative adequacy and timeliness",
  ],
  estimatedDuration: "CT-2026-01 and CT-2026-02: 3 days each | CT-2026-03: 2 days | CT-2026-04: 2 days | CT-2026-05: 1 day | CT-2026-06: 1 day | Report drafting and management response: 3 days | Total estimated: 15 working days",
  reportingRequirements: [
    "Draft testing report to MLRO within 5 working days of fieldwork completion",
    "Management response on all findings rated high or critical — 10 working day turnaround",
    "Final testing report (incorporating management responses) to Board Audit Committee quarterly",
    "Critical findings (regulatory exposure) — immediate notification to MLRO and CEO on identification",
    "All findings rated high or critical must have documented remediation actions with owners and due dates",
    "Annual testing programme summary to CBUAE as part of annual AML return (if required)",
  ],
  managementResponseRequired: true,
  regulatoryBasis: "UAE FDL 10/2025 Art.5 (compliance programme requirements); CBUAE AML/CFT Guidelines §8 (independent testing); FATF R.18 (internal audit function); CBUAE DNFBP AML Inspection Methodology — compliance testing expectations",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionType: string;
    testingArea?: string;
    riskFocus?: string;
    staffCount?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.institutionType?.trim()) return NextResponse.json({ ok: false, error: "institutionType required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "compliance-test-planner temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML compliance testing specialist with expertise in CBUAE testing expectations, FATF R.18 independent testing requirements, and sector-specific AML compliance testing methodologies. Design comprehensive compliance test plans with specific objectives, methodologies, sample sizes, frequencies, and output requirements. Plans should be practical and actionable for the institution's size and complexity. Reference UAE FDL 10/2025 and CBUAE Guidelines legal basis for each test. Respond ONLY with valid JSON matching the ComplianceTestPlanResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Institution Type: ${sanitizeField(body.institutionType, 100)}
Testing Area / Focus: ${sanitizeText(body.testingArea, 2000) ?? "comprehensive AML programme"}
Risk Focus: ${sanitizeText(body.riskFocus, 2000) ?? "general AML/CFT obligations"}
Staff Count: ${sanitizeField(body.staffCount, 50) ?? "not specified"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Design a comprehensive AML compliance testing plan for this institution. Return complete ComplianceTestPlanResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as ComplianceTestPlanResult;
    if (!Array.isArray(result.testPlan)) result.testPlan = [];
    if (!Array.isArray(result.priorityAreas)) result.priorityAreas = [];
    if (!Array.isArray(result.reportingRequirements)) result.reportingRequirements = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "compliance-test-planner temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
