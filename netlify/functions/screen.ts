// POST /api/screen
// Runs the cognitive brain over a supplied subject and returns the Verdict
// with full reasoning chain and cognitive-depth metrics.

import type { Handler } from '@netlify/functions';
import { run, depthOf } from '../../src/brain/engine.js';
import type { Subject, Evidence } from '../../src/brain/types.js';
import {
  COMPLIANCE_POLICY_VERSION,
  MANDATORY_OUTPUT_SECTIONS,
  buildAuditLine,
  scanForInjection,
  scanForPolicyViolations,
} from '../../src/brain/compliance-policy.js';

interface ScreenRequestBody {
  subject?: Partial<Subject>;
  evidence?: Evidence;
  domains?: string[];
}

function jsonErr(statusCode: number, message: string) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ error: message }),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonErr(405, 'method-not-allowed');
  }
  if (!event.body) return jsonErr(400, 'empty-body');

  let parsed: ScreenRequestBody;
  try {
    parsed = JSON.parse(event.body) as ScreenRequestBody;
  } catch {
    return jsonErr(400, 'invalid-json');
  }

  const name = (parsed.subject?.name ?? '').trim();
  if (!name || name.length > 256) return jsonErr(400, 'subject.name required (1-256 chars)');

  const subjectType = parsed.subject?.type ?? 'individual';
  const allowedTypes: Subject['type'][] = ['individual', 'entity', 'vessel', 'wallet', 'aircraft'];
  if (!allowedTypes.includes(subjectType)) return jsonErr(400, 'invalid subject.type');

  const subject: Subject = {
    name,
    type: subjectType,
    ...(parsed.subject?.aliases ? { aliases: parsed.subject.aliases.slice(0, 32) } : {}),
    ...(parsed.subject?.jurisdiction ? { jurisdiction: parsed.subject.jurisdiction } : {}),
    ...(parsed.subject?.dateOfBirth ? { dateOfBirth: parsed.subject.dateOfBirth } : {}),
    ...(parsed.subject?.dateOfIncorporation
      ? { dateOfIncorporation: parsed.subject.dateOfIncorporation } : {}),
    ...(parsed.subject?.identifiers ? { identifiers: parsed.subject.identifiers } : {}),
  };

  // Scan supplied evidence for prompt-injection patterns. These are DATA,
  // not instructions — we flag them but do not act on them.
  const evidenceBlob = JSON.stringify(parsed.evidence ?? {});
  const injectionHits = scanForInjection(evidenceBlob);

  const verdict = await run({
    subject,
    evidence: parsed.evidence ?? {},
    ...(parsed.domains ? { domains: parsed.domains } : {}),
  });

  const depth = depthOf(verdict);

  // Build the mandatory output structure.
  const scopeHash = simpleHash(JSON.stringify({ subject, domains: parsed.domains ?? [] }));
  const auditLine = buildAuditLine(scopeHash);

  const subjectIdentifiers = {
    as_supplied: subject,
    parsed: {
      name_normalised: subject.name.trim(),
      aliases: subject.aliases ?? [],
      identifiers: subject.identifiers ?? {},
    },
  };

  const scopeDeclaration = {
    lists_checked: [
      'UN Consolidated', 'OFAC SDN', 'OFAC Consolidated', 'EU FSF',
      'UK OFSI', 'UAE EOCN', 'UAE Local Terrorist List',
    ],
    list_versions: {
      note: 'Phase 1 — list ingestion not yet wired; versions surfaced in Phase 2.',
    },
    jurisdictions_covered: subject.jurisdiction ? [subject.jurisdiction] : ['not_specified'],
    matching_method: 'none' as const,
    matching_method_note:
      'Phase 1 — fuzzy matching (Levenshtein / Jaro-Winkler / Double-Metaphone / Arabic-root) ships in Phase 3.',
    identifiers_matched_on: Object.keys(subject.identifiers ?? {}),
    identifiers_absent: [
      !subject.dateOfBirth && !subject.dateOfIncorporation ? 'date_of_birth_or_incorporation' : null,
      !subject.jurisdiction ? 'jurisdiction' : null,
      !subject.identifiers || Object.keys(subject.identifiers).length === 0
        ? 'strong_identifier'
        : null,
    ].filter((x): x is string => x !== null),
  };

  const gaps: string[] = [];
  if (scopeDeclaration.identifiers_absent.length > 0) {
    gaps.push(
      `Missing identifiers: ${scopeDeclaration.identifiers_absent.join(', ')}. Per P6/P10, ` +
        'cannot proceed to disposition without disambiguators.',
    );
  }
  gaps.push('Phase 1 build: authoritative list ingestion and live fuzzy matching not yet active (Phase 2 / Phase 3).');
  if (injectionHits.length > 0) {
    gaps.push(
      `Prompt-injection patterns in supplied evidence: ${injectionHits
        .map((h) => h.id)
        .join(', ')}. Treated as data, not instructions.`,
    );
  }

  const redFlags: string[] = verdict.findings
    .filter((f) => f.verdict === 'flag' || f.verdict === 'escalate' || f.verdict === 'block')
    .slice(0, 20)
    .map((f) => `${f.modeId}: ${f.rationale}`);

  const recommendedNextSteps = verdict.recommendedActions.concat([
    'Run authoritative sanctions list lookup when Phase 2 ingestion is live.',
    'Apply fuzzy + transliteration matching when Phase 3 is live.',
    'MLRO review required before any disposition.',
  ]);

  // Self-scan the output for policy violations before returning.
  const selfScanBlob = JSON.stringify({ redFlags, recommendedNextSteps });
  const policyViolations = scanForPolicyViolations(selfScanBlob);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      policy: {
        version: COMPLIANCE_POLICY_VERSION,
        sections: MANDATORY_OUTPUT_SECTIONS,
      },
      SUBJECT_IDENTIFIERS: subjectIdentifiers,
      SCOPE_DECLARATION: scopeDeclaration,
      FINDINGS: verdict.findings,
      GAPS: gaps,
      RED_FLAGS: redFlags,
      RECOMMENDED_NEXT_STEPS: recommendedNextSteps,
      AUDIT_LINE: auditLine,
      // Engine-native artefacts preserved for the HUD:
      verdict,
      depth,
      injectionHits,
      policyViolations,
      notice:
        'Phase 1 scaffold — most reasoning modes are stubs pending Phase 7 (5 ship with production logic). ' +
        'Output conforms to the UAE-DNFBP-PM compliance-policy mandatory structure. ' +
        'This output is decision support, not a decision. MLRO review required.',
    }),
  };
};

function simpleHash(s: string): string {
  // 32-bit FNV-1a — scope fingerprinting only, not cryptographic.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
