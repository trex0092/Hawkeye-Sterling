// Hawkeye Sterling — mode explainer.
// Given a mode id from the 690-mode catalogue, explain:
//   - what analytic tradition it belongs to (from the categoriser)
//   - what it's best for (category description)
//   - what faculties + reasoning-mode ids in the core brain it engages
//   - whether an authored prompt prefix exists (and a short preview)
// This powers tooltips + mode-detail panels in the picker.

import { MLRO_MODE_IDS } from './mlro-reasoning-modes.js';
import { MLRO_PREFIX_BY_ID } from './mlro-prefixes.generated.js';

export interface ModeExplanation {
  id: string;
  found: boolean;
  category: string;
  categoryDescription: string;
  engagedFaculties: string[];
  engagedCoreModes: string[];
  hasAuthoredPrefix: boolean;
  prefixPreview?: string | undefined;
  warnings: string[];
}

const CATEGORY_DESC: Record<string, string> = {
  gold_dpms: 'Gold / DPMS — LBMA RGG 5-step, OECD DDG Annex II, CAHRA, doré, assay reconciliation.',
  quantitative: 'Quantitative — Bayesian, probabilistic, statistical, information-theoretic.',
  threat_modeling: 'Threat modelling — STRIDE, PASTA, MITRE, adversarial, red-team, bowtie, kill-chain.',
  ubo_transparency: 'UBO & transparency — tree walk, nominee detection, bearer-share check.',
  crypto: 'Crypto / VASP — chain analysis, mixer forensics, bridge trace, travel rule, DeFi.',
  correspondent: 'Correspondent banking — nested flow, U-turn, Wolfsberg CBDDQ.',
  cdd_edd: 'CDD / EDD — onboarding, SoW, SoF, periodic refresh.',
  filings: 'Filings — STR / SAR / FFR / PNMR / CTR, goAML.',
  governance: 'Governance — four-eyes, SoD, policy, MLRO escalation, audit.',
  logic: 'Formal logic — modus ponens/tollens, reductio, propositional, predicate, modal.',
  sanctions_pf: 'Sanctions / PF — EOCN, UN, OFAC, OFSI, TFS, dual-use, DPRK/Iran regimes.',
  maritime: 'Maritime — vessel, AIS, STSS, flag-of-convenience, port state.',
  trade_finance: 'Trade finance — LC, UCP 600, invoice integrity, incoterms, phantom shipment.',
  real_estate: 'Real estate — cash purchase, shell buyer, rapid flip, golden-visa investment.',
  pep: 'PEP / RCA — political exposure, family & close associates.',
  npo: 'NPO / charity — conflict-zone disbursement, programme/cash ratio.',
  insurance: 'Insurance — premium overfund, beneficiary rotation, surrender.',
  gambling: 'Gambling — junket, casino flow, online velocity.',
  luxury: 'Luxury assets — art provenance, yacht/jet registration, auction rings.',
  fraud: 'Fraud — BEC, synthetic ID, Ponzi, phoenix, invoice, advance-fee.',
  market_abuse: 'Market abuse — insider trading, spoofing, layering, wash trading.',
  ethics_rhetoric: 'Ethics / rhetoric — Toulmin, IRAC, CRAAC, Rogerian, deontology/utility/virtue.',
  cognitive: 'Cognitive — System 1/2, OODA, pre-/post-mortem, bias audit, calibration.',
  strategic: 'Strategic — SWOT, PESTLE, Porter, STEEP, war-game, scenario planning.',
  forensic: 'Forensic — timeline, link-analysis, pattern-of-life, linguistic forensics.',
  data_quality: 'Data quality — completeness, freshness, provenance, lineage, tamper.',
  compliance_framework: 'Compliance framework — article walk, regime matrix, jurisdiction cascade, DPMS KPIs.',
  general: 'General — catch-all for modes that cross categories.',
};

