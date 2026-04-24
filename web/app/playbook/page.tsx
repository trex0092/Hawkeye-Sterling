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
  {
    id: "real-estate",
    title: "Real Estate & Property Transaction",
    typology: "real_estate",
    family: "REML",
    steps: [
      {
        title: "1. Buyer / seller identity",
        required: true,
        checks: [
          "Full CDD on buyer and seller — individuals and all corporate UBOs",
          "Verify buyer's source of funds (mortgage statement, sale proceeds, investment income)",
          "Screen all parties against OFAC / UN / EU / UK sanctions and PEP lists",
          "Confirm no third-party payer without prior MLRO approval",
        ],
      },
      {
        title: "2. Property valuation check",
        required: true,
        checks: [
          "Obtain independent RICS-certified valuation",
          "Flag purchase price >15% below or >15% above certified valuation",
          "Check if property is listed on any seizure or restraint register",
          "Review prior transaction history — rapid resale within 12 months is a red flag",
        ],
      },
      {
        title: "3. Payment method & structure",
        required: true,
        checks: [
          "Confirm all funds are wire-transferred from an account in the buyer's name",
          "No cash or cryptocurrency accepted without explicit MLRO pre-approval",
          "Third-party payments trigger enhanced scrutiny — document commercial rationale",
          "Mortgage provider must be a regulated institution in a FATF-member jurisdiction",
        ],
      },
      {
        title: "4. Agent / intermediary due diligence",
        required: false,
        checks: [
          "Verify real estate agent holds valid DLD / RERA licence",
          "Confirm agent has its own AML programme in place",
          "Obtain agent's KYC package on their client before reliance",
          "Document reliance arrangement per FDL 10/2025 Art.12",
        ],
      },
    ],
  },
  {
    id: "trade-finance",
    title: "Trade Finance & Letters of Credit",
    typology: "trade_finance",
    family: "TF",
    steps: [
      {
        title: "1. Documentary review",
        required: true,
        checks: [
          "Verify commercial invoice, bill of lading, packing list, and certificate of origin are consistent",
          "Confirm goods description on LC matches actual goods shipped",
          "Cross-check unit price against published commodity benchmarks (LME, LBMA, Bloomberg)",
          "Flag discrepancies between LC terms and shipping documents",
        ],
      },
      {
        title: "2. Counterparty screening",
        required: true,
        checks: [
          "Screen applicant, beneficiary, issuing bank, and nominated bank against all sanctions lists",
          "Verify issuing bank is not a shell bank (physical presence + correspondent bank check)",
          "Obtain Wolfsberg Trade Finance questionnaire from the issuing bank",
          "Identify UBOs of both applicant and beneficiary entities",
        ],
      },
      {
        title: "3. Jurisdiction & routing red-flags",
        required: true,
        checks: [
          "Identify all countries in the transaction chain (origin, transit, destination)",
          "Flag any FATF grey/black-list country in the route",
          "Check for free-trade zone routing that obscures origin (TBML indicator)",
          "Verify freight forwarder is registered and not on any debarment list",
        ],
      },
      {
        title: "4. Unusual structures",
        required: false,
        checks: [
          "Back-to-back LCs with no obvious commercial logic",
          "Transferable or assignable LC without credible business explanation",
          "LC value inconsistent with known business volume of applicant",
          "Repeated amendments to LC after issuance — investigate each amendment",
        ],
      },
    ],
  },
  {
    id: "wire-transfer",
    title: "Wire Transfer Screening (FATF R.16)",
    typology: "wire_transfer",
    family: "Payments",
    steps: [
      {
        title: "1. Originator & beneficiary data",
        required: true,
        checks: [
          "Confirm full originator name, account number, and address are present (R.16 mandatory fields)",
          "Confirm full beneficiary name and account number are present",
          "Reject or return any wire missing required R.16 fields — document the rejection",
          "Cross-check names against sanctions lists before processing",
        ],
      },
      {
        title: "2. Correspondent bank / SWIFT path",
        required: true,
        checks: [
          "Verify each correspondent bank in the payment chain is SWIFT-registered and licensed",
          "Flag any intermediary bank in a FATF-listed or high-risk jurisdiction",
          "Confirm no cover-payment method that obscures originator identity (prohibited per R.16)",
          "Retain full SWIFT message chain in the case record",
        ],
      },
      {
        title: "3. Threshold & structuring checks",
        required: true,
        checks: [
          "Aggregate daily transfers to the same beneficiary — flag if total exceeds AED 55,000",
          "Identify structuring pattern (multiple transfers just below threshold)",
          "Flag round-dollar amounts with no commercial invoice backing",
          "Check if transfer currency or amount is inconsistent with customer's declared business",
        ],
      },
      {
        title: "4. Third-party & pass-through risks",
        required: false,
        checks: [
          "Third-party beneficiary requires MLRO pre-approval",
          "Pass-through transactions (received + immediately re-sent) are a hard stop for review",
          "Charitable / NGO destination requires additional EDD on the recipient organisation",
          "Verify beneficiary bank account matches country of beneficiary's documented address",
        ],
      },
    ],
  },
  {
    id: "digital-assets",
    title: "Digital Assets & NFT Transactions",
    typology: "digital_assets",
    family: "VASP",
    steps: [
      {
        title: "1. Asset classification",
        required: true,
        checks: [
          "Classify the digital asset: payment token, utility token, security token, or NFT",
          "Confirm asset is not a privacy coin (Monero, Zcash, Dash) — hard stop if so",
          "Identify the issuing protocol and smart contract address",
          "Check if asset appears on OFAC Virtual Currency SDN list",
        ],
      },
      {
        title: "2. On-chain analytics",
        required: true,
        checks: [
          "Run blockchain risk score on all relevant wallet addresses (Chainalysis / Elliptic)",
          "Flag any address with >5% indirect exposure to darknet markets, mixers, or ransomware",
          "Trace inbound funds to confirm source is a regulated exchange or identified wallet",
          "Document cluster analysis results in the case file",
        ],
      },
      {
        title: "3. NFT-specific ML indicators",
        required: true,
        checks: [
          "Check for wash-trading: same wallet buying and selling the same NFT repeatedly",
          "Compare sale price to secondary-market floor price — >300% premium is a red flag",
          "Identify if counterparty is anonymous (unhosted wallet with no KYC backing)",
          "Escalate to MLRO if NFT value exceeds AED 150,000 with no clear provenance",
        ],
      },
      {
        title: "4. Travel Rule & settlement",
        required: false,
        checks: [
          "Obtain Travel Rule message for any transfer ≥ USD 1,000 equivalent",
          "Confirm receiving VASP is VARA-licensed or operates under equivalent regulation",
          "Hard-stop settlement to unhosted wallets >AED 3,500 without enhanced verification",
          "Retain on-chain transaction hash and explorer link in case record",
        ],
      },
    ],
  },
  {
    id: "hawala",
    title: "Hawala / Money Service Business (MSB)",
    typology: "hawala",
    family: "MSB",
    steps: [
      {
        title: "1. Licensing & registration verification",
        required: true,
        checks: [
          "Confirm hawala operator holds a valid CBUAE licence or equivalent MSB registration",
          "Verify the operator is not on OFAC or FinCEN lists of unlicensed money transmitters",
          "Obtain copy of the operator's AML/CFT programme and training records",
          "Confirm the operator files Currency Transaction Reports / SARs as required",
        ],
      },
      {
        title: "2. Correspondent hawaladars",
        required: true,
        checks: [
          "Map the network of correspondent hawaladars used by the operator",
          "Screen all correspondents against OFAC / UN / EU sanctions lists",
          "Identify jurisdictions served — flag any FATF grey/black-list countries",
          "Obtain list of settlement accounts used by the operator",
        ],
      },
      {
        title: "3. Transaction pattern analysis",
        required: true,
        checks: [
          "Review transaction logs for round-number transfers with no invoice backing",
          "Flag discrepancies between transfer volume and the operator's declared turnover",
          "Identify customers sending to the same beneficiary in multiple smaller amounts (structuring)",
          "Check if transfers are consistently just below the AED 3,500 CTR threshold",
        ],
      },
      {
        title: "4. Settlement & netting",
        required: false,
        checks: [
          "Verify settlement method — gold, commodities, or informal netting are red flags",
          "Confirm any physical cash settlement is within permitted limits and documented",
          "Obtain evidence of invoice or contract backing for commodity settlements",
          "Escalate to MLRO if settlement route cannot be fully documented",
        ],
      },
    ],
  },
  {
    id: "bribery",
    title: "Bribery & Corruption (FCPA / UK Bribery Act)",
    typology: "bribery",
    family: "ABC",
    steps: [
      {
        title: "1. Red-flag identification",
        required: true,
        checks: [
          "Identify payments to government officials, SOE employees, or their associates",
          "Flag unusual commission arrangements, facilitation payments, or gifts above policy threshold",
          "Check for payments routed via intermediary or consultant in a high-corruption jurisdiction (CPI < 40)",
          "Review contracts for success fees tied to regulatory approvals or government contracts",
        ],
      },
      {
        title: "2. Third-party due diligence",
        required: true,
        checks: [
          "Screen agents, consultants, and JV partners against PEP and sanctions lists",
          "Obtain anti-bribery representations and warranties in all third-party contracts",
          "Verify third-party services are genuine and fee is proportionate to market rate",
          "Check third-party registration, ownership, and references in home jurisdiction",
        ],
      },
      {
        title: "3. Jurisdiction risk assessment",
        required: true,
        checks: [
          "Score the transaction jurisdiction using Transparency International CPI",
          "Apply enhanced procedures for any jurisdiction with CPI < 40",
          "Review FATF, GRECO, and US State Dept. reports on corruption risk in the jurisdiction",
          "Obtain legal opinion on local anti-bribery law applicability",
        ],
      },
      {
        title: "4. SAR / STR consideration",
        required: false,
        checks: [
          "Assess whether identified bribery indicators constitute grounds for an STR under FDL 10/2025 Art.15",
          "Consider FCPA or UK Bribery Act extraterritorial exposure for USD-denominated or UK-nexus transactions",
          "Document the MLRO's triage rationale in the case file regardless of filing decision",
          "Escalate to General Counsel if criminal referral or self-disclosure is under consideration",
        ],
      },
    ],
  },
  {
    id: "human-trafficking",
    title: "Human Trafficking & Modern Slavery",
    typology: "human_trafficking",
    family: "TF/ML",
    steps: [
      {
        title: "1. Victim & controller indicators",
        required: true,
        checks: [
          "Flag multiple individuals transacting from the same device, IP, or address",
          "Identify accounts receiving multiple small cash deposits from different senders",
          "Check for hotel, escort-service, or transport-sector cash receipts inconsistent with declared occupation",
          "Screen names against INTERPOL Purple Notices and national trafficking watchlists",
        ],
      },
      {
        title: "2. Recruitment & control patterns",
        required: true,
        checks: [
          "Identify payments to recruitment agencies in high-risk source countries (Philippines, Ethiopia, Bangladesh, Nepal)",
          "Flag visa-fee or 'debt-bondage' style repayments deducted from wages",
          "Review payroll structures where one entity controls wages for many workers",
          "Check for travel-agency or airline bookings inconsistent with business profile",
        ],
      },
      {
        title: "3. Financial flow analysis",
        required: true,
        checks: [
          "Map beneficiary accounts — flag if funds quickly moved to a controlling third party",
          "Identify regular, small-amount transfers to the same international beneficiary (remittance controller)",
          "Assess whether the volume of inflows is consistent with the customer's declared lawful income",
          "Cross-reference with law enforcement tipoffs or court records if available",
        ],
      },
      {
        title: "4. Escalation",
        required: true,
        checks: [
          "Escalate to MLRO immediately if trafficking indicators are present — do not tip off the customer",
          "File STR within 24 hours of MLRO determination to report",
          "Preserve all account records and do not close the account without FIU guidance",
          "Notify law enforcement via FIU if immediate risk to a victim is suspected",
        ],
      },
    ],
  },
  {
    id: "tax-evasion",
    title: "Tax Evasion Red Flags",
    typology: "tax_evasion",
    family: "ML",
    steps: [
      {
        title: "1. Undeclared offshore structures",
        required: true,
        checks: [
          "Identify accounts in secrecy jurisdictions (BVI, Cayman, Panama, Seychelles) with no disclosed tax reason",
          "Flag shell companies with no substance — nominee directors, no employees, no office",
          "Screen for use of multiple jurisdictions to obscure the trail between income and asset",
          "Check if the customer's declared tax residency is consistent with their transaction geography",
        ],
      },
      {
        title: "2. Invoice manipulation",
        required: true,
        checks: [
          "Compare declared revenues against transactional inflows — material gap is a red flag",
          "Flag round-number invoices with vague service descriptions ('consultancy', 'advisory')",
          "Check for payments to related parties at non-arm's-length prices",
          "Identify credit notes or invoices reversed immediately after period-end",
        ],
      },
      {
        title: "3. Cash & unreported income",
        required: true,
        checks: [
          "Flag lifestyle discrepancy — assets and expenditure inconsistent with declared income",
          "Identify large cash deposits without corresponding business revenue",
          "Check for high-value purchases (property, luxury goods, vehicles) paid via private accounts",
          "Review source-of-funds declarations for completeness and credibility",
        ],
      },
      {
        title: "4. STR obligation under FATF R.3",
        required: false,
        checks: [
          "Tax evasion is a predicate offence for money laundering under UAE AML framework",
          "Assess whether proceeds of evasion are being laundered through the customer's accounts",
          "If ML indicators are present, file STR — tax motive does not reduce the ML risk",
          "Document MLRO decision and legal basis regardless of filing outcome",
        ],
      },
    ],
  },
  {
    id: "insider-threat",
    title: "Insider Threat & Internal Fraud",
    typology: "insider_threat",
    family: "Fraud",
    steps: [
      {
        title: "1. Access & behaviour monitoring",
        required: true,
        checks: [
          "Review system access logs for unusual after-hours access to customer records or case files",
          "Flag bulk data exports or large file downloads outside normal workflows",
          "Identify employees accessing records of accounts they are not assigned to",
          "Monitor for repeated failed authentication or use of shared credentials",
        ],
      },
      {
        title: "2. Transaction anomalies",
        required: true,
        checks: [
          "Identify transactions approved by the same employee repeatedly outside their authorisation limit",
          "Flag manual overrides of automated screening alerts by a single analyst",
          "Check for customer accounts linked to employee addresses, phone numbers, or emails",
          "Review refund, reversal, or credit transactions processed by a single employee without dual approval",
        ],
      },
      {
        title: "3. Whistleblower intelligence",
        required: true,
        checks: [
          "Treat all whistleblower reports of internal fraud as immediately MLRO-reportable",
          "Preserve relevant system logs and records before notifying the suspected employee",
          "Involve HR, Legal, and the MLRO in parallel — do not conduct informal investigation alone",
          "Assess whether the internal fraud constitutes predicate ML requiring STR",
        ],
      },
      {
        title: "4. Escalation & containment",
        required: true,
        checks: [
          "Suspend system access of the suspected employee immediately upon reasonable grounds",
          "Engage forensic IT to preserve evidence without alerting the subject",
          "File STR if employee-facilitated ML is suspected — notify Board and Audit Committee",
          "Review all cases handled by the suspected employee in the prior 24 months",
        ],
      },
    ],
  },
  {
    id: "environmental-crime",
    title: "Environmental Crime & Illegal Extraction",
    typology: "environmental_crime",
    family: "EOCN",
    steps: [
      {
        title: "1. Supply-chain provenance",
        required: true,
        checks: [
          "Obtain documentation of mine of origin for all metals and minerals",
          "Check against IPIS, Global Witness, and UN GoE reports for illegal mining in the source region",
          "Verify no source mine appears on any environmental-crime watchlist or debarment register",
          "Confirm LBMA / RJC Chain-of-Custody certification covers the full upstream chain",
        ],
      },
      {
        title: "2. Regulatory permit verification",
        required: true,
        checks: [
          "Obtain valid mining, export, and transport permits for each shipment",
          "Cross-check permit numbers against the issuing government's public registry",
          "Flag permits that appear altered, expired, or issued by unauthorised authorities",
          "Confirm taxes and royalties have been declared and paid to the source-country government",
        ],
      },
      {
        title: "3. CAHRA & conflict nexus",
        required: true,
        checks: [
          "Identify if source area is on the CAHRA list or subject to UN arms embargo",
          "Check for any nexus to artisanal and small-scale mining (ASM) operations",
          "Screen counterparties against EOCN List B and UN Panel of Experts named entities",
          "Escalate to MLRO if any CAHRA or conflict-mineral indicator is present",
        ],
      },
      {
        title: "4. Environmental due diligence",
        required: false,
        checks: [
          "Obtain environmental impact assessment or equivalent for the source mine",
          "Check for NGO or investigative-journalism reports of illegal logging, fishing, or dumping linked to the supplier",
          "Assess whether proceeds appear to derive from environmental crime (illegal wildlife trade, illegal logging)",
          "Document and escalate if environmental crime indicators are present — these are predicate ML offences under FATF",
        ],
      },
    ],
  },
  {
    id: "hv-dealer",
    title: "High-Value Dealer (Non-Gold DPMS)",
    typology: "hv_dealer",
    family: "DPMS",
    steps: [
      {
        title: "1. Product scope identification",
        required: true,
        checks: [
          "Classify goods: diamonds, coloured gemstones, watches, luxury goods, or other DPMS items",
          "Confirm transaction value — DPMSR threshold applies at AED 55,000 per MoE Circular 2/2024",
          "Obtain provenance documentation: Kimberley Process certificate for rough diamonds",
          "Verify gemstone or watch serial numbers against reported stolen goods databases",
        ],
      },
      {
        title: "2. Customer due diligence",
        required: true,
        checks: [
          "Full CDD for any single transaction or linked transactions ≥ AED 55,000",
          "Screen customer and UBOs against OFAC / UN / EU / UK sanctions and PEP lists",
          "Source-of-funds narrative required for cash component ≥ AED 25,000",
          "Retain copy of government-issued ID — no anonymous sales above threshold",
        ],
      },
      {
        title: "3. Cash & structuring controls",
        required: true,
        checks: [
          "Cash receipts logged in DPMSR register within 24 hours",
          "DPMSR filed within 30 days of trigger transaction",
          "Alert on split transactions designed to stay under threshold",
          "CCTV footage retained for 10 years covering the transaction location",
        ],
      },
      {
        title: "4. Resale & consignment",
        required: false,
        checks: [
          "Consignment arrangements require full CDD on consignor",
          "Resale of high-value goods within 30 days at different price is a TBML red flag",
          "Auction-house transactions: obtain hammer price and buyer's premium documentation",
          "Escalate to MLRO if consignor cannot provide provenance documentation",
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
