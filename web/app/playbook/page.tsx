"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface Playbook {
  id: string;
  title: string;
  typology: string;
  family: string;
  steps: Array<{
    title: string;
    required: boolean;
    checks: string[];
  }>;
}

const PLAYBOOKS: Playbook[] = [
  {
    id: "tbml",
    title: "Trade-Based Money Laundering (TBML)",
    typology: "tbml",
    family: "ML",
    steps: [
      {
        title: "1. Price analysis",
        required: true,
        checks: [
          "Compare invoice price against LBMA / LME reference on value date",
          "Flag over-invoicing >15% or under-invoicing <15% of reference",
          "Obtain commercial rationale for any price anomaly",
        ],
      },
      {
        title: "2. Shipping & logistics",
        required: true,
        checks: [
          "Verify bill of lading matches goods description",
          "Cross-check ports of loading and discharge against CAHRA list",
          "Confirm carrier is registered and insured",
        ],
      },
      {
        title: "3. Counterparty due-diligence",
        required: true,
        checks: [
          "Screen counterparty against OFAC / UN / EU / UK / EOCN",
          "Identify beneficial owners of counterparty entity",
          "Obtain trade licence + Chamber of Commerce certificate",
        ],
      },
      {
        title: "4. Red-flag assessment",
        required: false,
        checks: [
          "Circular trading pattern (A→B→C→A)",
          "Phantom shipment (documents without physical goods)",
          "Third-party payment from unrelated jurisdiction",
          "Over-complex invoicing via multiple intermediaries",
        ],
      },
    ],
  },
  {
    id: "pep",
    title: "PEP Enhanced Due Diligence (FATF R.12)",
    typology: "pep",
    family: "PEP",
    steps: [
      {
        title: "1. PEP classification",
        required: true,
        checks: [
          "Confirm tier: 1 (head of state/gov), 2 (senior political/judicial/military), 3 (SOE exec), 4 (party official)",
          "Identify close associates and family members in-scope",
          "Check out-of-office date (tier persists 12+ months post-office per FATF)",
        ],
      },
      {
        title: "2. Source-of-wealth verification",
        required: true,
        checks: [
          "Obtain sworn declaration of SoW",
          "Triangulate against public filings / asset disclosures",
          "Document rationale for accumulated wealth vs known salary",
        ],
      },
      {
        title: "3. Senior-management approval",
        required: true,
        checks: [
          "Obtain CEO + Board Chair sign-off per FDL 10/2025 Art.17",
          "Record approval date and rationale in case timeline",
          "Document four-eyes review",
        ],
      },
      {
        title: "4. Ongoing monitoring",
        required: true,
        checks: [
          "Enrol in thrice-daily ongoing monitoring",
          "Quarterly media-review meeting on file",
          "Annual EDD refresh",
        ],
      },
    ],
  },
  {
    id: "correspondent",
    title: "Correspondent Banking · Nested Relationship",
    typology: "correspondent_banking",
    family: "banking",
    steps: [
      {
        title: "1. Respondent-bank licensing",
        required: true,
        checks: [
          "Confirm banking licence in home jurisdiction (public regulator listing)",
          "Obtain Wolfsberg Questionnaire (CBDDQ)",
          "Verify physical presence — reject any shell bank per FATF R.13",
        ],
      },
      {
        title: "2. AML programme review",
        required: true,
        checks: [
          "Review respondent's AML/KYC policies",
          "Confirm independent AML audit in last 24 months",
          "Identify PEP-exposure policy and MLRO name",
        ],
      },
      {
        title: "3. Nested relationships",
        required: true,
        checks: [
          "Ask if respondent offers correspondent services to other banks",
          "Map the nested chain — any shell banks at any depth is a hard stop",
          "Document downstream due-diligence expectations",
        ],
      },
      {
        title: "4. Transaction-monitoring config",
        required: true,
        checks: [
          "Set enhanced thresholds on respondent's channel",
          "Flag any transaction > USD 250,000 for analyst review",
          "Quarterly file review at board level",
        ],
      },
    ],
  },
  {
    id: "dpms-retail",
    title: "DPMS Retail (cash-intensive precious-metals)",
    typology: "dpms_retail",
    family: "DPMS",
    steps: [
      {
        title: "1. Customer verification",
        required: true,
        checks: [
          "ID copy + address proof on file",
          "Source-of-funds declaration",
          "Screen against sanctions / PEP lists",
        ],
      },
      {
        title: "2. Cash threshold",
        required: true,
        checks: [
          "DPMSR triggers at AED 55,000 cash component per MoE Circular 2/2024",
          "File DPMSR within 30 days of transaction",
          "Retain CCTV footage for 10 years",
        ],
      },
      {
        title: "3. Stock provenance",
        required: true,
        checks: [
          "Every gold bar / coin logged with LBMA-compliant mass & assay",
          "Chain-of-custody from refiner documented",
          "Random 10% audit of incoming lot",
        ],
      },
    ],
  },
  {
    id: "proliferation",
    title: "Proliferation Financing (FATF R.7 / UNSCR)",
    typology: "pf",
    family: "PF",
    steps: [
      {
        title: "1. Sanctions screening — PF-specific lists",
        required: true,
        checks: [
          "Screen against UNSCR 1267 (Al-Qaeda), 1718 (DPRK), 2231 (Iran) consolidated lists",
          "Screen against OFAC SDN + Non-SDN NS-MBS and NPWMD lists",
          "Screen against EU Regulation 267/2012 (Iran) and 2017/1509 (DPRK) lists",
          "Screen all UBOs, directors, and counterparties — not just the entity name",
        ],
      },
      {
        title: "2. Dual-use goods / sector red-flags",
        required: true,
        checks: [
          "Check if goods or services could be dual-use (nuclear, chemical, biological, radiological)",
          "Verify end-use certificate where product has export-control classification",
          "Flag customers operating in aerospace, defence, electronics, chemicals or mining equipment sectors",
        ],
      },
      {
        title: "3. Jurisdiction exposure",
        required: true,
        checks: [
          "Identify any nexus to DPRK, Iran, Syria, Belarus, Russia (full or sectoral sanctions)",
          "Check transit countries in supply chain against UN Panel of Experts reports",
          "Escalate to MLRO if any leg of the transaction touches a PF-sanctioned jurisdiction",
        ],
      },
      {
        title: "4. Financial indicators",
        required: false,
        checks: [
          "Unusual payment routes inconsistent with normal trade finance",
          "Front or shell companies with no obvious commercial purpose",
          "Requests to split shipments to stay under export thresholds",
          "Reluctance to provide end-use certificates or final consignee details",
        ],
      },
    ],
  },
  {
    id: "conflict-minerals",
    title: "Conflict Minerals — OECD 5-Step / EOCN",
    typology: "conflict_minerals",
    family: "EOCN",
    steps: [
      {
        title: "1. Supply-chain mapping (Step 1)",
        required: true,
        checks: [
          "Identify all smelters and refiners in the upstream supply chain",
          "Obtain LBMA / RJC Chain-of-Custody certificates from each refiner",
          "Map origin of minerals to mine level where possible",
          "Cross-check smelters/refiners against EOCN List B (prohibited suppliers)",
        ],
      },
      {
        title: "2. Risk identification (Step 2)",
        required: true,
        checks: [
          "Identify whether any source or transit country is on the CAHRA list",
          "Check IPIS, Global Witness, and UN GoE reports for relevant supply-chain actors",
          "Assess risk of serious abuses: forced labour, child labour, environmental crimes",
          "Identify any direct or indirect benefit to non-state armed groups",
        ],
      },
      {
        title: "3. Risk mitigation strategy (Step 3)",
        required: true,
        checks: [
          "Suspend or disengage from suppliers if serious abuses are identified",
          "Where engagement is maintained, document measurable improvement plan",
          "Escalate to MLRO + Board for any CAHRA-origin material decision",
          "Obtain written commitment from supplier to OECD DD Guidance requirements",
        ],
      },
      {
        title: "4. Third-party audit (Step 4)",
        required: true,
        checks: [
          "Commission independent LBMA-accredited auditor for annual Step-4 audit",
          "Audit scope: due diligence systems, supply-chain mapping, grievance mechanism",
          "Resolve all major findings within 90 days of audit report date",
          "Submit audit summary to LBMA and retain full report for 5 years",
        ],
      },
      {
        title: "5. Annual public reporting (Step 5)",
        required: true,
        checks: [
          "Publish annual responsible sourcing report per OECD Annex II",
          "Report to include: supply-chain policies, risk-identification findings, mitigation actions",
          "Submit EOCN Annual Declaration by 31 March each year",
          "Board sign-off on published report",
        ],
      },
    ],
  },
  {
    id: "vasp",
    title: "VASP / Virtual-Asset Customer (FATF R.15)",
    typology: "vasp",
    family: "VASP",
    steps: [
      {
        title: "1. VASP licensing verification",
        required: true,
        checks: [
          "Confirm VASP holds a licence from a FATF-member jurisdiction regulator (e.g. VARA UAE, FCA, MAS)",
          "Obtain VASP's AML/CFT policy and most recent independent audit report",
          "Verify VASP applies the Travel Rule (FATF R.16) for transfers ≥ USD/AED equivalent 1,000",
          "Check VASP against OFAC Virtual Currency-related SDN designations",
        ],
      },
      {
        title: "2. Blockchain analytics",
        required: true,
        checks: [
          "Run on-chain address screening through Chainalysis / Elliptic or equivalent",
          "Flag any address with exposure >10% to darknet, mixer, sanctioned entity or ransomware cluster",
          "Document source-of-crypto funds (exchange, mining, staking, DeFi protocol)",
          "Retain blockchain analytics report in case file",
        ],
      },
      {
        title: "3. Customer identity — Travel Rule",
        required: true,
        checks: [
          "Collect originator VASP name, jurisdiction and LEI/registration number",
          "Collect beneficiary VASP details if outgoing transfer",
          "Confirm Travel Rule message received and validated for inbound transfers",
          "Hard-stop any transfer from unhosted wallet exceeding AED 3,500 without enhanced verification",
        ],
      },
      {
        title: "4. Risk classification",
        required: false,
        checks: [
          "High-risk: privacy coins (Monero, Zcash), mixers/tumblers, unregistered DeFi protocols",
          "High-risk: VASP domiciled in FATF-listed or non-cooperative jurisdiction",
          "Escalate to MLRO if any high-risk indicator present before transacting",
          "Quarterly re-screen of active VASP counterparties",
        ],
      },
    ],
  },
  {
    id: "shell-complex",
    title: "Shell Company / Complex Structure (FATF R.24/25)",
    typology: "shell_company",
    family: "UBO",
    steps: [
      {
        title: "1. Ownership mapping",
        required: true,
        checks: [
          "Obtain certified registry extract and shareholder register from jurisdiction of incorporation",
          "Map all ownership layers until natural-person UBO(s) holding ≥25% are identified",
          "Identify nominee shareholders or directors — require disclosure of principal behind nominee",
          "Cross-check UBO against UAE MoE UBO Register and MOEC beneficial ownership filings",
        ],
      },
      {
        title: "2. Purpose and substance test",
        required: true,
        checks: [
          "Document the commercial rationale for the corporate structure",
          "Verify entity has genuine business activity (not purely a holding / tax vehicle)",
          "Confirm registered address is not a mass-registration address (virtual office red flag)",
          "Obtain at least one of: audited accounts, bank reference, or regulatory filing",
        ],
      },
      {
        title: "3. Trust / foundation screening",
        required: true,
        checks: [
          "If trust structure: obtain trust deed, identify settlor, trustees, protector, and all beneficiaries",
          "If foundation: obtain foundation charter and identify founder and council members",
          "Screen all identified individuals (settlor, trustees, beneficiaries) against sanctions + PEP lists",
          "Confirm jurisdiction of trust/foundation is not on FATF non-cooperative list",
        ],
      },
      {
        title: "4. Ongoing monitoring — enhanced",
        required: false,
        checks: [
          "Annual ownership refresh — request updated registry extract",
          "Monitor for changes in UBO via public registry alerts where available",
          "Any change in UBO triggers full re-KYC within 30 days per FDL 10/2025 Art.11",
          "Escalate to MLRO if UBO identity cannot be confirmed after two requests",
        ],
      },
    ],
  },
];