function categorise(id: string): string {
  const s = id;
  const has = (...xs: string[]) => xs.some((x) => s.includes(x));
  if (has('bullion_','gold','lbma','dpms','refiner','dore','assay','cahra')) return 'gold_dpms';
  if (has('bayes','probabilistic','statistical','markov','regression','hmm','frequent','monte_carlo','kl_','entropy','chi_square','fermi','time_series','survival','hypothesis_test','confidence_interval')) return 'quantitative';
  if (has('attack','mitre','threat','stride','pasta','fair','octave','red_team','tabletop','bowtie','kill_chain','adversarial')) return 'threat_modeling';
  if (has('ubo','bearer','nominee')) return 'ubo_transparency';
  if (has('crypto','mixer','wallet','chain_analysis','mev','bridge','defi','nft','privacy_coin','taint','stablecoin')) return 'crypto';
  if (has('corresp','nested','u_turn','turn_')) return 'correspondent';
  if (has('cdd','edd','onboard','prospect','sow','sof')) return 'cdd_edd';
  if (has('str','ffr','pnmr','sar','ctr','filing','goaml','narrative_str')) return 'filings';
  if (has('audit','four_eyes','sod','segregation','policy','governance','mlro','board_reporting','escalation','training','insurance','control_effect','regulatory_correspondence')) return 'governance';
  if (has('modus','reductio','syllog','ponens','tollens','predicate','propositional','modal','deontic','temporal','epistemic','paraconsistent','non_monotonic','default_reasoning')) return 'logic';
  if (has('sanction','eocn','un_1','ofac','fatf','ofsi','tfs','pf_','proliferation')) return 'sanctions_pf';
  if (has('vessel','stss','maritime','flag','ais','ship','imo','port_state')) return 'maritime';
  if (has('tbml','invoice','trade_','ucp600','lc_','incoterms','hs_','bill_of_lading','over_invoice','under_invoice','phantom_')) return 'trade_finance';
  if (has('re_','real_estate','property','villa','goldenvisa','rapid_flip')) return 'real_estate';
  if (has('pep','rca')) return 'pep';
  if (has('npo','charity')) return 'npo';
  if (has('insurance','life_','policy_lapse','beneficiary_rotation','premium_overfund')) return 'insurance';
  if (has('gambling','casino','junket')) return 'gambling';
  if (has('art_','yacht','jet','luxury')) return 'luxury';
  if (has('advance_fee','bec','synthetic_id','ponzi','phoenix','ato_','sim_swap','app_scam','fraud','chargeback','refund','invoice_fraud','loyalty')) return 'fraud';
  if (has('market_','insider','spoof','wash_trade','marking','layering','front_running')) return 'market_abuse';
  if (has('ethic','deontolog','utilitarian','virtue','rogerian','toulmin','irac','craac')) return 'ethics_rhetoric';
  if (has('ooda','pre_mortem','post_mortem','steelman','hindsight','cognitive_bias','dual_process','system_1','system_2','availability_check','framing_check','anchoring','overconfidence','planning_fallacy','loss_aversion','confidence_calibration')) return 'cognitive';
  if (has('swot','pestle','scenario','war_game','stakeholder','porter','steep','lens_shift','strategic','minimum_viable')) return 'strategic';
  if (has('five_whys','fishbone','fmea','pareto','swiss_cheese','causal','timeline','link_analysis','centrality','community_detection','motif','shortest_path','graph','evidence_graph','entity_resolution','pattern_of_life','peer_group_anomaly','insider_threat','collusion','self_dealing','ghost_emp','lapping','linguistic_forensics','narrative_coherence','sentiment','spike_detection','velocity_analysis','seasonality','regime_change','pep_group')) return 'forensic';
  if (has('data_quality','reconciliation','completeness','freshness','source_credibility','tamper','lineage','provenance','discrepancy_log','data_integrity','schema_drift')) return 'data_quality';
  if (has('retention_audit','peer_benchmark','source_triangulation','article_by_article','circular_walk','cabinet_res','list_walk','jurisdiction_cascade','sanctions_regime_matrix','kpi_dpms','emirate_jurisdiction','regulatory_mapping','exception_log','policy_drift','policy_vs_rule','de_minimis','proportionality','stare_decisis','analogical_precedent','gray_zone_resolution')) return 'compliance_framework';
  return 'general';
}

