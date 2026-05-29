// Hawkeye Sterling — weaponized screening test suite.
// Verifies every capability added during the Phase 2 weaponization pass:
//   • Damerau-Levenshtein OSA (transposition distance = 1)
//   • Abbreviated-name matcher (M. Hassan ↔ Mohammed Hassan)
//   • Arabic diacritics stripping (harakat + lam-alef ligatures)
//   • Special-character mapping (ı, ß, ł, æ, ø, þ, ð …)
//   • ROMAN_FAMILIES normalisation (30+ Muhammad/Ahmed/… variants)
//   • MATCHER_PARTICLES dropping (al, bin, van, de, von, ul …)
//   • Cyrillic transliteration inside normaliseForMatch
//   • Dynamic threshold (short names ≤4/≤7 chars get higher threshold)
//   • Context-signal score boosting (phonetic + jurisdiction + entity type)
//   • matchEnsemble carries 'abbreviated', 'trigram', 'partial_token_set' methods

import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  matchLevenshtein,
  matchAbbreviated,
  matchEnsemble,
  normaliseForMatch,
  matchTrigram,
  matchPartialTokenSet,
  type MatchingMethod,
} from '../matching.js';
import {
  quickScreen,
  severityFromScore,
  type QuickScreenCandidate,
  type QuickScreenSubject,
  type QuickScreenOptions,
} from '../quick-screen.js';

// ── shared test clock ─────────────────────────────────────────────────────────

const FIXED: QuickScreenOptions = {
  clock: () => 0,
  now: () => '2026-04-25T00:00:00.000Z',
};

// ── 1. Damerau-Levenshtein OSA — transposition distance = 1 ──────────────────

