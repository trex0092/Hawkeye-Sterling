// Hawkeye Sterling — sanctions-evasion typology bank (audit follow-up #44).
//
// Curated catalogue of sanctions-evasion patterns documented in
// regulator enforcement actions (FinCEN, OFAC, UK OFSI), the Pandora /
// Pandora 2 Papers, and FATF typology reports. Each entry encodes the
// pattern as detection signals + recommended response + regulatory
// anchor. Used by reasoning modes (modes/forensic.ts +
// modes/compliance.ts + the wave-3 vessel/crypto modes) and by the
// /api/agent/screen tool palette as a knowledge base the model can
// reason against.

export type EvasionFamily =
  | 'tbml'                         // trade-based money laundering
  | 'shell_layering'               // shell / layered ownership obfuscation
  | 'maritime_dark_fleet'          // tanker AIS gaps + STS transfers
  | 'crypto_obfuscation'           // mixers / chain hops
  | 'professional_enabler'         // lawyers / accountants / notaries front
  | 'free_zone_misuse'             // FTZ regulatory arbitrage
  | 'goods_substitution'           // dual-use / restricted goods relabelled
  | 'invoice_manipulation'         // over/under-invoicing
  | 'phantom_shipment'             // commercial transactions with no goods
  | 'nominee_director'             // beneficial-owner concealment via nominees
  | 'rapid_resale'                 // real-estate / DPMS price-laundering
  | 'jurisdictional_layering';     // country-chain risk transfer

export interface EvasionTypology {
  id: string;
  family: EvasionFamily;
  name: string;
  description: string;
  signals: string[];                       // observable indicators
  modeHints: string[];                     // brain mode IDs that should fire
  regulatoryAnchors: string[];             // citation strings
  reportedIn: string[];                    // FinCEN/OFAC/Pandora source refs
  recommendedAction: 'freeze' | 'block' | 'escalate' | 'review' | 'edd';
  confidenceFloor: number;                  // 0..1 — minimum verdict confidence when fingerprint matches
}

