import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import ftzLayeredOwnershipApply from './wave3-ftz-layered-ownership.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('ftz_layered_ownership', () => {
  it('returns inconclusive when no ownershipLayers provided', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('ftz_layered_ownership');
  });

  it('returns inconclusive when ownershipLayers is empty array', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({ ownershipLayers: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when layers present but no signals fire', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', isFreeTradeZone: false, beneficialOwnersDisclosed: true, jurisdictionIso2: 'AE', layerDepthFromUbo: 1 },
        { entityId: 'e2', isFreeTradeZone: false, beneficialOwnersDisclosed: true, jurisdictionIso2: 'AE', layerDepthFromUbo: 2 },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.4); // hits.length === 0
  });

  it('fires ftz_dominant_chain when >=50% FTZ and >=3 layers', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', isFreeTradeZone: true, ftzCode: 'DMCC', jurisdictionIso2: 'AE', layerDepthFromUbo: 1 },
        { entityId: 'e2', isFreeTradeZone: true, ftzCode: 'DMCC', jurisdictionIso2: 'AE', layerDepthFromUbo: 2 },
        { entityId: 'e3', isFreeTradeZone: false, jurisdictionIso2: 'AE', layerDepthFromUbo: 3 },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.evidence).toContain('2/3');
  });

  it('does NOT fire ftz_dominant_chain when only 2 layers even with 100% FTZ', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', isFreeTradeZone: true, ftzCode: 'DMCC', jurisdictionIso2: 'AE' },
        { entityId: 'e2', isFreeTradeZone: true, ftzCode: 'JAFZA', jurisdictionIso2: 'AE' },
      ],
    }));
    // ftz_dominant_chain requires layers.length >= 3
    expect(result.rationale).not.toContain('ftz_dominant_chain');
  });

  it('fires multi_ftz_chain when >=3 distinct FTZ codes', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', isFreeTradeZone: true, ftzCode: 'DMCC', jurisdictionIso2: 'AE' },
        { entityId: 'e2', isFreeTradeZone: true, ftzCode: 'JAFZA', jurisdictionIso2: 'AE' },
        { entityId: 'e3', isFreeTradeZone: true, ftzCode: 'ADGM', jurisdictionIso2: 'AE' },
      ],
    }));
    expect(result.rationale).toContain('multi_ftz_chain');
    expect(result.verdict).toBe('escalate'); // multi_ftz_chain(0.3) + ftz_dominant_chain(0.3) = 0.6 → escalate
  });

  it('does NOT fire multi_ftz_chain when only 2 distinct FTZ codes', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', isFreeTradeZone: true, ftzCode: 'DMCC', jurisdictionIso2: 'AE' },
        { entityId: 'e2', isFreeTradeZone: true, ftzCode: 'JAFZA', jurisdictionIso2: 'AE' },
      ],
    }));
    expect(result.rationale).not.toContain('multi_ftz_chain');
  });

  it('fires deep_chain when maxDepth >= 5', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', layerDepthFromUbo: 5, isFreeTradeZone: false, jurisdictionIso2: 'AE' },
      ],
    }));
    expect(result.rationale).toContain('deep_chain');
  });

  it('does NOT fire deep_chain when maxDepth < 5', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', layerDepthFromUbo: 4, isFreeTradeZone: false, jurisdictionIso2: 'AE' },
      ],
    }));
    expect(result.rationale).not.toContain('deep_chain');
  });

  it('fires undisclosed_layers when >= 2 layers with beneficialOwnersDisclosed=false', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', beneficialOwnersDisclosed: false, isFreeTradeZone: false, jurisdictionIso2: 'AE' },
        { entityId: 'e2', beneficialOwnersDisclosed: false, isFreeTradeZone: false, jurisdictionIso2: 'AE' },
      ],
    }));
    expect(result.rationale).toContain('undisclosed_layers');
  });

  it('does NOT fire undisclosed_layers when only 1 undisclosed layer', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', beneficialOwnersDisclosed: false, isFreeTradeZone: false, jurisdictionIso2: 'AE' },
        { entityId: 'e2', beneficialOwnersDisclosed: true, isFreeTradeZone: false, jurisdictionIso2: 'AE' },
      ],
    }));
    expect(result.rationale).not.toContain('undisclosed_layers');
  });

  it('fires cross_jurisdiction_layering when >= 4 distinct jurisdictions', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', jurisdictionIso2: 'AE', isFreeTradeZone: false },
        { entityId: 'e2', jurisdictionIso2: 'KY', isFreeTradeZone: false },
        { entityId: 'e3', jurisdictionIso2: 'BVI', isFreeTradeZone: false },
        { entityId: 'e4', jurisdictionIso2: 'SG', isFreeTradeZone: false },
      ],
    }));
    expect(result.rationale).toContain('cross_jurisdiction_layering');
  });

  it('does NOT fire cross_jurisdiction_layering when < 4 jurisdictions', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', jurisdictionIso2: 'AE', isFreeTradeZone: false },
        { entityId: 'e2', jurisdictionIso2: 'KY', isFreeTradeZone: false },
        { entityId: 'e3', jurisdictionIso2: 'BVI', isFreeTradeZone: false },
      ],
    }));
    expect(result.rationale).not.toContain('cross_jurisdiction_layering');
  });

  it('escalates when score >= 0.6 (many signals fired)', async () => {
    // Fire: ftz_dominant_chain(0.3) + multi_ftz_chain(0.3) + deep_chain(0.25) + undisclosed_layers(0.25) = 1.1
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', isFreeTradeZone: true, ftzCode: 'DMCC', jurisdictionIso2: 'AE', layerDepthFromUbo: 5, beneficialOwnersDisclosed: false },
        { entityId: 'e2', isFreeTradeZone: true, ftzCode: 'JAFZA', jurisdictionIso2: 'KY', layerDepthFromUbo: 4, beneficialOwnersDisclosed: false },
        { entityId: 'e3', isFreeTradeZone: true, ftzCode: 'ADGM', jurisdictionIso2: 'BVI', layerDepthFromUbo: 3 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it('handles layers with undefined optional fields gracefully', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1' },
        { entityId: 'e2' },
        { entityId: 'e3' },
      ],
    }));
    expect(result.modeId).toBe('ftz_layered_ownership');
    expect(result.score).toBe(0); // no signals fired
  });

  it('applies diminishing returns for rawScore > 0.7', async () => {
    // Many signals: ftz_dominant(0.3) + multi_ftz(0.3) + deep_chain(0.25) + undisclosed(0.25) + cross_jur(0.2) = 1.3
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', isFreeTradeZone: true, ftzCode: 'DMCC', jurisdictionIso2: 'AE', layerDepthFromUbo: 5, beneficialOwnersDisclosed: false },
        { entityId: 'e2', isFreeTradeZone: true, ftzCode: 'JAFZA', jurisdictionIso2: 'KY', beneficialOwnersDisclosed: false },
        { entityId: 'e3', isFreeTradeZone: true, ftzCode: 'ADGM', jurisdictionIso2: 'BVI' },
        { entityId: 'e4', isFreeTradeZone: false, jurisdictionIso2: 'SG' },
      ],
    }));
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.verdict).toBe('escalate');
  });

  it('confidence increases with number of hits', async () => {
    const result = await ftzLayeredOwnershipApply(makeCtx({
      ownershipLayers: [
        { entityId: 'e1', isFreeTradeZone: true, ftzCode: 'DMCC', jurisdictionIso2: 'AE', layerDepthFromUbo: 5 },
        { entityId: 'e2', isFreeTradeZone: true, ftzCode: 'JAFZA', jurisdictionIso2: 'KY' },
        { entityId: 'e3', isFreeTradeZone: true, ftzCode: 'ADGM', jurisdictionIso2: 'BVI' },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
