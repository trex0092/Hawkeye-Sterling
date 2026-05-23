// Hawkeye Sterling — Comprehensive FATF Typology Library
//
// 50+ money laundering, terrorist financing, and proliferation financing
// typologies covering FATF ML/TF/PF categories plus UAE-specific patterns.
//
// Sources:
//   FATF Money Laundering and Terrorist Financing Typologies Reports
//   FATF Recommendation 7 (Proliferation Financing)
//   UAE FIU Strategic Analysis Reports 2024-2025
//   Egmont Group Typology Reports
//   CBUAE Guidance on AML/CFT

export type TypologyCategory = "ML" | "TF" | "PF";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface Typology {
  id: string;
  name: string;
  category: TypologyCategory;
  riskLevel: RiskLevel;
  description: string;
  redFlags: string[];
  fatfReference: string;
  indicators: string[];
  relatedTypologies: string[];
  sectors: string[];
  jurisdictions: string[];
}

export const TYPOLOGY_LIBRARY: Typology[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // ML — STRUCTURING & SMURFING
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "ML-001",
    name: "Smurfing / Structuring",
    category: "ML",
    riskLevel: "high",
    description:
      "Multiple small cash deposits or transactions deliberately kept below regulatory reporting thresholds (AED 40,000 / USD 10,000) to avoid detection. Often coordinated across multiple accounts, branches, or individuals (smurfs).",
    redFlags: [
      "Multiple deposits of AED 35,000–39,000 on consecutive days",
      "Different individuals depositing similar amounts into one account",
      "Systematic withdrawals just below the CTR threshold",
      "Multiple currency exchange transactions on the same day across different bureaux",
      "Round-number transactions clustered near reporting limits",
      "Geographic spread of deposits across multiple branches on the same day",
    ],
    fatfReference: "FATF Recommendation 29 — FIU; FATF Typologies Report 2023",
    indicators: [
      "Transaction velocity anomalies near regulatory thresholds",
      "Network of depositors linked to single recipient",
      "Cash-to-account deposit patterns without commercial purpose",
      "Time-series clustering of sub-threshold transactions",
    ],
    relatedTypologies: ["ML-002", "ML-003", "ML-007"],
    sectors: ["Banking", "Money Services Business", "Currency Exchange"],
    jurisdictions: ["UAE", "USA", "EU", "UK"],
  },
  {
    id: "ML-002",
    name: "Layering via Shell Companies",
    category: "ML",
    riskLevel: "critical",
    description:
      "Illicit funds moved through chains of shell companies in secrecy jurisdictions (BVI, Cayman, Panama, RAK ICC) with nominee directors and shareholders, obscuring the true beneficial owner. Funds may transit 10+ legal entities before reaching the target destination.",
    redFlags: [
      "Corporate structure with 3+ offshore layers and no operating substance",
      "Nominee director arrangements with no genuine business activity",
      "Circular ownership structures or cross-shareholding",
      "No audited accounts, staff, or physical premises at any layer",
      "Frequent intercompany loan transfers without commercial purpose",
      "UBO refuses to disclose natural-person ownership",
    ],
    fatfReference: "FATF Recommendations 24–25; FATF 2018 Concealment of Beneficial Ownership",
    indicators: [
      "Offshore corporate registry search revealing nominee directors",
      "UBO map with unresolved legal-entity nodes",
      "Intercompany transfers without arm's-length documentation",
      "Registered address at company formation agent",
    ],
    relatedTypologies: ["ML-001", "ML-008", "PF-001"],
    sectors: ["Corporate Services", "Banking", "Professional Services"],
    jurisdictions: ["BVI", "Cayman Islands", "Panama", "UAE (RAK ICC)", "Delaware"],
  },
  {
    id: "ML-003",
    name: "Real Estate Round-Tripping",
    category: "ML",
    riskLevel: "critical",
    description:
      "Illicit cash placed into real estate, property then sold to a related party at an inflated price, with the 'profit' appearing as legitimate investment returns. Common in Dubai where all-cash purchases by foreign-owned SPVs are frequent.",
    redFlags: [
      "All-cash property purchase with no mortgage or financing",
      "Purchase price significantly above or below market valuation",
      "Rapid resale to related party within 12 months at inflated price",
      "Property held through opaque offshore SPV",
      "PEP or high-risk UBO linked to the purchasing entity",
      "Seller and buyer share beneficial owners or common directors",
    ],
    fatfReference: "FATF 2022 Money Laundering in the Real Estate Sector",
    indicators: [
      "Title deed transfer history showing rapid flip transactions",
      "Land registry data cross-referenced with corporate UBO",
      "Market value deviation analysis (>20% from comparable)",
      "Pattern of multiple property purchases within short timeframes",
    ],
    relatedTypologies: ["ML-002", "ML-015", "ML-023"],
    sectors: ["Real Estate", "Banking", "Legal Services"],
    jurisdictions: ["UAE", "UK", "USA", "Cyprus", "Malta"],
  },
  {
    id: "ML-004",
    name: "Trade-Based Money Laundering (TBML)",
    category: "ML",
    riskLevel: "critical",
    description:
      "Over- or under-invoicing, multiple invoicing, or misrepresentation of traded goods/services to transfer value across borders disguised as legitimate trade. Particularly prevalent in free zones and gold/diamond trade.",
    redFlags: [
      "Invoice prices deviating >25% from WTO/Comtrade reference benchmarks",
      "Multiple invoices for the same shipment across different jurisdictions",
      "Phantom shipments with no AIS vessel trace or customs evidence",
      "HS code mismatch between declared goods and shipping documentation",
      "Third-country intermediaries with no commercial rationale",
      "Payment received from unrelated third parties for goods",
    ],
    fatfReference: "FATF 2020 Trade-Based Money Laundering Update; FATF/Egmont 2021 TBML Risk Indicators",
    indicators: [
      "Comtrade unit-price variance analysis",
      "AIS vessel tracking vs bill of lading cross-check",
      "Trade finance document forensics (double-invoice detection)",
      "Free zone import/export data anomalies",
    ],
    relatedTypologies: ["ML-001", "ML-011", "ML-022"],
    sectors: ["Trade Finance", "Commodities", "Free Zones", "Shipping"],
    jurisdictions: ["UAE (JAFZA, DMCC)", "Hong Kong", "Singapore", "Panama"],
  },
  {
    id: "ML-005",
    name: "Hawala / Informal Value Transfer",
    category: "ML",
    riskLevel: "high",
    description:
      "Value transferred through informal broker networks (hawaladars) operating on trust and coded settlement, bypassing formal banking rails. Settlement occurs through commodity exchange, offset, or delayed cash transfer. Widely used in South Asia and MENA.",
    redFlags: [
      "Customer receives regular transfers from unregistered MVTS operators",
      "Settlement via commodity rather than cash (gold, trade goods)",
      "Inability to produce customer records or transaction logs",
      "Operating without CBUAE Hawaladar registration",
      "Cross-border value movement with no wire transfer or SWIFT record",
      "Broker network extends to conflict-zone or sanctioned jurisdiction",
    ],
    fatfReference: "FATF Recommendation 14; FATF 2013 Informal Value Transfer Systems Report",
    indicators: [
      "CBUAE Hawaladar registration verification",
      "Transaction record system audit",
      "Customer acceptance file review",
      "Settlement counterparty geographic risk mapping",
    ],
    relatedTypologies: ["TF-005", "ML-001", "ML-022"],
    sectors: ["Money Services Business", "Remittance", "Informal Sector"],
    jurisdictions: ["UAE", "Pakistan", "India", "Afghanistan", "Somalia"],
  },
  {
    id: "ML-006",
    name: "Loan-Back Schemes",
    category: "ML",
    riskLevel: "high",
    description:
      "Criminal proceeds placed offshore, then 'loaned' back to the criminal through a controlled shell entity. The loan creates an apparently legitimate explanation for cash in-flows, with repayments serving as an additional disguising mechanism.",
    redFlags: [
      "Loan from offshore entity with no commercial arm's-length terms",
      "Borrower and lender share ultimate beneficial owners",
      "Interest rate significantly above or below market rates",
      "No evidence of genuine loan negotiation or purpose",
      "Loan repayments made in cash or through third parties",
      "Collateral consists of the same asset purchased with the loan proceeds",
    ],
    fatfReference: "FATF Typologies — Loan-Back Schemes; FATF 2013 The Role of Hawala in ML/TF",
    indicators: [
      "Cross-check loan counterparty against customer's UBO",
      "Loan documentation forensics (stamps, notarisation dates)",
      "Interest rate benchmarking against central bank reference rates",
      "Cash flow reconciliation of loan drawdowns vs repayments",
    ],
    relatedTypologies: ["ML-002", "ML-003", "ML-007"],
    sectors: ["Banking", "Corporate Finance", "Private Equity"],
    jurisdictions: ["UAE", "Switzerland", "Liechtenstein", "Luxembourg"],
  },
  {
    id: "ML-007",
    name: "Insurance Policy Manipulation",
    category: "ML",
    riskLevel: "medium",
    description:
      "Illicit funds used to purchase high-value insurance policies (life, annuity, endowment) then surrendered early, generating 'clean' investment proceeds. Policy loans exploit the cash value without triggering surrender penalties.",
    redFlags: [
      "High-value single-premium policy purchased with cash",
      "Early surrender within 12 months of inception",
      "Policy loan drawn immediately after inception",
      "Third-party premium payment by unrelated party",
      "Multiple policies purchased simultaneously across different insurers",
      "Beneficiary change shortly before surrender",
    ],
    fatfReference: "FATF 2004 Insurance and Money Laundering; IAIS Guidance Paper on AML/CFT",
    indicators: [
      "Premium payment source verification (cash vs bank transfer)",
      "Early surrender pattern analysis",
      "Policy loan utilisation monitoring",
      "Beneficiary change alerts",
    ],
    relatedTypologies: ["ML-001", "ML-006", "ML-008"],
    sectors: ["Insurance", "Banking", "Wealth Management"],
    jurisdictions: ["UAE", "Cayman Islands", "Luxembourg", "Switzerland"],
  },
  {
    id: "ML-008",
    name: "Casino and Gaming Money Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "Illicit cash converted to gaming chips, minimal play executed, then chips cashed out for a casino cheque — effectively cleaning the funds. Online gaming exploited through multi-account layering and bonus arbitrage.",
    redFlags: [
      "Large chip purchases with minimal actual gaming activity",
      "Cash-in followed by immediate cash-out ('chip dumping')",
      "Chips purchased by third party and cashed by another person",
      "Casino loan (marker) repaid in cash from unknown source",
      "VIP customer with no verifiable source of wealth",
      "Multiple online gaming accounts with shared payment methods",
    ],
    fatfReference: "FATF 2009 Money Laundering Through the Football Sector; FATF 2023 Casino Typologies",
    indicators: [
      "Chip purchase-to-play ratio analysis",
      "Third-party chip transaction monitoring",
      "Source of funds verification for markers",
      "Online gaming account clustering analysis",
    ],
    relatedTypologies: ["ML-001", "ML-007", "ML-015"],
    sectors: ["Gaming", "Hospitality", "Online Gambling"],
    jurisdictions: ["Macau", "Singapore", "Malta", "Gibraltar", "Isle of Man"],
  },
  {
    id: "ML-009",
    name: "Cryptocurrency Mixing and Tumbling",
    category: "ML",
    riskLevel: "critical",
    description:
      "Illicit cryptocurrency funds passed through mixing services (tumblers, CoinJoin, Tornado Cash) to sever the on-chain transaction trail. Privacy coins (Monero, Zcash) used for final settlement to avoid blockchain analytics.",
    redFlags: [
      "Wallet addresses with direct or one-hop exposure to known mixers",
      "Tornado Cash interaction detected in transaction history",
      "Conversion to Monero or Zcash without commercial purpose",
      "Peeling chain patterns indicating fund obfuscation",
      "Multiple small transactions from different wallets to single address",
      "DEX-to-CEX arbitrage with no KYC bridge",
    ],
    fatfReference: "FATF Recommendation 15; FATF 2021 Updated Guidance for a Risk-Based Approach to Virtual Assets",
    indicators: [
      "Blockchain analytics (Chainalysis / TRM / Elliptic) exposure scoring",
      "OFAC SDN list wallet screening",
      "Transaction graph analysis for mixing patterns",
      "Privacy coin conversion monitoring",
    ],
    relatedTypologies: ["ML-010", "ML-013", "TF-002"],
    sectors: ["Virtual Assets", "VASP", "DeFi"],
    jurisdictions: ["Global", "UAE (VARA)", "EU (MiCA)", "USA"],
  },
  {
    id: "ML-010",
    name: "NFT-Based Money Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "NFTs used to artificially inflate asset prices through wash trading (buyer = seller) or related-party transactions, then sold to a bona fide purchaser generating apparently legitimate crypto/fiat proceeds.",
    redFlags: [
      "Same wallet buying and selling the same NFT within 24 hours",
      "Dramatically escalating prices with no public auction record",
      "NFT sale proceeds immediately converted to fiat through VASP",
      "Anonymous creator with no verifiable identity",
      "Buyer and seller share IP address or payment method",
      "High-value NFT purchased from unknown artist with no provenance",
    ],
    fatfReference: "FATF 2022 Report on NFTs and Virtual Asset Money Laundering Risks",
    indicators: [
      "On-chain wash trading detection (circular transaction analysis)",
      "NFT price escalation anomaly detection",
      "VASP off-ramp monitoring for NFT proceeds",
      "Creator-buyer relationship graph analysis",
    ],
    relatedTypologies: ["ML-009", "ML-024", "ML-013"],
    sectors: ["Virtual Assets", "Art Market", "Digital Assets"],
    jurisdictions: ["Global", "UAE", "USA", "UK"],
  },
  {
    id: "ML-011",
    name: "Commodity Trade Manipulation",
    category: "ML",
    riskLevel: "high",
    description:
      "Systemic manipulation of commodity trade prices (gold, diamonds, petroleum, agricultural products) to transfer value across borders. Includes mine-of-origin laundering, conflict mineral proceeds, and petroleum sector over/under-invoicing.",
    redFlags: [
      "Gold or diamond purchases without mine-of-origin documentation",
      "Commodity prices deviating significantly from spot market rates",
      "Refinery or processing intermediary in a conflict-affected jurisdiction",
      "Cash payment for commodity batches above CTR thresholds",
      "Commodity delivered to free-zone vault with no end-buyer identified",
      "Third-country transshipment with no commercial rationale",
    ],
    fatfReference: "FATF 2024 Money Laundering Risks in the Gold Sector; OECD Due Diligence Guidance",
    indicators: [
      "LBMA responsible gold certification verification",
      "Comtrade commodity price benchmark comparison",
      "AIS vessel tracking for maritime commodity shipments",
      "OECD 5-step supply chain due diligence",
    ],
    relatedTypologies: ["ML-004", "ML-022", "ML-023"],
    sectors: ["Commodities", "Mining", "Trade Finance", "Free Zones"],
    jurisdictions: ["UAE (DMCC)", "DRC", "South Africa", "Turkey", "Hong Kong"],
  },
  {
    id: "ML-012",
    name: "Correspondent Banking Abuse",
    category: "ML",
    riskLevel: "critical",
    description:
      "Exploitation of correspondent banking relationships to move illicit funds through multiple jurisdictions, with each correspondent bank relying on the previous institution's KYC. Shell bank accounts, nested correspondent arrangements, and concentration accounts are key vectors.",
    redFlags: [
      "Correspondent bank located in a high-risk or FATF grey-listed jurisdiction",
      "Nested correspondent arrangement where the correspondent itself has correspondents",
      "Concentration accounts used where originator/beneficiary is unknown",
      "Shell bank identified in the correspondent chain",
      "Unusually high volume of transactions inconsistent with respondent's profile",
      "Rapid fund movement with same-day in/out pattern",
    ],
    fatfReference: "FATF Recommendation 13; FATF 2016 Guidance on Correspondent Banking",
    indicators: [
      "Respondent bank risk rating and FATF grey-list status",
      "Transaction volume vs respondent's declared business profile",
      "Nested correspondent chain mapping",
      "Shell bank identification (no physical presence, no licence)",
    ],
    relatedTypologies: ["ML-002", "ML-004", "PF-002"],
    sectors: ["Banking", "Trade Finance", "Payments"],
    jurisdictions: ["Global", "UAE", "Latvia (historical)", "Cyprus", "Malta"],
  },
  {
    id: "ML-013",
    name: "Carbon Credit Trading Money Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "Phantom carbon credits created or double-counted to generate artificial financial instruments. VAT carousel fraud using carbon credits exploited EU Emissions Trading Scheme. Fraudulent green project certifications used to raise funds.",
    redFlags: [
      "Carbon credits with no verifiable underlying green project",
      "Rapid back-to-back carbon credit purchases and resales (carousel pattern)",
      "Inconsistency between certification body records and claimed volume",
      "High-value voluntary carbon market trades with unverifiable offsets",
      "Credits sourced from jurisdictions with no regulated emissions market",
      "Nature-based solution projects in jurisdictions with no satellite verification",
    ],
    fatfReference: "FATF 2022 Money Laundering in the Carbon Credit Markets; Europol Carbon Credit Fraud Reports",
    indicators: [
      "Certification body registry cross-check",
      "Carousel trade pattern detection (rapid buy-sell in same day)",
      "VAT reclaim pattern analysis",
      "Satellite imagery verification of claimed project locations",
    ],
    relatedTypologies: ["ML-004", "ML-002", "ML-011"],
    sectors: ["Carbon Markets", "Environmental Finance", "Trade Finance"],
    jurisdictions: ["EU", "UK", "Australia", "Global"],
  },
  {
    id: "ML-014",
    name: "Professional Enablers — Lawyers and Accountants",
    category: "ML",
    riskLevel: "high",
    description:
      "Complicit or negligent legal and accounting professionals facilitating ML by providing company formation, client account management, trust services, or legal privilege as a shield. DNFBPs (Designated Non-Financial Businesses and Professions) exploited as gatekeepers.",
    redFlags: [
      "Law firm client account used for property purchase without legal service",
      "Accountant structures complex offshore arrangement for high-risk customer",
      "Legal professional claims privilege on source-of-funds query",
      "Multiple unrelated clients funnelling funds through single professional",
      "Shell company formation by agent with no stated commercial purpose",
      "Professional advisor located in different jurisdiction from client and asset",
    ],
    fatfReference: "FATF Recommendation 22–23; FATF 2021 Professional Money Laundering Networks",
    indicators: [
      "DNFBP STR filing rate monitoring",
      "Client account transaction pattern analysis",
      "Related-party transaction detection in professional networks",
      "Legal privilege invocation frequency monitoring",
    ],
    relatedTypologies: ["ML-002", "ML-003", "ML-006"],
    sectors: ["Legal Services", "Accounting", "Corporate Services", "Real Estate"],
    jurisdictions: ["UAE", "UK", "Switzerland", "Luxembourg", "Cayman Islands"],
  },
  {
    id: "ML-015",
    name: "Cash-Intensive Business Commingling",
    category: "ML",
    riskLevel: "high",
    description:
      "Criminal proceeds mixed with legitimate cash revenues of a cash-intensive business (restaurant, car wash, taxi, retail) and deposited as genuine business income. The business acts as a placement mechanism, eliminating the cash trail.",
    redFlags: [
      "Cash deposits inconsistent with reported turnover or footfall",
      "Revenue significantly above industry averages for similar businesses",
      "Business unable to explain seasonal or daily revenue patterns",
      "Cash deposits at multiple branches of the same bank on the same day",
      "Wages paid entirely in cash to employees without payroll records",
      "Business established shortly before high-volume cash activity",
    ],
    fatfReference: "FATF Typologies — Cash-Intensive Businesses; FinCEN Advisory on Cash Businesses",
    indicators: [
      "Revenue benchmark comparison against industry norms",
      "Cash deposit volume anomaly detection",
      "Payroll and employee record verification",
      "Business registration date vs transaction volume analysis",
    ],
    relatedTypologies: ["ML-001", "ML-004", "ML-023"],
    sectors: ["Retail", "Food & Beverage", "Transportation", "Entertainment"],
    jurisdictions: ["UAE", "USA", "EU", "UK"],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // ML — ADDITIONAL TYPOLOGIES
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "ML-016",
    name: "Mirror Trading",
    category: "ML",
    riskLevel: "critical",
    description:
      "Simultaneous buy and sell of the same security in different currencies or jurisdictions to transfer value while appearing as legitimate trading activity. Deutsche Bank mirror trading scandal moved USD 10B from Russia to offshore accounts.",
    redFlags: [
      "Back-to-back security trades in different currencies with no net position",
      "Trades systematically executed at or near closing price",
      "Counter-party to all trades is a related or undisclosed party",
      "Securities settled in jurisdictions unrelated to the trading relationship",
      "Client has no other trading activity — exclusively mirror pattern",
      "No apparent hedging or investment rationale for the trades",
    ],
    fatfReference: "FATF Typologies — Securities Sector ML; FinCEN Advisory FIN-2017-A007",
    indicators: [
      "Net position analysis per client across linked accounts",
      "Counter-party relationship mapping",
      "Settlement jurisdiction mismatch analysis",
      "Trade timing correlation (simultaneous buy/sell)",
    ],
    relatedTypologies: ["ML-002", "ML-012", "ML-004"],
    sectors: ["Securities", "Banking", "Asset Management"],
    jurisdictions: ["Russia", "Cyprus", "Estonia", "UK", "Global"],
  },
  {
    id: "ML-017",
    name: "Digital Payment and E-Wallet Exploitation",
    category: "ML",
    riskLevel: "high",
    description:
      "Money mule accounts opened across multiple digital banking and e-wallet platforms using synthetic or stolen identities. Funds layered through rapid peer-to-peer transfers, prepaid card purchases, and cryptocurrency conversions.",
    redFlags: [
      "Multiple accounts opened with same device ID or IP address",
      "KYC bypass through low-risk account tier then escalation",
      "Rapid P2P transfers to multiple recipients immediately after receipt",
      "Prepaid card loading then immediate cryptocurrency purchase",
      "Account receives single large transfer then immediately disperses",
      "No prior relationship or transaction history before spike in activity",
    ],
    fatfReference: "FATF Recommendation 15; FATF 2020 Virtual Assets Red Flag Indicators",
    indicators: [
      "Device fingerprinting and IP clustering",
      "Velocity monitoring across payment platforms",
      "Account age vs transaction volume analysis",
      "Prepaid card load/use pattern monitoring",
    ],
    relatedTypologies: ["ML-001", "ML-009", "TF-002"],
    sectors: ["Fintech", "E-Money", "Digital Banking", "Payments"],
    jurisdictions: ["Global", "UAE", "EU", "UK"],
  },
  {
    id: "ML-018",
    name: "Mortgage Fraud and Real Estate Over-Valuation",
    category: "ML",
    riskLevel: "high",
    description:
      "Inflated property valuations used to obtain mortgages exceeding purchase price, with excess proceeds extracted as cash. False appraisals, colluding estate agents, and fabricated rental income used to support fraudulent loan applications.",
    redFlags: [
      "Property valuation significantly above comparable market transactions",
      "Appraiser has repeated history with the same brokerage network",
      "Rental income claimed on loan application not verifiable",
      "Loan proceeds exceed purchase price without legitimate explanation",
      "Seller and buyer share the same legal representative",
      "Property resold shortly after mortgage inception at lower price",
    ],
    fatfReference: "FATF 2022 Money Laundering in the Real Estate Sector",
    indicators: [
      "Automated valuation model (AVM) vs declared value comparison",
      "Appraiser network analysis",
      "Title deed and land registry cross-check",
      "Rental income verification through independent sources",
    ],
    relatedTypologies: ["ML-003", "ML-006", "ML-014"],
    sectors: ["Real Estate", "Banking", "Mortgage Lending"],
    jurisdictions: ["UAE", "USA", "Australia", "UK"],
  },
  {
    id: "ML-019",
    name: "Ponzi and Pyramid Scheme Proceeds Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "Proceeds from Ponzi or pyramid schemes layered through real estate, offshore accounts, and luxury assets. Fraudsters often maintain the appearance of legitimate investment returns while moving criminal proceeds through multiple jurisdictions.",
    redFlags: [
      "Investment returns significantly above market benchmarks with no volatility",
      "Investors' funds commingled with operator's personal accounts",
      "Offshore accounts used to segregate investor capital from returns",
      "Luxury asset purchases (yachts, aircraft, property) from investment proceeds",
      "New investor funds used to pay returns to existing investors",
      "Operator unwilling to provide audited accounts or independent custody",
    ],
    fatfReference: "FATF Typologies — Investment Fraud ML; SEC/FCA Ponzi Scheme Guidance",
    indicators: [
      "Return-on-investment benchmark comparison",
      "Commingling of investor and operator funds detection",
      "Asset purchase correlation with investor inflows",
      "Investor payout vs underlying asset performance analysis",
    ],
    relatedTypologies: ["ML-002", "ML-003", "ML-015"],
    sectors: ["Investment", "Asset Management", "Banking", "Real Estate"],
    jurisdictions: ["UAE", "USA", "UK", "Global"],
  },
  {
    id: "ML-020",
    name: "Human Trafficking Proceeds Laundering",
    category: "ML",
    riskLevel: "critical",
    description:
      "Proceeds from labour and sexual exploitation trafficked through escort service fronts, massage parlours, and service company structures. Cash-intensive businesses used for placement, with layering via real estate and offshore accounts.",
    redFlags: [
      "Service business with no verifiable employees but high cash revenue",
      "Multiple individuals depositing cash to a single business account",
      "Bank account receives multiple small cash deposits from different cities",
      "Property purchased in the name of a young person with no employment history",
      "Business address linked to known exploitation venues",
      "Cash payments to individuals in amounts consistent with illicit wages",
    ],
    fatfReference: "FATF 2011 Money Laundering Risks Arising from Trafficking in Human Beings",
    indicators: [
      "Geographic clustering of cash deposits",
      "Business registration vs declared activity audit",
      "Property ownership vs income analysis",
      "Network mapping of depositors linked to single account",
    ],
    relatedTypologies: ["ML-001", "ML-015", "ML-014"],
    sectors: ["Hospitality", "Real Estate", "Banking", "Retail"],
    jurisdictions: ["UAE", "EU", "Southeast Asia", "Global"],
  },
  {
    id: "ML-021",
    name: "DeFi Protocol Exploitation",
    category: "ML",
    riskLevel: "high",
    description:
      "Decentralised finance (DeFi) protocols used to layer illicit crypto funds through liquidity pools, yield farming, cross-chain bridges, and flash loan arbitrage, generating apparently legitimate DeFi yield to obscure criminal origin.",
    redFlags: [
      "High-risk wallet funds deposited into DeFi protocols immediately after receipt",
      "Cross-chain bridge transactions following mixer interaction",
      "Rapid deployment and withdrawal from multiple DeFi protocols",
      "Flash loan used with no economic arbitrage rationale",
      "Funds bridged from OFAC-sanctioned blockchain network",
      "Governance token purchases with illicit crypto for protocol control",
    ],
    fatfReference: "FATF Recommendation 15; FATF 2022 DeFi and AML/CFT Guidance",
    indicators: [
      "On-chain DeFi interaction analysis",
      "Cross-chain bridge transaction monitoring",
      "Liquidity pool deposit/withdrawal pattern analysis",
      "Flash loan transaction purpose verification",
    ],
    relatedTypologies: ["ML-009", "ML-010", "ML-017"],
    sectors: ["DeFi", "Virtual Assets", "VASP"],
    jurisdictions: ["Global", "UAE (VARA)", "EU (MiCA)"],
  },
  {
    id: "ML-022",
    name: "Free Zone Entity Layering (UAE)",
    category: "ML",
    riskLevel: "high",
    description:
      "UAE free zone companies (JAFZA, DMCC, ADGM, RAK ICC) used as layering vehicles for illicit funds. Free zones offer minimal disclosure requirements, enabling foreign nationals to establish structures with no UAE banking relationship or operating substance.",
    redFlags: [
      "Free zone company with no physical presence or employees",
      "Multiple UAE free zone entities sharing the same registered agent and director",
      "High-value transactions between free zone entities with no commercial purpose",
      "Free zone company invoicing another entity in a high-risk jurisdiction",
      "UBO from a FATF high-risk or grey-listed jurisdiction",
      "Company established recently but immediately engaging in high-volume transactions",
    ],
    fatfReference: "FATF 2023 Mutual Evaluation of UAE; UAE FIU Guidance on Free Zone Risks",
    indicators: [
      "Free zone registry search for nominee directors",
      "Operating substance verification (lease, staff, contracts)",
      "Transaction counterparty geographic risk analysis",
      "Establishment date vs transaction history correlation",
    ],
    relatedTypologies: ["ML-002", "ML-004", "ML-011"],
    sectors: ["Free Zones", "Trade Finance", "Corporate Services"],
    jurisdictions: ["UAE (JAFZA, DMCC, ADGM, RAK ICC, IFZA)"],
  },
  {
    id: "ML-023",
    name: "Dubai Gold Souk Cash Transactions",
    category: "ML",
    riskLevel: "critical",
    description:
      "Cash used to purchase gold in Dubai's gold souks without adequate KYC, enabling large-scale cash placement. Gold then exported for 'recycling' or resale, with proceeds re-entering the financial system as commodity trade income.",
    redFlags: [
      "Repeated high-value cash gold purchases from a single customer",
      "Customer from high-risk jurisdiction with no UAE residency",
      "Gold purchased in quantities consistent with bulk cash conversion",
      "Customer unable to evidence source of cash funds",
      "Same-day multiple gold purchases split across different gold dealers",
      "Gold immediately exported after purchase without UAE value-add",
    ],
    fatfReference: "UAE FIU Strategic Analysis — Gold Sector 2024; FATF 2024 Gold ML Risks",
    indicators: [
      "Gold dealer CTR monitoring (transactions >AED 55,000)",
      "Customer due diligence adequacy for gold souk purchasers",
      "Export record cross-check with purchase records",
      "CBUAE Hawaladar linkage to gold purchases",
    ],
    relatedTypologies: ["ML-011", "ML-001", "ML-004"],
    sectors: ["Precious Metals", "Jewellery", "Trade Finance"],
    jurisdictions: ["UAE (Dubai)"],
  },
  {
    id: "ML-024",
    name: "Luxury Goods and Art Market Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "High-value luxury goods (watches, handbags, jewellery, artworks) purchased with illicit cash, then resold through auction houses or dealers for clean funds. Art market opacity and lack of regulation makes it particularly vulnerable.",
    redFlags: [
      "Cash payment for luxury goods above AED 55,000 (UAE CTR threshold)",
      "Frequent purchase and resale of high-value artwork through intermediaries",
      "Customer unable to evidence legitimate source of funds for purchase",
      "Auction house purchases by anonymous bidders through third-party agents",
      "Artwork purchased in one jurisdiction and immediately resold in another",
      "Watch or jewellery batch purchase inconsistent with retail customer profile",
    ],
    fatfReference: "FATF 2023 Money Laundering and Terrorist Financing in the Art Market",
    indicators: [
      "Cash transaction reporting for luxury goods dealers",
      "Provenance verification for high-value artworks",
      "Auction house bidder identity verification",
      "Purchase-resale cycle time analysis",
    ],
    relatedTypologies: ["ML-001", "ML-003", "ML-014"],
    sectors: ["Art Market", "Luxury Goods", "Jewellery", "Auction Houses"],
    jurisdictions: ["UAE", "USA", "Switzerland", "UK", "Monaco"],
  },
  {
    id: "ML-025",
    name: "Real Estate Developer Payment Structuring (UAE)",
    category: "ML",
    riskLevel: "high",
    description:
      "Illicit funds placed through off-plan property purchase instalment payments, structured to remain below reporting thresholds. Multiple payment instalments from different accounts or remitters used to obscure the true source of funds.",
    redFlags: [
      "Multiple sub-threshold payments from different accounts for one property",
      "Cash instalments paid directly to developer without bank intermediary",
      "Payment currency different from developer's home market without explanation",
      "No evidence of mortgage pre-approval or declared income matching purchase price",
      "Rapid resale of off-plan property before completion",
      "Developer accepting payment from third party with no legal relationship to buyer",
    ],
    fatfReference: "UAE FIU Guidance — Real Estate Sector AML/CFT; FATF 2022 Real Estate ML Report",
    indicators: [
      "Payment instalment pattern analysis",
      "Third-party payment detection",
      "Pre-completion resale monitoring",
      "Off-plan payment source tracking",
    ],
    relatedTypologies: ["ML-003", "ML-001", "ML-022"],
    sectors: ["Real Estate", "Construction", "Banking"],
    jurisdictions: ["UAE (Dubai, Abu Dhabi)"],
  },
  {
    id: "ML-026",
    name: "Dhow Boat Informal Trade (UAE)",
    category: "ML",
    riskLevel: "medium",
    description:
      "Traditional dhow boats used for informal cross-border trade in the Arabian Gulf, carrying undeclared goods between UAE, Iran, Oman, Pakistan, and India. Commodities include gold, electronics, and consumer goods with under-invoiced or undeclared values.",
    redFlags: [
      "Dhow operator conducting large cash transactions without formal trade documentation",
      "Goods manifests inconsistent with typical dhow trade volumes or categories",
      "Multiple cash deposits from dhow operators after port arrivals",
      "Trading routes to sanctioned or high-risk jurisdictions",
      "No customs clearance documentation for incoming goods",
      "Dhow-linked payments to hawala networks",
    ],
    fatfReference: "FATF 2016 Gulf Region Typologies; UAE FIU Informal Trade Guidance",
    indicators: [
      "Port authority manifest cross-check",
      "Dhow operator transaction monitoring",
      "Geographic route risk assessment",
      "Customs documentation verification",
    ],
    relatedTypologies: ["ML-005", "ML-004", "ML-011"],
    sectors: ["Maritime Trade", "Informal Sector", "Commodities"],
    jurisdictions: ["UAE", "Iran", "Oman", "Pakistan", "India"],
  },
  {
    id: "ML-027",
    name: "UAE-Based Hawaladar Networks",
    category: "ML",
    riskLevel: "high",
    description:
      "UAE-based informal value transfer networks exploiting the large South Asian and Arab expat communities. Settlement through gold commodity exchange, real estate, or cross-border commodity trade. Some networks linked to sanctions evasion for Iran.",
    redFlags: [
      "CBUAE-unregistered hawala operator",
      "Customer refers to 'trusted broker' for international transfers",
      "Transaction value inconsistent with declared remittance purpose",
      "Settlement counterparty in Iran, Afghanistan, or another sanctioned jurisdiction",
      "Cash received in UAE and equivalent transferred to South Asia without wire record",
      "Broker operates from gold souk or money exchange without separate licence",
    ],
    fatfReference: "CBUAE Hawaladar Registration Regime; FATF Recommendation 14",
    indicators: [
      "CBUAE hawaladar register verification",
      "Transaction log and customer record audit",
      "Settlement counterparty sanctions screening",
      "Cross-border wire absence analysis",
    ],
    relatedTypologies: ["ML-005", "ML-023", "TF-005"],
    sectors: ["Money Services Business", "Remittance", "Gold Trade"],
    jurisdictions: ["UAE", "Pakistan", "India", "Afghanistan", "Iran"],
  },
  {
    id: "ML-028",
    name: "Cryptocurrency Mining Farm Proceeds",
    category: "ML",
    riskLevel: "medium",
    description:
      "Criminal organisations operating or funding cryptocurrency mining farms to convert electricity costs into mined cryptocurrency, providing a veneer of legitimate crypto origin. Mining rewards then mixed with exchange purchases to obscure criminal funds.",
    redFlags: [
      "Mining farm operator with unexplained electricity consumption spikes",
      "Mining proceeds disproportionate to declared mining equipment investment",
      "Mining rewards immediately transferred to mixing service",
      "Mining farm in jurisdiction with subsidised electricity and low oversight",
      "Mining entity with no KYC process for electricity payment",
      "Mining output converted to privacy coins immediately upon receipt",
    ],
    fatfReference: "FATF Recommendation 15; FATF 2021 VASP Guidance",
    indicators: [
      "Mining wallet address risk scoring",
      "On-chain mining reward destination analysis",
      "Electricity consumption anomaly detection",
      "Mining pool participation pattern analysis",
    ],
    relatedTypologies: ["ML-009", "ML-021", "ML-002"],
    sectors: ["Virtual Assets", "Energy", "Technology"],
    jurisdictions: ["Kazakhstan", "Iran", "UAE", "Russia", "Global"],
  },
  {
    id: "ML-029",
    name: "Trade Finance Fraud — False Documentation",
    category: "ML",
    riskLevel: "high",
    description:
      "Letters of credit and documentary collections exploited by submitting forged bills of lading, certificates of origin, or inspection certificates. Funds received by beneficiary for goods never shipped or substantially different from those described.",
    redFlags: [
      "Bill of lading from an unknown or unverifiable shipping company",
      "Certificate of origin from a jurisdiction inconsistent with the goods",
      "Multiple letters of credit for same goods across different banks",
      "Inspection certificate issued by unaccredited or unknown body",
      "Beneficiary requests early payment without document conformity",
      "Goods description vague or inconsistent across documents",
    ],
    fatfReference: "FATF 2020 TBML Update; ICC Banking Commission Trade Finance Guidelines",
    indicators: [
      "Document authenticity verification (shipping registry cross-check)",
      "AIS vessel tracking for named vessels",
      "Certificate issuer accreditation verification",
      "Trade finance document discrepancy detection",
    ],
    relatedTypologies: ["ML-004", "ML-012", "ML-022"],
    sectors: ["Trade Finance", "Banking", "Shipping"],
    jurisdictions: ["Global", "UAE", "Hong Kong", "Singapore"],
  },
  {
    id: "ML-030",
    name: "Sports Sector Money Laundering",
    category: "ML",
    riskLevel: "medium",
    description:
      "Illicit funds integrated through football club ownership, player transfers with inflated fees, sports sponsorship arrangements, and sports betting. Ticket touting, stadium construction contracts, and sports image rights exploited for layering.",
    redFlags: [
      "Player transfer fee significantly above market valuation",
      "Sports sponsorship from unknown offshore entity without commercial rationale",
      "Football club ownership by opaque offshore structure",
      "Betting operator receiving disproportionate deposits from single customer",
      "Construction contract for sports venue awarded to politically connected entity",
      "Image rights income channelled through offshore entities",
    ],
    fatfReference: "FATF 2009 Money Laundering Through the Football Sector; Moneyval Sports Typologies",
    indicators: [
      "Transfer fee benchmark vs comparable player market values",
      "Club ownership UBO disclosure",
      "Sponsorship entity substance verification",
      "Betting transaction pattern analysis",
    ],
    relatedTypologies: ["ML-008", "ML-002", "ML-015"],
    sectors: ["Sports", "Entertainment", "Real Estate", "Betting"],
    jurisdictions: ["EU", "UK", "UAE", "Global"],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // TF — TERRORIST FINANCING
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "TF-001",
    name: "Charitable Organisation Abuse",
    category: "TF",
    riskLevel: "critical",
    description:
      "Legitimate or sham non-profit organisations (NPOs) used to collect donations that are subsequently diverted to terrorist groups. Charities in conflict-adjacent jurisdictions particularly vulnerable. Humanitarian aid interception also documented.",
    redFlags: [
      "NPO collects funds for conflict zones with limited accountability",
      "Donation patterns show bulk contributions from high-risk jurisdictions",
      "Charity board linked to individuals on UN 1267 / OFAC SDGT lists",
      "Funds transferred to beneficiaries unrelated to stated charitable purpose",
      "NPO refuses independent audit of fund disbursements",
      "Online fundraising platform used with anonymous cryptocurrency donations",
    ],
    fatfReference: "FATF Recommendation 8; FATF 2023 Revision of R.8 on Non-Profit Organisations",
    indicators: [
      "NPO beneficial ownership and governance structure review",
      "Fund flow analysis — donations vs stated disbursements",
      "Board and trustee sanctions screening",
      "Counterpart organisation risk assessment in recipient jurisdictions",
    ],
    relatedTypologies: ["TF-006", "TF-002", "TF-005"],
    sectors: ["Non-Profit", "Remittance", "Banking"],
    jurisdictions: ["UAE", "UK", "Pakistan", "Somalia", "Syria"],
  },
  {
    id: "TF-002",
    name: "Cryptocurrency for Terrorist Financing",
    category: "TF",
    riskLevel: "critical",
    description:
      "Terrorist organisations using cryptocurrency fundraising through social media, online forums, and Telegram to solicit donations in Bitcoin, Monero, and USDT. Funds moved through P2P exchanges and self-custodied wallets to avoid VASP KYC.",
    redFlags: [
      "Wallet address published on extremist social media or darkweb forums",
      "Donation campaigns explicitly linked to sanctioned terrorist organisations",
      "Frequent small transfers from multiple wallets to a central wallet",
      "Conversion to Monero or Zcash after initial fundraising receipt",
      "VASP-to-P2P exchange transfer to avoid KYC before off-ramp",
      "Wallet address appears on OFAC SDN crypto address list",
    ],
    fatfReference: "FATF Recommendation 15; FATF 2020 Virtual Assets Red Flag Indicators for TF",
    indicators: [
      "OFAC SDN crypto address screening",
      "Social media monitoring for wallet address publication",
      "On-chain clustering analysis for crowdfunding patterns",
      "P2P exchange transaction monitoring",
    ],
    relatedTypologies: ["TF-006", "TF-001", "ML-009"],
    sectors: ["Virtual Assets", "VASP", "Social Media"],
    jurisdictions: ["Global", "UAE", "EU", "USA"],
  },
  {
    id: "TF-003",
    name: "Self-Funding by Foreign Terrorist Fighters",
    category: "TF",
    riskLevel: "critical",
    description:
      "Individuals travelling to join terrorist organisations using their own savings, social benefits, small loans, or petty crime proceeds to fund travel and initial living costs. Minimal financial footprint makes detection difficult.",
    redFlags: [
      "Recent withdrawal of savings or liquidation of assets before international travel",
      "One-way airline ticket purchased to a conflict-adjacent country",
      "Social benefit claims inconsistent with travel history",
      "Personal loans drawn without apparent repayment plan",
      "Communication with known recruiters on encrypted platforms",
      "Purchase of tactical or military-grade equipment before travel",
    ],
    fatfReference: "FATF Recommendation 6; FATF 2018 Terrorist Financing Risk from FTFs",
    indicators: [
      "Travel intelligence cross-reference with financial activity",
      "Asset liquidation pattern analysis",
      "Open-source extremist network monitoring",
      "Loan-to-travel correlation analysis",
    ],
    relatedTypologies: ["TF-004", "TF-005", "TF-007"],
    sectors: ["Banking", "Travel", "Social Benefits"],
    jurisdictions: ["EU", "UK", "UAE", "MENA"],
  },
  {
    id: "TF-004",
    name: "Procurement Networks for Weapons",
    category: "TF",
    riskLevel: "critical",
    description:
      "Front companies and procurement agents used to acquire weapons, ammunition, and military equipment for terrorist groups. Disguised as legitimate defence contractors or security companies, often exploiting dual-use goods grey zones.",
    redFlags: [
      "Defence or security company with no verifiable operating history",
      "End-user certificate from a government with poor export control record",
      "Goods described as 'civilian equipment' but matching military specifications",
      "Procurement agent linked to known terrorist financial network",
      "Payment routed through multiple jurisdictions before reaching arms supplier",
      "Goods transshipped through multiple countries without commercial rationale",
    ],
    fatfReference: "FATF Recommendation 5; UN Security Council Resolution 1373",
    indicators: [
      "End-user certificate verification with issuing government",
      "Procurement agent UBO and network analysis",
      "Dual-use goods classification cross-check",
      "Payment chain geographic risk analysis",
    ],
    relatedTypologies: ["PF-001", "PF-003", "TF-003"],
    sectors: ["Defence", "Trade Finance", "Shipping"],
    jurisdictions: ["Global", "UAE", "Eastern Europe", "MENA"],
  },
  {
    id: "TF-005",
    name: "Informal Hawala for Terrorist Financing",
    category: "TF",
    riskLevel: "critical",
    description:
      "Hawala networks used specifically to move terrorist financing across borders, exploiting the lack of transaction records and regulatory oversight. Cross-border hawala funding documented for Al-Qaeda, Taliban, and ISIL operations.",
    redFlags: [
      "Hawaladar settlement counterparty in a conflict zone or sanctioned jurisdiction",
      "Transaction recipient linked to known terrorist financier",
      "Funds transferred to individual without commercial purpose or family connection",
      "Settlement through gold commodity exchange with war-zone gold sourcing",
      "Hawaladar unwilling to disclose end-recipient of transfer",
      "Code words or reference numbers consistent with hawala practice",
    ],
    fatfReference: "FATF Recommendation 14; UN Security Council Resolution 1373",
    indicators: [
      "Hawaladar network geographic risk mapping",
      "Recipient sanctions screening",
      "Settlement commodity sourcing verification",
      "Cross-border transfer destination analysis",
    ],
    relatedTypologies: ["ML-005", "TF-001", "TF-007"],
    sectors: ["Money Services Business", "Informal Sector"],
    jurisdictions: ["UAE", "Afghanistan", "Pakistan", "Somalia", "Yemen"],
  },
  {
    id: "TF-006",
    name: "Online Crowdfunding for Terrorist Financing",
    category: "TF",
    riskLevel: "high",
    description:
      "Social media platforms, crowd-funding websites, and encrypted messaging apps (Telegram, Signal) used to solicit small-value donations for terrorist causes. Appeals framed as humanitarian aid to avoid detection, with funds subsequently diverted.",
    redFlags: [
      "Crowdfunding campaign explicitly linked to a sanctioned terrorist organisation",
      "Campaign narrative uses coded language consistent with extremist ideology",
      "Donations accepted exclusively in cryptocurrency to avoid identity linking",
      "Campaign operator uses VPN or anonymisation tools",
      "Funds withdrawn to unregistered VASP or hawala network immediately",
      "Multiple campaigns operated by same individual across platforms",
    ],
    fatfReference: "FATF Recommendation 8 and 15; FATF 2022 Online TF Typologies",
    indicators: [
      "Social media monitoring for extremist fundraising campaigns",
      "Crowdfunding platform transaction monitoring",
      "Cryptocurrency wallet clustering for donation receipt",
      "Platform terms-of-service violation detection",
    ],
    relatedTypologies: ["TF-001", "TF-002", "TF-005"],
    sectors: ["Social Media", "Crowdfunding", "Virtual Assets"],
    jurisdictions: ["Global", "EU", "USA", "UAE"],
  },
  {
    id: "TF-007",
    name: "Return from Conflict Zone Financing",
    category: "TF",
    riskLevel: "critical",
    description:
      "Returning foreign terrorist fighters bringing cash or assets from conflict zones, or receiving ongoing support for re-integration or continued operations. Financial activity upon return may fund domestic attacks or support remaining fighters.",
    redFlags: [
      "Return travel from conflict zone followed by unexplained cash deposits",
      "Renewed financial relationships with known terrorism-linked entities after return",
      "Receipt of foreign funds without plausible commercial or personal explanation",
      "Acquisition of materials consistent with explosive or weapon preparation",
      "Reconnection with hawala broker or informal value transfer network on return",
      "Social media activity suggesting ongoing ideological alignment post-return",
    ],
    fatfReference: "FATF Recommendation 6; CTED 2020 Foreign Terrorist Fighters Report",
    indicators: [
      "Travel history cross-reference with financial account activity",
      "Post-return transaction pattern analysis",
      "Open-source intelligence monitoring",
      "Law enforcement information sharing",
    ],
    relatedTypologies: ["TF-003", "TF-005", "TF-004"],
    sectors: ["Banking", "Remittance", "Travel"],
    jurisdictions: ["EU", "UK", "UAE", "MENA"],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // PF — PROLIFERATION FINANCING
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "PF-001",
    name: "Front Company Procurement for Dual-Use Goods",
    category: "PF",
    riskLevel: "critical",
    description:
      "Shell or front companies established in third countries to acquire controlled dual-use goods (semiconductors, electronics, chemicals, bearings) for sanctioned proliferators (DPRK, Iran, Syria). False end-use declarations submitted to export control authorities.",
    redFlags: [
      "Company incorporated in a jurisdiction with weak export controls",
      "Goods classified as dual-use under Wassenaar Arrangement or EAR",
      "End-user in a jurisdiction inconsistent with stated commercial purpose",
      "Company recently established with no prior trading history",
      "Procurement enquiries for unusually large quantities of controlled components",
      "Payment routed through multiple shell entities before reaching supplier",
    ],
    fatfReference: "FATF Recommendation 7; FATF 2018 Proliferation Financing Risk Assessment",
    indicators: [
      "Dual-use goods classification cross-check (CCL, EAR, Wassenaar)",
      "End-user verification with export control authority",
      "Procurement company substance and history analysis",
      "Payment chain geographic risk analysis",
    ],
    relatedTypologies: ["PF-002", "PF-003", "PF-004"],
    sectors: ["Trade Finance", "Electronics", "Chemical Industry", "Shipping"],
    jurisdictions: ["DPRK", "Iran", "Syria", "China", "UAE (transshipment)"],
  },
  {
    id: "PF-002",
    name: "Ship-to-Ship Transfer for Sanctions Evasion",
    category: "PF",
    riskLevel: "critical",
    description:
      "Sanctioned goods (petroleum, coal, arms) transferred between vessels in international waters to obscure the supply chain. DPRK and Iran extensively use ship-to-ship petroleum transfers to evade UN sanctions and sustain revenue for weapons programmes.",
    redFlags: [
      "Vessel AIS transponder disabled ('dark period') for extended time",
      "Vessel tracked to known ship-to-ship transfer coordinates",
      "Vessel flagged to open registry with history of sanctions violations",
      "Cargo origin claims inconsistent with vessel's recent port calls",
      "Vessel operator or manager linked to sanctioned entity",
      "Unusual port calls at jurisdictions inconsistent with stated cargo destination",
    ],
    fatfReference: "FATF Recommendation 7; OFAC 2020 Advisory on North Korea STS Transfers",
    indicators: [
      "AIS dark-period detection and duration analysis",
      "Vessel identity change (flag, name, IMO) monitoring",
      "Port call history vs cargo origin cross-check",
      "Ship manager and operator sanctions screening",
    ],
    relatedTypologies: ["PF-001", "PF-003", "ML-012"],
    sectors: ["Maritime", "Petroleum", "Trade Finance"],
    jurisdictions: ["DPRK", "Iran", "Global (international waters)"],
  },
  {
    id: "PF-003",
    name: "False End-User Certificates",
    category: "PF",
    riskLevel: "critical",
    description:
      "Forged or fraudulently obtained end-user certificates (EUCs) submitted to export control authorities to enable purchase of controlled goods. EUCs purport to certify legitimate civilian or government use, obscuring the true proliferation destination.",
    redFlags: [
      "EUC from a government authority in a jurisdiction with poor export control cooperation",
      "Government signatory has no verifiable role in the stated ministry",
      "Goods quantities on EUC inconsistent with stated end-use programme",
      "EUC certified for goods not within the recipient country's industrial capacity",
      "Multiple EUCs for same goods from different recipients in same jurisdiction",
      "EUC submitted for modification or amendment after initial approval",
    ],
    fatfReference: "FATF Recommendation 7; Wassenaar Arrangement EUC Best Practices",
    indicators: [
      "Government signatory verification through diplomatic channels",
      "End-use consistency analysis (stated programme vs goods specification)",
      "EUC registry cross-check with issuing authority",
      "Post-shipment verification (PSV) request outcome tracking",
    ],
    relatedTypologies: ["PF-001", "PF-004", "ML-004"],
    sectors: ["Defence", "Electronics", "Chemical Industry", "Aerospace"],
    jurisdictions: ["DPRK", "Iran", "Syria", "Global"],
  },
  {
    id: "PF-004",
    name: "Offshore Shell Company Procurement Chains",
    category: "PF",
    riskLevel: "critical",
    description:
      "Multi-layered offshore shell company networks used by sanctioned proliferators (DPRK, Iran) to procure controlled goods from Western suppliers. Each layer adds opacity, with funds transferred through correspondent banking and ultimately obscuring the sanctioned end-user.",
    redFlags: [
      "Procurement chain with 4+ legal entities, each in different jurisdictions",
      "Ultimate beneficial owner cannot be identified despite multiple KYC requests",
      "Payment routing through banks in FATF high-risk jurisdictions",
      "Shell entities sharing addresses with known DPRK or Iranian front companies",
      "Goods specification consistent with WMD programme components",
      "Transactions timed to coincide with known procurement waves by sanctioned regimes",
    ],
    fatfReference: "FATF Recommendation 7; UN Panel of Experts Reports (1718, 2231)",
    indicators: [
      "UN Panel of Experts designated entity cross-check",
      "Procurement chain UBO mapping to natural person",
      "Goods specification comparison with controlled items schedules",
      "Payment routing geographic risk heat map",
    ],
    relatedTypologies: ["PF-001", "PF-002", "PF-003"],
    sectors: ["Corporate Services", "Trade Finance", "Banking"],
    jurisdictions: ["DPRK", "Iran", "UAE (transshipment)", "Singapore", "Hong Kong"],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // ML — ADDITIONAL TYPOLOGIES (to reach 50+)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "ML-031",
    name: "Crypto ATM Structuring",
    category: "ML",
    riskLevel: "high",
    description:
      "Multiple cash deposits into cryptocurrency ATMs in amounts below reporting thresholds, converting illicit cash into Bitcoin without KYC, then immediately transferred to mixing services or privacy wallets.",
    redFlags: [
      "Multiple crypto ATM transactions of AED 3,000–4,000 in same day",
      "Same user ID or phone number used across multiple ATMs",
      "Receiving wallet immediately forwards funds to mixer or privacy wallet",
      "ATM located in high-crime area or unregistered money service business",
      "Transaction pattern shows clear sub-threshold structuring intent",
      "No commercial purpose for repeated small-value crypto ATM use",
    ],
    fatfReference: "FATF Recommendation 15; FinCEN 2022 Crypto ATM Advisory",
    indicators: [
      "ATM transaction clustering analysis",
      "Receiving wallet destination risk scoring",
      "Device fingerprinting for repeat ATM users",
      "Geographic proximity of ATM usage vs customer profile",
    ],
    relatedTypologies: ["ML-001", "ML-009", "ML-017"],
    sectors: ["Virtual Assets", "Money Services Business", "Retail"],
    jurisdictions: ["USA", "EU", "UAE", "UK"],
  },
  {
    id: "ML-032",
    name: "PEP-Linked Kleptocracy Laundering",
    category: "ML",
    riskLevel: "critical",
    description:
      "Foreign or domestic politically exposed persons misappropriating state assets and laundering proceeds through Dubai real estate, offshore trusts, and luxury asset purchases. UAE is a documented destination for kleptocracy proceeds from Africa and post-Soviet states.",
    redFlags: [
      "PEP's wealth materially exceeds documented salary and disclosed assets",
      "Property purchased in name of family member or RCA with no independent wealth",
      "Multiple UAE property purchases coinciding with PEP's tenure in office",
      "State contract awarded to PEP-linked entity at above-market rates",
      "Sudden wealth transfer to UAE upon PEP's loss of political immunity",
      "PEP structure uses multiple trust layers to obscure beneficial interest",
    ],
    fatfReference: "FATF Recommendation 12; World Bank / UNODC StAR Initiative",
    indicators: [
      "PEP wealth versus declared income comparison",
      "Title deed cross-reference with PEP family network",
      "State contract award analysis",
      "Trust structure beneficial ownership mapping",
    ],
    relatedTypologies: ["ML-002", "ML-003", "ML-014"],
    sectors: ["Banking", "Real Estate", "Wealth Management", "Legal Services"],
    jurisdictions: ["UAE", "UK", "Switzerland", "USA", "EU"],
  },
  {
    id: "ML-033",
    name: "Prepaid Card and Gift Card Layering",
    category: "ML",
    riskLevel: "medium",
    description:
      "Criminal proceeds converted to prepaid or gift cards purchased with cash, then used for online purchases, cryptocurrency acquisition, or resold through secondary markets. Cards can be loaded and reloaded multiple times to layer funds.",
    redFlags: [
      "Large volumes of prepaid cards purchased at retail with cash",
      "Gift card PINs sold online through unregulated secondary markets",
      "Prepaid card loading followed immediately by cryptocurrency purchase",
      "Multiple prepaid cards of same denomination purchased same day",
      "Prepaid card used across multiple jurisdictions without travel explanation",
      "High-value prepaid cards purchased just below KYC trigger levels",
    ],
    fatfReference: "FATF 2013 Prepaid Cards, Mobile Payments and Internet-Based Payment Services",
    indicators: [
      "Prepaid card velocity monitoring",
      "Point-of-sale cash purchase pattern analysis",
      "Secondary market resale detection",
      "Cross-border usage anomaly monitoring",
    ],
    relatedTypologies: ["ML-001", "ML-017", "ML-009"],
    sectors: ["Retail", "E-Commerce", "Fintech", "Virtual Assets"],
    jurisdictions: ["USA", "EU", "UAE", "Global"],
  },
  {
    id: "ML-034",
    name: "Reverse Money Laundering — Integration First",
    category: "ML",
    riskLevel: "high",
    description:
      "Legitimate businesses or assets used first for integration, then criminal proceeds funnelled backwards through layering to match the established legitimate profile. Useful when criminal has pre-existing legitimate business infrastructure.",
    redFlags: [
      "Business revenue suddenly increases dramatically without operational explanation",
      "New business lines opened simultaneously with criminal activity detection",
      "Assets of high value appear in accounts without prior accumulation history",
      "Integration through high-revenue transaction with related party",
      "Business cash flow inconsistent with sector norms in timing and volume",
      "Rapid asset diversification across multiple investment classes",
    ],
    fatfReference: "FATF Typologies — Integration Phase Analysis; Egmont Group Case Studies",
    indicators: [
      "Revenue benchmark comparison across time series",
      "Related-party transaction analysis",
      "Asset accumulation velocity monitoring",
      "Business activity vs transaction volume correlation",
    ],
    relatedTypologies: ["ML-015", "ML-019", "ML-002"],
    sectors: ["All Sectors"],
    jurisdictions: ["Global"],
  },
  {
    id: "ML-035",
    name: "Luxury Real Estate — Dubai Off-Plan Purchases",
    category: "ML",
    riskLevel: "critical",
    description:
      "Off-plan luxury Dubai property purchased by foreign investors using illicit proceeds, with projects sometimes cancelled or resold before completion. The off-plan market's instalment structure facilitates structured placement of funds.",
    redFlags: [
      "Off-plan purchase by foreign national with no UAE banking relationship",
      "Payment entirely in cash or via overseas bank transfers from high-risk jurisdictions",
      "Multiple off-plan units purchased across different developers simultaneously",
      "No evidence of intended personal use or rental income expectation",
      "Rapid resale of units in secondary market pre-completion at higher price",
      "Purchaser linked to PEP or subject of foreign corruption investigation",
    ],
    fatfReference: "UAE FIU Real Estate Sector Guidance; FATF 2022 Real Estate ML",
    indicators: [
      "Off-plan registration cross-check with DLD data",
      "Payment source jurisdiction risk analysis",
      "Multi-developer purchase correlation",
      "Pre-completion resale monitoring",
    ],
    relatedTypologies: ["ML-003", "ML-025", "ML-032"],
    sectors: ["Real Estate", "Banking", "Wealth Management"],
    jurisdictions: ["UAE (Dubai)"],
  },
  {
    id: "ML-036",
    name: "Environmental Crime Proceeds Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "Proceeds from illegal logging, illegal wildlife trafficking, illegal fishing, and illegal mining laundered through commodity trade, corrupt customs officials, and front businesses. FATF identifies environmental crime as a significant ML predicate.",
    redFlags: [
      "Timber or wildlife commodity trade from jurisdiction with high deforestation rate",
      "Fishing company with no verifiable catch certificates or licence",
      "Mining operation without verifiable permits or environmental compliance",
      "Cash-heavy commodity export with no audit trail",
      "Company director linked to known wildlife trafficking network",
      "Goods origin certificates inconsistent with known species distribution",
    ],
    fatfReference: "FATF 2021 Money Laundering from Environmental Crime",
    indicators: [
      "Trade documentation and permit verification",
      "CITES permit cross-check for wildlife commodities",
      "Fishing vessel licence and catch certificate verification",
      "Satellite land-use change detection for illegal logging",
    ],
    relatedTypologies: ["ML-004", "ML-011", "ML-014"],
    sectors: ["Commodities", "Fishing", "Mining", "Forestry"],
    jurisdictions: ["Brazil", "Southeast Asia", "West Africa", "Global"],
  },
  {
    id: "ML-037",
    name: "Darkweb Marketplace Proceeds Laundering",
    category: "ML",
    riskLevel: "critical",
    description:
      "Proceeds from darkweb drug, fraud, and cybercrime marketplaces laundered through cryptocurrency exchanges, peer-to-peer trading, and ultimately converted to fiat through complicit or negligent VASPs.",
    redFlags: [
      "Wallet address with direct exposure to known darkweb marketplace",
      "Large number of small-value inputs followed by consolidation into single wallet",
      "Transaction history showing Tor network interaction",
      "Immediate conversion after darkweb market seizure events",
      "Cryptocurrency received from jurisdiction with no VASP AML framework",
      "Off-ramp through unregulated peer-to-peer platform",
    ],
    fatfReference: "FATF Recommendation 15; Europol Internet Organised Crime Threat Assessment",
    indicators: [
      "Blockchain analytics darkweb marketplace exposure detection",
      "Wallet clustering for market proceeds",
      "Peer-to-peer platform monitoring",
      "Post-seizure transaction pattern analysis",
    ],
    relatedTypologies: ["ML-009", "ML-021", "ML-017"],
    sectors: ["Virtual Assets", "VASP", "Cybercrime"],
    jurisdictions: ["Global"],
  },
  {
    id: "ML-038",
    name: "Ransomware Proceeds Laundering",
    category: "ML",
    riskLevel: "critical",
    description:
      "Ransomware payments received in cryptocurrency, then layered through mixing services, OTC desks, and complicit VASPs before off-ramped to fiat. State-sponsored ransomware groups (DPRK Lazarus Group) have refined this typology.",
    redFlags: [
      "Wallet address linked to known ransomware campaigns (Ryuk, LockBit, Conti)",
      "Large cryptocurrency receipt followed immediately by mixing service use",
      "OTC desk purchase with no KYC for high-value amounts",
      "Rapid conversion of ransomware proceeds to privacy coins",
      "OFAC SDN-listed wallet in transaction history",
      "Jurisdictional routing through countries with limited VASP regulation",
    ],
    fatfReference: "FATF Recommendation 15; OFAC Advisories on Ransomware Facilitation",
    indicators: [
      "OFAC SDN crypto address screening",
      "Ransomware wallet cluster identification",
      "Mixing service exposure analysis",
      "OTC desk KYC compliance verification",
    ],
    relatedTypologies: ["ML-009", "ML-037", "PF-001"],
    sectors: ["Virtual Assets", "VASP", "Cybercrime"],
    jurisdictions: ["DPRK", "Russia", "Iran", "Global"],
  },
  {
    id: "ML-039",
    name: "Supply Chain Finance Fraud",
    category: "ML",
    riskLevel: "high",
    description:
      "Supply chain finance facilities (reverse factoring, supplier finance) exploited by creating fictitious invoices for goods or services not delivered, with banks advancing funds against fraudulent receivables.",
    redFlags: [
      "Invoice for goods or services with no verifiable delivery documentation",
      "Supplier and buyer under common ownership or control",
      "Invoice amounts inconsistent with historical trading volumes",
      "Rapid drawdown of supply chain facility immediately after establishment",
      "Multiple supply chain finance programmes across different banks for same relationship",
      "Supplier established recently with no prior trading history",
    ],
    fatfReference: "FATF 2020 TBML; ICC Banking Commission Supply Chain Finance Guidelines",
    indicators: [
      "Invoice authentication and delivery documentation verification",
      "Related-party supplier/buyer relationship detection",
      "Facility utilisation velocity analysis",
      "Multi-bank exposure detection through credit registry",
    ],
    relatedTypologies: ["ML-004", "ML-029", "ML-015"],
    sectors: ["Trade Finance", "Banking", "Corporate Finance"],
    jurisdictions: ["UAE", "UK", "EU", "USA"],
  },
  {
    id: "ML-040",
    name: "Money Mule Recruitment and Management",
    category: "ML",
    riskLevel: "high",
    description:
      "Recruited individuals (mules) use their personal bank accounts to receive and transfer criminal proceeds, often unaware of the criminal purpose. Online job fraud, romance scams, and student recruitment are common mule sourcing methods.",
    redFlags: [
      "Account receives large transfer then immediately transfers out to multiple recipients",
      "Customer received unsolicited job offer promising commission for fund transfers",
      "Account activity inconsistent with customer's age, occupation, or income",
      "Multiple unrelated individuals receiving transfers from the same source",
      "Customer unable to explain purpose of large funds received",
      "Recently opened account immediately receiving high-value transfers",
    ],
    fatfReference: "FATF Typologies — Money Mule Networks; Europol EMMA Operations",
    indicators: [
      "Account velocity and immediate pass-through monitoring",
      "Customer profile vs transaction activity correlation",
      "Network analysis of linked mule accounts",
      "Online recruitment platform monitoring",
    ],
    relatedTypologies: ["ML-001", "ML-017", "ML-015"],
    sectors: ["Banking", "Fintech", "E-Commerce"],
    jurisdictions: ["EU", "UK", "USA", "UAE", "Global"],
  },
  {
    id: "ML-041",
    name: "Trust and Foundation Misuse",
    category: "ML",
    riskLevel: "high",
    description:
      "Discretionary trusts and private foundations used to hold and conceal assets, with settlors maintaining de facto control through letters of wishes and protector arrangements. Liechtenstein, Jersey, and Cayman foundations popular for high-net-worth ML.",
    redFlags: [
      "Trust settlor maintains operational control through protector mechanism",
      "Trust assets inconsistent with disclosed wealth of settlor",
      "Trust beneficiaries include PEPs or politically sensitive individuals",
      "Trust assets consist primarily of offshore bank accounts and real estate",
      "Trustee is a professional nominee with no knowledge of underlying assets",
      "Trust established in jurisdiction without beneficial ownership registry",
    ],
    fatfReference: "FATF Recommendations 24–25; FATF 2018 Concealment of Beneficial Ownership",
    indicators: [
      "Trust deed and letter of wishes review",
      "Trustee substance and independence assessment",
      "Beneficiary sanctions and PEP screening",
      "Asset-to-disclosed-wealth consistency analysis",
    ],
    relatedTypologies: ["ML-002", "ML-006", "ML-032"],
    sectors: ["Private Banking", "Wealth Management", "Legal Services", "Corporate Services"],
    jurisdictions: ["Cayman Islands", "Jersey", "Liechtenstein", "BVI", "UAE (ADGM)"],
  },
  {
    id: "ML-042",
    name: "Tax Evasion-Linked Money Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "Undeclared offshore income and assets concealed through nominee arrangements, undisclosed bank accounts, and false tax returns. Tax evasion constitutes a predicate offence for ML in many jurisdictions, including under FATF standards.",
    redFlags: [
      "Undisclosed offshore bank account receiving income from domestic business",
      "Assets significantly exceeding declared income and tax filings",
      "Use of a jurisdiction without automatic exchange of financial information (AEOI)",
      "Shell company in jurisdiction excluded from OECD CRS",
      "Discrepancy between reported wealth and lifestyle indicators",
      "Transfer pricing manipulation to shift profits to low-tax jurisdiction",
    ],
    fatfReference: "FATF Recommendations 3 and 20; OECD BEPS Framework",
    indicators: [
      "CRS/FATCA data cross-reference with declared income",
      "Offshore account disclosure cross-check",
      "Lifestyle vs declared wealth analysis",
      "Transfer pricing documentation review",
    ],
    relatedTypologies: ["ML-002", "ML-006", "ML-014"],
    sectors: ["Banking", "Tax Advisory", "Corporate Finance"],
    jurisdictions: ["Global", "UAE", "Switzerland", "Luxembourg", "Cayman Islands"],
  },
  {
    id: "ML-043",
    name: "Used Car Dealership Laundering",
    category: "ML",
    riskLevel: "medium",
    description:
      "Cash-intensive used car dealerships used to commingle criminal proceeds with vehicle sale revenues. False sales records, inflated trade-in values, and cash-back arrangements used to place illicit funds into the business.",
    redFlags: [
      "Cash receipts significantly above industry norms for vehicle sales",
      "Vehicle sold at significantly below or above market value",
      "Customer paying cash for vehicle without verifiable source of funds",
      "Trade-in value significantly inflated with cash-back arrangement",
      "Multiple vehicles purchased by same individual with no justification",
      "Dealer accepting payment from third party unrelated to registered buyer",
    ],
    fatfReference: "FinCEN 2014 Used Car Dealer Guidance; FATF Typologies — DNFBPs",
    indicators: [
      "Revenue per vehicle vs industry benchmark",
      "Cash transaction monitoring for vehicle purchases",
      "Third-party payment detection",
      "Trade-in value vs market value analysis",
    ],
    relatedTypologies: ["ML-001", "ML-015", "ML-024"],
    sectors: ["Automotive", "Retail", "Banking"],
    jurisdictions: ["UAE", "USA", "EU", "UK"],
  },
  {
    id: "ML-044",
    name: "Cyber-Enabled Fraud Proceeds Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "Proceeds from Business Email Compromise (BEC), phishing, romance fraud, and investment fraud (pig butchering scams) laundered through mule accounts, cryptocurrency, and real estate before recovery is possible.",
    redFlags: [
      "Account receives large unexpected wire transfer from corporate or elderly victim",
      "Funds immediately forwarded in multiple sub-transactions",
      "Customer contacted by new 'investment advisor' via social media",
      "Cryptocurrency purchased immediately after receiving wire transfer",
      "Account opened with false identity or stolen credentials",
      "Refusal to explain source or purpose of received funds",
    ],
    fatfReference: "FATF 2023 Fraud-Enabled ML; FBI 2023 Internet Crime Report",
    indicators: [
      "BEC pattern recognition in wire transfer metadata",
      "Account behaviour vs customer profile anomaly detection",
      "Cryptocurrency conversion velocity monitoring",
      "Network analysis linking fraud victim to mule account",
    ],
    relatedTypologies: ["ML-040", "ML-017", "ML-009"],
    sectors: ["Banking", "Fintech", "Virtual Assets"],
    jurisdictions: ["Global", "UAE", "USA", "EU"],
  },
  {
    id: "ML-045",
    name: "Customs Fraud and Excise Duty Evasion",
    category: "ML",
    riskLevel: "medium",
    description:
      "Systematic undervaluation of goods at customs, false classification under lower-duty HS codes, and phantom re-export schemes used to evade import duties and generate off-balance-sheet cash for subsequent ML placement.",
    redFlags: [
      "Declared customs value significantly below comparable market prices",
      "HS code declared inconsistent with the actual goods description",
      "Goods declared as re-exports without verifiable subsequent export records",
      "Same goods re-classified at different customs points in same journey",
      "Broker with history of customs infraction facilitating the transaction",
      "Multiple amendments to customs declarations after initial submission",
    ],
    fatfReference: "WCO TBML Risk Indicators; FATF 2020 TBML Update",
    indicators: [
      "HS code classification verification",
      "Declared value vs Comtrade benchmark comparison",
      "Re-export documentation trail analysis",
      "Customs broker infraction history check",
    ],
    relatedTypologies: ["ML-004", "ML-011", "ML-029"],
    sectors: ["Trade Finance", "Customs", "Logistics", "Free Zones"],
    jurisdictions: ["UAE", "EU", "Global"],
  },
  {
    id: "ML-046",
    name: "Agricultural Commodity Fraud",
    category: "ML",
    riskLevel: "medium",
    description:
      "Fraudulent agricultural commodity contracts used to move value across borders, with over-invoiced exports, fictitious crop financing, and false warehouse receipts. Common in cocoa, palm oil, and grain sectors in developing countries.",
    redFlags: [
      "Commodity financing against warehouse receipts from unaudited facilities",
      "Crop volume invoiced exceeding verifiable local production capacity",
      "Contract prices significantly deviating from commodity exchange spot prices",
      "Commodity buyer/seller sharing beneficial owners or directors",
      "No insurance or quality inspection for high-value commodity shipment",
      "Payment made before goods cleared origin customs",
    ],
    fatfReference: "FATF 2020 TBML; Egmont Group Agricultural Commodity Typologies",
    indicators: [
      "Warehouse receipt issuer verification",
      "Production capacity cross-check against invoiced volumes",
      "Commodity price benchmark comparison",
      "Related-party buyer/seller relationship detection",
    ],
    relatedTypologies: ["ML-004", "ML-011", "ML-029"],
    sectors: ["Agriculture", "Commodities", "Trade Finance"],
    jurisdictions: ["West Africa", "Southeast Asia", "UAE", "Global"],
  },
  {
    id: "ML-047",
    name: "Real Estate — Rent-Back and Leaseback Schemes",
    category: "ML",
    riskLevel: "medium",
    description:
      "Property purchased with criminal proceeds then leased back to the criminal or an affiliate, generating apparent rental income that constitutes clean funds. Alternatively, overpaid rent provides a mechanism to place additional cash into the property structure.",
    redFlags: [
      "Property sold and immediately leased back to the former owner",
      "Rental income significantly above market rates for the property",
      "Tenant is a related party or controlled entity of the landlord",
      "Rent paid in cash without formal tenancy agreement",
      "Frequent lease renewals at escalating rates without market justification",
      "Property used as collateral for loans in excess of fair market value",
    ],
    fatfReference: "FATF 2022 Real Estate ML; UAE FIU Real Estate Guidance",
    indicators: [
      "Tenancy agreement authenticity verification",
      "Rental rate vs market comparable analysis",
      "Tenant/landlord relationship mapping",
      "Rental income vs property valuation analysis",
    ],
    relatedTypologies: ["ML-003", "ML-006", "ML-018"],
    sectors: ["Real Estate", "Property Management", "Banking"],
    jurisdictions: ["UAE", "UK", "EU", "USA"],
  },
  {
    id: "ML-048",
    name: "BNPL and Buy-Now-Pay-Later Fraud",
    category: "ML",
    riskLevel: "medium",
    description:
      "Buy-now-pay-later platforms exploited to purchase high-value goods with stolen or synthetic identities, then sell goods for cash. The BNPL liability remains with the fraudulent identity while criminal obtains clean cash from secondary sales.",
    redFlags: [
      "Multiple high-value BNPL purchases using recently opened account",
      "Purchased goods immediately resold through secondary marketplaces",
      "BNPL account uses synthetic identity with no prior credit history",
      "Device fingerprint shared with multiple BNPL accounts",
      "Delivery address for high-value goods is a freight forwarder or reshipping service",
      "BNPL default rate for new accounts above expected industry rate",
    ],
    fatfReference: "FATF 2020 Virtual Assets and New Payment Methods; FCA BNPL Guidance",
    indicators: [
      "BNPL account velocity monitoring",
      "Device fingerprinting and IP clustering",
      "Delivery address risk classification",
      "Account age vs purchase value analysis",
    ],
    relatedTypologies: ["ML-033", "ML-040", "ML-017"],
    sectors: ["Fintech", "E-Commerce", "Retail Credit"],
    jurisdictions: ["UAE", "UK", "EU", "Australia"],
  },
  {
    id: "ML-049",
    name: "Aviation Sector Money Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "Private jets and aircraft purchased with illicit funds through offshore entities, with aircraft registration in low-oversight jurisdictions. Aircraft used to transport cash or high-value goods without effective customs oversight.",
    redFlags: [
      "Private jet purchased through offshore entity with no disclosed UBO",
      "Aircraft registered in jurisdiction with minimal registry disclosure",
      "Flight manifests showing routes to sanctioned or conflict jurisdictions",
      "Aircraft operator unable to evidence legitimate business justification for flights",
      "Aircraft purchase price financed through back-to-back loan arrangement",
      "Maintenance invoices from related-party workshops at inflated prices",
    ],
    fatfReference: "FATF Typologies — Luxury Asset ML; Interpol Aviation Security",
    indicators: [
      "Aircraft registry ownership and UBO disclosure",
      "Flight path analysis vs stated business purpose",
      "Aircraft finance structure review",
      "Maintenance contract related-party analysis",
    ],
    relatedTypologies: ["ML-002", "ML-024", "ML-032"],
    sectors: ["Aviation", "Wealth Management", "Corporate Finance"],
    jurisdictions: ["UAE", "Cayman Islands", "Malta", "San Marino", "Isle of Man"],
  },
  {
    id: "ML-050",
    name: "Payroll Fraud and Ghost Employee Schemes",
    category: "ML",
    riskLevel: "medium",
    description:
      "Fictitious employees added to company payroll to provide ongoing cash extraction mechanism. Wages paid to individuals with no employment or to controlled accounts, providing regular integration of criminal proceeds disguised as payroll costs.",
    redFlags: [
      "Payroll includes employees with addresses or bank accounts inconsistent with employment location",
      "Multiple employees share bank account details or payment references",
      "Ghost employees receive salaries disproportionate to stated role",
      "No evidence of employment contract, tax registration, or social contribution",
      "Payroll consistently increased without corresponding business growth",
      "Payroll bank accounts showing immediate cash withdrawal upon receipt",
    ],
    fatfReference: "FATF Typologies — Corporate Fraud ML; ACFE Report to the Nations",
    indicators: [
      "Employee bank account clustering analysis",
      "Payroll headcount vs office capacity cross-check",
      "Tax registration and social contribution verification",
      "Payroll cash withdrawal pattern monitoring",
    ],
    relatedTypologies: ["ML-015", "ML-002", "ML-034"],
    sectors: ["Corporate", "Construction", "Government Contractors"],
    jurisdictions: ["Global", "UAE", "EU", "USA"],
  },
  {
    id: "ML-051",
    name: "High-Value Dealer Cash Sales",
    category: "ML",
    riskLevel: "medium",
    description:
      "High-value dealers (HVDs) in jewellery, watches, antiques, and art accepting large cash payments without adequate KYC, providing criminal organisations with placement opportunity for illicit cash proceeds.",
    redFlags: [
      "Cash payment for jewellery, watch, or antique above AED 55,000 threshold",
      "Customer unable to provide source-of-funds evidence for high-value purchase",
      "Repeat cash purchases from the same customer over consecutive days",
      "Customer requesting to split payment across multiple transactions",
      "Purchase of items without apparent personal connection or knowledge",
      "No due diligence file maintained by HVD for high-value cash transactions",
    ],
    fatfReference: "FATF Recommendation 22; UAE AML/CFT Framework for DNFBPs",
    indicators: [
      "HVD cash transaction reporting compliance monitoring",
      "Customer source-of-funds documentation review",
      "Transaction splitting pattern detection",
      "HVD STR filing rate analysis",
    ],
    relatedTypologies: ["ML-001", "ML-023", "ML-024"],
    sectors: ["Jewellery", "Watches", "Antiques", "Art"],
    jurisdictions: ["UAE", "Switzerland", "UK", "EU"],
  },
  {
    id: "ML-052",
    name: "Yacht and Marine Asset Laundering",
    category: "ML",
    riskLevel: "high",
    description:
      "Luxury yachts purchased through offshore entities with illicit funds, registered in secrecy flag states, and used for cash-intensive charter operations or drug trafficking. Vessel registration and ownership deliberately obscured.",
    redFlags: [
      "Yacht purchased through BVI or offshore entity with no disclosed UBO",
      "Vessel registered under flag state with minimal ownership disclosure requirements",
      "Charter income significantly above market rates for similar vessels",
      "Vessel used for routes inconsistent with charter market (conflict zones, sanctioned ports)",
      "Maintenance and operating costs paid through multiple entities",
      "Vessel AIS transponder frequently disabled",
    ],
    fatfReference: "FATF Typologies — Luxury Assets; IMO Ship Identification Requirements",
    indicators: [
      "Vessel registry UBO disclosure verification",
      "AIS dark-period monitoring",
      "Charter income vs market rate comparison",
      "Port call history risk analysis",
    ],
    relatedTypologies: ["ML-024", "ML-002", "PF-002"],
    sectors: ["Maritime", "Luxury Assets", "Corporate Finance"],
    jurisdictions: ["UAE", "Cayman Islands", "Malta", "Global"],
  },
  {
    id: "ML-053",
    name: "Cross-Border Currency Smuggling",
    category: "ML",
    riskLevel: "high",
    description:
      "Physical bulk cash smuggled across borders in luggage, vehicles, or concealed in commercial shipments to avoid financial reporting requirements. AED, USD, and EUR bundles commonly moved through UAE border crossings.",
    redFlags: [
      "Individual carrying cash near or above declaration threshold without declaration",
      "Commercial shipment with concealed currency bundles detected at customs",
      "Individual with multiple prior currency declarations making frequent border crossings",
      "Currency denominations inconsistent with stated travel purpose",
      "Cash found with drug residue or in concealed vehicle compartments",
      "Multiple family members crossing same border with amounts below declaration threshold",
    ],
    fatfReference: "FATF Recommendation 32; UAE Federal Law on Currency Declaration",
    indicators: [
      "Border Force intelligence on currency smuggling routes",
      "Frequent border crossing frequency analysis",
      "Currency denomination pattern analysis",
      "Travel companion network mapping",
    ],
    relatedTypologies: ["ML-001", "ML-005", "ML-023"],
    sectors: ["Cash", "Banking", "Customs"],
    jurisdictions: ["UAE", "EU", "USA", "Global"],
  },
  {
    id: "ML-054",
    name: "Metaverse and Virtual World Asset Laundering",
    category: "ML",
    riskLevel: "medium",
    description:
      "Virtual real estate and in-game assets in metaverse platforms (Decentraland, The Sandbox) purchased with illicit cryptocurrency, then resold for apparently legitimate proceeds. In-game currency exchanges used for layering.",
    redFlags: [
      "High-value metaverse real estate purchase with illicit-origin cryptocurrency",
      "Rapid escalation of virtual asset prices followed by sale to anonymous buyer",
      "In-game currency exchange at rates significantly above official platform rates",
      "Virtual asset purchase by wallet with mixer or darkweb exposure",
      "Multiple accounts operated by same individual for virtual world transactions",
      "Metaverse assets used as collateral for DeFi loans",
    ],
    fatfReference: "FATF Recommendation 15; FATF 2022 Emerging Virtual Asset Risks",
    indicators: [
      "Metaverse platform transaction monitoring",
      "Virtual asset price escalation analysis",
      "In-game currency exchange rate comparison",
      "Source wallet risk scoring for virtual asset purchases",
    ],
    relatedTypologies: ["ML-010", "ML-021", "ML-009"],
    sectors: ["Virtual Assets", "Gaming", "Digital Entertainment"],
    jurisdictions: ["Global"],
  },
  {
    id: "ML-055",
    name: "Syndicated Loan Fraud",
    category: "ML",
    riskLevel: "high",
    description:
      "False or inflated syndicated loan facilities arranged between related parties in different jurisdictions, with loan proceeds extracted and repaid using illicit funds. Repayments appear as legitimate debt service, cleaning criminal proceeds.",
    redFlags: [
      "Syndicated loan arranged entirely between related or connected parties",
      "Loan purpose vague or inconsistent with borrower's business",
      "Loan-to-value ratio significantly above market norms",
      "Interest rate terms significantly above or below market rates",
      "Loan proceeds immediately withdrawn and transferred offshore",
      "Repayments funded from unrelated third-party accounts",
    ],
    fatfReference: "FATF Typologies — Loan-Back and Syndicated Fraud; LMA Guidance",
    indicators: [
      "Lender network related-party analysis",
      "Loan purpose documentation review",
      "Repayment source verification",
      "Loan proceeds deployment monitoring",
    ],
    relatedTypologies: ["ML-006", "ML-002", "ML-012"],
    sectors: ["Banking", "Corporate Finance", "Syndicated Lending"],
    jurisdictions: ["UAE", "Luxembourg", "UK", "Singapore"],
  },
];

