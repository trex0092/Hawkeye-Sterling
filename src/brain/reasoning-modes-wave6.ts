// Wave 6 — behavioral science, network science, cryptoasset forensics,
// geopolitical risk, corporate intelligence, epistemic quality,
// psychological profiling, and insider threat reasoning modes.
// 35 modes. Bespoke apply per mode.

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, ReasoningMode,
} from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function freeTextOf(ctx: BrainContext): string {
  const parts: string[] = [];
  if (typeof ctx.evidence.freeText === 'string') parts.push(ctx.evidence.freeText);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}

function amountsOf(ctx: BrainContext): number[] {
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
      }
    }
  }
  return out;
}

function makeLinguistic(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  patterns: string[],
  label: string,
  flagThresh: number,
  escalateThresh: number,
): (ctx: BrainContext) => Promise<Finding> {
  return async (ctx: BrainContext): Promise<Finding> => {
    const text = freeTextOf(ctx);
    const hits = patterns.filter(p => text.includes(p));
    const score = hits.length === 0 ? 0 : Math.min(0.85, 0.2 + hits.length * 0.15);
    const verdict: Finding['verdict'] = hits.length >= escalateThresh
      ? 'escalate'
      : hits.length >= flagThresh
        ? 'flag'
        : 'clear';
    return {
      modeId, category, faculties,
      producedAt: Date.now(), score,
      confidence: text.length < 32 ? 0.3 : 0.6,
      verdict,
      rationale: `${label} — ${hits.length} indicator(s) in narrative.`,
      evidence: hits.map(h => `kw=${h}`),
    };
  };
}

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
  apply?: (ctx: BrainContext) => Promise<Finding>,
): ReasoningMode => {
  const fallback = makeLinguistic(id, category, faculties, [], description, 1, 2);
  return {
    id, name, category, faculties, wave: 6, description,
    apply: apply ?? fallback,
  };
};

// ── FATF lists (shared by geopolitical modes) ─────────────────────────────────
const FATF_HIGH_RISK = new Set(['IR', 'KP', 'MM']);
const FATF_GREY_LIST = new Set([
  'AF', 'CD', 'NG', 'SD', 'YE', 'BG', 'BF', 'KH', 'CM', 'HR', 'HT', 'KE',
  'LA', 'LB', 'MY', 'ML', 'MZ', 'NA', 'NE', 'SN', 'SS', 'SY', 'TZ', 'TR',
  'VE', 'VN',
]);

function jurisdictionsOf(ctx: BrainContext): string[] {
  const out = new Set<string>();
  if (ctx.subject.jurisdiction) out.add(ctx.subject.jurisdiction.toUpperCase());
  if (ctx.subject.nationality) out.add(ctx.subject.nationality.toUpperCase());
  const ubo = ctx.evidence.uboChain;
  if (Array.isArray(ubo)) {
    for (const e of ubo) {
      if (e && typeof e === 'object') {
        const j =
          (e as Record<string, unknown>)['jurisdiction'] ??
          (e as Record<string, unknown>)['country'];
        if (typeof j === 'string') out.add(j.toUpperCase());
      }
    }
  }
  return [...out];
}

// ── behavioral_science (5) ────────────────────────────────────────────────────
const behavioral_science: ReasoningMode[] = [
  m('bs.confirmation_bias_audit', 'Confirmation Bias Audit', 'behavioral_science',
    ['reasoning', 'introspection'],
    'Audit the evidence-selection process for confirmation bias: enumerate discarded adverse evidence, apply the name-swap test, and require three disconfirming data points before sealing a risk-lowering verdict.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'bs.confirmation_bias_audit';
      const category: ReasoningCategory = 'behavioral_science';
      const faculties: FacultyId[] = ['reasoning', 'introspection'];
      const now = Date.now();

      // Check prior findings ratio
      const flagged = ctx.priorFindings.filter(f =>
        f.verdict === 'flag' || f.verdict === 'escalate',
      );
      const highConf = flagged.filter(f => f.confidence >= 0.7);
      const biasRatio = ctx.priorFindings.length > 0
        ? flagged.length / ctx.priorFindings.length
        : 0;
      const echoChamber = biasRatio > 0.8 && highConf.length >= 2;

      // Text keywords
      const patterns = [
        'discarded', 'ignored', 'excluded', 'cherry-picked', 'selective',
        'confirmatory', 'biased selection', 'name swap', 'disconfirming',
      ];
      const text = freeTextOf(ctx);
      const kwHits = patterns.filter(p => text.includes(p));
      const totalHits = kwHits.length + (echoChamber ? 3 : 0);

      const score = totalHits === 0 ? 0 : Math.min(0.85, 0.2 + totalHits * 0.15);
      const verdict: Finding['verdict'] = totalHits >= 3 ? 'escalate' : totalHits >= 1 ? 'flag' : 'clear';
      const evidence: string[] = kwHits.map(h => `kw=${h}`);
      if (echoChamber) evidence.push(`bias_ratio=${biasRatio.toFixed(2)}`, `high_conf_flags=${highConf.length}`);

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: text.length < 32 ? 0.3 : 0.6, verdict,
        rationale: `Confirmation Bias Audit — ${kwHits.length} keyword signal(s)${echoChamber ? '; echo-chamber pattern detected in prior findings (>80% flag ratio with high confidence)' : ''}.`,
        evidence,
      };
    },
  ),

  m('bs.motivated_reasoning_scan', 'Motivated Reasoning Scan', 'behavioral_science',
    ['reasoning', 'introspection'],
    'Test whether the conclusion aligns with a commercial or relational interest of an internal stakeholder; apply the name-swap identity test; flag any divergence between formal analysis and independent-reviewer expectation.',
    makeLinguistic(
      'bs.motivated_reasoning_scan', 'behavioral_science', ['reasoning', 'introspection'],
      [
        'commercial interest', 'relationship', 'revenue', 'profitable',
        'senior stakeholder', 'management pressure', 'conflict of interest',
        'motivated', 'predetermined', 'conclusion first',
      ],
      'Motivated Reasoning Scan', 1, 2,
    ),
  ),

  m('bs.social_proof_fallacy_check', 'Social Proof Fallacy Check', 'behavioral_science',
    ['reasoning', 'argumentation'],
    'Detect and neutralise "market practice" and "everyone does it" defences; require the specific regulatory provision permitting the practice; treat prevalence without legal authority as a red flag.',
    makeLinguistic(
      'bs.social_proof_fallacy_check', 'behavioral_science', ['reasoning', 'argumentation'],
      [
        'market practice', 'industry standard', 'everyone does', 'common practice',
        'widely accepted', 'normal in the industry', 'standard procedure',
        'prevailing practice', 'peer banks', 'regulatory tolerance',
      ],
      'Social Proof Fallacy Check', 1, 2,
    ),
  ),

  m('bs.sunk_cost_relationship_test', 'Sunk-Cost Relationship Test', 'behavioral_science',
    ['reasoning', 'introspection'],
    'Apply the zero-based risk assessment to relationship continuation: would this entity be approved as a new onboarding today? Prior revenue, tenure, or remediation investment is not a mitigating factor.',
    makeLinguistic(
      'bs.sunk_cost_relationship_test', 'behavioral_science', ['reasoning', 'introspection'],
      [
        'longstanding', 'long-term client', 'years of business', 'tenure',
        'historical relationship', 'prior investment', 'remediation cost',
        'already invested', 'exit cost', 'relationship value',
      ],
      'Sunk-Cost Relationship Test', 1, 2,
    ),
  ),

  m('bs.groupthink_dissent_check', 'Groupthink Dissent Check', 'behavioral_science',
    ['reasoning', 'introspection'],
    'Detect unanimous committee approval on HIGH/CRITICAL cases without documented dissent; verify devil\'s advocate appointment; flag deliberation time under 15 minutes on complex cases as a procedural groupthink indicator.',
    makeLinguistic(
      'bs.groupthink_dissent_check', 'behavioral_science', ['reasoning', 'introspection'],
      [
        'unanimous', 'no dissent', 'all agreed', 'committee approved',
        'approved without', 'no objection', 'rubber stamp', 'fast-tracked',
        'waived review', 'expedited approval',
      ],
      'Groupthink Dissent Check', 1, 2,
    ),
  ),
];

