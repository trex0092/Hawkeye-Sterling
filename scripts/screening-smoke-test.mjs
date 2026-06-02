#!/usr/bin/env node
// Hawkeye Sterling — Screening Smoke Test
// Runs 12 synthetic subject records through the entity-screening engine and
// prints a full AML/CFT results chart. All names, dates, and identifiers are
// fictional and are used only to exercise the screening pipeline.

import { screenEntity } from '../dist/src/brain/entity-screening-engine.js';

const NOW = () => '2026-06-01T00:00:00.000Z';
const LIST_DATE = '2026-05-31';

// ─── Watchlist candidates (synthetic) ────────────────────────────────────────

const WATCHLIST = [
  // UN 1267 sanctions — individual
  {
    listId: 'un_consolidated', listRef: 'UN-1267-001', listVersionDate: LIST_DATE,
    nature: 'sanctions', regimes: ['un_1267'],
    record: {
      id: 'wl-001', name: 'Khalid Al-Rashidi', entityType: 'individual',
      nationality: 'AF', dateOfBirth: '1972-03-15',
      identifiers: [{ kind: 'passport', number: 'PA7823001' }],
      aliases: ['Khaled Al Rachidi', 'K. Al-Rashidi'],
    },
    rawClaim: 'Designated for financing terrorism under UN Security Council Resolution 1267.',
  },
  // OFAC SDN — individual
  {
    listId: 'ofac_sdn', listRef: 'SDN-2024-447', listVersionDate: LIST_DATE,
    nature: 'sanctions', regimes: ['us_ofac_sdn'],
    record: {
      id: 'wl-002', name: 'Hassan Mahmoud Tariq', entityType: 'individual',
      nationality: 'IR', dateOfBirth: '1965-07-22',
      identifiers: [{ kind: 'passport', number: 'IR9234511' }],
    },
  },
  // UAE EOCN — entity
  {
    listId: 'uae_eocn', listRef: 'EOCN-2025-019', listVersionDate: LIST_DATE,
    nature: 'sanctions', regimes: ['uae_eocn'],
    record: {
      id: 'wl-003', name: 'Al-Baraka Trading LLC', entityType: 'organisation',
      jurisdiction: 'AE',
      registrationNumber: 'DED-114823',
    },
  },
  // PEP — senior government official
  {
    listId: 'pep_tier1', listRef: 'PEP-001', listVersionDate: LIST_DATE,
    nature: 'pep', regimes: [],
    record: {
      id: 'wl-004', name: 'Ahmed Salim Al-Mansouri', entityType: 'individual',
      nationality: 'AE', dateOfBirth: '1958-11-30',
      identifiers: [{ kind: 'national_id', number: '784195800234' }],
      aliases: ['Ahmed Al Mansouri'],
    },
    rawClaim: 'Former Minister of Finance, UAE. Tier-1 PEP per FATF R.12.',
  },
  // Adverse media — enforcement action
  {
    listId: 'adverse_media_enforcement', listRef: 'ENF-2025-882', listVersionDate: LIST_DATE,
    nature: 'adverse_media', regimes: [],
    record: {
      id: 'wl-005', name: 'Mohammed Ibrahim Yusuf', entityType: 'individual',
      nationality: 'PK', dateOfBirth: '1981-09-04',
    },
    rawClaim: 'Subject of DFSA enforcement action for market manipulation.',
  },
  // EU consolidated — individual
  {
    listId: 'eu_consolidated', listRef: 'EU-CFR-3344', listVersionDate: LIST_DATE,
    nature: 'sanctions', regimes: ['eu_consolidated'],
    record: {
      id: 'wl-006', name: 'Viktor Nikolaevich Petrov', entityType: 'individual',
      nationality: 'RU', dateOfBirth: '1969-04-02',
      identifiers: [{ kind: 'passport', number: 'RU7712341' }],
    },
  },
];

