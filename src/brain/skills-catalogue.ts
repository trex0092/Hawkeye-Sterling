// Hawkeye Sterling — MLRO / compliance skills catalogue.
//
// ~390 competencies, reasoning operations, and analytical outputs drawn from
// AML/CFT, sanctions/TFS, KYC/CDD/EDD, supply-chain (LBMA/CAHRA), governance,
// regulatory-liaison, training, and risk-assessment practice.
//
// Every skill is tagged with:
//   - id      : kebab-case slug, unique across the catalogue
//   - label   : verbatim text (never paraphrased)
//   - domain  : one of 15 domains — AML_CORE, KYC_CDD, SANCTIONS_TFS, etc.
//   - layer   : one of three layers — competency / reasoning / analysis
//   - weight  : 0..1 relative emphasis (default 1.0, tunable)
//
// The catalogue is injected into every weaponized system prompt so the
// Claude agents cannot forget the skill surface they embody. It is also
// hashed into the cognitive catalogueHash so any change is auditable.

export type SkillLayer = 'competency' | 'reasoning' | 'analysis';

export type SkillDomain =
  | 'AML_CORE'
  | 'KYC_CDD'
  | 'SANCTIONS_TFS'
  | 'SUPPLY_CHAIN'
  | 'INVESTIGATIONS'
  | 'GOVERNANCE'
  | 'REPORTING'
  | 'RISK_ASSESSMENT'
  | 'TRAINING'
  | 'DIGITAL_ASSETS'
  | 'DATA_PRIVACY'
  | 'REGULATORY'
  | 'SOFT_SKILLS'
  | 'DOCUMENTATION'
  | 'COMPLIANCE_SYS'
  | 'TECHNOLOGY'
  | 'GEOPOLITICAL'
  | 'FORENSIC_ACCOUNTING'
  | 'ESG_CLIMATE'
  | 'FINANCIAL_CRIME'
  | 'MARKETS'
  | 'HUMAN_RIGHTS'
  | 'INTELLIGENCE'
  | 'ASSET_RECOVERY';