// ── network_science (5) ───────────────────────────────────────────────────────
const network_science: ReasoningMode[] = [
  m('ns.graph_centrality_scoring', 'Graph Centrality Scoring', 'network_science',
    ['data_analysis', 'intelligence'],
    'Compute degree, betweenness, and eigenvector centrality for every node in the subject\'s entity graph; flag high-betweenness nodes (bridge controllers) as priority investigation targets.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'ns.graph_centrality_scoring';
      const category: ReasoningCategory = 'network_science';
      const faculties: FacultyId[] = ['data_analysis', 'intelligence'];
      const now = Date.now();

      const ubo = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain : [];
      const depth = ubo.length;
      let score = depth >= 5 ? 0.6 : depth >= 3 ? 0.4 : 0.15;

      const kwPatterns = ['central', 'hub', 'key node', 'controlling', 'bridge', 'intermediary', 'pivotal'];
      const text = freeTextOf(ctx);
      const kwHits = kwPatterns.filter(p => text.includes(p));
      score = Math.min(0.85, score + kwHits.length * 0.15);

      const verdict: Finding['verdict'] = score >= 0.65 ? 'escalate' : score >= 0.35 ? 'flag' : 'clear';
      const evidence = [`ubo_depth=${depth}`, ...kwHits.map(h => `kw=${h}`)];

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: depth === 0 && text.length < 32 ? 0.3 : 0.65,
        verdict,
        rationale: `Graph Centrality Scoring — UBO depth=${depth}, ${kwHits.length} centrality keyword(s) detected.`,
        evidence,
      };
    },
  ),

  m('ns.bridge_node_analysis', 'Bridge Node Analysis', 'network_science',
    ['data_analysis', 'inference'],
    'Identify articulation points in the counterparty network whose removal would disconnect criminal sub-graphs from legitimate entities; treat bridge nodes as probable gatekeepers requiring EDD.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'ns.bridge_node_analysis';
      const category: ReasoningCategory = 'network_science';
      const faculties: FacultyId[] = ['data_analysis', 'inference'];
      const now = Date.now();

      const ubo = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain : [];
      const depth = ubo.length;
      const baseScore = depth >= 5 ? 0.55 : depth >= 4 ? 0.4 : depth >= 2 ? 0.2 : 0.05;

      const kwPatterns = ['intermediary', 'bridge', 'connector', 'gatekeeper', 'shell', 'nominee', 'pass-through', 'conduit', 'facilitator'];
      const text = freeTextOf(ctx);
      const kwHits = kwPatterns.filter(p => text.includes(p));
      const score = Math.min(0.85, baseScore + kwHits.length * 0.1);

      const verdict: Finding['verdict'] = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: 0.6,
        verdict,
        rationale: `Bridge Node Analysis — UBO depth=${depth}, ${kwHits.length} bridge keyword(s) in narrative.`,
        evidence: [`ubo_depth=${depth}`, ...kwHits.map(h => `kw=${h}`)],
      };
    },
  ),

  m('ns.clique_detection', 'Clique and Dense Subgraph Detection', 'network_science',
    ['data_analysis', 'intelligence'],
    'Detect dense subgraphs (cliques) within the transaction or ownership network; flag cliques where all members share a common controller, registered agent, or beneficial owner as shell-network indicators.',
    makeLinguistic(
      'ns.clique_detection', 'network_science', ['data_analysis', 'intelligence'],
      [
        'same director', 'common controller', 'shared agent', 'same registered',
        'common ownership', 'related parties', 'affiliated entities',
        'common beneficial owner', 'cross-shareholding',
      ],
      'Clique Detection', 2, 4,
    ),
  ),

  m('ns.temporal_network_evolution', 'Temporal Network Evolution Analysis', 'network_science',
    ['data_analysis', 'anticipation'],
    'Track how the entity network evolves over time; detect rapid expansion of node count following a triggering event (regulatory action, sanctions designation) as a network-restructuring evasion signal.',
    makeLinguistic(
      'ns.temporal_network_evolution', 'network_science', ['data_analysis', 'anticipation'],
      [
        'new entity', 'recently formed', 'newly incorporated', 'restructured',
        'following designation', 'after sanctions', 'network expansion',
        'rapid growth', 'sudden increase', 'migration',
      ],
      'Temporal Network Evolution Analysis', 1, 2,
    ),
  ),

  m('ns.network_density_scoring', 'Network Density and Opacity Scoring', 'network_science',
    ['data_analysis', 'intelligence'],
    'Score the network\'s overall opacity using density (edges ÷ max possible edges), proportion of anonymous nodes, and multi-hop depth to reach natural persons; escalate any network scoring HIGH on all three dimensions.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'ns.network_density_scoring';
      const category: ReasoningCategory = 'network_science';
      const faculties: FacultyId[] = ['data_analysis', 'intelligence'];
      const now = Date.now();

      const ubo = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain : [];
      const depth = ubo.length;
      const depthScore = Math.min(0.6, depth * 0.15);

      const opacityKW = ['anonymous', 'bearer shares', 'nominee', 'undisclosed', 'opaque', 'secretive', 'offshore', 'hidden'];
      const text = freeTextOf(ctx);
      const kwHits = opacityKW.filter(p => text.includes(p));
      const score = Math.min(0.85, depthScore + kwHits.length * 0.1);

      const verdict: Finding['verdict'] = score >= 0.65 ? 'escalate' : score >= 0.35 ? 'flag' : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: 0.65,
        verdict,
        rationale: `Network Density and Opacity Scoring — depth score=${depthScore.toFixed(2)}, ${kwHits.length} opacity keyword(s).`,
        evidence: [`ubo_depth=${depth}`, `depth_score=${depthScore.toFixed(2)}`, ...kwHits.map(h => `kw=${h}`)],
      };
    },
  ),
];