// ─── 12 Subjects for Smoke Test ───────────────────────────────────────────────

const SUBJECTS = [
  // 1. Exact match — CONFIRMED (same name, passport, DOB, nationality)
  {
    id: 'S-001', name: 'Khalid Al-Rashidi', entityType: 'individual',
    nationality: 'AF', dateOfBirth: '1972-03-15',
    identifiers: [{ kind: 'passport', number: 'PA7823001' }],
    jurisdiction: 'AF',
  },
  // 2. Alias match — HIGH_PROBABILITY (alias on watchlist matches)
  {
    id: 'S-002', name: 'Khaled Al Rachidi', entityType: 'individual',
    nationality: 'AF', dateOfBirth: '1972-03-15',
    jurisdiction: 'AF',
  },
  // 3. Name match, DOB conflict — MODERATE (same name, different birthday)
  {
    id: 'S-003', name: 'Hassan Mahmoud Tariq', entityType: 'individual',
    nationality: 'IR', dateOfBirth: '1975-03-10', // different DOB
    jurisdiction: 'IR',
  },
  // 4. Entity match — CONFIRMED (organisation name + registration number)
  {
    id: 'S-004', name: 'Al-Baraka Trading LLC', entityType: 'organisation',
    jurisdiction: 'AE', registrationNumber: 'DED-114823',
  },
  // 5. PEP match — HIGH_PROBABILITY (name + national ID)
  {
    id: 'S-005', name: 'Ahmed Al Mansouri', entityType: 'individual',
    nationality: 'AE', dateOfBirth: '1958-11-30',
    identifiers: [{ kind: 'national_id', number: '784195800234' }],
    jurisdiction: 'AE',
  },
  // 6. Adverse media match — MODERATE (name match only)
  {
    id: 'S-006', name: 'Mohammed Ibrahim Yusuf', entityType: 'individual',
    nationality: 'PK',
    jurisdiction: 'PK',
  },
  // 7. Near-miss false positive — FP_LIKELY (similar name, different nationality)
  {
    id: 'S-007', name: 'Hassan Tariq', entityType: 'individual',
    nationality: 'AE', dateOfBirth: '1990-06-15', // different person
    identifiers: [{ kind: 'passport', number: 'AE1234567' }],
    jurisdiction: 'AE',
  },
  // 8. EU sanctions individual — CONFIRMED (exact name + passport)
  {
    id: 'S-008', name: 'Viktor Nikolaevich Petrov', entityType: 'individual',
    nationality: 'RU', dateOfBirth: '1969-04-02',
    identifiers: [{ kind: 'passport', number: 'RU7712341' }],
    jurisdiction: 'RU',
  },
  // 9. Fuzzy transliteration — HIGH_PROBABILITY (Arabic name variant)
  {
    id: 'S-009', name: 'Khaled Al-Rashidy', entityType: 'individual',
    nationality: 'AF',
    jurisdiction: 'AF',
  },
  // 10. Clear — no match (completely different person)
  {
    id: 'S-010', name: 'Sarah Jane Williams', entityType: 'individual',
    nationality: 'GB', dateOfBirth: '1985-04-22',
    identifiers: [{ kind: 'passport', number: 'GB9876543' }],
    jurisdiction: 'GB',
  },
  // 11. Clear — entity not on any list
  {
    id: 'S-011', name: 'Emirates Clean Energy Partners', entityType: 'organisation',
    jurisdiction: 'AE', registrationNumber: 'ADJZ-00321',
  },
  // 12. High-risk jurisdiction context amplifier
  {
    id: 'S-012', name: 'Al-Baraka General Trading', entityType: 'organisation',
    jurisdiction: 'IR', // Iran
  },
];

// ─── Contextual signals ───────────────────────────────────────────────────────

const CONTEXT_BY_SUBJECT = {
  'S-012': { jurisdictionsInTransaction: ['IR', 'AE'], cashIntensive: true },
};

