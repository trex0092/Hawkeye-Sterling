import { describe, it, expect, vi } from 'vitest';
import { deliverToAsana, buildAsanaEnvelope, type AsanaConfig } from '../asana.js';
import type { CaseReport } from '../../reports/caseReport.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CFG: AsanaConfig = {
  personalAccessToken: 'test-pat-123',
  workspaceGid: 'ws-001',
  projectGid: 'proj-001',
  sections: { firstScreening: 'sec-first', dailyMonitoring: 'sec-daily' },
};

function makeReport(overrides: Partial<CaseReport['keyFindings']> = {}): CaseReport {
  return {
    header: {
      product: 'Hawkeye Sterling V2',
      reportKind: 'CASE REPORT',
      confidential: true,
      generatedAt: '2026-04-26T00:00:00Z',
      printedBy: 'mlro@example.ae',
      group: 'Compliance',
      mode: 'first_screening',
    },
    identity: {
      caseId: 'HWK-SMOKE-001',
      recordUid: 'rec-smoke-001',
      name: 'Smoke Test Subject',
      entityType: 'Individual',
      citizenship: ['AE'],
      identificationNumbers: [],
    },
    keyFindings: {
      totalMatches: 0,
      resolvedMatches: 0,
      verdictBreakdown: { Positive: 0, Possible: 0, False: 0, Unspecified: 0 },
      unresolvedMatches: 0,
      ...overrides,
    },
    reasoningChain: [],
    audit: [],
    sources: [],
    notes: { timezone: 'UTC', legalNotice: 'Confidential.' },
  };
}

