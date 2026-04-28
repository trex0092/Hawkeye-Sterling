// Wave 3 — intelligence expansion pack.
// Adds OSINT, red-team/adversarial, geopolitical, forensic accounting,
// behavioral economics, network science, linguistic, sanctions evasion,
// deep crypto, ESG, and probabilistic-aggregation reasoning modes.
// Includes REAL apply() implementations for Benford, Shannon entropy,
// velocity, source-triangulation, and completeness-audit — no longer stubs.

import type {
  BrainContext, Finding, FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';
import { combineDS, type BeliefMass } from './dempster-shafer.js';

const stubApply = (modeId: string, category: ReasoningCategory, faculties: FacultyId[]) =>
  async (_ctx: BrainContext): Promise<Finding> => ({
    modeId,
    category,
    faculties,
    score: 0,
    confidence: 0,
    verdict: 'inconclusive',
    rationale: `[stub] ${modeId} — implementation pending (Phase 7).`,
    evidence: [],
    producedAt: Date.now(),
  });

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
  apply?: (ctx: BrainContext) => Promise<Finding>,
): ReasoningMode => ({
  id, name, category, faculties, wave: 3, description,
  apply: apply ?? stubApply(id, category, faculties),
});

// ─── REAL IMPLEMENTATIONS ──────────────────────────────────────────────

function extractAmounts(ctx: BrainContext): number[] {
  const out: number[] = [];
  const txs = ctx.evidence.transactions;
  if (Array.isArray(txs)) {
    for (const t of txs) {
      if (t && typeof t === 'object' && 'amount' in t) {
        const a = (t as { amount: unknown }).amount;
        if (typeof a === 'number' && a > 0) out.push(a);
        else if (typeof a === 'string' && /^[\d.,]+$/.test(a)) {
          const n = Number(a.replace(/,/g, ''));
          if (Number.isFinite(n) && n > 0) out.push(n);
        }
      } else if (typeof t === 'number' && t > 0) {
        out.push(t);
      }
    }
  }
  return out;
}

async function benfordApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx);
  if (amounts.length < 30) {
    return {
      modeId: 'benford_law',
      category: 'forensic',
      faculties: ['data_analysis', 'smartness'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Benford: insufficient data (n=${amounts.length}, need ≥30).`,
      evidence: [`sample_size=${amounts.length}`],
      producedAt: Date.now(),
    };
  }
  const observed = new Array<number>(9).fill(0);
  for (const a of amounts) {
    const first = String(a).replace(/[^\d]/g, '').charAt(0);
    const d = Number(first);
    if (d >= 1 && d <= 9) observed[d - 1] = (observed[d - 1] ?? 0) + 1;
  }
  const n = amounts.length;
  const expected = Array.from({ length: 9 }, (_, i) => n * Math.log10(1 + 1 / (i + 1)));
  let chi = 0;
  for (let i = 0; i < 9; i++) {
    const o = observed[i] ?? 0;
    const e = expected[i] ?? 1;
    chi += ((o - e) ** 2) / e;
  }
  const critical = 15.507; // chi-square 8 df, p=0.05
  const deviated = chi > critical;
  return {
    modeId: 'benford_law',
    category: 'forensic',
    faculties: ['data_analysis', 'smartness'],
    score: deviated ? Math.min(1, chi / 40) : 0,
    confidence: 0.85,
    verdict: deviated ? 'flag' : 'clear',
    rationale: `Benford χ²(8) = ${chi.toFixed(2)} on ${n} amounts. ${
      deviated ? 'Deviates from Benford distribution — digit-pattern anomaly.'
               : 'Consistent with Benford distribution.'}`,
    evidence: [
      `observed=${observed.join(',')}`,
      `chi2=${chi.toFixed(2)}`,
      `critical_p05=${critical}`,
    ],
    producedAt: Date.now(),
  };
}

async function entropyApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx);
  if (amounts.length < 10) {
    return {
      modeId: 'entropy',
      category: 'statistical',
      faculties: ['data_analysis'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Entropy: insufficient data (n=${amounts.length}, need ≥10).`,
      evidence: [`sample_size=${amounts.length}`],
      producedAt: Date.now(),
    };
  }
  // Coarse binning by order of magnitude.
  const bins = new Map<number, number>();
  for (const a of amounts) {
    const bucket = Math.floor(Math.log10(a + 1));
    bins.set(bucket, (bins.get(bucket) ?? 0) + 1);
  }
  const total = amounts.length;
  let H = 0;
  for (const count of bins.values()) {
    const p = count / total;
    H -= p * Math.log2(p);
  }
  const maxH = Math.log2(bins.size || 1);
  const normalised = maxH > 0 ? H / maxH : 0;
  // Very low entropy => concentrated; very high => dispersed. Flag extremes.
  const extreme = normalised < 0.2 || normalised > 0.95;
  return {
    modeId: 'entropy',
    category: 'statistical',
    faculties: ['data_analysis'],
    score: extreme ? 0.35 : 0.05,
    confidence: 0.75,
    verdict: extreme ? 'flag' : 'clear',
    rationale: `Shannon entropy over magnitude-bins: H=${H.toFixed(3)} bits (normalised ${normalised.toFixed(2)}). ${
      extreme ? 'Distribution is extreme (overly concentrated or dispersed).'
              : 'Distribution within normal range.'}`,
    evidence: [`H=${H.toFixed(3)}`, `bins=${bins.size}`, `n=${total}`],
    producedAt: Date.now(),
  };
}