// ── cryptoasset_forensics (5) ─────────────────────────────────────────────────
const cryptoasset_forensics: ReasoningMode[] = [
  m('cf.blockchain_provenance_trace', 'Blockchain Provenance Tracing', 'cryptoasset_forensics',
    ['intelligence', 'data_analysis'],
    'Trace cryptoasset flows from wallet to fiat off-ramp across all chains; identify mixer/tumbler exposure, privacy-coin swap, chain-hop, and VASP counterparty licence status at each hop.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'cf.blockchain_provenance_trace';
      const category: ReasoningCategory = 'cryptoasset_forensics';
      const faculties: FacultyId[] = ['intelligence', 'data_analysis'];
      const now = Date.now();

      const patterns = ['mixer', 'tumbler', 'privacy coin', 'chain hop', 'bridge', 'vasp', 'off-ramp', 'fiat conversion', 'tornado', 'monero', 'zcash', 'peel chain'];
      const text = freeTextOf(ctx);
      const kwHits = patterns.filter(p => text.includes(p));

      const amts = amountsOf(ctx);
      let txBonus = 0;
      if (amts.length > 0) {
        const sum = amts.reduce((a, b) => a + b, 0);
        const max = Math.max(...amts);
        if (max / sum > 0.6) txBonus = 0.15;
      }

      const score = kwHits.length === 0 ? txBonus : Math.min(0.85, 0.2 + kwHits.length * 0.15 + txBonus);
      const verdict: Finding['verdict'] = kwHits.length >= 4 ? 'escalate' : kwHits.length >= 2 ? 'flag' : txBonus > 0 ? 'flag' : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: text.length < 32 ? 0.3 : 0.65,
        verdict,
        rationale: `Blockchain Provenance Tracing — ${kwHits.length} chain-forensics signal(s); tx_bonus=${txBonus}.`,
        evidence: [...kwHits.map(h => `kw=${h}`), ...(txBonus > 0 ? ['high_concentration_tx'] : [])],
      };
    },
  ),

  m('cf.defi_protocol_risk_assessment', 'DeFi Protocol Risk Assessment', 'cryptoasset_forensics',
    ['intelligence', 'reasoning'],
    'Assess DeFi protocol interactions: DEX swap chains obscuring origin, cross-chain bridge hops ≥2, NFT wash-trading patterns, DAO treasury beneficiary opacity, liquidity-pool rug-pull indicators.',
    makeLinguistic(
      'cf.defi_protocol_risk_assessment', 'cryptoasset_forensics', ['intelligence', 'reasoning'],
      [
        'defi', 'dex', 'swap', 'liquidity pool', 'flash loan', 'bridge',
        'nft', 'dao', 'governance', 'smart contract', 'yield farming', 'cross-chain',
      ],
      'DeFi Protocol Risk Assessment', 2, 3,
    ),
  ),

  m('cf.vasp_counterparty_profiling', 'VASP Counterparty Profiling', 'cryptoasset_forensics',
    ['intelligence', 'data_analysis'],
    'Profile every VASP counterparty for licence status, FATF jurisdiction risk, travel-rule compliance posture, known mixer or high-risk exchange association, and adverse regulatory history.',
    makeLinguistic(
      'cf.vasp_counterparty_profiling', 'cryptoasset_forensics', ['intelligence', 'data_analysis'],
      [
        'vasp', 'exchange', 'unlicensed', 'unregistered', 'non-compliant',
        'travel rule', 'anonymity-enhanced', 'high-risk exchange', 'mixer',
        'dark market', 'p2p exchange',
      ],
      'VASP Counterparty Profiling', 1, 3,
    ),
  ),

  m('cf.mixer_tumbler_detection', 'Mixer and Tumbler Exposure Detection', 'cryptoasset_forensics',
    ['intelligence', 'inference'],
    'Detect direct or indirect mixer/tumbler interactions across the full wallet cluster; treat any confirmed mixer exposure as a CRITICAL finding requiring Travel Rule compliance check regardless of nominal amount.',
    makeLinguistic(
      'cf.mixer_tumbler_detection', 'cryptoasset_forensics', ['intelligence', 'inference'],
      [
        'mixer', 'tumbler', 'coinjoin', 'wasabi', 'tornado', 'blender',
        'chipmixer', 'samourai', 'anonymisation', 'obfuscation', 'chain-break', 'unlink',
      ],
      'Mixer and Tumbler Exposure Detection', 1, 2,
    ),
  ),

  m('cf.onchain_sanctions_screening', 'On-Chain Sanctions Wallet Screening', 'cryptoasset_forensics',
    ['intelligence', 'data_analysis'],
    'Screen every wallet address in the subject\'s cluster against OFAC SDN crypto addresses, EU consolidated crypto identifiers, and third-party blockchain intelligence attribution clusters for sanctioned entities.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'cf.onchain_sanctions_screening';
      const category: ReasoningCategory = 'cryptoasset_forensics';
      const faculties: FacultyId[] = ['intelligence', 'data_analysis'];
      const now = Date.now();

      // Immediate escalation if sanctions hits exist
      const sanctionsHits = Array.isArray(ctx.evidence.sanctionsHits) ? ctx.evidence.sanctionsHits : [];
      if (sanctionsHits.length > 0) {
        return {
          modeId, category, faculties, producedAt: now,
          score: 0.9, confidence: 0.85, verdict: 'escalate',
          rationale: `On-Chain Sanctions Wallet Screening — ${sanctionsHits.length} direct sanctions hit(s) in evidence — immediate escalation required.`,
          evidence: [`sanctions_hits=${sanctionsHits.length}`],
        };
      }

      const patterns = ['ofac', 'sdn', 'sanctioned wallet', 'blocked address', 'lazarus', 'dprk wallet', 'tornado cash', 'eu crypto', 'blacklisted address', 'designated wallet'];
      const text = freeTextOf(ctx);
      const kwHits = patterns.filter(p => text.includes(p));
      const score = kwHits.length === 0 ? 0 : Math.min(0.85, 0.2 + kwHits.length * 0.15);
      const verdict: Finding['verdict'] = kwHits.length >= 2 ? 'escalate' : kwHits.length >= 1 ? 'flag' : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: text.length < 32 ? 0.3 : 0.6,
        verdict,
        rationale: `On-Chain Sanctions Wallet Screening — ${kwHits.length} on-chain sanctions keyword(s) in narrative.`,
        evidence: kwHits.map(h => `kw=${h}`),
      };
    },
  ),
];

