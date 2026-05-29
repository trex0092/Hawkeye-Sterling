import { describe, it, expect, vi } from 'vitest';
import { AuditChain, fnv1a } from '../../brain/audit-chain.js';
import { StubGoamlTransport, HttpsGoamlTransport, type GoamlSubmission } from '../goaml-submission.js';

function makeChain() {
  // Use FNV-1a (non-cryptographic) for tests — avoids Node.js crypto dependency
  return new AuditChain(fnv1a);
}

function makeSub(overrides: Partial<GoamlSubmission> = {}): GoamlSubmission {
  return {
    reportCode: 'STR',
    reportingEntity: 'entity-01',
    submittedAt: new Date().toISOString(),
    payloadXml: '<goAML><Report><ReportCode>STR</ReportCode></Report></goAML>',
    tenantId: 'tenant-test',
    ...overrides,
  };
}

// ── StubGoamlTransport ────────────────────────────────────────────────────────

describe('StubGoamlTransport', () => {
  it('records the submission in its submissions array', async () => {
    const chain = makeChain();
    const transport = new StubGoamlTransport(chain);
    const sub = makeSub();

    await transport.submit(sub);

    expect(transport.submissions).toHaveLength(1);
    expect(transport.submissions[0]).toMatchObject({
      reportCode: 'STR',
      reportingEntity: 'entity-01',
      tenantId: 'tenant-test',
    });
  });

  it('returns an accepted receipt with a chain anchor', async () => {
    const chain = makeChain();
    const transport = new StubGoamlTransport(chain);

    const receipt = await transport.submit(makeSub());

    expect(receipt.status).toBe('accepted');
    expect(receipt.submissionId).toMatch(/^local-/);
    expect(receipt.chainAnchor).toBeDefined();
    expect(receipt.chainAnchor.length).toBeGreaterThan(0);
  });

  it('writes two distinct chain entries for two submissions', async () => {
    const chain = makeChain();
    const transport = new StubGoamlTransport(chain);

    const r1 = await transport.submit(makeSub({ reportCode: 'STR' }));
    const r2 = await transport.submit(makeSub({ reportCode: 'SAR' }));

    expect(r1.chainAnchor).not.toBe(r2.chainAnchor);
    expect(transport.submissions).toHaveLength(2);
  });
});

// ── HttpsGoamlTransport ───────────────────────────────────────────────────────

describe('HttpsGoamlTransport', () => {
  it('throws at construction when endpointUrl is missing', () => {
    const chain = makeChain();
    expect(() => new HttpsGoamlTransport(
      { endpointUrl: '', username: 'test-goaml-user', password: 'test-placeholder-not-real' },
      chain,
    )).toThrow('endpointUrl missing');
  });

  it('throws at construction when credentials are missing', () => {
    const chain = makeChain();
    expect(() => new HttpsGoamlTransport(
      { endpointUrl: 'https://fiu.example.com/submit', username: '', password: '' },
      chain,
    )).toThrow('credentials missing');
  });

  it('returns a rejected receipt on HTTP 4xx response', async () => {
    const chain = makeChain();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('<Error>Rejected</Error>', { status: 400, statusText: 'Bad Request' }),
    );
    const transport = new HttpsGoamlTransport(
      { endpointUrl: 'https://fiu.example.com/submit', username: 'test-goaml-user', password: 'test-placeholder-not-real' },
      chain,
      mockFetch,
    );

    const receipt = await transport.submit(makeSub());

    expect(receipt.status).toBe('rejected');
    expect(receipt.regulatorMessage).toContain('400');
    expect(receipt.chainAnchor).toBeDefined();
  });

  it('returns an accepted receipt on HTTP 200 with SubmissionID', async () => {
    const chain = makeChain();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('<SubmissionID>FIU-2026-001</SubmissionID>', { status: 200 }),
    );
    const transport = new HttpsGoamlTransport(
      { endpointUrl: 'https://fiu.example.com/submit', username: 'test-goaml-user', password: 'test-placeholder-not-real' },
      chain,
      mockFetch,
    );

    const receipt = await transport.submit(makeSub());

    expect(receipt.status).toBe('accepted');
    expect(receipt.submissionId).toBe('FIU-2026-001');
  });

  it('sends correct HTTP headers including Basic auth and report code', async () => {
    const chain = makeChain();
    const mockFetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    const transport = new HttpsGoamlTransport(
      { endpointUrl: 'https://fiu.example.com/submit', username: 'test-mlro-user', password: 'test-placeholder-not-real' },
      chain,
      mockFetch,
    );

    await transport.submit(makeSub({ reportCode: 'SAR', tenantId: 'tenant-2' }));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toMatch(/^Basic /);
    expect(headers['x-goaml-report-code']).toBe('SAR');
    expect(headers['x-tenant-id']).toBe('tenant-2');
  });
});
