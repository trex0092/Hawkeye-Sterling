// Hawkeye Sterling — adverse-media taxonomy and compiled search query.
// Five risk categories with the user's exact keyword lists, plus the canonical
// boolean OR query for news / RSS / search-API ingestion.

import type { AdverseMediaCategory } from './types.js';

// Multilingual keyword packs keyed by ISO-639-1.
// Extend the English base with Arabic (ar), French (fr), Spanish (es),
// Russian (ru), Mandarin (zh), Persian (fa) — covers ≈ 4.3 billion speakers
// and the major regulator-publication and adverse-media corpora.
const ML_PACK: Record<string, string[]> = {
  ar: [
    'غسل الأموال', 'تمويل الإرهاب', 'رشوة', 'فساد', 'احتيال', 'اختلاس',
    'تهريب', 'إرهاب', 'عقوبات', 'تبييض الأموال', 'سمسرة', 'تزوير',
    'مخدرات', 'اتجار بالبشر', 'غسيل أموال', 'تمويل إرهاب',
  ],
  fa: [
    'پولشویی', 'تأمین مالی تروریسم', 'رشوه', 'فساد', 'قاچاق', 'تحریم',
    'کلاهبرداری', 'اختلاس',
  ],
  fr: [
    'blanchiment', 'blanchiment d\'argent', 'financement du terrorisme',
    'corruption', 'fraude', 'évasion fiscale', 'détournement',
    'escroquerie', 'sanctions', 'trafic de drogue', 'traite des êtres humains',
    'condamné', 'arrêté', 'soupçonné', 'inculpé', 'mafia', 'pot-de-vin',
  ],
  es: [
    'lavado de dinero', 'blanqueo de capitales', 'financiación del terrorismo',
    'corrupción', 'soborno', 'fraude', 'evasión fiscal', 'narcotráfico',
    'tráfico de personas', 'sanciones', 'condenado', 'detenido', 'procesado',
    'extorsión', 'mafia',
  ],
  ru: [
    'отмывание денег', 'финансирование терроризма', 'коррупция', 'взятка',
    'мошенничество', 'санкции', 'незаконный', 'уголовное дело',
    'наркоторговля', 'отмывание', 'уклонение от налогов', 'арестован',
    'осужден',
  ],
  zh: [
    '洗钱', '恐怖融资', '腐败', '贿赂', '欺诈', '制裁', '毒品走私',
    '人口贩卖', '逃税', '被捕', '起诉', '定罪',
  ],
};

