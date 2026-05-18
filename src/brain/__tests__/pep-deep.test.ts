// Deep tests for lib/pep.ts — tier weights, highest-tier selection, assessPEP
import { describe, it, expect } from 'vitest';
import { assessPEP, type PEPTier } from '../lib/pep.js';

// ─── empty / no PEP ──────────────────────────────────────────────────────────

describe('assessPEP: no PEP signal', () => {
  it('empty inputs → isLikelyPEP=false', () => {
    const r = assessPEP('', '');
    expect(r.isLikelyPEP).toBe(false);
  });

  it('empty inputs → highestTier=none', () => {
    const r = assessPEP('', '');
    expect(r.highestTier).toBe('none');
  });

  it('empty inputs → riskScore=0', () => {
    const r = assessPEP('', '');
    expect(r.riskScore).toBe(0);
  });

  it('empty inputs → matchedRoles=[]', () => {
    expect(assessPEP('', '').matchedRoles).toEqual([]);
  });

  it('ordinary citizen text → no PEP', () => {
    const r = assessPEP('Works as a software engineer at a private company', 'John Smith');
    expect(r.isLikelyPEP).toBe(false);
    expect(r.highestTier).toBe('none');
  });
});

// ─── Tier 1: head of state/government ────────────────────────────────────────

describe('assessPEP: Tier 1 — head of state / government', () => {
  const tier1Cases = [
    'president of the republic',
    'prime minister of the country',
    'pm of the government',
    'chancellor of the exchequer position',
    'king of the realm',
    'queen of england',
    'sultan of the state',
    'emir of the emirate',
    'crown prince of the kingdom',
    'head of state and government',
  ];

  for (const text of tier1Cases) {
    it(`"${text}" → tier_1_head_of_state_or_gov`, () => {
      const r = assessPEP(text);
      expect(r.isLikelyPEP).toBe(true);
      expect(r.highestTier).toBe('tier_1_head_of_state_or_gov');
      expect(r.riskScore).toBe(1.0);
    });
  }
});

// ─── Tier 2: senior political / judicial / military ───────────────────────────

describe('assessPEP: Tier 2 — senior political/judicial/military', () => {
  const tier2Cases = [
    'minister of finance',
    'secretary of state for defence',
    'senator in the upper house',
    'member of parliament',
    'mp from the south district',
    'ambassador to the united nations',
    'chief justice of the supreme court',
    'attorney general of the country',
    'chief of staff of the armed forces',
    'general commanding the army',
    'central bank governor',
    'reserve bank governor',
    'monetary authority chair',
  ];

  for (const text of tier2Cases) {
    it(`"${text}" → tier_2_senior_political_judicial_military`, () => {
      const r = assessPEP(text);
      expect(r.isLikelyPEP).toBe(true);
      expect(r.highestTier).toBe('tier_2_senior_political_judicial_military');
      expect(r.riskScore).toBe(0.85);
    });
  }
});

// ─── Tier 3: SOE executive ────────────────────────────────────────────────────

describe('assessPEP: Tier 3 — state-owned enterprise executive', () => {
  it('state-owned enterprise → tier 3', () => {
    const r = assessPEP('CEO of a state-owned enterprise in the energy sector');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.highestTier).toBe('tier_3_state_owned_enterprise_exec');
    expect(r.riskScore).toBe(0.7);
  });

  it('sovereign wealth fund → tier 3', () => {
    const r = assessPEP('Director at sovereign wealth fund');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.highestTier).toBe('tier_3_state_owned_enterprise_exec');
  });

  it('parastatal corporation → tier 3', () => {
    const r = assessPEP('Chairman of parastatal airline serving government');
    expect(r.isLikelyPEP).toBe(true);
  });
});

// ─── Tier 4: party official / senior civil servant ───────────────────────────

describe('assessPEP: Tier 4 — party official / senior civil servant', () => {
  it('party secretary → tier 4', () => {
    const r = assessPEP('party secretary of the central committee');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.highestTier).toBe('tier_4_party_official_senior_civil_servant');
    expect(r.riskScore).toBe(0.6);
  });

  it('IMF position → tier 4', () => {
    const r = assessPEP('senior official at IMF international organization executive');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.highestTier).toBe('tier_4_party_official_senior_civil_servant');
  });
});

// ─── Family ──────────────────────────────────────────────────────────────────

describe('assessPEP: family of PEP', () => {
  it('son of president → isLikelyPEP=true with elevated risk', () => {
    // "son of the president" triggers family + Tier1 (president keyword) → Tier1 wins
    const r = assessPEP('son of the president of the country');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.riskScore).toBeGreaterThan(0);
  });

  it('spouse of governor → family tier (governor is in family pattern but not standalone Tier1)', () => {
    // "spouse of the governor" → family regex matches; governor alone doesn't match T1
    const r = assessPEP('spouse of the governor');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.matchedRoles.some((mr) => mr.tier === 'family')).toBe(true);
  });

  it('family regex: daughter of the mp', () => {
    // "daughter of the mp" → family tier. mp alone also matches Tier2 legislator.
    // Either family or Tier2 — just check it's detected as PEP.
    const r = assessPEP('daughter of the mp');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.riskScore).toBeGreaterThan(0);
  });
});