// ── geopolitical_risk (4) ─────────────────────────────────────────────────────
const geopolitical_risk: ReasoningMode[] = [
  m('gr.sanctions_jurisdiction_shift', 'Sanctions Evasion via Jurisdiction Shift', 'geopolitical_risk',
    ['geopolitical_awareness', 'intelligence'],
    'Detect rapid re-registration, flag-hopping, or beneficial-ownership migration to a new jurisdiction immediately following or anticipating a sanctions designation; treat timing coincidence as evasion evidence.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'gr.sanctions_jurisdiction_shift';
      const category: ReasoningCategory = 'geopolitical_risk';
      const faculties: FacultyId[] = ['geopolitical_awareness', 'intelligence'];
      const now = Date.now();

      const js = jurisdictionsOf(ctx);
      const fatfHigh = js.filter(j => FATF_HIGH_RISK.has(j));
      const fatfGrey = js.filter(j => FATF_GREY_LIST.has(j));

      const shiftKW = ['re-registered', 'flag of convenience', 'relocated', 'transferred', 'moved to', 'new jurisdiction', 'following designation', 'after sanctions', 'evasion', 'circumvent'];
      const text = freeTextOf(ctx);
      const kwHits = shiftKW.filter(p => text.includes(p));

      let score = 0;
      if (fatfHigh.length > 0) score += 0.5;
      else if (fatfGrey.length > 0) score += 0.25;
      score += kwHits.length * 0.1;
      score = Math.min(0.85, score);

      const verdict: Finding['verdict'] = fatfHigh.length > 0 || (kwHits.length >= 2 && fatfGrey.length > 0)
        ? 'escalate'
        : fatfGrey.length > 0 || kwHits.length >= 1
          ? 'flag'
          : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: 0.65,
        verdict,
        rationale: `Sanctions Evasion via Jurisdiction Shift — jurisdictions: [${js.join(', ')}]; FATF high=${fatfHigh.length}, grey=${fatfGrey.length}; ${kwHits.length} evasion keyword(s).`,
        evidence: [
          `chain=${js.join('→')}`,
          ...fatfHigh.map(j => `fatf_high=${j}`),
          ...fatfGrey.map(j => `fatf_grey=${j}`),
          ...kwHits.map(h => `kw=${h}`),
        ],
      };
    },
  ),

  m('gr.state_sponsored_ml_detection', 'State-Sponsored Money Laundering Detection', 'geopolitical_risk',
    ['geopolitical_awareness', 'intelligence'],
    'Apply the DPRK, Iran, and Russia state-sponsored ML typologies; cross-reference crypto wallet clusters, petroleum trade routes, and oligarch asset-migration patterns against published UN Panel of Experts and OFAC advisory attribution data.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'gr.state_sponsored_ml_detection';
      const category: ReasoningCategory = 'geopolitical_risk';
      const faculties: FacultyId[] = ['geopolitical_awareness', 'intelligence'];
      const now = Date.now();

      const patterns = ['dprk', 'north korea', 'lazarus', 'iran', 'irgc', 'russia', 'oligarch', 'siloviki', 'un panel', 'ofac advisory', 'petroleum trade', 'oil sanctions'];
      const text = freeTextOf(ctx);
      const kwHits = patterns.filter(p => text.includes(p));

      const js = jurisdictionsOf(ctx);
      const stateJurisdictions = js.filter(j => ['KP', 'IR', 'RU'].includes(j));

      const score = Math.min(0.85, kwHits.length * 0.15 + stateJurisdictions.length * 0.3);
      const verdict: Finding['verdict'] = kwHits.length >= 2 || stateJurisdictions.length > 0
        ? 'escalate'
        : kwHits.length >= 1
          ? 'flag'
          : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: text.length < 32 ? 0.3 : 0.65,
        verdict,
        rationale: `State-Sponsored ML Detection — ${kwHits.length} typology keyword(s); state-actor jurisdiction(s): [${stateJurisdictions.join(', ') || 'none'}].`,
        evidence: [...kwHits.map(h => `kw=${h}`), ...stateJurisdictions.map(j => `state_jur=${j}`)],
      };
    },
  ),

  m('gr.geopolitical_recalibration_trigger', 'Geopolitical Recalibration Trigger', 'geopolitical_risk',
    ['geopolitical_awareness', 'anticipation'],
    'Trigger portfolio-wide risk recalibration upon FATF grey/black-listing, UN Security Council sanctions resolution, armed conflict outbreak, or major CPI movement ≥10 points affecting a jurisdiction with existing customer exposure.',
    makeLinguistic(
      'gr.geopolitical_recalibration_trigger', 'geopolitical_risk', ['geopolitical_awareness', 'anticipation'],
      [
        'fatf grey list', 'fatf blacklist', 'un security council', 'armed conflict',
        'cpi drop', 'sanctions resolution', 'new designation', 'conflict outbreak',
        'state failure', 'coup',
      ],
      'Geopolitical Recalibration Trigger', 1, 2,
    ),
  ),

  m('gr.conflict_zone_nexus_mapping', 'Conflict Zone Nexus Mapping', 'geopolitical_risk',
    ['geopolitical_awareness', 'synthesis'],
    'Map every financial flow with a nexus to an active armed-conflict zone; assess whether flows constitute legitimate humanitarian activity, commercial activity with conflict-finance risk, or direct TF/PF facilitation; cite CAHRA registry entries for each zone.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'gr.conflict_zone_nexus_mapping';
      const category: ReasoningCategory = 'geopolitical_risk';
      const faculties: FacultyId[] = ['geopolitical_awareness', 'synthesis'];
      const now = Date.now();

      const patterns = ['conflict zone', 'war', 'armed group', 'cahra', 'humanitarian', 'military', 'paramilitary', 'rebel', 'sanctioned regime', 'occupied territory'];
      const text = freeTextOf(ctx);
      const kwHits = patterns.filter(p => text.includes(p));

      const js = jurisdictionsOf(ctx);
      const highRisk = js.filter(j => FATF_HIGH_RISK.has(j));

      const score = Math.min(0.85, kwHits.length * 0.15 + highRisk.length * 0.25);
      const verdict: Finding['verdict'] = highRisk.length > 0 || kwHits.length >= 2
        ? 'escalate'
        : kwHits.length >= 1
          ? 'flag'
          : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: text.length < 32 ? 0.3 : 0.6,
        verdict,
        rationale: `Conflict Zone Nexus Mapping — ${kwHits.length} conflict keyword(s); FATF high-risk jurisdiction(s): [${highRisk.join(', ') || 'none'}].`,
        evidence: [...kwHits.map(h => `kw=${h}`), ...highRisk.map(j => `fatf_high=${j}`)],
      };
    },
  ),
];

