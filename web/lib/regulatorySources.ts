// Declarative registry of regulatory sources the MLRO Advisor watches.
// Each entry pins the canonical URL, the authority that publishes it,
// and the kind of artefact (consolidated list, circular, guidance,
// recommendation set) so a parser can be matched per kind. The actual
// fetch + parse is intentionally not implemented here — production
// deployments must wire each source to a parser and a scheduled job
// (Netlify scheduled function or a workflow).
//
// The scaffolding lets the UI render the source table, surface the
// last manual-check result, and capture a review-queue event when an
// MLRO approves an update before it enters the brain.

export type SourceKind =
  | "consolidated_list"
  | "circular"
  | "guidance"
  | "recommendation_set"
  | "directive"
  | "regulation"
  | "principles";

export type SourceCadence = "daily" | "weekly" | "monthly" | "quarterly" | "ad_hoc";

export interface RegulatorySource {
  id: string;
  name: string;
  authority: string;
  jurisdictions: string[];
  kind: SourceKind;
  url: string;
  cadence: SourceCadence;
  description: string;
}

export const REGULATORY_SOURCES: RegulatorySource[] = [
  {
    id: "uae_fdl",
    name: "UAE Federal Decree-Law 20/2018",
    authority: "UAE Ministry of Justice",
    jurisdictions: ["AE"],
    kind: "regulation",
    url: "https://www.moj.gov.ae/",
    cadence: "ad_hoc",
    description:
      "Primary AML/CFT statute. Watch for amending decree-laws and implementing Cabinet Decisions.",
  },
  {
    id: "uae_cabinet_10_2019",
    name: "UAE Cabinet Decision 10/2019",
    authority: "UAE Cabinet",
    jurisdictions: ["AE"],
    kind: "regulation",
    url: "https://uaelegislation.gov.ae/",
    cadence: "ad_hoc",
    description: "CDD floor for UAE-licensed institutions; watch for amendments to high-risk lists.",
  },
  {
    id: "uae_moe_dpms",
    name: "UAE MoE DPMS circulars",
    authority: "UAE Ministry of Economy",
    jurisdictions: ["AE"],
    kind: "circular",
    url: "https://www.economy.gov.ae/",
    cadence: "monthly",
    description:
      "MoE-supervised DPMS guidance. Includes Circular 08/2021 cash-transaction reporting threshold.",
  },
  {
    id: "uae_fiu_goaml",
    name: "UAE FIU goAML guidance",
    authority: "UAE Financial Intelligence Unit",
    jurisdictions: ["AE"],
    kind: "guidance",
    url: "https://www.uaefiu.gov.ae/",
    cadence: "ad_hoc",
    description:
      "FIU operational guidance, AIF format updates, STR narrative requirements, registration changes.",
  },
  {
    id: "uae_eocn",
    name: "UAE EOCN consolidated list",
    authority: "UAE Executive Office for Control & Non-proliferation",
    jurisdictions: ["AE"],
    kind: "consolidated_list",
    url: "https://www.uaeiec.gov.ae/",
    cadence: "daily",
    description:
      "UAE consolidated sanctions list. Daily delta watch — new designations require freezing within the prescribed window.",
  },
  {
    id: "fatf_recommendations",
    name: "FATF 40 Recommendations & Methodology",
    authority: "Financial Action Task Force",
    jurisdictions: ["INT"],
    kind: "recommendation_set",
    url: "https://www.fatf-gafi.org/recommendations.html",
    cadence: "quarterly",
    description:
      "Recommendations and Interpretive Notes. Watch for updates to R.16 (Travel Rule), R.10 (CDD), R.24/25 (UBO).",
  },
  {
    id: "fatf_high_risk",
    name: "FATF high-risk & monitored jurisdictions",
    authority: "Financial Action Task Force",
    jurisdictions: ["INT"],
    kind: "consolidated_list",
    url: "https://www.fatf-gafi.org/publications/high-risk-and-other-monitored-jurisdictions/",
    cadence: "quarterly",
    description: "Black list (call-for-action) and grey list (increased monitoring). Triennially refreshed each plenary.",
  },
  {
    id: "oecd_cahra",
    name: "OECD Due Diligence Guidance for CAHRA minerals",
    authority: "OECD",
    jurisdictions: ["INT"],
    kind: "guidance",
    url: "https://www.oecd.org/corporate/mne/mining.htm",
    cadence: "ad_hoc",
    description: "5-step CAHRA minerals due diligence. Watch for sector-specific implementation notes.",
  },
  {
    id: "lbma_rgg",
    name: "LBMA Responsible Gold Guidance",
    authority: "London Bullion Market Association",
    jurisdictions: ["INT", "GB"],
    kind: "guidance",
    url: "https://www.lbma.org.uk/responsible-sourcing",
    cadence: "ad_hoc",
    description: "RGG version updates and Step 3 supplier-audit cadence. Latest baseline: RGG v9.",
  },
  {
    id: "rmi_rmap_cmrt",
    name: "RMI RMAP / CMRT",
    authority: "Responsible Minerals Initiative",
    jurisdictions: ["INT"],
    kind: "guidance",
    url: "https://www.responsiblemineralsinitiative.org/",
    cadence: "ad_hoc",
    description:
      "Responsible Minerals Assurance Process audit results and CMRT template revisions (currently v6.3).",
  },
  {
    id: "un_consolidated",
    name: "UN Security Council Consolidated List",
    authority: "United Nations Security Council",
    jurisdictions: ["INT"],
    kind: "consolidated_list",
    url: "https://www.un.org/securitycouncil/content/un-sc-consolidated-list",
    cadence: "daily",
    description:
      "Consolidated list of individuals and entities subject to UNSC sanctions. Daily delta watch.",
  },
  {
    id: "un_unscr_humanitarian",
    name: "UNSC humanitarian carve-outs",
    authority: "United Nations Security Council",
    jurisdictions: ["INT"],
    kind: "directive",
    url: "https://www.un.org/securitycouncil/sanctions/information",
    cadence: "ad_hoc",
    description:
      "UNSCR 2664 (2022) and successor humanitarian carve-outs to freezing obligations.",
  },
  {
    id: "eu_csddd",
    name: "EU Corporate Sustainability Due Diligence Directive",
    authority: "European Union",
    jurisdictions: ["EU"],
    kind: "directive",
    url: "https://eur-lex.europa.eu/eli/dir/2024/1760",
    cadence: "ad_hoc",
    description: "Directive 2024/1760. Member-state transposition deadlines and Commission guidance.",
  },
  {
    id: "eu_conflict_minerals",
    name: "EU Conflict Minerals Regulation 2017/821",
    authority: "European Union",
    jurisdictions: ["EU"],
    kind: "regulation",
    url: "https://eur-lex.europa.eu/eli/reg/2017/821/oj",
    cadence: "ad_hoc",
    description: "3TG due diligence for EU importers from CAHRAs.",
  },
  {
    id: "ungp_business_human_rights",
    name: "UN Guiding Principles on Business & Human Rights",
    authority: "UN Office of the High Commissioner for Human Rights",
    jurisdictions: ["INT"],
    kind: "principles",
    url: "https://www.ohchr.org/en/special-procedures/wg-business",
    cadence: "ad_hoc",
    description: "UNGPs and successor interpretive guidance from the Working Group on Business & Human Rights.",
  },
];

export function getSource(id: string): RegulatorySource | undefined {
  return REGULATORY_SOURCES.find((s) => s.id === id);
}
