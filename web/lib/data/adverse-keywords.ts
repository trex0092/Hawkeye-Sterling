// Hawkeye Sterling — adverse-media keyword classifier.
//
// The classic AML/CFT adverse-media keyword set operators use in news-ingest
// alert queries, grouped by financial-crime family so each hit carries the
// typology it signals. This is the "100% right information" layer: if any of
// these terms appear in a subject's metadata, alt names, role text or media
// snippet, they fire here with the full group context.
//
// Designed to complement the 5-class classifyAdverseMedia() from the brain
// and the 28-class ESG classifier — this one is the named-keyword floor.

export type AdverseKeywordGroup =
  | "money-laundering"
  | "bribery-corruption"
  | "terrorism-financing"
  | "proliferation-wmd"
  | "organised-crime"
  | "human-trafficking"
  | "cybercrime"
  | "fraud-forgery"
  | "tax-crime"
  | "market-abuse"
  | "law-enforcement"
  | "regulatory-action"
  | "political-exposure"
  | "ai-misuse"
  | "insider-threat"
  | "environmental-crime";

export interface AdverseKeywordRule {
  group: AdverseKeywordGroup;
  label: string;
  // All terms are matched case-insensitively as whole-substring.
  terms: string[];
}

export const ADVERSE_KEYWORDS: AdverseKeywordRule[] = [
  {
    group: "money-laundering",
    label: "Money laundering & financial crime",
    terms: [
      "money laundering", "money launder", "launder",
      "financial crime", "economic crime",
      "embezzle", "embezzlement", "misappropriation", "asset misappropriation",
      "extort", "extortion", "kickback",
      // Wave 4 typologies — placement / layering / integration vehicles.
      "shell company", "shell structure", "shell entity",
      "trade-based money laundering", "tbml",
      "round-tripping", "round tripping", "smurfing", "cuckoo smurfing",
      "real estate laundering", "real-estate laundering", "property laundering",
      "luxury goods laundering", "art laundering", "yacht laundering",
      "crypto laundering", "crypto mixer", "crypto tumbler",
      "chain hopping", "chain-hopping",
      // Spanish
      "lavado de dinero", "blanqueo de capitales", "blanqueo de dinero", "blanquear dinero",
      // French
      "blanchiment d'argent", "blanchiment de capitaux", "blanchir",
      // Russian
      "отмывание денег", "отмывание капитала",
      // Arabic
      "غسيل الأموال", "غسل الأموال", "تبييض الأموال",
      // Chinese
      "洗钱", "洗黑钱",
      // Portuguese
      "lavagem de dinheiro", "lavagem de capitais", "branqueamento de capitais",
      // Turkish
      "kara para aklama", "kara para",
    ],
  },
  {
    group: "bribery-corruption",
    label: "Bribery & corruption",
    terms: [
      "bribe", "bribery", "corrupt", "corruption",
      "abuse of power", "conflict of interest", "misuse of funds",
      "kleptocracy", "state capture",
      // Spanish
      "soborno", "corrupción", "cohecho", "malversación",
      // French
      "pot-de-vin", "détournement de fonds", "malversation",
      // Russian
      "взятка", "коррупция", "взяточничество", "хищение",
      // Arabic
      "رشوة", "فساد", "اختلاس",
      // Chinese
      "贿赂", "腐败", "行贿", "受贿", "贪腐",
      // Portuguese
      "suborno", "corrupção", "propina", "desvio de verbas",
      // Turkish
      "rüşvet", "yolsuzluk", "zimmet",
    ],
  },
  {
    group: "terrorism-financing",
    label: "Terrorism & CFT",
    terms: [
      "terrorism", "terrorist", "terrorist financing",
      "financing of terrorism", "terror funding",
      "extremist", "radicalisation", "radicalization",
      "designated terrorist", "militant",
      // Spanish
      "terrorismo", "terrorista", "financiamiento del terrorismo",
      // French
      "terrorisme", "terroriste", "financement du terrorisme",
      // Russian
      "терроризм", "террорист", "финансирование терроризма",
      // Arabic
      "إرهاب", "إرهابي", "تمويل الإرهاب",
      // Chinese
      "恐怖主义", "恐怖分子", "恐怖融资",
      // Portuguese
      "terrorismo", "terrorista", "financiamento do terrorismo",
      // Turkish
      "terör", "terörizm", "terör örgütü",
    ],
  },
  {
    group: "proliferation-wmd",
    label: "Proliferation financing & WMD",
    terms: [
      "proliferation financing",
      "weapons of mass destruction", "wmd",
      "dual-use", "dual use",
      "sanctions evasion", "sanction evasion",
      "arms trafficking", "weapons smuggling",
      "nuclear", "chemical weapons", "biological weapons",
      // Wave 4 — export-control / dual-use diversion typologies.
      "missile technology", "end-user diversion", "end user diversion",
      "export control violation", "trans-shipment", "transhipment",
    ],
  },
  {
    group: "organised-crime",
    label: "Organised crime & narcotics",
    terms: [
      "organised crime", "organized crime",
      "drug trafficking", "narcotics", "cartel", "mafia",
      // Spanish
      "crimen organizado", "narcotráfico", "cártel",
      // French
      "crime organisé", "trafic de drogue",
      // Russian
      "организованная преступность", "наркоторговля", "мафия",
      // Arabic
      "الجريمة المنظمة", "تهريب المخدرات",
      // Chinese
      "有组织犯罪", "毒品走私", "黑社会",
      // Portuguese
      "crime organizado", "narcotráfico", "máfia",
      // Turkish
      "organize suç", "uyuşturucu kaçakçılığı",
    ],
  },
  {
    group: "human-trafficking",
    label: "Human trafficking & slavery",
    terms: [
      "human trafficking", "people smuggling",
      "forced labour", "forced labor",
      "modern slavery", "child labor", "child labour",
      "wildlife trafficking",
      // Wave 4 — trafficking typologies split by exploitation mode.
      "sex trafficking", "labor trafficking", "labour trafficking",
      "debt bondage", "domestic servitude", "organ trafficking",
      // Spanish
      "trata de personas", "tráfico de personas", "trabajo forzado", "esclavitud moderna",
      // French
      "traite des êtres humains", "traite des personnes", "travail forcé", "esclavage moderne",
      // Russian
      "торговля людьми", "принудительный труд",
      // Arabic
      "الاتجار بالبشر", "العمل القسري", "الرق الحديث",
      // Chinese
      "人口贩卖", "人口走私", "强迫劳动",
      // Portuguese
      "tráfico de pessoas", "trabalho forçado", "escravidão moderna",
    ],
  },
  {
    group: "cybercrime",
    label: "Cybercrime",
    terms: [
      "cybercrime", "cyber crime", "ransomware", "darknet", "dark web",
      "cyber fraud", "wire fraud",
      // Wave 4 — high-volume cyber-enabled fraud predicates.
      "business email compromise", "sim swap", "sim-swap fraud",
    ],
  },
  {
    group: "fraud-forgery",
    label: "Fraud & forgery",
    terms: [
      "fraud", "ponzi", "pyramid scheme",
      "accounting fraud", "forgery", "counterfeiting", "identity theft",
      // Wave 4 — synthetic / fabricated identity fraud typology.
      "synthetic identity", "synthetic identity fraud",
      "fabricated identity", "ghost identity", "identity stacking",
      // Spanish
      "fraude", "estafa", "falsificación", "robo de identidad",
      // French
      "escroquerie", "falsification", "usurpation d'identité",
      // Russian
      "мошенничество", "мошенник", "подделка",
      // Arabic
      "احتيال", "تزوير", "سرقة الهوية",
      // Chinese
      "欺诈", "诈骗", "伪造", "身份盗窃",
      // Portuguese
      "estelionato", "falsificação", "roubo de identidade",
      // Turkish
      "dolandırıcılık", "sahtecilik", "dolandırıcı",
    ],
  },
  {
    group: "tax-crime",
    label: "Tax crime",
    terms: [
      "tax evasion", "tax fraud", "vat fraud",
      // Spanish
      "evasión fiscal", "fraude fiscal",
      // French
      "fraude fiscale", "évasion fiscale",
      // Russian
      "уклонение от налогов", "налоговое мошенничество",
      // Arabic
      "التهرب الضريبي", "الاحتيال الضريبي",
      // Chinese
      "逃税", "税务欺诈",
      // Portuguese
      "sonegação fiscal", "fraude fiscal",
    ],
  },
  {
    group: "market-abuse",
    label: "Market abuse",
    terms: [
      "insider trading", "market manipulation",
    ],
  },
  {
    group: "law-enforcement",
    label: "Law-enforcement & judicial",
    terms: [
      "arrest", "arrested", "blackmail", "convict", "convicted",
      "court case", "felon", "felony", "fined", "guilty",
      "illegal", "imprisonment", "jail", "jailed",
      "litigate", "litigation",
      "murder", "prosecute", "prosecuted", "prosecution",
      "theft", "unlawful", "verdict",
      // Spanish
      "arrestado", "detenido", "condenado", "encarcelado", "procesado", "juicio", "sentencia", "culpable",
      // French
      "arrêté", "condamné", "emprisonné", "poursuivi", "jugement", "verdict", "coupable",
      // Russian
      "арестован", "осуждён", "осужден", "заключён под стражу", "судебное преследование", "приговор",
      // Arabic
      "اعتقال", "إدانة", "سجن", "محاكمة", "حكم", "مذنب",
      // Chinese
      "逮捕", "定罪", "监禁", "起诉", "审判", "判决",
      // Portuguese
      "preso", "condenado", "encarcerado", "processado", "julgamento", "sentença", "culpado",
      // Turkish
      "tutuklama", "tutuklandı", "gözaltı", "mahkumiyet", "suçlandı", "hapis", "dava",
    ],
  },
  {
    group: "regulatory-action",
    label: "Regulatory action & sanctions",
    terms: [
      "sanctions", "sanctioned",
      "debarred", "debarment", "blacklisted", "blacklist",
      "regulatory breach", "breach",
      // Spanish
      "sanción", "sancionado", "lista negra", "inhabilitado",
      // French
      "sanction", "sanctionné", "liste noire", "interdit",
      // Russian
      "санкции", "санкционирован", "чёрный список",
      // Arabic
      "عقوبات", "قائمة سوداء", "محظور",
      // Chinese
      "制裁", "黑名单", "被制裁",
      // Portuguese
      "sanção", "sancionado", "lista negra",
      // Turkish
      "yaptırım", "kara liste",
    ],
  },
  {
    group: "political-exposure",
    label: "Political exposure",
    terms: [
      "politic", "political", "politician",
    ],
  },
  // Wave 4 — insider-threat typology (malicious-insider IP exfiltration,
  // privileged-access abuse). Distinct from cybercrime because many insider
  // cases are physical / policy-layer, not network intrusion.
  {
    group: "insider-threat",
    label: "Insider threat & IP exfiltration",
    terms: [
      "insider threat", "malicious insider", "rogue employee",
      "privileged access abuse", "privileged-access abuse",
      "data exfiltration", "intellectual property theft", "ip theft",
      "trade secret theft", "trade-secret theft",
      "corporate espionage", "industrial espionage",
      "whistleblower retaliation",
    ],
  },
  // Wave 4 — FATF-listed environmental-crime predicate offence (2021+):
  // illegal mining / logging / fishing / waste trafficking as ML predicates.
  {
    group: "environmental-crime",
    label: "Environmental crime",
    terms: [
      "environmental crime", "eco-crime", "eco crime",
      "illegal mining", "illegal logging", "illegal fishing",
      "iuu fishing", "illegal waste dumping", "illegal dumping",
      "waste trafficking", "pollution crime",
    ],
  },
  // AI-misuse / algorithmic-harm floor, informed by Hartono et al., "The Dual
  // Persona of AI", ICIMCIS 2025. Fires on the concrete harms the paper's
  // Dilemma Persona anticipates: biased automated decisions, opaque models,
  // synthetic-media abuse, and AI-enabled fraud.
  {
    group: "ai-misuse",
    label: "AI misuse & algorithmic harm",
    terms: [
      "algorithmic bias", "algorithmic discrimination",
      "ai bias", "biased algorithm", "automated discrimination",
      "deepfake", "deep fake", "synthetic media abuse",
      "ai-generated disinformation", "generative ai abuse",
      "ai-enabled fraud", "ai impersonation", "voice cloning fraud",
      "facial recognition misuse", "ai surveillance abuse",
      "predictive policing bias", "black-box decision",
      // OWASP LLM Top 10 style attack surface — fires on news of live
      // AI-system compromise or misuse of unmanaged / agentic AI.
      "prompt injection", "jailbreak", "jailbroken model",
      "model inversion", "membership inference",
      "data poisoning", "training data poisoning",
      "adversarial attack",
      "model theft", "training data leak",
      "shadow ai", "unauthorized ai",
    ],
  },
];