// ── corporate_intelligence (4) ────────────────────────────────────────────────
const corporate_intelligence: ReasoningMode[] = [
  m('ci.beneficial_ownership_graph_walk', 'Beneficial Ownership Graph Walk', 'corporate_intelligence',
    ['intelligence', 'data_analysis'],
    'Pierce every corporate, trust, foundation, and partnership veil to natural-person level; flag any chain exceeding 5 layers without a natural person identified at ≥25% ownership or effective control as a UBO opacity alert.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'ci.beneficial_ownership_graph_walk';
      const category: ReasoningCategory = 'corporate_intelligence';
      const faculties: FacultyId[] = ['intelligence', 'data_analysis'];
      const now = Date.now();

      const ubo = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain : [];
      const depth = ubo.length;

      const naturalPersonKW = ['natural person', 'ultimate beneficial owner', 'ubo identified', 'beneficial owner'];
      const text = freeTextOf(ctx);
      const npHits = naturalPersonKW.filter(p => text.includes(p));
      const naturalPersonFound = npHits.length > 0;

      // Score based on depth
      let score: number;
      let verdict: Finding['verdict'];
      if (depth >= 5 && !naturalPersonFound) {
        score = 0.75;
        verdict = 'escalate';
      } else if (depth >= 3) {
        score = 0.3;
        verdict = 'flag';
      } else if (depth >= 1) {
        score = 0.1;
        verdict = 'clear';
      } else {
        score = 0;
        verdict = 'inconclusive';
      }

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: depth === 0 ? 0.3 : 0.65,
        verdict,
        rationale: `Beneficial Ownership Graph Walk — UBO chain depth=${depth}; natural person ${naturalPersonFound ? 'identified' : 'NOT identified'}.`,
        evidence: [`ubo_depth=${depth}`, `natural_person_found=${naturalPersonFound}`, ...npHits.map(h => `kw=${h}`)],
      };
    },
  ),

  m('ci.shell_company_hallmark_scorer', 'Shell Company Hallmark Scorer', 'corporate_intelligence',
    ['intelligence', 'reasoning'],
    'Score for shell hallmarks: bearer shares, nominee directors/shareholders, registered-agent address shared with ≥50 entities, no employees/premises/activity, jurisdiction-stacking across ≥2 secrecy jurisdictions; 3+ hallmarks = hard escalation.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'ci.shell_company_hallmark_scorer';
      const category: ReasoningCategory = 'corporate_intelligence';
      const faculties: FacultyId[] = ['intelligence', 'reasoning'];
      const now = Date.now();

      const hallmarkKW = [
        'bearer shares', 'nominee director', 'registered agent', 'no employees',
        'no premises', 'secrecy jurisdiction', 'shell company', 'no activity',
        'dormant', 'special purpose vehicle',
      ];
      const text = freeTextOf(ctx);
      const kwHits = hallmarkKW.filter(p => text.includes(p));
      const hallmarkCount = kwHits.length;

      const score = Math.min(0.85, hallmarkCount * 0.18);
      const verdict: Finding['verdict'] = hallmarkCount >= 3
        ? 'escalate'
        : hallmarkCount >= 1
          ? 'flag'
          : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: text.length < 32 ? 0.3 : 0.65,
        verdict,
        rationale: `Shell Company Hallmark Scorer — ${hallmarkCount} hallmark(s) detected.`,
        evidence: kwHits.map(h => `hallmark=${h}`),
      };
    },
  ),

  m('ci.professional_intermediary_audit', 'Professional Intermediary Audit', 'corporate_intelligence',
    ['intelligence', 'argumentation'],
    'Audit every lawyer, notary, accountant, trust/company service provider, and registered agent in the ownership chain; verify professional registration, absence of enforcement history, and whether their role creates a principal-agent misalignment.',
    makeLinguistic(
      'ci.professional_intermediary_audit', 'corporate_intelligence', ['intelligence', 'argumentation'],
      [
        'lawyer', 'solicitor', 'notary', 'accountant', 'trust company',
        'service provider', 'tcsp', 'registered agent', 'professional intermediary',
        'gatekeeping', 'client account', 'legal privilege',
      ],
      'Professional Intermediary Audit', 2, 4,
    ),
  ),

  m('ci.corporate_substance_test', 'Corporate Substance Test', 'corporate_intelligence',
    ['intelligence', 'data_analysis'],
    'Compare declared revenue against sector-average revenue-per-employee benchmarks; verify physical premises, payroll records, supplier invoices, and utility consumption proportionate to stated business scale; flag implausible substance across ≥3 metrics as a probable front.',
    makeLinguistic(
      'ci.corporate_substance_test', 'corporate_intelligence', ['intelligence', 'data_analysis'],
      [
        'no employees', 'no payroll', 'no premises', 'implausible revenue', 'no activity',
        'dormant', 'no suppliers', 'virtual office', 'letterbox', 'revenue mismatch',
        'inflated revenue',
      ],
      'Corporate Substance Test', 2, 4,
    ),
  ),
];

