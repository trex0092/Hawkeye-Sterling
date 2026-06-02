// Hawkeye Sterling — Cybercrime News Classifier (Taranis cybersec_classifier_bot.py analog).
// Multi-label classification of news articles by cyber-financial crime type
// for AML/CFT relevance under FATF R.15 (virtual assets) and cyber-enabled
// predicate offences (FATF R.3 / R.20).
//
// Architecture: keyword + context scoring — same pattern as adverse-media.ts.
// Deterministic, auditable, zero external ML dependencies.
//
// Labels and FATF anchors:
//   bec                → Business Email Compromise  (R.3, R.20)
//   ransomware_payment → Ransomware + crypto extortion payment (R.15, R.3)
//   crypto_fraud       → Rug pull / exchange fraud / Ponzi / fake ICO (R.15)
//   state_cyber_theft  → APT / Lazarus-type state-sponsored theft (R.7, R.11)
//   social_engineering → SIM-swap / vishing / deepfake fraud (R.3)
//   phishing_wire_fraud→ Credential phish + wire fraud (R.3)

export type CybercrimeLabelId =
  | 'bec'
  | 'ransomware_payment'
  | 'crypto_fraud'
  | 'state_cyber_theft'
  | 'social_engineering'
  | 'phishing_wire_fraud';

export interface CybercrimeLabel {
  id: CybercrimeLabelId;
  confidence: number;          // 0..1
  fatfR15Relevant: boolean;
  keywords: string[];          // matched keywords
}

export interface CybercrimeClassification {
  labels: CybercrimeLabel[];
  hasAnyLabel: boolean;
  fatfR15Flag: boolean;
}

interface LabelDef {
  id: CybercrimeLabelId;
  keywords: string[];
  fatfR15Relevant: boolean;
}

const LABEL_DEFS: LabelDef[] = [
  {
    id: 'bec',
    fatfR15Relevant: false,
    keywords: [
      'business email compromise', 'BEC', 'CEO fraud', 'invoice fraud',
      'payment redirection', 'impersonation email', 'wire transfer fraud',
      'executive fraud', 'vendor email compromise', 'VEC',
      'social engineering wire', 'payment diversion', 'authorised push payment',
      'APP fraud', 'false billing', 'overpayment scam',
    ],
  },
  {
    id: 'ransomware_payment',
    fatfR15Relevant: true,
    keywords: [
      'ransomware', 'ransom payment', 'crypto ransom', 'bitcoin ransom',
      'decryption key', 'extortion payment', 'LockBit', 'REvil', 'BlackCat',
      'ALPHV', 'Cl0p', 'Conti', 'DarkSide', 'BlackMatter', 'Hive',
      'double extortion', 'data leak ransom', 'crypto extortion',
      'Akira ransomware', 'Play ransomware', 'ransomware-as-a-service',
    ],
  },
  {
    id: 'crypto_fraud',
    fatfR15Relevant: true,
    keywords: [
      'rug pull', 'exit scam', 'crypto fraud', 'cryptocurrency fraud',
      'fake ICO', 'initial coin offering fraud', 'crypto Ponzi', 'pig butchering',
      'investment fraud crypto', 'DeFi exploit', 'flash loan attack',
      'exchange hack', 'crypto exchange collapse', 'NFT fraud',
      'wash trading crypto', 'pump and dump crypto', 'virtual asset fraud',
      'stablecoin fraud', 'crypto mixer', 'mixing service',
      'money laundering crypto', 'VASP violation', 'unregistered exchange',
    ],
  },
  {
    id: 'state_cyber_theft',
    fatfR15Relevant: true,
    keywords: [
      'state-sponsored', 'nation-state', 'APT', 'advanced persistent threat',
      'Lazarus Group', 'North Korea hack', 'DPRK cyber', 'Kimsuky',
      'Russian hackers', 'GRU hackers', 'SVR hackers', 'FSB cyber',
      'Chinese APT', 'Iranian hackers', 'Equation Group',
      'cyber espionage financial', 'theft of funds state',
      'sanctioned hackers', 'OFAC cyber sanction', 'state-directed theft',
      'Scattered Spider', 'Volt Typhoon',
    ],
  },
  {
    id: 'social_engineering',
    fatfR15Relevant: false,
    keywords: [
      'SIM swap', 'SIM hijacking', 'vishing', 'smishing',
      'voice phishing', 'deepfake fraud', 'AI voice fraud',
      'social engineering', 'pretexting', 'account takeover',
      'OTP fraud', 'MFA bypass fraud', 'identity impersonation',
      'romance scam', 'pig-butchering', 'authorised push payment',
      'APP scam', 'tech support scam', 'grandparent scam',
    ],
  },
  {
    id: 'phishing_wire_fraud',
    fatfR15Relevant: false,
    keywords: [
      'phishing', 'credential theft', 'spear phishing', 'whaling',
      'wire fraud', 'phish wire', 'email fraud bank', 'credential phishing',
      'SWIFT fraud', 'SWIFT hack', 'Bangladesh Bank hack',
      'correspondent bank fraud', 'online banking fraud',
      'credential stuffing', 'account takeover banking',
      'man-in-the-browser', 'keylogger banking',
    ],
  },
];

const CONFIDENCE_PER_KEYWORD = 0.18;
const MIN_CONFIDENCE = 0.40;

function scoreText(
  text: string,
  keywords: string[],
): { score: number; matched: string[] } {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) matched.push(kw);
  }
  return { score: Math.min(1, matched.length * CONFIDENCE_PER_KEYWORD), matched };
}

/** Multi-label classify a news article by cyber-financial crime type.
 *  Never throws — returns { labels: [], hasAnyLabel: false } on empty input. */
export function classifyCybercrime(text: string): CybercrimeClassification {
  if (!text) return { labels: [], hasAnyLabel: false, fatfR15Flag: false };

  const labels: CybercrimeLabel[] = [];
  let fatfR15Flag = false;

  for (const def of LABEL_DEFS) {
    const { score, matched } = scoreText(text, def.keywords);
    if (score >= MIN_CONFIDENCE) {
      labels.push({ id: def.id, confidence: score, fatfR15Relevant: def.fatfR15Relevant, keywords: matched });
      if (def.fatfR15Relevant) fatfR15Flag = true;
    }
  }

  return { labels, hasAnyLabel: labels.length > 0, fatfR15Flag };
}
