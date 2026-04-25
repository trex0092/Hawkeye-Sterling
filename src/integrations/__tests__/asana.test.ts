import { describe, it, expect } from 'vitest';
import { buildAsanaEnvelope, deliverToAsana, type AsanaConfig } from '../asana.js';
import type { CaseReport } from '../../reports/caseReport.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CFG: AsanaConfig = {
  personalAccessToken: 'test-pat',
  workspaceGid: 'WS-1',
  projectGid: 'PROJ-1',
  sections: {
    firstScreening: 'SEC-FIRST',
    dailyMonitoring: 'SEC-DAILY',
  },
};

function makeReport(overrides: Partial<CaseReport> = {}): CaseReport {
  return {
    header: {
      product: 'Hawkeye Sterling V2',
      reportKind: 'CASE REPORT',
      confidential: true,
      generatedAt: '2026-04-22T12:00:00Z',
      printedBy: 'mlro@example.ae',
      group: 'Compliance',
      mode: 'first_screening',
    },
    identity: {
      caseId: 'HWK-0001',
      recordUid: 'rec-0001',
      name: 'Zayd Al-Mansouri',
      entityType: 'Individual',
      dateOfBirth: '1982-03-14',
      citizenship: ['AE'],
      identificationNumbers: [{ kind: 'passport', number: 'AE1234567', country: 'AE' }],
    },
    keyFindings: {
      totalMatches: 'NO MATCHES FOUND',
      resolvedMatches: 0,
      verdictBreakdown: { Positive: 0, Possible: 0, False: 0, Unspecified: 0 },
      unresolvedMatches: 0,
    },
    reasoningChain: [],
    audit: [{
      date: '2026-04-22T12:00:00Z',
      actionedBy: 'system',
      action: 'case_generated',
      source: 'Desktop',
    }],
    sources: [
      { date: '2026-04-20', url: 'https://scsanctions.un.org/consolidated', title: 'UN Consolidated List' },
      { date: '2026-04-20', url: 'https://sanctionssearch.ofac.treas.gov/', title: 'OFAC SDN' },
    ],
    notes: { timezone: 'UTC', legalNotice: 'Confidential.' },
    ...overrides,
  };
}

// ── buildAsanaEnvelope ────────────────────────────────────────────────────────

describe('buildAsanaEnvelope — task name', () => {
  it('uses [FIRST] tag for first_screening mode', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.name).toContain('[FIRST]');
    expect(env.name).not.toContain('[DAILY]');
  });

  it('uses [DAILY] tag for daily_monitoring mode', () => {
    const env = buildAsanaEnvelope(
      makeReport({ header: { ...makeReport().header, mode: 'daily_monitoring' } }),
      CFG,
    );
    expect(env.name).toContain('[DAILY]');
    expect(env.name).not.toContain('[FIRST]');
  });

  it('includes the subject name in the task name', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.name).toContain('Zayd Al-Mansouri');
  });

  it('includes the caseId in the task name', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.name).toContain('HWK-0001');
  });

  it('shows 0 matches when totalMatches is NO MATCHES FOUND', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.name).toContain('0 matches');
  });

  it('shows singular "match" when exactly 1 match', () => {
    const env = buildAsanaEnvelope(
      makeReport({
        keyFindings: {
          totalMatches: 1,
          resolvedMatches: 1,
          verdictBreakdown: { Positive: 1, Possible: 0, False: 0, Unspecified: 0 },
          unresolvedMatches: 0,
        },
      }),
      CFG,
    );
    expect(env.name).toContain('1 match');
    expect(env.name).not.toContain('1 matches');
  });

  it('shows plural "matches" when more than 1 match', () => {
    const env = buildAsanaEnvelope(
      makeReport({
        keyFindings: {
          totalMatches: 3,
          resolvedMatches: 2,
          verdictBreakdown: { Positive: 2, Possible: 1, False: 0, Unspecified: 0 },
          unresolvedMatches: 1,
        },
      }),
      CFG,
    );
    expect(env.name).toContain('3 matches');
  });
});