// ── epistemic_quality (4) ─────────────────────────────────────────────────────
const epistemic_quality: ReasoningMode[] = [
  m('eq.source_reliability_scoring', 'Source Reliability Scoring', 'epistemic_quality',
    ['reasoning', 'synthesis'],
    'Score every source used in the assessment on a four-tier reliability scale: (1) primary documentary evidence, (2) peer-reviewed/regulator notice, (3) mainstream financial press, (4) unverified secondary; weight conclusions proportionally and flag any HIGH verdict resting primarily on tier-4 sources.',
    makeLinguistic(
      'eq.source_reliability_scoring', 'epistemic_quality', ['reasoning', 'synthesis'],
      [
        'unverified', 'alleged', 'rumour', 'anonymous source', 'social media',
        'blog', 'hearsay', 'unconfirmed', 'single source', 'unattributed',
      ],
      'Source Reliability Scoring', 1, 2,
    ),
  ),

  m('eq.evidence_triangulation_check', 'Evidence Triangulation Check', 'epistemic_quality',
    ['reasoning', 'synthesis'],
    'For every HIGH or CRITICAL adverse finding, require ≥3 independent corroborating sources from different source pipelines; flag any finding corroborated by only 1–2 sources as SINGLE-SOURCE RISK requiring expedited re-investigation.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'eq.evidence_triangulation_check';
      const category: ReasoningCategory = 'epistemic_quality';
      const faculties: FacultyId[] = ['reasoning', 'synthesis'];
      const now = Date.now();

      const escalatePriors = ctx.priorFindings.filter(f => f.verdict === 'escalate');
      const totalPriors = ctx.priorFindings.length;

      let score: number;
      let verdict: Finding['verdict'];
      let rationale: string;

      if (escalatePriors.length >= 2 && totalPriors >= 3) {
        score = 0.15;
        verdict = 'clear';
        rationale = `Evidence Triangulation Check — ${escalatePriors.length} escalation(s) supported by ${totalPriors} independent priors. Triangulation satisfied.`;
      } else if (escalatePriors.length >= 1 && totalPriors < 3) {
        score = 0.55;
        verdict = 'flag';
        rationale = `Evidence Triangulation Check — escalation finding(s) present but only ${totalPriors} prior(s) available — SINGLE-SOURCE RISK.`;
      } else {
        score = 0.1;
        verdict = 'clear';
        rationale = `Evidence Triangulation Check — no escalation findings; ${totalPriors} prior(s) reviewed.`;
      }

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: totalPriors < 2 ? 0.3 : 0.65,
        verdict,
        rationale,
        evidence: [`escalate_priors=${escalatePriors.length}`, `total_priors=${totalPriors}`],
      };
    },
  ),

  m('eq.base_rate_calibration', 'Base Rate Calibration', 'epistemic_quality',
    ['reasoning', 'inference'],
    'Calculate the empirical SAR/adverse-media/enforcement base rate for entities matching the subject\'s sector, jurisdiction, PEP status, and transaction profile; apply Bayesian updating explicitly — state prior, likelihood ratio, and posterior before adjusting the risk tier.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'eq.base_rate_calibration';
      const category: ReasoningCategory = 'epistemic_quality';
      const faculties: FacultyId[] = ['reasoning', 'inference'];
      const now = Date.now();

      // Compute prior from priorFindings mean score
      const priors = ctx.priorFindings;
      const priorMean = priors.length > 0
        ? priors.reduce((a, f) => a + f.score, 0) / priors.length
        : 0.05;

      const pepHits = Array.isArray(ctx.evidence.pepHits) ? ctx.evidence.pepHits : [];
      const sanctionsHits = Array.isArray(ctx.evidence.sanctionsHits) ? ctx.evidence.sanctionsHits : [];

      // Bayesian update: multiply by likelihood ratio
      let posterior = priorMean;
      if (pepHits.length > 0) posterior = Math.min(0.95, posterior * 3);
      if (sanctionsHits.length > 0) posterior = Math.min(0.95, posterior * 10);

      const score = Math.min(0.85, posterior);
      const verdict: Finding['verdict'] = score >= 0.7 ? 'escalate' : score >= 0.35 ? 'flag' : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: 0.65,
        verdict,
        rationale: `Base Rate Calibration — prior=${priorMean.toFixed(3)}, PEP LR=${pepHits.length > 0 ? '3x' : '1x'}, sanctions LR=${sanctionsHits.length > 0 ? '10x' : '1x'}, posterior=${posterior.toFixed(3)}.`,
        evidence: [`prior=${priorMean.toFixed(3)}`, `posterior=${posterior.toFixed(3)}`, `pep_hits=${pepHits.length}`, `sanctions_hits=${sanctionsHits.length}`],
      };
    },
  ),

  m('eq.scope_sensitivity_audit', 'Scope Sensitivity Audit', 'epistemic_quality',
    ['reasoning', 'data_analysis'],
    'Verify that the risk score scales monotonically with the magnitude of evidence: USD 100M exposure must score higher than USD 100K for equivalent structural characteristics; 50 corroborated adverse-media hits must score higher than 1 isolated hit.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'eq.scope_sensitivity_audit';
      const category: ReasoningCategory = 'epistemic_quality';
      const faculties: FacultyId[] = ['reasoning', 'data_analysis'];
      const now = Date.now();

      const amts = amountsOf(ctx);
      let score = 0;
      const evidence: string[] = [];

      if (amts.length > 0) {
        const sum = amts.reduce((a, b) => a + b, 0);
        const max = Math.max(...amts);
        const concentration = max / sum;
        evidence.push(`tx_count=${amts.length}`, `tx_sum=${sum.toFixed(2)}`, `concentration=${concentration.toFixed(2)}`);

        if (concentration > 0.7) score += 0.3;
        if (sum > 1_000_000) score += 0.25;
        else if (sum > 100_000) score += 0.15;
      }

      const adverseMedia = Array.isArray(ctx.evidence.adverseMedia) ? ctx.evidence.adverseMedia : [];
      if (adverseMedia.length > 0) {
        score += Math.min(0.2, adverseMedia.length * 0.04);
        evidence.push(`adverse_media=${adverseMedia.length}`);
      }

      score = Math.min(0.85, score);
      const verdict: Finding['verdict'] = score >= 0.5 ? 'flag' : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: amts.length === 0 ? 0.3 : 0.65,
        verdict,
        rationale: `Scope Sensitivity Audit — score=${score.toFixed(2)} based on tx magnitude and adverse media volume.`,
        evidence,
      };
    },
  ),
];