export interface Skill {
  readonly id: string;
  readonly label: string;
  readonly domain: SkillDomain;
  readonly layer: SkillLayer;
  readonly weight: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Raw source text. Comma-separated, verbatim from the product charter.
// Keep these as single long strings so diffs stay localised.
// ────────────────────────────────────────────────────────────────────────────

const COMPETENCIES_RAW =
  'AML/CFT Competencies, Technical Compliance Capabilities, Regulatory Intelligence, Risk Assessment Proficiency, KYC/CDD/EDD Expertise, Sanctions Screening Capability, Investigative Competence, MLRO Decision-Making, Supply Chain Due Diligence, Regulatory Writing, Policy Drafting, Judgment and Discretion, Attention to Detail, Communication, Escalation Management, Stakeholder Management, Compliance Competencies, Compliance Capabilities, Compliance Proficiencies, Technical Requirements, Core Competencies, Risk Management Capabilities, Transaction Monitoring Expertise, Red Flag Recognition, Adverse Media Screening, Corporate Structure Analysis, PEP Identification, UBO Tracing, Compliance Documentation, Evidence Collection, Record-Keeping, Control Design, Control Implementation, Testing Methodology, Audit Competence, Examination Preparation, Board Reporting, Senior Management Briefing, Governance Architecture, Committee Management, Reporting Protocol, Tipping-Off Management, Consent Management, GOAML Reporting, FIU Correspondence, Regulatory Liaison, Compliance Training Design, Compliance Awareness, Staff Coaching, Red Flag Awareness, Scenario-Based Learning, Policy Documentation, Procedure Documentation, Control Documentation, Risk Register Maintenance, Compliance Calendar Management, Compliance Metrics, Performance Monitoring, Threshold Management, Alert Management, False Positive Management, Compliance System Administration, Database Management, Compliance Tool Proficiency, EWRA Development, BWRA Development, Risk Matrix Design, Risk Appetite Calibration, Inherent Risk Assessment, Residual Risk Assessment, Control Effectiveness Evaluation, Remediation Roadmap, CAHRA Assessment, Refinery Evaluation, LBMA RGG Steps 1-5, Chain-of-Custody Verification, Conflict Minerals Assessment, Country-of-Origin Verification, Sourcing Documentation, Invoice Analysis, Pricing Discrepancy Detection, Third-Party Payment Investigation, Structuring Detection, Smurfing Detection, Velocity Anomaly Detection, Threshold Alert Review, TBML Review, Placement/Layering/Integration Analysis, Digital Asset Compliance, Cryptocurrencies Monitoring, Virtual Assets Screening, PDPL Data Privacy, Data Breach Response, Consent Management Systems, Cabinet Resolution Interpretation, FATF Compliance, Mutual Evaluation Preparation, Sanctions Program Design, TFS Compliance, Proliferation Financing Prevention, CPF Controls, Vendor Assessment, Third-Party Management, Counterparty Due Diligence, Beneficial Owner Identification, Relationship Manager Coaching, Compliance Culture Building, Compliance Incentivization, Whistleblower Management, Internal Disclosure Decisions, Legal Professional Privilege Assessment, Regulatory Strategy, Examination Strategy, Negotiation Skills, Regulatory Relations, Hawala Network Assessment, Informal Value Transfer Controls, Precious Stones Due Diligence, DPMS Supply-Chain Integrity, VASP Onboarding Standards, Correspondent Banking Assessment, NGO Charity Risk Assessment, Free Trade Zone Risk Assessment, New Payment Methods Risk, Crypto OTC Desk Assessment, Peer-to-Peer Platform Risk, Carbon Market Compliance, Crypto Travel Rule Compliance, Maritime Sanctions Evasion Detection, Dark-Web Open Source Intelligence, Cyber Intelligence Integration, Proliferation Dual-Use Goods Assessment, Luxury Goods Monitoring, Auction House Due Diligence, Parallel Import Detection, Funnel Account Controls, Mule Network Detection, Construction Sector Risk, Healthcare Billing Fraud Detection, Romance Scam Fraud Pattern Recognition, Professional Money Laundering Detection, RegTech Implementation, AI Risk Governance, Model Risk Management, Algorithmic Bias Detection, Explainable AI Compliance, Federated Learning Compliance, Differential Privacy Assessment, Zero-Knowledge Proof Evaluation, Quantum-Safe Cryptography Assessment, Digital Identity Verification, Biometric Authentication Governance, Synthetic Identity Detection, Deepfake Document Detection, Geopolitical Risk Assessment, Country Risk Profiling, Sovereign Risk Monitoring, Political Stability Assessment, Sanctions Escalation Monitoring, Secondary Sanctions Compliance, Extra-Territorial Jurisdiction Compliance, Kleptocracy Detection, State Capture Identification, Grand Corruption Assessment, Bribery and Facilitation Payment Detection, Gift and Hospitality Policy Enforcement, Conflicts of Interest Management, Related-Party Transaction Scrutiny, Off-Balance-Sheet Exposure Detection, Shell Company Hallmark Identification, Nominee Director Detection, Bearer Share Assessment, Jurisdiction-Stacking Analysis, Regulatory Arbitrage Detection, Financial Statement Fraud Detection, Earnings Management Detection, Revenue Recognition Fraud Detection, Cookie Jar Reserve Detection, Channel Stuffing Detection, Big Bath Accounting Detection, Round-Trip Revenue Detection, Goodwill Impairment Manipulation Detection, Asset Stripping Detection, Transfer Pricing Abuse Detection, Base Erosion and Profit Shifting Detection, Tax Haven Identification, Offshore Structure Mapping, CRS/FATCA Compliance, DAC6 Mandatory Disclosure Compliance, Beneficial Ownership Register Filing, LEI Compliance, Market Manipulation Detection, Pump-and-Dump Scheme Detection, Wash Trading Detection, Spoofing and Layering Detection, Front-Running Detection, Insider Trading Detection, Short-and-Distort Detection, Best Execution Compliance, Payment for Order Flow Review, Capital Markets Abuse Prevention, Insurance Fraud Detection, Mortgage Fraud Detection, Investment Fraud Detection, Ponzi Scheme Detection, Pyramid Scheme Detection, Advance-Fee Fraud Detection, Business Email Compromise Detection, Account Takeover Detection, SIM-Swap Fraud Detection, Authorized Push Payment Fraud Detection, Pig-Butchering Fraud Detection, Intellectual Property Theft Detection, Trade Secret Exfiltration Detection, Corporate Espionage Investigation, Counterfeit Goods Detection, Customs Fraud Detection, Import Duty Evasion Detection, Export Control Compliance, Ghost Employee Detection, Payroll Fraud Detection, Expense Fraud Detection, Procurement Fraud Detection, Bid Rigging Detection, Public Tender Fraud Detection, Contract Splitting Detection, Kickback Payment Detection, ESG Governance Assessment, Greenwashing Detection, Impact-Washing Detection, TCFD Compliance, SFDR Article Classification, EU Taxonomy Compliance, TNFD LEAP Assessment, Biodiversity Risk Assessment, Forced-Labour Supply Chain Screening, Child Labour Detection, Modern Slavery Act Compliance, UNGP Human Rights Due Diligence, Human Rights Impact Assessment, Land Rights Violation Detection, Environmental Crime Detection, Illegal Wildlife Trade Detection, Blood Diamond Detection, Artisanal Mining Compliance, Human Rights Defender Protection Protocol, Unexplained Wealth Order Assessment, Asset Freezing Order Compliance, Confiscation Order Preparation, Civil Recovery Assessment, Non-Conviction-Based Forfeiture Analysis, Deferred Prosecution Agreement Compliance, Corporate Liability Assessment, Adequate Procedures Defense, MLAT Cooperation, Mutual Legal Assistance Competence, Extradition Risk Assessment, International Cooperation Liaison, Interpol Red Notice Monitoring, Europol EMPACT Coordination, FinCEN Advisory Compliance, FINCEN Files Intelligence Integration, Leaked Dataset Intelligence Protocol, Whistleblower Credibility Assessment, Investigative Journalism Intelligence, OCCRP Intelligence Integration, Pandora Papers Due Diligence, Panama Papers Cross-Reference, Suisse Secrets Assessment, Private Banking EDD Competence, UHNW Relationship Governance, Family Office Risk Assessment, Trust and Foundation Governance, Charitable Trust Misuse Detection, Waqf Governance Risk, Cultural Property Compliance, Antiquities Trafficking Detection, Superyacht Compliance, Private Aircraft Beneficial Ownership, Racehorse Syndicate Risk, Fine Art Provenance Assessment, Wine and Whisky Investment Compliance, Luxury Watch Trafficking Detection, Sports Club Ownership Risk, Trophy Agricultural Land Assessment';

const REASONING_RAW =
  'Regulatory Inference, Risk-Based Logic, Suspicious Activity Assessment, Control Effectiveness Reasoning, Compliance Rationale, Tipping-Off Analysis, Precedent-Based Reasoning, Proportionality Assessment, Regulatory Interpretation, MLRO Judgment, Escalation Logic, Consent Reasoning, Materiality Assessment, Likelihood & Impact Assessment, Transaction Pattern Reasoning, Red Flag Correlation, Indicator Weighting, Risk Scoring Logic, Customer Risk Assessment Reasoning, Supplier Risk Assessment Reasoning, Geographic Risk Reasoning, Product Risk Reasoning, Channel Risk Reasoning, Business Line Risk Reasoning, Inherent Risk Logic, Residual Risk Logic, Control Effectiveness Judgment, Gap Assessment Reasoning, Compliance Maturity Reasoning, Regulatory Examination Reasoning, FATF Reasoning, Cabinet Resolution Reasoning, MoE Circular Interpretation, CBUAE Directive Interpretation, FIU Guidance Application, Sanctions Regime Logic, TFS Compliance Reasoning, Proliferation Financing Logic, CPF Analysis Logic, PDPL Application Reasoning, Digital Asset Reasoning, VARA Reasoning, LBMA RGG Logic, CAHRA Determination, Conflict Zone Identification, Refinery Assessment Reasoning, Supply Chain Risk Logic, Invoice Pricing Reasoning, TBML Pattern Reasoning, Structuring Pattern Reasoning, Smurfing Pattern Reasoning, Velocity Anomaly Reasoning, Circular Transaction Reasoning, Beneficial Owner Tracing Logic, Corporate Structure Unraveling, PEP Connection Reasoning, Adverse Media Assessment, Source of Funds Reasoning, Source of Wealth Reasoning, Third-Party Payment Logic, False Positive Determination, Screening Match Assessment, Policy Application Reasoning, Procedure Compliance Reasoning, Control Design Reasoning, Testing Methodology Reasoning, Documentation Requirement Reasoning, Record-Keeping Standard Reasoning, Board Reporting Thresholds, Senior Management Escalation Logic, Governance Structure Reasoning, Reporting Line Assessment, Authority Assessment, Whistleblower Assessment, Internal Disclosure Timing Logic, Legal Privilege Assessment, Regulatory Strategy Reasoning, Examination Preparation Logic, Negotiation Logic, Precedent Application, Regulatory Trend Analysis, Industry Practice Reasoning, Best Practice Application, Proportionate Response Determination, Cost-Benefit Analysis, Resource Allocation Reasoning, Priority Setting Logic, Timeline Assessment, Remediation Feasibility Reasoning, Control Implementation Reasoning, Training Effectiveness Reasoning, Staff Capability Assessment, Stakeholder Risk Assessment, Relationship Management Reasoning, Regulatory Relations Logic, Compliance Culture Development, Incentive Structure Reasoning, Penalty Assessment Reasoning, Enforcement Risk Reasoning, Consent Probability Assessment, Production Order Likelihood, Internal Investigation Scope, Evidence Preservation Logic, Chain of Custody Reasoning, Documentation Standards Reasoning, Audit Trail Integrity Assessment, Hawala Network Mapping Logic, Proliferation Financing Pathway Reasoning, Free Trade Zone Risk Logic, NGO Charity Diversion Reasoning, Carbon Credit Fraud Detection Logic, Crypto Travel Rule Compliance Reasoning, Dark-Web Signal Integration, Correspondent Banking Risk Logic, OTC Desk Risk Reasoning, Sanctions Maritime Evasion Logic, Parallel Import Risk Logic, Construction Kickback Reasoning, Healthcare Fraud Pattern Logic, Virtual IBAN Abuse Reasoning, Funnel Account Cascade Logic, Mule Network Attribution Logic, Luxury Goods Chain Logic, Precious Stones Provenance Logic, Romance Scam Financial Profile Reasoning, Professional ML Ecosystem Reasoning, Geopolitical Risk Reasoning, Country Risk Inference, Sovereign Risk Logic, Political Stability Reasoning, Regime Change Impact Reasoning, Secondary Sanctions Exposure Reasoning, Extra-Territorial Jurisdiction Reasoning, Comity and Conflict-of-Laws Reasoning, MLAT Feasibility Reasoning, International Cooperation Prospect Reasoning, Kleptocracy Extraction Pathway Reasoning, State Capture Enablement Logic, Grand Corruption Chain Reasoning, Bribery Predicate Nexus Reasoning, Financial Statement Fraud Logic, Earnings Management Pattern Reasoning, Revenue Recognition Manipulation Reasoning, Off-Balance-Sheet Exposure Reasoning, Transfer Pricing Abuse Logic, BEPS Erosion Pathway Reasoning, Tax Haven Usage Reasoning, CRS/FATCA Evasion Logic, Beneficial Ownership Opacity Reasoning, Market Manipulation Signal Logic, Pump-and-Dump Sequence Reasoning, Insider Trading Nexus Reasoning, Front-Running Pattern Logic, Wash Trading Detection Reasoning, Market Abuse Mosaic Reasoning, Capital Markets Abuse Escalation Logic, Insurance Policy ML Vector Reasoning, Real Estate Over-Valuation Reasoning, Mortgage Fraud Signal Logic, Investment Fraud Profile Reasoning, BEC Mule Chain Reasoning, Account Takeover Pathway Logic, SIM-Swap Fraud Reasoning, APP Fraud Recovery Logic, Pig-Butchering Victim Flow Reasoning, AI Governance Gate Reasoning, Model Drift Detection Logic, Algorithmic Bias Assessment Reasoning, Explainability Gap Reasoning, Fairness Testing Reasoning, Adversarial ML Attack Reasoning, Data Poisoning Detection Logic, Prompt Injection Defense Reasoning, Federated Learning Risk Reasoning, Differential Privacy Trade-off Reasoning, Zero-Knowledge Proof Validity Reasoning, Quantum Threat Timeline Reasoning, Post-Quantum Migration Logic, Digital Dirham CBDC Compliance Reasoning, Cross-CBDC Bridge Reasoning, Programmable Money Risk Reasoning, Stablecoin Reserve Adequacy Reasoning, DeFi Protocol Governance Reasoning, Smart Contract Audit Reasoning, NFT Wash Trading Logic, DAO Treasury Exposure Reasoning, Layer-2 Rollup Compliance Reasoning, Greenwashing Three-Layer Test Reasoning, EU Taxonomy DNSH Reasoning, SFDR Article Classification Logic, TCFD Scenario Pathway Reasoning, Double Materiality Reasoning, TNFD LEAP Reasoning, Biodiversity Dependency Reasoning, Forced-Labour Chain Reasoning, ILO 11 Indicators Application Reasoning, UNGP Protect-Respect-Remedy Reasoning, CSDDD Mandatory HRDD Reasoning, Human Rights Defender Protection Reasoning, Environmental Crime Predicate Reasoning, Wildlife Trafficking Financial Flow Reasoning, Asset Recovery Pathway Reasoning, Unexplained Wealth Order Prospect Reasoning, Confiscation Order Feasibility Reasoning, Civil Recovery Strategy Reasoning, Deferred Prosecution Likelihood Reasoning, Corporate Liability Attribution Reasoning, Adequate Procedures Defense Reasoning, Emerging Threat Zero-Day Reasoning, Horizon Scanning Logic, Regulatory Gap Bridging Reasoning, Geopolitical Recalibration Trigger Reasoning, Portfolio-Wide Impact Scan Logic, FATF IO Effectiveness Scoring Reasoning, Systemic Risk Contagion Reasoning, Macro Prudential Risk Reasoning, Liquidity Stress Trigger Reasoning, Operational Resilience Gap Reasoning, Recovery Plan Credibility Reasoning, Too-Big-To-Fail Reasoning, Settlement Finality Risk Reasoning, CCP Default Cascade Reasoning, Payment System Dependency Reasoning, Conduct Risk Escalation Reasoning, Mis-Selling Suitability Logic, Target Market Compliance Reasoning, Product Governance Gap Reasoning, Vulnerable Customer Protection Reasoning, Financial Exclusion Risk Reasoning, Algorithmic Credit Scoring Bias Reasoning, Fair Lending Compliance Reasoning, Community Reinvestment Logic';

const ANALYSIS_RAW =
  'Transaction Analysis, Pattern Detection, Trade-Based Money Laundering Analysis, Velocity Analysis, Structuring Investigation, Smurfing Investigation, Placement/Layering/Integration Staging, Cash-Intensive Business Assessment, Circular Transaction Analysis, Round Dollar Analysis, Multiple Transaction Analysis, Third-Party Payment Analysis, Invoice Pricing Analysis, Pricing Discrepancy Analysis, Over-Invoice Analysis, Under-Invoice Analysis, Documentation Discrepancy Analysis, TBML Red Flag Analysis, Enterprise-Wide Risk Assessment, Business-Wide Risk Assessment, Gap Analysis, Control Effectiveness Testing, Compliance Maturity Assessment, Regulatory Examination Analysis, Audit Trail Forensics, Customer Risk Scoring, Source of Funds Analysis, Source of Wealth Analysis, UBO Beneficial Ownership Mapping, Corporate Structure Analysis, Family Connection Tracing, Wealth Correlation Analysis, PEP & Corruption Investigation, Adverse Media Deep Review, Sanctions Screening Analysis, Screening Match Validation, False Positive Resolution, Know Your Supplier Due Diligence, KYS Investigation, CAHRA Assessment, Conflict-Affected Area Analysis, High-Risk Area Identification, Refinery Due Diligence, Refinery Compliance Evaluation, LBMA Certification Verification, LBMA RGG Steps 1-5 Assessment, Chain-of-Custody Verification, Responsible Sourcing Assessment, Conflict Minerals Analysis, Country-of-Origin Verification, Mine Location Assessment, Artisanal Mining Assessment, Policy Gap Analysis, Regulatory Compliance Mapping, Control Documentation Review, Governance Structure Assessment, Training Effectiveness Analysis, Red Flag Recognition Testing, Tipping-Off Risk Assessment, Consent Feasibility Analysis, Legal Professional Privilege Assessment, Materiality Assessment, Regulatory Intelligence Analysis, Regulatory Examination Forensics, Industry Precedent Analysis, Peer Enforcement Action Analysis, FIU Correspondence Analysis, FIU Filing Pattern Analysis, FATF Mutual Evaluation Analysis, FATF Deficiency Analysis, Cabinet Resolution Interpretation Analysis, MoE Circular Analysis, CBUAE Directive Analysis, Sanctions Regime Deep Analysis, TFS Compliance Deep Analysis, Proliferation Financing Analysis, CPF Control Analysis, PDPL Data Privacy Analysis, Digital Asset Deep Analysis, Cryptocurrency Analysis, Virtual Asset Analysis, VARA Framework Analysis, Supply Chain Risk Deep Analysis, Vendor Risk Profiling, Third-Party Risk Assessment, Counterparty Risk Analysis, Beneficial Owner Verification, Relationship Manager Assessment, Compliance Culture Maturity Analysis, Whistleblower Investigation, Internal Disclosure Assessment, Board Reporting Analysis, Senior Management Briefing Analysis, Governance Structure Evaluation, Reporting Line Analysis, Authority Assessment, Committee Effectiveness Analysis, Compliance Calendar Review, Threshold Management Analysis, Alert Management Analysis, False Positive Root Cause Analysis, Compliance Tool Effectiveness Analysis, System Configuration Analysis, Database Integrity Analysis, Compliance Metric Analysis, Performance Indicator Analysis, Compliance KPI Assessment, Risk Register Review, Risk Heat Map Analysis, Remediation Roadmap Analysis, Remediation Tracking Analysis, Implementation Feasibility Analysis, Timeline Feasibility Analysis, Resource Requirement Analysis, Compliance Cost Analysis, Cost-Benefit Analysis, Budget Allocation Analysis, Staff Capability Analysis, Training Need Assessment, Compliance Awareness Assessment, Stakeholder Readiness Analysis, Change Management Analysis, Regulatory Relations Assessment, Examination Preparation Analysis, Negotiation Strategy Analysis, Enforcement Risk Assessment, Penalty Risk Calculation, Production Order Risk Assessment, Internal Investigation Scope Assessment, Evidence Preservation Analysis, Audit Trail Analysis, Documentation Standards Review, Record-Keeping Assessment, Retention Schedule Verification, Destruction Protocol Verification, Compliance Program Effectiveness Analysis, System Coverage Analysis, Control Coverage Analysis, Procedure Coverage Analysis, Documentation Coverage Analysis, Testing Coverage Analysis, Monitoring Coverage Analysis, Reporting Coverage Analysis, Governance Coverage Analysis, Training Coverage Analysis, Awareness Coverage Analysis, Vendor Management Analysis, Third-Party Oversight Analysis, Outsourcing Risk Analysis, Service Provider Risk Assessment, Subcontractor Risk Assessment, Compliance Due Diligence, Background Investigation, Screening Results Analysis, Match Validation, False Positive Investigation, Alert Investigation, Transaction Investigation, Customer Investigation, Supplier Investigation, Geographic Risk Investigation, Product Risk Investigation, Channel Risk Investigation, Business Line Risk Investigation, Customer Segment Investigation, Transaction Volume Investigation, Customer Behavior Investigation, Unusual Activity Investigation, Suspicious Pattern Investigation, Red Flag Investigation, Indicator Verification, Control Verification, Procedure Verification, Documentation Verification, Evidence Verification, Compliance Assertion Verification, Proliferation Financing Network Analysis, Correspondent Banking Deep Due Diligence, Hawala Network Reconstruction, Free Trade Zone Anomaly Analysis, NGO Fund Flow Tracing, Carbon Market Fraud Analysis, Crypto Travel Rule Gap Analysis, Dark-Web Entity Profiling, Luxury Goods Chain Analysis, Parallel Import Trade Analysis, Construction Bid-Rigging Analysis, Healthcare Billing Irregularity Analysis, Virtual IBAN Layering Analysis, Funnel Account Mule Network Analysis, Real Estate Over-Valuation Analysis, Insurance PEP Surrender Analysis, Correspondent Shell Layering Analysis, Tax Evasion Offshore Structure Analysis, Daigou Luxury Import Analysis, Precious Stones Provenance Verification, Crypto Ransomware Cash-Out Analysis, Romance Pig-Butchering Flow Analysis, Professional ML Invoice Fabrication Analysis, Gambling Chip-Wash Analysis, Maritime AIS Spoofing Analysis, Geopolitical Risk Deep Analysis, Country Risk Portfolio Scan, Sovereign Default Risk Analysis, Political Stability Index Analysis, Regime Change Scenario Analysis, Sanctions Programme Effectiveness Analysis, Secondary Sanctions Exposure Mapping, Multi-Regime Conflict Resolution Analysis, Regulatory Arbitrage Portfolio Analysis, Tax Evasion BEPS Deep Analysis, Transfer Pricing Manipulation Analysis, CRS/FATCA Gap Analysis, DAC6 Mandatory Disclosure Analysis, Beneficial Ownership Register Compliance Analysis, LEI Data Quality Analysis, Market Manipulation Deep Analysis, Capital Markets Abuse Network Analysis, Pump-and-Dump Sequence Analysis, Insider Trading Nexus Analysis, Wash Trading Network Analysis, Spoofing Pattern Analysis, Front-Running Signal Analysis, Short-and-Distort Campaign Analysis, Dark Pool Compliance Analysis, High-Frequency Trading Risk Analysis, Algorithmic Strategy Risk Analysis, Insurance ML Vector Deep Analysis, Premium Financing Fraud Analysis, Policy Surrender Pattern Analysis, Reinsurance Fronting Analysis, Financial Statement Fraud Investigation, Earnings Manipulation Deep Analysis, Revenue Fabrication Detection Analysis, Off-Balance-Sheet SPV Analysis, Goodwill Impairment Fraud Analysis, Round-Trip Revenue Analysis, Channel Stuffing Detection Analysis, Bill-and-Hold Fraud Analysis, Directors Remuneration Abuse Analysis, Executive Self-Dealing Analysis, Fiduciary Breach Investigation, Shadow Director Exposure Analysis, Piercing the Veil Analysis, Constructive Trust Analysis, Corporate Liability Chain Analysis, Deferred Prosecution Agreement Term Analysis, Monitoring Agreement Compliance Analysis, AI Model Risk Inventory Analysis, Algorithmic Bias Deep Analysis, Model Drift Root Cause Analysis, Explainability Gap Audit Analysis, Adversarial ML Threat Analysis, Data Poisoning Impact Analysis, Prompt Injection Vector Analysis, Federated Learning Compliance Analysis, Synthetic Data Adequacy Analysis, Re-Identification Risk Analysis, Privacy Impact Assessment, Data Protection Impact Assessment, Legitimate Interest Assessment, Data Minimisation Audit, Purpose Limitation Audit, Post-Quantum Cryptography Migration Analysis, Zero-Knowledge Proof Compliance Analysis, Quantum Threat Assessment, Digital Dirham CBDC Compliance Analysis, Cross-CBDC Bridge Risk Analysis, Programmable Money Risk Analysis, Stablecoin Reserve Audit, DeFi Protocol Governance Analysis, Smart Contract Vulnerability Analysis, NFT Wash-Trading Pattern Analysis, DAO Treasury Risk Analysis, Cross-Chain Bridge Exposure Analysis, Layer-2 Rollup Risk Analysis, Privacy Coin Exposure Analysis, Mixer and Tumbler Interaction Analysis, Greenwashing Three-Layer Detection Analysis, EU Taxonomy DNSH Compliance Analysis, SFDR Disclosure Gap Analysis, TCFD Scenario Analysis, Double Materiality Assessment, TNFD LEAP Biodiversity Analysis, Nature Capital Dependency Analysis, Forced-Labour ILO 11 Scoring Analysis, Child Labour TVPRA List Analysis, UNGP HRDD Gap Analysis, CSDDD Compliance Gap Analysis, Modern Slavery Act Reporting Analysis, Loi de Vigilance Compliance Analysis, UFLPA Rebuttable Presumption Analysis, Human Rights Defender Context Analysis, Environmental Crime Proceeds Tracing, Wildlife Trafficking Financial Flow Analysis, Illegal Mining Proceeds Analysis, Illegal Logging Supply Chain Analysis, Blood Diamond Chain-of-Custody Analysis, Unexplained Wealth Order Prospect Analysis, Asset Freezing Order Impact Analysis, Confiscation Order Preparation Analysis, Civil Recovery Asset Mapping, Non-Conviction Forfeiture Analysis, Deferred Prosecution Agreement Terms Analysis, Kleptocracy Extraction Mapping Analysis, State Capture Financial Flow Analysis, Grand Corruption Evidence Analysis, Leaked Dataset Intelligence Analysis, FinCEN Files Cross-Reference Analysis, Pandora Papers Entity Analysis, Panama Papers Structure Analysis, Suisse Secrets Counterparty Analysis, OCCRP Investigation Cross-Reference, Private Banking EDD Dossier Analysis, UHNW Wealth Source Verification Analysis, Family Office Governance Analysis, Trust Structure Beneficial Ownership Analysis, Charitable Trust Fund Flow Analysis, Waqf Asset Governance Analysis, Superyacht Beneficial Ownership Analysis, Fine Art Provenance Deep Analysis, Cultural Property 1970 Convention Analysis, Wine and Whisky Cask Provenance Analysis, Numismatics ML Risk Analysis, Sports Club Ownership ML Analysis, Trophy Agricultural Land Beneficial Ownership Analysis, Systemic Risk Contagion Analysis, Macro Prudential Risk Assessment, Liquidity Coverage Ratio Analysis, Net Stable Funding Ratio Analysis, Capital Adequacy Analysis, Recovery Plan Credibility Analysis, Resolution Plan Feasibility Analysis, Bail-In Execution Analysis, CCP Exposure Concentration Analysis, Settlement Finality Risk Analysis, Payment System Resilience Assessment, Operational Resilience Self-Assessment, Critical Functions Mapping Analysis, Conduct Risk Deep Analysis, Mis-Selling Investigation Analysis, Suitability Assessment Deep Analysis, Target Market Compliance Analysis, Product Governance Gap Analysis, Retail Client Protection Analysis, Vulnerable Customer Identification Analysis, Financial Exclusion Risk Analysis, Algorithmic Credit Scoring Fairness Analysis, Fair Lending Compliance Analysis, Community Reinvestment Assessment, Multilingual Name-Screening Gap Analysis, Non-English Adverse Media Deep Analysis, Behavioral Deviation Baseline Analysis, Cross-Asset Wealth Concealment Analysis, FinTech EMI ML Risk Analysis, Virtual IBAN Pass-Through Analysis, BNPL Fraud Proceeds Analysis, Instant Payment Rail Risk Analysis, Trade Finance TBML Deep Analysis, Phantom Invoice Fraud Analysis, Circular Trade Documentary Analysis, Warehouse Receipt Fraud Analysis, Advance Payment Fraud Analysis, Back-to-Back LC Fraud Analysis, FTZ Re-Invoicing Fraud Analysis, Correspondent De-Risking Intelligence Analysis, De-Risking Pattern Systemic Analysis, UAE Statutory Reference Mapping Analysis, Synthetic Identity Composition Analysis, AI-Generated Document Detection Analysis, AI-Generated Web Presence Analysis, MLRO Fitness and Propriety Assessment, CCO Independence Evaluation, Emerging Threat Zero-Day Cataloguing Analysis, Portfolio Geopolitical Impact Scan, FATF IO Effectiveness Gap Analysis';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Keyword-driven domain inference. Order matters — more specific patterns
 * fire first so (e.g.) "PEP & Corruption Investigation" routes to KYC_CDD
 * rather than INVESTIGATIONS, and "Digital Asset Reasoning" routes to
 * DIGITAL_ASSETS rather than AML_CORE.
 */
export function inferDomain(label: string): SkillDomain {
  const L = label.toLowerCase();
  // Highest-specificity domains first.
  if (/\bsanction|\btfs\b|proliferation|\bcpf\b|embargo|secondary sanction|extra-territorial|deferred prosecution|adequate procedures defense/.test(L)) return 'SANCTIONS_TFS';
  if (/\bcrypto|virtual asset|digital asset|\bvara\b|blockchain|nft|dao\b|defi|smart contract|stablecoin|cbdc|digital dirham|layer-2|cross-chain|mixer|tumbler|chain-hop|privacy coin|on-chain|dex\b|yield farm|flash loan|oracle manip|mev\b|zero-knowledge|quantum-safe|post-quantum|federated learning|differential privacy/.test(L)) return 'DIGITAL_ASSETS';
  if (/\bpdpl\b|data priv|data breach|data minimis|purpose limitation|re-identification|privacy impact|data protection impact|legitimate interest/.test(L)) return 'DATA_PRIVACY';
  if (/lbma|cahra|conflict mineral|\brefinery|responsible sourc|\brgg\b|chain-of-custody|country-of-origin|\binvoice|pricing discrepancy|over-invoice|under-invoice|supply chain|vendor|third[- ]party|counterparty|subcontractor|outsourc|service provider|mine loc|artisanal|know your supplier|\bkys\b|conflict zone|supply chain|precious stone|dpms|gold souk|blood diamond|asm\b|illegal mining|illegal logging|illegal fishing|wildlife traffick|conflict-affected/.test(L)) return 'SUPPLY_CHAIN';
  if (/goaml|\bfiu\b|\bstr\b|\bsar\b|\bffr\b|\bpnmr\b|regulatory report|filing|report(ing)? protocol|board report|senior management brief|str-tf|ffr-pf/.test(L)) return 'REPORTING';
  if (/\besg\b|greenwash|impact.wash|tcfd|sfdr|eu taxonomy|tnfd|biodiversit|nature capital|carbon (credit|market|offset|fraud)|paris agreement article 6|double materiality|additionality|oecd pillar|global minimum tax|issb ifrs|isae 3000|aa1000|vcs|gold standard|acr|repRisk|sustainalytics|msci esg/.test(L)) return 'ESG_CLIMATE';
  if (/human rights|forced.labour|child.labour|modern slavery|\bungp\b|\bhrdd\b|csddd|lksg|loi de vigilance|uflpa|ilo 11|human trafficking|human rights defender|land rights|ilegal wildlife|illegal logging|environmental crime/.test(L)) return 'HUMAN_RIGHTS';
  if (/geopolit|country risk|sovereign risk|political stab|regime change|kleptocracy|state capture|grand corruption|leaked dataset|fincen files|pandora papers|panama papers|suisse secrets|occrp|investigative journalism|interpol|europol|\bmlat\b|extradition|mutual legal assistance|international cooperation liaison/.test(L)) return 'GEOPOLITICAL';
  if (/financial statement fraud|earnings management|revenue recogni.* fraud|revenue fabrication|round-trip revenue|channel stuffing|bill-and-hold fraud|goodwill impairment fraud|off-balance-sheet|cookie jar|big bath|channel stuffing|forensic accounting|transfer pricing|beps|tax haven|offshore structure map|tax evasion offshore|crs.fatca|dac6|bribery|facilitation payment|self-dealing|fiduciary breach|shadow director|piercing the veil|constructive trust|corporate liability chain|deferred prosecution/.test(L)) return 'FORENSIC_ACCOUNTING';
  if (/market manip|pump.and.dump|wash trad|spoof|front.run|insider trad|short.and.distort|capital market|market abuse|dark pool|high.frequency trad|algorithmic strategy risk|best execution|payment for order flow|securities fraud|market integrity|cross-market manip|layered securities|securit(ies|y) fraud|capital market|market.microstructure/.test(L)) return 'MARKETS';
  if (/asset recov|unexplained wealth|confiscation order|civil recovery|non-conviction.based forfeiture|asset freez|illegals proceeds|asset strip|money recover/.test(L)) return 'ASSET_RECOVERY';
  if (/\bintelligence|osint|humint|geoint|imint|sigint|socmint|satellite|dark.web|dark web|cyber intelligence|intelligence fusion|intelligence cor|open source intelligence|leaked dataset|investigative journalism/.test(L)) return 'INTELLIGENCE';
  if (/regtech|ai (risk|gov)|model risk|algorithmic bias|explainable ai|ai governance|model drift|adversarial ml|data poisoning|prompt injection|synthetic identity|deepfake|biometric|digital identity|quantum threat|quantum-safe|post-quantum|zero-knowledge proof|federated learning|mlro fitness|cco independence|ai-generated/.test(L)) return 'TECHNOLOGY';
  if (/fatf|cbuae|\bmoe\b|cabinet resolution|regulatory (strategy|interpretation|inference|trend|intelligence|writing|liaison|relations|examination|compliance mapping)|mutual evaluation|examination (preparation|strategy|analysis|forensic|reasoning|logic)|enforcement|regulatory gap|horizon scan|regulatory arbitage/.test(L)) return 'REGULATORY';
  if (/\bkyc\b|\bcdd\b|\bedd\b|\bubo\b|beneficial owner|customer due|source of (funds|wealth)|\bpep\b|adverse media|corporate structure|family connection|wealth correlation|background investigation|customer (risk|investigation|segment|behavior)|private banking|uhnw|family office|trust (structure|deed)|charitable trust|waqf|superyacht|private aircraft/.test(L)) return 'KYC_CDD';
  if (/board|senior management|committee|governance|\bmlro\b|authority assessment|reporting line|whistleblower|internal disclosure|(legal )?priv(ilege)?|compliance culture|incentiv|esg governance|board oversight|executive accountability|internal audit|external assurance|ccoo?\b|directors|remuneration|audit committee/.test(L)) return 'GOVERNANCE';
  if (/\bewra\b|\bbwra\b|enterprise-wide|business-wide|risk (matrix|register|score|assess|scoring|appetite|heat|profil)|inherent risk|residual risk|likelihood|materiality|geographic risk|product risk|channel risk|business line|supplier risk|stakeholder risk|outsourcing risk|penalty|production order|liquidity coverage|net stable funding|capital adequacy|lcr|nsfr|recovery plan|resolution plan|bail-in|systemic risk|operational resilience|ccp exposure|payment system resil|conduct risk|mis-selling|suitability/.test(L)) return 'RISK_ASSESSMENT';
  if (/training|awareness|coaching|staff|scenario-based|learning|capability|change management|stakeholder readiness/.test(L)) return 'TRAINING';
  if (/investigat|forensic|trac(e|ing)|unravel|tbml|trade-based|structuring|smurfing|velocity|circular|typology|\bred flag|suspicious|alert|unusual activity|pattern detection|round dollar|multiple transaction|transaction (analysis|pattern)|\bcash-intensive|ponzi|pyramid|bec|account takeover|sim-swap|app fraud|pig.butchering|romance scam|insurance fraud|mortgage fraud|investment fraud|advance.fee|ghost employee|payroll fraud|expense fraud|procurement fraud|bid rigging|kickback|contract splitting/.test(L)) return 'INVESTIGATIONS';
  if (/documentation|record-keeping|audit trail|evidence (preservation|collection|verification|standards)|chain of custody|retention schedule|destruction protocol|documentation (standards|requirement|coverage|verification)/.test(L)) return 'DOCUMENTATION';
  if (/system (administration|coverage|configuration)|database|compliance tool|compliance (metric|kpi|calendar)|performance (monitoring|indicator)|threshold|\balert|false positive|monitoring coverage/.test(L)) return 'COMPLIANCE_SYS';
  if (/financial crime|money launder(?!ing repor)|financial crime/.test(L)) return 'FINANCIAL_CRIME';
  if (/negotiat|stakeholder|communication|judgment|attention to detail|escalation|culture|relationship manag|consent/.test(L)) return 'SOFT_SKILLS';
  return 'AML_CORE';
}

// ────────────────────────────────────────────────────────────────────────────
// Build: dedupe across layers by slug, preserving first-seen ordering.
// Layer priority: competency → reasoning → analysis.
// ────────────────────────────────────────────────────────────────────────────

function buildSkills(): readonly Skill[] {
  const seen = new Set<string>();
  const out: Skill[] = [];
  const ingest = (raw: string, layer: SkillLayer) => {
    for (const chunk of raw.split(',')) {
      const label = chunk.trim();
      if (!label) continue;
      const base = slug(label);
      if (!base) continue;
      // If the base slug is already claimed by an earlier layer, register the
      // skill in this layer too with a layer-suffixed id. This preserves the
      // authoritative source text (which deliberately lists certain skills in
      // multiple layers — e.g. "CAHRA Assessment" is both a competency and a
      // deep-analysis operation) while keeping ids globally unique.
      const id = seen.has(base) ? `${base}-${layer}` : base;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        label,
        domain: inferDomain(label),
        layer,
        weight: 1.0,
      });
    }
  };
  ingest(COMPETENCIES_RAW, 'competency');
  ingest(REASONING_RAW, 'reasoning');
  ingest(ANALYSIS_RAW, 'analysis');
  return Object.freeze(out);
}

