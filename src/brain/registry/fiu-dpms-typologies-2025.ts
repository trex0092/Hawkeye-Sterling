// Hawkeye Sterling — FIU UAE Strategic Analysis: Misuse of Precious Metals and
// Stones in Financial Crime (September 2025). This file encodes the 9 DPMS-specific
// typologies published by the UAE Financial Intelligence Unit so each can be
// cross-referenced against existing brain modes for FATF 5th Round IO.6 purposes.

export interface FiuDpmsTypology {
  id: string;
  title: string;
  description: string;
  redFlags: string[];
  fatfRecommendations: string[];
  mappedBrainModes: string[];   // ids of brain modes that cover this typology
  coverageGaps: string[];       // what is NOT yet covered
  riskRating: "critical" | "high" | "medium";
  reportSection: string;
}

export const FIU_DPMS_TYPOLOGIES_2025: FiuDpmsTypology[] = [
  {
    id: "fiu_dpms_01",
    title: "Cash Structuring Below AED 55,000 Threshold",
    description: "Customers repeatedly purchase gold in cash amounts just below the AED 55,000 DPMSR reporting threshold. Transactions are split across multiple visits, related individuals, or DPMS outlets to avoid mandatory filing under CR134/2025 Art.3.",
    redFlags: [
      "Multiple same-day or same-week cash purchases of AED 45,000–54,999",
      "Same customer presenting with slight name or ID variations across branches",
      "Structuring velocity: ≥3 sub-threshold cash transactions within 30 days",
      "Customer declines to provide identity above AED 25,000",
      "Group of customers purchasing simultaneously with identical amounts",
    ],
    fatfRecommendations: ["R.10", "R.20", "R.23"],
    mappedBrainModes: ["dpms_cash_structuring_split", "velocity_analysis"],
    coverageGaps: [
      "No cross-branch linked-party detection for structuring across multiple DPMS outlets",
      "AED 55,000 DPMSR auto-trigger not yet wired as a separate filing obligation",
    ],
    riskRating: "critical",
    reportSection: "Section 3.1 — Cash Structuring",
  },
  {
    id: "fiu_dpms_02",
    title: "Fictitious Trade Transactions / Invoice Fraud",
    description: "Gold dealers issue invoices for gold that was never delivered, or under/over-invoice gold shipments to move value across borders under the guise of legitimate trade. Often combined with free-trade-zone routing.",
    redFlags: [
      "Invoice price deviates by ≥30% from London Bullion Market Association spot price",
      "No corresponding shipping documentation for declared gold weight",
      "Counterparty is in a FATF grey-list or non-cooperative jurisdiction",
      "Invoice references non-existent HS codes for gold (7108.x)",
      "Repeated transactions with single counterparty at anomalous pricing",
    ],
    fatfRecommendations: ["R.20", "R.22", "R.23"],
    mappedBrainModes: ["tbml_invoice_price_anomaly", "wave3-tbml-invoice"],
    coverageGaps: [
      "Gold-specific HS code validation (7108.x) not implemented in invoice checker",
      "LBMA spot price integration for real-time price deviation alert not live",
    ],
    riskRating: "critical",
    reportSection: "Section 3.2 — Trade-Based ML",
  },
  {
    id: "fiu_dpms_03",
    title: "Bullion Courier and Cash Courier Networks",
    description: "Physical gold and/or large cash amounts are transported across borders by couriers acting as nominees for a principal. Couriers declare below-threshold amounts or use multiple couriers to evade border controls.",
    redFlags: [
      "Single individual travelling with gold below the AED 60,000 declaration threshold multiple times",
      "Same route used repeatedly by different individuals with linked phone numbers or addresses",
      "Gold declared as personal jewellery but of commercial specification (bars, granules)",
      "Courier has no apparent business relationship with gold sector",
      "Multiple courier transactions on the same day aggregating above threshold",
    ],
    fatfRecommendations: ["R.20", "R.32"],
    mappedBrainModes: ["wave3-cash-courier-threshold", "cross_border_courier"],
    coverageGaps: [
      "No multi-courier network detection linking individuals across screenings",
      "Physical gold courier pattern not distinguished from cash courier in current modes",
    ],
    riskRating: "high",
    reportSection: "Section 3.3 — Courier Networks",
  },
  {
    id: "fiu_dpms_04",
    title: "Refinery Invoice Fraud and Provenance Falsification",
    description: "Gold of illicit origin (conflict minerals, stolen, or smuggled) is laundered through UAE refineries by falsifying certificates of origin, assay certificates, or chain-of-custody documentation.",
    redFlags: [
      "Supplier country differs from country of origin on assay certificate",
      "Certificate issued by non-LBMA-accredited assay laboratory",
      "New supplier with no prior refinery relationship providing large consignments",
      "Gold purity inconsistent with declared mine of origin",
      "Consignment documentation describes CAHRA-adjacent origin countries",
    ],
    fatfRecommendations: ["R.22", "R.23"],
    mappedBrainModes: ["wave3-art-provenance-gap", "lbma_rgg_five_step"],
    coverageGaps: [
      "Assay certificate authenticity check not automated",
      "CAHRA origin screening not integrated into refinery onboarding workflow",
      "5-step OECD responsible sourcing module not yet structured as a workflow",
    ],
    riskRating: "critical",
    reportSection: "Section 3.4 — Refinery Fraud",
  },
  {
    id: "fiu_dpms_05",
    title: "Cross-Border Gold Smuggling via UAE Free Zones",
    description: "Gold is imported into UAE free zones without full customs declaration, then sold into the domestic market or re-exported with UAE-origin documentation, bypassing source-country AML controls.",
    redFlags: [
      "FTZ-based gold dealer with no apparent UAE customer base",
      "Consignments transiting UAE with no economic justification for UAE stop",
      "Re-export documentation showing UAE as country of origin for non-UAE-refined gold",
      "Counterparty in destination country has no known refinery or dealer relationship",
      "Volume of gold inconsistent with company's declared trade profile",
    ],
    fatfRecommendations: ["R.22", "R.23"],
    mappedBrainModes: ["wave3-ftz-layered-ownership", "wave3-dual-use-routing"],
    coverageGaps: [
      "FTZ re-export re-labelling pattern not specifically modelled for gold",
      "Customs declaration cross-check against DPMS transaction records not implemented",
    ],
    riskRating: "high",
    reportSection: "Section 3.5 — FTZ Smuggling",
  },
  {
    id: "fiu_dpms_06",
    title: "Crypto-to-Gold Conversion for Layering",
    description: "Criminally derived cryptocurrency is converted to cash via P2P exchanges or OTC desks, then used to purchase physical gold from UAE DPMS dealers, converting untraceable crypto proceeds into a portable, high-value physical asset.",
    redFlags: [
      "Customer pays with large cash amounts citing cryptocurrency sales as source of funds",
      "Customer unable to explain provenance of SOF beyond 'crypto gains'",
      "Crypto wallet address linked to high-risk exchange, mixer, or sanctioned entity",
      "Rapid purchase of gold followed by immediate sale for wire transfer",
      "Customer presents multiple small cash amounts from different persons",
    ],
    fatfRecommendations: ["R.10", "R.15", "R.20"],
    mappedBrainModes: ["wave3-crypto-chain-hop", "wave3-mixer-forensics", "dpms_cash_structuring_split"],
    coverageGaps: [
      "Crypto-to-physical-gold conversion as a distinct layering pathway not in DPMS typology registry",
      "SOF verification workflow for crypto-sourced funds not specialised for DPMS context",
    ],
    riskRating: "high",
    reportSection: "Section 3.6 — Crypto-to-Gold",
  },
  {
    id: "fiu_dpms_07",
    title: "Proxy Buyer Networks",
    description: "A principal uses a network of proxy buyers (nominees, employees, or unknowing third parties) to purchase gold across multiple transactions, obscuring the true beneficial owner and aggregating value without triggering CDD or reporting obligations.",
    redFlags: [
      "Multiple individuals presenting at the same time or in quick succession",
      "Buyers share address, phone, or email with each other or with an undisclosed third party",
      "Purchases are uniform in amount and specification (same gold type, same denomination)",
      "Buyers are unable to state a business purpose for the purchase",
      "One individual accompanies multiple buyers on separate visits",
    ],
    fatfRecommendations: ["R.10", "R.11", "R.22"],
    mappedBrainModes: ["wave3-mule-cluster", "wave3-shell-company"],
    coverageGaps: [
      "DPMS-specific proxy buyer detection (as opposed to bank mule networks) not modelled",
      "Physical-presence clustering (same visit window) not in current evidence schema",
    ],
    riskRating: "high",
    reportSection: "Section 3.7 — Proxy Networks",
  },
  {
    id: "fiu_dpms_08",
    title: "Layering via Multiple DPMS Dealers",
    description: "An individual purchases gold from one DPMS dealer and immediately resells to a different dealer, converting criminal proceeds to apparently legitimate sale receipts. Multiple rounds create layering distance from the predicate offence.",
    redFlags: [
      "Customer presents recently purchased gold (same specification, within days) for resale",
      "Customer unable to explain why gold was purchased and immediately resold",
      "Price delta between purchase and resale is negligible (no profit motive evident)",
      "Same gold appears across multiple DPMS dealer transaction records",
      "Customer conducts both purchase and sale in cash",
    ],
    fatfRecommendations: ["R.10", "R.20", "R.23"],
    mappedBrainModes: ["wave3-dpms-structuring", "rapid_resale_detector"],
    coverageGaps: [
      "Cross-dealer layering detection requires inter-institutional data sharing not currently modelled",
      "Rapid buy-sell pattern specifically for gold (not generic securities) needs DPMS-specific mode",
    ],
    riskRating: "high",
    reportSection: "Section 3.8 — Multi-Dealer Layering",
  },
  {
    id: "fiu_dpms_09",
    title: "PEP-Connected Gold Accumulation",
    description: "Politically Exposed Persons or their associates use DPMS dealers to accumulate physical gold as a store of value outside the financial system, often using complex beneficial ownership structures or nominees to conceal the ultimate beneficial owner.",
    redFlags: [
      "Corporate buyer with opaque beneficial ownership structure purchasing large gold volumes",
      "Individual buyer with PEP connection unable to demonstrate legitimate SOW",
      "Purchases paid through third-party intermediary with no apparent business relationship",
      "Gold stored in dealer vault with no evidence of delivery to end customer",
      "Counterparty is a legal professional, trust, or family office with PEP connection",
    ],
    fatfRecommendations: ["R.10", "R.12", "R.22"],
    mappedBrainModes: ["wave3-pep-proximity", "wave3-pep-predicate-batch", "wave3-family-office-trust"],
    coverageGaps: [
      "PEP-connected gold accumulation as a specific DPMS typology distinct from generic PEP risk",
      "Vault storage as a red flag for beneficial ownership concealment not in current signals",
    ],
    riskRating: "critical",
    reportSection: "Section 3.9 — PEP Gold Accumulation",
  },
];

export function getTypologyById(id: string): FiuDpmsTypology | undefined {
  return FIU_DPMS_TYPOLOGIES_2025.find((t) => t.id === id);
}

export function getCoverageMatrix(): Array<{
  typologyId: string;
  title: string;
  coveredModes: string[];
  gaps: string[];
  coverageScore: number; // 0-100
}> {
  return FIU_DPMS_TYPOLOGIES_2025.map((t) => {
    const coveredModes = t.mappedBrainModes;
    const totalSignals = coveredModes.length + t.coverageGaps.length;
    const coverageScore = totalSignals === 0 ? 0 : Math.round((coveredModes.length / totalSignals) * 100);
    return {
      typologyId: t.id,
      title: t.title,
      coveredModes,
      gaps: t.coverageGaps,
      coverageScore,
    };
  });
}
