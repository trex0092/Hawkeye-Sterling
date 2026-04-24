// Hawkeye Sterling — ESG classifier.
//
// 28 ESG-relevant adverse-media categories grouped into 5 domains, each tagged
// with the globally recognised frameworks they map to (SASB Materiality Matrix,
// EU Taxonomy, UN Sustainable Development Goals).
//
// Classifier is keyword-based — runs in the screening serverless function on
// every super-brain call alongside the existing adverse-media classifier.

export type EsgDomain =
  | "environment-sustainability"
  | "human-capital-workplace"
  | "industry-trends-insights"
  | "legal-regulatory-affairs"
  | "operational-risk-crisis";

export interface EsgCategory {
  id: string;
  domain: EsgDomain;
  label: string;
  keywords: string[];
  sasb?: string;
  euTaxonomy?: string;
  sdg?: string[];
}

export const ESG_DOMAINS: Record<EsgDomain, { label: string; icon: string }> = {
  "environment-sustainability": { label: "Environment & Sustainability", icon: "🌍" },
  "human-capital-workplace": { label: "Human Capital & Workplace", icon: "👤" },
  "industry-trends-insights": { label: "Industry Trends & Insights", icon: "📊" },
  "legal-regulatory-affairs": { label: "Legal & Regulatory Affairs", icon: "⚖️" },
  "operational-risk-crisis": { label: "Operational Risk & Crisis", icon: "🛡" },
};