// ── psychological_profiling (4) ───────────────────────────────────────────────
const psychological_profiling: ReasoningMode[] = [
  m('pp.moral_disengagement_detection', 'Moral Disengagement Detection', 'psychological_profiling',
    ['intelligence', 'introspection'],
    'Identify moral disengagement mechanisms in case record and counterparty communications: euphemistic labelling, displacement of responsibility through intermediaries, diffusion of responsibility, dehumanisation of victims — each is an independent red flag naming deliberate construction.',
    makeLinguistic(
      'pp.moral_disengagement_detection', 'psychological_profiling', ['intelligence', 'introspection'],
      [
        'just following orders', 'not my responsibility', 'business decision',
        'commercial necessity', 'technical compliance', 'euphemism', 'displacement',
        'diffusion', 'victim blaming', 'dehumanise',
      ],
      'Moral Disengagement Detection', 1, 2,
    ),
  ),

  m('pp.authority_exploitation_probe', 'Authority Exploitation Probe', 'psychological_profiling',
    ['reasoning', 'introspection'],
    'Detect counterparty use of authority figures, professional credentials, or regulatory relationships to suppress due diligence scrutiny; require independent corroboration for every authority assertion used in a risk-lowering conclusion.',
    makeLinguistic(
      'pp.authority_exploitation_probe', 'psychological_profiling', ['reasoning', 'introspection'],
      [
        'approved by senior', 'management approval', 'board decision',
        'regulatory sign-off', 'authority', 'compliance confirmed', 'legal opinion',
        'certified by', 'endorsed by', 'regulatory relationship',
      ],
      'Authority Exploitation Probe', 1, 2,
    ),
  ),

  m('pp.urgency_pressure_indicator', 'Urgency and Pressure Indicator', 'psychological_profiling',
    ['intelligence', 'introspection'],
    'Flag unusual urgency, deadline pressure, or emotional appeals to complete transactions or onboarding; document reluctance to provide information and stated preference for cash or bearer instruments as qualitative behavioral risk indicators.',
    makeLinguistic(
      'pp.urgency_pressure_indicator', 'psychological_profiling', ['intelligence', 'introspection'],
      [
        'urgent', 'deadline', 'time-sensitive', 'immediate', 'asap', 'today',
        'no delay', 'rush', 'pressure', 'must complete', 'time pressure',
        'end of day', 'bearer instrument', 'cash preference',
      ],
      'Urgency and Pressure Indicator', 2, 4,
    ),
  ),

  m('pp.narrative_coherence_scoring', 'Narrative Coherence Scoring', 'psychological_profiling',
    ['reasoning', 'synthesis'],
    'Read the subject\'s declared narrative — business purpose, transaction pattern, geographic footprint, SoW, counterparty relationships — as a single connected story; score coherence HIGH/MEDIUM/LOW; every internal inconsistency is more powerful evidence than an isolated red flag.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'pp.narrative_coherence_scoring';
      const category: ReasoningCategory = 'psychological_profiling';
      const faculties: FacultyId[] = ['reasoning', 'synthesis'];
      const now = Date.now();

      const inconsistencyKW = [
        'inconsistent', 'contradiction', 'discrepancy', 'mismatch', 'implausible',
        'unlikely', 'does not explain', 'unexplained', 'gap', 'missing',
      ];
      const text = freeTextOf(ctx);
      const kwHits = inconsistencyKW.filter(p => text.includes(p));

      // Also cross-check subject_type + jurisdiction + tx pattern
      const hasJurisdiction = !!ctx.subject.jurisdiction;
      const txCount = Array.isArray(ctx.evidence.transactions) ? ctx.evidence.transactions.length : 0;
      const structuralBonus = (!hasJurisdiction && txCount > 0) ? 1 : 0;

      const totalHits = kwHits.length + structuralBonus;
      const score = totalHits === 0 ? 0 : Math.min(0.85, 0.2 + totalHits * 0.15);
      const verdict: Finding['verdict'] = totalHits >= 4 ? 'escalate' : totalHits >= 2 ? 'flag' : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: text.length < 32 ? 0.3 : 0.6,
        verdict,
        rationale: `Narrative Coherence Scoring — ${kwHits.length} inconsistency keyword(s); structural coherence gap=${structuralBonus > 0 ? 'yes' : 'no'}.`,
        evidence: [...kwHits.map(h => `kw=${h}`), ...(structuralBonus > 0 ? ['structural=missing_jurisdiction_with_txs'] : [])],
      };
    },
  ),
];

