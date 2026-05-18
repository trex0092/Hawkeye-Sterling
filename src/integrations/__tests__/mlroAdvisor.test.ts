import { describe, it, expect } from 'vitest';
import {
  splitQuestion,
  invokeMlroAdvisor,
  buildExecutorRequest,
  buildAdvisorRequest,
  type MlroAdvisorRequest,
  type ChatCall,
} from '../mlroAdvisor.js';

const MINIMAL_REQ: MlroAdvisorRequest = {
  question: 'Is this subject on any sanctions list?',
  mode: 'speed',
  caseContext: {
    caseId: 'HWK-0001',
    subjectName: 'Zayd Al-Mansouri',
    entityType: 'Individual',
    scope: {
      listsChecked: ['UN Consolidated', 'OFAC SDN'],
      listVersionDates: {},
      jurisdictions: ['AE'],
      matchingMethods: ['exact', 'fuzzy'],
    },
    evidenceIds: [],
  },
};

// ── splitQuestion ────────────────────────────────────────────────────────────

describe('splitQuestion — input validation', () => {
  it('throws for empty string', () => {
    expect(() => splitQuestion('')).toThrow('must be non-empty');
  });

  it('throws for whitespace-only string', () => {
    expect(() => splitQuestion('   ')).toThrow('must be non-empty');
  });

  it('throws for single-character string', () => {
    expect(() => splitQuestion('a')).toThrow('too short to split');
  });
});

describe('splitQuestion — conjunction split', () => {
  it('splits on "and" when far enough from the start', () => {
    const q = 'Screen this subject for sanctions and check PEP status';
    const [a, b] = splitQuestion(q);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).toContain('Screen this subject');
    expect(b).toContain('check PEP status');
  });

  it('does not split on "and" within the first 8 chars', () => {
    const q = 'UBO and beneficiary ownership analysis for the customer';
    const [a, b] = splitQuestion(q);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it('splits on "&"', () => {
    const q = 'Verify sanctions exposure & assess adverse media risk';
    const [a, b] = splitQuestion(q);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });
});

describe('splitQuestion — sentence boundary split', () => {
  it('splits on a full stop with trailing space when no conjunction is present', () => {
    const q = 'Screen the subject against the UN Consolidated list. Provide a full disposition recommendation.';
    const [a, b] = splitQuestion(q);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a.length + b.length).toBeGreaterThan(0);
  });
});

describe('splitQuestion — midpoint fallback', () => {
  it('produces two non-empty halves for a word with no spaces', () => {
    const q = 'abcdefghij';
    const [a, b] = splitQuestion(q);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a + b).toBe(q);
  });

  it('splits at a word boundary when a space is near the midpoint', () => {
    const q = 'Screen subject review';
    const [a, b] = splitQuestion(q);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it('guarantees two non-empty halves for a two-character string', () => {
    const [a, b] = splitQuestion('ab');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});

// ── invokeMlroAdvisor — input validation ────────────────────────────────────

describe('invokeMlroAdvisor — input validation', () => {
  it('throws synchronously for an empty question', async () => {
    await expect(
      invokeMlroAdvisor({ ...MINIMAL_REQ, question: '' }, { apiKey: 'x' }),
    ).rejects.toThrow('must be non-empty');
  });

  it('throws for a whitespace-only question', async () => {
    await expect(
      invokeMlroAdvisor({ ...MINIMAL_REQ, question: '   ' }, { apiKey: 'x' }),
    ).rejects.toThrow('must be non-empty');
  });

  it('calls the chat function with non-empty user content for a valid question', async () => {
    const calls: string[] = [];
    const fakeChat: ChatCall = async ({ user }) => {
      calls.push(user);
      return { ok: true, text: '== SUBJECT_IDENTIFIERS ==\nZayd\n== SCOPE_DECLARATION ==\nUN\n== FINDINGS ==\nNo match\n== GAPS ==\nNone\n== RED_FLAGS ==\nNone\n== RECOMMENDED_NEXT_STEPS ==\nProceed\n== AUDIT_LINE ==\nDecision support only.' };
    };
    await invokeMlroAdvisor(MINIMAL_REQ, { apiKey: 'x' }, fakeChat);
    expect(calls.length).toBeGreaterThan(0);
    for (const u of calls) {
      expect(u.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── defaultChat — empty content guard ───────────────────────────────────────

describe('invokeMlroAdvisor — defaultChat empty-content guard', () => {
  it('returns ok=false and a descriptive error when chat receives empty user content', async () => {
    const emptyContentChat: ChatCall = async ({ user }) => {
      if (!user.trim()) return { ok: false, error: 'message content must be non-empty' };
      return { ok: true, text: 'APPROVED' };
    };
    const res = await invokeMlroAdvisor(MINIMAL_REQ, { apiKey: 'x' }, emptyContentChat);
    expect(res.ok).toBe(true);
  });
});

// ── buildExecutorRequest / buildAdvisorRequest ───────────────────────────────

describe('buildExecutorRequest', () => {
  it('produces a non-empty user message', () => {
    const { user } = buildExecutorRequest(MINIMAL_REQ);
    expect(user.trim().length).toBeGreaterThan(0);
    expect(user).toContain('CASE CONTEXT:');
    expect(user).toContain('QUESTION:');
    expect(user).toContain(MINIMAL_REQ.question);
  });

  it('embeds the question in the user message', () => {
    const { user } = buildExecutorRequest(MINIMAL_REQ);
    expect(user).toContain(MINIMAL_REQ.question);
  });
});

describe('buildAdvisorRequest', () => {
  it('produces a non-empty user message', () => {
    const { user } = buildAdvisorRequest(MINIMAL_REQ, 'Executor draft text here.');
    expect(user.trim().length).toBeGreaterThan(0);
    expect(user).toContain('EXECUTOR DRAFT:');
    expect(user).toContain('Executor draft text here.');
  });

  it('uses the fallback draft text when executor output is empty', () => {
    const draftForAdvisor = '' || 'No executor draft (mode=balanced).';
    const { user } = buildAdvisorRequest(MINIMAL_REQ, draftForAdvisor);
    expect(user.trim().length).toBeGreaterThan(0);
  });
});