export const ESG_CATEGORIES: EsgCategory[] = [
  // ── Environment & Sustainability ─────────────────────────────
  {
    id: "emissions-climate",
    domain: "environment-sustainability",
    label: "Climate change & emissions",
    keywords: [
      "emissions", "ghg", "greenhouse gas", "carbon", "co2", "co₂", "net zero",
      "climate change", "climate litigation",
      "scope 1", "scope 2", "scope 3",
      "carbon disclosure", "stranded assets",
    ],
    sasb: "Environment · GHG Emissions",
    euTaxonomy: "Climate change mitigation",
    sdg: ["13"],
  },
  {
    id: "biodiversity-deforestation",
    domain: "environment-sustainability",
    label: "Biodiversity & deforestation",
    keywords: ["biodiversity", "deforestation", "habitat loss", "species extinction", "illegal logging", "wildlife"],
    sasb: "Environment · Ecological Impacts",
    euTaxonomy: "Protection of healthy ecosystems",
    sdg: ["14", "15"],
  },
  {
    id: "waste-pollution",
    domain: "environment-sustainability",
    label: "Waste management & pollution",
    keywords: ["toxic spill", "pollution", "contamination", "hazardous waste", "oil spill", "chemical leak", "plastic waste"],
    sasb: "Environment · Waste & Hazardous Materials",
    euTaxonomy: "Pollution prevention",
    sdg: ["12"],
  },
  {
    id: "water-stress",
    domain: "environment-sustainability",
    label: "Water stress & scarcity",
    keywords: ["water scarcity", "water stress", "drought", "water pollution", "groundwater", "drinking water"],
    sasb: "Environment · Water & Wastewater",
    euTaxonomy: "Sustainable use of water",
    sdg: ["6"],
  },
  {
    id: "resource-circular",
    domain: "environment-sustainability",
    label: "Resource use & circular economy",
    keywords: ["resource depletion", "circular economy", "recycling", "extractive", "mining impact", "raw materials"],
    sasb: "Environment · Materials Sourcing",
    euTaxonomy: "Circular economy",
    sdg: ["12"],
  },

  // ── Human Capital & Workplace ────────────────────────────────
  {
    id: "workplace-safety",
    domain: "human-capital-workplace",
    label: "Workplace safety & health",
    keywords: ["workplace accident", "fatal injury", "osha violation", "worker death", "safety violation", "injury rate"],
    sasb: "Social Capital · Employee Health & Safety",
    sdg: ["3", "8"],
  },
  {
    id: "labor-disputes",
    domain: "human-capital-workplace",
    label: "Labor disputes & strikes",
    keywords: ["strike", "labor dispute", "walkout", "union busting", "collective bargaining", "picket"],
    sasb: "Human Capital · Labor Practices",
    sdg: ["8"],
  },
  {
    id: "discrimination-harassment",
    domain: "human-capital-workplace",
    label: "Discrimination & harassment",
    keywords: ["discrimination", "harassment", "sexual misconduct", "racial bias", "#metoo", "hostile workplace"],
    sasb: "Human Capital · Employee Engagement, Diversity & Inclusion",
    sdg: ["5", "10"],
  },
  {
    id: "modern-slavery",
    domain: "human-capital-workplace",
    label: "Modern slavery & forced labor",
    keywords: ["forced labor", "modern slavery", "child labor", "human trafficking", "bonded labor", "uighur"],
    sasb: "Human Capital · Labor Practices",
    sdg: ["8", "16"],
  },
  {
    id: "fair-wages",
    domain: "human-capital-workplace",
    label: "Fair wages & gender pay gap",
    keywords: ["wage theft", "unpaid overtime", "gender pay gap", "minimum wage violation", "pay equity"],
    sasb: "Human Capital · Employee Engagement",
    sdg: ["5", "10"],
  },

  // ── Industry Trends & Insights ───────────────────────────────
  {
    id: "clean-energy-transition",
    domain: "industry-trends-insights",
    label: "Clean energy transition",
    keywords: ["renewable energy", "solar", "wind energy", "hydrogen", "energy transition", "coal phase-out"],
    sasb: "Business Model & Innovation · Business Model Resilience",
    euTaxonomy: "Climate change mitigation",
    sdg: ["7", "13"],
  },
  {
    id: "electrification-ev",
    domain: "industry-trends-insights",
    label: "Electrification & EV",
    keywords: ["electric vehicle", "battery tech", "ev transition", "gigafactory", "charging network", "lithium supply"],
    sasb: "Business Model & Innovation",
    sdg: ["7", "9", "13"],
  },
  {
    id: "sustainable-supply-chain",
    domain: "industry-trends-insights",
    label: "Sustainable supply chain",
    keywords: ["supply chain audit", "ethical sourcing", "conflict minerals", "tier 2 supplier", "supplier code of conduct"],
    sasb: "Business Model & Innovation · Supply Chain Management",
    sdg: ["12"],
  },
  {
    id: "esg-disclosure",
    domain: "industry-trends-insights",
    label: "ESG reporting & disclosure",
    keywords: [
      "esg disclosure", "sustainability report", "integrated reporting",
      "cdp", "tcfd", "issb", "csrd", "gri", "sasb",
      "double materiality", "esg rating", "greenwashing",
    ],
    sasb: "Leadership & Governance · Business Ethics",
    sdg: ["12", "16"],
  },
  {
    id: "green-innovation",
    domain: "industry-trends-insights",
    label: "Green tech & innovation",
    keywords: [
      "clean tech", "green bond", "social bond", "carbon capture",
      "sustainable finance", "sustainability-linked loan", "transition finance",
      "carbon credit", "climate var",
      "impact investing", "green chemistry",
    ],
    euTaxonomy: "Transition activities",
    sdg: ["9", "13"],
  },

  // ── Legal & Regulatory Affairs ───────────────────────────────
  {
    id: "corruption-bribery",
    domain: "legal-regulatory-affairs",
    label: "Corruption & bribery",
    keywords: ["bribery", "corruption", "fcpa", "kickback", "foreign corrupt", "graft", "petrobras", "1mdb"],
    sasb: "Leadership & Governance · Business Ethics",
    sdg: ["16"],
  },
  {
    id: "antitrust-competition",
    domain: "legal-regulatory-affairs",
    label: "Anti-trust & competition",
    keywords: ["antitrust", "monopoly abuse", "price fixing", "cartel", "competition authority", "market manipulation"],
    sasb: "Leadership & Governance · Competitive Behavior",
    sdg: ["16"],
  },
  {
    id: "tax-violations",
    domain: "legal-regulatory-affairs",
    label: "Tax violations & evasion",
    keywords: ["tax evasion", "tax fraud", "transfer pricing", "panama papers", "pandora papers", "offshore leak"],
    sasb: "Leadership & Governance · Management of the Legal Environment",
    sdg: ["16", "17"],
  },
  {
    id: "data-privacy",
    domain: "legal-regulatory-affairs",
    label: "Data privacy breaches",
    keywords: ["data breach", "gdpr fine", "privacy violation", "leaked data", "ccpa", "personal data exposed"],
    sasb: "Social Capital · Customer Privacy",
    sdg: ["16"],
  },
  {
    id: "regulatory-enforcement",
    domain: "legal-regulatory-affairs",
    label: "Regulatory enforcement & fines",
    keywords: ["sec fine", "consent decree", "regulatory fine", "enforcement action", "debarment", "settlement with doj"],
    sasb: "Leadership & Governance · Management of the Legal Environment",
    sdg: ["16"],
  },
  // Wave 4 — carbon-market fraud pillar. Sits in legal-regulatory because
  // it's a financial-crime typology (false offsets, phantom credits, double
  // counting) distinct from the emissions / green-innovation categories.
  {
    id: "carbon-market-fraud",
    domain: "legal-regulatory-affairs",
    label: "Carbon market & offset fraud",
    keywords: [
      "carbon fraud", "carbon credit fraud",
      "offset fraud", "carbon offset fraud",
      "phantom credit", "ghost credit", "fake offset",
      "carbon washing",
      "carbon double counting", "double-counted credits",
      "voluntary carbon market fraud", "vcm fraud",
    ],
    sasb: "Leadership & Governance · Business Ethics",
    euTaxonomy: "Climate change mitigation",
    sdg: ["13", "16"],
  },
  // AI governance pillar sourced from Hartono et al., "The Dual Persona of AI",
  // ICIMCIS 2025 (DOI 10.1109/ICIMCIS68501.2025.11327424): captures the shift
  // from AI-as-tool to AI-as-subject and the three ethical gaps the paper
  // names — Explainability Gap, Algorithmic Bias, and Nonhuman Ethical Gap.
  {
    id: "ai-governance-ethics",
    domain: "legal-regulatory-affairs",
    label: "AI governance & algorithmic ethics",
    keywords: [
      "algorithmic bias", "algorithm bias", "ai bias", "biased algorithm",
      "algorithmic discrimination", "automated discrimination",
      "algorithmic accountability", "algorithmic transparency",
      "explainability gap", "explainable ai", "black-box ai", "black box ai",
      "ai governance", "ai ethics", "responsible ai", "ai oversight",
      "ai regulation", "ai act", "eu ai act", "ai liability",
      "automated decision-making", "automated decision making",
      "model risk", "model governance", "ai risk management",
      "ai audit", "nonhuman ethical gap",
      // 2026 regulatory stack — EU AI Act enforcement Aug 2026, NIST AI RMF,
      // ISO/IEC 42001 AIMS; high-risk / prohibited tiers; oversight controls.
      "nist ai rmf", "iso 42001", "iso/iec 42001",
      "conformity assessment", "high-risk ai", "prohibited ai",
      "prohibited ai system",
      "human-in-the-loop", "human in the loop", "kill switch",
      "model card", "ai transparency report", "fairness monitoring",
      // Emerging governance frontiers — agentic AI identity/oversight and
      // unmanaged "Shadow AI" sprawl inside the enterprise.
      "agentic ai", "autonomous ai agent", "shadow ai", "unauthorized ai",
    ],
    sasb: "Business Model & Innovation · Systemic Risk Management",
    sdg: ["9", "10", "16"],
  },

  // ── Operational Risk & Crisis ────────────────────────────────
  {
    id: "pandemic-health",
    domain: "operational-risk-crisis",
    label: "Pandemic & public health",
    keywords: ["pandemic", "covid", "disease outbreak", "epidemic", "public health emergency", "vaccine"],
    sdg: ["3"],
  },
  {
    id: "geopolitical",
    domain: "operational-risk-crisis",
    label: "Geopolitical conflict",
    keywords: ["war", "conflict zone", "sanctions regime", "geopolitical", "invasion", "military coup"],
    sdg: ["16"],
  },
  {
    id: "cyber-incident",
    domain: "operational-risk-crisis",
    label: "Cyber incident",
    keywords: ["ransomware", "cyberattack", "data leak", "hacked", "breach notification", "ddos"],
    sasb: "Business Model & Innovation · Systemic Risk Management",
    sdg: ["9", "16"],
  },
  // Operational counterpart to ai-governance-ethics: technical failure modes
  // and AI-specific attack surface (OWASP LLM Top 10, model drift, agentic
  // AI harms). Governance sits under legal-regulatory; concrete incidents
  // sit here so drift/prompt-injection news fires operational.
  {
    id: "ai-failure-incident",
    domain: "operational-risk-crisis",
    label: "AI failure & incident",
    keywords: [
      "model drift", "concept drift", "data drift",
      "prompt injection", "jailbreak", "jailbroken model",
      "model inversion", "membership inference",
      "data poisoning", "training data poisoning",
      "adversarial attack", "adversarial example",
      "ai incident", "ai harm", "model failure",
      "model theft", "training data leak",
    ],
    sasb: "Business Model & Innovation · Systemic Risk Management",
    sdg: ["9", "16"],
  },
  {
    id: "supply-chain-disruption",
    domain: "operational-risk-crisis",
    label: "Supply chain disruption",
    keywords: ["supply chain disruption", "port closure", "chip shortage", "factory shutdown", "shipping crisis", "red sea"],
    sasb: "Business Model & Innovation · Supply Chain Management",
    sdg: ["9"],
  },
  {
    id: "natural-disaster",
    domain: "operational-risk-crisis",
    label: "Natural disaster & climate event",
    keywords: ["hurricane", "wildfire", "flooding", "earthquake", "typhoon", "extreme weather", "climate event"],
    sdg: ["11", "13"],
  },
];

export interface EsgMatch {
  categoryId: string;
  domain: EsgDomain;
  label: string;
  keyword: string;
  offset: number;
  sasb?: string;
  euTaxonomy?: string;
  sdg?: string[];
}

export function classifyEsg(text: string | null | undefined): EsgMatch[] {
  if (!text) return [];
  const hay = text.toLowerCase();
  const out: EsgMatch[] = [];
  const seen = new Set<string>();
  for (const cat of ESG_CATEGORIES) {
    for (const kw of cat.keywords) {
      const idx = hay.indexOf(kw);
      if (idx === -1) continue;
      const key = `${cat.id}:${kw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const match: EsgMatch = {
        categoryId: cat.id,
        domain: cat.domain,
        label: cat.label,
        keyword: kw,
        offset: idx,
      };
      if (cat.sasb !== undefined) match.sasb = cat.sasb;
      if (cat.euTaxonomy !== undefined) match.euTaxonomy = cat.euTaxonomy;
      if (cat.sdg !== undefined) match.sdg = cat.sdg;
      out.push(match);
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

export function esgDomainsInMatches(matches: readonly EsgMatch[]): EsgDomain[] {
  return Array.from(new Set(matches.map((m) => m.domain)));
}
