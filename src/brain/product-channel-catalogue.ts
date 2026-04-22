// Hawkeye Sterling — product + channel inherent-risk catalogue.
// Baseline inherent-risk weights by product / channel. Calibration expected
// to drift post-launch; each row carries a version so re-calibration is
// auditable.

export type Product =
  | 'dpms_retail_sale'
  | 'dpms_buy_back'
  | 'dpms_refining_service'
  | 'bullion_wholesale'
  | 'safe_deposit_box'
  | 'correspondent_account'
  | 'investment_gold_savings'
  | 'life_insurance_single_premium'
  | 'real_estate_cash_sale'
  | 'crypto_trading'
  | 'stablecoin_custody'
  | 'nft_dealer'
  | 'msb_remittance'
  | 'fx_cash'
  | 'precious_stone_trade';

export type Channel = 'in_person' | 'online_self_service' | 'broker_intermediary' | 'phone' | 'mobile_app' | 'courier' | 'not_present';

export interface ProductRisk {
  id: Product;
  inherent: number;  // 0..1
  rationale: string;
  version: string;
}

export interface ChannelRisk {
  id: Channel;
  inherent: number;
  rationale: string;
  version: string;
}

const V = '2026.01';

export const PRODUCTS: ProductRisk[] = [
  { id: 'dpms_retail_sale', inherent: 0.55, rationale: 'Cash-exposed retail channel; structuring risk.', version: V },
  { id: 'dpms_buy_back', inherent: 0.60, rationale: 'Input provenance often thin; doré/scrap acceptance risk.', version: V },
  { id: 'dpms_refining_service', inherent: 0.75, rationale: 'LBMA RGG + OECD DDG exposure; CAHRA sensitivity.', version: V },
  { id: 'bullion_wholesale', inherent: 0.60, rationale: 'Loco-split risk; counterparty depth.', version: V },
  { id: 'safe_deposit_box', inherent: 0.50, rationale: 'Anonymised storage risk.', version: V },
  { id: 'correspondent_account', inherent: 0.80, rationale: 'Downstream visibility limited; nested risk.', version: V },
  { id: 'investment_gold_savings', inherent: 0.45, rationale: 'Recurring purchases; easier to monitor.', version: V },
  { id: 'life_insurance_single_premium', inherent: 0.70, rationale: 'Overfund/refund typology; beneficiary rotation.', version: V },
  { id: 'real_estate_cash_sale', inherent: 0.75, rationale: 'Cash + opaque-buyer risk.', version: V },
  { id: 'crypto_trading', inherent: 0.70, rationale: 'On-chain exposure; mixer risk; travel-rule gaps.', version: V },
  { id: 'stablecoin_custody', inherent: 0.55, rationale: 'Issuer / reserve disclosure risk.', version: V },
  { id: 'nft_dealer', inherent: 0.65, rationale: 'Provenance opacity + wash-trade risk.', version: V },
  { id: 'msb_remittance', inherent: 0.65, rationale: 'Layering and corridor risk.', version: V },
  { id: 'fx_cash', inherent: 0.55, rationale: 'Cash + cross-border risk.', version: V },
  { id: 'precious_stone_trade', inherent: 0.60, rationale: 'Documentation complexity + dual-use.', version: V },
];

export const CHANNELS: ChannelRisk[] = [
  { id: 'in_person', inherent: 0.40, rationale: 'ID verification in person.', version: V },
  { id: 'online_self_service', inherent: 0.60, rationale: 'Remote identity assurance risk; impersonation.', version: V },
  { id: 'broker_intermediary', inherent: 0.55, rationale: 'Reliance on third-party CDD.', version: V },
  { id: 'phone', inherent: 0.50, rationale: 'Limited verification fidelity.', version: V },
  { id: 'mobile_app', inherent: 0.55, rationale: 'Device-based risk; SIM-swap.', version: V },
  { id: 'courier', inherent: 0.55, rationale: 'Physical handling risks; chain-of-custody.', version: V },
  { id: 'not_present', inherent: 0.70, rationale: 'Non-face-to-face; impersonation risk.', version: V },
];

export const PRODUCT_BY_ID: Map<Product, ProductRisk> = new Map(PRODUCTS.map((p) => [p.id, p]));
export const CHANNEL_BY_ID: Map<Channel, ChannelRisk> = new Map(CHANNELS.map((c) => [c.id, c]));
