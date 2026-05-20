import { describe, expect, it } from 'vitest';
import conflictMineralDocumentationApply from './wave3-conflict-mineral-doc.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-conflict-mineral-doc', () => {
  it('returns inconclusive when no conflictMineralBatches supplied', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('conflict_mineral_documentation');
  });

  it('returns inconclusive when conflictMineralBatches is empty', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({ conflictMineralBatches: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when batch has no gaps', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B001',
        mineral: 'gold',
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
        smelterRmapStatus: 'conformant',
        hasEuImporterDueDiligence: true,
        hasSection1502Filing: true,
        cahraOrigin: false,
        countryOfOrigin: 'AU',
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags no_origin_cert when hasOriginCertificate is false', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B002',
        hasOriginCertificate: false,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('escalates when hasChainOfCustodyDocs is false', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B003',
        hasChainOfCustodyDocs: false,
        hasOriginCertificate: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('escalates when CAHRA origin and smelter not enrolled in RMAP', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B004',
        cahraOrigin: true,
        smelterRmapStatus: 'not_enrolled',
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('detects CAHRA from countryOfOrigin using known CAHRA list (CD)', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B005',
        countryOfOrigin: 'CD', // DRC → CAHRA
        smelterRmapStatus: 'not_enrolled',
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag cahra_no_rmap when smelterRmapStatus != not_enrolled', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B006',
        cahraOrigin: true,
        smelterRmapStatus: 'conformant',
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
        hasEuImporterDueDiligence: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when CAHRA origin and no EU importer due diligence', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B007',
        cahraOrigin: true,
        hasEuImporterDueDiligence: false,
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag cahra_no_eu_dd when not CAHRA origin', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B008',
        cahraOrigin: false,
        countryOfOrigin: 'AU',
        hasEuImporterDueDiligence: false,
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags no_1502_filing when mineral is 3T_tin and no section 1502 filing', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B009',
        mineral: '3T_tin',
        hasSection1502Filing: false,
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('flags no_1502_filing for 3T_tantalum', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B010',
        mineral: '3T_tantalum',
        hasSection1502Filing: false,
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('flags no_1502_filing for 3T_tungsten', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B011',
        mineral: '3T_tungsten',
        hasSection1502Filing: false,
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('flags no_1502_filing for gold', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B012',
        mineral: 'gold',
        hasSection1502Filing: false,
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('does not flag no_1502_filing for cobalt', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B013',
        mineral: 'cobalt',
        hasSection1502Filing: false,
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    // cobalt is not in 3TG list
    expect(r.score).toBe(0);
  });

  it('does not flag no_1502_filing when mineral is undefined', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B014',
        hasSection1502Filing: false,
        hasOriginCertificate: true,
        hasChainOfCustodyDocs: true,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when CAHRA country (AF) detected via countryOfOrigin', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B015',
        countryOfOrigin: 'AF',
        smelterRmapStatus: 'not_enrolled',
        hasChainOfCustodyDocs: true,
        hasOriginCertificate: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('uses (unidentified) when batchId missing', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{ hasChainOfCustodyDocs: false }],
    }));
    expect(r.evidence).toContain('(unidentified)');
  });

  it('accumulates multiple signals', async () => {
    const r = await conflictMineralDocumentationApply(makeCtx({
      conflictMineralBatches: [{
        batchId: 'B016',
        mineral: 'gold',
        cahraOrigin: true,
        countryOfOrigin: 'CD',
        hasOriginCertificate: false,
        hasChainOfCustodyDocs: false,
        smelterRmapStatus: 'not_enrolled',
        hasEuImporterDueDiligence: false,
        hasSection1502Filing: false,
      }],
    }));
    // no_origin_cert (0.3) + no_coc_docs (0.4) + cahra_no_rmap (0.5) + cahra_no_eu_dd (0.45) + no_1502 (0.3) = 1.95 → clamped
    expect(r.verdict).toBe('escalate');
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
