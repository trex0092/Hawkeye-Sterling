// Hawkeye Sterling — Synthetic Red-Team Scenario Generator (Wave 14 Feature 8).
// Generates novel AML/CFT regression-test scenarios using Claude Opus.
// Content-frozen system prompt per UAE FDL 10/2025 Art.18 (prompt-hash-manifest).

import type { RegressionScenario } from './registry/eval-harness.js';

export interface ScenarioGenParams {
  typology: string;
  jurisdiction: string;
  entityType: 'individual' | 'organisation' | 'vessel';
  evasionSophistication: 1 | 2 | 3 | 4 | 5;
  count: number;
  existingIds?: string[];
}

export interface ScenarioGenResult {
  added: number;
  scenarios: RegressionScenario[];
  rejectedCount: number;
  rejectionReasons: string[];
}

export const SCENARIO_GEN_SYSTEM_PROMPT =
  'You are an AML/CFT red-team specialist generating regression test scenarios for a ' +
  'production compliance platform. Each scenario must:\n' +
  '1. Be realistic — based on real FATF typology reports and goAML case studies.\n' +
  '2. Have a clear goldVerdict: "proceed" | "escalate" | "str" | "block".\n' +
  '3. Include specific regulatory citations (FDL 10/2025, FATF R.XX, etc.).\n' +
  '4. NOT contain real names, real company numbers, or real financial data.\n' +
  '5. Have a goldCitations array with at least one regulatory article reference.\n' +
  'Output a JSON array of objects with fields: id, description, subject, facts, ' +
  'goldVerdict, goldCitations, cluster, evasionSophistication (1-5).';

const PII_PATTERNS = [
  /\b[A-Z][a-z]+ [A-Z][a-z]+\b.*\b(19|20)\d{2}\b/,  // Name + year pattern
  /\b\d{8,}\b/,                                         // Long numeric ID
  /passport|national\s+id|ssn|social\s+security/i,
];

function detectPii(text: string): string | null {
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(text)) return `PII pattern detected: ${pattern.source}`;
  }
  return null;
}

function validateScenario(
  raw: unknown,
  existingIds: Set<string>,
): { valid: boolean; reason?: string; scenario?: RegressionScenario } {
  if (typeof raw !== 'object' || raw === null) return { valid: false, reason: 'Not an object' };
  const r = raw as Record<string, unknown>;

  if (!r['id'] || typeof r['id'] !== 'string') return { valid: false, reason: 'Missing id' };
  if (!r['description'] || typeof r['description'] !== 'string') return { valid: false, reason: 'Missing description' };
  if (!r['goldVerdict'] || !['proceed', 'escalate', 'str', 'block'].includes(r['goldVerdict'] as string))
    return { valid: false, reason: `Invalid goldVerdict: ${r['goldVerdict']}` };
  if (!Array.isArray(r['goldCitations']) || r['goldCitations'].length === 0)
    return { valid: false, reason: 'Missing goldCitations' };
  if (existingIds.has(r['id'])) return { valid: false, reason: `Duplicate id: ${r['id']}` };

  const piiCheck = detectPii(JSON.stringify(raw));
  if (piiCheck) return { valid: false, reason: piiCheck };

  return {
    valid: true,
    scenario: {
      id: r['id'] as string,
      description: r['description'] as string,
      subject: (r['subject'] as Record<string, unknown>) ?? {},
      facts: (r['facts'] as string[]) ?? [],
      goldVerdict: r['goldVerdict'] as RegressionScenario['goldVerdict'],
      goldCitations: r['goldCitations'] as string[],
      cluster: (r['cluster'] as string) ?? 'generated',
      source: 'generated',
    } as unknown as RegressionScenario,
  };
}

export async function generateScenarios(
  params: ScenarioGenParams,
  apiKey?: string,
): Promise<ScenarioGenResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { default: AnthropicCtor } = await import('@anthropic-ai/sdk' as string).catch(() => {
    throw new Error('ANTHROPIC_SDK_UNAVAILABLE: @anthropic-ai/sdk not found in this execution context');
  }) as { default: new(opts: Record<string, string>) => Record<string, unknown> };

  const effectiveKey = apiKey ?? process.env['ANTHROPIC_API_KEY'];
  const clientOpts: Record<string, string> = {};
  if (effectiveKey !== undefined) clientOpts['apiKey'] = effectiveKey;
  const client = new AnthropicCtor(clientOpts) as { messages: { create(opts: unknown): Promise<{ content: Array<{ type: string; text?: string }> }> } };
  const existingIdSet = new Set(params.existingIds ?? []);

  const userPrompt =
    `Generate ${params.count} novel AML scenarios:\n` +
    `- Typology: ${params.typology}\n` +
    `- Jurisdiction: ${params.jurisdiction}\n` +
    `- Entity type: ${params.entityType}\n` +
    `- Evasion sophistication: ${params.evasionSophistication} (1=obvious, 5=sophisticated)\n` +
    `Ensure no scenario duplicates these IDs: [${(params.existingIds ?? []).slice(0, 20).join(', ')}]\n` +
    `Output only the JSON array.`;

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: SCENARIO_GEN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');

  let rawScenarios: unknown[] = [];
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) rawScenarios = JSON.parse(jsonMatch[0]) as unknown[];
  } catch {
    return { added: 0, scenarios: [], rejectedCount: params.count, rejectionReasons: ['JSON parse failure'] };
  }

  const valid: RegressionScenario[] = [];
  const rejectionReasons: string[] = [];

  for (const raw of rawScenarios) {
    const result = validateScenario(raw, existingIdSet);
    if (result.valid && result.scenario) {
      valid.push(result.scenario);
      existingIdSet.add(result.scenario.id);
    } else {
      rejectionReasons.push(result.reason ?? 'Unknown');
    }
  }

  return {
    added: valid.length,
    scenarios: valid,
    rejectedCount: rawScenarios.length - valid.length,
    rejectionReasons,
  };
}
