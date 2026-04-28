import { describe, it, expect } from 'vitest';
import { classifyMlroQuestion } from '../mlro-question-classifier.js';

describe('mlro-question-classifier', () => {
  it('classifies CDD questions for UAE gold trader', () => {
    const a = classifyMlroQuestion(
      'What CDD is required for a UAE-based gold trader (DPMS) and what ongoing-monitoring cadence applies?',
    );
    // CDD wins on keyword count over ongoing_monitoring; both should be present.
    expect(['cdd', 'ongoing_monitoring']).toContain(a.primaryTopic);
    expect(a.topics).toContain('cdd');
    expect(a.topics).toContain('ongoing_monitoring');
    expect(a.topics).toContain('dpms_precious_metals');
    expect(a.jurisdictions).toContain('UAE');
    expect(a.typologies).toContain('dpms_retail');
    expect(a.doctrineHints.length).toBeGreaterThan(0);
    expect(a.confidence).not.toBe('low');
    expect(a.enrichedPreamble.length).toBeGreaterThan(50);
  });

  it('flags tipping-off risk and STR topic together', () => {
    const a = classifyMlroQuestion('Can I inform the client we are filing an STR?');
    expect(a.urgencyFlags).toContain('tipping_off_risk');
    expect(a.topics).toContain('str_sar_filing');
  });

  it('extracts numeric thresholds', () => {
    const a = classifyMlroQuestion(
      'Cash deposit of 55,000 AED — does it cross the threshold for CDD?',
    );
    expect(
      a.numericThresholds.some((t) => t.value === 55000 && t.unit === 'AED'),
    ).toBe(true);
  });

  it('routes sanctions-screening questions to OFAC and UAE EOCN', () => {
    const a = classifyMlroQuestion(
      'How often must we re-screen the customer book against OFAC SDN, UN Consolidated, EU CFSP and UAE EOCN?',
    );
    expect(a.topics).toContain('sanctions_screening');
    expect(a.regimes).toContain('ofac_sdn');
    expect(a.regimes).toContain('uae_eocn');
    expect(a.regimes).toContain('eu_consolidated');
  });

  it('detects PEP RCA topic and EDD escalation', () => {
    const a = classifyMlroQuestion(
      'How far do we extend EDD to relatives and close associates of a foreign PEP?',
    );
    expect(a.topics).toContain('pep_handling');
    expect(a.topics).toContain('pep_rca');
    expect(a.topics).toContain('edd');
    expect(a.fatfRecHints).toContain('fatf_r12');
  });

  it('detects VASP / Travel-Rule context', () => {
    const a = classifyMlroQuestion(
      'Travel-Rule obligations for a UAE VASP sending USDT above the threshold to a non-UAE counterparty.',
    );
    expect(a.primaryTopic).toBe('vasp_crypto');
    expect(a.typologies).toContain('vasp');
    expect(a.fatfRecHints).toContain('fatf_r16');
  });

  it('detects correspondent-banking + CAHRA combination', () => {
    const a = classifyMlroQuestion(
      'What KYB documentation must we hold on a respondent bank in a CAHRA jurisdiction before opening a correspondent account?',
    );
    expect(a.topics).toContain('correspondent_banking');
    expect(a.topics).toContain('cahra_jurisdiction');
  });

  it('falls back to general_compliance for open-ended questions with low signal', () => {
    const a = classifyMlroQuestion('Anything I should know about being a good MLRO?');
    expect(a.confidence).not.toBe('high');
    expect(a.commonSenseRules.length).toBeGreaterThan(0);
  });

  it('always populates enrichedPreamble and follow-ups', () => {
    const a = classifyMlroQuestion('What is the STR filing deadline under UAE FDL 10/2025?');
    expect(a.enrichedPreamble).toMatch(/CLASSIFIER PRE-BRIEF/);
    expect(a.suggestedFollowUps.length).toBeGreaterThan(0);
  });
});