export const SKILLS: readonly Skill[] = buildSkills();

// ────────────────────────────────────────────────────────────────────────────
// Derived views — all frozen, computed once at module load.
// ────────────────────────────────────────────────────────────────────────────

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  SKILLS.map((s) => [s.id, s]),
);

function groupBy<K extends string>(
  skills: readonly Skill[],
  key: (s: Skill) => K,
): Readonly<Record<K, readonly Skill[]>> {
  const acc: Partial<Record<K, Skill[]>> = {};
  for (const s of skills) {
    const k = key(s);
    (acc[k] ??= []).push(s);
  }
  for (const k of Object.keys(acc)) Object.freeze(acc[k as K]);
  return Object.freeze(acc) as Readonly<Record<K, readonly Skill[]>>;
}

export const SKILLS_BY_DOMAIN: Readonly<Record<SkillDomain, readonly Skill[]>> =
  groupBy(SKILLS, (s) => s.domain);

export const SKILLS_BY_LAYER: Readonly<Record<SkillLayer, readonly Skill[]>> =
  groupBy(SKILLS, (s) => s.layer);

function countBy<K extends string>(
  groups: Readonly<Record<K, readonly Skill[]>>,
): Readonly<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const [k, v] of Object.entries(groups) as Array<[K, readonly Skill[]]>) {
    out[k] = v.length;
  }
  return Object.freeze(out) as Readonly<Record<K, number>>;
}

