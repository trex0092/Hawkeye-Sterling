import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HallucinationResult as _HallucinationResult } from '../hallucination-gate';

// Mock dependencies before importing the module under test
vi.mock('../audit-chain', () => ({
  writeAuditChainEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../metrics-store', () => ({
  incrementCounter: vi.fn(),
}));

vi.mock('../../../src/integrations/webhook-emitter', () => ({
  emitAndLog: vi.fn().mockResolvedValue(undefined),
}));

// Default: brain module available and returns no hallucination
vi.mock('@brain/GroundedComplianceLLM.js', () => ({
  detectHallucinations: vi.fn(() => ({
    hasHallucination: false,
    severity: 'low' as const,
    detectedPatterns: [],
  })),
}));

describe('hallucination-gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns detected=false on clean text with no patterns', async () => {
    const { checkHallucination } = await import('../hallucination-gate');
    const result = await checkHallucination(
      'The subject appears on the OFAC SDN list as of 2024-01-01.',
      ['OFAC SDN list, entry 12345, designation date 2024-01-01'],
      { route: 'test-route', tenantId: 'tenant-1', actor: 'user-1' },
    );

    expect(result.detected).toBe(false);
    expect(result.patterns).toHaveLength(0);
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns detected=true when brain reports a hallucination pattern', async () => {
    const { detectHallucinations } = await import('@brain/GroundedComplianceLLM.js');
    vi.mocked(detectHallucinations).mockReturnValueOnce({
      hasHallucination: true,
      severity: 'high' as const,
      detectedPatterns: ['unsupported_claim', 'fabricated_citation'],
    });

    const { checkHallucination } = await import('../hallucination-gate');
    const result = await checkHallucination(
      'The subject was designated by the UN Security Council on 2099-01-01.',
      [],
      { route: 'mlro-advisor', tenantId: 'tenant-1' },
    );

    expect(result.detected).toBe(true);
    expect(result.severity).toBe('high');
    expect(result.patterns).toContain('unsupported_claim');
  });

  it('writes to audit chain when hallucination is detected', async () => {
    const { detectHallucinations } = await import('@brain/GroundedComplianceLLM.js');
    vi.mocked(detectHallucinations).mockReturnValueOnce({
      hasHallucination: true,
      severity: 'critical' as const,
      detectedPatterns: ['fabricated_entity'],
    });

    const { writeAuditChainEntry } = await import('../audit-chain');
    const { checkHallucination } = await import('../hallucination-gate');

    await checkHallucination('Bad LLM output', [], {
      route: 'screening/run',
      tenantId: 'tenant-audit',
      actor: 'api-key-123',
    });

    // audit chain write is fire-and-forget (void), give it a tick to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(writeAuditChainEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.hallucination_detected',
        detected: true,
        severity: 'critical',
        actor: 'api-key-123',
        route: 'screening/run',
      }),
      'tenant-audit',
    );
  });

  it('does not write to audit chain when no hallucination and alwaysAudit=false', async () => {
    const { writeAuditChainEntry } = await import('../audit-chain');
    const { checkHallucination } = await import('../hallucination-gate');

    await checkHallucination('Clean output', ['evidence'], {
      route: 'test',
      tenantId: 'tenant-1',
      alwaysAudit: false,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(writeAuditChainEntry).not.toHaveBeenCalled();
  });

  it('writes audit entry when alwaysAudit=true even without detection', async () => {
    const { writeAuditChainEntry } = await import('../audit-chain');
    const { checkHallucination } = await import('../hallucination-gate');

    await checkHallucination('Clean output', [], {
      route: 'test',
      tenantId: 'tenant-always',
      alwaysAudit: true,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(writeAuditChainEntry).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.hallucination_detected', detected: false }),
      'tenant-always',
    );
  });

  it('degrades gracefully when brain module is unavailable', async () => {
    const { detectHallucinations } = await import('@brain/GroundedComplianceLLM.js');
    vi.mocked(detectHallucinations).mockImplementationOnce(() => {
      throw new Error('dist/ not compiled');
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { checkHallucination } = await import('../hallucination-gate');

    const result = await checkHallucination('Any text', [], { route: 'test', tenantId: 'tenant-1' });

    expect(result.detected).toBe(false);
    expect(result.severity).toBe('low');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[hallucination-gate]'),
      expect.stringContaining('dist/ not compiled'),
    );
    warnSpy.mockRestore();
  });
});