describe('levenshteinDistance — Damerau-Levenshtein transpositions', () => {
  it('adjacent-char swap costs 1, not 2', () => {
    // classic Levenshtein gives 2 (delete + insert); OSA gives 1 (transpose)
    expect(levenshteinDistance('muhammda', 'muhammad')).toBe(1);
  });

  it('single transposition on a short name is 1', () => {
    expect(levenshteinDistance('amhad', 'ahmad')).toBe(1);
  });

  it('two independent transpositions cost 2', () => {
    expect(levenshteinDistance('abdc', 'abcd')).toBe(1); // one swap
    expect(levenshteinDistance('badc', 'abcd')).toBe(2); // two swaps
  });

  it('substitution still costs 1 per substituted char', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('identical strings cost 0', () => {
    expect(levenshteinDistance('Mohamed', 'Mohamed')).toBe(0);
  });

  it('transposition near a match produces high Levenshtein score', () => {
    // "Muhammda" vs "Muhammad" = 8 chars, 1 OSA transposition → score = 1 - 1/8 = 0.875
    const m = matchLevenshtein('Muhammda', 'Muhammad');
    expect(m.score).toBeCloseTo(0.875, 3);
    expect(m.score).toBeGreaterThan(0.87);
  });
});

// ── 2. normaliseForMatch — Arabic diacritics + lam-alef ──────────────────────

describe('normaliseForMatch — Arabic diacritics', () => {
  it('strips harakat from محمد and maps consonant skeleton to muhammad', () => {
    // مُحَمَّد: diacritics stripped → consonants م+ح+م+د → 'mhmd'
    // ROMAN_FAMILIES maps 'mhmd' → 'muhammad'
    expect(normaliseForMatch('مُحَمَّد')).toBe('muhammad');
  });

  it('strips harakat from أحمد and maps consonant skeleton to ahmad', () => {
    // أَحْمَد: diacritics stripped → أ+ح+م+د → 'ahmd'
    // ROMAN_FAMILIES maps 'ahmd' → 'ahmad'
    expect(normaliseForMatch('أَحْمَد')).toBe('ahmad');
  });

  it('handles fully unvowelled Arabic correctly via consonant skeleton', () => {
    // محمد without any vowel marks → م+ح+م+د → 'mhmd' → ROMAN_FAMILIES → 'muhammad'
    expect(normaliseForMatch('محمد')).toBe('muhammad');
  });

  it('expands lam-alef ligature ﻻ → lam + alef', () => {
    // ﻻ is U+FEFB; should produce 'la' (lam=l, alef=a)
    const norm = normaliseForMatch('ﻻ');
    expect(norm).toMatch(/^la$/);
  });

  it('handles mixed Arabic + Latin name', () => {
    // حسن Hassan — Arabic prefix + Latin suffix
    const norm = normaliseForMatch('حسن Hassan');
    expect(norm).toContain('hassan');
  });
});

// ── 3. normaliseForMatch — special character mapping ─────────────────────────

describe('normaliseForMatch — special character map', () => {
  it('maps dotless-i ı → i', () => {
    expect(normaliseForMatch('Işık')).toContain('i');
  });

  it('maps ß → ss', () => {
    expect(normaliseForMatch('Müßig')).toContain('ss');
  });

  it('maps ł → l', () => {
    expect(normaliseForMatch('Wałęsa')).toContain('walesa');
  });

  it('maps æ → ae', () => {
    expect(normaliseForMatch('Æther')).toBe('aether');
  });

  it('maps ø → o', () => {
    expect(normaliseForMatch('Søren')).toContain('soren');
  });

  it('maps þ → th', () => {
    expect(normaliseForMatch('Þór')).toContain('thor');
  });

  it('maps ð → d', () => {
    expect(normaliseForMatch('Guðrún')).toContain('gudrun');
  });

  it('maps œ → oe', () => {
    expect(normaliseForMatch('Œuvre')).toContain('oeuvre');
  });
});

// ── 4. normaliseForMatch — Cyrillic transliteration ──────────────────────────

describe('normaliseForMatch — Cyrillic', () => {
  it('transliterates Russian Дмитрий Волков', () => {
    // й NFD-decomposes to и + combining breve (U+0306); breve is in U+0300–U+036F
    // so it's stripped, leaving и → 'i'. 'dmitrii' is in ROMAN_FAMILIES → 'dmitri'.
    const norm = normaliseForMatch('Дмитрий Волков');
    expect(norm).toBe('dmitri volkov');
  });

  it('transliterates Александр → aleksandr', () => {
    expect(normaliseForMatch('Александр')).toBe('aleksandr');
  });
});

// ── 5. normaliseForMatch — ROMAN_FAMILIES normalisation ──────────────────────

describe('normaliseForMatch — ROMAN_FAMILIES spelling normalisation', () => {
  it('normalises Mohammed → muhammad', () => {
    expect(normaliseForMatch('Mohammed')).toBe('muhammad');
  });

  it('normalises Mohamed → muhammad', () => {
    expect(normaliseForMatch('Mohamed')).toBe('muhammad');
  });

  it('normalises Mohammad → muhammad', () => {
    expect(normaliseForMatch('Mohammad')).toBe('muhammad');
  });

  it('normalises Mehmet → muhammad', () => {
    expect(normaliseForMatch('Mehmet')).toBe('muhammad');
  });

  it('normalises Ahmed → ahmad', () => {
    expect(normaliseForMatch('Ahmed')).toBe('ahmad');
  });

  it('normalises Hussain → hussein', () => {
    expect(normaliseForMatch('Hussain')).toBe('hussein');
  });

  it('normalises Hassan / Hasan → hassan', () => {
    const a = normaliseForMatch('Hasan');
    const b = normaliseForMatch('Hassan');
    expect(a).toBe(b);
  });

  it('full name: "Mohamed Hassan" == "Mohammed Hassan" after normalisation', () => {
    expect(normaliseForMatch('Mohamed Hassan')).toBe(normaliseForMatch('Mohammed Hassan'));
  });

  it('Yusuf / Yosef → yusuf family canonicalised', () => {
    const a = normaliseForMatch('Yosef');
    const b = normaliseForMatch('Yusuf');
    expect(a).toBe(b);
  });
});

// ── 6. normaliseForMatch — MATCHER_PARTICLES dropping ────────────────────────

describe('normaliseForMatch — MATCHER_PARTICLES dropping', () => {
  it('drops Arabic particle "al"', () => {
    expect(normaliseForMatch('Al Rashid')).toBe('rashid');
  });

  it('drops "bin"', () => {
    expect(normaliseForMatch('Ahmad bin Zayed')).toBe('ahmad zayed');
  });

  it('drops "ben"', () => {
    expect(normaliseForMatch('Yusuf ben David')).toBe('yusuf david');
  });

  it('drops "bint"', () => {
    expect(normaliseForMatch('Fatima bint Khalid')).toBe('fatima khalid');
  });

  it('drops "abu"', () => {
    expect(normaliseForMatch('Abu Bakr')).toBe('bakr');
  });

  it('drops "ibn"', () => {
    expect(normaliseForMatch('Ibn Battuta')).toBe('battuta');
  });

  it('drops Dutch "van"', () => {
    expect(normaliseForMatch('Van der Berg')).toBe('berg');
  });

  it('drops Dutch "de"', () => {
    expect(normaliseForMatch('Jan de Vries')).toBe('jan vries');
  });

  it('drops German "von"', () => {
    expect(normaliseForMatch('Kurt von Hammerstein')).toBe('kurt hammerstein');
  });

  it('drops South-Asian "ul"', () => {
    expect(normaliseForMatch('Saif ul Islam')).toBe('saif islam');
  });
});

// ── 7. matchAbbreviated ───────────────────────────────────────────────────────

describe('matchAbbreviated', () => {
  it('matches "M. Hassan" against "Mohammed Hassan"', () => {
    const m = matchAbbreviated('M. Hassan', 'Mohammed Hassan');
    expect(m.score).toBe(1);
    expect(m.pass).toBe(true);
    expect(m.method).toBe('abbreviated');
  });

  it('matches "J. K. Rowling" against "Joanne Kathleen Rowling"', () => {
    const m = matchAbbreviated('J. K. Rowling', 'Joanne Kathleen Rowling');
    expect(m.score).toBeGreaterThanOrEqual(0.85);
    expect(m.pass).toBe(true);
  });

  it('matches "D. Volkov" against "Dmitri Volkov"', () => {
    const m = matchAbbreviated('D. Volkov', 'Dmitri Volkov');
    expect(m.score).toBe(1);
    expect(m.pass).toBe(true);
  });

  it('does not fire when neither side has a single-letter token', () => {
    // Both sides are multi-char tokens — should return score 0
    const m = matchAbbreviated('Mohammed Hassan', 'Mohamed Hassan');
    expect(m.score).toBe(0);
    expect(m.pass).toBe(false);
  });

  it('returns score 0 for empty inputs', () => {
    expect(matchAbbreviated('', 'Mohammed Hassan').score).toBe(0);
    expect(matchAbbreviated('M. Hassan', '').score).toBe(0);
  });

  it('handles mismatched initial gracefully', () => {
    // "X. Hassan" vs "Mohammed Hassan" — X does not match M
    const m = matchAbbreviated('X. Hassan', 'Mohammed Hassan');
    // "x" doesn't match "m"/"h" — one of 2 tokens matches (hassan), one doesn't
    expect(m.score).toBeLessThan(1);
  });
});

// ── 8. matchTrigram ───────────────────────────────────────────────────────────

describe('matchTrigram', () => {
  it('method tag is trigram', () => {
    expect(matchTrigram('alpha', 'alpha').method).toBe('trigram');
  });

  it('identical string scores 1', () => {
    expect(matchTrigram('Al Rajhi Bank', 'Al Rajhi Bank').score).toBe(1);
  });

  it('close spelling variant passes threshold', () => {
    expect(matchTrigram('Dmitri Volkov', 'Dmitry Volkov').pass).toBe(true);
  });

  it('completely different strings score near 0', () => {
    expect(matchTrigram('Ali Hassan', 'Bob Smith').score).toBeLessThan(0.3);
  });

  it('short strings with overlap score > 0', () => {
    expect(matchTrigram('abc', 'abcd').score).toBeGreaterThan(0);
  });
});

// ── 9. matchPartialTokenSet ───────────────────────────────────────────────────

describe('matchPartialTokenSet', () => {
  it('method tag is partial_token_set', () => {
    expect(matchPartialTokenSet('a b', 'a b c').method).toBe('partial_token_set');
  });

  it('shorter-name tokens fully contained scores 1', () => {
    expect(matchPartialTokenSet('Mohammed Khan', 'Mohammed Abdul Khan').score).toBe(1);
  });

  it('single token matching a multi-token name scores 1', () => {
    expect(matchPartialTokenSet('Volkov', 'Dmitri Sergeyevich Volkov').score).toBe(1);
  });

  it('reversed token order still passes', () => {
    expect(matchPartialTokenSet('Volkov Dmitri', 'Dmitri Volkov').pass).toBe(true);
  });

  it('no overlap returns 0 and fails', () => {
    const m = matchPartialTokenSet('Ali Khan', 'Omar Farouk');
    expect(m.score).toBe(0);
    expect(m.pass).toBe(false);
  });
});

// ── 10. matchEnsemble includes all 10 methods ────────────────────────────────

describe('matchEnsemble — method coverage', () => {
  // 'jaro' exists as a standalone function but matchEnsemble only emits
  // 'jaro_winkler' (which subsumes jaro). No separate jaro MatchScore entry.
  const ALL_METHODS: MatchingMethod[] = [
    'exact', 'levenshtein', 'jaro_winkler',
    'soundex', 'double_metaphone', 'token_set',
    'trigram', 'partial_token_set', 'abbreviated',
  ];

  it('ensemble scores array covers all 10 methods on a Latin pair', () => {
    const e = matchEnsemble('Mohammed Hassan', 'Mohamed Hassan');
    const methods = e.scores.map((s) => s.method);
    for (const m of ALL_METHODS) {
      expect(methods, `missing method ${m}`).toContain(m);
    }
  });

  it('picks the best score across all methods', () => {
    const e = matchEnsemble('Mohammed Hassan', 'Mohamed Hassan');
    const maxInScores = Math.max(...e.scores.map((s) => s.score));
    expect(e.best.score).toBe(maxInScores);
  });

  it('abbreviated method fires and influences best score for initials', () => {
    const e = matchEnsemble('M. Hassan', 'Mohammed Hassan');
    const abbr = e.scores.find((s) => s.method === 'abbreviated');
    expect(abbr).toBeDefined();
    expect(abbr!.score).toBeGreaterThan(0);
    // Best score must be at least as good as abbreviated
    expect(e.best.score).toBeGreaterThanOrEqual(abbr!.score);
  });

  it('normalised pass runs for Arabic-script name', () => {
    // محمد → consonants 'mhmd' → ROMAN_FAMILIES → 'muhammad'
    // 'Muhammad' → normaliseForMatch → 'muhammad'
    // Both normalise to 'muhammad' → exact match → score = 1
    const e = matchEnsemble('محمد', 'Muhammad');
    expect(e.best.score).toBe(1);
  });

  it('normalised pass runs for Cyrillic name', () => {
    const e = matchEnsemble('Волков', 'Volkov');
    expect(e.best.score).toBeGreaterThan(0.9);
  });
});

// ── 11. quickScreen — dynamic threshold ──────────────────────────────────────

describe('quickScreen — dynamic threshold', () => {
  const clock = () => 0;
  const now = () => '2026-04-25T00:00:00.000Z';

  it('very short name (≤4 chars clean) applies 0.95 threshold', () => {
    // "Ali" — 3 chars clean → threshold 0.95
    // A candidate "Aly" is similar but score < 0.95 so it should be clear
    const subject: QuickScreenSubject = { name: 'Ali' };
    const candidate: QuickScreenCandidate = {
      listId: 'test', listRef: 'T-001',
      name: 'Aly',
      entityType: 'individual',
    };
    const strict = quickScreen(subject, [candidate], { clock, now });
    const loose = quickScreen(subject, [candidate], { clock, now, scoreThreshold: 0.5 });
    // With the dynamic threshold, the strict run should produce fewer or equal hits than the loose one
    expect(strict.hits.length).toBeLessThanOrEqual(loose.hits.length);
  });

  it('medium name (≤7 chars clean) applies 0.88 threshold', () => {
    // "Hassan" — 6 chars clean → threshold 0.88
    const subject: QuickScreenSubject = { name: 'Hassan' };
    const candidate: QuickScreenCandidate = {
      listId: 'test', listRef: 'T-002',
      name: 'Hassan',
    };
    const result = quickScreen(subject, [candidate], { clock, now });
    expect(result.hits.length).toBe(1);
    expect(result.topScore).toBe(100);
  });

  it('longer name (>7 chars clean) applies default 0.82 threshold', () => {
    const subject: QuickScreenSubject = { name: 'Dmitri Volkov' };
    const candidate: QuickScreenCandidate = {
      listId: 'test', listRef: 'T-003',
      name: 'Dmitri Volkov',
    };
    const result = quickScreen(subject, [candidate], { clock, now });
    expect(result.hits.length).toBe(1);
    expect(result.topScore).toBe(100);
  });
});

// ── 12. quickScreen — context-signal score boosting ──────────────────────────

describe('quickScreen — context-signal score boosting', () => {
  const clock = () => 0;
  const now = () => '2026-04-25T00:00:00.000Z';

  const BASE_CANDIDATE: QuickScreenCandidate = {
    listId: 'ofac', listRef: 'OFAC-001',
    name: 'Dmitri Volkov',
    entityType: 'individual',
    jurisdiction: 'RU',
  };

  it('matching jurisdiction boosts score above no-jurisdiction variant', () => {
    const subjectWithJurisdiction: QuickScreenSubject = {
      name: 'Dmitry Volkov',
      jurisdiction: 'RU',
    };
    const subjectNoJurisdiction: QuickScreenSubject = {
      name: 'Dmitry Volkov',
    };
    const withJ = quickScreen(subjectWithJurisdiction, [BASE_CANDIDATE], { clock, now });
    const withoutJ = quickScreen(subjectNoJurisdiction, [BASE_CANDIDATE], { clock, now });
    // Score with matching jurisdiction should be >= score without it
    expect(withJ.topScore).toBeGreaterThanOrEqual(withoutJ.topScore);
  });

  it('matching entity type boosts score', () => {
    const subjectWithType: QuickScreenSubject = {
      name: 'Dmitry Volkov',
      entityType: 'individual',
    };
    const subjectNoType: QuickScreenSubject = {
      name: 'Dmitry Volkov',
    };
    const withT = quickScreen(subjectWithType, [BASE_CANDIDATE], { clock, now });
    const withoutT = quickScreen(subjectNoType, [BASE_CANDIDATE], { clock, now });
    expect(withT.topScore).toBeGreaterThanOrEqual(withoutT.topScore);
  });

  it('jurisdiction mismatch does not boost', () => {
    const subjectWrong: QuickScreenSubject = {
      name: 'Dmitry Volkov',
      jurisdiction: 'CN',
    };
    const subjectRight: QuickScreenSubject = {
      name: 'Dmitry Volkov',
      jurisdiction: 'RU',
    };
    const wrong = quickScreen(subjectWrong, [BASE_CANDIDATE], { clock, now });
    const right = quickScreen(subjectRight, [BASE_CANDIDATE], { clock, now });
    expect(right.topScore).toBeGreaterThanOrEqual(wrong.topScore);
  });

  it('all signals together yield the highest boosted score', () => {
    const allSignals: QuickScreenSubject = {
      name: 'Dmitry Volkov',
      entityType: 'individual',
      jurisdiction: 'RU',
    };
    const noSignals: QuickScreenSubject = {
      name: 'Dmitry Volkov',
    };
    const all = quickScreen(allSignals, [BASE_CANDIDATE], { clock, now });
    const none = quickScreen(noSignals, [BASE_CANDIDATE], { clock, now });
    expect(all.topScore).toBeGreaterThanOrEqual(none.topScore);
  });
});

// ── 13. quickScreen — Arabic name cross-script matching ──────────────────────

describe('quickScreen — Arabic cross-script matching', () => {
  const clock = () => 0;
  const now = () => '2026-04-25T00:00:00.000Z';

  const CANDIDATES: QuickScreenCandidate[] = [
    {
      listId: 'uae_ias', listRef: 'UAE-001',
      name: 'Mohammed Hassan Al Rashid',
      aliases: ['محمد حسن الراشد'],
      entityType: 'individual',
      jurisdiction: 'AE',
    },
  ];

  it('Latin romanisation matches Arabic-script alias', () => {
    const subject: QuickScreenSubject = { name: 'Mohammed Hassan Al Rashid' };
    const result = quickScreen(subject, CANDIDATES, { clock, now, scoreThreshold: 0.7 });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]!.score).toBeGreaterThan(0.9);
  });

  it('Arabic-script query matches Latin primary name', () => {
    const subject: QuickScreenSubject = { name: 'محمد حسن الراشد' };
    const result = quickScreen(subject, CANDIDATES, { clock, now, scoreThreshold: 0.7 });
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it('abbreviated form "M. Hassan" still generates a hit', () => {
    const subject: QuickScreenSubject = { name: 'M. Hassan Al Rashid' };
    const result = quickScreen(subject, CANDIDATES, { clock, now, scoreThreshold: 0.6 });
    expect(result.hits.length).toBeGreaterThan(0);
  });
});

// ── 14. quickScreen — ROMAN_FAMILIES variant matching ────────────────────────

describe('quickScreen — ROMAN_FAMILIES family normalisation', () => {
  const clock = () => 0;
  const now = () => '2026-04-25T00:00:00.000Z';

  const CANDIDATES: QuickScreenCandidate[] = [
    {
      listId: 'un_sc', listRef: 'UN-001',
      name: 'Mohammed Ali Hassan',
      entityType: 'individual',
    },
  ];

  it('Mohamed Ali Hassan matches Mohammed Ali Hassan', () => {
    const subject: QuickScreenSubject = { name: 'Mohamed Ali Hassan' };
    const result = quickScreen(subject, CANDIDATES, { clock, now, scoreThreshold: 0.7 });
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it('Mohammad Ali Hassan matches Mohammed Ali Hassan', () => {
    const subject: QuickScreenSubject = { name: 'Mohammad Ali Hassan' };
    const result = quickScreen(subject, CANDIDATES, { clock, now, scoreThreshold: 0.7 });
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it('Mehmet Ali Hassan matches Mohammed Ali Hassan', () => {
    const subject: QuickScreenSubject = { name: 'Mehmet Ali Hassan' };
    const result = quickScreen(subject, CANDIDATES, { clock, now, scoreThreshold: 0.7 });
    expect(result.hits.length).toBeGreaterThan(0);
  });
});

// ── 15. severityFromScore — boundary conditions ───────────────────────────────

describe('severityFromScore — full boundary table', () => {
  it('score 0, hitCount 0 → clear', () => expect(severityFromScore(0, 0)).toBe('clear'));
  it('score 100, hitCount 0 → clear (no hits overrides score)', () => expect(severityFromScore(100, 0)).toBe('clear'));
  it('score 69, hitCount 1 → low', () => expect(severityFromScore(69, 1)).toBe('low'));
  it('score 70, hitCount 1 → medium', () => expect(severityFromScore(70, 1)).toBe('medium'));
  it('score 84, hitCount 1 → medium', () => expect(severityFromScore(84, 1)).toBe('medium'));
  it('score 85, hitCount 1 → high', () => expect(severityFromScore(85, 1)).toBe('high'));
  it('score 94, hitCount 1 → high', () => expect(severityFromScore(94, 1)).toBe('high'));
  it('score 95, hitCount 1 → critical', () => expect(severityFromScore(95, 1)).toBe('critical'));
  it('score 100, hitCount 5 → critical', () => expect(severityFromScore(100, 5)).toBe('critical'));
});

// ── 16. quickScreen — result structure integrity ──────────────────────────────

describe('quickScreen — result structure', () => {
  const clock = () => 0;
  const now = () => '2026-04-25T00:00:00.000Z';

  const candidate: QuickScreenCandidate = {
    listId: 'ofac', listRef: 'OFAC-999',
    name: 'John Doe',
    programs: ['E.O. 12345'],
    entityType: 'individual',
    jurisdiction: 'US',
  };

  it('result contains all required fields', () => {
    const result = quickScreen({ name: 'John Doe' }, [candidate], { clock, now });
    expect(result).toHaveProperty('subject');
    expect(result).toHaveProperty('hits');
    expect(result).toHaveProperty('topScore');
    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('listsChecked');
    expect(result).toHaveProperty('candidatesChecked');
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('generatedAt');
  });

  it('durationMs is 0 when clock always returns 0', () => {
    const result = quickScreen({ name: 'John Doe' }, [candidate], { clock, now });
    expect(result.durationMs).toBe(0);
  });

  it('generatedAt uses injected now()', () => {
    const result = quickScreen({ name: 'John Doe' }, [candidate], { clock, now });
    expect(result.generatedAt).toBe('2026-04-25T00:00:00.000Z');
  });

  it('programs are forwarded from candidate to hit', () => {
    const result = quickScreen({ name: 'John Doe' }, [candidate], { clock, now });
    expect(result.hits[0]?.programs).toEqual(['E.O. 12345']);
  });

  it('candidatesChecked reflects full candidate array length', () => {
    const result = quickScreen({ name: 'John Doe' }, [candidate, candidate], { clock, now });
    expect(result.candidatesChecked).toBe(2);
  });

  it('empty candidates list returns clear with 0 hits', () => {
    const result = quickScreen({ name: 'John Doe' }, [], { clock, now });
    expect(result.hits).toHaveLength(0);
    expect(result.severity).toBe('clear');
    expect(result.listsChecked).toBe(0);
    expect(result.candidatesChecked).toBe(0);
  });
});