export interface AdverseKeywordHit {
  group: AdverseKeywordGroup;
  groupLabel: string;
  term: string;
  offset: number;
}

export function classifyAdverseKeywords(
  text: string | null | undefined,
): AdverseKeywordHit[] {
  if (!text) return [];
  const hay = text.toLowerCase();
  const out: AdverseKeywordHit[] = [];
  const seen = new Set<string>();
  for (const rule of ADVERSE_KEYWORDS) {
    for (const term of rule.terms) {
      const idx = hay.indexOf(term);
      if (idx === -1) continue;
      const key = `${rule.group}:${term}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        group: rule.group,
        groupLabel: rule.label,
        term,
        offset: idx,
      });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

// Groups that fire in this set of hits, with their hit counts.
export function adverseKeywordGroupCounts(
  hits: readonly AdverseKeywordHit[],
): Array<{ group: AdverseKeywordGroup; label: string; count: number }> {
  const map = new Map<AdverseKeywordGroup, { label: string; count: number }>();
  for (const h of hits) {
    const prev = map.get(h.group);
    if (prev) prev.count += 1;
    else map.set(h.group, { label: h.groupLabel, count: 1 });
  }
  return Array.from(map.entries()).map(([group, v]) => ({
    group,
    label: v.label,
    count: v.count,
  }));
}