describe('buildAsanaEnvelope — section routing', () => {
  it('routes first_screening to the firstScreening section', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.section).toBe('SEC-FIRST');
  });

  it('routes daily_monitoring to the dailyMonitoring section', () => {
    const env = buildAsanaEnvelope(
      makeReport({ header: { ...makeReport().header, mode: 'daily_monitoring' } }),
      CFG,
    );
    expect(env.section).toBe('SEC-DAILY');
  });
});

describe('buildAsanaEnvelope — notes', () => {
  it('includes the subject name in notes', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.notes).toContain('Zayd Al-Mansouri');
  });

  it('includes the entity type in notes', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.notes).toContain('Individual');
  });

  it('includes the mode (uppercased) in notes', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.notes).toContain('FIRST_SCREENING');
  });

  it('includes the generatedAt timestamp in notes', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.notes).toContain('2026-04-22T12:00:00Z');
  });

  it('shows 0 total matches when NO MATCHES FOUND', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.notes).toContain('Total matches: 0');
  });

  it('shows numeric total matches correctly', () => {
    const env = buildAsanaEnvelope(
      makeReport({
        keyFindings: {
          totalMatches: 5,
          resolvedMatches: 4,
          verdictBreakdown: { Positive: 3, Possible: 1, False: 1, Unspecified: 0 },
          unresolvedMatches: 1,
        },
      }),
      CFG,
    );
    expect(env.notes).toContain('Total matches: 5');
  });

  it('includes verdict breakdown in notes', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.notes).toMatch(/P=0\s*·\s*Ps=0\s*·\s*F=0\s*·\s*U=0/);
  });
});

describe('buildAsanaEnvelope — customFields', () => {
  it('sets subject field to the identity name', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.customFields?.subject).toBe('Zayd Al-Mansouri');
  });

  it('sets entity_type field', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.customFields?.entity_type).toBe('Individual');
  });

  it('sets mode field', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.customFields?.mode).toBe('first_screening');
  });

  it('sets total_matches to 0 when NO MATCHES FOUND', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.customFields?.total_matches).toBe(0);
  });

  it('sets total_matches to the numeric value when matches exist', () => {
    const env = buildAsanaEnvelope(
      makeReport({
        keyFindings: {
          totalMatches: 7,
          resolvedMatches: 5,
          verdictBreakdown: { Positive: 4, Possible: 2, False: 1, Unspecified: 0 },
          unresolvedMatches: 2,
        },
      }),
      CFG,
    );
    expect(env.customFields?.total_matches).toBe(7);
  });
});

describe('buildAsanaEnvelope — attachments', () => {
  it('attaches one JSON file', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.attachments).toHaveLength(1);
    expect(env.attachments![0].mimeType).toBe('application/json');
  });

  it('names the attachment after the caseId', () => {
    const env = buildAsanaEnvelope(makeReport(), CFG);
    expect(env.attachments![0].filename).toBe('HWK-0001.json');
  });

  it('attachment content is valid JSON that round-trips', () => {
    const report = makeReport();
    const env = buildAsanaEnvelope(report, CFG);
    const parsed = JSON.parse(env.attachments![0].content) as CaseReport;
    expect(parsed.identity.caseId).toBe('HWK-0001');
    expect(parsed.identity.name).toBe('Zayd Al-Mansouri');
  });
});

// ── deliverToAsana ────────────────────────────────────────────────────────────

