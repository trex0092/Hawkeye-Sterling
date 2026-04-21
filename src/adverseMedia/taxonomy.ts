export type AdverseMediaCategoryId =
  | 'ml_financial_crime'
  | 'terrorist_financing'
  | 'proliferation_financing'
  | 'corruption_organised_crime'
  | 'legal_criminal_regulatory';

export interface AdverseMediaCategory {
  id: AdverseMediaCategoryId;
  label: string;
  keywords: readonly string[];
}

export const ADVERSE_MEDIA_CATEGORIES: readonly AdverseMediaCategory[] = [
  {
    id: 'ml_financial_crime',
    label: 'Money Laundering and Financial Crime',
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
    label: 'Terrorist Financing',
    keywords: [
      'terrorism', 'terrorist financing', 'financing of terrorism',
      'terror funding', 'extremist', 'radicalisation', 'designated terrorist',
      'militant',
    ],
  },
  {
    id: 'proliferation_financing',
    label: 'Proliferation Financing',
    keywords: [
      'proliferation financing', 'weapons of mass destruction', 'WMD',
      'dual-use', 'sanctions evasion', 'arms trafficking',
      'weapons smuggling', 'nuclear', 'chemical weapons', 'biological weapons',
    ],
  },
  {
    id: 'corruption_organised_crime',
    label: 'Corruption, Bribery and Organised Crime',
    keywords: [
      'corrupt', 'bribe', 'corruption', 'abuse of power',
      'conflict of interest', 'misuse of funds', 'kleptocracy',
      'state capture', 'mafia', 'organised crime', 'drug trafficking',
      'narcotics', 'cartel', 'human trafficking', 'people smuggling',
      'forced labour', 'modern slavery', 'wildlife trafficking',
      'cybercrime', 'ransomware', 'darknet',
    ],
  },
  {
    id: 'legal_criminal_regulatory',
    label: 'Legal, Criminal and Regulatory Proceedings',
    keywords: [
      'arrest', 'blackmail', 'breach', 'convict', 'court case', 'felon',
      'fined', 'guilty', 'illegal', 'imprisonment', 'jail', 'litigate',
      'murder', 'politic', 'prosecute', 'sanctions', 'theft', 'unlawful',
      'verdict', 'debarred', 'blacklisted', 'regulatory breach',
    ],
  },
] as const;

export const ADVERSE_MEDIA_KEYWORDS: readonly string[] = Array.from(
  new Set(ADVERSE_MEDIA_CATEGORIES.flatMap((c) => c.keywords)),
);
