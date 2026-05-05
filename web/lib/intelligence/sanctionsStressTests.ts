// Hawkeye Sterling — sanctions stress tests (Layers 201-210).
// Scenario-based stress tests that check whether a customer / transaction
// touches a specific named sanctions regime in a non-trivial way.

export interface SanctionsContext {
  subjectIso2?: string;
  counterpartyIso2?: string;
  industry?: string;
  goodsHsCode?: string;
  vesselFlag?: string;
  amountUsd?: number;
  oilProductBarrelPriceUsd?: number;
}

export interface StressTestResult {
  regime: string;
  fired: boolean;
  severity: "critical" | "high" | "medium" | "low";
  rationale: string;
  citation: string;
}

// 201. EU 8th sanctions package (Russia)
export function euEighthPackage(c: SanctionsContext): StressTestResult {
  const fired = c.subjectIso2 === "RU" || c.counterpartyIso2 === "RU";
  return { regime: "EU 8th Russia", fired, severity: fired ? "high" : "low",
    rationale: fired ? "Russia exposure — EU 8th sanctions package extends restrictions on dual-use goods, oil products, and SWIFT access." : "No Russia nexus.",
    citation: "EU Council Regulation 2022/1904 (Oct 2022)" };
}
// 202. UK SAMLA evasion
export function ukSamlaEvasion(c: SanctionsContext): StressTestResult {
  const fired = c.subjectIso2 === "RU" && (c.counterpartyIso2 === "AE" || c.counterpartyIso2 === "TR");
  return { regime: "UK SAMLA", fired, severity: fired ? "high" : "low",
    rationale: fired ? "UK SAMLA prohibits circumvention via third countries; AE/TR routing of Russian counterparty is a known evasion pattern." : "No SAMLA evasion pattern.",
    citation: "UK Sanctions and Anti-Money Laundering Act 2018" };
}
// 203. Russia oil price-cap
export function russiaOilPriceCap(c: SanctionsContext): StressTestResult {
  const oil = c.goodsHsCode?.startsWith("2709") || c.goodsHsCode?.startsWith("2710");
  const fromRu = c.subjectIso2 === "RU" || c.vesselFlag === "RU";
  if (!oil || !fromRu) return { regime: "Russia Oil Price Cap", fired: false, severity: "low", rationale: "No Russian oil nexus.", citation: "G7 Oil Price Cap (5 Dec 2022)" };
  const cap = 60; // USD/barrel as of Dec-2022
  const above = (c.oilProductBarrelPriceUsd ?? 0) > cap;
  return { regime: "Russia Oil Price Cap", fired: above, severity: above ? "critical" : "medium",
    rationale: above ? `Oil priced above USD ${cap}/bbl cap — service / insurance / financing prohibited.` : "Within price cap.",
    citation: "G7 Oil Price Cap (5 Dec 2022) + EU Council Decision 2022/2369" };
}
// 204. North Korea overseas labour
export function dprkOverseasLabour(c: SanctionsContext): StressTestResult {
  const fired = c.industry === "construction" && (c.counterpartyIso2 === "RU" || c.counterpartyIso2 === "CN");
  return { regime: "DPRK Overseas Labour", fired, severity: fired ? "high" : "low",
    rationale: fired ? "Construction work involving RU/CN nexus — verify no DPRK nationals deployed under UNSCR 2397." : "No DPRK labour exposure.",
    citation: "UNSCR 2397 (2017)" };
}
// 205. Iran nuclear procurement
export function iranNuclearProcurement(c: SanctionsContext): StressTestResult {
  const dual = ["8401","8413","8414","8419","8456","8462","8543"].some((p) => c.goodsHsCode?.startsWith(p));
  const iran = c.counterpartyIso2 === "IR";
  return { regime: "Iran Nuclear Procurement", fired: dual && iran, severity: dual && iran ? "critical" : "low",
    rationale: dual && iran ? "Dual-use HS code combined with Iran counterparty — UNSCR 2231 / EO 13382 territory." : "No nuclear-procurement pattern.",
    citation: "UNSCR 2231 + US EO 13382" };
}
// 206. Syria reconstruction
export function syriaReconstruction(c: SanctionsContext): StressTestResult {
  const fired = c.counterpartyIso2 === "SY" && (c.industry === "construction" || c.industry === "extractives");
  return { regime: "Syria Reconstruction Sanctions", fired, severity: fired ? "high" : "low",
    rationale: fired ? "Reconstruction / extractives work in Syria — Caesar Act sanctions apply to material support." : "No Syria reconstruction exposure.",
    citation: "Caesar Syria Civilian Protection Act 2019" };
}
// 207. Cuba CACR
export function cubaCacr(c: SanctionsContext): StressTestResult {
  const fired = c.counterpartyIso2 === "CU" || c.subjectIso2 === "CU";
  return { regime: "Cuba CACR", fired, severity: fired ? "critical" : "low",
    rationale: fired ? "Cuba exposure — Cuban Assets Control Regulations prohibit most financial dealings absent OFAC general/specific licence." : "No Cuba nexus.",
    citation: "31 CFR Part 515 (CACR)" };
}
// 208. Crimea / DPR / LPR / Z / K (already in subnationalSanctions; this is a per-tx check)
export function comprehensiveRegions(addressOrCity: string | null | undefined): StressTestResult {
  if (!addressOrCity) return { regime: "Comprehensive Regions", fired: false, severity: "low", rationale: "No address.", citation: "OFAC EO 13685 / 14065" };
  const fired = /\b(crimea|donetsk|luhansk|lugansk|zaporizhzhia|kherson)\b/i.test(addressOrCity);
  return { regime: "Comprehensive Regions", fired, severity: fired ? "critical" : "low",
    rationale: fired ? "Address in OFAC-comprehensively-sanctioned region — refuse." : "Not in comprehensive-region list.",
    citation: "OFAC EO 13685 / 14065" };
}
// 209. Belarus dual-use export
export function belarusDualUseExport(c: SanctionsContext): StressTestResult {
  const fired = c.counterpartyIso2 === "BY" && Boolean(c.goodsHsCode);
  return { regime: "Belarus Dual-Use", fired, severity: fired ? "high" : "low",
    rationale: fired ? "Goods exported to Belarus — verify against EU/UK/US dual-use export control lists." : "No Belarus export.",
    citation: "EU Reg 833/2014 (extended to BY) + US EAR" };
}
// 210. Venezuela oil sanctions
export function venezuelaOil(c: SanctionsContext): StressTestResult {
  const oil = c.goodsHsCode?.startsWith("2709") || c.goodsHsCode?.startsWith("2710");
  const fired = c.counterpartyIso2 === "VE" && Boolean(oil);
  return { regime: "Venezuela Oil", fired, severity: fired ? "critical" : "low",
    rationale: fired ? "Venezuelan oil — PDVSA-related sanctions apply absent OFAC General Licence." : "No Venezuelan oil exposure.",
    citation: "OFAC EO 13884 + GL 8" };
}
