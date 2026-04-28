// Hawkeye Sterling — FATF 40 Recommendations reference library.
//
// Every Recommendation indexed by ID with title, scope, and the canonical
// citation operators can quote verbatim into STRs, EDD memos, advisor
// answers, and Board reports. The library is the single source of truth
// for FATF anchoring across the brain — classifier hints, doctrines, and
// common-sense rules all reference these IDs.

export type FatfRecId =
  | 'fatf_r1' | 'fatf_r2' | 'fatf_r3' | 'fatf_r4' | 'fatf_r5'
  | 'fatf_r6' | 'fatf_r7' | 'fatf_r8' | 'fatf_r9' | 'fatf_r10'
  | 'fatf_r11' | 'fatf_r12' | 'fatf_r13' | 'fatf_r14' | 'fatf_r15'
  | 'fatf_r16' | 'fatf_r17' | 'fatf_r18' | 'fatf_r19' | 'fatf_r20'
  | 'fatf_r21' | 'fatf_r22' | 'fatf_r23' | 'fatf_r24' | 'fatf_r25'
  | 'fatf_r26' | 'fatf_r27' | 'fatf_r28' | 'fatf_r29' | 'fatf_r30'
  | 'fatf_r31' | 'fatf_r32' | 'fatf_r33' | 'fatf_r34' | 'fatf_r35'
  | 'fatf_r36' | 'fatf_r37' | 'fatf_r38' | 'fatf_r39' | 'fatf_r40';

export type FatfPillar =
  | 'AML_CFT_Policies' // R.1-2
  | 'ML_TF_Crime'      // R.3-8
  | 'Preventive'       // R.9-23
  | 'Transparency'     // R.24-25
  | 'Powers_Authorities' // R.26-35
  | 'International'    // R.36-40
  ;

export interface FatfRecommendation {
  id: FatfRecId;
  num: number;
  title: string;
  pillar: FatfPillar;
  scope: string;       // one-sentence summary of the obligation
  inrSummary: string;  // Interpretive Note key takeaway
  citation: string;    // canonical citation form
}

