// Guards the candidate blocking pre-gate added after the 2026-06-12
// production incident: the full matchEnsemble scan over the restored ~32k
// corpus took ~52 s per screen on a Lambda, past the UI's 15 s client budget
// and Netlify's ~26 s edge idle window. The gate skips candidates that share
// no plausible matching signal with the subject — and must NEVER change the
// outcome of a screen (recall contract at couldPlausiblyMatch()).

import { describe, it, expect } from 'vitest';
import { quickScreen, type QuickScreenSubject, type QuickScreenCandidate } from '../quick-screen.js';
import { buildNameKeys, couldPlausiblyMatch } from '../matching.js';

const FIRST = ['Mohammed', 'Ali', 'Hassan', 'Ibrahim', 'Yusuf', 'Omar', 'Sergei', 'Dmitri', 'Ivan', 'Chen', 'Jose', 'Maria', 'Zeynep', 'Mehmet', 'Fatima', 'Nikolai', 'Tatiana', 'Kim'];
const LAST = ['Al-Baghdadi', 'Petrov', 'Volkov', 'Hernandez', 'Smith', 'Yilmaz', 'Kaya', 'Wang', 'Hussein', 'Karimov', 'Rahimi', 'Sokolov', 'Lebedev', 'Novikov', 'Fedorov', 'Tarasov'];
const MID = ['Abdul', 'bin', 'Al', 'de', ''];

function buildCorpus(n: number): QuickScreenCandidate[] {
  const out: QuickScreenCandidate[] = [];
  for (let i = 0; i < n; i++) {
    const name = `${FIRST[(i * 7 + 3) % FIRST.length]} ${MID[(i * 13 + 1) % MID.length]} ${LAST[(i * 11 + 5) % LAST.length]}`
      .replace(/\s+/g, ' ')
      .trim();
    out.push({
      listId: ['ofac_sdn', 'un_consolidated', 'eu_fsf', 'uk_ofsi'][i % 4] as string,
      listRef: `REF-${i}`,
      name,
      aliases: i % 3 === 0 ? [`${LAST[i % LAST.length]} ${FIRST[(i + 2) % FIRST.length]}`, `${(FIRST[(i + 9) % FIRST.length] as string).charAt(0)}. ${LAST[(i + 4) % LAST.length]}`] : [],
      entityType: 'individual',
    });
  }
  out.push(
    { listId: 'ofac_sdn', listRef: 'X-1', name: 'Mohammed Hassan Al-Baghdadi', aliases: ['Abu Bakr'], entityType: 'individual' },
    { listId: 'un_consolidated', listRef: 'X-2', name: 'Dmitri Volkov', aliases: ['D. Volkov'], entityType: 'individual' },
    { listId: 'eu_fsf', listRef: 'X-3', name: 'Usama bin Ladin', aliases: [], entityType: 'individual' },
    { listId: 'uk_ofsi', listRef: 'X-4', name: 'Al Rajhi Trading International', aliases: ['AlRajhi Intl'], entityType: 'organisation' },
    { listId: 'ofac_sdn', listRef: 'X-5', name: 'Li Wei', aliases: [], entityType: 'individual' },
  );
  return out;
}

const CORPUS = buildCorpus(3_000);

function hitFingerprint(subject: QuickScreenSubject, opts: Record<string, unknown>): string {
  const r = quickScreen(subject, CORPUS, opts);
  return JSON.stringify({
    hits: r.hits.map((h) => [h.listRef, h.score, h.baseScore, h.method, h.matchedAlias ?? null]),
    topScore: r.topScore,
    severity: r.severity,
  });
}

