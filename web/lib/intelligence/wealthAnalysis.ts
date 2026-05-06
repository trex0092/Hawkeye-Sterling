// Hawkeye Sterling — wealth & SoW analysis (Layers 219-226).

export interface WealthProfile {
  declaredNetWorthUsd?: number;
  declaredAnnualIncomeUsd?: number;
  occupations?: Array<{ role: string; from: string; to?: string; salaryUsd?: number }>;
  inheritanceClaims?: Array<{ from: string; amountUsd: number; year: number; documented: boolean }>;
  realEstateSales?: Array<{ assetId: string; saleUsd: number; year: number; titleVerified: boolean }>;
  businessSales?: Array<{ businessId: string; saleUsd: number; year: number; documented: boolean }>;
  dividendHistory?: Array<{ year: number; amountUsd: number }>;
  taxFilings?: Array<{ year: number; declaredIncomeUsd: number }>;
  jurisdictionIso2?: string;
}

// 219. SoW story coherence — does the narrative add up?
export function sowCoherence(p: WealthProfile): { coherent: boolean; gapUsd: number; rationale: string } {
  const sources =
    (p.occupations ?? []).reduce((s, o) => {
      const yrs = ((o.to ? Date.parse(o.to) : Date.now()) - Date.parse(o.from)) / (365 * 86400000);
      return s + (o.salaryUsd ?? 0) * Math.max(0, yrs);
    }, 0) +
    (p.inheritanceClaims ?? []).reduce((s, x) => s + (x.documented ? x.amountUsd : 0), 0) +
    (p.realEstateSales ?? []).reduce((s, x) => s + (x.titleVerified ? x.saleUsd : 0), 0) +
    (p.businessSales ?? []).reduce((s, x) => s + (x.documented ? x.saleUsd : 0), 0) +
    (p.dividendHistory ?? []).reduce((s, x) => s + x.amountUsd, 0);
  const declared = p.declaredNetWorthUsd ?? 0;
  const gap = declared - sources;
  const coherent = gap <= declared * 0.2;  // within 20%
  return { coherent, gapUsd: Math.round(gap), rationale: coherent ? "Documented sources cover ≥80% of declared net worth." : `USD ${Math.round(gap).toLocaleString()} gap (${((gap / declared) * 100).toFixed(0)}% unexplained).` };
}
// 220. Salary vs declared wealth
export function salaryConsistency(p: WealthProfile): { ok: boolean; rationale: string } {
  if (!p.declaredAnnualIncomeUsd) return { ok: false, rationale: "no declared income" };
  const totalSalary = (p.occupations ?? []).reduce((s, o) => s + (o.salaryUsd ?? 0), 0);
  if (totalSalary === 0) return { ok: false, rationale: "no salary in occupation history" };
  if (Math.abs(p.declaredAnnualIncomeUsd - totalSalary) / p.declaredAnnualIncomeUsd > 0.5)
    return { ok: false, rationale: `Declared annual income USD ${p.declaredAnnualIncomeUsd.toLocaleString()} vs salary records USD ${totalSalary.toLocaleString()}.` };
  return { ok: true, rationale: "consistent" };
}
// 221. Inheritance documentation completeness
export function inheritanceCompleteness(p: WealthProfile): { complete: boolean; missing: number } {
  const missing = (p.inheritanceClaims ?? []).filter((i) => !i.documented).length;
  return { complete: missing === 0, missing };
}
// 222. Real-estate sale verification
export function realEstateVerification(p: WealthProfile): { verified: boolean; unverifiedCount: number } {
  const u = (p.realEstateSales ?? []).filter((s) => !s.titleVerified).length;
  return { verified: u === 0, unverifiedCount: u };
}
// 223. Business-sale documentation
export function businessSaleDocs(p: WealthProfile): { documented: boolean; missing: number } {
  const m = (p.businessSales ?? []).filter((s) => !s.documented).length;
  return { documented: m === 0, missing: m };
}
// 224. Dividend-history alignment
export function dividendAlignment(p: WealthProfile): { aligned: boolean; rationale: string } {
  const dh = p.dividendHistory ?? [];
  if (dh.length === 0) return { aligned: true, rationale: "no dividend history declared" };
  const maxY = Math.max(...dh.map((d) => d.year));
  const minY = Math.min(...dh.map((d) => d.year));
  if (maxY - minY < 3) return { aligned: false, rationale: "Dividend history spans <3 years; verify continuity." };
  return { aligned: true, rationale: `${dh.length} years of dividends spanning ${minY}-${maxY}.` };
}
// 225. Tax-record cross-check
export function taxRecordCrossCheck(p: WealthProfile): { ok: boolean; gaps: Array<{ year: number; gapUsd: number }> } {
  const gaps: Array<{ year: number; gapUsd: number }> = [];
  for (const t of p.taxFilings ?? []) {
    if (p.declaredAnnualIncomeUsd && Math.abs(t.declaredIncomeUsd - p.declaredAnnualIncomeUsd) / p.declaredAnnualIncomeUsd > 0.3) {
      gaps.push({ year: t.year, gapUsd: t.declaredIncomeUsd - p.declaredAnnualIncomeUsd });
    }
  }
  return { ok: gaps.length === 0, gaps };
}
// 226. Family-wealth benchmark (median net-worth in jurisdiction)
const NET_WORTH_BENCHMARK_USD: Record<string, number> = {
  AE: 200_000, US: 192_000, GB: 280_000, DE: 100_000, FR: 140_000, JP: 130_000,
  CN: 75_000, IN: 16_000, RU: 28_000, BR: 30_000, ZA: 25_000,
};
export function familyWealthBenchmark(p: WealthProfile): { ratio: number; rationale: string } {
  const benchmark = p.jurisdictionIso2 ? NET_WORTH_BENCHMARK_USD[p.jurisdictionIso2.toUpperCase()] : null;
  const declared = p.declaredNetWorthUsd ?? 0;
  if (!benchmark) return { ratio: 0, rationale: "no benchmark for jurisdiction" };
  const ratio = declared / benchmark;
  return { ratio: Number(ratio.toFixed(1)), rationale: `Subject net worth USD ${declared.toLocaleString()} is ${ratio.toFixed(1)}× ${p.jurisdictionIso2} median.` };
}