export const FATF_RECOMMENDATIONS: readonly FatfRecommendation[] = [
  // ── A. AML/CFT Policies and Coordination (R.1-2) ─────────────────────
  { id: 'fatf_r1', num: 1, title: 'Assessing risks and applying a risk-based approach', pillar: 'AML_CFT_Policies',
    scope: 'Identify, assess and understand ML/TF/PF risks at country and obliged-entity level; apply RBA to allocate resources.',
    inrSummary: 'INR.1: countries must conduct NRA and require obliged entities to do likewise; higher risk → enhanced measures, lower risk → simplified subject to evidence.',
    citation: 'FATF R.1 INR.1' },
  { id: 'fatf_r2', num: 2, title: 'National cooperation and coordination', pillar: 'AML_CFT_Policies',
    scope: 'Establish national-level coordination mechanisms across competent authorities, supervisors and FIUs.',
    inrSummary: 'INR.2: includes data-protection compatibility and inter-agency information sharing.',
    citation: 'FATF R.2 INR.2' },

  // ── B. Money Laundering and Terrorist Financing crimes (R.3-8) ───────
  { id: 'fatf_r3', num: 3, title: 'Money laundering offence', pillar: 'ML_TF_Crime',
    scope: 'Criminalise ML on the basis of the Vienna and Palermo Conventions; cover the widest range of predicate offences.',
    inrSummary: 'INR.3: defines designated categories of predicate offence (22 categories incl. tax crimes, environmental crime per FATF 2021).',
    citation: 'FATF R.3 INR.3' },
  { id: 'fatf_r4', num: 4, title: 'Confiscation and provisional measures', pillar: 'ML_TF_Crime',
    scope: 'Enable freezing, seizing and confiscation of laundered property, proceeds, instrumentalities, and property of corresponding value.',
    inrSummary: 'INR.4: include non-conviction-based confiscation where compatible with domestic legal principles.',
    citation: 'FATF R.4 INR.4' },
  { id: 'fatf_r5', num: 5, title: 'Terrorist financing offence', pillar: 'ML_TF_Crime',
    scope: 'Criminalise TF in line with the 1999 TF Convention; cover financing of terrorist organisations and individual terrorists.',
    inrSummary: 'INR.5: TF criminalisation extends beyond specific terrorist acts to organisation-level support.',
    citation: 'FATF R.5 INR.5' },
  { id: 'fatf_r6', num: 6, title: 'Targeted financial sanctions related to terrorism and TF', pillar: 'ML_TF_Crime',
    scope: 'Implement UNSC 1267/1989/2253 (ISIL/Al-Qaida) and 1988 (Taliban) targeted financial sanctions without delay.',
    inrSummary: 'INR.6: "without delay" means same day; freeze + prohibit dealing; covers funds + economic resources owned/controlled directly or indirectly.',
    citation: 'FATF R.6 INR.6' },
  { id: 'fatf_r7', num: 7, title: 'Targeted financial sanctions related to proliferation', pillar: 'ML_TF_Crime',
    scope: 'Implement UNSC TFS related to PF (Iran 2231; DPRK 1718) without delay.',
    inrSummary: 'INR.7: PF TFS apply equally to domestic and foreign customers; covers WMD-related goods and services.',
    citation: 'FATF R.7 INR.7' },
  { id: 'fatf_r8', num: 8, title: 'Non-profit organisations', pillar: 'ML_TF_Crime',
    scope: 'Apply risk-based oversight to NPOs to mitigate TF abuse without disrupting legitimate activity.',
    inrSummary: 'INR.8: identify NPO subset at TF risk; do not apply blanket measures to all NPOs.',
    citation: 'FATF R.8 INR.8' },

  // ── C. Preventive measures (R.9-23) ──────────────────────────────────
  { id: 'fatf_r9', num: 9, title: 'Financial institution secrecy laws', pillar: 'Preventive',
    scope: 'Ensure secrecy laws do not inhibit AML/CFT implementation.',
    inrSummary: 'INR.9: information sharing among competent authorities and within group must be permitted.',
    citation: 'FATF R.9' },
  { id: 'fatf_r10', num: 10, title: 'Customer due diligence', pillar: 'Preventive',
    scope: 'Identify and verify customers and BOs; understand purpose and nature of relationship; conduct ongoing CDD.',
    inrSummary: 'INR.10: CDD threshold for occasional transactions = USD/EUR 15,000 (or wires per R.16); enhanced where higher risk; simplified where lower risk and evidenced.',
    citation: 'FATF R.10 INR.10' },
  { id: 'fatf_r11', num: 11, title: 'Record keeping', pillar: 'Preventive',
    scope: 'Retain CDD and transaction records for at least 5 years; ensure authority access on request.',
    inrSummary: 'INR.11: records must be sufficient to permit reconstruction of individual transactions.',
    citation: 'FATF R.11 INR.11' },
  { id: 'fatf_r12', num: 12, title: 'Politically exposed persons', pillar: 'Preventive',
    scope: 'Apply EDD to foreign PEPs always; domestic and IO PEPs on risk-based basis; cover RCAs.',
    inrSummary: 'INR.12: senior management approval, source of wealth/funds, enhanced monitoring; "once a PEP, always a PEP" for foreign by default.',
    citation: 'FATF R.12 INR.12' },
  { id: 'fatf_r13', num: 13, title: 'Correspondent banking', pillar: 'Preventive',
    scope: 'Apply EDD to cross-border correspondent banking relationships; prohibit shell-bank relationships.',
    inrSummary: 'INR.13: gather sufficient information about respondent; senior management approval; nested / payable-through accounts only with compliant respondent KYC.',
    citation: 'FATF R.13 INR.13' },
  { id: 'fatf_r14', num: 14, title: 'Money or value transfer services', pillar: 'Preventive',
    scope: 'License or register MVTS providers; subject to AML/CFT supervision; covers agents.',
    inrSummary: 'INR.14: action against unregistered MVTS; agents in scope of provider AML programme.',
    citation: 'FATF R.14 INR.14' },
  { id: 'fatf_r15', num: 15, title: 'New technologies', pillar: 'Preventive',
    scope: 'Identify and assess ML/TF risks of new products, services, technologies, and business practices.',
    inrSummary: 'INR.15: covers virtual assets and VASPs; risk assessment before launch; VASP licensing/registration mandatory.',
    citation: 'FATF R.15 INR.15' },
  { id: 'fatf_r16', num: 16, title: 'Wire transfers', pillar: 'Preventive',
    scope: 'Originator and beneficiary information must accompany wire transfers; same applies to virtual asset transfers (Travel Rule).',
    inrSummary: 'INR.16: threshold USD/EUR 1,000 for required information; full info above; VASP-to-VASP Travel Rule with sunrise-period workarounds.',
    citation: 'FATF R.16 INR.16' },
  { id: 'fatf_r17', num: 17, title: 'Reliance on third parties', pillar: 'Preventive',
    scope: 'Permitted only where third party regulated and supervised; ultimate responsibility remains with the relying institution.',
    inrSummary: 'INR.17: information must be obtained immediately; third-party country must apply equivalent standards.',
    citation: 'FATF R.17 INR.17' },
  { id: 'fatf_r18', num: 18, title: 'Internal controls and foreign branches and subsidiaries', pillar: 'Preventive',
    scope: 'Implement AML/CFT programmes including compliance management, screening, training, and audit; apply group-wide.',
    inrSummary: 'INR.18: home-host coordination; higher of host vs home standards; address conflicts where local law restricts implementation.',
    citation: 'FATF R.18 INR.18' },
  { id: 'fatf_r19', num: 19, title: 'Higher-risk countries', pillar: 'Preventive',
    scope: 'Apply EDD to business relationships and transactions with persons from FATF-identified higher-risk countries.',
    inrSummary: 'INR.19: counter-measures including enhanced reporting, restrictions, prohibitions where called for by FATF.',
    citation: 'FATF R.19 INR.19' },
  { id: 'fatf_r20', num: 20, title: 'Reporting of suspicious transactions', pillar: 'Preventive',
    scope: 'STR filing on reasonable suspicion of ML/TF — promptly to the FIU.',
    inrSummary: 'INR.20: reporting obligation includes attempted transactions; protection from civil/criminal liability for good-faith filing.',
    citation: 'FATF R.20 INR.20' },
  { id: 'fatf_r21', num: 21, title: 'Tipping-off and confidentiality', pillar: 'Preventive',
    scope: 'Prohibit disclosure of STR or related information to the customer or third parties; protect filers.',
    inrSummary: 'INR.21: tipping-off prohibition extends to associated information; staff protection from civil/criminal liability for good-faith filing.',
    citation: 'FATF R.21 INR.21' },
  { id: 'fatf_r22', num: 22, title: 'DNFBPs: customer due diligence', pillar: 'Preventive',
    scope: 'Apply CDD/recordkeeping to DNFBPs (casinos, real estate, DPMS, lawyers, accountants, TCSPs).',
    inrSummary: 'INR.22: thresholds vary by sector (e.g. DPMS USD/EUR 15,000 cash; real estate any value).',
    citation: 'FATF R.22 INR.22' },
  { id: 'fatf_r23', num: 23, title: 'DNFBPs: other measures', pillar: 'Preventive',
    scope: 'Apply STR, internal-controls, training, and supervision to DNFBPs equivalent to FIs.',
    inrSummary: 'INR.23: legal-privilege carve-out for lawyers/accountants only for genuinely privileged communications.',
    citation: 'FATF R.23 INR.23' },

  // ── D. Transparency and BO of legal persons and arrangements (R.24-25)
  { id: 'fatf_r24', num: 24, title: 'Transparency and beneficial ownership of legal persons', pillar: 'Transparency',
    scope: 'Ensure adequate, accurate and timely BO information available to competent authorities; address misuse of legal persons.',
    inrSummary: 'INR.24: registry-based, beneficial-ownership-based, or alternative mechanisms; bearer shares prohibited or controlled.',
    citation: 'FATF R.24 INR.24' },
  { id: 'fatf_r25', num: 25, title: 'Transparency and beneficial ownership of legal arrangements', pillar: 'Transparency',
    scope: 'Apply equivalent BO regime to trusts and similar arrangements (settlor, trustee, protector, beneficiaries, controllers).',
    inrSummary: 'INR.25: trustee duty to obtain and maintain BO information; available to competent authorities upon request.',
    citation: 'FATF R.25 INR.25' },

  // ── E. Powers and responsibilities of authorities (R.26-35) ──────────
  { id: 'fatf_r26', num: 26, title: 'Regulation and supervision of financial institutions', pillar: 'Powers_Authorities',
    scope: 'License/register FIs, supervise on risk-sensitive basis, prevent criminal control.',
    inrSummary: 'INR.26: fit-and-proper testing; group-wide supervision where applicable.',
    citation: 'FATF R.26 INR.26' },
  { id: 'fatf_r27', num: 27, title: 'Powers of supervisors', pillar: 'Powers_Authorities',
    scope: 'Supervisors must have adequate powers to monitor and ensure compliance, including on-site and off-site inspection.',
    inrSummary: 'INR.27: power to compel production of records; sanctioning powers where non-compliance found.',
    citation: 'FATF R.27 INR.27' },
  { id: 'fatf_r28', num: 28, title: 'Regulation and supervision of DNFBPs', pillar: 'Powers_Authorities',
    scope: 'License/register DNFBPs and subject them to risk-sensitive AML/CFT supervision.',
    inrSummary: 'INR.28: supervisor identity varies (SRO, sectoral supervisor, central supervisor) but powers must be adequate.',
    citation: 'FATF R.28 INR.28' },
  { id: 'fatf_r29', num: 29, title: 'Financial intelligence units', pillar: 'Powers_Authorities',
    scope: 'Establish FIU as national centre for receipt, analysis, and dissemination of STRs and other AML/CFT information.',
    inrSummary: 'INR.29: operational independence; access to information; secure information storage.',
    citation: 'FATF R.29 INR.29' },
  { id: 'fatf_r30', num: 30, title: 'Responsibilities of law enforcement and investigative authorities', pillar: 'Powers_Authorities',
    scope: 'LE must investigate ML, TF, predicate offences and asset recovery; parallel financial investigations encouraged.',
    inrSummary: 'INR.30: dedicated capacity for complex ML/TF investigations.',
    citation: 'FATF R.30 INR.30' },
  { id: 'fatf_r31', num: 31, title: 'Powers of law enforcement and investigative authorities', pillar: 'Powers_Authorities',
    scope: 'LE must have powers to compel production, search, seize, take statements, use special techniques.',
    inrSummary: 'INR.31: special techniques include undercover, controlled delivery, surveillance — within constitutional limits.',
    citation: 'FATF R.31 INR.31' },
  { id: 'fatf_r32', num: 32, title: 'Cash couriers', pillar: 'Powers_Authorities',
    scope: 'Detect physical cross-border transportation of currency and bearer instruments via declaration/disclosure system.',
    inrSummary: 'INR.32: threshold USD/EUR 15,000; powers to stop, restrain, and confiscate where suspicion or false declaration.',
    citation: 'FATF R.32 INR.32' },
  { id: 'fatf_r33', num: 33, title: 'Statistics', pillar: 'Powers_Authorities',
    scope: 'Maintain comprehensive statistics on AML/CFT system effectiveness.',
    inrSummary: 'INR.33: statistics on STRs, ML/TF investigations, prosecutions, convictions, freezing/seizure/confiscation, MLA requests.',
    citation: 'FATF R.33 INR.33' },
  { id: 'fatf_r34', num: 34, title: 'Guidance and feedback', pillar: 'Powers_Authorities',
    scope: 'Supervisors and FIUs must provide ongoing guidance and feedback to assist compliance.',
    inrSummary: 'INR.34: feedback covers STR quality, typologies, sanctions trends.',
    citation: 'FATF R.34 INR.34' },
  { id: 'fatf_r35', num: 35, title: 'Sanctions', pillar: 'Powers_Authorities',
    scope: 'Effective, proportionate and dissuasive sanctions for natural and legal persons that fail to comply with AML/CFT requirements.',
    inrSummary: 'INR.35: sanctions include monetary penalties, suspension of licence, removal of senior officers.',
    citation: 'FATF R.35 INR.35' },

  // ── F. International Cooperation (R.36-40) ───────────────────────────
  { id: 'fatf_r36', num: 36, title: 'International instruments', pillar: 'International',
    scope: 'Become party to and implement Vienna, Palermo, Merida, TF Conventions and UNSC TFS resolutions.',
    inrSummary: 'INR.36: full compliance with relevant articles; reservations only where compatible with treaty.',
    citation: 'FATF R.36' },
  { id: 'fatf_r37', num: 37, title: 'Mutual legal assistance', pillar: 'International',
    scope: 'Provide widest possible MLA in ML/TF/predicate investigations; non-criminalisation of ML domestically not a barrier.',
    inrSummary: 'INR.37: MLA must extend to coercive measures including production orders, search, freezing, confiscation.',
    citation: 'FATF R.37 INR.37' },
  { id: 'fatf_r38', num: 38, title: 'Mutual legal assistance: freezing and confiscation', pillar: 'International',
    scope: 'Authority to take expeditious action in response to foreign requests to identify, freeze, seize, and confiscate.',
    inrSummary: 'INR.38: covers laundered property, proceeds, instrumentalities, property of corresponding value.',
    citation: 'FATF R.38 INR.38' },
  { id: 'fatf_r39', num: 39, title: 'Extradition', pillar: 'International',
    scope: 'Implement extradition for ML and TF; consider as extraditable offences in treaties.',
    inrSummary: 'INR.39: dual-criminality not required to be technical match; gender/ethnicity-neutral treatment.',
    citation: 'FATF R.39 INR.39' },
  { id: 'fatf_r40', num: 40, title: 'Other forms of international cooperation', pillar: 'International',
    scope: 'FIU-to-FIU, supervisor-to-supervisor, LE-to-LE cooperation through Egmont and other channels.',
    inrSummary: 'INR.40: information sharing must include BO, transactional data, and adverse-events reporting.',
    citation: 'FATF R.40 INR.40' },
];

const FATF_BY_ID: Record<FatfRecId, FatfRecommendation> = FATF_RECOMMENDATIONS.reduce(
  (acc, r) => ({ ...acc, [r.id]: r }),
  {} as Record<FatfRecId, FatfRecommendation>,
);

export function fatfById(id: string): FatfRecommendation | undefined {
  return FATF_BY_ID[id as FatfRecId];
}

export function fatfByPillar(pillar: FatfPillar): FatfRecommendation[] {
  return FATF_RECOMMENDATIONS.filter((r) => r.pillar === pillar);
}

export function fatfByNum(n: number): FatfRecommendation | undefined {
  return FATF_RECOMMENDATIONS.find((r) => r.num === n);
}