// ─── Run screening ────────────────────────────────────────────────────────────

const TIER_COLORS = {
  CONFIRMED:        '\x1b[91m',  // bright red
  HIGH_PROBABILITY: '\x1b[33m',  // yellow
  MODERATE:         '\x1b[93m',  // bright yellow
  LOW:              '\x1b[36m',  // cyan
  FP_LIKELY:        '\x1b[32m',  // green
  NONE:             '\x1b[32m',  // green
};
const RESET = '\x1b[0m';

const rows = [];

for (const subject of SUBJECTS) {
  const ctx = CONTEXT_BY_SUBJECT[subject.id] ?? { jurisdictionsInTransaction: [subject.jurisdiction ?? 'AE'] };
  const opts = { authoritativeListSupplied: true, now: NOW };

  const result = screenEntity(subject, WATCHLIST, ctx, opts);

  const topFinding = result.findings[0];
  const topScore = topFinding
    ? Math.round(topFinding.ensembleScore * 100)
    : 0;
  const action = topFinding?.recommendedAction ?? '—';
  const nature = topFinding
    ? WATCHLIST.find(w => w.listRef === result.findings[0]?.listRef)?.nature ?? topFinding.nature ?? '—'
    : '—';

  rows.push({
    id: subject.id,
    name: subject.name.length > 30 ? subject.name.slice(0, 28) + '..' : subject.name,
    type: subject.entityType ?? 'individual',
    tier: result.topMatchRiskTier,
    confidence: result.topConfidence,
    score: topScore,
    hits: result.findings.length,
    nature,
    action: action.replace(/_/g, ' ').slice(0, 32),
    redFlags: result.redFlags.length,
    gaps: result.gaps.length,
    listId: topFinding ? topFinding.listId : '—',
  });
}

// ─── Chart output ─────────────────────────────────────────────────────────────

const DIVIDER = '─'.repeat(132);
const HEADER  = '═'.repeat(132);

console.log('\n' + HEADER);
console.log(' HAWKEYE STERLING — AML/CFT SCREENING SMOKE TEST  ·  12 Subjects  ·  ' + new Date().toISOString().slice(0, 10));
console.log(HEADER);
console.log(
  ' #  │ Subject Name                    │ Type    │ Risk Tier        │ Conf   │Score│ Hits │ Nature          │ Recommended Action               │ Flags│Gaps'
);
console.log(DIVIDER);

for (const r of rows) {
  const color = TIER_COLORS[r.tier] ?? '';
  const tierPad = r.tier.padEnd(16);
  const confPad = r.confidence.padEnd(6);
  const scoreBar = r.score > 0
    ? '[' + '█'.repeat(Math.round(r.score / 10)).padEnd(10) + ']'
    : '[          ]';
  console.log(
    ` ${r.id} │ ${r.name.padEnd(31)} │ ${r.type.slice(0, 7).padEnd(7)} │ ${color}${tierPad}${RESET} │ ${confPad} │${String(r.score).padStart(3)}% │  ${String(r.hits).padStart(2)}  │ ${r.nature.slice(0, 15).padEnd(15)} │ ${r.action.padEnd(32)} │   ${r.redFlags}  │  ${r.gaps}`
  );
}

console.log(DIVIDER);

// ─── Summary statistics ───────────────────────────────────────────────────────

const byTier = {};
for (const r of rows) byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;

console.log('\n SUMMARY');
console.log(' ' + '─'.repeat(40));

const tierOrder = ['CONFIRMED', 'HIGH_PROBABILITY', 'MODERATE', 'LOW', 'FP_LIKELY', 'NONE'];
for (const tier of tierOrder) {
  const count = byTier[tier] ?? 0;
  if (count === 0) continue;
  const bar = '▓'.repeat(count * 4).padEnd(20);
  const color = TIER_COLORS[tier] ?? '';
  console.log(` ${color}${tier.padEnd(18)}${RESET}  ${bar}  ${count} subject${count > 1 ? 's' : ''}`);
}