describe('candidate blocking pre-gate — gated/exhaustive equivalence', () => {
  const subjects: QuickScreenSubject[] = [
    { name: 'Mohammed Hassan Al-Baghdadi' },
    { name: 'محمد حسن البغدادي' },                // Arabic transliteration
    { name: 'Дмитрий Волков' },                    // Cyrillic transliteration
    { name: 'D. Volkov' },                         // initials
    { name: 'Osama bin Laden' },                   // spelling variant
    { name: 'Mohamed Hasan' },                     // typo
    { name: 'Volkov Dmitri' },                     // token reorder
    { name: 'AlRajhi Trading' },                   // spacing / org
    { name: 'Zeynap Yilmaz' },                     // diacritic-ish typo
    { name: 'Mohammda Hassan' },                   // adjacent transposition
    { name: 'M. H. Al-Baghdadi' },                 // double initials
    { name: 'Li Wei' },                            // short-name bypass band
    { name: 'Completely Unrelated Person' },       // clear
  ];

  for (const subject of subjects) {
    it(`produces identical results with and without blocking for "${subject.name}"`, () => {
      expect(hitFingerprint(subject, {})).toBe(hitFingerprint(subject, { exhaustive: true }));
    });
  }

  it('produces identical results under randomized name perturbations (seeded)', { timeout: 60_000 }, () => {
    // Deterministic LCG so failures reproduce.
    let seed = 0x5eed;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const perturb = (name: string): string => {
      const ops = [
        (s: string) => s.replace(/a/, 'e'),                                  // vowel swap
        (s: string) => (s.length > 4 ? s.slice(0, 3) + s.slice(4) : s),      // char drop
        (s: string) => s.split(' ').reverse().join(' '),                      // token reorder
        (s: string) => s.split(' ').map((t, i) => (i === 0 ? `${t.charAt(0)}.` : t)).join(' '), // abbreviate
        (s: string) => (s.length > 5 ? s.slice(0, 2) + s.charAt(3) + s.charAt(2) + s.slice(4) : s), // transpose
      ];
      const op = ops[Math.floor(rand() * ops.length)] as (_s: string) => string;
      return op(name);
    };
    for (let i = 0; i < 60; i++) {
      const base = CORPUS[Math.floor(rand() * CORPUS.length)] as QuickScreenCandidate;
      const subject: QuickScreenSubject = { name: perturb(base.name) };
      expect(hitFingerprint(subject, {}), `perturbed subject "${subject.name}" from "${base.name}"`).toBe(
        hitFingerprint(subject, { exhaustive: true }),
      );
    }
  });

  it('auto-disables blocking when the effective threshold drops below the analysed band', () => {
    // threshold 0.5 → blocking off → exhaustive parity is trivially guaranteed;
    // this asserts the low-threshold path also stays equivalent end-to-end.
    const subject: QuickScreenSubject = { name: 'Mohamed Hasan' };
    expect(hitFingerprint(subject, { scoreThreshold: 0.5 })).toBe(
      hitFingerprint(subject, { scoreThreshold: 0.5, exhaustive: true }),
    );
  });

  it('auto-disables blocking when any per-list threshold drops below the band', () => {
    const subject: QuickScreenSubject = { name: 'Mohamed Hasan' };
    const listThresholds = { eu_fsf: 0.55 };
    expect(hitFingerprint(subject, { listThresholds })).toBe(
      hitFingerprint(subject, { listThresholds, exhaustive: true }),
    );
  });
});

describe('couldPlausiblyMatch — signal coverage', () => {
  const pairs: Array<[string, string]> = [
    ['Mohammed Hassan', 'Mohamed Hasan'],            // char similarity
    ['محمد حسن', 'Mohamed Hassan'],                  // phonetic via transliteration
    ['Дмитрий Волков', 'VOLKOV Dmitri'],             // Cyrillic + reorder
    ['D. Volkov', 'Dmitri Volkov'],                  // initials
    ['Al Rajhi', 'AlRajhi'],                         // spacing
    ['Usama bin Ladin', 'Osama bin Laden'],          // spelling variants
    ['Li Wei', 'Wei Li'],                            // short names (bypass)
    ['J.K. Rowling', 'Joanne Kathleen Rowling'],     // double initials
  ];
  for (const [a, b] of pairs) {
    it(`passes "${a}" ↔ "${b}"`, () => {
      expect(couldPlausiblyMatch(buildNameKeys(a), buildNameKeys(b))).toBe(true);
    });
  }

  it('skips clearly unrelated names', () => {
    expect(couldPlausiblyMatch(buildNameKeys('Zeynep Basak Halac'), buildNameKeys('Wong Fei Hung'))).toBe(false);
  });
});
