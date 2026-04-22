// Hawkeye Sterling — FATF / Egmont / APG typology catalogue.
// Each typology carries a name, family, a regex fingerprint, and a tier score.
// Consumed by the `typology_catalogue` mode.

export interface Typology {
  id: string;
  name: string;
  family: 'ml' | 'tf' | 'pf' | 'fraud' | 'corruption' | 'cyber';
  description: string;
  fingerprint: RegExp;
  weight: number; // 0..1 severity weight
}

export const TYPOLOGIES: Typology[] = [
  { id: 'tbml_overunder', name: 'Over/Under-invoicing (TBML)', family: 'ml',
    description: 'Trade-based ML via inflated or deflated invoice values.',
    fingerprint: /\b(over[- ]?invoic|under[- ]?invoic|phantom shipment|multiple invoicing|price manipulation|misdeclared goods|declared value)\b/i,
    weight: 0.85 },
  { id: 'smurf_structuring', name: 'Smurfing / Structuring', family: 'ml',
    description: 'Many small deposits below reporting threshold.',
    fingerprint: /\b(smurf(?:ing)?|structur(?:ing|ed) (?:deposit|payment|transaction)|below (?:the )?threshold|split deposit|ctr avoid)\b/i,
    weight: 0.8 },
  { id: 'shell_layer', name: 'Shell-company layering', family: 'ml',
    description: 'Nested shells in secrecy jurisdictions concealing beneficial ownership.',
    fingerprint: /\b(shell (?:company|corporation|entity)|letterbox (?:company)?|nominee (?:director|shareholder)|bvi chain|cayman chain|panama|seychelles chain)\b/i,
    weight: 0.85 },
  { id: 'cash_intensive', name: 'Cash-intensive business abuse', family: 'ml',
    description: 'Laundering via high-cash-turnover fronts (car wash, nail bar, restaurant).',
    fingerprint: /\b(cash[- ]intensive|car wash (?:laundering)?|restaurant front|nail (?:bar|salon) front|laundromat front|money service business)\b/i,
    weight: 0.7 },
  { id: 'real_estate', name: 'Real-estate laundering', family: 'ml',
    description: 'Cash purchases via anonymous vehicles, flip-and-refinance.',
    fingerprint: /\b(cash (?:property|real[- ]estate) purchase|anonymous buyer|shell purchaser|quick flip|mortgage[- ]free purchase|all[- ]cash offer)\b/i,
    weight: 0.75 },
  { id: 'hawala', name: 'Hawala / informal value transfer', family: 'ml',
    description: 'Parallel-banking settlement outside the formal system.',
    fingerprint: /\b(hawala|hundi|fei chien|black market peso|informal value transfer|ivts)\b/i,
    weight: 0.8 },
  { id: 'dark_fleet_oil', name: 'Dark-fleet oil (sanctions evasion)', family: 'pf',
    description: 'AIS-off, STS transfer, flag hopping moving sanctioned crude.',
    fingerprint: /\b(dark fleet|ship[- ]to[- ]ship|sts transfer|ais (?:off|dark|manipulation|spoofing)|flag hopping|shadow fleet)\b/i,
    weight: 0.95 },
  { id: 'tf_charity', name: 'Charity / NPO abuse for TF', family: 'tf',
    description: 'Non-profit front funnelling to designated groups.',
    fingerprint: /\b(npo|non[- ]profit) (?:abuse|front|conduit)|charity (?:front|diversion)|cash couriers? charity\b/i,
    weight: 0.9 },
  { id: 'wildlife_trafficking', name: 'Wildlife trafficking', family: 'corruption',
    description: 'Ivory, rhino horn, pangolin, big cat trade.',
    fingerprint: /\b(wildlife traffick|ivory trade|rhino horn|pangolin scale|big cat trade|cites violation)\b/i,
    weight: 0.75 },
  { id: 'sextortion_cyber', name: 'Sextortion / cyber extortion', family: 'cyber',
    description: 'Ransomware or sextortion payouts to crypto.',
    fingerprint: /\b(sextortion|cyber extortion|ransomware payout|bitcoin ransom|double extortion)\b/i,
    weight: 0.75 },
  { id: 'crypto_mixing', name: 'Crypto-mixer layering', family: 'cyber',
    description: 'Tornado/ChipMixer/blender hop followed by off-ramp.',
    fingerprint: /\b(tornado cash|chipmixer|blender\.io|coinjoin|privacy pool)\b/i,
    weight: 0.9 },
  { id: 'round_trip_loan', name: 'Round-trip loan-back', family: 'ml',
    description: 'Self-lending via related parties to legitimise proceeds.',
    fingerprint: /\b(loan[- ]back|back[- ]to[- ]back loan|circular loan|related[- ]party loan)\b/i,
    weight: 0.75 },
  { id: 'false_consulting', name: 'Sham consultancy fees', family: 'corruption',
    description: 'Bribery disguised as advisory / success fees.',
    fingerprint: /\b(sham consultancy|phantom advisory|no deliverable|fictitious consult|success fee.{0,40}no (?:scope|deliverable))\b/i,
    weight: 0.8 },
  { id: 'virtual_currency_off_ramp', name: 'VASP off-ramp laundering', family: 'ml',
    description: 'Exchange-hopping between unregulated VASPs.',
    fingerprint: /\b(p2p exchange|otc desk|no[- ]kyc exchange|instant swap|chain hopping)\b/i,
    weight: 0.8 },
  { id: 'invoice_fraud', name: 'Phantom / duplicate invoicing', family: 'fraud',
    description: 'Fake or duplicate invoices used to extract funds.',
    fingerprint: /\b(phantom invoice|duplicate invoice|fake invoice|ghost invoice|invoice cloning)\b/i,
    weight: 0.7 },
  { id: 'carousel_vat', name: 'VAT / MTIC carousel', family: 'fraud',
    description: 'Missing-trader intra-community VAT carousel.',
    fingerprint: /\b(mtic|missing trader|vat carousel|carousel fraud)\b/i,
    weight: 0.8 },
  { id: 'political_kickback', name: 'Political kickback / procurement bribe', family: 'corruption',
    description: 'Public-procurement inflation kicked back to officials.',
    fingerprint: /\b(kickback|bid rigging|procurement fraud|tender manipulation|bribe)\b/i,
    weight: 0.85 },
  { id: 'dnfbp_dealer_gold', name: 'DPMS / gold-dealer laundering', family: 'ml',
    description: 'Precious-metal dealer used as a laundering conduit.',
    fingerprint: /\b(gold dealer|precious metal (?:dealer|stone)|dpms|scrap gold|gold souk)\b/i,
    weight: 0.75 },
  { id: 'free_port_art', name: 'Free-port art storage', family: 'ml',
    description: 'Geneva/Luxembourg/Delaware free-port art concealment.',
    fingerprint: /\b(free[- ]?port|freeport (?:art|storage)|anonymous art purchase|private art sale)\b/i,
    weight: 0.7 },
  { id: 'iran_evasion', name: 'Iran oil / sanctions evasion', family: 'pf',
    description: 'Front banks, STS, gold-for-oil.',
    fingerprint: /\b(iranian oil|iran sanctions evasion|front bank|gold[- ]for[- ]oil|ghost tanker)\b/i,
    weight: 0.95 },
  { id: 'dprk_heist', name: 'DPRK crypto heist / Lazarus', family: 'pf',
    description: 'Lazarus Group, bridge exploits, mixer hop, peel to OTC.',
    fingerprint: /\b(lazarus|dprk hack|north korea (?:hack|heist|cyber)|axie bridge|ronin bridge|harmony bridge)\b/i,
    weight: 0.95 },
];

export interface TypologyMatch { typology: Typology; snippet: string; }
export function matchTypologies(text: string): TypologyMatch[] {
  const matches: TypologyMatch[] = [];
  for (const typ of TYPOLOGIES) {
    const m = typ.fingerprint.exec(text);
    if (m) {
      const i = m.index ?? 0;
      const start = Math.max(0, i - 32);
      const end = Math.min(text.length, i + m[0].length + 32);
      matches.push({ typology: typ, snippet: text.slice(start, end).replace(/\s+/g, ' ').trim() });
    }
  }
  return matches;
}

export function typologyCompositeScore(matches: ReadonlyArray<TypologyMatch>): number {
  if (matches.length === 0) return 0;
  const weights = matches.map((m) => m.typology.weight);
  const max = Math.max(...weights);
  const breadth = Math.min(1, 0.1 * (matches.length - 1));
  return Math.min(1, max + breadth);
}
