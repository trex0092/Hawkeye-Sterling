// POST /api/screen
// Runs the cognitive brain over a supplied subject and returns the Verdict
// with full reasoning chain and cognitive-depth metrics.

import type { Handler } from '@netlify/functions';
import { run, depthOf } from '../../src/brain/engine.js';
import type { Subject, Evidence } from '../../src/brain/types.js';

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

  const verdict = await run({
    subject,
    evidence: parsed.evidence ?? {},
    ...(parsed.domains ? { domains: parsed.domains } : {}),
  });

  const depth = depthOf(verdict);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      verdict,
      depth,
      notice:
        'Phase 1 scaffold — reasoning modes are stubs pending Phase 7. The reasoning-chain and depth metrics are real.',
    }),
  };
};