export default function PlaybookPage() {
  const [active, setActive] = useState<string>(PLAYBOOKS[0]!.id);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const pb = PLAYBOOKS.find((p) => p.id === active) ?? PLAYBOOKS[0]!;
  const totalChecks = pb.steps.reduce((a, s) => a + s.checks.length, 0);
  const doneChecks = Object.entries(checked).filter(
    ([k, v]) => v && k.startsWith(`${pb.id}:`),
  ).length;
  const pct = Math.round((doneChecks / Math.max(totalChecks, 1)) * 100);

  const toggle = (stepIdx: number, checkIdx: number) => {
    const k = `${pb.id}:${stepIdx}:${checkIdx}`;
    setChecked({ ...checked, [k]: !checked[k] });
  };

  return (
    <ModuleLayout narrow>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <ModuleHero
          eyebrow="Module 16 · Guided due-diligence"
          title="Playbook"
          titleEm="engine."
          intro={
            <>
              <strong>One walk-through per typology.</strong> Pick a playbook,
              work through the mandated checks in order. The brain cites the
              specific FATF / LBMA / FDL articles behind each step so nothing
              gets skipped.
            </>
          }
        />

        <div className="grid grid-cols-4 gap-2 mt-6 mb-4">
          {PLAYBOOKS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(p.id)}
              className={`text-left text-12 px-3 py-2 rounded border ${
                active === p.id
                  ? "border-brand bg-brand-dim text-brand-deep font-semibold"
                  : "border-hair-2 bg-bg-panel text-ink-0 hover:bg-bg-1"
              }`}
            >
              <span className="font-mono text-10 text-ink-3 block">
                {p.family}
              </span>
              <span className="block text-11">{p.title}</span>
            </button>
          ))}
        </div>

        <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0">{pb.title}</h2>
            <span className="font-mono text-10 text-ink-3">
              {doneChecks} / {totalChecks} · {pct}%
            </span>
          </div>
          <div className="h-1.5 bg-bg-2 rounded-sm mb-4">
            <div
              className="h-full bg-brand rounded-sm"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="space-y-3">
            {pb.steps.map((step, si) => (
              <div key={si} className="border-l-2 border-brand pl-3">
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-12 font-semibold text-ink-0">
                    {step.title}
                  </span>
                  {step.required && (
                    <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold bg-red-dim text-red">
                      required
                    </span>
                  )}
                </div>
                <ul className="list-none p-0 m-0 space-y-1">
                  {step.checks.map((c, ci) => {
                    const k = `${pb.id}:${si}:${ci}`;
                    return (
                      <li key={ci} className="flex items-start gap-2 text-11">
                        <input
                          type="checkbox"
                          checked={Boolean(checked[k])}
                          onChange={() => toggle(si, ci)}
                          className="mt-0.5 accent-brand"
                        />
                        <span
                          className={
                            checked[k] ? "text-ink-3 line-through" : "text-ink-1"
                          }
                        >
                          {c}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModuleLayout>
  );
}