export const ADVERSE_MEDIA_CATEGORIES: AdverseMediaCategory[] = [
  {
    id: 'ml_financial_crime',
    displayName: 'Money Laundering & Financial Crime',
    keywords: [
      'launder', 'money laundering', 'financial crime', 'economic crime',
      'fraud', 'embezzle', 'extort', 'kickback', 'forgery', 'counterfeiting',
      'identity theft', 'Ponzi', 'pyramid scheme', 'insider trading',
      'market manipulation', 'accounting fraud', 'asset misappropriation',
      'tax evasion', 'tax fraud', 'VAT fraud', 'cyber fraud', 'wire fraud',
      'structuring', 'smurfing', 'trade-based laundering', 'shell company',
      'front company', 'invoice fraud', 'carousel fraud', 'missing trader',
      'BEC', 'business email compromise', 'APP fraud', 'synthetic identity',
      'mule account', 'money mule', 'skimming', 'lapping', 'spoofing',
      'wash trade', 'layering', 'placement', 'integration', 'phoenix company',
    ],
  },
  {
    id: 'terrorist_financing',
    displayName: 'Terrorist Financing',
    keywords: [
      'terrorism', 'terrorist financing', 'financing of terrorism',
      'terror funding', 'extremist', 'radicalisation', 'designated terrorist',
      'militant', 'FTO', 'foreign terrorist organisation', 'ISIS', 'ISIL',
      'Al-Qaeda', 'Daesh', 'Hezbollah', 'Hamas', 'Al-Shabaab', 'Boko Haram',
      'lone-wolf', 'foreign fighter', 'jihadist', 'Taliban', 'IRGC',
      'terror cell', 'recruitment', 'indoctrination',
    ],
  },
  {
    id: 'proliferation_financing',
    displayName: 'Proliferation Financing',
    keywords: [
      'proliferation financing', 'weapons of mass destruction', 'WMD',
      'dual-use', 'sanctions evasion', 'arms trafficking', 'weapons smuggling',
      'nuclear', 'chemical weapons', 'biological weapons',
      'missile', 'ballistic', 'centrifuge', 'uranium', 'enrichment',
      'plutonium', 'fissile material', 'precursor chemicals', 'VX',
      'sarin', 'chip export', 'semiconductor diversion', 'end-use diversion',
      'transshipment hub', 'nuclear proliferation', 'DPRK sanctions',
      'Iran sanctions', 'North Korea sanctions',
    ],
  },
  {
    id: 'corruption_organised_crime',
    displayName: 'Corruption, Bribery & Organised Crime',
    keywords: [
      'corrupt', 'bribe', 'corruption', 'abuse of power', 'conflict of interest',
      'misuse of funds', 'kleptocracy', 'state capture', 'mafia',
      'organised crime', 'drug trafficking', 'narcotics', 'cartel',
      'human trafficking', 'people smuggling', 'forced labour', 'modern slavery',
      'wildlife trafficking', 'cybercrime', 'ransomware', 'darknet',
      'facilitation payment', 'grease payment', 'cronyism', 'nepotism',
      'racketeering', 'RICO', 'extortion racket', 'protection money',
      'triad', 'yakuza', 'bratva', 'crime family', 'sex trafficking',
      'child exploitation', 'CSAM', 'illegal gambling', 'illegal mining',
      'blood diamond', 'conflict mineral', 'ivory trade', 'poaching',
      'dark web marketplace', 'crypto mixer',
    ],
  },
  {
    id: 'legal_criminal_regulatory',
    displayName: 'Legal, Criminal & Regulatory Proceedings',
    keywords: [
      'arrest', 'blackmail', 'breach', 'convict', 'court case', 'felon',
      'fined', 'guilty', 'illegal', 'imprisonment', 'jail', 'litigate',
      'murder', 'politic', 'prosecute', 'sanctions', 'theft', 'unlawful',
      'verdict', 'debarred', 'blacklisted', 'regulatory breach',
      'indictment', 'grand jury', 'plea deal', 'settlement', 'deferred prosecution',
      'non-prosecution agreement', 'consent order', 'cease and desist',
      'disqualified', 'struck off', 'license revoked', 'permit revoked',
      'FATF grey list', 'FATF black list', 'OFAC designation',
      'SDN listed', 'asset freeze', 'travel ban', 'enforcement action',
      'civil penalty', 'administrative penalty', 'class action',
      'whistleblower', 'qui tam',
    ],
  },
  {
    id: 'esg',
    displayName: 'ESG & Responsible-Sourcing Controversies',
    keywords: [
      // Environment — pollution, waste, chemicals
      'environmental violation', 'pollution', 'toxic waste', 'hazardous waste',
      'illegal waste export', 'Basel Convention breach', 'oil spill',
      'illegal dumping', 'marine pollution', 'chemical spill',
      'groundwater contamination', 'air quality violation', 'ozone depletion',
      'CFC smuggling', 'HFC smuggling', 'Montreal Protocol breach',
      'asbestos exposure', 'e-waste dumping',
      // Environment — nature and biodiversity
      'deforestation', 'illegal logging', 'illegal mining', 'artisanal mining abuse',
      'blood diamond', 'conflict mineral', 'cobalt mining abuse',
      'ivory trade', 'wildlife trafficking', 'poaching', 'biodiversity loss',
      'coral reef damage', 'protected area encroachment',
      // Environment — climate
      'greenwashing', 'carbon fraud', 'carbon credit fraud', 'carbon offset fraud',
      'emissions fraud', 'emissions reporting fraud', 'Scope 3 misreporting',
      'Paris Agreement breach', 'NDC non-compliance', 'methane leak',
      'shale-gas flaring', 'fracking violation', 'Arctic drilling controversy',
      'oil-sands pollution',
      // Carbon-market / VCM integrity (Wave 4) — phantom-credit, double-
      // counting, offset-washing typologies that underpin sustainability fraud.
      'phantom credit', 'ghost credit', 'fake offset', 'carbon washing',
      'carbon double counting', 'double-counted credits',
      'voluntary carbon market fraud', 'VCM fraud',
      // Social — labour and human rights
      'modern slavery', 'child labour', 'forced labour', 'bonded labour',
      'sweatshop', 'wage theft', 'unpaid overtime', 'union busting',
      'strike breaking', 'workplace discrimination', 'gender discrimination',
      'racial discrimination', 'sexual harassment', 'indigenous rights violation',
      'land grab', 'community displacement', 'supply chain abuse',
      'human rights abuse', 'Uyghur forced labour',
      // Social — workplace safety
      'unsafe working conditions', 'fatal workplace accident', 'mine collapse',
      'factory fire', 'Rana Plaza', 'shipbreaking abuse', 'beaching abuse',
      'tailings dam collapse', 'industrial accident',
      // Governance — corporate
      'board governance failure', 'audit failure', 'executive misconduct',
      'whistleblower retaliation', 'related-party transaction', 'self-dealing',
      'materiality misstatement', 'accounting restatement',
      // ESG disclosure / finance
      'ESG misrepresentation', 'sustainability fraud', 'sustainability report fraud',
      'ESG rating manipulation', 'green-bond fraud', 'green-loan fraud',
      'sustainability-linked loan fraud', 'SFDR breach', 'EU Taxonomy misrepresentation',
      'CSRD breach', 'CSDDD breach', 'TCFD non-compliance', 'ISSB non-compliance',
      'SEC climate disclosure breach',
      'double materiality', 'integrated reporting misstatement',
      'Climate VaR misrepresentation', 'transition finance misrepresentation',
      // Sector-specific (DPMS / FMCG / apparel / palm oil)
      'palm-oil controversy', 'cocoa child labour', 'coffee forced labour',
      'garment factory abuse', 'LBMA non-conformance',
      'responsible-sourcing breach', 'OECD due-diligence breach',
      'RJC non-conformance', 'Kimberley Process breach',
      // Precious metals & mining — frameworks & standards
      'LBMA Responsible Gold Guidance breach', 'LBMA Good Delivery delisting',
      'LBMA RGG non-conformance', 'LBMA Responsible Silver Guidance breach',
      'LBMA Responsible Platinum and Palladium Guidance breach',
      'OECD Annex II risk', 'OECD Due Diligence Guidance breach',
      'RJC Code of Practices breach', 'RJC Chain of Custody breach',
      'Fairmined non-conformance', 'Fairtrade Gold non-conformance',
      'Dodd-Frank Section 1502 breach', 'EU Conflict Minerals Regulation breach',
      '3TG sourcing violation', 'conflict-affected high-risk area sourcing',
      'CAHRA sourcing',
      // Precious metals & mining — regional / sanctions hotspots
      'Russian gold ban', 'OFAC gold sector sanctions', 'Myanmar jade',
      'Myanmar ruby', 'Venezuelan gold', 'Orinoco mining arc',
      'garimpeiros', 'Brazilian illegal gold', 'Amazon illegal mining',
      'DRC gold smuggling', 'Sahel gold smuggling', 'Marange diamonds',
      'Sudanese gold', 'West Africa artisanal gold',
      'Zimbabwe gold smuggling', 'Colombian illegal gold',
      'dore bar diversion', 'free-zone gold diversion',
      'Dubai gold souk diversion', 'trade mis-invoicing of gold',
      // Precious metals & mining — environmental impacts
      'artisanal and small-scale mining abuse', 'ASGM mercury use',
      'Minamata Convention breach', 'mercury poisoning',
      'cyanide heap leaching abuse', 'acid mine drainage',
      'heavy metal contamination', 'arsenic contamination',
      'SO2 refinery emissions', 'dust explosion', 'refinery contamination',
      'riverbed mining', 'illegal dredging',
      'mining-driven deforestation',
      // Precious metals & mining — social / community
      'FPIC violation', 'ILO 169 breach',
      'UN Guiding Principles breach', 'UNGP non-compliance',
      'Voluntary Principles on Security and Human Rights breach',
      'VPSHR non-compliance', 'mine-site security abuse',
      'paramilitary protection at mine', 'community relocation dispute',
      'indigenous community displacement', 'child miner',
      'underage miner', 'mine-site sexual violence',
      'informal gold payment',
      // Precious metals & mining — notable tailings & disasters
      'Brumadinho dam', 'Mariana dam', 'Mount Polley', 'Samarco',
      'Baia Mare cyanide spill',
    ],
  },
  {
    id: 'cybercrime',
    displayName: 'Cybercrime & Digital-Asset Abuse',
    keywords: [
      'ransomware', 'malware', 'trojan', 'phishing', 'spear phishing',
      'smishing', 'vishing', 'data breach', 'data exfiltration',
      'credential stuffing', 'SIM swap', 'SIM-swap', 'account takeover',
      'zero-day', 'exploit kit', 'APT', 'advanced persistent threat',
      'supply chain attack', 'SolarWinds', 'Log4j', 'botnet', 'DDoS',
      'cryptojacking', 'crypto theft', 'exchange hack', 'wallet drainer',
      'privacy coin', 'tornado cash', 'coin mixer', 'dusting attack',
      'rug pull', 'NFT wash trade', 'DeFi exploit', 'flash-loan attack',
      'smart contract exploit', 'oracle manipulation', 'dark web marketplace',
      'initial access broker', 'BEC', 'business email compromise',
      'deepfake fraud', 'voice cloning scam', 'romance scam', 'pig butchering',
      'insider threat', 'CSAM', 'child sexual abuse material',
      'darknet marketplace',
    ],
  },
  {
    id: 'ai',
    displayName: 'AI-Enabled Risk & Synthetic-Media Abuse',
    keywords: [
      // Synthetic media
      'deepfake', 'synthetic media', 'voice cloning', 'AI voice clone',
      'face-swap', 'face-swap scam', 'lip-sync deepfake', 'AI-generated content',
      'AI-generated video', 'AI-generated audio', 'AI-generated image',
      'AI-generated document', 'AI-forged ID', 'deepfake passport',
      'deepfake driver\'s licence', 'synthetic video identity',
      // Identity & impersonation
      'AI impersonation', 'CEO deepfake', 'deepfake CEO fraud',
      'AI Zoom impersonation', 'AI video call scam', 'AI-generated KYC fraud',
      'AI biometric spoof', 'liveness spoof', 'anti-spoofing bypass',
      // Fraud / scams
      'AI fraud', 'AI scam', 'AI investment scam', 'AI trading bot scam',
      'AI pump-and-dump', 'AI-powered romance scam', 'AI pig butchering',
      'AI-enabled phishing', 'AI smishing', 'AI vishing',
      // Generative model misuse
      'generative AI abuse', 'GenAI abuse', 'LLM jailbreak', 'prompt injection',
      'indirect prompt injection', 'system-prompt leak', 'chatbot impersonation',
      'unauthorized AI tool', 'shadow AI', 'fine-tuning abuse', 'LoRA abuse',
      // Model security
      'model poisoning', 'training-data poisoning', 'data-poisoning campaign',
      'backdoor attack', 'neural backdoor', 'trojaned model', 'adversarial attack',
      'adversarial example', 'model theft', 'model extraction', 'model exfiltration',
      'model inversion', 'membership inference', 'gradient leak', 'embedding leak',
      'RAG poisoning', 'vector-store poisoning',
      // Misinformation / influence operations
      'AI misinformation', 'AI disinformation', 'election deepfake',
      'AI propaganda', 'AI influence operation', 'automated disinformation campaign',
      'synthetic news', 'fake news generator', 'AI astroturfing',
      // Abuse / safety
      'AI-generated CSAM', 'AI child sexual abuse material',
      'AI non-consensual intimate imagery', 'AI revenge porn',
      'AI deepfake harassment', 'AI doxxing', 'AI hate speech generation',
      // Fin-crime & laundering
      'synthetic identity', 'AI-assisted laundering', 'AI mule recruitment',
      'autonomous fraud', 'agentic AI misuse', 'LLM agent abuse',
      'bot farm', 'AI-driven account creation', 'AI credential stuffing',
      'AI password cracking',
      // Governance / bias / regulation
      'algorithmic bias', 'AI discrimination', 'algorithmic discrimination lawsuit',
      'AI safety violation', 'AI audit failure',
      'AI governance breach', 'EU AI Act breach', 'NIST AI RMF non-compliance',
      'ISO 42001 non-compliance', 'ISO/IEC 42001 non-compliance',
      'biometric-data abuse', 'AI copyright infringement',
      'AI-enabled social engineering',
      // Paper-sourced ethical gaps (Hartono et al., ICIMCIS 2025) + 2026
      // regulatory stack (EU AI Act tiers, NIST AI RMF, ISO 42001).
      'explainability gap', 'nonhuman ethical gap',
      'black-box AI', 'black box AI',
      'algorithmic accountability', 'algorithmic transparency',
      'conformity assessment', 'high-risk AI', 'prohibited AI',
      'prohibited AI system', 'AI liability',
      // AI-governance control artefacts from the 2026 playbook.
      'AI registry', 'model inventory', 'model card',
      'red team', 'red-team', 'red teaming', 'red-teaming',
      'SBOM', 'software bill of materials',
      'fairness monitoring', 'AI transparency report',
      // Operational failure modes (drift).
      'model drift', 'concept drift', 'data drift',
    ],
  },
];

