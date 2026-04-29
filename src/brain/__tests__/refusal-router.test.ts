// Layer 5 acceptance tests — refusal router.
//
// One test per refusal path per build-spec acceptance ("probe each
// refusal path and confirm the model refuses correctly with the
// right escalation message"). Plus regression tests for false-
// positive control (don't refuse legitimate compliance questions).

import { describe, expect, it } from 'vitest';
import {
  preGenerationRouter,
  postGenerationRouter,
  retrievalConfidence,
  type RefusalResponse,
} from '../registry/refusal-router.js';
import { buildSeedRegistry, retrieve } from '../registry/index.js';

function expectRefusal(o: ReturnType<typeof preGenerationRouter>, reason: string): RefusalResponse {
  expect(o.refused).toBe(true);
  if (!o.refused) throw new Error('not a refusal');
  expect(o.reason).toBe(reason);
  return o;
}

describe('refusal router: pre-generation paths', () => {
  it('path 1: out-of-scope legal advice (employment / family / criminal)', () => {
    const r = preGenerationRouter({ question: 'Can my firm terminate an employment contract for cause?' });
    const ref = expectRefusal(r, 'out_of_scope_legal_advice');
    expect(ref.escalation.to).toMatch(/legal counsel/i);
  });

  it('path 2: tax / accounting advice', () => {
    const r = preGenerationRouter({ question: 'What is the corporate tax treatment of inter-company loans for an FTA filing?' });
    const ref = expectRefusal(r, 'tax_or_accounting_advice');
    expect(ref.escalation.to).toMatch(/tax adviser|external auditor/i);
  });

  it('path 3: named-individual speculation refused', () => {
    const r = preGenerationRouter({ question: 'Is Vladimir Putin involved in any AML investigations?' });
    const ref = expectRefusal(r, 'named_individual_speculation');
    expect(ref.escalation.to).toMatch(/screening/i);
  });

  it('path 3: role-based phrasing is NOT refused', () => {
    const r = preGenerationRouter({ question: 'How should we treat a tier-1 PEP from a CAHRA jurisdiction?' });
    expect(r.refused).toBe(false);
  });

  it('path 4: definitive sanctions-verdict request', () => {
    const r = preGenerationRouter({ question: 'Confirm sanctions status for this counterparty.' });
    const ref = expectRefusal(r, 'definitive_sanctions_verdict');
    expect(ref.escalation.to).toMatch(/screening/i);
  });

  it('path 5: filing draft without sign-off', () => {
    const r = preGenerationRouter({ question: 'Draft the STR narrative for this case.', mlroSignOffConfirmed: false });
    expectRefusal(r, 'unsigned_filing_draft');
  });

  it('path 5: filing draft WITH MLRO sign-off is allowed', () => {
    const r = preGenerationRouter({ question: 'Draft the STR narrative for this case.', mlroSignOffConfirmed: true });
    expect(r.refused).toBe(false);
  });

  it('path 6: low retrieval confidence triggers escalate', () => {
    // Empty retrieval set → confidence 0 → refusal.
    const r = preGenerationRouter({
      question: 'A reasonable AML question',
      retrieved: { chunks: [], hasPendingChunks: false },
    });
    const ref = expectRefusal(r, 'low_retrieval_confidence');
    expect(ref.message).toMatch(/insufficient grounded evidence/i);
  });

  it('path 6: high retrieval confidence is NOT refused', () => {
    const store = buildSeedRegistry();
    const result = retrieve(store, { text: 'STR filing obligation under FDL 10/2025', topK: 30 });
    // Even though shells are pending, the catalogue is well-classified
    // and Class A+B+C all surface — the test is whether the threshold
    // adjusts. Use a relaxed threshold for this test (the retrieval
    // confidence on shells is intentionally lower).
    const r = preGenerationRouter({
      question: 'STR filing obligation under FDL 10/2025',
      retrieved: { chunks: result.chunks, hasPendingChunks: result.hasPendingChunks },
      retrievalConfidenceThreshold: 0.3,
    });
    expect(r.refused).toBe(false);
  });

  it('legitimate AML question is NOT refused', () => {
    const r = preGenerationRouter({ question: 'What CDD is required at onboarding for a UAE gold trader?' });
    expect(r.refused).toBe(false);
  });
});

describe('refusal router: post-generation paths', () => {
  it('catches a sanctions verdict the model invented', () => {
    const r = postGenerationRouter({
      question: 'Tell me about this counterparty',
      answer: 'Based on my analysis, the entity is on the OFAC SDN list and should be frozen immediately.',
      sanctionsScreenedByToolOfRecord: false,
    });
    expectRefusal(r, 'definitive_sanctions_verdict');
  });

  it('allows a sanctions outcome that came from the screening tool', () => {
    const r = postGenerationRouter({
      question: 'What does the screening output mean?',
      answer: 'The screening tool reports the entity is on the OFAC SDN list — review the Module 02 output.',
      sanctionsScreenedByToolOfRecord: true,
    });
    expect(r.refused).toBe(false);
  });

  it('catches goAML XML / final filing text in the draft', () => {
    const r = postGenerationRouter({
      question: 'Help me file',
      answer: '<?xml version="1.0"?>\n<goaml>...filing text...</goaml>',
    });
    expectRefusal(r, 'unsigned_filing_draft');
  });

  it('passes through a normal advisory answer', () => {
    const r = postGenerationRouter({
      question: 'CDD obligations',
      answer: 'Per FDL 10/2025 Art.16, identification at onboarding is required.',
    });
    expect(r.refused).toBe(false);
  });
});

describe('retrievalConfidence: monotonic in classes + count', () => {
  it('zero chunks → 0', () => {
    expect(retrievalConfidence({ chunks: [], hasPendingChunks: false })).toBe(0);
  });

  it('more classes is higher than fewer', () => {
    const store = buildSeedRegistry();
    const broad = retrieve(store, { text: 'STR filing obligation FDL 10/2025', topK: 30 });
    const narrow = retrieve(store, { text: 'FATF R.20', topK: 30 });
    const cBroad = retrievalConfidence({ chunks: broad.chunks, hasPendingChunks: broad.hasPendingChunks });
    const cNarrow = retrievalConfidence({ chunks: narrow.chunks, hasPendingChunks: narrow.hasPendingChunks });
    // Broad should be ≥ narrow because it covers more classes.
    expect(cBroad).toBeGreaterThanOrEqual(cNarrow);
  });
});
