// Hawkeye Sterling — hallucination gate middleware.
//
// Post-response safety check for LLM outputs. Wraps the existing
// detectHallucinations() from GroundedComplianceLLM (src/brain) and adds:
//   - Audit chain write on detection (ai.hallucination_detected)
//   - Structured result type for route handlers to act on
//   - Soft-gate mode: returns result without blocking (caller decides action)
//
// Usage in a route:
//   import { checkHallucination } from '@/lib/server/hallucination-gate';
//   const hCheck = await checkHallucination(responseText, evidenceFragments, {
//     route: 'mlro-advisor',
//     tenantId,
//     actor: gate.keyId,
//   });
//   if (hCheck.detected && hCheck.severity === 'critical') {
//     return NextResponse.json({ ok: false, error: 'hallucination_detected' }, { status: 422 });
//   }
//   // annotate response for audit trail
//   response._hallucinationCheck = hCheck;

import { writeAuditChainEntry } from './audit-chain';
import { incrementCounter } from './metrics-store';
import { emitAndLog } from '../../../src/integrations/webhook-emitter';

export interface HallucinationResult {
  detected: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  patterns: string[];
  checkedAt: string;
}

interface CheckOpts {
  route: string;
  tenantId?: string;
  actor?: string;
  /** When true, write to audit chain even if no hallucination detected.
   *  Default false — only writes on detection to reduce audit noise. */
  alwaysAudit?: boolean;
}

function buildCitationsFromFragments(fragments: string[]) {
  const now = new Date().toISOString();
  return fragments.map((f, i) => ({
    citationId: `evidence-${i}`,
    class: 'B' as const,
    sourceId: `evidence-${i}`,
    sourceName: 'supplied-evidence',
    title: `Evidence fragment ${i + 1}`,
    retrievedAt: now,
    excerpt: f.slice(0, 500),
    relevanceScore: 1,
  }));
}

export async function checkHallucination(
  responseText: string,
  evidenceFragments: string[],
  opts: CheckOpts,
): Promise<HallucinationResult> {
  let detected = false;
  let severity: HallucinationResult['severity'] = 'low';
  let patterns: string[] = [];

  try {
    // Dynamic import keeps @brain/* out of the module graph when not needed.
    const { detectHallucinations } = await import('@brain/GroundedComplianceLLM.js');
    const citations = buildCitationsFromFragments(evidenceFragments);
    const result = detectHallucinations(responseText, citations);
    detected = result.hasHallucination;
    severity = result.severity;
    patterns = result.detectedPatterns;
  } catch (err) {
    // Brain module unavailable (e.g. dist/ not compiled) — log and alert.
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[hallucination-gate] detectHallucinations unavailable:', errMsg);
    incrementCounter('hawkeye_hallucination_gate_skip_total', 1, { route: opts.route });
    void emitAndLog('alert_hallucination_gate_skip', {
      event: 'hallucination_gate_skipped',
      route: opts.route,
      reason: errMsg,
      severity: 'high',
      tenantId: opts.tenantId ?? 'default',
      at: new Date().toISOString(),
    }).catch(() => undefined);
  }

  const checkedAt = new Date().toISOString();

  if (detected) {
    incrementCounter('hawkeye_hallucination_detected_total', 1, { route: opts.route, severity });
    void emitAndLog('alert_hallucination', {
      event: 'hallucination_detected',
      route: opts.route,
      severity,
      patternCount: patterns.length,
      tenantId: opts.tenantId ?? 'default',
      detectedAt: checkedAt,
    }).catch(() => undefined);
  }

  if (detected || opts.alwaysAudit) {
    void writeAuditChainEntry(
      {
        event: 'ai.hallucination_detected',
        actor: opts.actor ?? 'system',
        route: opts.route,
        detected,
        severity,
        patternCount: patterns.length,
        patterns: patterns.slice(0, 5),
      },
      opts.tenantId ?? 'default',
    ).catch((e) =>
      console.warn('[hallucination-gate] audit chain write failed:', e instanceof Error ? e.message : String(e)),
    );
  }

  return { detected, severity, patterns, checkedAt };
}
