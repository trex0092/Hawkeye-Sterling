// MLRO Advisor integration pipeline test.
//
// Exercises the same composition pattern the live route handlers use:
//
//   retrieve() → preGenerationRouter() → [model call] → postGenerationRouter()
//             → validateCitations() → AuditLogStore.append()
//
// The route handlers (web/app/api/mlro-advisor*/route.ts) wire these in
// the same order via web/lib/server/mlro-integration.ts. This test
// locks the contract: as long as it stays green, any wiring change
// in the route handlers can be cross-checked against this composition.

import { describe, expect, it } from 'vitest';
import {
  buildSeedRegistry,
  retrieve,
  preGenerationRouter,
  postGenerationRouter,
  validateCitations,
  AuditLogStore,
  persistedSourceFromChunk,
  retrievalConfidence,
} from '../registry/index.js';
import type { AdvisorMode } from '../registry/audit-log.js';

const REGISTRY = buildSeedRegistry();

describe('integration pipeline: retrieval → pre-gen → validate → post-gen → audit', () => {
  it('a clean compliance question flows end-to-end without refusal', () => {
    const question = 'STR filing obligation under FDL 10/2025 — timing and audit-trail requirements';
    const retrieval = retrieve(REGISTRY, { text: question, topK: 12 });
    expect(retrieval.chunks.length).toBeGreaterThan(0);

    const preGen = preGenerationRouter({
      question,
      retrieved: { chunks: retrieval.chunks, hasPendingChunks: retrieval.hasPendingChunks },
      // shells push confidence below default 0.7 — relax for this test
      retrievalConfidenceThreshold: 0.3,
    });
    expect(preGen.refused).toBe(false);

    // Simulated answer that grounds every claim in the retrieval set.
    const answer =
      'Per FDL 10/2025 Art.22 and Cabinet Decision 134/2025 Art.11, reporting entities must ' +
      'file an STR via goAML without delay; FATF R.20 sets the international anchor.';

    const postGen = postGenerationRouter({ question, answer });
    expect(postGen.refused).toBe(false);

    const validation = validateCitations(answer, retrieval.chunks);
    expect(validation.summary.citationCount).toBeGreaterThanOrEqual(3);
    // At least one cite should match a retrieved chunk.
    expect(validation.summary.matchedCount).toBeGreaterThan(0);

    const log = new AuditLogStore();
    const entry = log.append({
      userId: 'mlro-01',
      mode: 'deep' satisfies AdvisorMode,
      questionText: question,
      modelVersions: { sonnet: 'sonnet-4-6', opus: 'opus-4-7' },
      charterVersionHash: 'charter-v1',
      directivesInvoked: [],
      doctrinesApplied: [],
      retrievedSources: retrieval.chunks.map(persistedSourceFromChunk),
      reasoningTrace: [],
      finalAnswer: null,
      validation,
    });
    expect(entry.seq).toBe(1);
    expect(log.verify().ok).toBe(true);
  });

  it('low retrieval confidence is NO LONGER refused (Path 6 disabled)', () => {
    // Path 6 was disabled because it refused legitimate compliance
    // questions when registry coverage was thin. The Advisor must
    // answer every compliance question; the retrievalConfidence
    // helper is still exported for telemetry / scoring.
    const preGen = preGenerationRouter({
      question: 'A reasonable AML question',
      retrieved: { chunks: [], hasPendingChunks: false },
    });
    expect(preGen.refused).toBe(false);
  });

  it('out-of-scope legal advice short-circuits before retrieval (cheaper path)', () => {
    const preGen = preGenerationRouter({ question: 'Help me draft an employment contract.' });
    expect(preGen.refused).toBe(true);
    if (!preGen.refused) throw new Error('expected refusal');
    expect(preGen.reason).toBe('out_of_scope_legal_advice');
  });

  it('post-gen catches a sanctions verdict the model invented', () => {
    const postGen = postGenerationRouter({
      question: 'Tell me about this counterparty',
      answer: 'The entity is on the OFAC SDN list and should be frozen immediately.',
      sanctionsScreenedByToolOfRecord: false,
    });
    expect(postGen.refused).toBe(true);
    if (!postGen.refused) throw new Error('expected refusal');
    expect(postGen.reason).toBe('definitive_sanctions_verdict');
  });

  it('post-gen catches goAML XML in the answer', () => {
    const postGen = postGenerationRouter({
      question: 'Help with filing',
      answer: '<?xml version="1.0"?>\n<goaml><report>filing text</report></goaml>',
    });
    expect(postGen.refused).toBe(true);
    if (!postGen.refused) throw new Error('expected refusal');
    expect(postGen.reason).toBe('unsigned_filing_draft');
  });

  it('citation validator surfaces invented FDL article number', () => {
    const question = 'STR obligation';
    const retrieval = retrieve(REGISTRY, { text: question, topK: 8 });
    const v = validateCitations('Per FDL 10/2025 Art.99, all reports must be filed within 5 business days.', retrieval.chunks);
    expect(v.passed).toBe(false);
    expect(v.defects.some((d) => d.failure === 'no_matching_chunk')).toBe(true);
  });

  it('audit log captures the full retrieval set with class metadata', () => {
    const question = 'CDD onboarding under FDL 10/2025';
    const retrieval = retrieve(REGISTRY, { text: question, topK: 8 });
    const log = new AuditLogStore();
    log.append({
      userId: 'mlro-01',
      mode: 'quick',
      questionText: question,
      modelVersions: { haiku: 'haiku-4-5' },
      charterVersionHash: 'charter-v1',
      directivesInvoked: [],
      doctrinesApplied: [],
      retrievedSources: retrieval.chunks.map(persistedSourceFromChunk),
      reasoningTrace: [],
      finalAnswer: null,
    });
    const entry = log.list()[0]!;
    expect(entry.retrievedSources.length).toBeGreaterThan(0);
    for (const s of entry.retrievedSources) {
      expect(s.class).toBeTruthy();
      expect(s.classLabel).toBeTruthy();
      expect(s.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('integration pipeline: retrieval confidence shape', () => {
  it('returns 0 on empty retrieval, > 0 on shells', () => {
    expect(retrievalConfidence({ chunks: [], hasPendingChunks: false })).toBe(0);
    const r = retrieve(REGISTRY, { text: 'STR filing obligation under FDL 10/2025', topK: 12 });
    expect(retrievalConfidence({ chunks: r.chunks, hasPendingChunks: r.hasPendingChunks })).toBeGreaterThan(0);
  });
});
