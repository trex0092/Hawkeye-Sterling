export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export interface RegExamResult {
  examArea: string;
  likelyQuestions: Array<{
    question: string;
    modelAnswer: string;
    documentationRequired: string[];
    regulatoryBasis: string;
    difficulty: "high" | "medium" | "low";
  }>;
  commonFindings: string[];
  bestPractices: string[];
  preparationSteps: string[];
  regulatoryBasis: string;
}

const FALLBACK: RegExamResult = {
  examArea: "Customer Due Diligence (CDD) and Enhanced Due Diligence (EDD)",
  likelyQuestions: [
    {
      question: "Walk me through your CDD process for a new individual customer who is a UAE national seeking to open a current account. What documents do you collect and what risk-based checks do you perform?",
      modelAnswer: "For a UAE national individual, we collect Emirates ID (mandatory — links to the Federal Identity Authority database), passport, and proof of address (utility bill or tenancy contract). We immediately screen against UAE EOCN, OFAC SDN, UN Consolidated, EU, and UK sanctions lists at onboarding. We conduct a PEP check using our commercial database (Refinitiv) and a negative news search. Based on the customer's occupation, source of income, expected transaction volumes, and geographic connections, we assign an initial risk rating (low/medium/high) under our documented Customer Risk Rating Methodology. For low-risk customers, standard CDD is applied with simplified monitoring. For medium/high-risk customers, enhanced CDD questionnaires are triggered. All CDD documentation is stored in our core banking KYC module with retention for minimum 5 years after relationship termination per FDL 10/2025 Art.19.",
      documentationRequired: [
        "Emirates ID (mandatory for UAE nationals and residents)",
        "Passport (for nationality verification)",
        "Proof of address (utility bill or tenancy contract, dated within 3 months)",
        "Source of income declaration",
        "Signed customer application form",
        "Risk rating assessment sheet",
        "Sanctions screening certificate",
        "PEP check output",
      ],
      regulatoryBasis: "UAE FDL 10/2025 Art.11 (CDD measures); FATF R.10; CBUAE AML/CFT Guidelines §4",
      difficulty: "medium",
    },
    {
      question: "One of your relationship managers has flagged that a customer — a foreign national whose account shows monthly transfers of AED 200,000 to multiple countries — has been unable to explain the source of these funds during a recent review meeting. What process does your institution follow and what are your legal obligations?",
      modelAnswer: "This scenario triggers our Suspicious Activity Review process. The relationship manager submits an internal SAR to the MLRO within 24 hours using our designated internal reporting form. The MLRO conducts an assessment within 5 working days, reviewing transaction history, KYC file, and any prior alerts. If the MLRO determines there are reasonable grounds to suspect ML/TF, we are legally required to file an STR via goAML within 2 business days of that determination (FDL 10/2025 Art.17). We must NOT tip off the customer (Art.20 — tipping off prohibition). The MLRO decides whether to continue, restrict, or exit the relationship. All internal deliberations, evidence, and the MLRO's rationale are documented and retained for 5 years. If the MLRO determines the matter does not warrant STR filing, the rationale for not filing is also documented.",
      documentationRequired: [
        "Internal SAR form (relationship manager to MLRO)",
        "MLRO assessment memorandum",
        "Transaction history extract for review period",
        "goAML STR filing receipt (if filed)",
        "Evidence supporting grounds for suspicion",
        "Record of decision (file or no-file with rationale)",
      ],
      regulatoryBasis: "UAE FDL 10/2025 Art.17 (STR obligation), Art.20 (tipping off prohibition); FATF R.20 (reporting of suspicious transactions); goAML User Manual",
      difficulty: "high",
    },
    {
      question: "How does your institution determine when Enhanced Due Diligence (EDD) is required? Give me three specific scenarios and what EDD measures your institution applies in each case.",
      modelAnswer: "EDD is triggered by our risk-based framework in three mandatory scenarios: (1) PEP customers — any customer identified as a domestic or foreign PEP, their family members or close associates requires EDD including senior management approval BEFORE relationship commencement, SOW and SOF verification with documentary evidence, and semi-annual monitoring minimum. (2) High-risk country nationals/transactions — customers with nationalities from or transactions to/from FATF grey-list or blacklist countries trigger EDD including enhanced transaction scrutiny, additional SOF documentation, and senior management review. (3) Complex or unusual transaction structures — customers using complex corporate structures, multiple jurisdictions, or unusual payment methods with no apparent economic rationale require EDD including beneficial ownership verification to natural person level and escalation to MLRO. In all EDD cases, we apply enhanced monitoring (lower TM thresholds), periodic senior management review, and increased frequency of KYC refresh.",
      documentationRequired: [
        "EDD trigger assessment (reason for EDD classification)",
        "Senior management approval form (for PEPs)",
        "Enhanced SOW/SOF questionnaire and supporting documents",
        "Beneficial ownership declaration and supporting evidence",
        "Enhanced monitoring configuration record",
        "EDD review schedule and calendar",
      ],
      regulatoryBasis: "UAE FDL 10/2025 Art.14 (EDD); FATF R.12 (PEPs), R.19 (high-risk countries); CBUAE AML/CFT Guidelines §5",
      difficulty: "medium",
    },
    {
      question: "Your institution onboarded a customer two years ago as low-risk. New information suggests this customer was appointed as a minister in their home country six months ago. What are your obligations and what steps do you take?",
      modelAnswer: "This requires immediate re-assessment and re-classification. Upon learning of the ministerial appointment, we trigger an urgent KYC review: (1) Re-classify the customer from low-risk to PEP (foreign PEP — current government minister) and update the risk rating to very high or high depending on jurisdiction. (2) Obtain senior management approval for continuation of the relationship — FDL 10/2025 Art.14(2)(b) mandates senior management approval for PEPs; approval must be obtained before next significant transaction. (3) Conduct enhanced due diligence: issue full EDD questionnaire including updated SOW and SOF for any transactions since appointment. (4) Review transaction history for the 6-month period since appointment for any anomalies now viewed through PEP lens. (5) Update sanctions and PEP screening configuration to monitor this individual at minimum semi-annually. (6) If transaction review reveals any suspicious patterns, assess STR obligation. (7) Document all steps, decision rationale, and senior management approval in the customer file.",
      documentationRequired: [
        "Trigger event documentation (source of PEP information)",
        "Risk re-classification form",
        "Senior management approval memorandum",
        "Retrospective transaction review output",
        "Updated PEP EDD questionnaire",
        "Updated KYC file with re-classification",
        "Revised monitoring configuration",
      ],
      regulatoryBasis: "UAE FDL 10/2025 Art.14(2) (PEP EDD), Art.15 (ongoing monitoring); FATF R.12; CBUAE PEP Guidance",
      difficulty: "high",
    },
    {
      question: "Describe your institution's process for conducting ongoing monitoring of existing customers. How do you ensure your KYC information remains current?",
      modelAnswer: "Our ongoing monitoring programme has three components: (1) Periodic CDD refresh — tiered by risk: high-risk customers are reviewed annually, medium-risk every 3 years, and low-risk every 5 years. Reviews are system-triggered and tracked on a compliance dashboard. (2) Event-driven triggers — we re-assess any customer immediately upon: adverse media hits, sanctions screening matches, MLRO referral, significant change in transaction behaviour, change in customer circumstances (new business, change of address, change of ownership), or expiry of identity documents. (3) Transaction monitoring — our automated TM system runs 24/7 against calibrated scenario rules for each customer segment. Alerts are reviewed by the compliance team within defined SLAs. All alert dispositions (closed/escalated) are documented. Annually, we conduct a portfolio-level review to confirm risk ratings remain appropriate. KYC data is stored in our core banking system with automated expiry alerts 60 days before refresh deadlines.",
      documentationRequired: [
        "CDD refresh schedule by risk tier",
        "Latest periodic review outputs for sample customers",
        "TM alert disposition log",
        "Event-driven trigger log and responses",
        "Expired KYC remediation tracker",
        "Annual portfolio review report",
      ],
      regulatoryBasis: "UAE FDL 10/2025 Art.15 (ongoing monitoring); FATF R.10 (ongoing due diligence); CBUAE AML/CFT Guidelines §4.4",
      difficulty: "medium",
    },
  ],
  commonFindings: [
    "KYC files for existing customers not updated following regulatory re-classification of customer's home jurisdiction",
    "EDD not applied to family members and close associates of PEPs — institution treats only the PEP themselves as requiring EDD",
    "Senior management approval for PEP relationships not obtained before account activity commenced",
    "Source of wealth and source of funds conflated in questionnaires — inspectors require both to be separately documented",
    "Ongoing monitoring review frequency not risk-differentiated — same schedule applied to all customer segments",
    "Transaction monitoring alerts closed without adequate investigation narrative — inspectors examine alert disposition quality",
  ],
  bestPractices: [
    "Maintain a live CDD refresh dashboard showing all overdue reviews — visible to MLRO and senior management",
    "Implement a dedicated PEP management workflow with mandatory checklist and senior management approval workflow before account activation",
    "Separate SOW and SOF questionnaire sections with distinct documentary evidence requirements for each",
    "Document 'no-file' decisions on STRs with same rigour as filing decisions — inspectors assess both",
    "Conduct quarterly self-assessment reviews of 10 sample customer files to identify gaps before inspection",
    "Maintain a regulatory change log showing how each new UAE AML requirement has been implemented",
  ],
  preparationSteps: [
    "Compile a complete CDD policy document with all applicable procedures — inspectors will request this on day 1",
    "Prepare a sample pack of 5 customer files (including 1 PEP, 1 high-risk country national, 1 corporate) that exemplify best-practice CDD documentation",
    "Brief all relationship managers and compliance staff on the key legal requirements they are individually accountable for",
    "Run a mock inspection CDD questionnaire exercise with the MLRO one week before scheduled inspection",
    "Ensure all CDD documentation is accessible in a single system — inspectors dislike multiple repositories",
    "Prepare a summary of open KYC remediation items with completion dates — proactive disclosure demonstrates compliance culture",
  ],
  regulatoryBasis: "UAE FDL 10/2025 Arts. 11, 14, 15, 19; FATF R.10, R.12, R.15, R.20; CBUAE AML/CFT Examination Methodology; CBUAE AML/CFT Guidelines 2021",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    examArea: string;
    institutionType?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.examArea?.trim()) return NextResponse.json({ ok: false, error: "examArea required" }, { status: 400 , headers: gate.headers});

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "regulatory-exam-prep temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `You are a CBUAE examination specialist with expertise in UAE AML/CFT inspection methodology, typical CBUAE examination questions, and model answers for regulated financial institutions. Generate realistic examination preparation materials including likely questions, model answers, documentation requirements, common findings, and best practices. Base questions on UAE FDL 10/2025, CBUAE AML/CFT Guidelines, and FATF Recommendations. Model answers should reflect what an inspector expects to hear — specific, procedure-oriented, legally grounded. Respond ONLY with valid JSON matching the RegExamResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Exam Area / Topic: ${body.examArea}
Institution Type: ${body.institutionType ?? "UAE licensed bank"}
Additional Context: ${body.context ?? "none"}

Generate comprehensive regulatory examination preparation materials for this topic. Return complete RegExamResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as RegExamResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "regulatory-exam-prep temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