const totalHits = rows.reduce((a, r) => a + r.hits, 0);
const flagged = rows.filter(r => r.tier !== 'NONE' && r.tier !== 'FP_LIKELY').length;
const clear = rows.filter(r => r.tier === 'NONE').length;
const fp = rows.filter(r => r.tier === 'FP_LIKELY').length;

console.log('\n ' + '─'.repeat(40));
console.log(` Total subjects screened : ${rows.length}`);
console.log(` Watchlist entries       : ${WATCHLIST.length}`);
console.log(` Flagged for review      : ${flagged}  (CONFIRMED + HIGH_PROBABILITY + MODERATE)`);
console.log(` Likely false positives  : ${fp}`);
console.log(` Clear (no match)        : ${clear}`);
console.log(` Total findings raised   : ${totalHits}`);

// ─── Detail cards for all non-clear results ───────────────────────────────────

console.log('\n' + HEADER);
console.log(' FINDING DETAIL — FLAGGED SUBJECTS');
console.log(HEADER);

for (const r of rows) {
  if (r.tier === 'NONE') continue;

  const subject = SUBJECTS.find(s => s.id === r.id);
  const result = screenEntity(
    subject,
    WATCHLIST,
    CONTEXT_BY_SUBJECT[r.id] ?? { jurisdictionsInTransaction: [subject.jurisdiction ?? 'AE'] },
    { authoritativeListSupplied: true, now: NOW },
  );

  const color = TIER_COLORS[r.tier] ?? '';
  console.log(`\n ${color}▶ ${r.id} — ${r.name}${RESET}`);
  console.log(`   Risk Tier : ${color}${result.topMatchRiskTier}${RESET}   Confidence : ${result.topConfidence}`);
  const listsChecked = result.scopeDeclaration?.listsChecked;
  const scopeStr = Array.isArray(listsChecked)
    ? listsChecked.map(l => (typeof l === 'string' ? l : (l?.listId ?? l?.id ?? JSON.stringify(l)))).join(', ')
    : (listsChecked ?? '?');
  console.log(`   Scope     : ${scopeStr} lists declared in scope`);

  for (const f of result.findings) {
    console.log(`\n   ┌─ Finding on ${f.listId} / ${f.listRef}`);
    console.log(`   │  Nature              : ${f.nature}`);
    console.log(`   │  Ensemble score      : ${Math.round(f.ensembleScore * 100)}%`);
    console.log(`   │  Confidence          : ${f.confidence}`);
    console.log(`   │  Match Risk Tier     : ${f.matchRiskTier}`);
    console.log(`   │  Recommended Action  : ${f.recommendedAction.replace(/_/g, ' ')}`);
    if (f.amplifiers?.length)  console.log(`   │  Amplifiers          : ${f.amplifiers.join(', ')}`);
    if (f.attenuators?.length) console.log(`   │  Attenuators         : ${f.attenuators.join(', ')}`);
    if (f.sharedIdentifiers?.length) console.log(`   │  Shared identifiers  : ${f.sharedIdentifiers.join(', ')}`);
    if (f.conflictingIdentifiers?.length) console.log(`   │  Conflicts           : ${f.conflictingIdentifiers.join(', ')}`);
    console.log(`   └─ Rationale : ${f.rationale?.slice(0, 120) ?? '—'}`);
  }

  if (result.redFlags.length) {
    console.log(`\n   Red flags :`);
    for (const rf of result.redFlags) console.log(`     • ${rf}`);
  }
  if (result.recommendedNextSteps?.length) {
    console.log(`   Next steps :`);
    for (const ns of result.recommendedNextSteps.slice(0, 3)) console.log(`     → ${ns}`);
  }
}

console.log('\n' + HEADER);
console.log(' SMOKE TEST COMPLETE — Engine ran without errors');
console.log(HEADER + '\n');
