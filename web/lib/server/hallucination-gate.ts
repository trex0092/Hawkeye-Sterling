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
  /** True when the check could not run (module load failure). Callers must
   *  surface this in audit entries so the MLRO knows the check was bypassed. */
  skipped?: boolean;
  skipReason?: string;
}

interface CheckOpts {
  route: string;
  tenantId?: string;
  actor?: string;
  /** When true, write to audit chain even if no hallucination detected.
   *  Default false — only writes on detection to reduce audit noise. */
  alwaysAudit?: boolean;
}

// Module-level cache for the brain module. Loaded eagerly so the first
// checkHallucination() call doesn't pay a cold-module-load penalty inside the
// fire-and-forget promise, and so load failures are surfaced at startup rather
// than silently skipped per-request.
let _detectHallucinations: ((_text: string, _citations: ReturnType<typeof buildCitationsFromFragments>) => { hasHallucination: boolean; severity: HallucinationResult['severity']; detectedPatterns: string[] }) | null = null;
let _detectHallucinationsLoadErr: string | null = null;

void import('@brain/GroundedComplianceLLM.js').then((m: { detectHallucinations: NonNullable<typeof _detectHallucinations> }) => {
  _detectHallucinations = m.detectHallucinations;
}).catch((err: unknown) => {
  _detectHallucinationsLoadErr = err instanceof Error ? err.message : String(err);
  console.warn('[hallucination-gate] brain module unavailable at startup:', _detectHallucinationsLoadErr);
  incrementCounter('hawkeye_hallucination_gate_disabled_total', 1, {});
});

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

  let skipReason: string | undefined;
  try {
    // Use module-level cached loader; fall back to dynamic import if still loading.
    const detect = _detectHallucinations ?? await import('@brain/GroundedComplianceLLM.js').then(
      (m: { detectHallucinations: NonNullable<typeof _detectHallucinations> }) => {
        _detectHallucinations = m.detectHallucinations;
        return m.detectHallucinations;
      },
    );
    const citations = buildCitationsFromFragments(evidenceFragments);
    const result = detect(responseText, citations);
    detected = result.hasHallucination;
    severity = result.severity;
    patterns = result.detectedPatterns;
  } catch (err) {
    // Brain module unavailable (e.g. dist/ not compiled) — log and alert.
    skipReason = err instanceof Error ? err.message : String(err);
    console.warn('[hallucination-gate] detectHallucinations unavailable:', skipReason);
    incrementCounter('hawkeye_hallucination_gate_skip_total', 1, { route: opts.route });
    void emitAndLog('alert_hallucination_gate_skip', {
      event: 'hallucination_gate_skipped',
      route: opts.route,
      reason: skipReason,
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

  return {
    detected,
    severity,
    patterns,
    checkedAt,
    ...(skipReason !== undefined ? { skipped: true, skipReason } : {}),
  };
}

/**
 * Returns the load status of the brain hallucination module.
 * Used by the health endpoint to surface a silent gate failure so the MLRO
 * can see when hallucination detection is not running (F-20).
 */
export function hallucinationGateStatus(): { loaded: boolean; error: string | null } {
  return { loaded: _detectHallucinations !== null, error: _detectHallucinationsLoadErr };
}