export const SKILLS_DOMAIN_COUNTS: Readonly<Record<string, number>> =
  countBy(SKILLS_BY_DOMAIN);

export const SKILLS_LAYER_COUNTS: Readonly<Record<string, number>> =
  countBy(SKILLS_BY_LAYER);

// ────────────────────────────────────────────────────────────────────────────
// Prompt composition — kept terse because the weaponized prompt is already
// large. The agents need to know the catalogue exists, its shape, and a
// handful of samples per domain; the full list is loaded into the model's
// context only when the caller sets `includeSkillsFullList: true`.
// ────────────────────────────────────────────────────────────────────────────

export interface SkillsSummaryOptions {
  includeFullList?: boolean;
  samplesPerDomain?: number; // default 3
}

export function skillsCatalogueSummary(opts: SkillsSummaryOptions = {}): string {
  const samples = Math.max(0, opts.samplesPerDomain ?? 3);
  const lines: string[] = [];
  lines.push(
    `Skills catalogue: ${SKILLS.length} skills registered across ${Object.keys(SKILLS_BY_DOMAIN).length} domains and 3 layers (competency / reasoning / analysis).`,
  );
  const layerBits = (Object.keys(SKILLS_LAYER_COUNTS) as SkillLayer[])
    .map((k) => `${k}=${SKILLS_LAYER_COUNTS[k]}`)
    .join(', ');
  lines.push(`By layer: ${layerBits}.`);
  lines.push('By domain (descending):');
  const domains = Object.keys(SKILLS_BY_DOMAIN) as SkillDomain[];
  domains.sort((a, b) => SKILLS_DOMAIN_COUNTS[b]! - SKILLS_DOMAIN_COUNTS[a]!);
  for (const d of domains) {
    const count = SKILLS_DOMAIN_COUNTS[d] ?? 0;
    const sampleLabels = SKILLS_BY_DOMAIN[d]
      .slice(0, samples)
      .map((s) => s.label)
      .join('; ');
    lines.push(`  - ${d}: ${count}${samples > 0 && sampleLabels ? ` (e.g. ${sampleLabels})` : ''}`);
  }
  if (opts.includeFullList) {
    lines.push('');
    lines.push('FULL SKILL LIST (id · label · domain · layer):');
    for (const s of SKILLS) {
      lines.push(`  ${s.id} · ${s.label} · ${s.domain} · ${s.layer}`);
    }
  }
  lines.push(
    'You embody every skill in this catalogue in every reasoning chain. Cite skill ids where relevant. Never claim a skill beyond the weight declared. Any assertion that depends on a skill must name the skill id.',
  );
  return lines.join('\n');
}

/**
 * Stable, order-independent signature of the skills catalogue — used by
 * `buildWeaponizedBrainManifest` so any catalogue change shifts the
 * `catalogueHash`.
 */
export function skillsCatalogueSignature(): string {
  return JSON.stringify(
    [...SKILLS].map((s) => s.id).sort(),
  );
}