async function velocityApply(ctx: BrainContext): Promise<Finding> {
  const txs = ctx.evidence.transactions;
  if (!Array.isArray(txs) || txs.length < 5) {
    return {
      modeId: 'velocity_analysis',
      category: 'behavioral_signals',
      faculties: ['data_analysis', 'smartness'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Velocity: need ≥5 transactions (got ${Array.isArray(txs) ? txs.length : 0}).`,
      evidence: [],
      producedAt: Date.now(),
    };
  }
  const timestamps: number[] = [];
  for (const t of txs) {
    if (t && typeof t === 'object' && 'timestamp' in t) {
      const ts = (t as { timestamp: unknown }).timestamp;
      if (typeof ts === 'number') timestamps.push(ts);
      else if (typeof ts === 'string') {
        const d = Date.parse(ts);
        if (!Number.isNaN(d)) timestamps.push(d);
      }
    }
  }
  if (timestamps.length < 5) {
    return {
      modeId: 'velocity_analysis',
      category: 'behavioral_signals',
      faculties: ['data_analysis', 'smartness'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: 'Velocity: transactions missing usable timestamps.',
      evidence: [`with_timestamp=${timestamps.length}`],
      producedAt: Date.now(),
    };
  }
  timestamps.sort((a, b) => a - b);
  const spanMs = (timestamps[timestamps.length - 1] ?? 0) - (timestamps[0] ?? 0);
  const spanDays = Math.max(spanMs / 86_400_000, 1 / 24);
  const rate = timestamps.length / spanDays;
  const hot = rate > 20; // >20 tx/day sustained
  return {
    modeId: 'velocity_analysis',
    category: 'behavioral_signals',
    faculties: ['data_analysis', 'smartness'],
    score: hot ? Math.min(1, rate / 100) : Math.min(0.2, rate / 100),
    confidence: 0.8,
    verdict: hot ? 'flag' : 'clear',
    rationale: `Velocity = ${rate.toFixed(2)} tx/day over ${spanDays.toFixed(2)} days (n=${timestamps.length}). ${
      hot ? 'Elevated — investigate for smurfing / layering.'
          : 'Within typical band.'}`,
    evidence: [
      `tx_count=${timestamps.length}`,
      `span_days=${spanDays.toFixed(2)}`,
      `rate_per_day=${rate.toFixed(2)}`,
    ],
    producedAt: Date.now(),
  };
}

async function sourceTriangulationApply(ctx: BrainContext): Promise<Finding> {
  const sources = new Set<string>();
  const ev = ctx.evidence;
  if (Array.isArray(ev.sanctionsHits) && ev.sanctionsHits.length > 0) sources.add('sanctions');
  if (Array.isArray(ev.pepHits) && ev.pepHits.length > 0) sources.add('pep');
  if (Array.isArray(ev.adverseMedia) && ev.adverseMedia.length > 0) sources.add('adverse_media');
  if (Array.isArray(ev.uboChain) && ev.uboChain.length > 0) sources.add('ubo');
  if (Array.isArray(ev.transactions) && ev.transactions.length > 0) sources.add('transactions');
  if (Array.isArray(ev.documents) && ev.documents.length > 0) sources.add('documents');
  const n = sources.size;
  return {
    modeId: 'source_triangulation',
    category: 'compliance_framework',
    faculties: ['reasoning', 'ratiocination'],
    score: n >= 3 ? 0.1 : n === 2 ? 0.25 : 0.5,
    confidence: 0.9,
    verdict: n >= 3 ? 'clear' : n === 2 ? 'flag' : 'escalate',
    rationale: `${n} independent evidence source${n === 1 ? '' : 's'} available: ${[...sources].join(', ') || 'none'}. ${
      n >= 3 ? 'Triangulation satisfied.'
             : 'Triangulation thin — widen sourcing before committing to a verdict.'}`,
    evidence: [...sources].map((s) => `source=${s}`),
    producedAt: Date.now(),
  };
}

async function completenessAuditApply(ctx: BrainContext): Promise<Finding> {
  const s = ctx.subject;
  const required: Array<[string, boolean]> = [
    ['name', !!s.name],
    ['type', !!s.type],
    ['jurisdiction', !!s.jurisdiction],
    ['identifier', !!(s.identifiers && Object.keys(s.identifiers).length > 0)],
    ['date_of_birth_or_incorporation', !!(s.dateOfBirth || s.dateOfIncorporation)],
  ];
  const present = required.filter(([, ok]) => ok).length;
  const ratio = present / required.length;
  const verdict = ratio >= 0.8 ? 'clear' : ratio >= 0.5 ? 'flag' : 'escalate';
  return {
    modeId: 'completeness_audit',
    category: 'data_quality',
    faculties: ['data_analysis', 'introspection'],
    score: 1 - ratio,
    confidence: 0.95,
    verdict,
    rationale: `Subject completeness ${(ratio * 100).toFixed(0)}% (${present}/${required.length}).`,
    evidence: required.map(([k, v]) => `${k}=${v ? 'present' : 'missing'}`),
    producedAt: Date.now(),
  };
}

// ─── WAVE 3 REGISTRY ───────────────────────────────────────────────────

export const WAVE3_MODES: ReasoningMode[] = [
  // ─── OSINT / HUMINT ───────────────────────────────────────────────
  m('socmint_scan', 'SOCMINT Scan', 'osint', ['intelligence','data_analysis'], 'Social-media intelligence sweep — handles, aliases, network, cadence.'),
  m('geoint_plausibility', 'GEOINT Plausibility', 'osint', ['intelligence'], 'Cross-check claimed locations against geospatial / satellite evidence.'),
  m('imint_verification', 'IMINT Verification', 'osint', ['intelligence'], 'Imagery intelligence — authenticity, date, geolocation of photos.'),
  m('humint_reliability_grade', 'HUMINT Reliability', 'osint', ['intelligence','introspection'], 'Grade human-source reliability and claim credibility.'),
  m('nato_admiralty_grading', 'NATO / Admiralty Source Grading', 'osint', ['intelligence','introspection'], 'A-F reliability × 1-6 credibility grid applied to every source.'),
  m('osint_chain_of_custody', 'OSINT Chain-of-Custody', 'osint', ['ratiocination','introspection'], 'Hash + timestamp + archive every collected artefact.'),

  // ─── RED-TEAM / ADVERSARIAL ───────────────────────────────────────
  m('adversarial_simulation', 'Adversarial Simulation', 'threat_modeling', ['deep_thinking','intelligence'], 'Simulate how a sophisticated actor would evade each control.'),
  m('deception_detection', 'Deception Detection', 'threat_modeling', ['smartness','intelligence'], 'Cross-modal inconsistency analysis — story vs records vs behaviour.'),
  m('counter_intelligence', 'Counter-Intelligence', 'threat_modeling', ['deep_thinking','intelligence'], 'Detect collection, cover stories, and feedback loops aimed at your controls.'),
  m('false_flag_check', 'False-Flag Check', 'threat_modeling', ['introspection','deep_thinking'], 'Is the attribution a plant designed to mislead the investigator?'),
  m('honey_trap_pattern', 'Honey-Trap Pattern', 'threat_modeling', ['smartness','intelligence'], 'Sudden, implausibly-convenient counterparty relationships.'),
  m('cover_story_stress', 'Cover-Story Stress Test', 'threat_modeling', ['argumentation','deep_thinking'], 'Probe a narrative under interview-style questioning until it fractures.'),
  m('legend_verification', 'Legend Verification', 'threat_modeling', ['intelligence','ratiocination'], 'Independently corroborate claimed biography end to end.'),

  // ─── GEOPOLITICAL & SANCTIONS REGIMES ─────────────────────────────
  m('sanctions_arbitrage', 'Sanctions Arbitrage', 'compliance_framework', ['intelligence'], 'Routing flows to exploit regime differentials (EU vs OFAC vs UK).'),
  m('offshore_secrecy_index', 'Offshore Secrecy Index', 'compliance_framework', ['intelligence','data_analysis'], 'TJN FSI / secrecy-jurisdiction scoring applied to the chain.'),
  m('fatf_grey_list_dynamics', 'FATF Grey-List Dynamics', 'compliance_framework', ['intelligence'], 'Jurisdiction trajectory: grey / black / released, and what changed.'),
  m('secrecy_jurisdiction_scoring', 'Secrecy-Jurisdiction Scoring', 'compliance_framework', ['intelligence'], 'Composite opacity score per hop in the ownership chain.'),
  m('russian_oil_price_cap', 'Russian Oil Price-Cap', 'compliance_framework', ['intelligence'], 'G7 price-cap regime — attestation chain, STS, dark-fleet links.'),
  m('eu_14_package', 'EU Sanctions 14th Package', 'compliance_framework', ['intelligence'], 'EU 14th-package walk — best-efforts clauses, no-Russia, anti-circumvention.'),
  m('us_secondary_sanctions', 'US Secondary Sanctions', 'compliance_framework', ['intelligence'], 'Extra-territorial exposure: OFAC 50% rule, CAATSA, NDAA.'),
  m('chip_export_controls', 'Semiconductor Export Controls', 'compliance_framework', ['intelligence'], 'BIS / FDPR rules — advanced-node chips, AI compute, end-use screening.'),
  m('iran_evasion_pattern', 'Iran-Evasion Pattern', 'compliance_framework', ['intelligence','smartness'], 'Front companies, front banks, STS, gold-for-oil typologies.'),
  m('dprk_evasion_pattern', 'DPRK-Evasion Pattern', 'compliance_framework', ['intelligence','smartness'], 'Ship-to-ship coal, lazarus crypto heists, front-company cascades.'),

  // ─── FORENSIC ACCOUNTING ──────────────────────────────────────────
  m('benford_law', "Benford's Law", 'forensic', ['data_analysis','smartness'], 'Leading-digit distribution test on amounts.', benfordApply),
  m('split_payment_detection', 'Split-Payment Detection', 'forensic', ['smartness'], 'Invoices split just below thresholds — structuring typology.'),
  m('round_trip_transaction', 'Round-Trip Transaction', 'forensic', ['smartness'], 'Funds return to origin through intermediaries.'),
  m('shell_triangulation', 'Shell Triangulation', 'forensic', ['intelligence','ratiocination'], 'Three or more linked shells share agents, directors, or addresses.'),
  m('po_fraud_pattern', 'Purchase-Order Fraud', 'forensic', ['smartness'], 'Phantom vendors, back-dated POs, split-invoice below approval.'),
  m('vendor_master_anomaly', 'Vendor Master Anomaly', 'forensic', ['data_analysis'], 'New vendor spikes, bank-detail churn, name-address collisions.'),
  m('journal_entry_anomaly', 'Journal-Entry Anomaly', 'forensic', ['data_analysis'], 'Round numbers, weekend/holiday postings, manual overrides at period close.'),
  m('revenue_recognition_stretch', 'Revenue-Recognition Stretch', 'forensic', ['intelligence'], 'Channel-stuffing, bill-and-hold, cut-off manipulation patterns.'),

  // ─── BEHAVIORAL ECONOMICS ─────────────────────────────────────────
  m('prospect_theory', 'Prospect-Theory Lens', 'cognitive_science', ['deep_thinking','introspection'], 'Reference-point, loss-aversion, probability-weighting checks on the subject\'s decisions.'),
  m('status_quo_bias', 'Status-Quo Bias', 'cognitive_science', ['introspection'], 'Subject prefers current path despite better alternatives — investigate why.'),
  m('endowment_effect', 'Endowment Effect', 'cognitive_science', ['introspection'], 'Over-valuation of owned assets — price-setting anomalies.'),
  m('hyperbolic_discount', 'Hyperbolic Discount', 'cognitive_science', ['introspection'], 'Short-term pay-off heavily over-weighted — pressure / distress indicator.'),
  m('certainty_effect', 'Certainty Effect', 'cognitive_science', ['introspection'], 'Over-weighting certain outcomes vs probabilistic ones.'),
  m('reference_point_shift', 'Reference-Point Shift', 'cognitive_science', ['introspection'], 'Narrative re-baselined mid-process to justify an outcome.'),
  m('mental_accounting', 'Mental Accounting', 'cognitive_science', ['introspection'], 'Funds treated differently by source — probe for SoW laundering.'),

  // ─── NETWORK / GRAPH ──────────────────────────────────────────────
  m('k_core_analysis', 'k-Core Analysis', 'graph_analysis', ['data_analysis','intelligence'], 'Densest-subgraph extraction — core of a scheme.'),
  m('bridge_detection', 'Bridge Detection', 'graph_analysis', ['data_analysis'], 'Edges whose removal disconnects the network — choke points.'),
  m('temporal_motif', 'Temporal Motif', 'graph_analysis', ['data_analysis','intelligence'], 'Time-ordered subgraph patterns — layering signatures.'),
  m('reciprocal_edge_pattern', 'Reciprocal-Edge Pattern', 'graph_analysis', ['data_analysis'], 'Back-and-forth flows between a pair — round-trip candidates.'),
  m('triadic_closure', 'Triadic Closure', 'graph_analysis', ['data_analysis'], 'Missing third-edge triangles — plausible hidden relationships.'),
  m('structural_hole', 'Structural Hole', 'graph_analysis', ['intelligence'], 'Brokers between disjoint clusters — gatekeeper / enabler candidates.'),

  // ─── LINGUISTIC / NLP ─────────────────────────────────────────────
  m('stylometry', 'Stylometry', 'forensic', ['intelligence'], 'Authorship attribution via style fingerprint.'),
  m('gaslighting_detection', 'Gaslighting Detection', 'forensic', ['intelligence','introspection'], 'Reality-denial / memory-undermining patterns in client communication.'),
  m('obfuscation_pattern', 'Obfuscation Pattern', 'forensic', ['intelligence','smartness'], 'Deliberate vagueness / passive voice / agentless constructions.'),
  m('code_word_detection', 'Code-Word Detection', 'forensic', ['intelligence','smartness'], 'Domain slang, cant, or cipher masking illicit content.'),
  m('hedging_language', 'Hedging Language', 'forensic', ['intelligence','introspection'], 'Weasel words signalling low commitment to a claim.'),
  m('minimisation_pattern', 'Minimisation Pattern', 'forensic', ['intelligence'], 'Systematic downplaying of severity in narratives / SARs.'),

  // ─── SANCTIONS-EVASION SPECIFIC ───────────────────────────────────
  m('phantom_vessel', 'Phantom Vessel', 'sectoral_typology', ['intelligence'], 'AIS-off, spoofed identity, dark-fleet patterns.'),
  m('flag_hopping', 'Flag Hopping', 'sectoral_typology', ['intelligence'], 'Rapid flag-of-convenience changes to evade scrutiny.'),
  m('dark_fleet_pattern', 'Dark-Fleet Pattern', 'sectoral_typology', ['intelligence'], 'Aging tonnage, opaque owners, uninsured calls into sanctioned ports.'),
  m('front_company_fingerprint', 'Front-Company Fingerprint', 'sectoral_typology', ['intelligence','smartness'], 'Shared registered agents, synthetic directors, thin web presence.'),
  m('nominee_rotation_detection', 'Nominee Rotation', 'sectoral_typology', ['intelligence'], 'Same nominees re-used across rotating shell entities.'),
  m('bvi_cook_island_chain', 'BVI / Cook-Islands Chain', 'sectoral_typology', ['intelligence'], 'Classic secrecy-jurisdiction cascade patterns.'),
  m('freeport_risk', 'Free-Port Risk', 'sectoral_typology', ['intelligence'], 'Geneva / Luxembourg / Delaware free-port concealment.'),

  // ─── CRYPTO DEEP ──────────────────────────────────────────────────
  m('address_poisoning', 'Address Poisoning', 'crypto_defi', ['smartness'], 'Attacker seeds wallet history with look-alike addresses.'),
  m('chain_hopping_velocity', 'Chain-Hopping Velocity', 'crypto_defi', ['data_analysis'], 'Rapid cross-chain bridge hopping under obfuscation intent.'),
  m('cross_chain_taint', 'Cross-Chain Taint', 'crypto_defi', ['inference'], 'Propagate taint across bridges and wrapped assets.'),
  m('privacy_pool_exposure', 'Privacy-Pool Exposure', 'crypto_defi', ['inference'], 'Tornado-style pool deposit/withdraw risk assessment.'),
  m('tornado_cash_proximity', 'Tornado-Cash Proximity', 'crypto_defi', ['inference'], 'Hop-distance from designated mixer addresses.'),
  m('peel_chain', 'Peel-Chain Pattern', 'crypto_defi', ['data_analysis'], 'Successive small peels off a large balance to obscure flow.'),
  m('change_address_heuristic', 'Change-Address Heuristic', 'crypto_defi', ['data_analysis'], 'Common-input-ownership + change-output clustering.'),
  m('dusting_attack_pattern', 'Dusting-Attack Pattern', 'crypto_defi', ['smartness'], 'Micro-transfers to probe or deanonymise wallets.'),

  // ─── ESG RISK ─────────────────────────────────────────────────────
  m('greenwashing_signal', 'Greenwashing Signal', 'esg', ['intelligence'], 'Gap between sustainability claims and verifiable practice.'),
  m('forced_labour_supply_chain', 'Forced-Labour Supply Chain', 'esg', ['intelligence'], 'Xinjiang, migrant-worker, recruitment-fee red flags.'),
  m('conflict_mineral_typology', 'Conflict-Mineral Typology', 'esg', ['intelligence'], '3TG / gold CAHRA sourcing and chain-of-custody.'),
  m('carbon_fraud_pattern', 'Carbon-Credit Fraud', 'esg', ['intelligence','smartness'], 'VAT carousel, phantom offsets, double-counting of credits.'),

  // ─── PROBABILISTIC AGGREGATION ────────────────────────────────────
  m('dempster_shafer', 'Dempster-Shafer Combination', 'statistical', ['inference','deep_thinking'], 'Belief combination across partial evidence masses.'),
  m('bayesian_update_cascade', 'Bayesian Update Cascade', 'statistical', ['inference','deep_thinking'], 'Sequential posterior update across heterogeneous evidence.'),
  m('multi_source_consistency', 'Multi-Source Consistency', 'statistical', ['data_analysis','reasoning'], 'Agreement / contradiction measure across independent sources.'),
  m('counter_evidence_weighting', 'Counter-Evidence Weighting', 'statistical', ['introspection','argumentation'], 'Up-weight disconfirming evidence to resist confirmation bias.'),

  // ─── DATA-QUALITY REAL IMPLEMENTATIONS ────────────────────────────
  // (these override the wave-2 stubs — the engine registry de-dupes by id)
];

// ─── REAL-APPLY OVERRIDES ──────────────────────────────────────────
// These three mode IDs were registered as stubs in wave 1/2;
// we re-export them here with real implementations so the engine can
// substitute them when assembling the final registry.

export const WAVE3_OVERRIDES: ReasoningMode[] = [
  {
    id: 'entropy',
    name: 'Shannon Entropy',
    category: 'statistical',
    faculties: ['data_analysis'],
    wave: 2,
    description: 'Shannon entropy of amount / category distributions.',
    apply: entropyApply,
  },
  {
    id: 'velocity_analysis',
    name: 'Velocity Analysis',
    category: 'behavioral_signals',
    faculties: ['data_analysis', 'smartness'],
    wave: 2,
    description: 'Transaction velocity over time.',
    apply: velocityApply,
  },
  {
    id: 'source_triangulation',
    name: 'Source Triangulation',
    category: 'compliance_framework',
    faculties: ['reasoning', 'ratiocination'],
    wave: 1,
    description: 'Independent-source count for claims.',
    apply: sourceTriangulationApply,
  },
  {
    id: 'completeness_audit',
    name: 'Completeness Audit',
    category: 'data_quality',
    faculties: ['data_analysis', 'introspection'],
    wave: 2,
    description: 'Required-field presence ratio on subject record.',
    apply: completenessAuditApply,
  },
];
