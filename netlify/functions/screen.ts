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
import { SOURCE_ADAPTERS } from '../../src/ingestion/index.js';
import { getBlobsStore } from '../../src/ingestion/blobs-store.js';
import { matchAgainstUniverse } from '../../src/ingestion/matcher.js';
import type { SanctionsHit } from '../../src/ingestion/matcher.js';
import type { NormalisedEntity } from '../../src/ingestion/types.js';

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

  // Load ingested sanctions universe from Blobs and pre-populate
  // evidence.sanctionsHits with fuzzy-matched candidates. If the dataset
  // hasn't been refreshed yet, fall back to whatever was supplied on the wire.
  const evidence: Evidence = { ...(parsed.evidence ?? {}) };
  let sanctionsHits: SanctionsHit[] = Array.isArray(evidence.sanctionsHits)
    ? (evidence.sanctionsHits as SanctionsHit[])
    : [];
  const listsQueried: string[] = [];
  const listsWithData: string[] = [];
  try {
    const store = await getBlobsStore();
    const universe: NormalisedEntity[] = [];
    for (const adapter of SOURCE_ADAPTERS) {
      listsQueried.push(adapter.id);
      const snap = await store.getLatest(adapter.id);
      if (snap && snap.entities.length > 0) {
        listsWithData.push(adapter.id);
        universe.push(...snap.entities);
      }
    }
    if (universe.length > 0) {
      const matched = matchAgainstUniverse(
        subject.name, subject.aliases ?? [], universe,
        { threshold: 0.72, topK: 25 },
      );
      if (matched.length > 0) {
        // Merge: matched wins, supplied is deduped by id.
        const seen = new Set(matched.map((m) => m.id));
        const merged = [...matched];
        for (const s of sanctionsHits) {
          const key = typeof (s as { id?: unknown }).id === 'string' ? (s as { id: string }).id : '';
          if (key && !seen.has(key)) { merged.push(s); seen.add(key); }
        }
        sanctionsHits = merged;
        evidence.sanctionsHits = merged;
      }
    }
  } catch {
    // Ingestion optional — fall through on any error; brain still runs.
  }

  const verdict = await run({
    subject,
    evidence,
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
    lists_checked: listsQueried,
    lists_with_ingested_data: listsWithData,
    list_versions: {
      note: listsWithData.length > 0
        ? `Live data from ${listsWithData.length}/${listsQueried.length} lists via Netlify Blobs.`
        : 'Ingestion pipeline wired but no refresh has populated Blobs yet — run /.netlify/functions/refresh-lists.',
    },
    jurisdictions_covered: subject.jurisdiction ? [subject.jurisdiction] : ['not_specified'],
    matching_method: sanctionsHits.length > 0
      ? 'composite_fuzzy' as const
      : 'pending_data' as const,
    matching_method_note:
      'Composite score of Jaro-Winkler + token-set + 3-gram Jaccard + Levenshtein-ratio + Double-Metaphone phonetic, with Latin / Arabic / Cyrillic / CJK script strategies.',
    matches_returned: sanctionsHits.length,
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
  if (listsWithData.length === 0) {
    gaps.push('Sanctions datasets have not been refreshed yet — run the scheduled refresh function (netlify functions:invoke refresh-lists).');
  }
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
    listsWithData.length === 0
      ? 'Trigger refresh-lists to populate sanctions Blobs before relying on match output.'
      : `Review the ${sanctionsHits.length} composite fuzzy-matched candidates attached to FINDINGS.`,
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
      sanctionsHits,
      injectionHits,
      policyViolations,
      notice:
        'Wave-4 brain: 70 reasoning modes run with production algorithms over the supplied evidence; remaining modes stay as declared stubs. ' +
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