describe('deliverToAsana — success path', () => {
  it('returns ok=true with taskGid and url on HTTP 200', async () => {
    const fakeResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { gid: 'TASK-GID-9999', permalink_url: 'https://app.asana.com/task/9999' },
      }),
    };
    const fakeFetch = async () => fakeResponse as unknown as Response;

    const result = await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(result.ok).toBe(true);
    expect(result.taskGid).toBe('TASK-GID-9999');
    expect(result.url).toBe('https://app.asana.com/task/9999');
    expect(result.error).toBeUndefined();
  });

  it('sends the request to the Asana tasks endpoint', async () => {
    let capturedUrl = '';
    const fakeFetch = async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { gid: 'G1', permalink_url: 'https://asana/G1' } }),
      } as unknown as Response;
    };

    await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(capturedUrl).toBe('https://app.asana.com/api/1.0/tasks');
  });

  it('sends Authorization header with Bearer token', async () => {
    let capturedHeaders: Record<string, string> = {};
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { gid: 'G1' } }),
      } as unknown as Response;
    };

    await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(capturedHeaders['Authorization']).toBe('Bearer test-pat');
  });

  it('sends POST with application/json content type', async () => {
    let capturedInit: RequestInit | undefined;
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { gid: 'G1' } }),
      } as unknown as Response;
    };

    await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(capturedInit?.method).toBe('POST');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('includes the projectGid in the request body', async () => {
    let capturedBody = '';
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { gid: 'G1' } }),
      } as unknown as Response;
    };

    await deliverToAsana(makeReport(), CFG, fakeFetch);

    const body = JSON.parse(capturedBody) as { data: { projects: string[] } };
    expect(body.data.projects).toContain('PROJ-1');
  });

  it('includes the correct section membership in the body', async () => {
    let capturedBody = '';
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { gid: 'G1' } }),
      } as unknown as Response;
    };

    await deliverToAsana(makeReport(), CFG, fakeFetch);

    const body = JSON.parse(capturedBody) as {
      data: { memberships: Array<{ project: string; section: string }> };
    };
    expect(body.data.memberships[0].section).toBe('SEC-FIRST');
  });
});

describe('deliverToAsana — HTTP error handling', () => {
  it('returns ok=false with error message on HTTP 401', async () => {
    const fakeFetch = async () =>
      ({ ok: false, status: 401, json: async () => ({}) } as unknown as Response);

    const result = await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns ok=false with error message on HTTP 403', async () => {
    const fakeFetch = async () =>
      ({ ok: false, status: 403, json: async () => ({}) } as unknown as Response);

    const result = await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
  });

  it('returns ok=false on HTTP 429 rate limit', async () => {
    const fakeFetch = async () =>
      ({ ok: false, status: 429, json: async () => ({}) } as unknown as Response);

    const result = await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('429');
  });

  it('returns ok=false on HTTP 500 server error', async () => {
    const fakeFetch = async () =>
      ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);

    const result = await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });
});

describe('deliverToAsana — network error handling', () => {
  it('returns ok=false with the error message on network throw', async () => {
    const fakeFetch = async (): Promise<Response> => {
      throw new Error('ECONNREFUSED');
    };

    const result = await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('returns ok=false with string coercion on non-Error throws', async () => {
    const fakeFetch = async (): Promise<Response> => {
      throw 'timeout';
    };

    const result = await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('timeout');
  });

  it('does not throw — always returns a result object', async () => {
    const fakeFetch = async (): Promise<Response> => {
      throw new Error('DNS failure');
    };

    await expect(deliverToAsana(makeReport(), CFG, fakeFetch)).resolves.toBeDefined();
  });
});

describe('deliverToAsana — partial Asana response', () => {
  it('returns taskGid as undefined when Asana body has no gid', async () => {
    const fakeFetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ data: {} }),
      } as unknown as Response);

    const result = await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(result.ok).toBe(true);
    expect(result.taskGid).toBeUndefined();
    expect(result.url).toBeUndefined();
  });

  it('returns ok=true even when data wrapper is missing', async () => {
    const fakeFetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response);

    const result = await deliverToAsana(makeReport(), CFG, fakeFetch);

    expect(result.ok).toBe(true);
  });
});