/**
 * Search and filter the typology library.
 * Supports text search across name, description, and red flags,
 * plus filtering by category (ML/TF/PF) and riskLevel.
 */
export function searchTypologies(params: {
  query?: string;
  category?: TypologyCategory | string;
  riskLevel?: RiskLevel | string;
  limit?: number;
}): Typology[] {
  const { query, category, riskLevel, limit = 50 } = params;

  let results = TYPOLOGY_LIBRARY;

  // Category filter
  if (category && category !== "all") {
    const cat = category.toUpperCase() as TypologyCategory;
    results = results.filter((t) => t.category === cat);
  }

  // Risk level filter
  if (riskLevel && riskLevel !== "all") {
    results = results.filter((t) => t.riskLevel === riskLevel.toLowerCase());
  }

  // Text search
  if (query && query.trim()) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    results = results.filter((typology) => {
      const haystack = [
        typology.name,
        typology.description,
        typology.category,
        typology.riskLevel,
        typology.fatfReference,
        ...typology.redFlags,
        ...typology.indicators,
        ...typology.sectors,
        ...typology.jurisdictions,
        ...typology.relatedTypologies,
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  return results.slice(0, limit);
}

/** Returns all unique categories present in the library. */
export function getTypologyCategories(): TypologyCategory[] {
  return Array.from(new Set(TYPOLOGY_LIBRARY.map((t) => t.category)));
}

/** Returns all unique risk levels present in the library. */
export function getTypologyRiskLevels(): RiskLevel[] {
  return ["critical", "high", "medium", "low"];
}

/** Returns typology count by category. */
export function getTypologyCounts(): Record<TypologyCategory, number> {
  return TYPOLOGY_LIBRARY.reduce(
    (acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<TypologyCategory, number>,
  );
}
