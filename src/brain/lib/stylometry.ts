// Hawkeye Sterling — stylometry & linguistic forensics.
// Hedging, passive voice, obfuscation, minimisation, code-word patterns —
// deception indicators derived from forensic-linguistics literature (CBCA, SCAN,
// Pennebaker LIWC-style markers).

const HEDGES = [
  'perhaps', 'maybe', 'possibly', 'might', 'could', 'may', 'seems', 'seemed',
  'appears', 'appeared', 'reportedly', 'allegedly', 'supposedly', 'arguably',
  'to some extent', 'to an extent', 'more or less', 'kind of', 'sort of',
  'i think', 'i believe', 'i guess', 'i suppose', 'it is possible that',
  'as far as i know', 'to the best of my knowledge', 'not entirely sure',
  'somewhat', 'rather', 'essentially', 'basically', 'effectively',
  'generally speaking', 'in a sense', 'probably', 'likely',
];

const MINIMISERS = [
  'just', 'only', 'merely', 'simply', 'a bit', 'a little', 'a few',
  'not really', 'not exactly', 'not quite', 'hardly', 'barely',
  'nothing more than', 'at worst', 'at most',
];

const DISTANCING = [
  'that person', 'the individual', 'the party', 'the entity', 'the company',
  'they', 'them', 'those people', 'that organisation', 'the said',
];

const QUALIFIERS = [
  'technically', 'literally', 'in theory', 'in principle', 'on paper',
  'strictly speaking', 'for all intents and purposes',
];

const CODE_WORDS = [
  // Illicit-finance slang / euphemisms frequently observed in FIU reporting.
  'consultancy fee', 'facilitation fee', 'success fee', 'introduction fee',
  'marketing services', 'advisory services', 'commission', 'bonus payment',
  'loan back', 'round trip', 'gift', 'donation', 'sponsorship',
  'office supplies', 'miscellaneous expenses', 'sundry', 'entertainment',
  'no paperwork', 'off the books', 'cash only', 'private arrangement',
  'special consideration', 'goodwill payment',
];

