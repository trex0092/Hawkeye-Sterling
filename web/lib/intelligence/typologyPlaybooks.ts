// Hawkeye Sterling — typology-specific MLRO playbooks.
//
// For each FATF/Egmont typology fingerprint, the engine emits a structured
// playbook the MLRO can hand directly to the analyst:
//   - immediate actions (do today)
//   - secondary verifications (this week)
//   - escalation triggers (when to file STR / freeze)
//   - red-line conditions (refuse-the-relationship triggers)
//   - regulatory citations (chapter and verse)

export interface TypologyPlaybook {
  typologyId: string;
  /** Plain-English summary of what's being mitigated. */
  summary: string;
  /** Same-day actions. */
  immediate: string[];
  /** Within-the-week verifications. */
  secondary: string[];
  /** Conditions that force an STR / freeze upgrade. */
  escalationTriggers: string[];
  /** Red-lines — refuse the relationship if any of these are true. */
  redLines: string[];
  /** Authoritative references. */
  citations: string[];
}

const PLAYBOOKS: Record<string, TypologyPlaybook> = {
  fatf_gold_trade_ml: {
    typologyId: "fatf_gold_trade_ml",
    summary:
      "Gold-trade laundering risk: cash-for-gold cycling, precious-metal export disguising illicit proceeds, mine-of-origin laundering through trade hubs (UAE, TR, HK).",
    immediate: [
      "Demand LBMA Responsible Gold accreditation evidence (or the refiner's equivalent national programme).",
      "Verify mine of origin to deposit level — reject vague 'mixed origin' or 'recycled' declarations without batch IDs.",
      "Run all transport-route countries against CAHRA + FATF lists; reject any that include conflict zones (DRC, CAR, SS, YE, MM, AF).",
      "Collect last 12 months of refining tickets and reconcile against bank deposits.",
    ],
    secondary: [
      "Independent assay on a sampled batch (pre-onboarding for high-volume customers).",
      "OECD Step-1 to Step-5 Due Diligence file complete for the supply chain.",
      "Cross-check counterparty's clients against PEP / sanctions / adverse-media lists.",
      "MoE Circular 2/2024 responsible-sourcing attestation on file.",
    ],
    escalationTriggers: [
      "Cash payment > AED 55,000 for a single batch (CTR threshold).",
      "Refiner unwilling / unable to produce LBMA / OECD chain-of-custody documentation.",
      "Customer requests delivery to free-zone vault without underlying commercial purpose.",
      "Any beneficial-ownership change during the relationship without disclosure.",
    ],
    redLines: [
      "Mine of origin in a UN-sanctioned conflict zone (DRC '1857' regime, CAR '2127', SS '2206', SO '751', YE '2140').",
      "Refiner is on the LBMA suspended / removed list.",
      "Counterparty knowingly transships through a comprehensive-sanctions jurisdiction (IR / KP / SY).",
    ],
    citations: [
      "FATF 2024 Money Laundering Risks in the Gold Sector",
      "LBMA Responsible Gold Guidance v9",
      "OECD Due Diligence Guidance — Gold Supplement",
      "MoE Circular No. 2 of 2024 (UAE responsible sourcing)",
      "FDL 10/2025 Art.20 (predicate offences) · Art.26-27 (filing obligations)",
    ],
  },
  fatf_tbml: {
    typologyId: "fatf_tbml",
    summary:
      "Trade-based money laundering: misrepresentation of price, quantity, or quality of goods to disguise illicit value transfer.",
    immediate: [
      "Pull last 12 months of invoices, bills of lading, and proof-of-delivery for the top-5 trading partners.",
      "Compute unit-price variance vs sector benchmarks — flag any deviation > 25%.",
      "Verify shipping lane against AIS data (vessel IMO + dark-fleet check).",
    ],
    secondary: [
      "Independent customs-broker review of HS code declarations for the past 12 months.",
      "Cross-check trading partners against UBO opacity registers.",
      "Review payment patterns for round-number / structured / third-party transfers.",
    ],
    escalationTriggers: [
      "Multi-invoicing pattern (same goods invoiced 2+ times across destinations).",
      "Phantom shipment confirmed (no AIS or customs trace).",
      "Counterparty on UBO-opaque jurisdiction with no operating substance.",
    ],
    redLines: [
      "Confirmed sanctions-evasion shipment.",
      "Customer involves a shell entity in a comprehensive-sanctions jurisdiction.",
    ],
    citations: [
      "FATF 2020 Trade-Based Money Laundering Update",
      "FATF / Egmont 2021 Trade-Based ML — Risk Indicators",
      "WCO TBML Risk Indicators",
      "FDL 10/2025 Art.20 / Art.26-27",
    ],
  },
  fatf_hawala_ivts: {
    typologyId: "fatf_hawala_ivts",
    summary:
      "Hawala / informal value transfer system risk: settlement off the regulated banking rails, cross-border value movement without a wire trail.",
    immediate: [
      "Confirm CBUAE Hawaladar registration (or the equivalent in the operating jurisdiction).",
      "Pull sample of customer receipts and reconcile against settlement counterparty list.",
      "Identify all settlement counterparties — apply enhanced sanctions screening to each.",
    ],
    secondary: [
      "Travel-rule compliance evidence for cross-border settlements.",
      "Daily / weekly net-position file (settlement-on-net pattern check).",
      "Customer-acceptance criteria + transaction-record system audit.",
    ],
    escalationTriggers: [
      "Unregistered hawaladar status.",
      "Settlement counterparty in a comprehensive-sanctions jurisdiction.",
      "Inability to produce customer-acceptance / transaction-record system on demand.",
    ],
    redLines: [
      "Operating without CBUAE / equivalent licence.",
      "Confirmed terrorism-financing nexus.",
    ],
    citations: [
      "FATF Recommendation 14 (MVTS providers)",
      "FATF 2013 Informal Value Transfer Systems Report",
      "CBUAE Hawaladar registration regime",
    ],
  },
  ofsi_shell_evasion: {
    typologyId: "ofsi_shell_evasion",
    summary:
      "Sanctions evasion via shell company: layering ownership through opaque jurisdictions to obscure designated parties' interest.",
    immediate: [
      "Demand UBO map down to natural persons holding ≥25% economic or voting interest.",
      "Run every layer of ownership against OFAC / OFSI / EU / UN / UAE EOCN lists.",
      "Apply OFAC 50% rule — block if cumulative designated-party ownership ≥50%.",
      "Test operating substance: employees, premises, revenue, real activity.",
    ],
    secondary: [
      "Commercial-purpose statement signed by senior management.",
      "Independent KYC provider audit of the corporate structure.",
      "Cross-regime sanctions check (OFSI 2024 designations sometimes lag OFAC).",
    ],
    escalationTriggers: [
      "Any layer in an opacity jurisdiction (BVI, KY, PA, BS) without operating substance.",
      "Cross-regime split designation (one regime designates, another doesn't).",
      "Refusal to disclose UBO at the natural-person level.",
    ],
    redLines: [
      "Designated party found in the ownership chain at any level (50% rule).",
      "Refusal to disclose UBO.",
    ],
    citations: [
      "OFAC 50% Rule (Aug 2014)",
      "OFSI 2024 Sanctions Evasion Through Shell Companies",
      "FATF R.24-25 (Beneficial Ownership)",
      "FDL 10/2025 Art.18 (UBO mandate)",
    ],
  },
  fatf_crypto_offramp: {
    typologyId: "fatf_crypto_offramp",
    summary:
      "Crypto-fiat off-ramp / VASP misuse: laundering value through virtual-asset rails, cashing out via a controlled VASP / OTC desk.",
    immediate: [
      "Demand VARA / FSRA / SCA licence (or equivalent in the operating jurisdiction).",
      "Pull wallet-address register (deposit + withdrawal addresses for the last 12 months).",
      "Run wallet addresses through Chainalysis / TRM / Elliptic — flag any direct or one-hop exposure to mixers, sanctioned wallets, or known illicit clusters.",
      "Confirm Travel-rule (FATF R.16) implementation for transactions ≥ USD 1,000.",
    ],
    secondary: [
      "Sample on-chain trace for top-5 inbound deposits.",
      "VASP counterparty due-diligence files.",
      "Custody architecture (hot/cold/multisig + key-holder identity).",
    ],
    escalationTriggers: [
      "Direct exposure to OFAC SDN-listed wallets / North Korean clusters / Tornado Cash et al.",
      "Travel-rule non-compliant for transactions ≥ USD 1,000.",
      "Inability to produce wallet register on demand.",
    ],
    redLines: [
      "Operating without a VASP licence in a regulated jurisdiction.",
      "Confirmed direct exposure to a sanctioned wallet.",
    ],
    citations: [
      "FATF Recommendation 15",
      "FATF 2021 VASP Updated Guidance",
      "VARA Rulebook (Dubai)",
      "FATF Travel Rule (R.16)",
    ],
  },
  fatf_tf: {
    typologyId: "fatf_tf",
    summary:
      "Terrorism financing risk: funding, materially supporting, or moving value to designated terrorist persons or organisations.",
    immediate: [
      "Freeze assets immediately if a designated person is identified.",
      "Notify EOCN within 24 hours.",
      "File FFR via goAML.",
      "Escalate to MLRO and CEO.",
    ],
    secondary: [
      "Trace and document the funding path (origin, destination, beneficial owner of each leg).",
      "Identify any related parties / co-conspirators in the customer's network.",
    ],
    escalationTriggers: [
      "Any positive match against UN 1267 / EOCN / OFAC SDGT / EU CFSP/Terrorism.",
      "Any nexus to a designated terrorist organisation in adverse media.",
    ],
    redLines: [
      "Confirmed nexus to a designated terrorist person or organisation.",
      "Pattern of cross-border transfers to a CAHRA jurisdiction with no commercial purpose.",
    ],
    citations: [
      "FATF Recommendations 5, 6, 7",
      "UN Resolution 1267 / 1989 / 2253",
      "FDL 7/2014 (anti-terrorism)",
      "FDL 10/2025 Art.30",
      "Cabinet Resolution 156/2025",
    ],
  },
  fatf_pf: {
    typologyId: "fatf_pf",
    summary:
      "Proliferation financing: providing funds or financial services for the manufacture, acquisition, possession, or transfer of weapons of mass destruction.",
    immediate: [
      "Freeze assets immediately if a designated person is identified.",
      "Notify EOCN.",
      "File FFR via goAML.",
      "Identify any dual-use goods nexus in the customer's trade activity.",
    ],
    secondary: [
      "Trace dual-use goods supply chain (Cabinet Resolution 156/2025 controlled-items schedule).",
      "Cross-check counterparties against UN 1718 / 2231 sanctioned lists.",
    ],
    escalationTriggers: [
      "Any positive match against UN 1718 / 2231 / OFAC NPWMD / EU CFSP/PF.",
      "Trade in any item on the Cabinet Resolution 156/2025 controlled-items schedule.",
    ],
    redLines: [
      "Confirmed nexus to a sanctioned PF programme (DPRK / Iran / Syria).",
    ],
    citations: [
      "FATF Recommendation 7",
      "UN Resolution 1540 / 1718 / 2231",
      "FDL 10/2025 Art.31",
      "Cabinet Resolution 156/2025 (Controlled Items)",
    ],
  },
  fatf_kleptocracy: {
    typologyId: "fatf_kleptocracy",
    summary:
      "PEP-linked corruption / kleptocracy: foreign or domestic public official misappropriating state assets for personal enrichment.",
    immediate: [
      "Senior management approval per FATF R.12 / FDL 10/2025 Art.17.",
      "Detailed source-of-wealth review including public-office salary records, declared assets, family wealth.",
      "Identify all family members + close associates (RCAs) and run separately.",
    ],
    secondary: [
      "Review wealth-source documentation against the PEP's declared income over the period of public service.",
      "Cross-check against StAR (Stolen Asset Recovery) and Transparency International publications.",
    ],
    escalationTriggers: [
      "Wealth materially exceeds documented income from public service + private business.",
      "Adverse media identifies misappropriation, embezzlement, or kickbacks.",
      "Bank transfers from state-owned enterprises with no contractual basis.",
    ],
    redLines: [
      "Active investigation by an OECD-recognised anti-corruption authority.",
      "Sanctions designation under the Magnitsky / Human-rights regimes.",
    ],
    citations: [
      "FATF Recommendation 12 (PEPs)",
      "FATF 2013 Politically Exposed Persons (R.12 and R.22)",
      "World Bank / UNODC StAR",
      "FDL 10/2025 Art.17",
    ],
  },
  fatf_ubo_concealment: {
    typologyId: "fatf_ubo_concealment",
    summary:
      "Beneficial-ownership concealment: legal-person structure designed to obscure the natural-person owner from regulators.",
    immediate: [
      "Demand UBO map down to natural persons (≥25% economic / voting threshold).",
      "Verify each layer's legal-existence registration (cert. of incorporation + good-standing).",
      "Test operating substance at each layer (real activity, employees, premises, revenue).",
    ],
    secondary: [
      "Cross-check UBOs against PEP / sanctions / adverse-media lists.",
      "Independent KYC provider audit of the structure.",
    ],
    escalationTriggers: [
      "Any layer in a top-tier secrecy jurisdiction (CH / BVI / KY / PA / LI) without substance.",
      "Refusal or inability to disclose at the natural-person level.",
    ],
    redLines: [
      "Refusal to disclose UBO.",
      "UBO is a sanctioned person (50% rule).",
    ],
    citations: [
      "FATF Recommendations 24-25",
      "FATF 2018 Concealment of Beneficial Ownership",
      "FDL 10/2025 Art.18 (UBO mandate)",
    ],
  },
};

export function playbookFor(typologyId: string): TypologyPlaybook | null {
  return PLAYBOOKS[typologyId] ?? null;
}

export function allPlaybooks(): TypologyPlaybook[] {
  return Object.values(PLAYBOOKS);
}
