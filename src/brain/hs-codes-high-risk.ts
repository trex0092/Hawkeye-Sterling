// Hawkeye Sterling — high-risk HS-code registry.
// Harmonized System codes commonly associated with TBML or proliferation
// concerns. Used by the trade-finance rubric and the unit-price-outlier
// reasoning mode. Not exhaustive — extend with sector-specific lists at run-
// time. Risk reasons cite the typology only — no legal conclusions (P3).

export type TbmlReason =
  | 'price_volatility'
  | 'documentation_complexity'
  | 'dual_use'
  | 'high_unit_value'
  | 'commoditised_easy_to_misinvoice'
  | 'frequently_substituted'
  | 'sanctions_relevance';

export interface HsCodeRow {
  hs6: string;          // 6-digit harmonised code
  description: string;
  reasons: TbmlReason[];
  notes?: string;
}

export const HS_HIGH_RISK: HsCodeRow[] = [
  { hs6: '710812', description: 'Gold (incl. gold plated with platinum), unwrought, non-monetary', reasons: ['high_unit_value', 'commoditised_easy_to_misinvoice', 'sanctions_relevance'] },
  { hs6: '710813', description: 'Gold semi-manufactured forms', reasons: ['high_unit_value', 'commoditised_easy_to_misinvoice'] },
  { hs6: '711319', description: 'Articles of jewellery of other precious metal', reasons: ['high_unit_value', 'price_volatility', 'commoditised_easy_to_misinvoice'] },
  { hs6: '710691', description: 'Silver, unwrought', reasons: ['commoditised_easy_to_misinvoice'] },
  { hs6: '710210', description: 'Diamonds, not sorted', reasons: ['high_unit_value', 'documentation_complexity', 'sanctions_relevance'] },
  { hs6: '710231', description: 'Diamonds, non-industrial, unworked or sawn / cleaved / bruted', reasons: ['high_unit_value', 'documentation_complexity'] },
  { hs6: '710239', description: 'Diamonds, non-industrial, otherwise worked', reasons: ['high_unit_value', 'documentation_complexity'] },
  { hs6: '270900', description: 'Crude petroleum oils', reasons: ['price_volatility', 'sanctions_relevance', 'documentation_complexity'] },
  { hs6: '271000', description: 'Petroleum oils, refined', reasons: ['price_volatility', 'sanctions_relevance', 'documentation_complexity'] },
  { hs6: '440710', description: 'Coniferous wood, sawn or chipped lengthwise', reasons: ['frequently_substituted', 'commoditised_easy_to_misinvoice'] },
  { hs6: '610910', description: 'T-shirts, singlets and other vests, of cotton, knitted or crocheted', reasons: ['commoditised_easy_to_misinvoice'], notes: 'Common over-/under-invoicing typology.' },
  { hs6: '620342', description: 'Trousers, bib & brace overalls, breeches and shorts of cotton', reasons: ['commoditised_easy_to_misinvoice'] },
  { hs6: '847130', description: 'Portable automatic data-processing machines (laptops)', reasons: ['frequently_substituted', 'documentation_complexity'] },
  { hs6: '852872', description: 'Television receivers', reasons: ['commoditised_easy_to_misinvoice'] },
  { hs6: '870323', description: 'Motor cars, spark-ignition, cylinder capacity 1500–3000cc', reasons: ['high_unit_value', 'frequently_substituted'] },
  { hs6: '870324', description: 'Motor cars, spark-ignition, cylinder capacity > 3000cc', reasons: ['high_unit_value', 'frequently_substituted'] },
  { hs6: '870421', description: 'Goods vehicles, diesel, ≤ 5t', reasons: ['frequently_substituted'] },
  { hs6: '880240', description: 'Aeroplanes / other aircraft, unladen weight > 15,000kg', reasons: ['high_unit_value', 'sanctions_relevance', 'dual_use'] },
  { hs6: '890190', description: 'Vessels for transport of goods', reasons: ['high_unit_value', 'sanctions_relevance', 'documentation_complexity'] },
  { hs6: '930320', description: 'Sporting / hunting / target-shooting shotguns', reasons: ['dual_use', 'sanctions_relevance'] },
  { hs6: '930621', description: 'Cartridges for shotguns', reasons: ['dual_use'] },
  { hs6: '880520', description: 'Ground flying trainers + parts (incl. simulators)', reasons: ['dual_use'] },
  { hs6: '252329', description: 'Portland cement, other', reasons: ['price_volatility', 'commoditised_easy_to_misinvoice'] },
  { hs6: '720449', description: 'Ferrous waste and scrap, other', reasons: ['commoditised_easy_to_misinvoice', 'price_volatility'] },
  { hs6: '740319', description: 'Refined copper, unwrought', reasons: ['price_volatility', 'commoditised_easy_to_misinvoice'] },
  { hs6: '760110', description: 'Aluminium unwrought, not alloyed', reasons: ['price_volatility', 'commoditised_easy_to_misinvoice'] },
  { hs6: '780199', description: 'Lead unwrought, other', reasons: ['commoditised_easy_to_misinvoice'] },
  { hs6: '790111', description: 'Zinc unwrought, not alloyed, ≥ 99.99%', reasons: ['commoditised_easy_to_misinvoice'] },
  { hs6: '810292', description: 'Molybdenum waste / scrap', reasons: ['dual_use', 'sanctions_relevance'] },
  { hs6: '281410', description: 'Anhydrous ammonia', reasons: ['dual_use'] },
  { hs6: '290512', description: 'Methanol (methyl alcohol)', reasons: ['dual_use'] },
];

export const HS_HIGH_RISK_BY_CODE: Map<string, HsCodeRow> = new Map(
  HS_HIGH_RISK.map((r) => [r.hs6, r]),
);
