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
  {
    id: "private-banking",
    title: "Private Banking & Wealth Management",
    typology: "private_banking",
    family: "PEP",
    steps: [
      {
        title: "1. Client acceptance & source-of-wealth",
        required: true,
        checks: [
          "Obtain detailed source-of-wealth narrative — business sale, inheritance, employment income, investment returns",
          "Triangulate declared SoW against publicly available information (company filings, press reports, property records)",
          "Document the gap between known income history and accumulated wealth — challenge any unexplained accumulation",
          "Senior relationship manager and compliance co-sign the acceptance memo",
        ],
      },
      {
        title: "2. PEP & connected-persons screen",
        required: true,
        checks: [
          "Screen the client, spouse, children, parents, siblings, and known business associates against PEP databases",
          "Classify PEP tier: foreign (mandatory EDD), domestic (risk-based EDD), international organisation (risk-based)",
          "Confirm out-of-office date — PEP status persists for at least 12 months post-position per FATF R.12",
          "Obtain CEO + Board Chair approval for Tier-1 PEP relationships per FDL 10/2025 Art.17",
        ],
      },
      {
        title: "3. Ongoing monitoring — enhanced",
        required: true,
        checks: [
          "Enrol client in daily adverse-media monitoring across all relevant languages and jurisdictions",
          "Annual EDD refresh with updated SoW, source-of-funds for new flows, and sanctions re-screen",
          "Quarterly relationship review meeting documented on file by relationship manager",
          "Any material change in wealth profile triggers an out-of-cycle EDD within 30 days",
        ],
      },
      {
        title: "4. Complex structure & fiduciary risk",
        required: false,
        checks: [
          "Map all trust, foundation, and holding-company layers; identify all principals",
          "Obtain trust deed / foundation charter — confirm trustee discretion and beneficiary class",
          "Verify all intermediary fiduciaries (trustees, lawyers) hold AML licences in their jurisdiction",
          "Escalate to MLRO if beneficial ownership cannot be confirmed through two layers of structure",
        ],
      },
    ],
  },
  {
    id: "ngo",
    title: "Non-Profit Organisation / NGO / Charity (FATF R.8)",
    typology: "ngo",
    family: "CFT",
    steps: [
      {
        title: "1. Registration & governance verification",
        required: true,
        checks: [
          "Confirm the NPO is registered with the relevant authority in its home jurisdiction (e.g. UAE MOSA, UK Charity Commission)",
          "Obtain the NPO's constitutional documents, board member list, and audited accounts",
          "Verify the NPO appears on the official national NPO register — unregistered charities are a hard stop",
          "Screen all board members, trustees, and senior officers against sanctions and PEP lists",
        ],
      },
      {
        title: "2. Programme & geographic risk assessment",
        required: true,
        checks: [
          "Identify all countries where the NPO operates programmes — flag any FATF grey/black-list or conflict-affected jurisdiction",
          "Review the NPO's stated mission vs actual fund deployment — divergence is a red flag",
          "Assess whether any programme activities could benefit armed groups or sanctioned entities",
          "Obtain references from at least two institutional donors (government, UN agency, or major foundation)",
        ],
      },
      {
        title: "3. Funding source analysis",
        required: true,
        checks: [
          "Obtain a full list of donors contributing > 10% of the NPO's annual income",
          "Screen major donors against sanctions and adverse-media databases",
          "Flag any anonymous or cash donations — these are a CFT red flag for NPOs",
          "Verify that restricted donations are used only for their stated purpose (donor intent compliance)",
        ],
      },
      {
        title: "4. Cash & remittance controls",
        required: false,
        checks: [
          "NPO cash disbursements in high-risk geographies require MLRO pre-approval",
          "Wire transfers to programme countries must be to accounts in the NPO's own name — no third-party payments",
          "Obtain beneficiary acknowledgement receipts for aid disbursements above threshold",
          "Escalate immediately if the NPO requests payments to individuals in sanctioned jurisdictions",
        ],
      },
    ],
  },
  {
    id: "luxury-goods",
    title: "Luxury Goods & High-Value Assets (Art, Watches, Cars)",
    typology: "luxury_goods",
    family: "DPMS",
    steps: [
      {
        title: "1. Asset identification & provenance",
        required: true,
        checks: [
          "Document asset: description, serial/VIN/lot number, condition report, and appraised value",
          "Verify provenance — chain-of-title from original seller to current vendor; flag gaps exceeding 5 years",
          "For art: check against the Art Loss Register, Interpol Works of Art database, and IFAR claims register",
          "For vehicles: check HPI/equivalent for finance, theft, or write-off records",
        ],
      },
      {
        title: "2. Buyer & seller CDD",
        required: true,
        checks: [
          "Full CDD on both buyer and seller for transactions ≥ AED 55,000",
          "Source-of-funds narrative — cash and crypto payments are a hard stop without MLRO pre-approval",
          "Screen all parties against OFAC, UN, EU, UK HMT sanctions lists and PEP databases",
          "Third-party payers require documented commercial rationale and MLRO approval",
        ],
      },
      {
        title: "3. Valuation integrity",
        required: true,
        checks: [
          "Obtain an independent valuation from a qualified appraiser for transactions > AED 150,000",
          "Flag purchase price > 20% above or below independent valuation — potential ML indicator",
          "Verify the auction record or sale history — rapid resale at inflated price is a red flag",
          "Check for insurance value discrepancy vs sale price",
        ],
      },
      {
        title: "4. Freeport & storage risk",
        required: false,
        checks: [
          "Identify if the asset is stored in a freeport — freeport storage is elevated risk for ML",
          "Verify the freeport operator is subject to AML/CFT obligations in its jurisdiction",
          "Flag if title has changed multiple times while the asset remained in the same freeport",
          "Escalate to MLRO if the asset has an opaque ownership history involving shell companies",
        ],
      },
    ],
  },
  {
    id: "insurance",
    title: "Insurance Products / Life Assurance",
    typology: "insurance",
    family: "ML",
    steps: [
      {
        title: "1. Policy inception CDD",
        required: true,
        checks: [
          "Full CDD on the policyholder, life assured, and any nominated beneficiary",
          "Screen all parties against sanctions and PEP lists at inception",
          "Verify source-of-premium-funds for single-premium or large regular-premium policies > AED 55,000 p.a.",
          "Flag if the beneficiary is a third party with no apparent insurable interest",
        ],
      },
      {
        title: "2. Policy lifecycle red-flags",
        required: true,
        checks: [
          "Early surrender (within 24 months of inception) with loss accepted — major ML indicator",
          "Premium overpayment followed by refund request to a third party",
          "Assignment of policy to an unrelated third party without plausible commercial reason",
          "Frequent address or beneficiary changes inconsistent with normal life events",
        ],
      },
      {
        title: "3. Claims screening",
        required: true,
        checks: [
          "Re-screen policyholder and beneficiary against sanctions/PEP lists at claim stage",
          "Verify death claim with independent evidence — fraudulent claims are an insurance-fraud indicator",
          "Confirm payment to the policyholder's own bank account — third-party payment requires MLRO approval",
          "Flag where claim follows immediately after policy assignment to a new beneficiary",
        ],
      },
      {
        title: "4. STR trigger assessment",
        required: false,
        checks: [
          "Assess whether early surrender or unusual claim pattern constitutes ML indicator per FDL 10/2025 Art.15",
          "If STR is filed, maintain policy records — do not cancel policy without FIU guidance to avoid tipping-off",
          "Retain all underwriting, claims, and KYC records for 10 years from policy end per FDL 10/2025 Art.24",
          "Notify MLRO of any intermediary (broker) involved in facilitating a suspicious policy",
        ],
      },
    ],
  },
  {
    id: "account-takeover",
    title: "Account Takeover & Social Engineering Fraud",
    typology: "account_takeover",
    family: "Fraud",
    steps: [
      {
        title: "1. Detection indicators",
        required: true,
        checks: [
          "Sudden change in contact details (phone, email, address) shortly before a large withdrawal",
          "Login from new device or unusual geolocation immediately followed by fund transfer",
          "Callback to a number different from the registered number on file",
          "Customer reports not recognising transactions — initiate freeze and investigation immediately",
        ],
      },
      {
        title: "2. Containment",
        required: true,
        checks: [
          "Freeze the account and suspend all outbound payments pending verification",
          "Attempt to contact the customer on the verified number held before the change",
          "Reverse any same-day transactions if the receiving institution's fraud team can be reached",
          "Preserve all authentication logs, IP addresses, device fingerprints, and session data",
        ],
      },
      {
        title: "3. Customer re-authentication",
        required: true,
        checks: [
          "Require in-person or video-verified identity re-authentication before restoring account access",
          "Issue new credentials and invalidate all prior sessions and API tokens",
          "Obtain a signed fraud declaration from the customer for insurance and regulatory purposes",
          "Update the customer's risk rating — ATO victims are higher risk for repeat targeting",
        ],
      },
      {
        title: "4. Regulatory notification",
        required: false,
        checks: [
          "Assess whether the ATO proceeds constitute ML — if so, STR to FIU within 30 days",
          "Notify cyber-crime reporting authority (UAE eCrime / Interpol) if funds were transferred abroad",
          "Preserve evidence for potential law-enforcement request — do not destroy logs",
          "Review whether internal controls failure contributed to the ATO — escalate to Audit Committee if so",
        ],
      },
    ],
  },
  {
    id: "remittance",
    title: "Remittance & Money Transfer Operator",
    typology: "remittance",
    family: "MSB",
    steps: [
      {
        title: "1. MTO licensing verification",
        required: true,
        checks: [
          "Confirm the MTO holds a valid payment service licence from CBUAE or equivalent regulator",
          "Obtain the MTO's AML/CFT programme, most recent audit report, and MLRO contact",
          "Verify the MTO is not on FinCEN or CBUAE lists of unlicensed money transmitters",
          "Screen the MTO entity and its UBOs against OFAC / UN / EU sanctions lists",
        ],
      },
      {
        title: "2. Corridor risk assessment",
        required: true,
        checks: [
          "Identify the top 10 destination countries by volume — flag any FATF grey/black-list corridors",
          "Assess CAHRA exposure in high-volume corridors",
          "Review the MTO's de-risking policy — corridors they have exited may indicate risk they've identified",
          "Compare corridor mix against known hawala/informal transfer corridors",
        ],
      },
      {
        title: "3. Transaction monitoring",
        required: true,
        checks: [
          "Flag structuring: multiple sub-threshold transactions to the same beneficiary within 24 hours",
          "Review round-number cash-funded transfers — these are the most common ML indicator in remittances",
          "Identify frequent transfers from the same sender to multiple different beneficiaries (possible controller)",
          "Check if the MTO's reported transaction volumes are consistent with its AML resource levels",
        ],
      },
      {
        title: "4. Agent network risk",
        required: false,
        checks: [
          "Obtain a list of all sub-agents used by the MTO in the UAE and abroad",
          "Confirm sub-agents are registered and supervised at the local level",
          "Flag any agent operating in a high-risk or unregulated market",
          "Escalate to MLRO if the MTO cannot provide a complete agent list — this is a material gap",
        ],
      },
    ],
  },
  {
    id: "gaming",
    title: "Gaming & Gambling Operations",
    typology: "gaming",
    family: "ML",
    steps: [
      {
        title: "1. Licensing & jurisdiction",
        required: true,
        checks: [
          "Confirm the gaming operator holds a valid licence from a reputable gambling regulator (MGA, UKGC, GRA)",
          "Note: gambling is generally prohibited in the UAE — any gaming-related business must document its legal basis",
          "Screen the operator, its UBOs, and key management against sanctions and PEP lists",
          "Obtain the operator's AML/CFT programme and most recent independent audit",
        ],
      },
      {
        title: "2. ML typologies specific to gaming",
        required: true,
        checks: [
          "Chip dumping: deliberately losing chips to another player to transfer value",
          "Buy-in with illicit funds, minimal play, and cashout as 'winnings'",
          "Third-party funding: customer's account funded by a third party with no relationship",
          "Online gaming: account-to-account transfers used as a payment rail for illicit value",
        ],
      },
      {
        title: "3. Customer due diligence",
        required: true,
        checks: [
          "Full CDD for any customer depositing or withdrawing > EUR/USD 2,000 in a session",
          "Enhanced scrutiny for frequent high-value players with no verifiable source of income",
          "Screen against problem-gambling exclusion lists and self-exclusion registers",
          "Verify payment method — flag cash or crypto funding above threshold",
        ],
      },
      {
        title: "4. Reporting obligations",
        required: false,
        checks: [
          "Assess whether the operator files SARs / STRs in its home jurisdiction",
          "Review the operator's STR triage process — gaming operators are high-risk DNFBPs under FATF R.22",
          "Confirm the operator reports cross-border transactions above threshold to its FIU",
          "Escalate to MLRO if the operator cannot demonstrate an effective AML/CFT programme",
        ],
      },
    ],
  },
  {
    id: "real-estate-agent",
    title: "Real Estate Agent / Broker Reliance (FATF R.22)",
    typology: "real_estate_agent",
    family: "REML",
    steps: [
      {
        title: "1. Agent registration & AML programme",
        required: true,
        checks: [
          "Verify the agent holds a valid DLD / RERA / ADRA licence in the relevant emirate",
          "Obtain the agent's AML/CFT policy and confirm it covers FATF R.22 obligations for DNFBPs",
          "Confirm the agent has a designated MLRO or compliance officer and staff training records",
          "Screen the agency, its principals, and key staff against sanctions and PEP lists",
        ],
      },
      {
        title: "2. Reliance conditions",
        required: true,
        checks: [
          "Confirm reliance is permissible under FDL 10/2025 Art.12 — the introducing agent must be regulated",
          "Execute a written reliance agreement specifying which CDD elements the agent has performed",
          "Obtain copies of the agent's CDD documentation on the customer — do not solely rely on their summary",
          "Retain accountability: reliance does not transfer regulatory liability from the firm to the agent",
        ],
      },
      {
        title: "3. Customer CDD review",
        required: true,
        checks: [
          "Review the agent-provided CDD for completeness: ID, address, source-of-funds, UBO identification",
          "Re-screen the customer against your own sanctions/PEP databases even where the agent has screened",
          "Flag any gap in CDD that the agent could not satisfy — obtain the missing element directly from the customer",
          "Assess whether the agent's CDD meets your firm's own CDD standards, not just the agent's home-jurisdiction minimum",
        ],
      },
      {
        title: "4. Ongoing monitoring of reliance",
        required: false,
        checks: [
          "Annual review of all reliance arrangements — confirm agent remains licensed and AML-compliant",
          "Terminate reliance immediately if agent loses its licence or is found non-compliant with AML obligations",
          "Re-perform CDD directly if the agent-provided file cannot be verified or is more than 24 months old",
          "Document termination of reliance and direct CDD in the customer file",
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
    <ModuleLayout>
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
    </ModuleLayout>
  );
}