export const SANCTIONS_EVASION_TYPOLOGIES: EvasionTypology[] = [
  {
    id: 'iran_oil_dark_fleet',
    family: 'maritime_dark_fleet',
    name: 'Iranian oil — dark-fleet AIS-gap STS pattern',
    description:
      'Iranian-origin crude oil moved via VLCCs whose AIS transponders go dark for 24-72h, ' +
      'then reappear with Malaysian / Omani / "ship-to-ship" transhipment claims.',
    signals: [
      'AIS gap ≥24h at sea',
      'declared destination changes mid-voyage',
      'flag-state changed in last 24 months',
      'historical Iranian-port nexus',
      'STS transfer in a designated zone (Strait of Malacca / Persian Gulf)',
    ],
    modeHints: ['vessel_ais_gap', 'sts_transfer_detection', 'fleet_ownership_analysis'],
    regulatoryAnchors: ['OFAC E.O. 13599', 'OFAC E.O. 13902', 'UN Sanctions Vessel List', 'IMO MSC.1/Circ.1638'],
    reportedIn: ['OFAC Iran Vessel Advisory 2020', 'UN Panel of Experts S/2021/418'],
    recommendedAction: 'freeze',
    confidenceFloor: 0.7,
  },
  {
    id: 'russia_dual_use_diversion',
    family: 'goods_substitution',
    name: 'Russia / Belarus dual-use goods diversion',
    description:
      'Western dual-use goods (semiconductors / lathes / drone parts) shipped via UAE / Türkiye / ' +
      'Kazakhstan front companies to Russian end-users post-2022 sanctions.',
    signals: [
      'dual-use HS code',
      'final destination in CIS or Belarus',
      'front-company incorporated < 18 months',
      'unusually high price markup vs origin invoice',
      'shipment trans-loaded in a free zone',
    ],
    modeHints: ['hs_code_high_risk_match', 'front_company_age', 'free_zone_misuse'],
    regulatoryAnchors: ['OFAC Russia Sanctions Program', 'EU Reg 833/2014', 'UAE Cabinet Res 156/2025'],
    reportedIn: ['FinCEN Alert FIN-2023-Alert005', 'OFSI Russia Sanctions Bulletin'],
    recommendedAction: 'block',
    confidenceFloor: 0.75,
  },
  {
    id: 'dpms_cash_purchase_split',
    family: 'rapid_resale',
    name: 'DPMS bullion cash-purchase split + rapid resale',
    description:
      'Customer purchases gold / bullion in cash splits below the AED 55k reporting threshold, ' +
      'then rapidly resells (within 30 days) to a third party.',
    signals: [
      '≥3 cash purchases in AED 45-55k band within 30 days',
      'rapid resale (< 30 days)',
      'third-party paid in fiat wire',
      'beneficial owner of buyer not disclosed',
    ],
    modeHints: ['cash_courier_ctn', 'kpi_dpms_thirty', 'rapid_resale_pattern'],
    regulatoryAnchors: ['UAE FDL 10/2025 Art.15', 'Cabinet Res 134/2025 Art.12-14', 'MoE Circular 3/2025', 'LBMA RGG v9 Step 2'],
    reportedIn: ['UAE Ministry of Economy DPMS Typology Brief 2024'],
    recommendedAction: 'escalate',
    confidenceFloor: 0.6,
  },
  {
    id: 'mixer_into_vasp_offramp',
    family: 'crypto_obfuscation',
    name: 'Mixer-to-VASP off-ramp',
    description:
      'Cryptocurrency funds enter a known mixer (Tornado Cash / Wasabi / Sinbad), exit via 5+ ' +
      'anonymity hops, then off-ramp through a regulated VASP — classic layering pattern.',
    signals: [
      'known mixer counterparty in transaction history',
      'chain depth ≥5 from mixer to VASP',
      'mixer-canonical round denomination',
      'time-burst (3+ deposits in <60s)',
      'ENS / ICANN domain-name privacy on counterparty wallet',
    ],
    modeHints: ['mixer_forensics', 'utxo_clustering', 'bridge_crossing_trace', 'anonymity_set_analysis'],
    regulatoryAnchors: ['FATF R.15', 'FATF R.16 (travel rule)', 'UAE FDL 10/2025 Art.15', 'VARA VASP Rulebook 2024'],
    reportedIn: ['OFAC Tornado Cash Designation 2022', 'Chainalysis Crypto Crime Report 2024'],
    recommendedAction: 'freeze',
    confidenceFloor: 0.7,
  },
  {
    id: 'nominee_director_chain',
    family: 'nominee_director',
    name: 'Nominee-director shell layering',
    description:
      'Multi-jurisdiction shell-company chain (BVI / Seychelles / Marshall Islands / RAK) with ' +
      'nominee directors and nominee shareholders providing 5+ layers of ownership opacity.',
    signals: [
      'nominee_director_for relationships across ≥3 entities',
      'bearer shares present (where still legal)',
      'registered agent address shared across entities',
      'no operational substance in any layer',
      'beneficial owner ultimately unknown',
    ],
    modeHints: ['ubo_tree_walk', 'corporate_substance_test', 'jurisdictional_layering'],
    regulatoryAnchors: ['FATF R.24', 'FATF R.25', 'UAE Cabinet Res 16/2021 (BO register)', 'OECD Common Reporting Standard'],
    reportedIn: ['Pandora Papers 2021', 'FATF Report on Concealment 2018'],
    recommendedAction: 'escalate',
    confidenceFloor: 0.65,
  },
  {
    id: 'professional_enabler_law_firm',
    family: 'professional_enabler',
    name: 'Professional-enabler law-firm front',
    description:
      'Law firm / accountancy / notary acts as the front-of-house for client funds, with ' +
      'the firm receiving wires "in trust" and disbursing to third parties without transparent CDD.',
    signals: [
      'law-firm IOLTA / client-account routing',
      'large in-out transit within 24-48h',
      'no underlying matter file referenced',
      'multiple clients sharing the same destination',
      'firm jurisdiction is a secrecy haven',
    ],
    modeHints: ['professional_enabler_pattern', 'velocity_analysis', 'client_account_misuse'],
    regulatoryAnchors: ['FATF R.22', 'FATF R.23', 'UAE FDL 10/2025 Art.4 (DNFBP scope)', 'Cabinet Res 71/2024 (DNFBP penalties)'],
    reportedIn: ['FinCEN Geographic Targeting Order 2023', 'FATF Mutual Evaluation UK 2018'],
    recommendedAction: 'escalate',
    confidenceFloor: 0.6,
  },
];

/** Match a verdict's signal set against the typology bank.
 *  Returns the typologies whose signal-overlap exceeds the threshold. */
export function matchEvasionTypologies(
  observedSignals: readonly string[],
  options: { minOverlap?: number; topK?: number } = {},
): Array<{ typology: EvasionTypology; matchedSignals: string[]; overlap: number }> {
  const minOverlap = options.minOverlap ?? 0.4;
  const topK = options.topK ?? 5;
  const obsLower = observedSignals.map((s) => s.toLowerCase());

  const results = SANCTIONS_EVASION_TYPOLOGIES.map((t) => {
    const matched: string[] = [];
    for (const sig of t.signals) {
      const sigLower = sig.toLowerCase();
      // Substring overlap — observed signal phrase contained in typology signal or vice versa.
      const hit = obsLower.some((o) => o.includes(sigLower) || sigLower.includes(o));
      if (hit) matched.push(sig);
    }
    return {
      typology: t,
      matchedSignals: matched,
      overlap: t.signals.length > 0 ? matched.length / t.signals.length : 0,
    };
  });
  return results
    .filter((r) => r.overlap >= minOverlap)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, topK);
}

/** Lookup by id. */
export function evasionTypologyById(id: string): EvasionTypology | undefined {
  return SANCTIONS_EVASION_TYPOLOGIES.find((t) => t.id === id);
}