// ── insider_threat (4) ────────────────────────────────────────────────────────
const insider_threat: ReasoningMode[] = [
  m('it.privilege_abuse_chain_trace', 'Privilege Abuse Chain Trace', 'insider_threat',
    ['intelligence', 'inference'],
    'Trace insider-threat signals along the full privilege-abuse chain: authorised access → abnormal access pattern → exfiltration vector → external recipient → monetisation path; do not conclude "disgruntled employee" without every link evidenced.',
    makeLinguistic(
      'it.privilege_abuse_chain_trace', 'insider_threat', ['intelligence', 'inference'],
      [
        'authorised access', 'abnormal access', 'exfiltration', 'data export',
        'unusual hours', 'bulk download', 'external recipient', 'monetisation',
        'data theft', 'privileged account', 'system access',
      ],
      'Privilege Abuse Chain Trace', 1, 2,
    ),
  ),

  m('it.analyst_integrity_audit', 'Analyst Integrity Audit', 'insider_threat',
    ['introspection', 'reasoning'],
    'Audit the assessment chain for analyst conflicts of interest: undisclosed personal relationships with the subject, performance incentives aligned with a specific verdict, or hierarchical pressure from revenue-generating stakeholders; flag any alignment as a compliance integrity risk.',
    makeLinguistic(
      'it.analyst_integrity_audit', 'insider_threat', ['introspection', 'reasoning'],
      [
        'conflict of interest', 'personal relationship', 'undisclosed', 'incentive',
        'performance pressure', 'revenue alignment', 'commercial interest', 'bias',
        'prejudged', 'revenue generating',
      ],
      'Analyst Integrity Audit', 1, 2,
    ),
  ),

  m('it.access_anomaly_detection', 'Access Anomaly Detection', 'insider_threat',
    ['intelligence', 'data_analysis'],
    'Detect abnormal case-file access patterns: access outside normal working hours, bulk exports of CDD data, access to cases outside the analyst\'s assigned portfolio, or access immediately before a relationship approval or STR deadline — each is a behavioural access indicator.',
    makeLinguistic(
      'it.access_anomaly_detection', 'insider_threat', ['intelligence', 'data_analysis'],
      [
        'outside hours', 'bulk export', 'after hours', 'weekend access', 'off-hours',
        'unusual volume', 'mass download', 'access anomaly', 'outside portfolio',
        'before deadline',
      ],
      'Access Anomaly Detection', 1, 2,
    ),
  ),

  m('it.whistleblower_intelligence_integration', 'Whistleblower Intelligence Integration', 'insider_threat',
    ['intelligence', 'synthesis'],
    'Integrate whistleblower disclosures as credible adverse intelligence: apply the five-step protocol (cite as unverified, trigger enhanced adverse-media review, escalate to EDD, document corroboration status, file STR if corroborated by ≥2 independent sources); never dismiss solely on informal provenance.',
    async (ctx: BrainContext): Promise<Finding> => {
      const modeId = 'it.whistleblower_intelligence_integration';
      const category: ReasoningCategory = 'insider_threat';
      const faculties: FacultyId[] = ['intelligence', 'synthesis'];
      const now = Date.now();

      const patterns = [
        'whistleblower', 'disclosure', 'tip-off', 'informant', 'protected disclosure',
        'anonymous report', 'internal report', 'concern raised', 'speak-up',
        'corroborated', 'credible source',
      ];
      const text = freeTextOf(ctx);
      const kwHits = patterns.filter(p => text.includes(p));

      // If corroborated by ≥2 priors that escalate → escalate
      const corroboratedPriors = ctx.priorFindings.filter(f => f.verdict === 'escalate' || f.verdict === 'flag');
      const corroborated = corroboratedPriors.length >= 2;

      const score = kwHits.length === 0 ? 0 : Math.min(0.85, 0.2 + kwHits.length * 0.15);
      const verdict: Finding['verdict'] = (kwHits.length >= 1 && corroborated) || kwHits.length >= 2
        ? 'escalate'
        : kwHits.length >= 1
          ? 'flag'
          : 'clear';

      return {
        modeId, category, faculties, producedAt: now, score,
        confidence: text.length < 32 ? 0.3 : 0.6,
        verdict,
        rationale: `Whistleblower Intelligence Integration — ${kwHits.length} disclosure keyword(s); corroborated by prior findings: ${corroborated}.`,
        evidence: [...kwHits.map(h => `kw=${h}`), `corroborated=${corroborated}`, `corroborating_priors=${corroboratedPriors.length}`],
      };
    },
  ),
];

export const WAVE6_MODES: ReasoningMode[] = [
  ...behavioral_science,
  ...network_science,
  ...cryptoasset_forensics,
  ...geopolitical_risk,
  ...corporate_intelligence,
  ...epistemic_quality,
  ...psychological_profiling,
  ...insider_threat,
];

export const WAVE6_OVERRIDES: ReasoningMode[] = [];
