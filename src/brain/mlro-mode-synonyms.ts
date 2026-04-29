// Hawkeye Sterling — synonym expansion for the deep-reasoning mode picker.
// The 690-mode catalogue uses short snake_case ids; operators search with
// natural English ("gold", "weapons trade", "mixer"). This module maps
// English surface terms to mode-id substrings so searchModesSemantic()
// returns what an MLRO expects.

export const MODE_SYNONYMS: Record<string, readonly string[]> = {
  // Gold / DPMS
  gold: ['gold', 'bullion', 'lbma', 'dpms', 'refiner', 'dore', 'assay', 'cahra'],
  bullion: ['bullion', 'dore', 'refiner', 'lbma'],
  refinery: ['refiner', 'lbma', 'dore', 'cahra', 'assay'],
  dpms: ['dpms', 'precious_metal', 'retail'],
  cahra: ['cahra', 'drc', 'conflict'],

  // Crypto
  crypto: ['crypto', 'wallet', 'chain_analysis', 'bridge', 'mixer', 'mev', 'defi', 'nft', 'stablecoin', 'privacy_coin', 'taint'],
  blockchain: ['chain_analysis', 'bridge', 'wallet'],
  mixer: ['mixer', 'taint', 'privacy_coin'],
  wallet: ['wallet', 'chain_analysis'],
  'virtual asset': ['crypto', 'wallet', 'vasp'],
  vasp: ['vasp', 'wallet', 'mixer', 'travel_rule'],
  nft: ['nft', 'wash', 'marketplace'],

  // UBO
  ubo: ['ubo', 'bearer', 'nominee', 'ownership'],
  beneficial: ['ubo', 'bearer'],
  bearer: ['bearer'],
  nominee: ['nominee', 'ubo'],

  // Sanctions / PF
  sanction: ['sanction', 'eocn', 'un_', 'ofac', 'ofsi', 'tfs', 'fatf'],
  sanctions: ['sanction', 'eocn', 'un_', 'ofac', 'ofsi', 'tfs', 'fatf'],
  eocn: ['eocn'],
  ofac: ['ofac'],
  'un list': ['un_'],
  proliferation: ['proliferation', 'pf_', 'dual_use', 'dprk', 'iran'],
  weapons: ['weapons', 'arms', 'dual_use', 'proliferation'],
  arms: ['arms', 'weapons'],
  nuclear: ['nuclear', 'dprk', 'iran', 'proliferation'],
  dprk: ['dprk'],
  iran: ['iran'],

  // Maritime
  maritime: ['maritime', 'vessel', 'ship', 'ais', 'stss', 'flag', 'port_state', 'imo'],
  vessel: ['vessel', 'imo', 'ais'],
  ship: ['vessel', 'ship', 'ais'],

  // Trade finance
  'trade finance': ['tbml', 'lc_', 'ucp600', 'invoice', 'incoterms', 'trade_', 'bill_of_lading'],
  tbml: ['tbml', 'over_invoice', 'under_invoice', 'phantom'],
  invoice: ['invoice', 'tbml'],
  'letter of credit': ['lc_', 'ucp600'],
  lc: ['lc_', 'ucp600'],

  // Real estate
  'real estate': ['re_', 'real_estate', 'property', 'villa'],
  property: ['property', 're_'],
  'golden visa': ['goldenvisa'],

  // PEP
  pep: ['pep', 'rca'],
  politically: ['pep', 'rca'],
  rca: ['rca'],
  minister: ['pep', 'minister'],

  // NPO / charity
  npo: ['npo', 'charity'],
  charity: ['npo', 'charity'],
  nonprofit: ['npo'],

  // Insurance
  insurance: ['insurance', 'life_', 'premium', 'beneficiary'],

  // Gambling
  gambling: ['gambling', 'casino', 'junket'],
  casino: ['casino', 'junket'],

  // Fraud
  fraud: ['fraud', 'advance_fee', 'bec', 'synthetic_id', 'ponzi', 'phoenix', 'invoice_fraud', 'ato_', 'sim_swap', 'app_scam'],
  bec: ['bec', 'invoice_redirection', 'typosquat'],
  scam: ['fraud', 'advance_fee', 'scam'],
  phishing: ['bec', 'typosquat'],

  // Market abuse
  'market abuse': ['market_', 'insider', 'spoof', 'wash_trade', 'marking', 'layering', 'front_running'],
  insider: ['insider', 'insider_trading', 'insider_threat'],
  layering: ['layering'],
  spoofing: ['spoof'],
  wash: ['wash_trade', 'wash_sale', 'nft_wash'],

  // Cognitive
  bayes: ['bayes', 'bayesian', 'probabilistic'],
  bayesian: ['bayes', 'bayesian'],
  monte: ['monte_carlo'],
  'red team': ['red_team', 'adversarial'],
  steelman: ['steelman'],
  socratic: ['socratic'],
  dialectic: ['dialectic'],

  // Logic
  logic: ['modus', 'reductio', 'syllog', 'propositional', 'predicate', 'modal', 'deontic', 'temporal', 'epistemic'],
  deduction: ['modus_ponens', 'deduct'],

  // Structuring / classic AML
  structuring: ['structuring', 'smurfing', 'velocity', 'cash_courier'],
  cash: ['cash', 'ctn', 'courier', 'structuring'],
  smurfing: ['smurfing', 'structuring'],

  // Correspondent
  correspondent: ['corresp', 'nested', 'u_turn'],
  nested: ['nested', 'corresp'],

  // CDD / EDD
  cdd: ['cdd', 'onboard'],
  edd: ['edd', 'enhanced', 'sow', 'sof'],
  onboarding: ['onboard', 'cdd', 'prospect'],
  'source of wealth': ['sow'],
  'source of funds': ['sof'],

  // Filings
  str: ['str', 'sar', 'narrative_str'],
  ffr: ['ffr'],
  pnmr: ['pnmr'],
  ctr: ['ctr', 'cash_courier'],
  goaml: ['goaml', 'filing'],

  // Governance
  governance: ['governance', 'policy', 'mlro', 'board', 'escalation', 'four_eyes', 'sod', 'segregation', 'audit'],
  audit: ['audit', 'control', 'independent', 'lookback'],
  'four eyes': ['four_eyes', 'sod'],
  'separation of duties': ['sod', 'four_eyes'],

  // Threat modelling
  stride: ['stride'],
  pasta: ['pasta'],
  mitre: ['mitre_attack'],
  'attack tree': ['attack_tree'],

  // Forensic
  forensic: ['forensic', 'pattern_of_life', 'timeline', 'link_analysis'],
  timeline: ['timeline'],
  'link analysis': ['link_analysis', 'community_detection'],
  graph: ['graph', 'evidence_graph', 'link_analysis'],

  // Data quality
  'data quality': ['data_quality', 'completeness', 'freshness', 'reconciliation'],
  provenance: ['provenance', 'lineage'],
  tamper: ['tamper_detection'],
};

/** Expand a natural-language query into a list of id substrings. */
export function expandQuery(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = new Set<string>([q]);
  for (const [key, alts] of Object.entries(MODE_SYNONYMS)) {
    if (q.includes(key)) alts.forEach((a) => out.add(a));
  }
  // Also split into tokens so AND-matching works.
  for (const tok of q.split(/\s+/)) if (tok) out.add(tok);
  return [...out];
}

/** Search via synonyms: an id matches if ANY expanded term is a substring. */
export function searchModesSemantic(modeIds: readonly string[], query: string): string[] {
  const terms = expandQuery(query);
  if (terms.length === 0) return [];
  return modeIds.filter((id) => terms.some((t) => id.toLowerCase().includes(t)));
}
