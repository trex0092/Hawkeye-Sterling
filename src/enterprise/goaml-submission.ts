// Hawkeye Sterling — goAML submission adapter.
//
// Wraps the existing goaml-xml generator (in src/integrations/goaml-xml.ts)
// with a pluggable transport that can target:
//   - HTTPS endpoint (UAE FIU accepts XML POST at a licensed URL)
//   - SFTP (some regimes only accept batch drop)
//   - stub in-memory sink (tests + dev)
//
// The ACTUAL transport requires:
//   - a licensed endpoint URL per tenant
//   - mutual-TLS certificates issued by the regulator
//   - goAML credentials (username + password + report code)
//
// These cannot be provisioned from this repo, so the production HTTPS
// transport is implemented but will always require env-supplied credentials
// before it does anything real. The stub transport is the default.

import { AuditChain } from '../brain/audit-chain.js';

export interface GoamlSubmission {
  reportCode: string;                // STR | SAR | FFR | PNMR
  reportingEntity: string;
  submittedAt: string;
  payloadXml: string;                // already-serialised goAML XML
  tenantId: string;
}

export interface GoamlSubmissionReceipt {
  submissionId: string;              // regulator-side ID (or local UUID for stubs)
  acceptedAt: string;
  status: 'accepted' | 'rejected' | 'pending';
  regulatorMessage?: string;
  chainAnchor: string;               // audit-chain hash anchoring this submission
}

export interface GoamlTransport {
  submit(sub: GoamlSubmission): Promise<GoamlSubmissionReceipt>;
}

/** Default stub: records the submission + returns a synthetic receipt.
 *  Never leaves the local process; safe for tests. */
export class StubGoamlTransport implements GoamlTransport {
  public readonly submissions: GoamlSubmission[] = [];
  constructor(private readonly chain: AuditChain) {}

  async submit(sub: GoamlSubmission): Promise<GoamlSubmissionReceipt> {
    this.submissions.push(sub);
    const anchor = this.chain.append('goaml.stub-transport', 'submit', {
      reportCode: sub.reportCode,
      reportingEntity: sub.reportingEntity,
      submittedAt: sub.submittedAt,
      tenantId: sub.tenantId,
      payloadSize: sub.payloadXml.length,
    });
    return {
      submissionId: `local-${anchor.entryHash}`,
      acceptedAt: new Date().toISOString(),
      status: 'accepted',
      regulatorMessage: 'stubbed — no real regulator contact',
      chainAnchor: anchor.entryHash,
    };
  }
}

/** HTTPS transport. Requires endpoint URL + credentials; only submits
 *  when both are supplied. Otherwise throws so no silent no-op can ship
 *  against a real regulator. */
export interface HttpsGoamlCredentials {
  endpointUrl: string;
  username: string;
  password: string;
}

export class HttpsGoamlTransport implements GoamlTransport {
  constructor(
    private readonly credentials: HttpsGoamlCredentials,
    private readonly chain: AuditChain,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!credentials.endpointUrl) throw new Error('goAML HTTPS transport: endpointUrl missing');
    if (!credentials.username || !credentials.password) throw new Error('goAML HTTPS transport: credentials missing');
  }

  async submit(sub: GoamlSubmission): Promise<GoamlSubmissionReceipt> {
    const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`, 'utf8').toString('base64');
    const res = await this.fetchImpl(this.credentials.endpointUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        authorization: `Basic ${auth}`,
        'x-goaml-report-code': sub.reportCode,
        'x-tenant-id': sub.tenantId,
      },
      body: sub.payloadXml,
    });
    const anchor = this.chain.append('goaml.https-transport', 'submit', {
      reportCode: sub.reportCode,
      reportingEntity: sub.reportingEntity,
      submittedAt: sub.submittedAt,
      tenantId: sub.tenantId,
      payloadSize: sub.payloadXml.length,
      responseStatus: res.status,
    });
    if (!res.ok) {
      return {
        submissionId: `error-${anchor.entryHash}`,
        acceptedAt: new Date().toISOString(),
        status: 'rejected',
        regulatorMessage: `HTTP ${res.status} ${res.statusText}`,
        chainAnchor: anchor.entryHash,
      };
    }
    const body = await res.text();
    // goAML ACK format varies by regulator; surface verbatim.
    return {
      submissionId: extractSubmissionId(body) ?? `ack-${anchor.entryHash}`,
      acceptedAt: new Date().toISOString(),
      status: 'accepted',
      regulatorMessage: body.slice(0, 500),
      chainAnchor: anchor.entryHash,
    };
  }
}

function extractSubmissionId(xml: string): string | null {
  const m = /<SubmissionID[^>]*>([^<]+)<\/SubmissionID>/i.exec(xml)
    ?? /<Ref[^>]*>([^<]+)<\/Ref>/i.exec(xml);
  return m ? (m[1] ?? '').trim() : null;
}