const CAT_TO_CORE_MODES: Record<string, string[]> = {
  gold_dpms: ['lbma_rgg_five_step', 'oecd_ddg_annex', 'provenance_trace', 'lineage'],
  quantitative: ['bayes_theorem', 'regression', 'monte_carlo', 'entropy'],
  threat_modeling: ['attack_tree', 'mitre_attack', 'stride', 'bowtie'],
  ubo_transparency: ['ubo_tree_walk', 'ubo_nominee_directors', 'ubo_bearer_shares'],
  crypto: ['chain_analysis', 'privacy_coin_reasoning', 'bridge_risk', 'mev_scan'],
  correspondent: ['corresp_nested_bank_flow', 'kyb_strict'],
  cdd_edd: ['cdd_prospect_individual', 'cdd_prospect_entity', 'edd_sow_scope', 'completeness_audit'],
  filings: ['filing_str_narrative', 'escalation_trigger', 'sla_check'],
  governance: ['three_lines_defence', 'four_eyes_stress', 'audit_trail_reconstruction', 'control_effectiveness'],
  logic: ['modus_ponens', 'modus_tollens', 'reductio', 'syllogistic'],
  sanctions_pf: ['list_walk', 'sanctions_regime_matrix', 'pf_dual_use_controls', 'escalation_trigger'],
  maritime: ['sanctions_maritime_stss', 'velocity_analysis'],
  trade_finance: ['tbml_overlay', 'tbml_over_invoicing', 'ucp600_discipline'],
  real_estate: ['real_estate_cash'],
  pep: ['pep_domestic_minister', 'narrative_coherence'],
  npo: ['jurisdiction_cascade', 'source_triangulation'],
  insurance: ['insurance_wrap', 'narrative_coherence'],
  gambling: [],
  luxury: ['art_dealer', 'yacht_jet'],
  fraud: ['bec_fraud', 'synthetic_id', 'ponzi_scheme', 'phoenix_company'],
  market_abuse: ['market_manipulation', 'wash_trade', 'spoofing', 'front_running'],
  ethics_rhetoric: ['toulmin', 'irac', 'craac', 'rogerian'],
  cognitive: ['system_1', 'system_2', 'dual_process', 'cognitive_bias_audit', 'confidence_calibration'],
  strategic: ['swot', 'pestle', 'scenario_planning', 'war_game'],
  forensic: ['link_analysis', 'pattern_of_life', 'evidence_graph', 'timeline_reconstruction'],
  data_quality: ['data_quality_score', 'reconciliation', 'freshness_check', 'tamper_detection'],
  compliance_framework: ['article_by_article', 'jurisdiction_cascade', 'sanctions_regime_matrix', 'retention_audit', 'kpi_dpms_thirty'],
  general: [],
};

const CAT_TO_FACULTIES: Record<string, string[]> = {
  gold_dpms: ['reasoning', 'data_analysis', 'argumentation'],
  quantitative: ['data_analysis', 'inference'],
  threat_modeling: ['argumentation', 'inference', 'strong_brain'],
  ubo_transparency: ['data_analysis', 'deep_thinking'],
  crypto: ['data_analysis', 'inference'],
  correspondent: ['reasoning', 'intelligence'],
  cdd_edd: ['reasoning', 'data_analysis'],
  filings: ['ratiocination', 'introspection'],
  governance: ['introspection', 'argumentation'],
  logic: ['reasoning', 'ratiocination'],
  sanctions_pf: ['reasoning', 'data_analysis', 'intelligence'],
  maritime: ['data_analysis'],
  trade_finance: ['data_analysis', 'argumentation'],
  real_estate: ['reasoning', 'inference'],
  pep: ['intelligence', 'inference'],
  npo: ['inference', 'data_analysis'],
  insurance: ['reasoning', 'inference'],
  gambling: ['data_analysis'],
  luxury: ['inference'],
  fraud: ['inference', 'smartness'],
  market_abuse: ['data_analysis', 'inference'],
  ethics_rhetoric: ['argumentation', 'deep_thinking'],
  cognitive: ['deep_thinking', 'introspection'],
  strategic: ['deep_thinking', 'argumentation'],
  forensic: ['data_analysis', 'inference', 'deep_thinking'],
  data_quality: ['data_analysis', 'introspection'],
  compliance_framework: ['reasoning', 'ratiocination'],
  general: ['reasoning', 'deep_thinking'],
};

export function explainMode(id: string): ModeExplanation {
  const found = (MLRO_MODE_IDS as readonly string[]).includes(id);
  const category = found ? categorise(id) : 'general';
  const prefix = MLRO_PREFIX_BY_ID.get(id)?.prefix;
  const hasAuthoredPrefix = typeof prefix === 'string' && prefix.length > 0;
  const prefixPreview = hasAuthoredPrefix ? (prefix!.length > 200 ? prefix!.slice(0, 200) + '…' : prefix!) : undefined;
  const warnings: string[] = [];
  if (!found) warnings.push('mode id not in catalogue — will fall through to the default executor prompt');
  if (!hasAuthoredPrefix && found) warnings.push('no authored prefix in deep-reasoning.js — prompt will use the catalogue default');

  return {
    id,
    found,
    category,
    categoryDescription: CATEGORY_DESC[category] ?? CATEGORY_DESC.general!,
    engagedFaculties: CAT_TO_FACULTIES[category] ?? [],
    engagedCoreModes: CAT_TO_CORE_MODES[category] ?? [],
    hasAuthoredPrefix,
    prefixPreview,
    warnings,
  };
}
