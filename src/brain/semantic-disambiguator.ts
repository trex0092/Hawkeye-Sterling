// Hawkeye Sterling — Semantic Context-Vector Disambiguation (Wave 14 Feature 5).
// Upgrades entity disambiguation from phonetic/ID matching to semantic context
// vectors using TF-IDF over occupation + 1-hot sector/geography.
// Reduces false positives on high-frequency Arabic and South Asian names.
// FATF R.10 / bias-monitor biasRatio improvement.

import { isCahra } from './cahra.js';

export interface SemanticProfile {
  name: string;
  occupation?: string;
  businessType?: string;
  businessSector?: string;
  jurisdiction?: string;
  nationality?: string;
  knownAdverseCategories?: string[];
}

export type DisambiguationVerdict = 'confirmed_false_positive' | 'likely_true_match' | 'requires_llm_review';

export interface SemanticHit {
  semanticScore: number;
  semanticVerdict: DisambiguationVerdict;
}

// Simplified IDF weights for occupation tokens (higher = more discriminating)
const OCCUPATION_IDF: Record<string, number> = {
  gold: 2.1, precious: 2.0, dealer: 1.8, metals: 2.0, jeweller: 2.2,
  trader: 1.5, broker: 1.6, executive: 1.2, director: 1.1, manager: 0.9,
  arms: 3.5, weapons: 3.5, military: 2.8, petroleum: 2.3, oil: 2.1,
  finance: 1.4, banking: 1.3, investment: 1.3, real: 1.0, estate: 1.0,
  construction: 1.1, engineering: 1.2, technology: 1.0, software: 1.0,
  politician: 2.5, minister: 2.6, official: 2.0, government: 2.2, senator: 2.8,
  judge: 2.4, prosecutor: 2.5, police: 2.1, military: 2.8, army: 2.7,
};

const FATF_SECTORS = [
  'dpms', 'real_estate', 'vasp', 'banking', 'insurance', 'legal', 'accounting',
  'trust_company', 'casino', 'art_market', 'npo', 'correspondent', 'trade_finance',
  'shipping', 'aviation', 'energy', 'pharmaceutical', 'food', 'manufacturing', 'other',
] as const;

const ADVERSE_CATEGORIES = [
  'financial_crime', 'corruption', 'terrorism', 'sanctions', 'fraud', 'drug_trafficking',
  'human_trafficking', 'organized_crime', 'tax_evasion', 'money_laundering',
  'market_manipulation', 'bribery', 'cybercrime', 'environmental_crime', 'proliferation',
] as const;

// Vector dimensions: occupation(50) + sector(20) + geography(2) + adverse(15) = 87 dims
const DIM_OCCUPATION = 50;
const DIM_SECTOR = FATF_SECTORS.length;   // 20
const DIM_GEO = 2;
const DIM_ADVERSE = ADVERSE_CATEGORIES.length;  // 15
export const VECTOR_DIM = DIM_OCCUPATION + DIM_SECTOR + DIM_GEO + DIM_ADVERSE;

function tokenise(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
}

function l2Normalise(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm < 1e-9 ? v : v.map((x) => x / norm);
}

// Simple hashing to map occupation tokens into 50-dim space
function hashToken(token: string, dim: number): number {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = ((h << 5) - h + token.charCodeAt(i)) | 0;
  return Math.abs(h) % dim;
}

function occupationVector(text: string): number[] {
  const v = new Array<number>(DIM_OCCUPATION).fill(0);
  for (const token of tokenise(text)) {
    const idx = hashToken(token, DIM_OCCUPATION);
    const idf = OCCUPATION_IDF[token] ?? 0.5;
    v[idx] = Math.min(1, (v[idx] ?? 0) + idf * 0.2);
  }
  return v;
}

function sectorVector(sector?: string): number[] {
  const v = new Array<number>(DIM_SECTOR).fill(0);
  const idx = FATF_SECTORS.indexOf((sector?.toLowerCase() ?? '') as typeof FATF_SECTORS[number]);
  if (idx >= 0) v[idx] = 1;
  return v;
}

function geoVector(jurisdiction?: string): number[] {
  const j = (jurisdiction ?? '').toUpperCase();
  const cahraFlag = isCahra(j) ? 1.0 : 0.0;
  // Simplified: use hash of jurisdiction ISO to get a 0..1 risk proxy
  const riskProxy = j.length >= 2 ? ((j.charCodeAt(0) + j.charCodeAt(1)) % 10) / 10 : 0.5;
  return [riskProxy, cahraFlag];
}

function adverseVector(categories?: string[]): number[] {
  const v = new Array<number>(DIM_ADVERSE).fill(0);
  if (!categories) return v;
  for (const cat of categories) {
    const idx = ADVERSE_CATEGORIES.indexOf(cat as typeof ADVERSE_CATEGORIES[number]);
    if (idx >= 0) v[idx] = 1;
  }
  return v;
}

export function buildContextVector(profile: SemanticProfile): number[] {
  const occupationText = [profile.occupation, profile.businessType].filter(Boolean).join(' ');
  const raw = [
    ...occupationVector(occupationText),
    ...sectorVector(profile.businessSector),
    ...geoVector(profile.jurisdiction ?? profile.nationality),
    ...adverseVector(profile.knownAdverseCategories),
  ];
  return l2Normalise(raw);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return Math.max(0, Math.min(1, dot)); // vectors are already L2-normalised
}

const FALSE_POSITIVE_THRESHOLD = 0.15;
const LIKELY_MATCH_THRESHOLD = 0.75;

export function semanticDisambiguate<T extends SemanticProfile>(
  subject: T,
  hits: T[],
): Array<T & SemanticHit> {
  const subjectVec = buildContextVector(subject);
  return hits
    .map((hit) => {
      const hitVec = buildContextVector(hit);
      const score = cosineSimilarity(subjectVec, hitVec);
      const semanticVerdict: DisambiguationVerdict =
        score < FALSE_POSITIVE_THRESHOLD ? 'confirmed_false_positive'
          : score > LIKELY_MATCH_THRESHOLD ? 'likely_true_match'
            : 'requires_llm_review';
      return { ...hit, semanticScore: score, semanticVerdict };
    })
    .sort((a, b) => b.semanticScore - a.semanticScore);
}