// Inject multilingual keywords into every category. We route most multilingual
// terms into the two most regulator-relevant buckets (ml_financial_crime and
// corruption_organised_crime) — broadening ML/TF/corruption/sanctions coverage
// without false-positive explosion in narrower buckets.
for (const cat of ADVERSE_MEDIA_CATEGORIES) {
  if (cat.id === 'ml_financial_crime' || cat.id === 'corruption_organised_crime' || cat.id === 'legal_criminal_regulatory') {
    for (const lang of Object.keys(ML_PACK)) {
      const pack = ML_PACK[lang];
      if (!pack) continue;
      for (const k of pack) if (!cat.keywords.includes(k)) cat.keywords.push(k);
    }
  }
}

export const ADVERSE_MEDIA_CATEGORY_BY_ID: Map<string, AdverseMediaCategory> =
  new Map(ADVERSE_MEDIA_CATEGORIES.map((c) => [c.id, c]));

// Canonical, pre-compiled boolean OR query for news/search ingestion.
// Preserves user's exact surface spelling and quoting for multi-word terms.
export const ADVERSE_MEDIA_QUERY =
  'launder OR fraud OR bribe OR corrupt OR arrest OR blackmail OR breach OR ' +
  'convict OR "court case" OR embezzle OR extort OR felon OR fined OR guilty OR ' +
  'illegal OR imprisonment OR jail OR kickback OR litigate OR mafia OR murder OR ' +
  'prosecute OR terrorism OR theft OR unlawful OR verdict OR politic OR sanctions OR ' +
  '"money laundering" OR "financial crime" OR "economic crime" OR "terrorist financing" OR ' +
  '"financing of terrorism" OR "terror funding" OR extremist OR radicalisation OR ' +
  '"designated terrorist" OR militant OR "proliferation financing" OR ' +
  '"weapons of mass destruction" OR WMD OR "dual-use" OR "sanctions evasion" OR ' +
  '"arms trafficking" OR "weapons smuggling" OR nuclear OR "chemical weapons" OR ' +
  '"biological weapons" OR "tax evasion" OR "tax fraud" OR "VAT fraud" OR Ponzi OR ' +
  '"pyramid scheme" OR "insider trading" OR "market manipulation" OR "accounting fraud" OR ' +
  '"asset misappropriation" OR forgery OR counterfeiting OR "identity theft" OR ' +
  '"cyber fraud" OR "wire fraud" OR corruption OR "abuse of power" OR ' +
  '"conflict of interest" OR "misuse of funds" OR kleptocracy OR "state capture" OR ' +
  '"organised crime" OR "drug trafficking" OR narcotics OR cartel OR ' +
  '"human trafficking" OR "people smuggling" OR "forced labour" OR "modern slavery" OR ' +
  '"wildlife trafficking" OR cybercrime OR ransomware OR darknet OR debarred OR ' +
  'blacklisted OR "regulatory breach"';

// Fast in-memory classifier — given raw news text, return matching category IDs
// and the specific keyword that fired. Phase 1 convenience; Phase 6 will add
// stemming, language variants, and proximity scoring.
export interface AdverseMediaHit {
  categoryId: string;
  keyword: string;
  offset: number;
}

export function classifyAdverseMedia(text: string): AdverseMediaHit[] {
  const haystack = text.toLowerCase();
  const hits: AdverseMediaHit[] = [];
  for (const cat of ADVERSE_MEDIA_CATEGORIES) {
    for (const kw of cat.keywords) {
      const needle = kw.toLowerCase();
      const idx = haystack.indexOf(needle);
      if (idx >= 0) hits.push({ categoryId: cat.id, keyword: kw, offset: idx });
    }
  }
  return hits;
}
