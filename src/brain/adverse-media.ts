// Hawkeye Sterling — adverse-media taxonomy and compiled search query.
// Five risk categories with the user's exact keyword lists, plus the canonical
// boolean OR query for news / RSS / search-API ingestion.

import type { AdverseMediaCategory } from './types.js';

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
    ],
  },
  {
    id: 'terrorist_financing',
    displayName: 'Terrorist Financing',
    keywords: [
      'terrorism', 'terrorist financing', 'financing of terrorism',
      'terror funding', 'extremist', 'radicalisation', 'designated terrorist',
      'militant',
    ],
  },
  {
    id: 'proliferation_financing',
    displayName: 'Proliferation Financing',
    keywords: [
      'proliferation financing', 'weapons of mass destruction', 'WMD',
      'dual-use', 'sanctions evasion', 'arms trafficking', 'weapons smuggling',
      'nuclear', 'chemical weapons', 'biological weapons',
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
    ],
  },
];

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
