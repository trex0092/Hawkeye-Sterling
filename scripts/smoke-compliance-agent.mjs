#!/usr/bin/env node
// Hawkeye Sterling — live-model smoke test for the compliance egress gate.
//
// Builds a clean CaseReport + CLEAN_NARRATIVE, calls invokeComplianceAgent
// against the real Anthropic API, then calls gatedAsanaDelivery with a fake
// Asana transport so the full wire-up executes end-to-end. Prints verdict,
// status, candidate dispositions, charter hash, elapsed ms.
//
// Usage:
//   npm run build
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/smoke-compliance-agent.mjs
//
// Optional env:
//   COMPLIANCE_MODEL   default claude-opus-4-7
//   BUDGET_MS          default 25000
//
// Exit codes:
//   0  gate returned a verdict (approved / held / blocked / incomplete)
//   1  API key missing, dist not built, or transport failure
//
// No output is sent to any external party; the fake Asana transport captures
// the delivery attempt locally so no real ticket is created.

import { invokeComplianceAgent } from '../dist/src/integrations/complianceAgent.js';
import { gatedAsanaDelivery } from '../dist/src/integrations/egressGate.js';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set. Export it and re-run.');
  process.exit(1);
}

const model = process.env.COMPLIANCE_MODEL ?? 'claude-opus-4-7';
const budgetMs = Number(process.env.BUDGET_MS ?? 25_000);

const report = {
  header: {
    product: 'Hawkeye Sterling V2',
    reportKind: 'CASE REPORT',
    confidential: true,
    generatedAt: new Date().toISOString(),
    printedBy: 'smoke-test@example.ae',
    group: 'Compliance',
    mode: 'first_screening',
  },
  identity: {
    caseId: 'HWK-SMOKE-0001',
    recordUid: 'rec-smoke-0001',
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
    date: new Date().toISOString(),
    actionedBy: 'system',
    action: 'case_generated',
    source: 'Desktop',
  }],
  sources: [
    { date: '2026-04-20', url: 'https://scsanctions.un.org/consolidated', title: 'UN Consolidated List' },
    { date: '2026-04-20', url: 'https://sanctionssearch.ofac.treas.gov/', title: 'OFAC SDN' },
  ],
  notes: { timezone: 'UTC', legalNotice: 'Confidential.' },
};

const narrative = [
  'SUBJECT IDENTIFIERS: Zayd Al-Mansouri, passport AE1234567.',
  'SCOPE DECLARATION: Lists checked: UN Consolidated (2026-04-20), OFAC SDN (2026-04-20).',
  'FINDINGS: NO MATCH at any confidence level across all lists.',
  'GAPS: No further identifiers required at this stage.',
  'RED FLAGS: None observed.',
  'RECOMMENDED NEXT STEPS: Proceed to standard onboarding.',
  'AUDIT LINE: This output is decision support, not a decision. MLRO review required. charterIntegrityHash attached.',
].join('\n');

function fmt(label, value) {
  console.log(`  ${label.padEnd(24, ' ')} ${value}`);
}

async function main() {
  console.log('── Stage 1 · direct invokeComplianceAgent (live model) ──');
  const t0 = Date.now();
  const direct = await invokeComplianceAgent(
    { caseReport: report, draftNarrative: narrative, audience: 'regulator' },
    { apiKey, model, budgetMs },
  );
  const dt = Date.now() - t0;

  fmt('verdict', direct.verdict);
  fmt('ok', direct.ok);
  fmt('partial', direct.partial);
  fmt('elapsedMs (reported)', direct.elapsedMs);
  fmt('elapsedMs (wallclock)', dt);
  fmt('charter hash', direct.charterIntegrityHash);
  fmt('prohibition checks', direct.prohibitionChecks.length);
  fmt('blocking issues', direct.blockingIssues.length);
  fmt('concerns', direct.concerns.length);
  fmt('candidate dispositions', JSON.stringify(direct.candidateDispositions));
  fmt('semantic tail (200c)',
    direct.semanticReview ? direct.semanticReview.slice(-200).replace(/\n/g, ' ') : '<none>');
  if (direct.error) fmt('error', direct.error);

  console.log('\n── Stage 2 · gatedAsanaDelivery with fake transport ──');
  let deliveryAttempted = false;
  const fakeDeliver = async (caseReport, _cfg) => {
    deliveryAttempted = true;
    return { ok: true, taskGid: 'SMOKE-GID', url: `local://${caseReport.identity.caseId}` };
  };

  const gated = await gatedAsanaDelivery(
    { report, draftNarrative: narrative },
    {
      personalAccessToken: 'fake',
      workspaceGid: 'W',
      projectGid: 'P',
      sections: { firstScreening: 'S1', dailyMonitoring: 'S2' },
    },
    { apiKey, model, budgetMs },
    { deliverAsana: fakeDeliver },
  );

  fmt('released', gated.released);
  fmt('status', gated.status);
  fmt('gate verdict', gated.gate.verdict);
  fmt('delivery attempted', deliveryAttempted);
  fmt('delivery gid', gated.delivery?.taskGid ?? '<none>');

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke test failed:', err?.message ?? err);
  process.exit(1);
});
