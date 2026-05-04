"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface Playbook {
  id: string;
  title: string;
  typology: string;
  family: string;
  description?: string;
  citations?: string[];
  steps: Array<{
    title: string;
    required: boolean;
    checks: string[];
    citation?: string;
  }>;
}

const PLAYBOOKS: Playbook[] = [
  {
    id: "tbml",
    title: "Trade-Based Money Laundering (TBML)",
    typology: "tbml",
    family: "ML",
    description: "TBML exploits international trade transactions to move value across borders, typically through over/under-invoicing, multiple invoicing, falsely described goods, or phantom shipments. Gold sector entities are primary TBML vectors per FATF DPMS Guidance (2023). Each trade transaction must be benchmarked against world commodity prices and shipping logistics verified end-to-end.",
    citations: ["FATF R.16 (Wire transfers & trade)", "FATF DPMS Guidance 2023 §4", "UAE FDL 10/2025 Art.14", "UN Panel of Experts reports"],
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
    description: "Politically Exposed Persons present heightened corruption and bribery risk due to their public function, influence over government decisions, and access to public funds. FATF R.12 mandates enhanced due diligence for foreign PEPs — including senior management approval — and applies risk-based measures to domestic PEPs and international organization PEPs. UAE FDL 10/2025 Art.17 requires Board-level sign-off for all PEP relationships.",
    citations: ["FATF R.12 (Politically exposed persons)", "UAE FDL 10/2025 Art.17", "CBUAE AML Standards §4.3", "Wolfsberg PEP Guidance 2023"],
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
    description: "Correspondent banking allows foreign institutions to access domestic payment systems. Nested relationships — where a respondent bank provides correspondent services to other institutions through the same channel — amplify risk exponentially. FATF R.13 prohibits relationships with shell banks. FATF R.7 requires targeted financial sanctions screening on all respondent relationships. UAE CBUAE requires Wolfsberg CBDDQ completion before onboarding.",
    citations: ["FATF R.13 (Correspondent banking)", "FATF R.7 (Targeted financial sanctions)", "Wolfsberg CBDDQ 2024", "UAE CBUAE Circular 02/2022"],
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
  {
    id: "sanctions-match-triage",
    title: "Sanctions Match Triage (Potential Hit)",
    typology: "sanctions_match",
    family: "Sanctions",
    steps: [
      {
        title: "1. Immediate containment",
        required: true,
        checks: [
          "Freeze all pending and queued transactions involving the subject pending MLRO review",
          "Do not notify the customer or any third party — tipping-off prohibition applies from the moment of the hit",
          "Log the match with timestamp, list name, match score, and analyst ID in the case file",
          "Escalate to MLRO within 2 hours of the potential hit being identified",
        ],
      },
      {
        title: "2. Match disambiguation",
        required: true,
        checks: [
          "Compare full name, date of birth, nationality, and any identifiers against the listed entry",
          "Run alternative name spellings and transliterations through all active sanctions lists",
          "Check passport, national ID, or LEI numbers against identifiers on the listed entry",
          "Obtain a second-analyst review — no single-person determination on a potential sanctions match",
        ],
      },
      {
        title: "3. MLRO determination",
        required: true,
        checks: [
          "MLRO documents the determination: confirmed match, false positive, or inconclusive requiring further inquiry",
          "For confirmed match: maintain freeze, file FFR via goAML, notify EOCN/FIU within 24 hours",
          "For false positive: document full reasoning, release freeze, update screening whitelist",
          "For inconclusive: extend freeze, escalate to external legal counsel within 48 hours",
        ],
      },
      {
        title: "4. Regulatory filing & record",
        required: true,
        checks: [
          "File Funds Freeze Report (FFR) via goAML for any confirmed TFS match — mandatory within 24 hours",
          "Report to CBUAE / MoE within the mandated timeframe per Cabinet Res 74/2020 Art.7",
          "Retain the full disambiguation file, determination memo, and MLRO sign-off for 10 years",
          "Review and update the sanctions screening configuration if the false-positive rate exceeds 1.0%",
        ],
      },
    ],
  },
  {
    id: "periodic-review",
    title: "Customer Periodic Review & CDD Refresh",
    typology: "periodic_review",
    family: "CDD",
    steps: [
      {
        title: "1. Review trigger verification",
        required: true,
        checks: [
          "Confirm the trigger: scheduled cycle (annual / 3-year / 5-year by risk tier) or event-driven (ownership change, adverse media, STR)",
          "Pull the current customer risk rating and verify it still matches the assigned tier",
          "Check if any open alerts, case flags, or adverse-media hits remain unresolved from the previous review",
          "Confirm the customer's business relationship is still active and revenue-generating",
        ],
      },
      {
        title: "2. CDD document refresh",
        required: true,
        checks: [
          "Re-obtain government-issued ID if the previous copy is older than 5 years or shows expiry",
          "Update corporate registry extract and shareholder register — verify UBO has not changed",
          "Obtain updated source-of-funds narrative and cross-check against transaction history",
          "Re-screen all principals and UBOs against current sanctions, PEP, and adverse-media databases",
        ],
      },
      {
        title: "3. Transaction profile review",
        required: true,
        checks: [
          "Compare actual transaction volumes and types against the expected profile documented at onboarding",
          "Flag any product or service usage not anticipated in the original risk assessment",
          "Review the 12-month transaction history for structuring, round amounts, or unusual counterparties",
          "Update the transaction monitoring rule-set thresholds if the customer's risk profile has changed",
        ],
      },
      {
        title: "4. Risk re-rating & approval",
        required: false,
        checks: [
          "Re-score the customer using the current risk-scoring matrix — document any tier change and reason",
          "Upgrades to High risk require MLRO approval and trigger EDD within 14 days",
          "Downgrades from High risk require dual approval (MLRO + CO) and are logged in the audit chain",
          "If re-KYC cannot be completed within 30 days, escalate to MLRO for relationship exit assessment",
        ],
      },
    ],
  },
  {
    id: "cash-intensive",
    title: "Cash-Intensive Business (Non-DPMS)",
    typology: "cash_intensive",
    family: "ML",
    steps: [
      {
        title: "1. Business profile verification",
        required: true,
        checks: [
          "Confirm the business type and expected cash-intensity ratio (F&B, retail, car wash, parking, laundry)",
          "Obtain trade licence, municipal permit, and any sector-specific operating licence",
          "Verify physical premises — site visit report or independent verification for high-risk cases",
          "Document the expected monthly cash receipts and compare against declared revenue",
        ],
      },
      {
        title: "2. Cash flow plausibility",
        required: true,
        checks: [
          "Benchmark declared cash revenue against the sector average for comparable businesses in the UAE",
          "Flag any gap > 25% between declared turnover and transactional deposits without commercial rationale",
          "Check for cash deposits immediately followed by outbound wires — classic placement indicator",
          "Review whether cash deposits are made at consistent intervals or show irregular spikes",
        ],
      },
      {
        title: "3. Structuring detection",
        required: true,
        checks: [
          "Identify deposits < AED 55,000 that, when aggregated over 48 hours, exceed the threshold",
          "Flag use of multiple branches or ATMs for cash deposits on the same day",
          "Review whether the frequency and size of deposits match the business's stated operating pattern",
          "Check for third-party cash depositors — cash deposited by a person other than the account holder is a red flag",
        ],
      },
      {
        title: "4. Enhanced scrutiny triggers",
        required: false,
        checks: [
          "Escalate to MLRO if cash deposits exceed 80% of total inflows without documented business reason",
          "Request point-of-sale or till-roll data to corroborate cash revenue for high-risk cases",
          "Consider an unannounced site visit if the business cannot produce supporting commercial records",
          "File STR if there is no plausible explanation for the cash volume observed",
        ],
      },
    ],
  },
  {
    id: "mortgage-finance",
    title: "Mortgage & Property Finance ML Check",
    typology: "mortgage_finance",
    family: "REML",
    steps: [
      {
        title: "1. Borrower CDD",
        required: true,
        checks: [
          "Full CDD on the borrower: ID, address, employment or income verification, and UBO if corporate borrower",
          "Obtain proof of deposit funds — bank statements for the last 6 months showing accumulation",
          "Flag any large lump-sum deposits into the borrower's account in the 90 days before application",
          "Screen borrower and all guarantors against sanctions, PEP, and adverse-media lists",
        ],
      },
      {
        title: "2. Property & valuation integrity",
        required: true,
        checks: [
          "Obtain independent RICS-certified valuation — reject any application where price exceeds valuation by > 15%",
          "Check prior ownership history — rapid resale (< 12 months) at inflated price is a red flag",
          "Verify the property is not listed on any court seizure, restraint, or enforcement register",
          "Confirm the seller is the registered owner and there are no undisclosed encumbrances",
        ],
      },
      {
        title: "3. Payment route & third parties",
        required: true,
        checks: [
          "All mortgage disbursements must flow directly to the seller's solicitor or escrow account",
          "Third-party contributions to the deposit (beyond a gift from close family) require MLRO approval",
          "Confirm the solicitor / conveyancer is licensed and subject to AML obligations in their jurisdiction",
          "Flag any instruction to divert loan proceeds to a party not identified in the sale agreement",
        ],
      },
      {
        title: "4. Rental income validation",
        required: false,
        checks: [
          "For buy-to-let: obtain tenancy agreements and verify rental income matches declared projection",
          "Flag where rental yield significantly exceeds the local market rate — may indicate inflated purchase price",
          "Cross-check declared rental income against the borrower's tax or income declarations where available",
          "Escalate to MLRO if rental income cannot be independently verified for high-value properties",
        ],
      },
    ],
  },
  {
    id: "crypto-otc",
    title: "Crypto OTC / Peer-to-Peer Exchange",
    typology: "crypto_otc",
    family: "VASP",
    steps: [
      {
        title: "1. OTC desk / P2P platform assessment",
        required: true,
        checks: [
          "Confirm the OTC desk or P2P platform is licensed under VARA or an equivalent FATF-member regulator",
          "Obtain the platform's AML/CFT policy, Travel Rule compliance attestation, and most recent audit",
          "Verify the platform applies KYC for all transactions — anonymous or pseudonymous trades are a hard stop",
          "Screen the OTC operator, its UBOs, and key personnel against OFAC, UN, and EU sanctions lists",
        ],
      },
      {
        title: "2. Blockchain analytics — OTC-specific",
        required: true,
        checks: [
          "Run on-chain analytics on all wallet addresses involved in the OTC transaction",
          "Flag any address with > 5% exposure to darknet markets, sanctioned entities, mixers, or ransomware clusters",
          "Identify whether the counterparty wallet has transacted with a mixer or privacy protocol in the last 12 months",
          "Obtain blockchain analytics report (Chainalysis / Elliptic) and retain in the case file",
        ],
      },
      {
        title: "3. Trade structure & pricing",
        required: true,
        checks: [
          "Verify the OTC price is within 3% of the spot price on a major regulated exchange — large discounts are a red flag",
          "Confirm the counterparty's source-of-crypto-funds: mining, exchange purchase, staking, or inherited",
          "Flag trades where the counterparty cannot explain the origin of a large holding",
          "Ensure the OTC trade is documented with a signed term sheet or trade confirmation",
        ],
      },
      {
        title: "4. Travel Rule compliance",
        required: false,
        checks: [
          "Collect originator and beneficiary VASP data for any transfer ≥ USD 1,000 equivalent",
          "Verify Travel Rule message is transmitted via TRISA, OpenVASP, or equivalent protocol",
          "Hard-stop any OTC settlement to an unhosted wallet > AED 3,500 without enhanced verification and MLRO approval",
          "Retain all Travel Rule messages and on-chain transaction hashes for 10 years",
        ],
      },
    ],
  },
  {
    id: "customer-exit",
    title: "Customer Exit & Relationship Termination",
    typology: "customer_exit",
    family: "Risk",
    steps: [
      {
        title: "1. Exit trigger classification",
        required: true,
        checks: [
          "Document the trigger: (a) confirmed sanctions match; (b) CDD failure after 30 days; (c) UBO refusal; (d) post-STR MLRO decision; (e) risk appetite breach",
          "Obtain MLRO sign-off on the exit decision — no relationship can be terminated by commercial staff alone",
          "Log the exit decision in the audit chain with trigger date, rationale, and approving officer",
          "Assess whether the exit itself constitutes a tipping-off risk — if STR is filed, coordinate with FIU before acting",
        ],
      },
      {
        title: "2. Pre-exit obligations",
        required: true,
        checks: [
          "Confirm no regulatory hold (court order, FIU instruction, or TFS freeze) prevents the return of funds",
          "Identify all accounts, products, and exposures held by the customer — include related-party accounts",
          "Obtain legal sign-off if the customer has ongoing disputes, litigation, or regulatory proceedings",
          "Notify internal stakeholders (relationship manager, legal, finance) under strict confidentiality",
        ],
      },
      {
        title: "3. Fund return & account closure",
        required: true,
        checks: [
          "Return funds only to a verified account in the customer's own name at a regulated institution",
          "No cash exits — all return payments must be by wire transfer with full originator data",
          "Cancel all standing orders, direct debits, and third-party mandates before closing the account",
          "Issue a formal exit notice to the customer — do not disclose the AML reason; cite 'policy review' only",
        ],
      },
      {
        title: "4. Post-exit monitoring",
        required: false,
        checks: [
          "Maintain a 12-month post-exit monitoring flag on the customer's identifiers in the screening system",
          "Preserve all CDD records, STR artefacts, and case documentation for the full 10-year retention period",
          "If the exit was driven by regulatory direction, notify the Board and relevant regulator within 5 business days",
          "Review whether related or introduced customers share the same risk profile and may require accelerated review",
        ],
      },
    ],
  },
  {
    id: "ransomware-proceeds",
    title: "Ransomware & Cybercrime Proceeds",
    typology: "ransomware",
    family: "VASP/Fraud",
    steps: [
      {
        title: "1. Incident identification",
        required: true,
        checks: [
          "Confirm whether any customer account has received funds from a wallet flagged by Chainalysis / Elliptic as ransomware-linked",
          "Flag accounts showing sudden large inflows from multiple wallet addresses within a short window (ransomware payment aggregation pattern)",
          "Check whether the customer has reported a ransomware incident or been named in public breach disclosures",
          "Freeze the suspected proceeds account immediately and escalate to MLRO within 2 hours",
        ],
      },
      {
        title: "2. Blockchain forensics",
        required: true,
        checks: [
          "Run a full on-chain trace of inbound funds using Chainalysis Reactor or Elliptic Investigator",
          "Identify the ransomware strain or criminal cluster associated with the sending wallet",
          "Map the layering route: ransomware wallet → mixer → exchange → customer account",
          "Retain the full blockchain analytics report and on-chain transaction hashes in the case file",
        ],
      },
      {
        title: "3. Regulatory & law enforcement notification",
        required: true,
        checks: [
          "File STR via goAML without delay — cybercrime proceeds are a predicate ML offence under FDL 10/2025",
          "Notify UAE eCrime (Dubai Police Cybercrime Unit or Abu Dhabi cybercrime authority) if funds are within the UAE",
          "If OFAC-designated ransomware actor is involved (e.g. Lazarus Group), report to OFAC under mandatory reporting obligation",
          "Cooperate fully with any FIU or law enforcement production order — do not destroy or alter any records",
        ],
      },
      {
        title: "4. Customer assessment",
        required: false,
        checks: [
          "Determine whether the customer is a victim (ransomware payer) or a proceeds holder (potential co-conspirator)",
          "For ransomware victims: provide appropriate support while complying with OFAC ransom-payment guidance",
          "For proceeds holders: maintain account freeze, do not tip-off, and await FIU direction before releasing any funds",
          "Review whether the customer's cybersecurity posture requires enhanced due diligence going forward",
        ],
      },
    ],
  },
  {
    id: "bor-filing",
    title: "Beneficial Owner Register (BOR) Annual Filing",
    typology: "bor_filing",
    family: "UBO",
    steps: [
      {
        title: "1. Entity scoping",
        required: true,
        checks: [
          "Identify all UAE-registered legal entities within scope of Cabinet Decision 58/2020 (BOR obligations)",
          "Confirm exemptions: entities regulated by CBUAE, SCA, or VARA are exempt from MoE BOR but must maintain internal UBO registers",
          "Verify the most recent BOR filing date — annual renewal is due within 60 days of the anniversary of registration",
          "Assign a responsible officer for each entity's BOR filing and record in the compliance calendar",
        ],
      },
      {
        title: "2. UBO data collection",
        required: true,
        checks: [
          "Identify all natural persons holding ≥ 25% direct or indirect ownership or exercising equivalent control",
          "Obtain: full legal name, nationality, date of birth, place of birth, residential address, and ID document details for each UBO",
          "Where no natural person holds ≥ 25%, identify the senior managing official as the notional UBO for filing purposes",
          "Cross-check UBO data against certified registry extracts and the most recent shareholder register",
        ],
      },
      {
        title: "3. Submission to MoE BOR",
        required: true,
        checks: [
          "Log into the UAE Ministry of Economy BOR portal and update or confirm UBO records",
          "Attach certified supporting documents (passport copies, registry extracts) as required by the portal",
          "Obtain and retain the BOR submission confirmation number and timestamp",
          "Notify the MLRO of the completed filing and update the compliance calendar for the next annual cycle",
        ],
      },
      {
        title: "4. Change-event triggers",
        required: false,
        checks: [
          "Any change in UBO (new shareholder acquiring ≥ 25%, change in control, death of UBO) must be filed within 15 days",
          "Corporate restructuring that alters the beneficial ownership chain triggers an immediate BOR update",
          "Monitor for share transfers, capital increases, or trust amendments that may affect the UBO position",
          "Failure to file or update the BOR is a criminal offence under UAE law — escalate any delay to legal counsel immediately",
        ],
      },
    ],
  },
  {
    id: "moe-dpms-supervisor",
    title: "MoE DPMS Supervisor Compliance (Cabinet Decision 109/2023)",
    typology: "moe_dpms",
    family: "MoE",
    steps: [
      {
        title: "1. Registration & supervisor onboarding",
        required: true,
        checks: [
          "Register the DNFBP with the Ministry of Economy AML/CFT Department per Cabinet Decision 109/2023 Art.4",
          "Activate goAML access via UAE FIU and link the entity's MoE Trade Licence number",
          "Appoint and notify the MLRO and Deputy MLRO to MoE within 30 days of activity commencement (FDL 10/2025 Art.21)",
          "Subscribe the MLRO to MoE Circulars + EOCN list-update mailing lists; confirm receipt of the latest circular pack",
        ],
      },
      {
        title: "2. Risk-based AML/CFT programme",
        required: true,
        checks: [
          "Document an enterprise-level Business Risk Assessment (BRA) covering customer, geography, product, channel, transaction risks per FDL 10/2025 Art.4 and MoE BRA template",
          "Approve the AML/CFT policy, CDD/EDD procedures, and Sanctions/TFS procedures at Board / senior-management level",
          "Define and approve a Sectoral Risk Assessment for the DPMS sub-sector (gold, diamonds, gemstones, watches, luxury) — annual refresh",
          "Map every line of business to MoE Circular reference (08/AML/2021 for DPMS cash threshold; 03/AML/2022 for free-zone DPMS; 05/AML/2023 for online platforms)",
        ],
      },
      {
        title: "3. DPMS-specific cash-threshold reporting",
        required: true,
        checks: [
          "Identify any single or aggregated cash transaction ≥ AED 55,000 with a single customer (MoE Circular 08/AML/2021 — FATF Rec. 22 implementation)",
          "File a DPMS Threshold Report (DPMSR) via goAML within 14 days of the transaction date — file even if the transaction is non-suspicious",
          "Aggregate connected/linked transactions (same beneficial owner, same 24h window) before applying the threshold",
          "Retain DPMSR submission acknowledgement + supporting invoice/CoC for 5 years (FDL 10/2025 Art.24)",
        ],
      },
      {
        title: "4. KPI / supervisor return",
        required: true,
        checks: [
          "Submit the MoE AML/CFT Compliance KPI return on the supervisor-published cadence (currently semi-annual)",
          "Report fields include: customer count by risk tier, EDD count, STR/DPMSR count, screening false-positive rate, training completion %, audit findings",
          "MLRO and Senior Management must sign-off the KPI return prior to submission",
          "Retain the signed return + acknowledgement for the regulatory audit pack",
        ],
      },
      {
        title: "5. Inspection readiness",
        required: false,
        checks: [
          "Maintain an evergreen 'inspection pack': BRA + SRA + AML/CFT policy + CDD procedures + last 12 months STR/DPMSR + training register + independent audit report",
          "Pre-stage anonymised CDD samples covering each risk tier for sampling-based MoE inspections",
          "Track all open MoE supervisor findings with target close date and responsible owner",
          "Ensure the goAML user list reflects current staff — remove leavers within 24 hours of departure",
        ],
      },
    ],
  },
  {
    id: "fiu-goaml-filing",
    title: "FIU UAE — goAML Filing Workflow (FDL 10/2025 Art.15)",
    typology: "fiu_goaml",
    family: "FIU",
    steps: [
      {
        title: "1. Pre-filing triage",
        required: true,
        checks: [
          "Confirm the trigger: STR (suspicion of ML/TF), SAR (broader suspicious activity), DPMSR (cash threshold ≥ AED 55k), HRTR (high-risk-country counterparty), PNMR (partial-name sanctions match), FFR (TFS asset freeze) — each maps to a distinct goAML report-type code",
          "Decide WITHOUT DELAY — FDL 10/2025 Art.26 prohibits any post-suspicion delay; the file-or-not decision must be documented even if 'do not file'",
          "Tipping-off prohibition is absolute: no notification to the customer, counterparty, or any external party that a report is being or has been filed (FDL 10/2025 Art.29 — criminal offence)",
          "MLRO is the named filer; deputy may file only if MLRO is unavailable and the case file records the deputy's authority",
        ],
      },
      {
        title: "2. Drafting the report (goAML XML envelope)",
        required: true,
        checks: [
          "Use the live UAE FIU goAML schema — verify schema version against the FIU portal before generating XML; reject any cached schema older than 90 days",
          "Populate report header: rentity_id, rentity_branch (if any), reporting_person (MLRO full name + occupation + email + phone), submission_code (E for new, R for revision)",
          "Include all involved persons with full legal name, DOB, ID type/number, nationality, address; include all involved entities with legal name, registration number, country of incorporation",
          "Currency MUST be local (AED) per UAE FIU guidance; convert foreign-currency legs at value-date Central Bank reference rate and document the rate",
          "Narrative: who / what / when / where / why is suspicious; cite specific red flags + brain reasoning chain; minimum 200 words",
        ],
      },
      {
        title: "3. Submission",
        required: true,
        checks: [
          "Submit via goAML web portal under MLRO credentials; do NOT use shared accounts",
          "Capture the goAML reference number + acknowledgement timestamp in the case timeline",
          "Reports rejected by goAML schema validation must be corrected and re-submitted within 24h — log the rejection reason",
          "If the report is filed in error / withdrawn, file a Revision (submission_code R) referencing the original goAML reference; never delete a report",
        ],
      },
      {
        title: "4. Post-filing case management",
        required: true,
        checks: [
          "Apply transaction holds where lawful and where the file-without-delay obligation does not require advance customer notice (FDL 10/2025 Art.27)",
          "Respond to FIU follow-up requests within the deadline stated in the request (typically 48h–7 days); maintain an FIU correspondence log",
          "Re-screen the subject + their network after every FIU acknowledgement — late-arriving sanctions designations are common in active investigations",
          "Document the four-eyes review: MLRO + a second officer (CCO, Board chair or designated alternate) sign off the closure of every filed case",
        ],
      },
      {
        title: "5. Retention & audit",
        required: true,
        checks: [
          "Retain the full case file (XML, narrative draft, supporting documents, screening logs, MLRO decision memo) for ≥ 5 years from filing date — 10 years for sanctions-related FFRs (FDL 10/2025 Art.24)",
          "Quarterly MLRO assurance review of every filed and not-filed decision; sample 10% for second-line review",
          "Annual independent audit must test STR effectiveness: filing volumes, average decision time, outcome tracking, FIU feedback closure",
          "Tipping-off training certification must be current (≤12 months) for every customer-facing employee",
        ],
      },
    ],
  },
  {
    id: "eocn-tfs",
    title: "EOCN — Targeted Financial Sanctions (Cabinet Decision 74/2020)",
    typology: "eocn_tfs",
    family: "EOCN",
    steps: [
      {
        title: "1. List-update intake",
        required: true,
        checks: [
          "Subscribe to EOCN, UNSC 1267/1988/1989, and UNSC 1718/2231 list-update channels; configure automated alerts to MLRO + Deputy MLRO + Board observer",
          "On every UNSC list update, the EOCN UAE local list is updated automatically — re-screening obligation is triggered immediately upon UNSC publication, not when EOCN re-publishes",
          "Log the inbound list-update timestamp + source URL + checksum on the EOCN intake register",
          "Confirm receipt to EOCN within the supervisor-prescribed deadline (currently 24h) where confirmation is required",
        ],
      },
      {
        title: "2. 24-hour customer-base re-screening (immediate freeze)",
        required: true,
        checks: [
          "Re-screen the ENTIRE active customer + counterparty + UBO base against the new list within 24 hours of UNSC publication (Cabinet Decision 74/2020 Art.10)",
          "On any positive match: implement an immediate, no-prior-notice, no-delay freeze on all funds, accounts, and economic resources of the listed person/entity",
          "The freeze is automatic and self-executing — no court order or supervisor approval is required to freeze (Cabinet Decision 74/2020 Art.13)",
          "File a Funds-Freezing Report (FFR) via goAML within 5 days; file a Partial-Name Match Report (PNMR) within 2 days for partial matches under triage",
        ],
      },
      {
        title: "3. Match disposition & MLRO sign-off",
        required: true,
        checks: [
          "Each match enters a four-eyes triage: confirm / false-positive / pending; only the MLRO can confirm a true match",
          "False-positive disposition requires positive identifiers (DOB, ID number, registration number, alias miss) — never close on name alone",
          "Confirmed match: keep the freeze in place, file FFR, escalate to CEO + Board, prepare delisting application only on customer petition (no unilateral unfreeze)",
          "Disposition record must include: list-version date, match score, attenuators / amplifiers, MLRO decision memo, second-officer counter-sign",
        ],
      },
      {
        title: "4. Communications & tipping-off avoidance",
        required: true,
        checks: [
          "Notify EOCN of every freeze action within the prescribed deadline using the EOCN-published template (typically same business day)",
          "Tipping-off the listed person, the counterparty, or any third party that a freeze is in place is a criminal offence (FDL 10/2025 Art.29)",
          "Internal communications must be on a strict need-to-know basis: MLRO, CEO, Board, legal counsel, payments-system operator only",
          "Customer-facing comms must use generic 'compliance hold' language approved by legal counsel; never reference EOCN, UNSC, or sanctions",
        ],
      },
      {
        title: "5. Annual EOCN declaration",
        required: true,
        checks: [
          "File the EOCN Annual Compliance Declaration by 31 March each year (or supervisor-published date)",
          "Declaration content: number of list updates received, re-screening completion times (median + max), match counts (positive / partial / false), freeze actions, FFRs filed, training completion",
          "Board sign-off is mandatory; the declaration is a formal regulatory submission and false statements carry administrative + criminal liability",
          "Retain the signed declaration + supporting evidence for 5 years",
        ],
      },
    ],
  },
  {
    id: "oecd-ddg-gold",
    title: "OECD Due Diligence Guidance — Upstream Gold (Annex II)",
    typology: "oecd_ddg",
    family: "OECD",
    steps: [
      {
        title: "1. Step 1 — Strong management systems",
        required: true,
        checks: [
          "Adopt and Board-approve a Responsible Sourcing Policy aligned with OECD DDG Annex II (gold-specific) and LBMA Responsible Gold Guidance v9",
          "Designate a senior officer accountable for DDG implementation; document the reporting line to the Board",
          "Implement a confidential, non-retaliatory grievance mechanism accessible to upstream workers, communities, and civil society",
          "Maintain a chain-of-custody / traceability system that records every transformation step from mine / recycler to refined gold output",
        ],
      },
      {
        title: "2. Step 2 — Identify and assess risk in the supply chain",
        required: true,
        checks: [
          "Map the full upstream supply chain: mine of origin (or recycler of origin for recycled gold), transit countries, intermediaries, refiners",
          "Apply Annex II red flags: CAHRA origin, unknown origin, mixed lots, suspiciously low / high price, unusual transport routes, opaque intermediary, cash settlement",
          "Cross-reference suppliers against UN GoE reports (DRC, CAR, Sudan), Global Witness, IPIS, OFAC SDN, and the EOCN local list",
          "Document the Annex-II red-flag determination for every supplier on every shipment; retain for 5 years",
        ],
      },
      {
        title: "3. Step 3 — Design and implement a strategy to respond to risks",
        required: true,
        checks: [
          "Report identified risks to senior management with a measurable mitigation plan and timeline",
          "Risk mitigation hierarchy: continue trade with measurable improvement → suspend trade pending improvement → disengage where serious abuses or non-cooperation persist",
          "For 'serious abuses' (worst-forms-of-child-labour, forced labour, war crimes, torture, financing of NSAGs) — immediate disengagement per Annex II",
          "Document the supplier's written commitment to OECD DDG and the agreed improvement milestones",
        ],
      },
      {
        title: "4. Step 4 — Independent third-party audit",
        required: true,
        checks: [
          "Commission an annual Step-4 audit by an LBMA-approved audit firm (KPMG, BDO, EY, PwC, or equivalent)",
          "Audit scope: management systems (Step 1), risk identification (Step 2), risk mitigation (Step 3), grievance mechanism, public reporting (Step 5)",
          "Resolve all major non-conformances within 90 days; minor findings within 180 days; retain audit reports for 5 years and submit summary to LBMA",
          "Failure to close major findings within 12 months triggers LBMA Good Delivery suspension — escalate to Board and group MLRO immediately",
        ],
      },
      {
        title: "5. Step 5 — Annual public reporting",
        required: true,
        checks: [
          "Publish an Annual Responsible Sourcing Report covering Steps 1-4, in line with OECD DDG Annex II reporting expectations",
          "Report contents: policy statement, supply-chain map (anonymised where commercially sensitive), risk-identification summary, mitigation actions, audit-finding closure, KPIs",
          "Co-file with EOCN Annual Declaration (UAE) and submit summary to LBMA + RJC where applicable; retain Board-signed copy",
          "Make the report freely accessible on the corporate website for ≥ 3 years from publication",
        ],
      },
    ],
  },
  {
    id: "structuring",
    title: "Structuring & Smurfing",
    typology: "structuring",
    family: "ML",
    steps: [
      { title: "1. Pattern detection", required: true, checks: [
        "Aggregate cash deposits across all accounts of same UBO over rolling 7 / 30 / 90 day windows",
        "Flag deposits clustered just below CTR / cash-reporting thresholds (e.g. AED 55k pattern)",
        "Identify multiple branches / ATMs used same day by same beneficial owner",
      ]},
      { title: "2. Network analysis", required: true, checks: [
        "Map related parties depositing to the same beneficiary account",
        "Cross-reference depositor IDs against linked-customer table",
        "Detect smurf rings: many low-tier customers funding one consolidator",
      ]},
      { title: "3. Disposition", required: true, checks: [
        "File goAML STR if pattern persists after RFI",
        "Apply transaction monitoring rule lock + escalate to MLRO",
        "Document FATF R.10 EDD trigger and retain evidence for 5 years",
      ]},
    ],
  },
  {
    id: "cuckoo-smurfing",
    title: "Cuckoo Smurfing",
    typology: "cuckoo-smurfing",
    family: "ML",
    steps: [
      { title: "1. Beneficiary identification", required: true, checks: [
        "Verify legitimate beneficiary expecting inbound remittance",
        "Confirm originator declared by sender vs. true source of cash",
        "Detect mismatch between remitter name and depositor name at branch",
      ]},
      { title: "2. Source-of-funds inquiry", required: true, checks: [
        "Request original sender's bank reference and SWIFT MT103",
        "Compare cash deposit pattern against expected wire receipt timing",
        "Verify legitimate underlying trade or family-support narrative",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "Brief beneficiary that funds are being withheld pending verification",
        "File STR citing FATF Methodology IO.4 cuckoo-smurfing typology",
        "Notify correspondent bank and freeze further inbound credits",
      ]},
    ],
  },
  {
    id: "funnel-account",
    title: "Funnel Account",
    typology: "funnel-account",
    family: "ML",
    steps: [
      { title: "1. Account profiling", required: true, checks: [
        "Identify accounts receiving deposits from ≥ 5 unrelated geographies in 30 days",
        "Detect rapid pass-through: balance returns to near zero within 48h",
        "Flag third-party deposits exceeding declared business turnover",
      ]},
      { title: "2. Geographic dispersion", required: true, checks: [
        "Plot deposit ATM / branch locations vs. account holder's domicile",
        "Flag deposits in high-risk source states (CAHRA, sanctioned jurisdictions)",
        "Cross-reference depositor IDs against narcotics watchlist",
      ]},
      { title: "3. Action", required: true, checks: [
        "Restrict third-party cash deposits and revert to wire-only credits",
        "File STR with FinCEN funnel-account advisory references",
        "Escalate to LE liaison if narcotics nexus detected",
      ]},
    ],
  },
  {
    id: "bmpe",
    title: "Black Market Peso Exchange",
    typology: "bmpe",
    family: "ML",
    steps: [
      { title: "1. Trade-flow detection", required: true, checks: [
        "Identify USD-denominated invoices settled by Latin American peso brokers",
        "Detect third-party USD payments from non-customer accounts to UAE exporters",
        "Flag mismatch between buyer-of-record and actual payer",
      ]},
      { title: "2. Counterparty diligence", required: true, checks: [
        "Verify Colombian / Mexican importer registration and customs records",
        "Screen broker network against DEA / OFAC narcotics designations",
        "Obtain end-to-end trade documentation including freight forwarder",
      ]},
      { title: "3. Disposition", required: true, checks: [
        "Refuse third-party settlement; insist payment from buyer-of-record",
        "File STR citing FinCEN BMPE advisory FIN-2014-A005",
        "Brief correspondent bank and tighten USD nostro monitoring",
      ]},
    ],
  },
  {
    id: "underground-banking",
    title: "Hundi / Underground Banking",
    typology: "underground-banking",
    family: "MSB",
    steps: [
      { title: "1. Channel detection", required: true, checks: [
        "Identify customers conducting offsetting deposits and withdrawals across borders without wires",
        "Flag round-figure deposits matched by round-figure third-party payments",
        "Detect unlicensed remitter activity: high cash velocity + no MSB license",
      ]},
      { title: "2. Compliance review", required: true, checks: [
        "Verify CBUAE money-services license for any party operating remittance",
        "Cross-check counterparty against Indian / Pakistani / Bangladeshi PSA lists",
        "Document customer's stated trade vs. observed cash flow",
      ]},
      { title: "3. Action", required: true, checks: [
        "Exit relationship if unlicensed MVTS service inferred",
        "File goAML STR — FATF R.14 unregistered MVTS",
        "Escalate to CBUAE and FIU for licensing inquiry",
      ]},
    ],
  },
  {
    id: "prepaid-cards",
    title: "Prepaid Cards & Stored Value",
    typology: "prepaid-cards",
    family: "Payments",
    steps: [
      { title: "1. Loading patterns", required: true, checks: [
        "Detect bulk card loads above EUR 1,000 / USD 1,000 (FATF R.16 thresholds)",
        "Flag cards loaded by third parties using cash",
        "Identify multiple cards purchased same day at same merchant by one customer",
      ]},
      { title: "2. Usage analysis", required: true, checks: [
        "Flag cross-border ATM withdrawals draining loaded value within 24h",
        "Detect P2P card-to-card transfers between unrelated parties",
        "Aggregate prepaid spend across all instruments to detect threshold avoidance",
      ]},
      { title: "3. Controls", required: true, checks: [
        "Apply load and withdrawal limits per CBUAE prepaid-card regulation",
        "Enforce KYC at activation for cards above low-value threshold",
        "File STR for anonymous bulk-load patterns",
      ]},
    ],
  },
  {
    id: "casino-junket",
    title: "Casino Junket / VIP Room",
    typology: "casino-junket",
    family: "ML",
    steps: [
      { title: "1. Player onboarding", required: true, checks: [
        "Verify junket operator licensing in source and host jurisdiction",
        "Apply EDD on VIP players staking ≥ USD 50k per session",
        "Document source-of-wealth and source-of-funds for junket buy-ins",
      ]},
      { title: "2. Chip-purchase monitoring", required: true, checks: [
        "Detect chips bought with cash but redeemed via wire to third parties",
        "Flag minimal-play behaviour: buy-in followed by quick cash-out",
        "Reconcile chip movements against junket cage records",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File CTR-equivalent for cash transactions ≥ AED 55k (UAE) / USD 10k (US)",
        "File STR on minimal-play / chip-washing pattern",
        "Notify regulator on junket operator integrity concerns",
      ]},
    ],
  },
  {
    id: "bulk-cash-smuggling",
    title: "Bulk Cash Smuggling",
    typology: "bulk-cash-smuggling",
    family: "ML",
    steps: [
      { title: "1. Border declaration check", required: true, checks: [
        "Verify customs cash declaration on inbound funds ≥ AED 60,000 (FDL 10/2025 Art.21)",
        "Cross-check declared origin against currency-marking / pack-band data",
        "Inspect courier identity and travel pattern against high-risk corridor list",
      ]},
      { title: "2. Source verification", required: true, checks: [
        "Obtain bank withdrawal records for declared origin",
        "Verify commercial purpose: trade settlement, family remittance, payroll",
        "Match declared amount with deposit narrative within 48 hours",
      ]},
      { title: "3. Disposition", required: true, checks: [
        "Refuse deposit if source documentation absent or inconsistent",
        "File STR citing FATF R.32 cash-courier typology",
        "Notify customs and FIU under inter-agency MoU",
      ]},
    ],
  },
  {
    id: "narcotics-proceeds",
    title: "Narcotics Trafficking Proceeds",
    typology: "narcotics-proceeds",
    family: "ML",
    steps: [
      { title: "1. Indicator screen", required: true, checks: [
        "Detect rapid cash deposits in known narcotics source / transit states",
        "Flag adverse media: arrests, seizures, drug-trafficking convictions",
        "Cross-check counterparties against DEA / EUROPOL / Interpol notices",
      ]},
      { title: "2. Network mapping", required: true, checks: [
        "Map money-flow graph between depositors and ultimate beneficiaries",
        "Identify shell entities receiving consolidated proceeds",
        "Trace proceeds-to-asset conversion: real estate, luxury goods, crypto",
      ]},
      { title: "3. Action", required: true, checks: [
        "File STR with full narcotics-typology narrative and FATF IO.8 reference",
        "Freeze accounts pending FIU instruction (no tipping-off)",
        "Coordinate with LE liaison for asset-recovery action",
      ]},
    ],
  },
  {
    id: "wildlife-trafficking",
    title: "Wildlife Trafficking (CITES)",
    typology: "wildlife-trafficking",
    family: "EOCN",
    steps: [
      { title: "1. Species & permit check", required: true, checks: [
        "Identify CITES Appendix I/II/III listed species in trade documents",
        "Verify export permit, import permit and re-export certificate authenticity",
        "Cross-reference exporter / importer against TRAFFIC and EUROPOL lists",
      ]},
      { title: "2. Routing analysis", required: true, checks: [
        "Plot transit chain through known wildlife-trafficking hubs (e.g. Vietnam, Mozambique)",
        "Detect mislabeled freight: ivory as 'plastic figurines', pangolin scales as 'fish meal'",
        "Flag aviation cargo with falsified airway bills and weight mismatches",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File STR citing FATF Wildlife-Trafficking Typologies (2020) & UNTOC",
        "Notify MoCCAE / national CITES management authority",
        "Coordinate with INTERPOL Project Wisdom and UNODC focal point",
      ]},
    ],
  },
  {
    id: "counterfeit-goods",
    title: "Counterfeit Goods & IP Crime",
    typology: "counterfeit-goods",
    family: "ML",
    steps: [
      { title: "1. Trade-flow indicators", required: true, checks: [
        "Compare invoice unit price against MSRP / brand reference data",
        "Flag generic descriptions ('apparel', 'accessories') for branded goods",
        "Identify free-zone re-export routing characteristic of counterfeit chains",
      ]},
      { title: "2. Brand-owner verification", required: true, checks: [
        "Obtain authorised-distributor / brand-owner attestation",
        "Verify trademark registration in source and destination markets",
        "Cross-check supplier against rights-holder watchlists",
      ]},
      { title: "3. Disposition", required: true, checks: [
        "Refuse trade-finance instrument lacking brand-owner attestation",
        "File STR with predicate-offence typology IP / counterfeit",
        "Notify customs and rights-holder via brand-protection programme",
      ]},
    ],
  },
  {
    id: "arms-trafficking",
    title: "Arms & Munitions Trafficking",
    typology: "arms-trafficking",
    family: "PF",
    steps: [
      { title: "1. Goods classification", required: true, checks: [
        "Identify HS codes 9301-9307, 8710, 9013 (military arms, tanks, optics)",
        "Verify CWC / BTWC / AG / WA / NSG / MTCR control-list applicability",
        "Cross-check end-user statement against UN Programme of Action register",
      ]},
      { title: "2. End-use verification", required: true, checks: [
        "Obtain end-user certificate from competent state authority",
        "Validate end-use facility geolocation against open-source intelligence",
        "Screen broker, freight forwarder, and shipping line against UNSC arms-embargo lists",
      ]},
      { title: "3. Action", required: true, checks: [
        "Refuse transaction if end-use cannot be verified or routes via embargoed state",
        "File STR — proliferation financing & arms-trafficking typology",
        "Notify CBUAE and Federal Authority for Identity, Citizenship, Customs",
      ]},
    ],
  },
  {
    id: "securities-pump-dump",
    title: "Securities Fraud / Pump & Dump",
    typology: "securities-pump-dump",
    family: "Fraud",
    steps: [
      { title: "1. Promotional-activity detection", required: true, checks: [
        "Monitor social-media / Telegram / Discord channels for coordinated promotion",
        "Flag low-float micro-cap stocks with sudden volume spikes",
        "Cross-reference promoter wallets / accounts against insider lists",
      ]},
      { title: "2. Trading-pattern analysis", required: true, checks: [
        "Detect coordinated buy-orders followed by mass sell-off within 72h",
        "Identify wash trading between linked accounts",
        "Quantify unrealised vs. realised gains for primary beneficiaries",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File STR with SCA / FCA / SEC market-abuse references",
        "Suspend trading on flagged ticker pending investigation",
        "Notify exchange surveillance team",
      ]},
    ],
  },
  {
    id: "insider-trading",
    title: "Insider Trading Detection",
    typology: "insider-trading",
    family: "Fraud",
    steps: [
      { title: "1. Window monitoring", required: true, checks: [
        "Compare trades against material non-public information disclosure dates",
        "Flag option-buying spikes preceding M&A or earnings announcements",
        "Cross-reference traders with corporate-insider register",
      ]},
      { title: "2. Relationship mapping", required: true, checks: [
        "Identify family / known-associate accounts of corporate insiders",
        "Detect coordinated trading via shared IP / device fingerprints",
        "Map information-channel via communications metadata where lawful",
      ]},
      { title: "3. Disposition", required: true, checks: [
        "Suspend account pending market-abuse review",
        "File suspicious transaction report to securities regulator",
        "Preserve trade-blotter and chat evidence under legal hold",
      ]},
    ],
  },
  {
    id: "synthetic-id",
    title: "Synthetic Identity / KYC Bypass",
    typology: "synthetic-id",
    family: "Fraud",
    steps: [
      { title: "1. Identity validation", required: true, checks: [
        "Verify Emirates ID / passport against authoritative source (UAE PASS / ICA)",
        "Detect mismatched DOB, address, and SSN/national-ID combinations",
        "Apply biometric liveness check at onboarding",
      ]},
      { title: "2. Behaviour profiling", required: true, checks: [
        "Detect synthetic profiles: thin file + rapid credit utilisation",
        "Flag accounts with no geolocation history before onboarding",
        "Cross-check against fraud-bureau shared blacklists (HUNTER / SIRA)",
      ]},
      { title: "3. Disposition", required: true, checks: [
        "Block account and unwind any extended credit",
        "File STR for identity-fraud predicate offence",
        "Update fraud-prevention rules with new pattern",
      ]},
    ],
  },
  {
    id: "app-fraud",
    title: "Authorised Push Payment (APP) Fraud",
    typology: "app-fraud",
    family: "Fraud",
    steps: [
      { title: "1. Victim-side detection", required: true, checks: [
        "Flag first-time payee for amounts > AED 25,000",
        "Display Confirmation-of-Payee mismatch warnings prominently",
        "Insert friction (cooling-off pause) on high-risk payment patterns",
      ]},
      { title: "2. Beneficiary-side detection", required: true, checks: [
        "Detect mule accounts: rapid in-out, low-tenure, multiple inbound senders",
        "Cross-reference beneficiary against shared APP fraud database",
        "Identify same-device onboarding of mule accounts",
      ]},
      { title: "3. Recovery & reporting", required: true, checks: [
        "Initiate same-day funds recall via correspondent network",
        "File STR / suspicious payment report; consider customer reimbursement under PSR rules",
        "Update mule-account watchlist and feed industry sharing scheme",
      ]},
    ],
  },
  {
    id: "pig-butchering",
    title: "Romance / Pig-Butchering Investment Scam",
    typology: "pig-butchering",
    family: "Fraud",
    steps: [
      { title: "1. Early indicator screen", required: true, checks: [
        "Flag elderly / vulnerable customers initiating crypto purchases",
        "Detect new beneficiary patterns matching scam-cluster typologies",
        "Identify contact-pattern: customer mentions a 'mentor' or dating-app contact",
      ]},
      { title: "2. Intervention", required: true, checks: [
        "Trigger branch-staff intervention script and customer-protection call",
        "Hold transaction pending vulnerability check",
        "Refer customer to consumer-protection helpline",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File STR citing FBI IC3 + FATF crypto-scam typology",
        "Trace destination wallet and notify exchange / crypto-MSB",
        "Submit to industry shared scam-wallet database",
      ]},
    ],
  },
  {
    id: "boiler-room",
    title: "Boiler-Room Investment Scam",
    typology: "boiler-room",
    family: "Fraud",
    steps: [
      { title: "1. Solicitor verification", required: true, checks: [
        "Verify solicitor's licensing with SCA / FCA / SEC / FSCA",
        "Cross-check entity name against IOSCO investor-alert portal",
        "Detect cold-call / WhatsApp solicitation patterns reported by victim",
      ]},
      { title: "2. Investment-substance check", required: true, checks: [
        "Validate share-issuer existence and transfer-agent record",
        "Verify custody arrangements and segregation of investor funds",
        "Confirm secondary-market liquidity for promoted instruments",
      ]},
      { title: "3. Action", required: true, checks: [
        "Block transfers to flagged scheme accounts",
        "File STR with regulator's investor-protection unit",
        "Publish customer warning on bank's fraud-awareness page",
      ]},
    ],
  },
  {
    id: "bec-invoice",
    title: "Business Email Compromise / Invoice Fraud",
    typology: "bec-invoice",
    family: "Fraud",
    steps: [
      { title: "1. Payment-instruction validation", required: true, checks: [
        "Verify last-minute beneficiary or IBAN change via call-back to known number",
        "Detect lookalike domain in vendor email (e.g. corp.com vs corp-corp.com)",
        "Confirm invoice authenticity via vendor portal, not reply-email chain",
      ]},
      { title: "2. Beneficiary risk", required: true, checks: [
        "Flag new beneficiary for high-value first payment",
        "Detect mule-network indicators on receiving account",
        "Cross-reference IBAN with industry BEC fraud database",
      ]},
      { title: "3. Recovery & report", required: true, checks: [
        "Initiate Financial Fraud Kill-Chain (FFKC) recall via correspondent bank",
        "File STR + report to FBI IC3 / Action Fraud / national CERT",
        "Notify vendor of compromised email infrastructure",
      ]},
    ],
  },
  {
    id: "loan-fraud",
    title: "Loan & Mortgage Application Fraud",
    typology: "loan-fraud",
    family: "Fraud",
    steps: [
      { title: "1. Document validation", required: true, checks: [
        "Verify pay slips / tax returns against employer / authority APIs",
        "Detect template-based forged bank statements (font, alignment, balance arithmetic)",
        "Cross-check property valuation against authoritative comparable database",
      ]},
      { title: "2. Income verification", required: true, checks: [
        "Validate salary credit pattern against declared employment",
        "Confirm length of service and end-of-service gratuity entitlement",
        "Identify first-party loan-stacking across multiple lenders",
      ]},
      { title: "3. Disposition", required: true, checks: [
        "Decline application and report to credit-bureau / Al Etihad CB",
        "File STR if synthetic identity or organised ring suspected",
        "Recover any disbursed funds via legal process",
      ]},
    ],
  },
  {
    id: "swift-fin-compromise",
    title: "SWIFT / FIN Network Compromise",
    typology: "swift-fin-compromise",
    family: "Cyber",
    steps: [
      { title: "1. Anomaly detection", required: true, checks: [
        "Apply SWIFT CSP daily-activity reconciliation report",
        "Detect MT103 / MT202 issued outside business-hours window",
        "Flag payments to high-risk corridors not seen in 6 months",
      ]},
      { title: "2. Containment", required: true, checks: [
        "Activate SWIFT incident-response runbook (CSP control 2.1)",
        "Disconnect compromised PKI tokens and rotate certificates",
        "Halt outbound message queue pending forensic review",
      ]},
      { title: "3. Recovery", required: true, checks: [
        "Initiate funds recall via SWIFT Stop & Recall (gpi)",
        "Notify CBUAE, SWIFT CSO, and correspondent counterparties",
        "Preserve logs and engage approved forensic provider",
      ]},
    ],
  },
  {
    id: "atm-cashout",
    title: "ATM Cash-Out Attack",
    typology: "atm-cashout",
    family: "Fraud",
    steps: [
      { title: "1. Detection", required: true, checks: [
        "Flag elevated international ATM-withdrawal velocity post card-issuance batch",
        "Detect synchronised withdrawals across multiple geographies",
        "Identify exceeded daily-limit overrides authorised in card-management system",
      ]},
      { title: "2. Containment", required: true, checks: [
        "Apply emergency velocity / geo-block on affected BIN",
        "Lock card-management host pending investigation",
        "Notify card schemes (Visa / Mastercard) for global block",
      ]},
      { title: "3. Investigation", required: true, checks: [
        "Preserve switch logs and ATM CCTV evidence",
        "Coordinate with national CERT / CBUAE cyber unit",
        "Reconcile losses and pursue chargebacks via scheme dispute process",
      ]},
    ],
  },
  {
    id: "card-skimming",
    title: "POS / Card Skimming Ring",
    typology: "card-skimming",
    family: "Fraud",
    steps: [
      { title: "1. Common-point detection", required: true, checks: [
        "Run Common Point of Purchase (CPP) analysis on dispute clusters",
        "Identify merchant terminal IDs with elevated fraud exposure",
        "Inspect physical terminals for skimmer overlays / pinhole cameras",
      ]},
      { title: "2. Mitigation", required: true, checks: [
        "Reissue cards exposed at the CPP merchant",
        "Disable mag-stripe fallback on issued BIN range",
        "Engage acquirer to onboard merchant to PCI-DSS remediation",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File STR if proceeds laundered through related accounts",
        "Notify card schemes via CAMS-style compromised-account file",
        "Coordinate with police cyber-crime unit",
      ]},
    ],
  },
  {
    id: "pep-stepdown",
    title: "PEP Step-Down (Out-of-Office) Refresh",
    typology: "pep-stepdown",
    family: "PEP",
    steps: [
      { title: "1. Status verification", required: true, checks: [
        "Confirm PEP has left prominent public function ≥ 12 months (or longer per local rule)",
        "Document continuing influence test: residual power, network, immunity",
        "Reassess RCA family-and-associate continuing exposure",
      ]},
      { title: "2. Risk reassessment", required: true, checks: [
        "Re-run adverse-media sweep covering post-tenure period",
        "Verify source-of-wealth narrative remains consistent",
        "Compare current activity to ongoing-monitoring baseline",
      ]},
      { title: "3. Re-classification", required: true, checks: [
        "Step-down to standard CDD if no continuing-influence risk",
        "Maintain EDD if residual influence or recent adverse media",
        "Document MLRO sign-off on classification change",
      ]},
    ],
  },
  {
    id: "foreign-pep-onboard",
    title: "Foreign PEP Onboarding",
    typology: "foreign-pep-onboard",
    family: "PEP",
    steps: [
      { title: "1. Identification", required: true, checks: [
        "Run name screen against commercial PEP database + open-source",
        "Confirm jurisdiction of public function and FATF / Basel risk score",
        "Identify RCA: spouse, parents, children, business partners",
      ]},
      { title: "2. Senior-management approval", required: true, checks: [
        "Secure Board-level / Senior-Management approval per FATF R.12",
        "Document source-of-wealth and source-of-funds with corroborating evidence",
        "Establish enhanced ongoing-monitoring frequency (max quarterly)",
      ]},
      { title: "3. Documentation", required: true, checks: [
        "Record approval rationale and risk-acceptance memo",
        "Set risk-rating to High (PEP marker) and link RCA records",
        "Diary annual EDD refresh + adverse-media sweep",
      ]},
    ],
  },
  {
    id: "domestic-pep-onboard",
    title: "Domestic PEP Onboarding",
    typology: "domestic-pep-onboard",
    family: "PEP",
    steps: [
      { title: "1. Definition check", required: true, checks: [
        "Confirm UAE Cabinet Decision 10/2019 + 74/2020 PEP scope (federal / emirate / state-owned)",
        "Apply risk-based decision: not all domestic PEPs require EDD",
        "Document risk drivers triggering EDD, if any",
      ]},
      { title: "2. EDD when triggered", required: true, checks: [
        "Source-of-wealth attestation + corroborating evidence",
        "Senior-management approval if risk above threshold",
        "Align ongoing monitoring with risk classification",
      ]},
      { title: "3. Recordkeeping", required: true, checks: [
        "Retain risk-rating rationale 5 years post-relationship",
        "Diary periodic refresh aligned to public-function tenure",
        "Update on resignation / retirement / step-down events",
      ]},
    ],
  },
  {
    id: "rca-family",
    title: "Relatives & Close Associates (RCA)",
    typology: "rca-family",
    family: "PEP",
    steps: [
      { title: "1. Relationship discovery", required: true, checks: [
        "Map first-degree family: spouse, parents, children, siblings",
        "Identify business associates: directorships, shared shareholdings, joint ventures",
        "Cross-reference public records, leaks, and registry filings",
      ]},
      { title: "2. Risk inheritance", required: true, checks: [
        "Apply EDD inherited from connected PEP",
        "Validate independent source-of-wealth where claimed",
        "Document any economic/legal separation from PEP exposure",
      ]},
      { title: "3. Monitoring", required: true, checks: [
        "Annual RCA refresh + adverse-media sweep",
        "Re-evaluate on PEP step-down event",
        "Maintain link in customer graph for sanctions cascade detection",
      ]},
    ],
  },
  {
    id: "celebrity-hnwi",
    title: "Celebrity / HNWI Onboarding",
    typology: "celebrity-hnwi",
    family: "CDD",
    steps: [
      { title: "1. Identity & wealth verification", required: true, checks: [
        "Verify identity using government-issued ID + biometric",
        "Document source-of-wealth: career earnings, royalties, investments, business sale",
        "Confirm tax-residency and CRS reporting position",
      ]},
      { title: "2. Adverse-media diligence", required: true, checks: [
        "Multilingual adverse-media sweep including tabloid and litigation media",
        "Identify reputational events: scandal, lawsuit, sanction, regulatory action",
        "Differentiate allegation vs. finding per FATF guidance",
      ]},
      { title: "3. Risk classification", required: true, checks: [
        "Apply HNWI / private-banking EDD frame",
        "Set monitoring thresholds aligned with declared activity profile",
        "Document risk-acceptance and senior-management approval",
      ]},
    ],
  },
  {
    id: "kleptocracy",
    title: "Kleptocracy / Grand-Corruption Trace",
    typology: "kleptocracy",
    family: "ABC",
    steps: [
      { title: "1. Origin tracing", required: true, checks: [
        "Trace funds to state procurement / extractives / privatisation events",
        "Identify shell layers in offshore secrecy jurisdictions",
        "Match to leaks and StAR Initiative case archives",
      ]},
      { title: "2. UBO disambiguation", required: true, checks: [
        "Verify ultimate beneficial owner identity beyond nominee directors",
        "Cross-reference with OCCRP / ICIJ datasets",
        "Document continuing influence of source PEP / state actor",
      ]},
      { title: "3. Action", required: true, checks: [
        "File STR with proceeds-of-corruption typology and StAR references",
        "Refuse new business absent compelling integrity case",
        "Coordinate with FIU and asset-recovery channels",
      ]},
    ],
  },
  {
    id: "state-embezzlement",
    title: "Embezzlement of State Funds",
    typology: "state-embezzlement",
    family: "ABC",
    steps: [
      { title: "1. Procurement diligence", required: true, checks: [
        "Validate state-tender award document and pricing benchmarks",
        "Verify counterparty's state-owned-enterprise status and procurement role",
        "Detect kickback indicators: success fees, advisory invoices, intermediary commissions",
      ]},
      { title: "2. Funds-flow tracing", required: true, checks: [
        "Trace contract payment chain through correspondent network",
        "Identify offshore intermediaries inserted for fee extraction",
        "Reconcile cash-flow timing against contract milestones",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File STR — public-corruption / embezzlement predicate offence",
        "Coordinate with home-state FIU under Egmont channel",
        "Preserve evidence under legal hold pending mutual-legal-assistance request",
      ]},
    ],
  },
  {
    id: "sanctions-shell",
    title: "Sanctions Evasion via Shell Network",
    typology: "sanctions-shell",
    family: "Sanctions",
    steps: [
      { title: "1. Network discovery", required: true, checks: [
        "Map shell layers between SDN and counterparty using corporate-registry data",
        "Identify common directors / shareholders / addresses across entities",
        "Cross-reference against OFAC 50%-Rule guidance and UK ownership rules",
      ]},
      { title: "2. Substance test", required: true, checks: [
        "Verify physical presence: office, employees, operational footprint",
        "Detect fronting indicators: revenue-only model, single-customer dependency",
        "Validate funding-source consistency with declared business",
      ]},
      { title: "3. Decision", required: true, checks: [
        "Block transactions and report to OFAC / OFSI / EOCN per regime",
        "Exit relationship if shell-network determination confirmed",
        "Update sanctions-screening rules with discovered identifiers",
      ]},
    ],
  },
  {
    id: "russia-sanctions",
    title: "Russia / Belarus Sanctions Pack",
    typology: "russia-sanctions",
    family: "Sanctions",
    steps: [
      { title: "1. Designation screen", required: true, checks: [
        "Screen against EU Council Reg. 269/2014 + 833/2014, OFAC SDN/SSI, UK OFSI Russia regime",
        "Apply oligarch ownership cascade ≥ 50% direct + indirect aggregation",
        "Cross-check with UK / EU price-cap on seaborne crude / petroleum products",
      ]},
      { title: "2. Sectoral controls", required: true, checks: [
        "Identify dual-use, luxury-goods, oil-services, finance-sector restrictions",
        "Verify SWIFT-sanctioned banks (Sberbank, VTB, etc.) blocked from messaging",
        "Validate aviation / maritime restrictions on UAE-flagged carriers",
      ]},
      { title: "3. Action", required: true, checks: [
        "Reject prohibited transactions; file blocking / rejection report",
        "Attempt asset-freeze where required by jurisdiction",
        "Notify regulator under UAE Cabinet Decision 74/2020 implementation",
      ]},
    ],
  },
  {
    id: "iran-sanctions",
    title: "Iran TFS & JCPOA Carve-Outs",
    typology: "iran-sanctions",
    family: "Sanctions",
    steps: [
      { title: "1. Regime applicability", required: true, checks: [
        "Determine applicable regime: UNSC, EU Council, OFAC primary + secondary, UK ITF",
        "Identify any humanitarian / JCPOA carve-outs (medical, food, agricultural)",
        "Check IRISL, NIOC, NITC and IRGC affiliations",
      ]},
      { title: "2. End-use diligence", required: true, checks: [
        "Verify civilian end-use and non-proliferation commitment",
        "Screen all parties against UNSCR 2231 lists",
        "Confirm currency and routing avoid US-secondary-sanctions touchpoints",
      ]},
      { title: "3. Decision", required: true, checks: [
        "Refuse transaction unless general-licence / carve-out unambiguously applies",
        "File rejection / blocking report and notify regulator",
        "Document risk-acceptance memo with senior-management approval",
      ]},
    ],
  },
  {
    id: "dprk-sanctions",
    title: "DPRK Sanctions",
    typology: "dprk-sanctions",
    family: "Sanctions",
    steps: [
      { title: "1. Network screen", required: true, checks: [
        "Screen against UNSCR 1718, 2270, 2321, 2371, 2375, 2397 designation lists",
        "Detect DPRK-linked maritime indicators: STS transfers, AIS gaps, dark-fleet vessels",
        "Identify trade-based front companies in third countries",
      ]},
      { title: "2. Trade scrutiny", required: true, checks: [
        "Verify HS-code restrictions: coal, iron, seafood, textiles, refined petroleum cap",
        "Cross-check vessels against UN Panel of Experts annual report",
        "Detect cyber-theft proceeds linked to Lazarus Group typologies",
      ]},
      { title: "3. Action", required: true, checks: [
        "Block all listed DPRK-nexus transactions",
        "File STR + UNSC sanctions-violation report to MOFA / regulator",
        "Notify correspondent bank and update screening with new identifiers",
      ]},
    ],
  },
  {
    id: "dual-use-export",
    title: "Dual-Use & Strategic Goods Export",
    typology: "dual-use-export",
    family: "PF",
    steps: [
      { title: "1. Goods classification", required: true, checks: [
        "Classify against EU dual-use Annex I / WA / NSG / AG / MTCR control lists",
        "Identify catch-all items capable of military or WMD end-use",
        "Verify HS-to-ECN mapping consistency",
      ]},
      { title: "2. End-user / end-use", required: true, checks: [
        "Obtain end-user certificate authenticated by destination authority",
        "Validate end-use facility via open-source imagery / commercial verification",
        "Screen consignees and intermediaries against UNSCR 1540 lists",
      ]},
      { title: "3. Licensing", required: true, checks: [
        "Confirm export licence issued by national export-control authority",
        "Refuse transaction if licence absent or end-use red flags present",
        "File STR — proliferation financing typology when indicators material",
      ]},
    ],
  },
  {
    id: "end-user-cert",
    title: "End-User & End-Use Certification",
    typology: "end-user-cert",
    family: "PF",
    steps: [
      { title: "1. Document authentication", required: true, checks: [
        "Verify EUC issuing authority signature against authoritative reference",
        "Detect template tampering: font mismatch, altered seal, inconsistent reference number",
        "Cross-check stated end-user against beneficial-ownership registry",
      ]},
      { title: "2. Substance verification", required: true, checks: [
        "Validate end-user's operational footprint and prior import history",
        "Check declared end-use against installed capacity and production capability",
        "Identify diversion risk: re-export hubs, free-zone transit",
      ]},
      { title: "3. Decision", required: true, checks: [
        "Refuse trade if EUC fails authentication or substance test",
        "Notify export-control authority and competent licensing body",
        "Retain certification and screening evidence for 5 years",
      ]},
    ],
  },
  {
    id: "shadow-fleet",
    title: "Maritime Shadow Fleet / AIS Spoofing",
    typology: "shadow-fleet",
    family: "Sanctions",
    steps: [
      { title: "1. Vessel intelligence", required: true, checks: [
        "Cross-check IMO number against OFAC / EU / UK designations",
        "Detect AIS gaps > 24h, GPS spoofing, identity-swapping with sister-vessel",
        "Verify P&I insurance and class society against approved-list",
      ]},
      { title: "2. Trade documentation", required: true, checks: [
        "Validate B/L origin, port of loading, and cargo manifest",
        "Detect ship-to-ship transfers in dark-fleet hotspots (e.g. Lakonikos Gulf)",
        "Confirm price-cap attestation for sanctioned crude / refined products",
      ]},
      { title: "3. Action", required: true, checks: [
        "Refuse trade-finance where shadow-fleet indicators present",
        "File STR — sanctions-evasion + maritime-typology references",
        "Notify regulator and circulate vessel identifiers to correspondent network",
      ]},
    ],
  },
  {
    id: "aviation-sanctions",
    title: "Aviation Sanctions",
    typology: "aviation-sanctions",
    family: "Sanctions",
    steps: [
      { title: "1. Asset screening", required: true, checks: [
        "Screen aircraft tail-number / MSN / operator against US BIS Denied Persons + UK ITF",
        "Detect oligarch beneficial-ownership of registered aircraft",
        "Cross-check leasing chain and special-purpose vehicles",
      ]},
      { title: "2. Operational diligence", required: true, checks: [
        "Verify destination airports against sanctioned-state lists",
        "Detect transponder-off legs and ICAO 24-bit address swap",
        "Validate fuelling / MRO providers' sanctions status",
      ]},
      { title: "3. Decision", required: true, checks: [
        "Refuse insurance / financing / MRO services where designation triggers",
        "File STR / sanctions-violation report",
        "Notify GCAA and home-state aviation authority",
      ]},
    ],
  },
  {
    id: "free-zone-risk",
    title: "Free-Zone / Free-Port Customer Risk",
    typology: "free-zone-risk",
    family: "ML",
    steps: [
      { title: "1. Free-zone profile", required: true, checks: [
        "Classify the free-zone (financial, commercial, logistics, media) and applicable supervisor",
        "Identify zone-level transparency: licence registry, UBO disclosure, audit requirements",
        "Cross-check against FATF concerns on free-trade zones",
      ]},
      { title: "2. Activity scrutiny", required: true, checks: [
        "Verify office substance and employee headcount vs. declared revenue",
        "Detect re-invoicing / round-trip trade patterns through the zone",
        "Reconcile customs-data with banking-flow data",
      ]},
      { title: "3. EDD application", required: true, checks: [
        "Apply EDD; require commercial-substance evidence for high-risk lines",
        "Set ongoing monitoring frequency aligned to zone-risk score",
        "Escalate sanctions-evasion indicators to FIU / CBUAE",
      ]},
    ],
  },
  {
    id: "diamond-kimberley",
    title: "Diamond Trade & Kimberley Process",
    typology: "diamond-kimberley",
    family: "DPMS",
    steps: [
      { title: "1. KP certificate validation", required: true, checks: [
        "Verify Kimberley Process certificate authenticity via KP focal point",
        "Cross-check serial number against KP Working Group of Statistics database",
        "Confirm UAE Kimberley Process Office issuance for re-exports",
      ]},
      { title: "2. Counterparty diligence", required: true, checks: [
        "Screen miner, polisher, broker against EOCN / OFAC / EU lists",
        "Verify RJC / SCS-007 / Kimberley membership where claimed",
        "Document chain-of-custody from mine to point-of-sale",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File EOCN annual return covering cash transactions ≥ AED 55k",
        "Maintain DPMS books and KP certificates ≥ 5 years",
        "Notify supervisor on chain-of-custody breaks or conflict-zone exposure",
      ]},
    ],
  },
  {
    id: "coloured-gems",
    title: "Coloured Gemstones",
    typology: "coloured-gems",
    family: "DPMS",
    steps: [
      { title: "1. Origin documentation", required: true, checks: [
        "Verify origin certificate from recognised gem-lab (GIA / SSEF / Gübelin / GRS)",
        "Cross-check stated origin against geological feasibility",
        "Detect undisclosed treatments (heat, beryllium diffusion, oil filling)",
      ]},
      { title: "2. Counterparty risk", required: true, checks: [
        "Screen mine, dealer and broker against sanctions / EOCN lists",
        "Apply CAHRA EDD where origin is high-risk (e.g. Myanmar ruby, Mozambique ruby)",
        "Validate rough-to-polished value chain consistency",
      ]},
      { title: "3. Recordkeeping", required: true, checks: [
        "Retain origin reports, CITES (where applicable), and KYC for 5 years",
        "Apply OECD DDG Annex II reporting to high-risk-mineral chains",
        "File EOCN annual return for qualifying cash transactions",
      ]},
    ],
  },
  {
    id: "scrap-recycled",
    title: "Scrap & Recycled Metals",
    typology: "scrap-recycled",
    family: "DPMS",
    steps: [
      { title: "1. Source verification", required: true, checks: [
        "Document supplier scrap-yard licensing and environmental permits",
        "Detect indicators of stolen metal: telecoms cable, catalytic converters, cemetery plaques",
        "Verify ICOMIA / industry recycler-registration where applicable",
      ]},
      { title: "2. Volume reconciliation", required: true, checks: [
        "Reconcile incoming scrap volume against supplier capacity",
        "Cross-check assays for impurities and isotopic anomalies",
        "Flag rapid-scaling suppliers with thin operational history",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File STR if proceeds-of-theft / smuggling indicators material",
        "Notify environmental authority on hazardous-waste indicators",
        "Apply OECD DDG Annex II for refined-metal due diligence",
      ]},
    ],
  },
  {
    id: "petroleum-trade",
    title: "Refined Petroleum Trade",
    typology: "petroleum-trade",
    family: "TF",
    steps: [
      { title: "1. Cargo provenance", required: true, checks: [
        "Verify load-port and quality-quantity certificate against industry inspectors (SGS, Intertek)",
        "Cross-check vessel against UNSC / OFAC / EU sanctions and dark-fleet indicators",
        "Validate price-cap attestation where applicable",
      ]},
      { title: "2. Counterparty diligence", required: true, checks: [
        "Screen NOC / IOC / trader / off-taker against sanctions and PEP lists",
        "Document UBO and intermediate sale chain",
        "Identify any sanctioned-state nexus via flag, owner, manager, or charterer",
      ]},
      { title: "3. Trade-finance controls", required: true, checks: [
        "Refuse financing where price-cap, dark-fleet, or sanctions risk crystallises",
        "Apply maritime-typology screening (STS transfers, AIS gaps)",
        "File STR with sanctions-evasion + petroleum-trade references",
      ]},
    ],
  },
  {
    id: "base-metals",
    title: "Base Metals (Steel/Aluminium/Copper)",
    typology: "base-metals",
    family: "TF",
    steps: [
      { title: "1. Origin & tariff check", required: true, checks: [
        "Validate certificate-of-origin against rules-of-origin and sanctions overlay",
        "Detect transshipment patterns evading anti-dumping or sanction tariffs",
        "Cross-check producer against US 232 / EU CBAM / UK steel-sanctions lists",
      ]},
      { title: "2. Quality verification", required: true, checks: [
        "Reconcile mill-test certificates with on-site inspection",
        "Validate spec sheet vs. shipped grade",
        "Detect rebrand-and-relabel typologies",
      ]},
      { title: "3. Action", required: true, checks: [
        "Refuse instruments where sanctions-evasion indicators present",
        "Notify customs and trade-defence authority on origin fraud",
        "File STR — TBML / sanctions-evasion typology",
      ]},
    ],
  },
  {
    id: "agri-commodities",
    title: "Agricultural Commodity Trade",
    typology: "agri-commodities",
    family: "TF",
    steps: [
      { title: "1. Origin & quality", required: true, checks: [
        "Verify phytosanitary certificate and CITES (where applicable)",
        "Validate quality / quantity inspection by approved surveyor",
        "Detect substitution and adulteration patterns (origin laundering)",
      ]},
      { title: "2. Counterparty risk", required: true, checks: [
        "Screen farmer-cooperative / trader / off-taker against sanctions and human-rights lists",
        "Apply forced-labour due diligence (UFLPA / CSDDD)",
        "Document UBO and cross-border flow",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "Refuse instrument if forced-labour or sanctions concerns crystallise",
        "Notify supervisor and labour authority on egregious findings",
        "File STR with TBML / human-rights-typology citations",
      ]},
    ],
  },
  {
    id: "timber-flegt",
    title: "Timber & Forestry (FLEGT/EUTR)",
    typology: "timber-flegt",
    family: "EOCN",
    steps: [
      { title: "1. Legality verification", required: true, checks: [
        "Verify FLEGT licence or equivalent legality assurance system",
        "Cross-check species against CITES Appendix and IUCN Red List",
        "Validate harvest permits and concession boundaries",
      ]},
      { title: "2. Supply-chain mapping", required: true, checks: [
        "Trace timber from concession to mill to exporter",
        "Detect mixed-species shipments masking restricted species",
        "Apply EU Deforestation Regulation due-diligence statement",
      ]},
      { title: "3. Action", required: true, checks: [
        "Refuse trade-finance where legality cannot be evidenced",
        "Notify forestry authority and CITES management authority",
        "File STR — environmental crime / illegal-logging typology",
      ]},
    ],
  },
  {
    id: "iuu-fishing",
    title: "IUU Fishing & Fisheries Trade",
    typology: "iuu-fishing",
    family: "EOCN",
    steps: [
      { title: "1. Vessel & catch validation", required: true, checks: [
        "Cross-reference vessel against RFMO IUU lists (e.g. ICCAT, IOTC)",
        "Verify catch certificate (EU IUU Reg.) and port-state-measures attestation",
        "Detect AIS gaps and STS transfers in fishery hotspots",
      ]},
      { title: "2. Trade-flow check", required: true, checks: [
        "Reconcile landed-volume reports with export documentation",
        "Validate cold-chain logistics and processor identity",
        "Screen counterparties against forced-labour-at-sea indicators",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "Refuse instruments where IUU indicators material",
        "Notify fisheries authority and INTERPOL Project Scale",
        "File STR — environmental-crime + forced-labour typology",
      ]},
    ],
  },
  {
    id: "crowdfunding",
    title: "Crowdfunding & P2P Lending",
    typology: "crowdfunding",
    family: "VASP",
    steps: [
      { title: "1. Platform diligence", required: true, checks: [
        "Verify platform licensing with SCA / FCA / DFSA / FSCA",
        "Validate investor-protection and segregation of investor funds",
        "Confirm wind-down plan and custody arrangements",
      ]},
      { title: "2. Project / borrower screen", required: true, checks: [
        "Apply CDD / EDD on project owner and beneficiaries",
        "Screen against sanctions, PEP, and adverse-media lists",
        "Validate use-of-proceeds and milestone reporting",
      ]},
      { title: "3. Ongoing monitoring", required: true, checks: [
        "Monitor secondary-market activity for layering and price-manipulation",
        "Detect investor-rounding patterns suggestive of structuring",
        "File STR on suspicious activity",
      ]},
    ],
  },
  {
    id: "stablecoin-issuance",
    title: "Stablecoin Issuance & Reserves",
    typology: "stablecoin-issuance",
    family: "VASP",
    steps: [
      { title: "1. Reserve attestation", required: true, checks: [
        "Verify monthly reserve attestation by independent audit firm",
        "Cross-check on-chain supply against attested reserve composition",
        "Validate asset-mix limits per CBUAE Payment Token Services Reg.",
      ]},
      { title: "2. Redemption mechanics", required: true, checks: [
        "Test redemption SLA and KYC at on/off ramps",
        "Detect mint/burn patterns inconsistent with declared use cases",
        "Validate freeze-list / blacklist controls on issuer-managed contracts",
      ]},
      { title: "3. Compliance", required: true, checks: [
        "Confirm FATF Travel-Rule message exchange with counterparty VASPs",
        "File STR on suspicious mint/burn cycles",
        "Notify regulator on reserve-shortfall events ≥ disclosure threshold",
      ]},
    ],
  },
  {
    id: "defi-protocol",
    title: "DeFi Protocol Exposure",
    typology: "defi-protocol",
    family: "VASP",
    steps: [
      { title: "1. Protocol risk assessment", required: true, checks: [
        "Analyse smart-contract audits, governance structure, and admin keys",
        "Identify TVL composition, oracle reliance, and bridge exposure",
        "Map governance-token concentration and rug-pull indicators",
      ]},
      { title: "2. Counterparty exposure", required: true, checks: [
        "Run wallet attribution against TRM / Chainalysis / Elliptic clusters",
        "Screen connected addresses for OFAC / sanctions exposure",
        "Detect Tornado Cash / mixer ingress within configurable hop-depth",
      ]},
      { title: "3. Action", required: true, checks: [
        "Apply protocol-level deny-list for high-risk pools",
        "File STR for sanctioned-mixer or stolen-fund exposure",
        "Document risk-acceptance for whitelisted protocols",
      ]},
    ],
  },
  {
    id: "privacy-coin",
    title: "Privacy-Coin Exposure (XMR/ZEC)",
    typology: "privacy-coin",
    family: "VASP",
    steps: [
      { title: "1. Detection", required: true, checks: [
        "Identify deposits / withdrawals in XMR, ZEC, Dash (PrivateSend), Beam, Grin",
        "Detect indirect exposure via swap protocols (FixedFloat, ChangeNow)",
        "Cross-check exchange-policy permissibility for these assets",
      ]},
      { title: "2. Source-of-funds", required: true, checks: [
        "Require enhanced source-of-funds for privacy-coin deposits",
        "Document business rationale and intended use",
        "Apply transaction-monitoring thresholds tighter than transparent-chain assets",
      ]},
      { title: "3. Decision", required: true, checks: [
        "Reject deposit where SoF cannot be evidenced",
        "Exit relationship for repeat unexplained privacy-coin activity",
        "File STR with privacy-coin / VASP-misuse typology",
      ]},
    ],
  },
  {
    id: "mixer-tumbler",
    title: "Mixer / Tumbler Exposure",
    typology: "mixer-tumbler",
    family: "VASP",
    steps: [
      { title: "1. Address analysis", required: true, checks: [
        "Check inbound funds against mixer clusters (Tornado Cash, Sinbad, Wasabi CoinJoin)",
        "Apply hop-depth ≥ 3 traversal where direct-mixer exposure detected",
        "Validate post-OFAC-designation withdrawals via licensed tooling",
      ]},
      { title: "2. Customer accountability", required: true, checks: [
        "Request customer rationale for mixer use and SoF evidence",
        "Cross-reference against ransomware / hack proceeds typologies",
        "Apply EDD and senior-management approval to retain relationship",
      ]},
      { title: "3. Action", required: true, checks: [
        "Block transactions linked to OFAC-designated mixers",
        "File STR — sanctions / cyber-proceeds typology",
        "Update transaction-monitoring rules with new cluster fingerprints",
      ]},
    ],
  },
  {
    id: "nft-wash-trading",
    title: "NFT Wash Trading",
    typology: "nft-wash-trading",
    family: "VASP",
    steps: [
      { title: "1. On-chain pattern", required: true, checks: [
        "Detect circular trades between linked wallets boosting floor-price",
        "Identify same-funded wallets buying / selling within short windows",
        "Reconcile gas-fee economics: wash trades are net-loss after fees",
      ]},
      { title: "2. Marketplace data", required: true, checks: [
        "Cross-reference marketplace KYC where available",
        "Validate creator royalties and platform-fee economics",
        "Identify wallets aggregating volume to game leaderboards or token incentives",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "Restrict marketplace access for confirmed wash-traders",
        "File STR — market-manipulation / VASP-misuse typology",
        "Notify regulator under SCA virtual-asset rules",
      ]},
    ],
  },
  {
    id: "crypto-exchange-onboard",
    title: "Crypto Exchange Counterparty Onboarding",
    typology: "crypto-exchange-onboard",
    family: "VASP",
    steps: [
      { title: "1. Licensing & governance", required: true, checks: [
        "Verify VASP licensing in operating and counterparty jurisdictions",
        "Validate FATF Travel-Rule capability (TRP / Sumsub / Notabene)",
        "Document governance, custody, and proof-of-reserves attestations",
      ]},
      { title: "2. Risk profile", required: true, checks: [
        "Assess listed-asset universe, privacy-coin and mixer policy",
        "Review wallet-screening provider and cluster-risk thresholds",
        "Verify sanctions-screening, IP-block, and politically-exposed exclusions",
      ]},
      { title: "3. Approval", required: true, checks: [
        "Senior-management sign-off on counterparty risk",
        "Establish ongoing monitoring with quarterly attestation refresh",
        "Onboard kill-switch playbook in case of regulatory enforcement",
      ]},
    ],
  },
  {
    id: "travel-rule",
    title: "FATF Travel Rule (R.16)",
    typology: "travel-rule",
    family: "VASP",
    steps: [
      { title: "1. Threshold check", required: true, checks: [
        "Apply USD/EUR 1,000 threshold per FATF R.16 INR.16 (lower in some jurisdictions)",
        "Identify originator name, account/wallet ID, and physical / national-ID information",
        "Identify beneficiary name and account/wallet ID",
      ]},
      { title: "2. Counterparty VASP diligence", required: true, checks: [
        "Validate counterparty VASP licensing and TR-protocol compatibility",
        "Apply sunrise-issue handling: rules differ across jurisdictions",
        "Maintain decline / hold policy for non-compliant counterparties",
      ]},
      { title: "3. Recordkeeping", required: true, checks: [
        "Retain TR data for 5 years post-transaction",
        "Reconcile TR messages against on-chain settlement",
        "File STR where counterparty refuses TR or response inconsistent",
      ]},
    ],
  },
  {
    id: "ubo-trust",
    title: "UBO Verification — Trust",
    typology: "ubo-trust",
    family: "UBO",
    steps: [
      { title: "1. Trust documentation", required: true, checks: [
        "Obtain trust deed, letter of wishes, and any side-letters",
        "Identify settlor, trustee, protector, beneficiaries (named and class)",
        "Verify governing law and trustee licensing",
      ]},
      { title: "2. Control & benefit analysis", required: true, checks: [
        "Identify natural persons exercising effective control",
        "Determine economic-benefit recipients beyond named beneficiaries",
        "Reassess on letter-of-wishes change or trustee replacement",
      ]},
      { title: "3. Recordkeeping", required: true, checks: [
        "File UBO record with relevant registry (UBO registry / FATCA / CRS)",
        "Retain trust documentation 5 years post-relationship",
        "Diary annual UBO refresh aligned with trust accounts",
      ]},
    ],
  },
  {
    id: "ubo-foundation",
    title: "UBO Verification — Foundation",
    typology: "ubo-foundation",
    family: "UBO",
    steps: [
      { title: "1. Constitutional documents", required: true, checks: [
        "Obtain charter, by-laws, council-resolution evidencing control",
        "Identify founder, council members, and beneficiaries",
        "Verify foundation registration and supervisory authority",
      ]},
      { title: "2. Control mapping", required: true, checks: [
        "Determine natural-person control: founder, council majority, protector",
        "Document benefit allocation rules and discretionary scope",
        "Cross-check against PEP / sanctions for any controlling person",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "Register UBO with foundation supervisor and tax authority",
        "Diary refresh on council changes",
        "Retain documentation 5 years post-relationship",
      ]},
    ],
  },
  {
    id: "ubo-cooperative",
    title: "UBO Verification — Cooperative/Mutual",
    typology: "ubo-cooperative",
    family: "UBO",
    steps: [
      { title: "1. Membership analysis", required: true, checks: [
        "Document member-categories, voting structure, and equity allocation",
        "Identify any members holding control thresholds (≥ 25%)",
        "Verify board composition and management appointments",
      ]},
      { title: "2. Control test", required: true, checks: [
        "Determine senior-management individuals where no controlling member",
        "Apply 'control through other means' test per EU AMLD",
        "Document cooperative-specific governance assessment",
      ]},
      { title: "3. Recordkeeping", required: true, checks: [
        "File UBO with relevant registry; retain evidence 5 years",
        "Diary refresh on board changes",
        "Re-test on capital-restructure events",
      ]},
    ],
  },
  {
    id: "sar-quality",
    title: "SAR/STR Quality Assurance Review",
    typology: "sar-quality",
    family: "FIU",
    steps: [
      { title: "1. Pre-filing review", required: true, checks: [
        "Validate completeness: subject, activity, indicators, evidence references",
        "Confirm narrative is fact-based, dated, and free of conjecture / legal conclusions",
        "Verify FIU template version and required fields populated",
      ]},
      { title: "2. Quality score", required: true, checks: [
        "Apply 5-point QA rubric (clarity, completeness, accuracy, evidence, timeliness)",
        "Tag with typology, predicate offence, and jurisdiction descriptors",
        "Sign-off by reviewer independent from drafter",
      ]},
      { title: "3. Post-filing", required: true, checks: [
        "Track FIU acknowledgement and information-request response",
        "Capture lessons-learnt feedback to detection and case-management teams",
        "Record metrics for MLRO Board reporting",
      ]},
    ],
  },
  {
    id: "adverse-media-deepdive",
    title: "Adverse Media Investigation Deep Dive",
    typology: "adverse-media-deepdive",
    family: "CDD",
    steps: [
      { title: "1. Source curation", required: true, checks: [
        "Search across reputable wires, regulator sites, court records, and investigative journalism",
        "Apply multilingual queries aligned to subject's nationality and operating geographies",
        "Differentiate primary sources from aggregator restatements",
      ]},
      { title: "2. Allegation vs. finding", required: true, checks: [
        "Classify hits per FATF guidance: arrest ≠ charge ≠ conviction",
        "Capture article date, jurisdiction, and credibility score",
        "Triangulate at least two independent sources before relying on single hit",
      ]},
      { title: "3. Disposition", required: true, checks: [
        "Score adverse media into composite risk; never auto-block on allegation alone",
        "Document MLRO decision (clear / EDD / decline / exit) with rationale",
        "Diary refresh: 90 days for high-severity, 12 months for resolved hits",
      ]},
    ],
  },
  {
    id: "risk-rating-refresh",
    title: "Customer Risk Rating Annual Refresh",
    typology: "risk-rating-refresh",
    family: "CDD",
    steps: [
      { title: "1. Data refresh", required: true, checks: [
        "Update KYC fields: ID expiry, address, occupation, income, source-of-funds",
        "Refresh sanctions / PEP / adverse-media scans",
        "Reconcile transaction profile against declared activity",
      ]},
      { title: "2. Rating recalculation", required: true, checks: [
        "Reapply customer-risk-rating model with latest weights",
        "Document rating change and contributing factors",
        "Trigger EDD or step-down based on new score",
      ]},
      { title: "3. Governance", required: true, checks: [
        "Independent QA on a sample of refreshes",
        "Report aging / overdue refreshes to MLRO",
        "Retain refresh evidence 5 years post-relationship",
      ]},
    ],
  },
  {
    id: "branch-risk-assessment",
    title: "Branch / Subsidiary AML Risk Assessment",
    typology: "branch-risk-assessment",
    family: "Risk",
    steps: [
      { title: "1. Inherent-risk scoring", required: true, checks: [
        "Score by geography, customer mix, products, channels, transaction volume",
        "Map applicable regulatory framework and supervisor expectations",
        "Identify key inherent-risk drivers per business line",
      ]},
      { title: "2. Control effectiveness", required: true, checks: [
        "Assess design and operating effectiveness of branch-level controls",
        "Test sample of CDD, screening, monitoring, and STR-filing files",
        "Reconcile findings with internal-audit reports",
      ]},
      { title: "3. Residual-risk reporting", required: true, checks: [
        "Compute residual-risk score per FATF risk-based-approach guidance",
        "Capture remediation plan with owners and deadlines",
        "Report to local Board / regional AML committee and group MLRO",
      ]},
    ],
  },
  {
    id: "lbma-rgg-step-1",
    title: "LBMA RGG Step 1 — Strong Management Systems",
    typology: "lbma-rgg-step-1",
    family: "DPMS",
    steps: [
      { title: "1. Senior commitment & policy", required: true, checks: [
        "Confirm responsible-sourcing policy is signed by senior management and dated within 12 months",
        "Verify policy covers OECD Annex II risks (conflict, human-rights abuses, ML/TF, bribery)",
        "Map policy alignment to LBMA RGG v9 paragraphs 1.1–1.5",
      ]},
      { title: "2. Internal accountability", required: true, checks: [
        "Identify the appointed Compliance Officer and document their independence",
        "Confirm staff training records cover RGG within last 12 months",
        "Inspect the grievance / whistleblowing channel and test response timelines",
      ]},
      { title: "3. Record-keeping baseline", required: true, checks: [
        "Validate retention of supplier KYC + transaction records for >= 5 years",
        "Confirm audit trail captures source mine / scrap origin / counterparty per lot",
        "Cross-check Step-1 documentation pack against LBMA Refiner Toolkit checklist",
      ]},
    ],
  },
  {
    id: "lbma-rgg-step-2",
    title: "LBMA RGG Step 2 — Identify & Assess Supply-Chain Risks",
    typology: "lbma-rgg-step-2",
    family: "DPMS",
    steps: [
      { title: "1. Supplier mapping", required: true, checks: [
        "List every Tier-1 supplier with country of origin, mine ID, and transit route",
        "Flag any supplier with operations in or transiting a CAHRA jurisdiction",
        "Capture LBMA / RJC / RMI certification status per supplier",
      ]},
      { title: "2. Red-flag screening", required: true, checks: [
        "Screen each supplier against OFAC, UN, EU, UK, EOCN, and adverse media",
        "Identify all OECD Annex II Part I (origin) and Part II (transit) red flags",
        "Document any unusual gold flows, weight discrepancies, or undeclared origin",
      ]},
      { title: "3. Risk scoring", required: true, checks: [
        "Apply documented scoring rubric (low / medium / high) per supplier and per lot",
        "Escalate any high-risk lot to Compliance Officer within 1 business day",
        "Refresh assessment on any change of origin, ownership, or transit",
      ]},
    ],
  },
  {
    id: "lbma-rgg-step-3",
    title: "LBMA RGG Step 3 — Risk Response Strategy",
    typology: "lbma-rgg-step-3",
    family: "DPMS",
    steps: [
      { title: "1. Mitigation plan", required: true, checks: [
        "Document risk-mitigation actions per high-risk supplier with owner and deadline",
        "Decide on continued sourcing under mitigation, suspension, or termination",
        "Obtain senior-management sign-off on the response decision",
      ]},
      { title: "2. Implementation", required: true, checks: [
        "Verify that mitigation measures (enhanced controls, on-site visits, sampling) are operating",
        "Track measurable improvement against initial risk score within 6 months",
        "Maintain disengagement log where supplier relationships are terminated",
      ]},
      { title: "3. Stakeholder engagement", required: false, checks: [
        "Engage upstream actors and local government bodies where the OECD Guidance recommends",
        "Cooperate with industry initiatives addressing identified risks",
        "Document all engagement records as part of the audit pack",
      ]},
    ],
  },
  {
    id: "lbma-rgg-step-4",
    title: "LBMA RGG Step 4 — Independent Third-Party Audit",
    typology: "lbma-rgg-step-4",
    family: "DPMS",
    steps: [
      { title: "1. Auditor selection", required: true, checks: [
        "Confirm auditor is on the LBMA Approved Service Provider list",
        "Validate auditor independence — no advisory work for the refiner in last 24 months",
        "Agree audit scope covering full Steps 1–5 plus prior-year findings",
      ]},
      { title: "2. Audit fieldwork", required: true, checks: [
        "Provide auditor with full supplier register, transaction sample, and policy pack",
        "Make Compliance Officer and senior management available for interview",
        "Allow on-site sampling of physical inventory and records",
      ]},
      { title: "3. Audit report & remediation", required: true, checks: [
        "Receive Reasonable-Assurance audit opinion in writing",
        "Track every audit finding to closure with documented evidence",
        "Submit final audit report to LBMA per RGG submission deadline",
      ]},
    ],
  },
  {
    id: "lbma-rgg-step-5",
    title: "LBMA RGG Step 5 — Annual Public Report",
    typology: "lbma-rgg-step-5",
    family: "DPMS",
    steps: [
      { title: "1. Report drafting", required: true, checks: [
        "Cover all 5 RGG steps with management commentary on each",
        "Disclose CAHRA exposure, high-risk lots, and mitigation outcomes",
        "Include summary of audit findings and corrective actions",
      ]},
      { title: "2. Approval & publication", required: true, checks: [
        "Obtain CEO and Board sign-off on the public report",
        "Publish on the refiner's website and submit to LBMA portal",
        "Maintain prior-year reports accessible for 5 years",
      ]},
      { title: "3. Stakeholder communication", required: false, checks: [
        "Notify customers and counterparties of the published report",
        "Respond to public queries within 30 calendar days",
        "Capture lessons learned to feed into next year's Steps 1–4",
      ]},
    ],
  },
  {
    id: "uae-rsg-onboarding",
    title: "UAE RSG (Responsible Sourcing of Gold) — Onboarding",
    typology: "uae-rsg-onboarding",
    family: "DPMS",
    steps: [
      { title: "1. Scope confirmation", required: true, checks: [
        "Confirm refiner is licensed under MoE / DMCC and meets UAE-RSG eligibility",
        "Map gold inputs (ore, doré, scrap, recycled) against UAE-RSG product scope",
        "Capture mass-balance baseline for the audit period",
      ]},
      { title: "2. Counterparty due diligence", required: true, checks: [
        "Apply UAE-RSG enhanced KYC on every Tier-1 counterparty",
        "Screen against TFS lists, EOCN, adverse media, and CAHRA register",
        "Obtain shipping, customs, and chain-of-custody documentation per lot",
      ]},
      { title: "3. Internal controls", required: true, checks: [
        "Designate a UAE-RSG Compliance Officer reporting to senior management",
        "Embed UAE-RSG into the AML / CFT policy stack",
        "Plan annual independent reasonable-assurance audit",
      ]},
    ],
  },
  {
    id: "uae-rsg-annual-audit",
    title: "UAE RSG — Annual Reasonable-Assurance Audit",
    typology: "uae-rsg-annual-audit",
    family: "DPMS",
    steps: [
      { title: "1. Audit firm engagement", required: true, checks: [
        "Engage an audit firm meeting UAE-RSG independence and competence criteria",
        "Lock down audit scope: management systems, supplier DD, mass balance, reporting",
        "Schedule fieldwork to overlap year-end mass-balance close",
      ]},
      { title: "2. Evidence pack", required: true, checks: [
        "Provide full counterparty register with risk ratings and screening evidence",
        "Open mass-balance ledger and reconcile inputs vs outputs vs inventory",
        "Make Compliance Officer + senior management available for interview",
      ]},
      { title: "3. Reporting & remediation", required: true, checks: [
        "Receive a Reasonable-Assurance opinion under ISAE 3000 (Revised)",
        "Remediate all findings within agreed deadlines",
        "Submit audit report to MoE / DMCC supervisor and to the LBMA where applicable",
      ]},
    ],
  },
  {
    id: "dmcc-rule-book",
    title: "DMCC Rule Book — DPMS Compliance",
    typology: "dmcc-rule-book",
    family: "DPMS",
    steps: [
      { title: "1. Licensing & registration", required: true, checks: [
        "Confirm DMCC trade licence is current and activity codes match operations",
        "Register the MLRO and AML programme with DMCCA",
        "Maintain DMCC member portal records up to date",
      ]},
      { title: "2. AML programme alignment", required: true, checks: [
        "Map AML policies to DMCC Practice Note on Precious Metals & Stones",
        "Implement DMCCA reporting calendar for KPIs and incident notifications",
        "Conduct mandatory annual AML training and retain attendance log",
      ]},
      { title: "3. Inspection readiness", required: true, checks: [
        "Pre-stage CDD, transaction, and STR / DPMSR records for DMCCA inspection",
        "Run a self-assessment against the DMCC AML Compliance Checklist",
        "Track and close prior DMCCA findings before next inspection",
      ]},
    ],
  },
  {
    id: "fdl-10-2025-art-13",
    title: "FDL 10/2025 Art.13 — CDD Trigger Workflow",
    typology: "fdl-10-2025-art-13",
    family: "CDD",
    steps: [
      { title: "1. Trigger identification", required: true, checks: [
        "Identify the Art.13 trigger: new relationship, occasional > AED 55k, suspicion, or doubt over prior CDD",
        "Record the trigger date and the responsible analyst",
        "Decide between Standard / Simplified / Enhanced DD per risk rating",
      ]},
      { title: "2. CDD execution", required: true, checks: [
        "Verify customer identity from independent source documents",
        "Identify and verify beneficial owner >= 25% per FATF R.10",
        "Capture purpose / intended nature of relationship and source-of-funds narrative",
      ]},
      { title: "3. Disposition & monitoring", required: true, checks: [
        "Set ongoing-monitoring frequency aligned to final risk rating",
        "Document disposition rationale and Compliance Officer review",
        "Lock CDD pack to the case file with FNV-1a audit-chain hash",
      ]},
    ],
  },
  {
    id: "cabinet-res-74-2020",
    title: "Cabinet Res 74/2020 — TFS Without Delay",
    typology: "cabinet-res-74-2020",
    family: "Sanctions",
    steps: [
      { title: "1. Listing detection", required: true, checks: [
        "Pull EOCN local list and UN Consolidated list at minimum 3x daily",
        "Run name + identifier match against full customer base + UBOs",
        "Capture potential matches with score and rationale",
      ]},
      { title: "2. Without-delay freeze", required: true, checks: [
        "Freeze funds and economic resources within hours of confirmation",
        "Block any pending transactions and prevent new ones",
        "Notify EOCN via the prescribed portal within the regulatory deadline",
      ]},
      { title: "3. Reporting & customer handling", required: true, checks: [
        "File partial-match / freeze report with EOCN + FIU",
        "Ensure no tipping-off — restrict communications to operational essentials",
        "Maintain the freeze until written de-listing or court order is received",
      ]},
    ],
  },
  {
    id: "cabinet-res-10-2019",
    title: "Cabinet Res 10/2019 — Real-Estate AML Implementation",
    typology: "cabinet-res-10-2019",
    family: "REML",
    steps: [
      { title: "1. Reportable transaction screen", required: true, checks: [
        "Identify any cash, virtual asset, or single / linked payment >= AED 55,000",
        "Confirm transaction is in scope: brokers, agents, and developers covered by Res 10/2019",
        "Capture full buyer / seller / agent identification per FATF R.22",
      ]},
      { title: "2. UBO and source-of-funds", required: true, checks: [
        "Identify UBO >= 25% on any corporate buyer or seller",
        "Obtain documentary source-of-funds covering full purchase price",
        "Cross-check against PEP, sanctions, and adverse-media databases",
      ]},
      { title: "3. REBA filing", required: true, checks: [
        "File the Real-Estate Activity Report (REAR) on goAML within 30 days of trigger",
        "Retain underlying documentation for 10 years",
        "Update DLD / land-registry filings with verified UBO information",
      ]},
    ],
  },
  {
    id: "cabinet-res-134-2025",
    title: "Cabinet Res 134/2025 — DPMS Implementation",
    typology: "cabinet-res-134-2025",
    family: "DPMS",
    steps: [
      { title: "1. Scope confirmation", required: true, checks: [
        "Confirm activity (refining, trading, jewellery, scrap) is in scope of Res 134/2025",
        "Map MoE Circular 3/2025 reporting obligations to internal controls",
        "Refresh DPMS register with all in-scope entities and beneficial owners",
      ]},
      { title: "2. CDD / EDD execution", required: true, checks: [
        "Apply Standard CDD on all customers; EDD on cash > AED 55,000 or PEPs",
        "Capture origin of metal / stones and supporting trade documents",
        "Verify customer business profile against transaction expectations",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File DPMSR on goAML within 30 days for any in-scope cash transaction",
        "Submit periodic compliance returns to MoE per Circular 3/2025 calendar",
        "Maintain 10-year retention on all DPMSR artefacts and supporting evidence",
      ]},
    ],
  },
  {
    id: "fatf-r10-cdd",
    title: "FATF R.10 — Customer Due Diligence",
    typology: "fatf-r10-cdd",
    family: "CDD",
    steps: [
      { title: "1. Identification", required: true, checks: [
        "Identify the customer using reliable, independent source documents",
        "Identify natural persons holding >= 25% ownership or control of legal persons",
        "Capture the purpose and intended nature of the business relationship",
      ]},
      { title: "2. Verification", required: true, checks: [
        "Verify customer and beneficial owner identity before establishing relationship",
        "Where verification is incomplete, do not open the account or process the transaction",
        "Document any reliance on a regulated third party per FATF R.17",
      ]},
      { title: "3. Ongoing monitoring", required: true, checks: [
        "Conduct ongoing due diligence to ensure transactions match the customer profile",
        "Update CDD records on trigger events and on a risk-based cycle",
        "Apply enhanced CDD where higher-risk indicators arise",
      ]},
    ],
  },
  {
    id: "fatf-r11-recordkeeping",
    title: "FATF R.11 — Record-Keeping",
    typology: "fatf-r11-recordkeeping",
    family: "CDD",
    steps: [
      { title: "1. Retention scope", required: true, checks: [
        "Retain CDD records for at least 5 years after end of business relationship",
        "Retain transaction records, account files, and business correspondence for 5 years",
        "Cover all jurisdictions where the entity operates",
      ]},
      { title: "2. Reconstruction capability", required: true, checks: [
        "Ensure records permit reconstruction of individual transactions",
        "Index records so they can be retrieved on demand by competent authorities",
        "Test retrieval drills annually",
      ]},
      { title: "3. Format & integrity", required: true, checks: [
        "Store records in tamper-evident form with access logging",
        "Encrypt at rest and in transit",
        "Apply destruction protocol only after legal hold and retention period clear",
      ]},
    ],
  },
  {
    id: "fatf-r13-correspondent",
    title: "FATF R.13 — Correspondent Banking Relationship",
    typology: "fatf-r13-correspondent",
    family: "banking",
    steps: [
      { title: "1. Respondent assessment", required: true, checks: [
        "Gather sufficient information to understand respondent business and reputation",
        "Confirm respondent's AML / CFT controls have been the subject of supervisory review",
        "Refuse relationships with shell banks and respondents that allow shell banks",
      ]},
      { title: "2. Senior approval", required: true, checks: [
        "Obtain senior-management approval before establishing the relationship",
        "Document respective AML / CFT responsibilities of each institution",
        "Capture the Wolfsberg CBDDQ in the file",
      ]},
      { title: "3. Payable-through accounts", required: true, checks: [
        "Where payable-through accounts are used, verify respondent's CDD on its own customers",
        "Retain the right to obtain underlying customer information on request",
        "Apply enhanced ongoing monitoring on the respondent's transaction flows",
      ]},
    ],
  },
  {
    id: "fatf-r14-mvts",
    title: "FATF R.14 — MVTS Registration & Oversight",
    typology: "fatf-r14-mvts",
    family: "MSB",
    steps: [
      { title: "1. Licensing", required: true, checks: [
        "Confirm the MVTS provider holds a current licence or registration with CBUAE",
        "Identify all agents in the chain and ensure they are listed with the supervisor",
        "Block any unregistered agent or sub-agent",
      ]},
      { title: "2. Programme alignment", required: true, checks: [
        "Verify provider applies its AML programme equally to all agents",
        "Confirm transaction-monitoring scenarios cover smurfing, structuring, and high-risk corridors",
        "Inspect agent training and audit cadence",
      ]},
      { title: "3. Sanctions & TFS", required: true, checks: [
        "Ensure each remittance is screened against EOCN, UN, OFAC at submission",
        "Block transfers to / from FATF blacklisted jurisdictions absent licence",
        "Capture full Travel Rule data per FATF R.16",
      ]},
    ],
  },
  {
    id: "fatf-r15-vasp",
    title: "FATF R.15 — VASP Risk Assessment",
    typology: "fatf-r15-vasp",
    family: "VASP",
    steps: [
      { title: "1. Activity classification", required: true, checks: [
        "Classify the VASP activity (exchange, custody, transfer, issuance, ICO)",
        "Confirm licensing under VARA / ADGM / DFSA / SCA depending on activity",
        "Map applicable UAE TFS, Travel Rule, and crypto-specific obligations",
      ]},
      { title: "2. Customer & wallet DD", required: true, checks: [
        "Identify and verify customer identity and source of crypto",
        "Run on-chain analytics on counterparty wallets via Chainalysis / Elliptic / TRM",
        "Block interactions with mixers, sanctioned wallets, and darknet markets",
      ]},
      { title: "3. Travel Rule", required: true, checks: [
        "Capture originator + beneficiary information for transfers >= USD 1,000",
        "Use a Travel Rule protocol (TRP / IVMS-101 / Sygna / Notabene) for transmission",
        "Reject inbound transfers missing required Travel Rule fields",
      ]},
    ],
  },
  {
    id: "fatf-r17-third-party",
    title: "FATF R.17 — Reliance on Third Parties",
    typology: "fatf-r17-third-party",
    family: "CDD",
    steps: [
      { title: "1. Third-party eligibility", required: true, checks: [
        "Confirm third party is regulated and supervised under equivalent AML / CFT standards",
        "Document a written reliance agreement with delivery SLAs",
        "Exclude high-risk customers, PEPs, and TFS-flagged subjects from reliance",
      ]},
      { title: "2. Information transfer", required: true, checks: [
        "Obtain CDD information from the third party without delay on request",
        "Verify the third party retains underlying CDD documentation",
        "Test sample retrieval annually",
      ]},
      { title: "3. Ultimate accountability", required: true, checks: [
        "Confirm regulatory liability remains with the relying institution",
        "Maintain MLRO oversight of the reliance arrangement",
        "Review reliance arrangements at least annually",
      ]},
    ],
  },
  {
    id: "fatf-r19-high-risk-jurisdictions",
    title: "FATF R.19 — High-Risk Jurisdictions",
    typology: "fatf-r19-high-risk-jurisdictions",
    family: "Risk",
    steps: [
      { title: "1. Listing awareness", required: true, checks: [
        "Refresh FATF black-list and grey-list at every plenary update",
        "Maintain internal high-risk-country register reconciled to FATF, EU, UK, US lists",
        "Communicate listing changes to first line within 24 hours",
      ]},
      { title: "2. EDD application", required: true, checks: [
        "Apply enhanced CDD on customers from listed jurisdictions",
        "Obtain senior-management approval for any new relationship",
        "Limit / decline products with elevated TF risk for listed jurisdictions",
      ]},
      { title: "3. Counter-measures", required: true, checks: [
        "Apply counter-measures called for by FATF or UAE authorities (black-list jurisdictions)",
        "Block transactions where required by counter-measures",
        "Document all counter-measure decisions in the case file",
      ]},
    ],
  },
  {
    id: "fatf-r20-suspicious-reporting",
    title: "FATF R.20 — Suspicious Transaction Reporting",
    typology: "fatf-r20-suspicious-reporting",
    family: "FIU",
    steps: [
      { title: "1. Trigger detection", required: true, checks: [
        "Identify when there is suspicion of ML / TF / predicate offences",
        "Escalate from analyst to MLRO within 24 hours",
        "Document the suspicion narrative with concrete indicators",
      ]},
      { title: "2. Filing", required: true, checks: [
        "File STR with goAML within statutory deadline",
        "Include all relevant CDD, transaction, and supporting evidence",
        "Apply four-eyes review on the final filing",
      ]},
      { title: "3. Post-filing", required: true, checks: [
        "Maintain confidentiality — no tipping-off to the subject",
        "Continue to monitor the relationship and update goAML on material change",
        "Retain the STR and supporting evidence for 10 years",
      ]},
    ],
  },
  {
    id: "fatf-r21-tipping-off",
    title: "FATF R.21 — Tipping-Off Boundary",
    typology: "fatf-r21-tipping-off",
    family: "FIU",
    steps: [
      { title: "1. Awareness", required: true, checks: [
        "Train staff that disclosure of an STR or investigation is a criminal offence",
        "Cover lawful exceptions: tipping-off rules within a financial group, lawyer-privilege limits",
        "Ensure relationship managers know what they can and cannot say to a customer",
      ]},
      { title: "2. Operational controls", required: true, checks: [
        "Restrict access to STR records on a need-to-know basis",
        "Mask STR-related flags in customer-facing systems",
        "Audit log all access to suspicion records",
      ]},
      { title: "3. Customer-facing scripts", required: true, checks: [
        "Provide approved scripts for declining or delaying transactions without disclosing reason",
        "Channel customer questions through the MLRO function",
        "Document any breach for investigation and disciplinary review",
      ]},
    ],
  },
  {
    id: "fatf-r22-dnfbp-cdd",
    title: "FATF R.22 — DNFBP Customer Due Diligence",
    typology: "fatf-r22-dnfbp-cdd",
    family: "CDD",
    steps: [
      { title: "1. Activity scope", required: true, checks: [
        "Identify in-scope DNFBP activity: real estate, DPMS, lawyers, accountants, TCSPs",
        "Apply CDD when the activity threshold is triggered",
        "Document the trigger and threshold reasoning",
      ]},
      { title: "2. Standard CDD", required: true, checks: [
        "Identify and verify customer + beneficial owner per R.10",
        "Capture business purpose and source-of-funds narrative",
        "Set risk rating with documented rationale",
      ]},
      { title: "3. Enhanced and ongoing", required: true, checks: [
        "Apply EDD where the activity carries elevated risk (cash, PEP, complex structures)",
        "Refresh CDD on a risk-based cycle",
        "Maintain records per R.11 retention period",
      ]},
    ],
  },
  {
    id: "fatf-r24-bo-legal-persons",
    title: "FATF R.24 — Beneficial Ownership of Legal Persons",
    typology: "fatf-r24-bo-legal-persons",
    family: "UBO",
    steps: [
      { title: "1. Identify ownership", required: true, checks: [
        "Trace each ownership chain to natural persons holding >= 25%",
        "Capture the type of control (ownership, voting rights, board, agreement)",
        "Document any nominee / bearer arrangement",
      ]},
      { title: "2. Verify via independent source", required: true, checks: [
        "Use BOR / public registry / regulator-issued document where available",
        "Cross-check against registry, declaration, and customer-supplied evidence",
        "Resolve any conflict between sources before opening",
      ]},
      { title: "3. Maintain currency", required: true, checks: [
        "Refresh BO information on every material change",
        "Confirm UAE BOR filing status on every refresh",
        "Capture the date and source of the most recent verification",
      ]},
    ],
  },
  {
    id: "fatf-r25-bo-legal-arrangements",
    title: "FATF R.25 — Beneficial Ownership of Trusts & Legal Arrangements",
    typology: "fatf-r25-bo-legal-arrangements",
    family: "UBO",
    steps: [
      { title: "1. Identify roles", required: true, checks: [
        "Identify settlor, trustee, protector, beneficiaries, and any other natural person exercising control",
        "Capture beneficiaries by name where determined; by class where not",
        "Distinguish testamentary, charitable, and discretionary trust forms",
      ]},
      { title: "2. Verify documentation", required: true, checks: [
        "Obtain trust deed, letter of wishes (where appropriate), and trustee licence",
        "Verify trustee identity and regulatory standing",
        "Check that the trustee is not a vehicle to obscure beneficial ownership",
      ]},
      { title: "3. Ongoing monitoring", required: true, checks: [
        "Refresh BO information on appointment / removal of trustees, protectors, beneficiaries",
        "Re-screen all named persons against TFS and adverse media",
        "Document material changes to the trust structure",
      ]},
    ],
  },
  {
    id: "fatf-r32-cash-couriers",
    title: "FATF R.32 — Cash Courier Detection",
    typology: "fatf-r32-cash-couriers",
    family: "CFT",
    steps: [
      { title: "1. Declaration awareness", required: true, checks: [
        "Confirm staff know UAE cash declaration threshold (AED 60,000 or equivalent)",
        "Brief on Customs / Federal Authority for Identity & Citizenship reporting channels",
        "Highlight typology: bulk cash, gift cards, bearer instruments, prepaid cards",
      ]},
      { title: "2. Detection patterns", required: true, checks: [
        "Identify customers depositing large unexplained cash following travel",
        "Flag rapid cash-in / cash-out patterns suggesting integration of smuggled cash",
        "Cross-check against travel and PEP intelligence",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File STR where smuggling is suspected",
        "Coordinate with Customs / FIU under MoU procedures",
        "Retain evidence and CCTV (where available) for 10 years",
      ]},
    ],
  },
  {
    id: "un-1267-aq-daesh",
    title: "UN Sanctions — 1267 (Al-Qaida & Daesh)",
    typology: "un-1267-aq-daesh",
    family: "Sanctions",
    steps: [
      { title: "1. List ingestion", required: true, checks: [
        "Pull UN 1267 Consolidated list at every refresh and reconcile to internal screening list",
        "Screen all customers, UBOs, and counterparties against narrative + identifier fields",
        "Capture any partial / phonetic match for review",
      ]},
      { title: "2. Without-delay action", required: true, checks: [
        "Freeze funds and economic resources on confirmed match",
        "Block any pending or attempted transaction",
        "Notify EOCN / UAE authorities per Cabinet Res 74/2020 deadlines",
      ]},
      { title: "3. Reporting & maintenance", required: true, checks: [
        "File the freeze report on goAML",
        "Avoid tipping-off — segregate communications strictly",
        "Maintain freeze pending UN 1267 Committee de-listing",
      ]},
    ],
  },
  {
    id: "un-1718-dprk",
    title: "UN Sanctions — 1718 (DPRK)",
    typology: "un-1718-dprk",
    family: "Sanctions",
    steps: [
      { title: "1. Designation screen", required: true, checks: [
        "Screen against UN 1718 designations and US OFAC SDN DPRK programme",
        "Identify any DPRK-linked vessels via IMO / MMSI lookup",
        "Check for STS (ship-to-ship) transfer indicators",
      ]},
      { title: "2. Sectoral controls", required: true, checks: [
        "Block coal, iron, seafood, textiles, refined petroleum trade with DPRK nexus",
        "Verify cap-compliance on any humanitarian carve-out",
        "Decline luxury-goods exports to DPRK regardless of value",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File freeze and sanctions notifications to EOCN + UN Panel of Experts where required",
        "Retain shipping and trade evidence for 10 years",
        "Refresh customer screening daily during active deals",
      ]},
    ],
  },
  {
    id: "un-2231-iran",
    title: "UN Sanctions — 2231 (Iran post-JCPOA)",
    typology: "un-2231-iran",
    family: "Sanctions",
    steps: [
      { title: "1. Regime mapping", required: true, checks: [
        "Identify which UN 2231 measures remain in force (procurement channel, designations)",
        "Reconcile UN 2231 with US secondary sanctions reach",
        "Assess JCPOA participant status and snapback impact",
      ]},
      { title: "2. Trade & finance controls", required: true, checks: [
        "Screen for IRGC, MODAFL, and sanctioned Iranian banks",
        "Block dual-use goods trade absent procurement-channel approval",
        "Check shipping / vessel registry for Iran nexus",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File any freeze with EOCN per Cabinet Res 74/2020",
        "Retain procurement-channel evidence per UN 2231 Annex B",
        "Coordinate with regulator on humanitarian carve-outs",
      ]},
    ],
  },
  {
    id: "ofac-sdn-investigation",
    title: "OFAC SDN — Match Investigation",
    typology: "ofac-sdn-investigation",
    family: "Sanctions",
    steps: [
      { title: "1. Match scoring", required: true, checks: [
        "Capture the OFAC programme code, list date, and identifiers (DOB, POB, IDs)",
        "Run secondary verification against alternative sources to confirm match",
        "Document score, rationale, and analyst",
      ]},
      { title: "2. Disposition", required: true, checks: [
        "Block / reject the transaction per OFAC enforcement guidelines",
        "Hold funds in a separate ledger pending OFAC license or rejection",
        "File OFAC blocking / rejection report within 10 business days",
      ]},
      { title: "3. Customer handling", required: true, checks: [
        "Apply tipping-off rules — refer customer queries to Compliance",
        "Update CDD profile to reflect blocked / rejected status",
        "Refresh full file at 6 months and on any list change",
      ]},
    ],
  },
  {
    id: "eu-sanctions-russia",
    title: "EU Russia Sanctions (Reg 833/2014 + 269/2014)",
    typology: "eu-sanctions-russia",
    family: "Sanctions",
    steps: [
      { title: "1. Regime mapping", required: true, checks: [
        "Reconcile EU Reg 833/2014 sectoral measures and Reg 269/2014 designations",
        "Map oil-price-cap and crude / refined product exemptions",
        "Identify Russian / Belarusian banks subject to SWIFT disconnection",
      ]},
      { title: "2. Customer & trade controls", required: true, checks: [
        "Screen all customers, UBOs, and vessels for Russia / Belarus nexus",
        "Apply 'no Russian-touch' supply-chain certification on dual-use goods",
        "Capture flag of convenience and AIS spoofing indicators",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File freeze with EOCN + competent EU authority",
        "Retain trade documentation, ICPOs, BLs, and price-cap attestations",
        "Refresh sanctions register on every EU OJ amendment",
      ]},
    ],
  },
  {
    id: "ai-model-validation",
    title: "AI Model — Pre-Deployment Validation",
    typology: "ai-model-validation",
    family: "ABC",
    steps: [
      { title: "1. Model documentation", required: true, checks: [
        "Capture intended use, training data, features, and out-of-scope use cases",
        "Document data lineage and any restricted / sensitive features",
        "Identify model owner, validator, and approver",
      ]},
      { title: "2. Independent validation", required: true, checks: [
        "Validate model performance on held-out and production-shadow data",
        "Test for bias across protected / sensitive attributes",
        "Confirm explainability artefacts (SHAP / LIME / counterfactual) are reproducible",
      ]},
      { title: "3. Deployment gating", required: true, checks: [
        "Obtain Compliance + Risk sign-off before production release",
        "Set monitoring thresholds for drift, performance, and fairness",
        "Lock the model card to the deployment ticket",
      ]},
    ],
  },
  {
    id: "ai-model-bias-audit",
    title: "AI Model — Annual Bias Audit",
    typology: "ai-model-bias-audit",
    family: "ABC",
    steps: [
      { title: "1. Sample selection", required: true, checks: [
        "Build a stratified sample across protected attributes and risk-rating tiers",
        "Include rejected / flagged outcomes for false-positive bias review",
        "Document sampling rationale",
      ]},
      { title: "2. Metric computation", required: true, checks: [
        "Compute disparate-impact, equalised-odds, and calibration metrics",
        "Compare against documented fairness thresholds",
        "Triage breaches to bias-cause root analysis",
      ]},
      { title: "3. Remediation", required: true, checks: [
        "Plan reweighting / threshold adjustments / data refresh",
        "Re-validate the model on a holdout slice post-remediation",
        "Communicate audit summary to the Compliance / Risk Committee",
      ]},
    ],
  },
  {
    id: "ai-explainability-doc",
    title: "AI Explainability Documentation",
    typology: "ai-explainability-doc",
    family: "ABC",
    steps: [
      { title: "1. Approach selection", required: true, checks: [
        "Select per-decision (SHAP / LIME) and global (PDP / surrogate) explainability methods",
        "Confirm method is consistent with model class (linear / tree / NN / LLM)",
        "Document any limitations in the approach",
      ]},
      { title: "2. Production wiring", required: true, checks: [
        "Wire explanations into the case-management system at decision time",
        "Store the explanation alongside the disposition with a tamper-evident hash",
        "Ensure operator UI surfaces top contributing features in plain language",
      ]},
      { title: "3. Operator review", required: true, checks: [
        "Train operators on reading model explanations before override",
        "Run quarterly QA on a sample of operator overrides vs explanations",
        "Surface systematic disagreement to the model owner for tuning",
      ]},
    ],
  },
  {
    id: "ai-drift-monitoring",
    title: "AI Drift Monitoring",
    typology: "ai-drift-monitoring",
    family: "ABC",
    steps: [
      { title: "1. Reference profile", required: true, checks: [
        "Snapshot training data distribution and prediction baseline at deployment",
        "Define drift metrics: PSI, KS, KL-divergence, and feature-rank stability",
        "Set alarm thresholds with documented rationale",
      ]},
      { title: "2. Continuous monitoring", required: true, checks: [
        "Run daily / weekly drift checks against the reference profile",
        "Surface alerts to the model owner with severity tiering",
        "Capture suspected concept drift vs covariate drift in triage notes",
      ]},
      { title: "3. Response", required: true, checks: [
        "Plan retraining or rollback within agreed SLA on alarm",
        "Re-run pre-deployment validation before re-release",
        "Notify Compliance on any drift impacting AML / CFT decisions",
      ]},
    ],
  },
  {
    id: "ai-genai-output-disposition",
    title: "Generative AI — Output Disposition Logging",
    typology: "ai-genai-output-disposition",
    family: "ABC",
    steps: [
      { title: "1. Output capture", required: true, checks: [
        "Persist prompt, model version, temperature, retrieval context, and full output",
        "Hash the output into the audit chain",
        "Capture the operator's disposition (accepted / amended / rejected)",
      ]},
      { title: "2. Citation verification", required: true, checks: [
        "Verify any cited source actually supports the claim",
        "Block reliance on training-data-as-current-source per charter P3",
        "Flag fabricated citations to the model owner",
      ]},
      { title: "3. Risk surfacing", required: true, checks: [
        "Reject GenAI use where the question requires legal conclusion (charter P5)",
        "Force a human-in-the-loop step for any sanctions / freeze recommendation",
        "Refresh prompt-injection guards per current threat intel",
      ]},
    ],
  },
  {
    id: "ungp-pillar-2-corporate",
    title: "UNGP Pillar 2 — Corporate Responsibility to Respect",
    typology: "ungp-pillar-2-corporate",
    family: "OECD",
    steps: [
      { title: "1. Human-rights policy commitment", required: true, checks: [
        "Confirm board-approved human-rights policy aligned to UNGP, ILO core conventions, OECD MNE",
        "Map salient human-rights risks across operations and value chain",
        "Communicate the policy to suppliers and counterparties",
      ]},
      { title: "2. Human-rights due diligence", required: true, checks: [
        "Run periodic human-rights due diligence per UNGP 17–21",
        "Integrate findings into procurement, onboarding, and ongoing monitoring",
        "Track impacts and effectiveness of mitigation",
      ]},
      { title: "3. Remediation & reporting", required: true, checks: [
        "Operate a grievance mechanism meeting UNGP 31 effectiveness criteria",
        "Provide for or cooperate in remediation where impact occurred",
        "Disclose human-rights performance in the annual sustainability / TCFD-S report",
      ]},
    ],
  },
  {
    id: "uflpa-uyghur-forced-labour",
    title: "UFLPA — Uyghur Forced Labour Compliance",
    typology: "uflpa-uyghur-forced-labour",
    family: "OECD",
    steps: [
      { title: "1. Supply-chain mapping", required: true, checks: [
        "Map Tier-1 to Tier-N suppliers with country and region detail",
        "Flag any production / sourcing in or from Xinjiang Uyghur Autonomous Region",
        "Identify entities on the UFLPA Entity List",
      ]},
      { title: "2. Rebuttable presumption", required: true, checks: [
        "Treat goods with XUAR nexus as inadmissible unless rebutted",
        "Compile clear and convincing evidence: traceability, audit, on-site verification",
        "Capture chain-of-custody from raw material to finished good",
      ]},
      { title: "3. Customer & customs handling", required: true, checks: [
        "Communicate UFLPA exposure to US customers / clearance brokers",
        "Coordinate with CBP requests with documented evidence packs",
        "Log any seizure / detention and remediate sourcing",
      ]},
    ],
  },
  {
    id: "modern-slavery-supply-chain",
    title: "Modern Slavery — Supply-Chain Audit",
    typology: "modern-slavery-supply-chain",
    family: "OECD",
    steps: [
      { title: "1. Risk mapping", required: true, checks: [
        "Apply ILO 11 indicators of forced labour to supplier screening",
        "Identify high-risk sectors (construction, agriculture, garments, electronics, mining)",
        "Map labour-broker chains and recruitment-fee practices",
      ]},
      { title: "2. On-site audit", required: true, checks: [
        "Conduct unannounced audits using SMETA / SA8000 / Sedex protocols",
        "Interview workers off-site without management present",
        "Inspect dormitories, identity-document storage, and pay-slip records",
      ]},
      { title: "3. Disclosure", required: true, checks: [
        "Publish a Modern Slavery Statement per UK Act / Australia Act / California TISCA",
        "Disclose remediation actions and KPIs year-on-year",
        "Submit statement to the public registry within statutory deadline",
      ]},
    ],
  },
  {
    id: "tax-evasion-predicate",
    title: "Tax-Evasion Predicate Investigation",
    typology: "tax-evasion-predicate",
    family: "ML",
    steps: [
      { title: "1. Indicator review", required: true, checks: [
        "Identify red flags: undeclared income, fake invoices, transfer-mispricing, carousel fraud",
        "Cross-check declared revenue with banking turnover and trade flow",
        "Validate tax residency and treaty claims",
      ]},
      { title: "2. Linkage to ML", required: true, checks: [
        "Treat tax evasion as a predicate offence under FATF and FDL 10/2025",
        "Document the ML element: placement / layering / integration of tax-evaded proceeds",
        "Correlate with any FTA / OECD CRS / FATCA flag",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File STR on goAML where suspicion is reasonable",
        "Coordinate with FTA-disclosure regime where required",
        "Retain evidence for 10 years",
      ]},
    ],
  },
  {
    id: "lawyer-aml-onboarding",
    title: "Lawyer / Legal-Profession AML Onboarding",
    typology: "lawyer-aml-onboarding",
    family: "CDD",
    steps: [
      { title: "1. Gateway-service identification", required: true, checks: [
        "Confirm the matter falls within FATF R.22 gateway services (real estate, BO, trust formation, account management, business sale)",
        "Document trigger and responsible partner",
        "Apply CDD before substantive work begins",
      ]},
      { title: "2. CDD execution", required: true, checks: [
        "Identify and verify client + UBO + funder of fees and disbursements",
        "Capture purpose of retainer and source-of-funds narrative",
        "Refuse instructions where CDD cannot be completed",
      ]},
      { title: "3. Privilege boundary", required: true, checks: [
        "Distinguish information protected by Legal Professional Privilege vs reportable suspicion",
        "Maintain separate privileged and AML files",
        "Take legal advice from another firm where reporting decision interacts with privilege",
      ]},
    ],
  },
  {
    id: "auditor-aml-gateway",
    title: "Auditor / Accountant — AML Gateway-Service",
    typology: "auditor-aml-gateway",
    family: "CDD",
    steps: [
      { title: "1. Engagement scope", required: true, checks: [
        "Identify whether the engagement is gateway (BO formation, trust admin, account management, real-estate)",
        "Document trigger and engagement partner",
        "Apply CDD before commencement",
      ]},
      { title: "2. CDD execution", required: true, checks: [
        "Identify and verify client + UBO using independent source",
        "Capture nature of business, source of funds, and engagement scope",
        "Risk-rate and apply EDD for cash-intensive or PEP cases",
      ]},
      { title: "3. Reporting & supervision", required: true, checks: [
        "File STR on goAML where suspicion exists",
        "Coordinate disclosure with relevant Self-Regulatory Body",
        "Retain working papers and CDD for 10 years",
      ]},
    ],
  },
  {
    id: "tcsp-trust-formation",
    title: "TCSP — Trust Formation",
    typology: "tcsp-trust-formation",
    family: "UBO",
    steps: [
      { title: "1. Settlor & purpose", required: true, checks: [
        "Identify and verify settlor + source of trust property",
        "Capture documented purpose and class of beneficiaries",
        "Reject any settlor unwilling to disclose source of wealth",
      ]},
      { title: "2. Trustees & protectors", required: true, checks: [
        "Identify and verify trustees, protectors, and any controlling parties",
        "Confirm trustees are licensed where regulation requires",
        "Screen all named persons for sanctions, PEP, adverse media",
      ]},
      { title: "3. Ongoing administration", required: true, checks: [
        "Refresh CDD on any change in trustees, protectors, or named beneficiaries",
        "File suspicion with the FIU under R.20 where ML / TF indicators arise",
        "Maintain records for 10 years post-distribution",
      ]},
    ],
  },
  {
    id: "insurance-single-premium",
    title: "Insurance — Single-Premium Life",
    typology: "insurance-single-premium",
    family: "ML",
    steps: [
      { title: "1. Policyholder DD", required: true, checks: [
        "Apply CDD to policyholder + premium funder + beneficiary",
        "Capture source of premium and rationale for single-premium structure",
        "Risk-rate and trigger EDD for cash, third-party funder, or PEP",
      ]},
      { title: "2. Suspicious indicators", required: true, checks: [
        "Flag rapid surrender post-issue (suspected layering)",
        "Flag third-party premium payment without familial link",
        "Capture frequent change of beneficiary",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "Escalate to MLRO and file STR where suspicion arises",
        "Retain underwriting and surrender records for 10 years",
        "Refresh CDD on assignment, surrender, or beneficiary change",
      ]},
    ],
  },
  {
    id: "insurance-surrender-anomaly",
    title: "Insurance — Surrender-Value Anomaly",
    typology: "insurance-surrender-anomaly",
    family: "ML",
    steps: [
      { title: "1. Pattern detection", required: true, checks: [
        "Identify surrenders within first 24 months without economic rationale",
        "Flag where surrender value is paid to a third-party account",
        "Cross-check against PEP / adverse-media intel",
      ]},
      { title: "2. Disposition", required: true, checks: [
        "Hold the surrender pending Compliance review",
        "Verify identity and source of original premium funder",
        "Decide between proceed / withhold / freeze with Compliance sign-off",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File STR where the anomaly remains unexplained",
        "Capture analyst notes, evidence, and disposition in audit chain",
        "Apply tipping-off rules in customer correspondence",
      ]},
    ],
  },
  {
    id: "fintech-aisp-onboarding",
    title: "FinTech AISP / Open-Banking Onboarding",
    typology: "fintech-aisp-onboarding",
    family: "VASP",
    steps: [
      { title: "1. Licensing & passporting", required: true, checks: [
        "Confirm AISP licence with relevant regulator (CBUAE, ADGM FSRA, DIFC DFSA)",
        "Map permitted account-information services and out-of-scope activities",
        "Capture passporting / cross-border arrangements",
      ]},
      { title: "2. Customer DD", required: true, checks: [
        "Apply CDD on AISP user + linked PSU (payment service user)",
        "Verify consent and SCA (strong customer authentication) compliance",
        "Risk-rate based on data scope and onward-data sharing",
      ]},
      { title: "3. Data, security, and reporting", required: true, checks: [
        "Confirm PDPL data-handling obligations are met (PDPL Art.22 cross-border)",
        "Operate breach-reporting within 72 hours of detection",
        "Surface AML signals to the partner financial institution",
      ]},
    ],
  },
  {
    id: "transaction-monitoring-tuning",
    title: "Transaction Monitoring — Rule Tuning",
    typology: "transaction-monitoring-tuning",
    family: "Risk",
    steps: [
      { title: "1. Performance baseline", required: true, checks: [
        "Compute alert volume, true-positive rate, and false-positive rate per rule",
        "Identify dormant / over-firing / mis-tuned rules",
        "Document baseline and tuning hypothesis",
      ]},
      { title: "2. Threshold change", required: true, checks: [
        "Run above-the-line / below-the-line analysis on threshold candidates",
        "Validate proposed tuning against a known-suspicion test set",
        "Obtain MLRO + Risk sign-off before deployment",
      ]},
      { title: "3. Post-tuning review", required: true, checks: [
        "Monitor 30 / 60 / 90-day performance against the new threshold",
        "Roll back if true-positive rate degrades materially",
        "Lock the change to the change-management ticket",
      ]},
    ],
  },
  {
    id: "tm-alert-quality-review",
    title: "TM Alert — Quality Review",
    typology: "tm-alert-quality-review",
    family: "Risk",
    steps: [
      { title: "1. Sampling", required: true, checks: [
        "Sample alerts across rules, analysts, and dispositions",
        "Include closed-no-action and escalated-to-STR alerts",
        "Document sampling methodology and confidence interval",
      ]},
      { title: "2. Review", required: true, checks: [
        "Assess analyst rationale, evidence sufficiency, and disposition correctness",
        "Identify false-negative risk by reviewing closed alerts against new typology intel",
        "Capture coaching needs",
      ]},
      { title: "3. Closure", required: true, checks: [
        "Report findings to the MLRO and analyst line manager",
        "Drive rule-tuning, training, or process changes from the findings",
        "Track corrective actions to closure",
      ]},
    ],
  },
  {
    id: "fp-rate-rca",
    title: "False-Positive Rate — Root-Cause Analysis",
    typology: "fp-rate-rca",
    family: "Risk",
    steps: [
      { title: "1. FP segmentation", required: true, checks: [
        "Bucket FPs by rule, customer segment, channel, and reason code",
        "Identify the top-10 contributing patterns",
        "Quantify operating cost of FPs",
      ]},
      { title: "2. Cause analysis", required: true, checks: [
        "Distinguish data-quality, threshold, and typology-mismatch causes",
        "Identify candidate data fixes vs rule changes vs additional context",
        "Document the cause hypothesis with evidence",
      ]},
      { title: "3. Remediation", required: true, checks: [
        "Implement data fixes, rule retuning, or context enrichment",
        "Validate against a holdout sample",
        "Track FP-rate reduction to target threshold",
      ]},
    ],
  },
  {
    id: "case-quality-review",
    title: "Case Quality / Four-Eyes Review",
    typology: "case-quality-review",
    family: "Risk",
    steps: [
      { title: "1. Sample selection", required: true, checks: [
        "Select sample of dispositioned cases across analysts and case types",
        "Include high-risk subjects and PEP / sanctions touchpoints",
        "Document sampling rationale",
      ]},
      { title: "2. Review", required: true, checks: [
        "Assess CDD completeness, evidence quality, and disposition reasoning",
        "Verify four-eyes approval was applied where required",
        "Capture missing controls or evidence gaps",
      ]},
      { title: "3. Closure", required: true, checks: [
        "Report results to MLRO with risk-rated findings",
        "Drive corrective actions, retraining, and policy updates",
        "Track to closure with documented evidence",
      ]},
    ],
  },
  {
    id: "fatf-greylist-onboarding",
    title: "FATF Grey-List Jurisdiction — Onboarding EDD",
    typology: "fatf-greylist-onboarding",
    family: "Risk",
    steps: [
      { title: "1. Identification", required: true, checks: [
        "Confirm jurisdiction is on current FATF grey-list (ICRG monitoring)",
        "Identify nexus: customer residence, UBO, business location, transit",
        "Reference the most recent FATF plenary statement",
      ]},
      { title: "2. EDD application", required: true, checks: [
        "Apply enhanced CDD covering source-of-wealth and source-of-funds in depth",
        "Obtain senior-management approval for relationship",
        "Set higher-frequency ongoing monitoring",
      ]},
      { title: "3. Periodic refresh", required: true, checks: [
        "Re-assess relationship on each FATF plenary update",
        "Step-down EDD only after delisting + 12-month observation period",
        "Document rationale for any retention or exit",
      ]},
    ],
  },
  {
    id: "fatf-blacklist-blockade",
    title: "FATF Black-List Jurisdiction — Counter-Measures",
    typology: "fatf-blacklist-blockade",
    family: "Sanctions",
    steps: [
      { title: "1. Listing confirmation", required: true, checks: [
        "Confirm jurisdiction is on FATF call-for-action list (Iran / DPRK / Myanmar)",
        "Map UAE-mandated counter-measures",
        "Capture any humanitarian carve-outs",
      ]},
      { title: "2. Counter-measures", required: true, checks: [
        "Block correspondent / payable-through accounts with listed-jurisdiction respondents",
        "Decline new relationships absent specific licence",
        "Apply enhanced reporting and monitoring on permitted residual flows",
      ]},
      { title: "3. Reporting", required: true, checks: [
        "File freeze / decline reports with EOCN + FIU as applicable",
        "Retain evidence and counter-measure rationale for 10 years",
        "Refresh on every FATF plenary",
      ]},
    ],
  },
  {
    id: "moe-circular-3-2025",
    title: "MoE Circular 3/2025 — DPMS Reporting",
    typology: "moe-circular-3-2025",
    family: "MoE",
    steps: [
      { title: "1. Scope mapping", required: true, checks: [
        "Confirm the entity is in scope (refiner / trader / jeweller / scrap dealer)",
        "Map reporting calendar to MoE Circular 3/2025 deadlines",
        "Capture all reportable transaction types",
      ]},
      { title: "2. Filing execution", required: true, checks: [
        "File DPMSR within statutory deadline on goAML",
        "Submit periodic compliance returns to MoE",
        "Apply four-eyes review on every filing",
      ]},
      { title: "3. Inspection readiness", required: true, checks: [
        "Maintain a live evidence pack indexed to each filing",
        "Pre-stage documentation for MoE inspection",
        "Track and close prior MoE findings",
      ]},
    ],
  },
  {
    id: "fiu-goaml-amendment",
    title: "FIU goAML — Filing Amendment Workflow",
    typology: "fiu-goaml-amendment",
    family: "FIU",
    steps: [
      { title: "1. Trigger detection", required: true, checks: [
        "Identify any new fact or evidence requiring amendment of a prior STR / DPMSR / REAR",
        "Capture the discovery date and analyst",
        "Decide between Amendment (XML) and Withdrawal where applicable",
      ]},
      { title: "2. Amendment preparation", required: true, checks: [
        "Reuse the original goAML message ID and apply the amendment header",
        "Append new evidence, narrative, and updated CDD",
        "Apply four-eyes review on the amendment",
      ]},
      { title: "3. Submission & retention", required: true, checks: [
        "Submit amendment within FIU deadline",
        "Capture FIU acknowledgement and reference number",
        "Retain amendment trail for 10 years",
      ]},
    ],
  },
  {
    id: "eocn-list-refresh",
    title: "EOCN — Daily List Refresh",
    typology: "eocn-list-refresh",
    family: "EOCN",
    steps: [
      { title: "1. Source pull", required: true, checks: [
        "Pull EOCN local terror list and Cabinet-issued additions at minimum 3x daily",
        "Reconcile to internal screening list with hash check",
        "Capture pull timestamp and source URL",
      ]},
      { title: "2. Mass screening", required: true, checks: [
        "Screen full customer + UBO base against the refreshed list",
        "Capture potential matches with score >= 85% for review",
        "Apply phonetic + Latin / Arabic transliteration matching",
      ]},
      { title: "3. Disposition", required: true, checks: [
        "Resolve potential matches within agreed SLA",
        "Freeze on confirmed match per Cabinet Res 74/2020",
        "Document all decisions in the audit chain",
      ]},
    ],
  },
  {
    id: "ungp-grievance-mechanism",
    title: "UNGP 31 — Grievance Mechanism Effectiveness",
    typology: "ungp-grievance-mechanism",
    family: "OECD",
    steps: [
      { title: "1. Design", required: true, checks: [
        "Confirm the mechanism meets UNGP 31 criteria: legitimate, accessible, predictable, equitable, transparent, rights-compatible",
        "Map languages, channels (in-person / online / hotline), and accessibility",
        "Assess whether external stakeholders can raise grievances",
      ]},
      { title: "2. Operation", required: true, checks: [
        "Capture all grievances with timestamp, category, and severity",
        "Investigate within agreed SLA",
        "Track outcomes, remediation, and complainant feedback",
      ]},
      { title: "3. Improvement", required: true, checks: [
        "Annual review of effectiveness against UNGP 31 criteria",
        "Publish anonymised grievance metrics",
        "Feed lessons learned into upstream policy",
      ]},
    ],
  },
  {
    id: "oecd-rbc-dd",
    title: "OECD Responsible Business Conduct — Due Diligence",
    typology: "oecd-rbc-dd",
    family: "OECD",
    steps: [
      { title: "1. Embedding", required: true, checks: [
        "Embed RBC into policies, management systems, and supplier code",
        "Allocate responsibility at executive level",
        "Train procurement, sales, and Compliance staff",
      ]},
      { title: "2. Risk identification & mitigation", required: true, checks: [
        "Identify actual and potential adverse impacts in operations and value chain",
        "Cease, prevent, or mitigate adverse impacts based on severity and likelihood",
        "Track effectiveness of measures over time",
      ]},
      { title: "3. Communication", required: true, checks: [
        "Account for how impacts are addressed via public reporting",
        "Provide for / cooperate in remediation where impact occurred",
        "Engage with NCPs and stakeholders on findings",
      ]},
    ],
  },
  {
    id: "vasp-travel-rule-impl",
    title: "VASP Travel Rule (FATF R.16) Implementation",
    typology: "vasp-travel-rule-impl",
    family: "VASP",
    steps: [
      { title: "1. Originator capture", required: true, checks: [
        "Capture name, account / wallet, address, and ID number for originator on transfers >= USD 1,000",
        "Capture beneficiary name and account / wallet",
        "Apply IVMS-101 schema for transmission",
      ]},
      { title: "2. Transmission protocol", required: true, checks: [
        "Use a Travel Rule protocol (TRP, Sygna, Notabene, OpenVASP) for delivery",
        "Authenticate counterparty VASP before transmission",
        "Encrypt payloads in transit and at rest",
      ]},
      { title: "3. Sunrise gap handling", required: true, checks: [
        "Hold or reject transfers to counterparties unable to receive Travel Rule data",
        "Document any sunrise-period exceptions with senior approval",
        "Refresh counterparty Travel Rule status quarterly",
      ]},
    ],
  },
  {
    id: "fatca-crs-onboarding",
    title: "FATCA / CRS — Onboarding & Reporting",
    typology: "fatca-crs-onboarding",
    family: "CDD",
    steps: [
      { title: "1. Tax-residency capture", required: true, checks: [
        "Collect self-certification covering all tax-residency jurisdictions",
        "Capture US-person indicia (FATCA W-9 / W-8BEN)",
        "Reconcile self-certification against CDD and KYC evidence",
      ]},
      { title: "2. Reporting", required: true, checks: [
        "Identify reportable accounts under FATCA / CRS",
        "Submit annual XML returns within FTA deadline",
        "Reconcile reported balances to ledger at the cut-off date",
      ]},
      { title: "3. Curing & remediation", required: true, checks: [
        "Cure documentation gaps within statutory window",
        "Apply withholding where required (FATCA recalcitrant)",
        "Track remediation actions with owners and deadlines",
      ]},
    ],
  },
  {
    id: "wolfsberg-cbddq",
    title: "Wolfsberg CBDDQ — Respondent Onboarding",
    typology: "wolfsberg-cbddq",
    family: "banking",
    steps: [
      { title: "1. Questionnaire collection", required: true, checks: [
        "Obtain a current Wolfsberg CBDDQ from the respondent",
        "Confirm signatory authority and date within 12 months",
        "Reconcile responses with public regulator and adverse-media data",
      ]},
      { title: "2. Risk assessment", required: true, checks: [
        "Score the respondent across geography, business, customers, and controls",
        "Document gaps and any compensating controls",
        "Set ongoing monitoring frequency",
      ]},
      { title: "3. Approval & maintenance", required: true, checks: [
        "Obtain senior-management approval for the relationship",
        "Refresh CBDDQ annually or on material change",
        "Test sample respondent transactions quarterly",
      ]},
    ],
  },
  {
    id: "stable-coin-issuance-cdd",
    title: "Stablecoin Issuance — Reserve & CDD",
    typology: "stable-coin-issuance-cdd",
    family: "VASP",
    steps: [
      { title: "1. Reserve verification", required: true, checks: [
        "Confirm 1:1 reserve composition with auditable attestations",
        "Map reserve custodians and their licensing",
        "Verify segregation from issuer operating funds",
      ]},
      { title: "2. Mint / redeem CDD", required: true, checks: [
        "Apply CDD on mint and redeem counterparties",
        "Run on-chain analytics for sanctioned wallet exposure",
        "Decline mint / redeem where Travel Rule data is missing",
      ]},
      { title: "3. Resilience & reporting", required: true, checks: [
        "Operate run / depeg playbooks with regulator notification thresholds",
        "Publish monthly reserve attestation",
        "Coordinate with VARA on incident reporting",
      ]},
    ],
  },
  {
    id: "defi-protocol-exposure-v2",
    title: "DeFi Protocol — Exposure Assessment",
    typology: "defi-protocol-exposure-v2",
    family: "VASP",
    steps: [
      { title: "1. Protocol scoping", required: true, checks: [
        "Map smart contract addresses, governance arrangement, and key dependencies",
        "Identify potential FATF VASP characterisation",
        "Capture audit and bug-bounty status",
      ]},
      { title: "2. Customer exposure", required: true, checks: [
        "Run on-chain analytics on customer wallets interacting with the protocol",
        "Apply elevated EDD where exposure is material",
        "Decline exposure to mixers and sanctioned protocols",
      ]},
      { title: "3. Ongoing monitoring", required: true, checks: [
        "Monitor protocol governance changes and exploits",
        "Refresh wallet-cluster intel from chain-analytics vendor",
        "Notify Compliance on any mass de-pegging / drain event",
      ]},
    ],
  },
  {
    id: "aml-board-mi-pack",
    title: "Board AML Management-Information Pack",
    typology: "aml-board-mi-pack",
    family: "Risk",
    steps: [
      { title: "1. KPI compilation", required: true, checks: [
        "Compile CDD completion, EDD turnaround, STR filings, freeze events, training completion",
        "Benchmark against prior period and committed targets",
        "Highlight regulatory updates and inspection findings",
      ]},
      { title: "2. Risk overlay", required: true, checks: [
        "Provide top-10 inherent and residual risk indicators",
        "Surface emerging-risk briefings (FATF plenary, EOCN updates, sanctions changes)",
        "Capture material customer / portfolio risk shifts",
      ]},
      { title: "3. Decision asks", required: true, checks: [
        "Present clear decision asks: policy approvals, budget, exits, training",
        "Track Board decisions and follow-ups in a register",
        "Distribute pack within 5 business days of meeting",
      ]},
    ],
  },
  {
    id: "regulator-inspection-readiness",
    title: "Regulator Inspection — Readiness",
    typology: "regulator-inspection-readiness",
    family: "Risk",
    steps: [
      { title: "1. Document pack", required: true, checks: [
        "Pre-stage policy stack, NRA, EWRA, training records, and inspection-history letters",
        "Index sample CDD, EDD, STR, freeze, and audit-chain records",
        "Verify retention completeness against retention schedule",
      ]},
      { title: "2. People prep", required: true, checks: [
        "Brief MLRO, Deputy MLRO, business heads on inspection scope",
        "Run a mock interview drill",
        "Designate a single inspection-coordinator role",
      ]},
      { title: "3. Live inspection support", required: true, checks: [
        "Provide a clean room and named SMEs for the inspection team",
        "Track every information request to a response within SLA",
        "Capture inspection findings and route to remediation immediately",
      ]},
    ],
  },
  {
    id: "ewra-annual",
    title: "Enterprise-Wide Risk Assessment (Annual)",
    typology: "ewra-annual",
    family: "Risk",
    steps: [
      { title: "1. Inherent-risk scoring", required: true, checks: [
        "Score by geography, customer mix, products, channels, transaction volume",
        "Anchor methodology to UAE NRA and FATF risk-based-approach guidance",
        "Document data sources and assumptions",
      ]},
      { title: "2. Control effectiveness", required: true, checks: [
        "Assess design and operating effectiveness of all AML / CFT controls",
        "Reconcile to internal-audit findings and regulator inspection letters",
        "Identify control gaps and overlaps",
      ]},
      { title: "3. Residual risk & strategy", required: true, checks: [
        "Compute residual-risk score per business line and customer segment",
        "Capture remediation roadmap with owners and deadlines",
        "Approve EWRA at Board level and refresh annually",
      ]},
    ],
  },
  {
    id: "diamond-cibjo-blue-book",
    title: "Diamond — CIBJO Blue Book Compliance",
    typology: "diamond-cibjo-blue-book",
    family: "DPMS",
    steps: [
      { title: "1. Disclosure standards", required: true, checks: [
        "Apply CIBJO Diamond Blue Book disclosure to natural / lab-grown / treated",
        "Capture origin and treatment per the Blue Book",
        "Verify lab certification authenticity (GIA / IGI / HRD)",
      ]},
      { title: "2. Kimberley & sanctions", required: true, checks: [
        "Apply Kimberley Process certification to rough diamonds",
        "Cross-check sanctions exposure on Russian-origin polished",
        "Capture chain-of-custody to mine or recycled source",
      ]},
      { title: "3. AML touchpoints", required: true, checks: [
        "Apply DPMS CDD on cash transactions >= AED 55,000",
        "Capture buyer business profile and source-of-funds",
        "File DPMSR / STR where indicators arise",
      ]},
    ],
  },
  {
    id: "esg-disclosure-tcfd",
    title: "ESG Disclosure — TCFD-Aligned",
    typology: "esg-disclosure-tcfd",
    family: "OECD",
    steps: [
      { title: "1. Governance & strategy", required: true, checks: [
        "Document board oversight of climate-related risks and opportunities",
        "Map climate scenarios across short / medium / long term",
        "Identify financial impact pathways",
      ]},
      { title: "2. Risk management", required: true, checks: [
        "Integrate climate risk into the EWRA",
        "Capture transition and physical-risk metrics",
        "Set Scope 1 / 2 / 3 emissions baseline and reduction targets",
      ]},
      { title: "3. Metrics & disclosure", required: true, checks: [
        "Publish TCFD-aligned disclosures in the annual report",
        "Provide assurance on key metrics where required",
        "Refresh annually with year-on-year commentary",
      ]},
    ],
  },
  {
    id: "fdl-10-2025-art-15",
    title: "FDL 10/2025 Art.15 — MLRO Designation & Independence",
    typology: "fdl-10-2025-art-15",
    family: "FIU",
    steps: [
      { title: "1. Designation", required: true, checks: [
        "Notify CBUAE / MoE of MLRO designation within 30 days of appointment",
        "Confirm MLRO seniority, qualifications, and independence",
        "Document Deputy MLRO succession arrangement",
      ]},
      { title: "2. Authority & resourcing", required: true, checks: [
        "Define MLRO authorities including freeze, decline, and STR-filing decisions",
        "Allocate budget, staffing, tools, and external advisory access",
        "Provide direct reporting line to the Board / Audit Committee",
      ]},
      { title: "3. Performance & continuity", required: true, checks: [
        "Run annual performance review against MLRO mandate KPIs",
        "Track CPD hours and external accreditation",
        "Document handover protocol on departure or extended absence",
      ]},
    ],
  },
  {
    id: "nft-money-laundering",
    title: "NFT & Digital Art Money Laundering",
    typology: "nft_ml",
    family: "VASP",
    description: "NFTs enable wash trading and value laundering through the subjective pricing of digital art. A criminal buys their own NFT through a controlled wallet at an artificially high price, creating apparent profit from illicit funds. FATF Guidance on Virtual Assets (2021, updated 2023) classifies NFT platforms as VASPs where used for investment. UAE CBUAE requires VASP registration for NFT marketplaces facilitating value transfer.",
    citations: ["FATF VASP Guidance 2023 §38-42", "UAE CBUAE VASP Framework 2023", "FATF R.15 (New technologies)", "FinCEN FIN-2019-G001"],
    steps: [
      {
        title: "1. Platform & counterparty classification",
        required: true,
        checks: [
          "Determine if NFT platform is regulated as a VASP in relevant jurisdiction",
          "Identify if NFT is primarily used for investment/speculation (VASP trigger) vs. consumable item",
          "Screen platform operator against sanctions/adverse media databases",
          "Verify KYC standards of the NFT marketplace used by customer",
        ],
      },
      {
        title: "2. Wash trading detection",
        required: true,
        checks: [
          "Identify circular transactions: customer sells NFT to wallet they control",
          "Check if buyer/seller share same wallet cluster or IP address",
          "Review price against comparable NFT sales on same platform",
          "Flag same NFT traded >3 times within 30 days between related wallets",
        ],
      },
      {
        title: "3. Source of funds for high-value NFTs",
        required: true,
        checks: [
          "Obtain SoF declaration for NFT purchases >AED 100,000 equivalent",
          "Verify fiat or crypto origin is documented",
          "Check on-chain history of crypto used — run blockchain analytics",
          "Cross-reference purchase price against customer's declared income/assets",
        ],
      },
      {
        title: "4. Suspicious activity indicators",
        required: false,
        checks: [
          "Celebrity or influencer promotion immediately preceding purchase",
          "Rapid resale at >200% profit within 7 days",
          "Buyer and seller in same geographic location / known associates",
          "Payment in privacy coins (Monero, Zcash) converted for NFT purchase",
        ],
      },
    ],
  },
  {
    id: "crypto-mining-proceeds",
    title: "Cryptocurrency Mining Proceeds",
    typology: "crypto_mining",
    family: "VASP",
    description: "Mining rewards represent legitimately created cryptocurrency but can be used to layer proceeds from other crimes by commingling with mining rewards. Mining operations in high-risk or sanctioned jurisdictions (Iran, DPRK, Russia) may be subject to OFAC and UN sanctions. FATF Guidance clarifies miners are not VASPs but exchangers and custodians receiving mining proceeds are.",
    citations: ["FATF VASP Guidance 2023 §28", "OFAC Virtual Currency Compliance 2021", "UAE CBUAE VASP Circular 2023"],
    steps: [
      {
        title: "1. Mining operation verification",
        required: true,
        checks: [
          "Obtain proof of mining operation: mining pool statements, hardware invoices, electricity contracts",
          "Verify jurisdiction of mining hardware — flag any DPRK, Iran, Russia, Belarus nexus",
          "Screen mining pool operator name against sanctions lists",
          "Obtain wallet address used for mining payouts for blockchain analytics",
        ],
      },
      {
        title: "2. Blockchain analytics on mining wallet",
        required: true,
        checks: [
          "Run CHAINALYSIS / Elliptic / TRM on mining reward wallet",
          "Check for commingling with high-risk counterparties (darknet markets, ransomware wallets)",
          "Verify mining pool payouts are consistent with declared hashrate",
          "Flag anomalous spikes in reward frequency inconsistent with declared hardware",
        ],
      },
      {
        title: "3. Source of wealth for mining infrastructure",
        required: false,
        checks: [
          "Obtain SoW explanation for initial mining hardware investment",
          "Verify electricity costs are plausible for claimed hashrate",
          "Cross-check declared mining income against on-chain payout history",
        ],
      },
    ],
  },
  {
    id: "carbon-credit-fraud",
    title: "Carbon Credit & ESG Fraud",
    typology: "carbon_fraud",
    family: "Fraud",
    description: "Voluntary carbon markets are largely unregulated, creating opportunities for fraudulent credit generation, double-counting, and proceeds laundering through green investment vehicles. FATF has flagged carbon markets as an emerging ML vulnerability. The OECD Due Diligence Guidance and ICVCM Core Carbon Principles provide the key standards. UAE companies with net-zero commitments are exposed through carbon offset procurement.",
    citations: ["FATF Emerging ML/TF Risks 2023", "ICVCM Core Carbon Principles 2023", "OECD RBC Guidance", "EU Carbon Border Adjustment Mechanism"],
    steps: [
      {
        title: "1. Carbon registry verification",
        required: true,
        checks: [
          "Verify credits registered on recognised registry: Verra VCS, Gold Standard, American Carbon Registry",
          "Check serial numbers for double-counting against registry public records",
          "Confirm project developer identity and registration status",
          "Screen project developer against sanctions / adverse media",
        ],
      },
      {
        title: "2. Project integrity checks",
        required: true,
        checks: [
          "Verify project validation by accredited third-party auditor (e.g. SCS Global, Bureau Veritas)",
          "Check project is not in sanctioned or CAHRA jurisdiction without appropriate controls",
          "Confirm land tenure documentation is genuine and not subject to dispute",
          "Review vintage year — old pre-2015 credits have lower credibility",
        ],
      },
      {
        title: "3. Financial flows",
        required: true,
        checks: [
          "Identify intermediary brokers — more than 2 intermediaries is a red flag",
          "Verify payment flows match contracted carbon price (current market: USD 5-20/tonne)",
          "Flag payments through shell companies in secrecy jurisdictions",
          "Obtain evidence of retirement (permanent cancellation) of credits on registry",
        ],
      },
    ],
  },
  {
    id: "deepfake-identity-fraud",
    title: "Deepfake & Synthetic Identity Fraud",
    typology: "synthetic_id_v2",
    family: "Fraud",
    description: "AI-generated deepfakes now defeat many biometric liveness checks used for remote KYC. Synthetic identities combine real data (e.g. genuine passport + AI-generated face) with fabricated attributes to create fraudulent identities that pass automated screening. FATF identifies AI-enabled fraud as a priority emerging risk. UAE CBUAE requires liveness verification meeting ISO/IEC 30107-3 PAD Level 2 for high-risk onboarding.",
    citations: ["FATF Digital Identity Guidance 2023", "UAE CBUAE Digital Onboarding Standards 2022", "ISO/IEC 30107-3 Presentation Attack Detection", "NIST SP 800-63B Digital Identity Guidelines"],
    steps: [
      {
        title: "1. Document authentication",
        required: true,
        checks: [
          "Run document through certified forensic verification (Onfido, Jumio, iProov) — not manual check alone",
          "Check MRZ consistency with visual zone",
          "Verify chip data via NFC read for e-Passport",
          "Cross-reference against INTERPOL Stolen and Lost Travel Documents (SLTD) database",
        ],
      },
      {
        title: "2. Liveness and biometric check",
        required: true,
        checks: [
          "Require active liveness challenge (not just passive selfie) meeting PAD Level 2",
          "Check for pixel-level GAN artifacts using deepfake detection tool",
          "Verify face match score ≥95% against document photo",
          "Flag if device used for onboarding has been flagged in fraud database",
        ],
      },
      {
        title: "3. Data consistency checks",
        required: true,
        checks: [
          "Cross-check name/DOB/address against credit bureau or government database",
          "Verify email domain age — new domains (< 30 days) associated with synthetic IDs",
          "Check phone number — VoIP numbers without carrier history are a red flag",
          "Review IP geolocation against stated address jurisdiction",
        ],
      },
      {
        title: "4. Behavioural red flags",
        required: false,
        checks: [
          "Unusually fast form completion (automated bot filling)",
          "Multiple onboarding attempts with slight name/date variations",
          "Device fingerprint matches previously rejected application",
          "Customer refuses video call verification request",
        ],
      },
    ],
  },
  {
    id: "gold-free-zone-smuggling",
    title: "Gold Smuggling via UAE Free Zones",
    typology: "gold_smuggling",
    family: "DPMS",
    description: "UAE Free Zones (DMCC, Dubai South, JAFZA) offer logistical advantages exploited for gold smuggling — undeclared imports from CAHRA jurisdictions, re-labelling of conflict gold as UAE-origin, and circular trade to artificially create provenance documentation. EOCN and UAE MoE mandate full chain-of-custody documentation. LBMA RGG Step 4 requires country-of-origin verification. The FATF DPMS Guidance (2023) specifically flags UAE Free Zones.",
    citations: ["FATF DPMS Guidance 2023 §5.2", "EOCN Supply Chain Policy", "LBMA RGG v9 Step-4", "UAE MoE DPMS Circular 2/2024", "UN Panel of Experts (CAR, DRC, Sudan)"],
    steps: [
      {
        title: "1. Country-of-origin verification",
        required: true,
        checks: [
          "Obtain smelter/refiner certificate of origin — LBMA Good Delivery or equivalent",
          "Cross-reference stated origin against UN Panel of Experts CAHRA list",
          "Verify refiner is on LBMA, RJC, or RMAP approved smelter list",
          "Obtain assay certificate from independent laboratory",
        ],
      },
      {
        title: "2. Free Zone import documentation",
        required: true,
        checks: [
          "Obtain Dubai Customs import declaration (HS code 7108.12.00 for non-monetary gold)",
          "Verify declared weight matches physical assay and transport manifest",
          "Cross-check consignor identity against Free Zone registered entities",
          "Confirm DMCC/JAFZA trade licence is valid for gold dealing",
        ],
      },
      {
        title: "3. Re-labelling and re-branding detection",
        required: true,
        checks: [
          "Check if bar serial numbers match hallmarks from claimed refinery",
          "Verify brand stamp against official refinery hallmark database",
          "Flag bars without XRF or fire assay certificate",
          "Confirm no prior import by same consignor under different HS code",
        ],
      },
      {
        title: "4. Circular trade pattern detection",
        required: false,
        checks: [
          "Track if same gold (by weight/assay) appears in multiple import records",
          "Flag round-trip trades: exported and re-imported within 90 days",
          "Check if importer and exporter share common UBO or director",
          "Verify final buyer is not in the same jurisdiction as original exporter",
        ],
      },
    ],
  },
  {
    id: "terrorist-financing-charity",
    title: "Terrorist Financing via Charities & NPOs",
    typology: "tf_charity",
    family: "CFT",
    description: "Non-profit organizations are exploited for terrorist financing through diversion of legitimate donations, commingling with illicit funds, and use of NPO infrastructure to move funds to conflict zones. FATF R.8 (Non-profit organisations) requires risk-based supervision. UAE Cabinet Resolution 74/2020 established a comprehensive NPO oversight framework. UAE Executive Office (EOCN) maintains a Terrorist Financing watch list for NPOs.",
    citations: ["FATF R.8 (Non-profit organisations)", "UAE Cabinet Resolution 74/2020 Art.17", "EOCN TFS Framework", "UN Security Council 1373 (2001)", "FATF Best Practices on NPOs 2023"],
    steps: [
      {
        title: "1. NPO registration and legitimacy check",
        required: true,
        checks: [
          "Verify registration with UAE Ministry of Community Development (MoCD) or equivalent regulator",
          "Screen NPO name, directors, and beneficiaries against UNSCR 1267, 1373, and EOCN lists",
          "Obtain audited financial statements for last 3 years",
          "Confirm operating charter — stated purpose must match actual activities",
        ],
      },
      {
        title: "2. Fund flows and geographic exposure",
        required: true,
        checks: [
          "Map all jurisdictions where NPO operates or sends funds",
          "Identify any nexus to conflict zones: Syria, Yemen, Somalia, Afghanistan, Libya",
          "Verify that fund remittances are through regulated banking channels, not informal hawala",
          "Check if NPO receives funds from anonymous sources above AED 5,000",
        ],
      },
      {
        title: "3. Beneficiary verification",
        required: true,
        checks: [
          "Identify ultimate beneficiaries of charitable distributions",
          "Screen beneficiary organizations against OFAC, UN, EU, UAE TFS lists",
          "Verify aid delivery documentation (photos, receipts, registration) for in-kind distributions",
          "Confirm no designated entities serve as distribution partners",
        ],
      },
      {
        title: "4. Ongoing monitoring",
        required: false,
        checks: [
          "Annual re-screening of all directors and key personnel",
          "Quarterly review of incoming donations > AED 50,000",
          "Flag sudden spikes in donation volumes not linked to documented campaigns",
          "File STR if any TF suspicion — zero tolerance per FATF R.8",
        ],
      },
    ],
  },
  {
    id: "luxury-real-estate-dubai",
    title: "Luxury Real Estate — Dubai ML Risk",
    typology: "luxury_reml",
    family: "REML",
    description: "Dubai's real estate market is a globally recognized ML vulnerability. FATF Mutual Evaluation Report (UAE, 2020) identified real estate as the highest-risk sector. Off-plan purchases, cash transactions, nominee purchasers, and rapid flip cycles are key red flags. UAE MoE registration for DNFBP real estate brokers is mandatory. FDL 10/2025 Art.22 requires real estate brokers to perform full CDD on all parties.",
    citations: ["FATF MER UAE 2020 §§5.3-5.4", "UAE FDL 10/2025 Art.22", "UAE MoE Real Estate DNFBP Registration", "CBUAE AML/CFT Guidelines §7", "Global Witness UAE Real Estate Report 2022"],
    steps: [
      {
        title: "1. Buyer identity and source of funds",
        required: true,
        checks: [
          "Full KYC on buyer: Emirates ID / passport, utility bill, TIN",
          "Screen buyer against all sanctions and PEP lists",
          "Obtain SoF declaration: salary records, business ownership, investment portfolio",
          "For cash purchases: mandatory STR if >AED 55,000 cash component",
        ],
      },
      {
        title: "2. Beneficial owner identification",
        required: true,
        checks: [
          "Identify UBO for any corporate purchaser — go through all layers to natural person",
          "Flag nominee arrangements: third party paying on behalf of named buyer",
          "Verify that UBO is consistent with declared SoW",
          "For purchases through offshore structures: enhanced due diligence mandatory",
        ],
      },
      {
        title: "3. Transaction structure red flags",
        required: true,
        checks: [
          "Rapid flip: re-sale within 12 months of purchase at significant premium",
          "All-cash purchase by foreign national from high-risk jurisdiction without explained SoF",
          "Multiple purchases by same buyer / UBO within 90 days",
          "Use of real estate escrow to receive funds from multiple unrelated parties",
        ],
      },
      {
        title: "4. Developer and intermediary checks",
        required: false,
        checks: [
          "Verify developer is registered with Dubai Land Department (DLD) / RERA",
          "Screen all intermediary agents and brokers (RERA licenced?)",
          "Check if developer accepts cryptocurrency payments — enhanced monitoring required",
          "Obtain copy of SPA and verify payment terms are consistent with banking records",
        ],
      },
    ],
  },
  {
    id: "darknet-proceeds",
    title: "Darknet Marketplace Proceeds",
    typology: "darknet",
    family: "ML",
    description: "Darknet markets operate on Tor/I2P networks accepting cryptocurrency for illegal goods (narcotics, firearms, stolen data, counterfeit documents). Exit scams, seizures, and migration between markets create complex on-chain trails. Proceeds are typically laundered via crypto mixers, chain-hopping, and DeFi protocols before fiat conversion. FATF has flagged darknet-linked wallets as requiring mandatory STR filing.",
    citations: ["FATF Guidance on Virtual Assets 2021 §§76-82", "OFAC Darknet Advisory 2020", "FinCEN FIN-2019-A003", "Europol IOCTA 2023"],
    steps: [
      {
        title: "1. Blockchain analytics — wallet risk scoring",
        required: true,
        checks: [
          "Run CHAINALYSIS Reactor / Elliptic / TRM Labs on customer's declared wallets",
          "Flag any direct or indirect exposure to known darknet market wallets (Hydra, AlphaBay, etc.)",
          "Check for mixer / tumbler usage in transaction history",
          "Identify chain-hopping: Bitcoin → Monero → Ethereum as laundering indicator",
        ],
      },
      {
        title: "2. Customer profile anomalies",
        required: true,
        checks: [
          "Unexplained cryptocurrency wealth inconsistent with stated occupation",
          "Customer mentions Tor browser, privacy coins, or peer-to-peer exchanges unprompted",
          "Transactions at unusual hours (3-6 AM) consistent with international darknet trading",
          "Multiple small deposits just below reporting thresholds (structuring)",
        ],
      },
      {
        title: "3. Suspicious transaction patterns",
        required: true,
        checks: [
          "Immediate conversion of crypto to fiat after receipt",
          "Unusual geographic footprint: Tor exit nodes, VPN usage identified by IP analysis",
          "Peer-to-peer exchange usage (LocalBitcoins, Paxful) to avoid KYC",
          "Gift card purchases with crypto — common darknet cross-laundering method",
        ],
      },
      {
        title: "4. Reporting obligations",
        required: true,
        checks: [
          "File STR via goAML within 35 days if darknet exposure suspected — zero tolerance",
          "Do not tip off customer during investigation",
          "Preserve all blockchain analytics reports and on-chain evidence",
          "Escalate to MLRO for account freeze consideration",
        ],
      },
    ],
  },
  {
    id: "romance-scam-proceeds",
    title: "Romance Scam / Pig-Butchering Proceeds",
    typology: "romance_ml",
    family: "Fraud",
    description: "Romance scams involve criminals building fake emotional relationships online to convince victims to invest in fraudulent crypto schemes ('pig butchering') or send direct funds. The UAE is both a victim and transit jurisdiction. Proceeds are rapidly moved through multiple crypto wallets and exchange accounts before fiat conversion. FATF Guidance (2023) identifies romance scams as a major crypto-linked fraud typology.",
    citations: ["FATF Crypto Crime Guidance 2023", "UAE MoI Cybercrime warnings 2023", "FIU goAML Typology 12 (Romance fraud)", "Europol IOCTA 2023 §4.2"],
    steps: [
      {
        title: "1. Identify mule or direct victim scenario",
        required: true,
        checks: [
          "Determine if customer is victim (unwitting) or money mule (witting/semi-witting)",
          "Interview customer to understand origin of funds — look for 'investment platform' mentioned",
          "Check for use of crypto platforms marketed as high-yield investments",
          "Verify if customer has been contacted by UAE Cybercrime Unit or filed a police report",
        ],
      },
      {
        title: "2. Transaction pattern analysis",
        required: true,
        checks: [
          "Rapid outgoing wire transfers to new/unfamiliar beneficiaries",
          "Cryptocurrency purchases shortly after receipt of large transfers from unknown sources",
          "Sending funds to crypto exchanges with poor KYC standards",
          "Multiple transfers to same ultimate destination through layered intermediaries",
        ],
      },
      {
        title: "3. Blockchain and counterparty analysis",
        required: true,
        checks: [
          "Run analytics on receiving crypto addresses — look for known fraud cluster exposure",
          "Check if receiving addresses are associated with OFAC-designated exchanges (Garantex, etc.)",
          "Identify convergence of funds from multiple victims at same wallet address",
          "Map destination platform's jurisdiction and KYC standards",
        ],
      },
      {
        title: "4. Action and reporting",
        required: true,
        checks: [
          "File STR via goAML within 35 days — both victim and mule scenarios require reporting",
          "Consider account freeze for mule accounts holding un-transferred funds",
          "Refer victim to UAE cybercrime portal: cybercrime.gov.ae",
          "Coordinate with correspondent banks to recall wire transfers where possible",
        ],
      },
    ],
  },
  {
    id: "sports-betting-ml",
    title: "Sports Betting & Match Fixing ML",
    typology: "sports_betting",
    family: "ML",
    description: "Sports betting accounts are used to layer proceeds by placing bets on both outcomes of an event, deliberately losing a portion to convert illicit funds into 'winnings'. Match fixing syndicates additionally corrupt athletes to control outcomes, generating large betting profits. Offshore gambling platforms without UAE licences are not permitted but are accessed by UAE residents. FDL 10/2025 covers gambling as a designated predicate offence.",
    citations: ["UAE FDL 10/2025 Art.2 (Predicate offences)", "FATF Guidance on Gambling 2023", "Council of Europe MEDICRIME Convention", "UNODC Sports Integrity Toolkit"],
    steps: [
      {
        title: "1. Gambling platform legitimacy",
        required: true,
        checks: [
          "Verify if platform holds a valid UAE or recognised international gambling licence",
          "Check if platform is on UAE TRA blocked list",
          "Confirm platform has KYC and AML controls — obtain their compliance certificate",
          "Screen platform operator against sanctions lists",
        ],
      },
      {
        title: "2. Bet-on-both-sides pattern detection",
        required: true,
        checks: [
          "Identify customer placing large offsetting bets on same event at different platforms",
          "Check if net payout is inconsistent with any genuine gambling motivation",
          "Flag accounts receiving large winnings transfers from multiple gambling platforms",
          "Review frequency of play: laundering accounts typically have few large bets, not many small ones",
        ],
      },
      {
        title: "3. Fund flows",
        required: true,
        checks: [
          "Verify source of betting deposits — are they from known, clean accounts?",
          "Check if winnings are immediately withdrawn and transferred",
          "Flag winnings converted to crypto or foreign currency immediately after receipt",
          "Identify any involvement of professional sports agents or club officials",
        ],
      },
    ],
  },
  {
    id: "immigration-fraud-ml",
    title: "Immigration & Document Fraud Proceeds",
    typology: "immigration_fraud",
    family: "Fraud",
    description: "Immigration fraud — forged visas, fake degrees, ghost employment schemes — generates significant criminal proceeds. UAE's status as a global migration hub makes it a target for document fraud networks. Proceeds are typically laundered through informal money transfer, hawala, and real estate. FDL 10/2025 identifies fraud and forgery as predicate offences requiring STR filing on suspicion.",
    citations: ["UAE FDL 10/2025 Art.2 (Predicate offences)", "INTERPOL Human Trafficking notices", "IOM Migrant Vulnerability Report 2023", "UAE Cabinet Resolution 38/2022 (human trafficking)"],
    steps: [
      {
        title: "1. Document authenticity verification",
        required: true,
        checks: [
          "Verify employment contracts against UAE Ministry of Human Resources (MOHRE) records",
          "Check educational certificates through UAE MOHESR attestation database",
          "Confirm visa status through ICA eVisa portal",
          "Screen employer sponsoring the visa against company registry and sanctions lists",
        ],
      },
      {
        title: "2. Red flags for ghost employment",
        required: true,
        checks: [
          "Employer payroll significantly above declared company revenue",
          "Multiple unrelated individuals with same employer and same residential address",
          "Salary received but immediately transferred to unknown third-party accounts",
          "No consistent work-related expenses (transport, meals) for stated profession",
        ],
      },
      {
        title: "3. Proceeds detection",
        required: false,
        checks: [
          "Remittance to home country inconsistent with declared salary",
          "Cash withdrawals matching common fee structure for document fraud rings",
          "Transactions with known manpower agencies flagged in adverse media",
          "Multiple salary sources from shell companies sharing same address",
        ],
      },
    ],
  },
  {
    id: "tax-evasion-crypto",
    title: "Tax Evasion via Cryptocurrency",
    typology: "tax_crypto",
    family: "ML",
    description: "Cryptocurrency is used to conceal income and assets from tax authorities through undisclosed exchange accounts in non-reporting jurisdictions, staking and mining income not declared, and crypto-to-crypto swaps that reset cost basis. OECD Crypto-Asset Reporting Framework (CARF) requires crypto exchanges to report to tax authorities from 2027. UAE introduced corporate tax in 2023 and exchanges must cooperate with FTA on request.",
    citations: ["OECD CARF Framework 2022", "UAE Federal Corporate Tax Law 2023", "UAE FTA Circular on Crypto 2023", "FATF R.3 (Tax crimes as predicate offence)", "Common Reporting Standard (CRS)"],
    steps: [
      {
        title: "1. Cross-reference declared income vs. crypto wealth",
        required: true,
        checks: [
          "Compare on-chain crypto holdings/transactions against customer's declared income",
          "Check for undisclosed exchange accounts via transaction analysis",
          "Identify if customer holds crypto in non-CRS jurisdictions (e.g. Panama, UAE pre-2024)",
          "Review customer's tax residency claims vs. actual location data",
        ],
      },
      {
        title: "2. Unreported income patterns",
        required: true,
        checks: [
          "Mining income: large inflows from mining pool addresses not matched by declared mining business",
          "DeFi yield: staking rewards and liquidity pool income not consistent with declared investment profile",
          "P2P trading: high-volume peer-to-peer crypto trading without business registration",
          "NFT gains: significant NFT sale proceeds not declared as income",
        ],
      },
      {
        title: "3. Reporting obligations",
        required: false,
        checks: [
          "File STR if tax evasion is suspected and proceeds exceed AED 1,000,000",
          "Tax crimes are predicate ML offences under UAE FDL 10/2025 — STR obligation applies",
          "Coordinate with UAE FTA if formal voluntary disclosure process is initiated",
          "Maintain client file for 10 years per FDL 10/2025 Art.16",
        ],
      },
    ],
  },
  {
    id: "arms-embargo-evasion",
    title: "Arms Embargo Evasion",
    typology: "arms_embargo",
    family: "Sanctions",
    description: "Arms embargo evasion involves shipping dual-use goods, weapons components, or finished weapons to embargoed destinations through intermediary jurisdictions. UAE is a transit hub with significant re-export risk. UN Panel of Experts reports have documented UAE-nexus arms embargo violations (Sudan, Yemen, Libya, CAR). Export licence controls and end-use certification are mandatory. CBUAE requires financial institutions to screen trade finance for arms-related transactions.",
    citations: ["UNSCR 1970 (Libya)", "UNSCR 2216 (Yemen)", "UNSCR 2625 (CAR)", "EU Dual-Use Regulation 2021/821", "UAE Federal Law No. 13/2016 (Export Controls)", "FATF R.7 (Targeted financial sanctions)"],
    steps: [
      {
        title: "1. HS code and goods classification",
        required: true,
        checks: [
          "Classify goods under EU CCL / Wassenaar Arrangement Munitions List",
          "Check for ML/PF-sensitive dual-use categories: nuclear (Cat.0), military (Cat.ML), chemicals (Cat.1)",
          "Verify HS code matches physical goods description",
          "Obtain UAE Ministry of Economy export licence for controlled goods",
        ],
      },
      {
        title: "2. End-use and end-user certificate",
        required: true,
        checks: [
          "Obtain End-Use Certificate (EUC) signed by government official of receiving country",
          "Verify EUC issuing ministry exists and official is genuine",
          "Cross-reference against UN Panel of Experts reports for known diversion routes",
          "Screen end-user against OFAC, UN, EU arms embargo lists",
        ],
      },
      {
        title: "3. Transit and re-export risk",
        required: true,
        checks: [
          "Identify all transit countries — flag UAE Free Zone transit for embargoed goods",
          "Confirm final destination is not subject to an arms embargo",
          "Check shipping company and freight forwarder for previous violations",
          "Verify consignee is the stated end-user, not a broker/intermediary",
        ],
      },
      {
        title: "4. Financial controls",
        required: true,
        checks: [
          "Require letter of credit or verified wire from legitimate financial institution",
          "Flag cash or crypto payment for any arms/dual-use goods transaction",
          "Screen all parties to LC (applicant, beneficiary, issuing bank) against sanctions",
          "File OFAC notification if US-origin goods or USD payments involved",
        ],
      },
    ],
  },
  {
    id: "elder-financial-abuse",
    title: "Elder Financial Abuse & Exploitation",
    typology: "elder_abuse",
    family: "Fraud",
    description: "Financial abuse of elderly customers by family members, caregivers, or strangers is a growing AML/fraud concern. Sudden changes in account signatories, large cash withdrawals by third parties, and unusual spending patterns are key indicators. UAE Federal Law No. 2/2019 on the rights of elderly persons requires reporting mechanisms. FDL 10/2025 requires STR filing where funds are proceeds of exploitation.",
    citations: ["UAE Federal Law No. 2/2019 (Elderly persons)", "FATF Elder Financial Exploitation Guidance 2020", "UAE FDL 10/2025 Art.15", "CFPB Elder Financial Exploitation guidance 2019"],
    steps: [
      {
        title: "1. Account access change red flags",
        required: true,
        checks: [
          "New signatory added to elderly customer's account with no prior relationship",
          "Power of Attorney registered within last 30 days — verify it is genuine and witnessed",
          "Customer's contact information changed to a third party's details",
          "Large wire transfers to new beneficiaries shortly after POA registration",
        ],
      },
      {
        title: "2. Transaction pattern analysis",
        required: true,
        checks: [
          "Sudden increase in cash withdrawals from previously low-activity account",
          "Purchases inconsistent with customer's known lifestyle (luxury goods, gambling sites)",
          "Frequent transfers to 'lottery' or 'investment' accounts",
          "Third party withdrawing cash from customer's account at ATM (camera review)",
        ],
      },
      {
        title: "3. Welfare check and customer contact",
        required: true,
        checks: [
          "Conduct private welfare call to elderly customer — not in presence of suspected abuser",
          "Verify customer understands and consents to all large/unusual transactions",
          "Check if customer shows signs of cognitive decline or undue influence",
          "Consider referring to UAE Elder Protection Unit if abuse is suspected",
        ],
      },
      {
        title: "4. Reporting",
        required: false,
        checks: [
          "File STR if financial exploitation is suspected — exploitation proceeds are ML predicate",
          "Do not tip off suspected family member/carer",
          "Consider account restriction pending MLRO review",
          "Report to UAE social services if customer is at immediate risk",
        ],
      },
    ],
  },
  {
    id: "insurance-premium-laundering",
    title: "Insurance Premium Laundering",
    typology: "insurance_ml",
    family: "ML",
    description: "Insurance products are used for ML via overpayment of premiums followed by early redemption (receiving 'clean' refund cheque), fictitious claims, and purchase of single-premium investment products. FATF R.26 requires insurance companies to implement AML controls. UAE Insurance Authority (now CBUAE) guidelines require CDD on all single-premium life policies and early surrender monitoring.",
    citations: ["FATF R.26 (Regulation of financial institutions)", "UAE CBUAE Insurance Circular 15/2022", "UAE FDL 10/2025 Art.8", "Wolfsberg Insurance Principles 2019"],
    steps: [
      {
        title: "1. Single-premium policy risk assessment",
        required: true,
        checks: [
          "Obtain SoF documentation for all single-premium payments >AED 100,000",
          "Screen policyholder and beneficiary against all sanctions and PEP lists",
          "Verify premium source is from known, disclosed banking account",
          "Flag if customer requests immediate assignment of policy to third party",
        ],
      },
      {
        title: "2. Early redemption / surrender monitoring",
        required: true,
        checks: [
          "Flag surrender requests within 12 months of policy inception",
          "Check if customer accepts surrender penalty without negotiation (ML indicator)",
          "Verify destination account for surrender proceeds is customer's own known account",
          "Document rationale for early redemption — medical emergency, etc.",
        ],
      },
      {
        title: "3. Claims fraud detection",
        required: false,
        checks: [
          "Verify claim documentation for authenticity: medical reports, police reports, receipts",
          "Check if claim amount appears pre-calculated to just exceed policy minimum",
          "Screen third-party beneficiaries of claims against sanctions and adverse media",
          "Flag repeat claims across multiple policies within 24 months",
        ],
      },
    ],
  },
  {
    id: "student-visa-fraud",
    title: "Student Visa / Academic Fraud Proceeds",
    typology: "student_fraud",
    family: "Fraud",
    description: "Ghost student schemes, fake universities, and diploma mills generate proceeds through visa fees, tuition payment fraud, and student loan proceeds in target countries. UAE institutions have been exploited as conduits for education-related proceeds. UAE MoE and MOHESR maintain approved institution lists. Fraudulent student accounts show salary-inconsistent spending patterns with tuition-related payments to unverified institutions.",
    citations: ["UAE MOHESR Approved Institutions Register", "UAE Cybercrime Law No. 34/2021 Art.16", "FATF Fraud Typologies 2023"],
    steps: [
      {
        title: "1. Institution legitimacy verification",
        required: true,
        checks: [
          "Verify university against MOHESR approved institutions list (for UAE-issued credentials)",
          "Cross-reference against known diploma mill lists (CHEA, Oregon diploma mill list)",
          "Check if tuition fees match known rates for the claimed institution",
          "Verify student's academic record is consistent with claimed institution",
        ],
      },
      {
        title: "2. Financial flow anomalies",
        required: true,
        checks: [
          "Tuition payments to institutions not on approved lists",
          "Large transfers from overseas parties described as 'family support' or 'scholarship'",
          "Student account receiving commercial-scale transfers inconsistent with study",
          "Immediate conversion of tuition refunds to cash or crypto",
        ],
      },
      {
        title: "3. Identity consistency",
        required: false,
        checks: [
          "Verify student ID against issuing university's alumni verification service",
          "Check employment records — full-time students should not hold full-time professional positions simultaneously",
          "Confirm visa status and study permit are valid for stated enrollment period",
        ],
      },
    ],
  },
  {
    id: "fractional-crypto-laundering",
    title: "Micro-Transaction Crypto Structuring",
    typology: "crypto_structuring",
    family: "VASP",
    description: "Criminals use automated scripts to break large crypto amounts into thousands of micro-transactions below reporting thresholds, distributing across multiple wallets before consolidation. This mirrors fiat structuring (smurfing) but is automated at scale. FATF Travel Rule applies to transfers above USD 1,000 — below this threshold micro-transactions are designed to avoid reporting. Advanced blockchain analytics can detect consolidation patterns.",
    citations: ["FATF Travel Rule Guidance 2019 (R.16)", "FinCEN Structuring Advisory 2019", "UAE CBUAE VASP AML Standards 2023", "FATF Guidance on Virtual Assets 2023 §§68-72"],
    steps: [
      {
        title: "1. Micro-transaction pattern detection",
        required: true,
        checks: [
          "Identify high-frequency small transfers (<USD 1,000 each) from single source over 24-hour period",
          "Check if aggregate of micro-transactions reaches reporting threshold within 7-day rolling window",
          "Flag automated transaction cadence: transactions at regular intervals (every 5 min, etc.)",
          "Run blockchain analytics to trace consolidation destination of micro-transactions",
        ],
      },
      {
        title: "2. Consolidation wallet analysis",
        required: true,
        checks: [
          "Identify the wallet(s) receiving consolidated funds from micro-transaction sources",
          "Screen consolidation wallet against known high-risk entity lists",
          "Check if consolidation wallet immediately converts to fiat or moves to mixer",
          "Verify customer's self-declared wallet addresses match observed on-chain activity",
        ],
      },
      {
        title: "3. Customer assessment",
        required: true,
        checks: [
          "Request explanation for micro-transaction pattern from customer",
          "Verify if automated trading strategy is documented and plausible",
          "Check if pattern is consistent with legitimate DCA (dollar-cost averaging) investment strategy",
          "File STR if structuring intent cannot be ruled out after customer explanation",
        ],
      },
    ],
  },
  {
    id: "public-procurement-fraud",
    title: "Public Procurement Fraud & Corruption",
    typology: "procurement_fraud",
    family: "ABC",
    description: "Public procurement fraud involves kickbacks, bid rigging, fictitious invoices, and inflated contracts between government contractors and complicit officials. Proceeds are laundered through shell company layers, real estate, and offshore accounts. FCPA, UK Bribery Act, and UAE FDL 10/2025 Art.2 all identify public corruption as a predicate offence. PEP-linked companies in government contracting require enhanced scrutiny.",
    citations: ["UAE FDL 10/2025 Art.2 (Corruption as predicate)", "FCPA (US)", "UK Bribery Act 2010 §6", "OECD Anti-Bribery Convention", "UNODC UN Convention Against Corruption Art.9"],
    steps: [
      {
        title: "1. PEP connection to government contracts",
        required: true,
        checks: [
          "Identify if customer's company holds government contracts in home or host jurisdiction",
          "Screen all directors and major shareholders against PEP databases",
          "Flag immediate family members of PEPs as beneficial owners of contracting entity",
          "Check if government contract value is consistent with company size and capability",
        ],
      },
      {
        title: "2. Suspicious payment structures",
        required: true,
        checks: [
          "Payments to 'consultants' or 'agents' without clear service description",
          "Large success fees to third parties shortly after contract award",
          "Payments routed through multiple offshore shell companies",
          "Invoices for services rendered in different jurisdiction from where contract was executed",
        ],
      },
      {
        title: "3. Red flags in contract execution",
        required: false,
        checks: [
          "Sole-source contracts without competitive tendering for large amounts",
          "Contract prices significantly above market benchmarks for same services",
          "No evidence of goods/services actually delivered despite payment",
          "Company with no track record winning large sophisticated government contracts",
        ],
      },
      {
        title: "4. Reporting obligations",
        required: true,
        checks: [
          "File STR via goAML if corruption/bribery suspected — mandatory under FDL 10/2025",
          "Escalate to MLRO for immediate review if public official (PEP) is the contracting party",
          "Preserve all contract documentation and payment records for 10 years",
          "Consider account restriction pending MLRO decision",
        ],
      },
    ],
  },
  {
    id: "medical-billing-fraud",
    title: "Healthcare & Medical Billing Fraud",
    typology: "medical_fraud",
    family: "Fraud",
    description: "Medical billing fraud involves fictitious patient claims, upcoding of procedures, phantom medical equipment, and kickbacks between providers and insurers. In UAE, DHA-licensed providers are the regulated sector. Insurance fraud proceeds are laundered through healthcare company accounts before distribution. FATF identifies healthcare fraud as a growing predicate ML offence.",
    citations: ["UAE Health Insurance Law (Dubai Law No. 11/2013)", "UAE DHA Provider Licensing", "FATF Fraud Typologies 2023", "UAE FDL 10/2025 Art.2 (Fraud as predicate)"],
    steps: [
      {
        title: "1. Provider legitimacy check",
        required: true,
        checks: [
          "Verify DHA / HAAD / DOH licence for medical facility or practitioner",
          "Screen provider entity and key personnel against sanctions and adverse media",
          "Check if provider has prior insurance fraud regulatory action",
          "Verify physical existence of clinic/hospital at registered address",
        ],
      },
      {
        title: "2. Billing pattern analysis",
        required: true,
        checks: [
          "Compare billing volume against physical capacity (patient throughput per day)",
          "Flag identical procedure codes billed for all patients on same date",
          "Identify upcoding: billing for complex procedures but facility lacks equipment",
          "Check for billing of phantom services: medications not in pharmacy stock records",
        ],
      },
      {
        title: "3. Financial flows",
        required: false,
        checks: [
          "Insurance reimbursements paid to account different from stated corporate account",
          "Large cash withdrawals from healthcare company accounts without documented patient receipts",
          "Transfers from healthcare company to unrelated entities (related-party transactions)",
          "Sudden spikes in insurance claims following management change",
        ],
      },
    ],
  },
  {
    id: "ai-vendor-assessment",
    title: "AI Vendor / Third-Party Assessment",
    typology: "ai-vendor-assessment",
    family: "ABC",
    steps: [
      { title: "1. Vendor due diligence", required: true, checks: [
        "Assess vendor track record, financial strength, and security certifications",
        "Verify model documentation, training-data provenance, and update cadence",
        "Identify sub-processors and country of data processing",
      ]},
      { title: "2. Contractual safeguards", required: true, checks: [
        "Lock in audit rights, model-change notification, and incident response",
        "Specify exit / portability obligations",
        "Restrict re-use of customer data for vendor-side training",
      ]},
      { title: "3. Ongoing oversight", required: true, checks: [
        "Run quarterly performance and bias monitoring on vendor outputs",
        "Refresh vendor due diligence annually",
        "Maintain a single-vendor concentration register at executive level",
      ]},
    ],
  },
];

const FAMILY_COLORS: Record<string, string> = {
  ML: "bg-red-dim text-red",
  PEP: "bg-violet-dim text-violet",
  banking: "bg-blue-dim text-blue",
  DPMS: "bg-amber-dim text-amber",
  PF: "bg-red-dim text-red",
  EOCN: "bg-green-dim text-green",
  VASP: "bg-blue-dim text-blue",
  UBO: "bg-violet-dim text-violet",
  REML: "bg-amber-dim text-amber",
  TF: "bg-amber-dim text-amber",
  Payments: "bg-blue-dim text-blue",
  MSB: "bg-green-dim text-green",
  ABC: "bg-violet-dim text-violet",
  "TF/ML": "bg-red-dim text-red",
  Fraud: "bg-red-dim text-red",
  CFT: "bg-red-dim text-red",
  Sanctions: "bg-red-dim text-red",
  CDD: "bg-blue-dim text-blue",
  Risk: "bg-amber-dim text-amber",
  MoE: "bg-green-dim text-green",
  FIU: "bg-violet-dim text-violet",
  OECD: "bg-green-dim text-green",
  "VASP/Fraud": "bg-red-dim text-red",
};

function getFamilyColor(family: string) {
  return FAMILY_COLORS[family] ?? "bg-bg-2 text-ink-2";
}

interface ScenarioSimulateResult {
  chapters: string[];
  redFlags: string[];
  actions: string[];
  regulatoryRefs: string[];
  recommendation: "File STR" | "Enhanced Due Diligence" | "Close Case" | "Escalate to MLRO";
  urgency: "immediate" | "24h" | "7d";
}

const URGENCY_TONE: Record<ScenarioSimulateResult["urgency"], { badge: string; label: string }> = {
  immediate: { badge: "bg-red text-white", label: "Immediate action required" },
  "24h": { badge: "bg-amber-dim text-amber border border-amber/40", label: "Action within 24 hours" },
  "7d": { badge: "bg-green-dim text-green border border-green/40", label: "Action within 7 days" },
};

const REC_TONE: Record<ScenarioSimulateResult["recommendation"], string> = {
  "File STR": "text-red",
  "Enhanced Due Diligence": "text-amber",
  "Close Case": "text-green",
  "Escalate to MLRO": "text-brand",
};

export default function PlaybookPage() {
  const [drawerOpen, setDrawerOpen] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState<{ answer: string; citations: string[]; confidence: number; relatedPlaybooks: string[] } | null>(null);
  const [qaLoading, setQaLoading] = useState(false);

  // Scenario Simulator state
  const [simScenario, setSimScenario] = useState("");
  const [simClientType, setSimClientType] = useState("Individual");
  const [simJurisdiction, setSimJurisdiction] = useState("UAE");
  const [simRiskLevel, setSimRiskLevel] = useState("Medium");
  const [simResult, setSimResult] = useState<ScenarioSimulateResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const runSimulator = async () => {
    if (!simScenario.trim()) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await fetch("/api/playbook/scenario-simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenario: simScenario,
          clientType: simClientType,
          jurisdiction: simJurisdiction,
          riskLevel: simRiskLevel,
        }),
      });
      if (res.ok) {
        const data = await res.json() as ScenarioSimulateResult;
        setSimResult(data);
      }
    } catch { /* silent */ }
    finally { setSimLoading(false); }
  };

  const pb = PLAYBOOKS.find((p) => p.id === drawerOpen) ?? null;

  const totalChecks = pb ? pb.steps.reduce((a, s) => a + s.checks.length, 0) : 0;
  const doneChecks = pb
    ? Object.entries(checked).filter(([k, v]) => v && k.startsWith(`${pb.id}:`)).length
    : 0;
  const pct = Math.round((doneChecks / Math.max(totalChecks, 1)) * 100);

  const toggle = (pbId: string, stepIdx: number, checkIdx: number) => {
    const k = `${pbId}:${stepIdx}:${checkIdx}`;
    setChecked((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const families = Array.from(new Set(PLAYBOOKS.map((p) => p.family))).sort();

  const filtered = PLAYBOOKS.filter((p) => {
    const matchSearch = !search.trim() || p.title.toLowerCase().includes(search.toLowerCase()) || p.family.toLowerCase().includes(search.toLowerCase()) || (p.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchFamily = familyFilter === "all" || p.family === familyFilter;
    return matchSearch && matchFamily;
  });

  const getProgress = (pbId: string, steps: Playbook["steps"]) => {
    const total = steps.reduce((a, s) => a + s.checks.length, 0);
    const done = Object.entries(checked).filter(([k, v]) => v && k.startsWith(`${pbId}:`)).length;
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  const askPlaybook = async () => {
    if (!qaQuestion.trim()) return;
    setQaLoading(true);
    try {
      const res = await fetch("/api/playbook-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: qaQuestion }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean; answer: string; citations: string[]; confidence: number; relatedPlaybooks: string[] };
      if (data.ok) setQaAnswer(data);
    } catch { /* silent */ }
    finally { setQaLoading(false); }
  };

  return (
    <ModuleLayout asanaModule="playbook" asanaLabel="Playbook">
      <ModuleHero
        moduleNumber={33}
        eyebrow="Module 16 · Guided due-diligence"
        title="Playbook"
        titleEm="engine."
        intro={
          <>
            <strong>One walk-through per typology.</strong> Pick a playbook,
            work through the mandated checks in order. The brain cites the
            specific FATF / LBMA / FDL articles behind each step so nothing
            gets skipped. Each required step generates an audit-chain entry.
          </>
        }
        kpis={[
          { value: String(PLAYBOOKS.length), label: "playbooks" },
          { value: String(PLAYBOOKS.reduce((a, p) => a + p.steps.reduce((b, s) => b + s.checks.length, 0), 0)), label: "total checks" },
          { value: String(Object.values(checked).filter(Boolean).length), label: "checks completed" },
          { value: String(families.length), label: "typology families" },
        ]}
      />

      {/* ── Scenario Simulator + Ask the Playbook (merged) ── */}
      <div className="mt-6 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-hair-2 bg-bg-1 flex items-center gap-3">
          <span className="text-14">🎯</span>
          <span className="text-13 font-semibold text-ink-0">Scenario Simulator</span>
          <span className="text-10 font-mono text-ink-3">AML scenario analysis</span>
          <span className="text-ink-3 text-12 mx-1">·</span>
          <span className="text-13 font-semibold text-ink-0">Ask the Playbook</span>
          <span className="text-10 font-mono text-ink-3">compliance Q&amp;A</span>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            value={simScenario}
            onChange={(e) => { setSimScenario(e.target.value); setQaQuestion(e.target.value); }}
            placeholder="Describe a scenario or ask a compliance question… e.g. 'A new corporate client from the UAE requests to wire USD 500,000 to a free-trade zone counterparty. The UBO is a government official from West Africa.' — or — 'What do I do if a customer is a Tier-1 PEP from a sanctioned country?'"
            rows={4}
            className="w-full text-12 px-3 py-2.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none leading-relaxed"
          />
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Client Type</label>
              <select
                value={simClientType}
                onChange={(e) => setSimClientType(e.target.value)}
                className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand"
              >
                <option>Individual</option>
                <option>Corporate</option>
                <option>PEP</option>
                <option>VASP</option>
                <option>DNFBP</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Jurisdiction</label>
              <select
                value={simJurisdiction}
                onChange={(e) => setSimJurisdiction(e.target.value)}
                className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand"
              >
                <option>UAE</option>
                <option>UK</option>
                <option>US</option>
                <option>SG</option>
                <option>Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Risk Level</label>
              <select
                value={simRiskLevel}
                onChange={(e) => setSimRiskLevel(e.target.value)}
                className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand"
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => { void runSimulator(); }}
              disabled={simLoading || !simScenario.trim()}
              className="text-12 font-semibold px-5 py-1.5 rounded bg-brand text-white border border-brand hover:bg-brand-hover hover:border-brand-hover disabled:opacity-40 transition-colors"
            >
              {simLoading ? "Analysing…" : "Simulate →"}
            </button>
            <button
              type="button"
              onClick={() => void askPlaybook()}
              disabled={qaLoading || !simScenario.trim()}
              className="text-12 font-semibold px-5 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40 transition-colors"
            >
              {qaLoading ? "Asking…" : "Ask"}
            </button>
            {(simResult || qaAnswer) && (
              <button type="button" onClick={() => { setSimResult(null); setQaAnswer(null); }} className="text-11 text-ink-3 hover:text-ink-1 px-2 py-1.5">Clear</button>
            )}
          </div>

          {simResult && (
            <div className="mt-4 space-y-4 border-t border-hair-2 pt-4">
              {/* Urgency + Recommendation */}
              <div className="flex items-start gap-3 flex-wrap">
                <span className={`font-mono text-10 font-semibold px-2.5 py-1 rounded uppercase ${URGENCY_TONE[simResult.urgency].badge}`}>
                  {URGENCY_TONE[simResult.urgency].label}
                </span>
                <span className={`text-20 font-bold leading-tight ${REC_TONE[simResult.recommendation]}`}>
                  {simResult.recommendation}
                </span>
              </div>

              {/* Chapters — clickable pills scrolling to playbook */}
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Relevant Playbook Chapters</div>
                <div className="flex flex-wrap gap-1.5">
                  {simResult.chapters.map((ch) => {
                    const match = PLAYBOOKS.find((p) => p.title === ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => { if (match) { setDrawerOpen(match.id); } }}
                        className={`text-11 font-semibold px-2.5 py-1 rounded-full border transition-colors ${match ? "bg-brand-dim text-brand border-brand/30 hover:bg-brand hover:text-white hover:border-brand" : "bg-bg-2 text-ink-2 border-hair-2"}`}
                        title={match ? `Open ${ch} playbook` : ch}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Red Flags */}
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Red Flags Identified</div>
                <ul className="space-y-1">
                  {simResult.redFlags.map((rf, i) => (
                    <li key={i} className="flex items-start gap-2 text-12 text-red">
                      <span className="shrink-0 mt-0.5 text-red font-bold">•</span>
                      {rf}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Step-by-Step Actions</div>
                <ol className="space-y-1.5">
                  {simResult.actions.map((action, i) => (
                    <li key={i} className="text-12 text-ink-0 leading-relaxed pl-1">
                      {action}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Regulatory References */}
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Regulatory References</div>
                <div className="flex flex-wrap gap-1.5">
                  {simResult.regulatoryRefs.map((ref) => (
                    <span key={ref} className="font-mono text-10 px-2 py-0.5 rounded border border-hair-2 bg-bg-panel text-ink-1">
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3 mt-6 mb-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-[14px] pointer-events-none">⌕</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search playbooks…"
            className="w-full pl-8 pr-3 py-2 border border-hair-2 rounded text-12 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setFamilyFilter("all")}
            className={`px-2.5 py-1 rounded-full text-10 font-semibold border transition-colors ${familyFilter === "all" ? "bg-ink-0 text-bg-0 border-ink-0" : "bg-bg-panel text-ink-2 border-hair-2 hover:border-hair-3"}`}
          >All</button>
          {families.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFamilyFilter(f === familyFilter ? "all" : f)}
              className={`px-2.5 py-1 rounded-full text-10 font-semibold border transition-colors ${familyFilter === f ? "bg-brand text-white border-brand" : "bg-bg-panel text-ink-2 border-hair-2 hover:border-hair-3 hover:text-ink-0"}`}
            >{f}</button>
          ))}
        </div>
      </div>

      <div className="text-11 text-ink-3 mb-3">{filtered.length} playbooks · click any to open</div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-8">
        {filtered.map((p) => {
          const prog = getProgress(p.id, p.steps);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setDrawerOpen(p.id)}
              className="text-left px-3 py-2.5 rounded border border-hair-2 bg-bg-panel hover:border-brand hover:bg-brand-dim transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-mono text-10 font-semibold px-1.5 py-px rounded-sm ${getFamilyColor(p.family)}`}>
                  {p.family}
                </span>
                {prog > 0 && (
                  <span className="font-mono text-10 text-brand">{prog}%</span>
                )}
              </div>
              <span className="block text-11 text-ink-0 group-hover:text-brand leading-snug">{p.title}</span>
              <div className="flex items-center gap-1 mt-1.5">
                <div className="flex-1 h-0.5 bg-bg-2 rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${prog}%` }} />
                </div>
                <span className="text-10 text-ink-3 font-mono">{p.steps.length} steps</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Slide-in drawer */}
      {drawerOpen && pb && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(null)}
          />

          {/* Drawer panel */}
          <div className="fixed top-0 right-0 h-full w-[640px] bg-bg-0 border-l border-hair-2 z-50 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-hair-2 bg-bg-panel shrink-0">
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-mono text-10 font-semibold px-1.5 py-px rounded-sm ${getFamilyColor(pb.family)}`}>
                    {pb.family}
                  </span>
                  <span className="font-mono text-10 text-ink-3">{pb.typology}</span>
                </div>
                <h2 className="text-18 font-bold text-ink-0 leading-tight m-0">{pb.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(null)}
                className="text-ink-3 hover:text-ink-0 text-20 leading-none mt-0.5 px-1"
                aria-label="Close"
              >✕</button>
            </div>

            {/* Progress bar */}
            <div className="px-6 py-3 border-b border-hair-2 shrink-0 bg-bg-panel">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-11 text-ink-2 font-medium">Completion</span>
                <span className="font-mono text-11 text-brand font-semibold">{doneChecks} / {totalChecks} · {pct}%</span>
              </div>
              <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              {pct === 100 && (
                <div className="mt-2 text-11 text-green font-semibold">✓ All checks complete — playbook ready for sign-off</div>
              )}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Description */}
              {pb.description && (
                <div className="bg-brand-dim border border-brand/20 rounded-lg px-4 py-3">
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-brand mb-1.5">About this playbook</div>
                  <p className="text-12 text-ink-1 leading-relaxed m-0">{pb.description}</p>
                </div>
              )}

              {/* Regulatory citations */}
              {pb.citations && pb.citations.length > 0 && (
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Regulatory basis</div>
                  <div className="flex flex-wrap gap-1.5">
                    {pb.citations.map((c) => (
                      <span key={c} className="text-10 font-mono px-2 py-0.5 rounded border border-hair-2 bg-bg-panel text-ink-1">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Steps */}
              <div className="space-y-5">
                {pb.steps.map((step, si) => {
                  const stepDone = step.checks.filter((_, ci) => checked[`${pb.id}:${si}:${ci}`]).length;
                  const stepTotal = step.checks.length;
                  return (
                    <div key={si} className="border border-hair-2 rounded-lg overflow-hidden">
                      <div className={`px-4 py-2.5 flex items-center justify-between border-b border-hair-2 ${stepDone === stepTotal ? "bg-green-dim" : "bg-bg-panel"}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-12 font-semibold text-ink-0">{step.title}</span>
                          {step.required && (
                            <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold bg-red-dim text-red">
                              required
                            </span>
                          )}
                          {stepDone === stepTotal && stepTotal > 0 && (
                            <span className="font-mono text-10 text-green font-semibold">✓ done</span>
                          )}
                        </div>
                        <span className="font-mono text-10 text-ink-3">{stepDone}/{stepTotal}</span>
                      </div>
                      <ul className="list-none p-0 m-0 divide-y divide-hair">
                        {step.checks.map((c, ci) => {
                          const k = `${pb.id}:${si}:${ci}`;
                          const done = Boolean(checked[k]);
                          return (
                            <li key={ci}>
                              <label className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-bg-1 transition-colors ${done ? "bg-green-dim/30" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={done}
                                  onChange={() => toggle(pb.id, si, ci)}
                                  className="mt-0.5 accent-brand shrink-0"
                                />
                                <span className={`text-12 leading-relaxed ${done ? "text-ink-3 line-through" : "text-ink-1"}`}>
                                  {c}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      {step.citation && (
                        <div className="px-4 py-1.5 bg-bg-1 border-t border-hair text-10 text-ink-3 font-mono">
                          {step.citation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-hair-2 bg-bg-panel shrink-0 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const keys = pb.steps.flatMap((s, si) => s.checks.map((_, ci) => `${pb.id}:${si}:${ci}`));
                  const allDone = keys.every((k) => checked[k]);
                  setChecked((prev) => {
                    const next = { ...prev };
                    keys.forEach((k) => { next[k] = !allDone; });
                    return next;
                  });
                }}
                className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2 transition-colors"
              >
                {pb.steps.flatMap((s, si) => s.checks.map((_, ci) => `${pb.id}:${si}:${ci}`)).every((k) => checked[k]) ? "Uncheck all" : "Check all"}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const keys = pb.steps.flatMap((s, si) => s.checks.map((_, ci) => `${pb.id}:${si}:${ci}`));
                    setChecked((prev) => { const next = { ...prev }; keys.forEach((k) => { delete next[k]; }); return next; });
                  }}
                  className="text-11 font-medium px-3 py-1.5 rounded border border-hair-2 text-ink-3 hover:border-red hover:text-red transition-colors"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(null)}
                  className="text-11 font-semibold px-4 py-1.5 rounded bg-brand text-white hover:bg-brand/90 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </ModuleLayout>
  );
}
