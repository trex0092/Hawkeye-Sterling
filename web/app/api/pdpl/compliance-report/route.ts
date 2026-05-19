// Hawkeye Sterling — PDPL compliance posture report.
// GET /api/pdpl/compliance-report
// Returns structured compliance status for each PDPL article.

import { NextRequest, NextResponse } from 'next/server';

interface PdplArticleStatus {
  article: string;
  title: string;
  status: 'compliant' | 'partial' | 'non-compliant' | 'exempt';
  notes: string;
  controls: string[];
}

export async function GET(_req: NextRequest) {
  const articles: PdplArticleStatus[] = [
    {
      article: 'Art.6',
      title: 'Lawful Basis for Processing',
      status: 'compliant',
      notes: 'AML screening conducted under Art.6(b) legal obligation (CBUAE AML Standards) and Art.6(c) legitimate interest. Consent tracking endpoint available at /api/pdpl/consent.',
      controls: [
        'Lawful basis recorded per subject at /api/pdpl/consent',
        'AML legal obligation documented in CLAUDE.md compliance charter',
        'No personal data processed beyond AML/CFT purpose',
      ],
    },
    {
      article: 'Art.7',
      title: 'Sensitive Data Processing',
      status: 'compliant',
      notes: 'Sensitive categories (biometric, health, political opinion) are not collected. PII is limited to identity verification fields required for AML/CFT.',
      controls: [
        'PDPL-guard redaction layer active (src/brain/pdpl-guard.ts)',
        'No biometric or health data collected',
        'PII field scanning before outbound export',
      ],
    },
    {
      article: 'Art.13',
      title: 'Data Minimisation',
      status: 'partial',
      notes: 'Retention scheduler enforces 10-year AML retention. Discretionary PII fields outside retention window are scheduled for review. Google Fonts self-hosting pending (CG-5).',
      controls: [
        'Retention scheduler runs daily at 23:15 UTC',
        'Feedback journal purged after retention window',
        'PDPL-guard redacts PII in audit exports',
        'PENDING: Self-host Google Fonts to avoid cross-border transfer',
      ],
    },
    {
      article: 'Art.17',
      title: 'Right to Erasure',
      status: 'partial',
      notes: 'AML records exempt from erasure (FDL 10/2025 Art.20). Erasure request intake available at /api/pdpl/erasure. Non-AML discretionary data review process pending.',
      controls: [
        'Erasure request endpoint at /api/pdpl/erasure',
        'AML exemption documented and communicated to requestors',
        'PENDING: Automated non-AML data erasure workflow',
      ],
    },
    {
      article: 'Art.22',
      title: 'Cross-Border Data Transfer',
      status: 'partial',
      notes: 'Data processed within Netlify infrastructure. OpenSanctions API calls involve data transfer to EU servers. Google Fonts CDN issue (CG-5) pending resolution.',
      controls: [
        'Netlify region: US-East (default) — UAE region preferred',
        'OpenSanctions: EU-based, GDPR-compliant',
        'PENDING: Self-host Google Fonts',
        'PENDING: Netlify UAE region selection',
      ],
    },
    {
      article: 'Art.23',
      title: 'Data Processor Agreements',
      status: 'partial',
      notes: 'DPAs required with Netlify, Anthropic, Upstash Redis, OpenSanctions, and news API vendors.',
      controls: [
        'PENDING: DPA with Netlify',
        'PENDING: DPA with Anthropic',
        'PENDING: DPA with Upstash Redis',
        'Anthropic privacy policy reviewed — EU SCCs available',
      ],
    },
  ];

  const compliant = articles.filter(a => a.status === 'compliant').length;
  const partial = articles.filter(a => a.status === 'partial').length;
  const nonCompliant = articles.filter(a => a.status === 'non-compliant').length;

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    framework: 'UAE Personal Data Protection Law (FDL 45/2021)',
    overallStatus: nonCompliant > 0 ? 'non-compliant' : partial > 0 ? 'partial' : 'compliant',
    summary: { compliant, partial, nonCompliant, exempt: articles.filter(a => a.status === 'exempt').length },
    articles,
    legalReferences: [
      'UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection',
      'UAE FDL 10/2025 Art.20 (AML record retention)',
      'CBUAE AML/CFT Standards (2023)',
    ],
  });
}