function countOccurrences(haystack: string, needles: string[]): { total: number; hit: string[] } {
  const lc = haystack.toLowerCase();
  let total = 0; const hit: string[] = [];
  for (const n of needles) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${esc}\\b`, 'g');
    const m = lc.match(re);
    if (m && m.length > 0) { total += m.length; hit.push(n); }
  }
  return { total, hit };
}

function wordCount(text: string): number {
  const m = text.match(/\p{L}+/gu);
  return m ? m.length : 0;
}

// Passive-voice estimator (English heuristic).
function passiveVoiceCount(text: string): number {
  const re = /\b(?:is|are|was|were|be|been|being|am|got|gets|getting)\s+(?:not\s+)?(?:\w+ly\s+)?(\w+ed|\w+en|born|done|made|gone|seen|taken|given|paid|said|told|known|shown)\b/gi;
  const m = text.match(re);
  return m ? m.length : 0;
}

// Agentless construction count: passive without "by X".
function agentlessCount(text: string): number {
  const sentences = text.split(/[.!?]+/);
  let count = 0;
  for (const s of sentences) {
    if (/\b(?:is|are|was|were|be|been|being)\s+\w+(?:ed|en)\b/.test(s) && !/\bby\s+\w+/.test(s)) count++;
  }
  return count;
}

export interface StylometryReport {
  words: number;
  hedgingCount: number;
  hedgingRate: number;
  minimisingCount: number;
  minimisingRate: number;
  distancingCount: number;
  qualifierCount: number;
  passiveCount: number;
  passiveRate: number;
  agentlessCount: number;
  codeWordsHit: string[];
  deceptionScore: number;  // 0..1 composite
  obfuscationScore: number; // 0..1 composite
  flags: string[];
}

export function analyseText(raw: string): StylometryReport {
  const text = raw ?? '';
  const words = Math.max(1, wordCount(text));
  const hedges = countOccurrences(text, HEDGES);
  const mins = countOccurrences(text, MINIMISERS);
  const dists = countOccurrences(text, DISTANCING);
  const quals = countOccurrences(text, QUALIFIERS);
  const codes = countOccurrences(text, CODE_WORDS);
  const passive = passiveVoiceCount(text);
  const agentless = agentlessCount(text);

  const hedgingRate = hedges.total / words;
  const minimisingRate = mins.total / words;
  const passiveRate = passive / words;

  const flags: string[] = [];
  if (hedgingRate > 0.02) flags.push(`elevated hedging (${(hedgingRate * 100).toFixed(2)}%)`);
  if (minimisingRate > 0.015) flags.push(`minimisation language (${(minimisingRate * 100).toFixed(2)}%)`);
  if (passiveRate > 0.03) flags.push(`passive voice density (${(passiveRate * 100).toFixed(2)}%)`);
  if (agentless > 2) flags.push(`${agentless} agentless constructions`);
  if (dists.total > 3) flags.push(`distancing pronouns × ${dists.total}`);
  if (quals.total > 2) flags.push(`technical-qualifier density × ${quals.total}`);
  if (codes.hit.length > 0) flags.push(`code-word hits: ${codes.hit.slice(0, 5).join(', ')}`);

  const deceptionScore = Math.min(1,
    0.25 * Math.min(1, hedgingRate * 30) +
    0.2 * Math.min(1, minimisingRate * 40) +
    0.15 * Math.min(1, passiveRate * 20) +
    0.15 * Math.min(1, agentless / 5) +
    0.15 * Math.min(1, dists.total / 5) +
    0.10 * Math.min(1, quals.total / 3),
  );
  const obfuscationScore = Math.min(1,
    0.4 * Math.min(1, passiveRate * 20) +
    0.3 * Math.min(1, agentless / 5) +
    0.3 * Math.min(1, quals.total / 3),
  );

  return {
    words,
    hedgingCount: hedges.total, hedgingRate,
    minimisingCount: mins.total, minimisingRate,
    distancingCount: dists.total,
    qualifierCount: quals.total,
    passiveCount: passive, passiveRate,
    agentlessCount: agentless,
    codeWordsHit: codes.hit,
    deceptionScore,
    obfuscationScore,
    flags,
  };
}

// Gaslighting / reality-denial cues (distinct pattern set — first-person reality-
// reassertion over the addressee's stated memory).
const GASLIGHTING_PHRASES = [
  'you\'re imagining', 'you imagined', 'you\'re overreacting', 'overreacting',
  'that never happened', 'you\'re remembering it wrong', 'you\'re being paranoid',
  'you\'re being hysterical', 'you\'re too sensitive', 'calm down',
  'stop making things up', 'you\'re confused', 'that\'s not what i said',
  'i never said that', 'you\'re twisting my words',
];
export function gaslightingScore(raw: string): { score: number; hits: string[] } {
  const { total, hit } = countOccurrences(raw ?? '', GASLIGHTING_PHRASES);
  return { score: Math.min(1, total / 3), hits: hit };
}

export function freeTextFromEvidence(ev: unknown): string {
  const out: string[] = [];
  if (!ev || typeof ev !== 'object') return '';
  const evAny = ev as Record<string, unknown>;
  if (typeof evAny.freeText === 'string') out.push(evAny.freeText);
  for (const k of ['documents', 'adverseMedia', 'sanctionsHits', 'pepHits']) {
    const arr = evAny[k];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === 'string') out.push(item);
      else if (item && typeof item === 'object') {
        for (const f of ['title', 'summary', 'text', 'body', 'content', 'snippet', 'description', 'rationale']) {
          const v = (item as Record<string, unknown>)[f];
          if (typeof v === 'string') out.push(v);
        }
      }
    }
  }
  return out.join('\n\n');
}