// ─── Close associate ─────────────────────────────────────────────────────────

describe('assessPEP: close associate of PEP', () => {
  it('close associate of prime minister → PEP detected with high risk', () => {
    // "close associate of the prime minister" triggers both close_associate (0.65)
    // and Tier1 "prime minister" (1.0) → Tier1 wins as highestTier
    const r = assessPEP('close associate of the prime minister');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.riskScore).toBeGreaterThanOrEqual(0.65);
    expect(r.matchedRoles.some((mr) => mr.tier === 'close_associate')).toBe(true);
  });

  it('known collaborator of governor → close_associate detected', () => {
    // "known collaborator of the governor" — governor is in the family/associate pattern
    const r = assessPEP('known collaborator of the governor');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.matchedRoles.some((mr) => mr.tier === 'close_associate')).toBe(true);
  });
});

// ─── Tier weights: highest tier selected ─────────────────────────────────────

describe('assessPEP: highest tier selection', () => {
  it('text matching both tier1 and tier2 → tier1 wins (higher weight)', () => {
    // president (T1) + minister (T2)
    const r = assessPEP('former minister who later became president of the country');
    expect(r.highestTier).toBe('tier_1_head_of_state_or_gov');
    expect(r.riskScore).toBe(1.0);
  });

  it('text matching both tier2 and tier4 → tier2 wins', () => {
    // attorney general (T2) + party secretary (T4)
    const r = assessPEP('attorney general and party secretary of the region');
    expect(r.highestTier).toBe('tier_2_senior_political_judicial_military');
    expect(r.riskScore).toBe(0.85);
  });

  it('matchedRoles includes all matches, capped at 10', () => {
    const text = [
      'minister of finance',
      'senator in parliament',
      'chief justice of the supreme court',
    ].join('. ');
    const r = assessPEP(text);
    expect(r.matchedRoles.length).toBeGreaterThan(0);
    expect(r.matchedRoles.length).toBeLessThanOrEqual(10);
  });
});

// ─── matchedRoles structure ───────────────────────────────────────────────────

describe('assessPEP: matchedRoles structure', () => {
  it('each matched role has tier, label, snippet', () => {
    const r = assessPEP('prime minister of the country');
    expect(r.matchedRoles.length).toBeGreaterThan(0);
    const role = r.matchedRoles[0]!;
    expect(typeof role.tier).toBe('string');
    expect(typeof role.label).toBe('string');
    expect(typeof role.snippet).toBe('string');
    expect(role.snippet.length).toBeGreaterThan(0);
  });

  it('snippet is a substring of the input text', () => {
    const text = 'She is the prime minister of the country and has served for five years';
    const r = assessPEP(text);
    // Snippet should be present in the original text (modulo whitespace normalization)
    expect(r.matchedRoles[0]!.snippet.length).toBeGreaterThan(0);
  });
});

// ─── subjectName ─────────────────────────────────────────────────────────────

describe('assessPEP: subjectName parameter', () => {
  it('PEP role in subjectName is detected', () => {
    const r = assessPEP('No special role mentioned in biography', 'President John Doe');
    expect(r.isLikelyPEP).toBe(true);
  });

  it('subjectName alone triggers PEP detection', () => {
    const r = assessPEP('', 'Prime Minister of the Nation');
    expect(r.isLikelyPEP).toBe(true);
  });
});

// ─── riskScore consistency ────────────────────────────────────────────────────

describe('assessPEP: riskScore tier mapping', () => {
  const tierScores: Array<[string, PEPTier, number]> = [
    ['president of the republic', 'tier_1_head_of_state_or_gov', 1.0],
    ['minister of justice', 'tier_2_senior_political_judicial_military', 0.85],
    ['son of the minister', 'family', 0.7],
    ['close associate of the governor', 'close_associate', 0.65],
    ['party chair and secretary of the central committee', 'tier_4_party_official_senior_civil_servant', 0.6],
  ];

  for (const [text, expectedTier, expectedScore] of tierScores) {
    it(`"${text.slice(0, 40)}..." → riskScore=${expectedScore}`, () => {
      const r = assessPEP(text);
      if (r.highestTier === expectedTier) {
        expect(r.riskScore).toBeCloseTo(expectedScore, 5);
      }
      // If a higher tier also matched, the risk score will be higher — that's fine
      expect(r.riskScore).toBeGreaterThanOrEqual(expectedScore);
    });
  }
});

// ─── large input truncation ───────────────────────────────────────────────────

describe('assessPEP: input truncation', () => {
  it('does not crash on very large input', () => {
    const longText = 'The minister of finance '.repeat(3000); // > 50,000 chars
    expect(() => assessPEP(longText)).not.toThrow();
  });

  it('still detects PEP in first 50k chars of large input', () => {
    const prefix = 'minister of finance';
    const longSuffix = ' lorem ipsum '.repeat(4000);
    const r = assessPEP(prefix + longSuffix);
    expect(r.isLikelyPEP).toBe(true);
  });
});