// Builds a minimal fetch mock that returns success for task create and all attachments
function mockFetch(overrides?: {
  taskStatus?: number;
  taskBody?: object;
  attachmentStatus?: number;
}) {
  const { taskStatus = 200, taskBody, attachmentStatus = 200 } = overrides ?? {};
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/tasks') && !u.includes('/attachments')) {
      return new Response(
        JSON.stringify(
          taskBody ?? { data: { gid: 'task-gid-999', permalink_url: 'https://app.asana.com/0/proj/task-gid-999' } },
        ),
        { status: taskStatus },
      );
    }
    if (u.includes('/attachments')) {
      return new Response(JSON.stringify({ data: { gid: 'att-gid-1' } }), {
        status: attachmentStatus,
      });
    }
    return new Response('Not found', { status: 404 });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Asana smoke tests — deliverToAsana', () => {

  // ── Test 1: Task creation success ─────────────────────────────────────────
  it('T1 — creates task and returns taskGid + url on success', async () => {
    const fetch = mockFetch();
    const result = await deliverToAsana(makeReport(), CFG, fetch as typeof globalThis.fetch);

    expect(result.ok).toBe(true);
    expect(result.taskGid).toBe('task-gid-999');
    expect(result.url).toBe('https://app.asana.com/0/proj/task-gid-999');
    expect(result.error).toBeUndefined();
  });

  // ── Test 2: Attachment is uploaded after task creation ───────────────────
  it('T2 — uploads JSON evidence attachment after task creation', async () => {
    const fetch = mockFetch();
    await deliverToAsana(makeReport(), CFG, fetch as typeof globalThis.fetch);

    const calls = fetch.mock.calls.map((c) => String(c[0]));
    const taskCall = calls.find((u) => u.includes('/tasks') && !u.includes('/attachments'));
    const attachCall = calls.find((u) => u.includes('/attachments'));

    expect(taskCall).toBeDefined();   // task was created
    expect(attachCall).toBeDefined(); // attachment was uploaded
    expect(attachCall).toContain('task-gid-999');
  });

  // ── Test 3: Envelope title includes subject name and case id ─────────────
  it('T3 — envelope name includes subject name, mode tag, and case ID', () => {
    const envelope = buildAsanaEnvelope(makeReport(), CFG);

    expect(envelope.name).toContain('Smoke Test Subject');
    expect(envelope.name).toContain('HWK-SMOKE-001');
    expect(envelope.name).toMatch(/\[FIRST\]/); // first_screening mode
    expect(envelope.section).toBe(CFG.sections.firstScreening);
  });

  // ── Test 4: Daily monitoring uses correct section ─────────────────────────
  it('T4 — daily_monitoring mode routes to dailyMonitoring section', () => {
    const report = makeReport();
    report.header.mode = 'daily_monitoring';
    const envelope = buildAsanaEnvelope(report, CFG);

    expect(envelope.section).toBe(CFG.sections.dailyMonitoring);
    expect(envelope.name).toMatch(/\[DAILY\]/);
  });

  // ── Test 5: Auth failure (401) — returns ok:false with status in error ───
  it('T5 — returns ok:false with HTTP status when Asana returns 401', async () => {
    const fetch = mockFetch({ taskStatus: 401, taskBody: { errors: [{ message: 'Not authorized' }] } });
    const result = await deliverToAsana(makeReport(), CFG, fetch as typeof globalThis.fetch);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
    expect(result.taskGid).toBeUndefined();
  });

  // ── Test 6: Server error (500) — returns ok:false, does not throw ────────
  it('T6 — returns ok:false gracefully on Asana 500, does not throw', async () => {
    const fetch = mockFetch({ taskStatus: 500 });
    await expect(
      deliverToAsana(makeReport(), CFG, fetch as typeof globalThis.fetch),
    ).resolves.toMatchObject({ ok: false });
  });

  // ── Test 7: Attachment failure is non-fatal + warns ──────────────────────
  it('T7 — attachment failure is non-fatal: task ok:true, console.warn emitted', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = mockFetch({ attachmentStatus: 403 });

    const result = await deliverToAsana(makeReport(), CFG, fetch as typeof globalThis.fetch);

    expect(result.ok).toBe(true);        // task still created
    expect(result.taskGid).toBe('task-gid-999');
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('attachment');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('403');

    warnSpy.mockRestore();
  });

  // ── Test 8: AbortError is caught, returns ok:false without throwing ───────
  it('T8 — AbortError (e.g. from internal timeout) is caught and returned as ok:false', async () => {
    // Immediately throw AbortError — simulates what happens when the internal
    // 10s AbortController fires. We can't wait 10s in a unit test.
    const abortFetch = vi.fn(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    const result = await deliverToAsana(
      makeReport(),
      CFG,
      abortFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('aborted');
    expect(result.taskGid).toBeUndefined();
  });

  // ── Test 9: Envelope has JSON attachment by default ──────────────────────
  it('T9 — envelope always includes at least one JSON attachment', () => {
    const envelope = buildAsanaEnvelope(makeReport(), CFG);

    expect(envelope.attachments).toBeDefined();
    expect(envelope.attachments!.length).toBeGreaterThan(0);

    const jsonAtt = envelope.attachments!.find((a) => a.mimeType === 'application/json');
    expect(jsonAtt).toBeDefined();
    expect(jsonAtt!.filename).toContain('HWK-SMOKE-001');

    // Attachment content must be valid JSON containing the report
    const parsed = JSON.parse(jsonAtt!.content) as { identity?: { name?: string } };
    expect(parsed?.identity?.name).toBe('Smoke Test Subject');
  });

  // ── Test 10: High-match report reflected in task name ────────────────────
  it('T10 — task name shows correct match count for flagged subject', () => {
    const report = makeReport({ totalMatches: 3 });
    const envelope = buildAsanaEnvelope(report, CFG);

    expect(envelope.name).toContain('3 matches');
    expect(envelope.notes).toContain('Total matches: 3');
  });

  // ── Test 11: Zero matches report reflected correctly ─────────────────────
  it('T11 — "NO MATCHES FOUND" is treated as 0 in task name and notes', () => {
    const report = makeReport({ totalMatches: 'NO MATCHES FOUND' });
    const envelope = buildAsanaEnvelope(report, CFG);

    expect(envelope.name).toContain('0 matches');
    expect(envelope.notes).toContain('Total matches: 0');
  });

  // ── Test 12: Network failure (not a timeout) returns ok:false ────────────
  it('T12 — network-level error (ECONNREFUSED) returns ok:false without throwing', async () => {
    const failFetch = vi.fn(async () => {
      throw new Error('fetch failed: ECONNREFUSED');
    });

    const result = await deliverToAsana(
      makeReport(),
      CFG,
      failFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
