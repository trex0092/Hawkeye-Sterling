// KRI governance registries — regulatory obligations + vendor concentration.

import { describe, expect, it } from 'vitest';
import {
  REGULATORY_OBLIGATIONS,
  OBLIGATION_BY_ID,
  obligationNextDueMs,
  obligationStatus,
  summarizeObligations,
  type RegulatoryObligation,
} from '../regulatory-obligations.js';
import {
  VENDOR_REGISTER,
  computeVendorConcentration,
  type VendorEntry,
} from '../vendor-register.js';
import { KRI_BY_ID, classifyKri } from '../kri-registry.js';
import { RISK_APPETITE, evaluateAppetite } from '../risk-appetite.js';

const DAY_MS = 86_400_000;

describe('regulatory-obligations', () => {
  it('every entry has a due date and unique id', () => {
    expect(REGULATORY_OBLIGATIONS.length).toBeGreaterThanOrEqual(10);
    expect(OBLIGATION_BY_ID.size).toBe(REGULATORY_OBLIGATIONS.length);
    for (const o of REGULATORY_OBLIGATIONS) {
      expect(Number.isNaN(obligationNextDueMs(o)), `${o.id} has no derivable due date`).toBe(false);
      expect(o.evidenceRef.length).toBeGreaterThan(0);
    }
  });

  it('classifies current / due_soon / overdue around the cadence boundary', () => {
    const base: RegulatoryObligation = {
      id: 'ob_test',
      name: 'Test obligation',
      regulatoryAnchor: 'TEST',
      owner: 'MLRO',
      cadenceDays: 92,
      lastCompleted: '2026-01-01',
      evidenceRef: 'test',
    };
    const completedMs = Date.parse('2026-01-01');
    const dueMs = completedMs + 92 * DAY_MS;
    expect(obligationStatus(base, completedMs + DAY_MS)).toBe('current');
    expect(obligationStatus(base, dueMs - 7 * DAY_MS)).toBe('due_soon');
    expect(obligationStatus(base, dueMs + DAY_MS)).toBe('overdue');
  });

  it('uses nextDueOverride for never-completed obligations and fails closed when malformed', () => {
    const scheduled: RegulatoryObligation = {
      id: 'ob_sched',
      name: 'Scheduled exercise',
      regulatoryAnchor: 'TEST',
      owner: 'Engineering Lead',
      cadenceDays: 365,
      nextDueOverride: '2026-09-30',
      evidenceRef: 'test',
    };
    expect(obligationStatus(scheduled, Date.parse('2026-06-10'))).toBe('current');
    expect(obligationStatus(scheduled, Date.parse('2026-10-01'))).toBe('overdue');

    const malformed = { ...scheduled, nextDueOverride: undefined };
    expect(obligationStatus(malformed, Date.parse('2026-06-10'))).toBe('overdue');
  });

  it('summarize counts overdue ids deterministically', () => {
    // Far future: everything in the register is overdue.
    const farFuture = Date.parse('2030-01-01');
    const summary = summarizeObligations(farFuture);
    expect(summary.total).toBe(REGULATORY_OBLIGATIONS.length);
    expect(summary.overdue).toBe(REGULATORY_OBLIGATIONS.length);
    expect(summary.overdueIds).toContain('ob_board_mi');
  });
});

describe('vendor-register', () => {
  it('mirrors HS-OPS-003: 11 vendors, CRITICAL entries carry a contingency', () => {
    expect(VENDOR_REGISTER.length).toBe(11);
    for (const v of VENDOR_REGISTER.filter((x) => x.riskClass === 'CRITICAL')) {
      expect(v.contingency, `${v.id} (CRITICAL) must document a contingency`).toBeTruthy();
    }
  });

  it('computes single-provider concentration per function', () => {
    const synthetic: VendorEntry[] = [
      { id: 'V-901', name: 'A', service: 's', functionKey: 'sanctions_data', riskClass: 'CRITICAL', contingency: 'snapshot', alternateProvider: true, lastReviewed: '2026-01-01', nextReview: '2027-01-01' },
      { id: 'V-902', name: 'B', service: 's', functionKey: 'sanctions_data', riskClass: 'HIGH', contingency: null, alternateProvider: true, lastReviewed: '2026-01-01', nextReview: '2027-01-01' },
      { id: 'V-903', name: 'C', service: 's', functionKey: 'hosting_storage', riskClass: 'CRITICAL', contingency: 'backup', alternateProvider: false, lastReviewed: '2026-01-01', nextReview: '2027-01-01' },
    ];
    const c = computeVendorConcentration(synthetic);
    expect(c.functions.length).toBe(2);
    expect(c.singleProviderFunctions).toEqual(['hosting_storage']);
    expect(c.criticalSingleProviderFunctions).toEqual(['hosting_storage']);
    expect(c.concentrationPct).toBe(50);
  });

  it('live register reports pep_data and hosting_storage as the single-provider functions', () => {
    const c = computeVendorConcentration();
    expect(c.singleProviderFunctions.sort()).toEqual(['hosting_storage', 'pep_data']);
    expect(c.concentrationPct).toBeGreaterThan(0);
    expect(c.concentrationPct).toBeLessThanOrEqual(100);
  });
});

describe('kri-registry — governance KRIs', () => {
  it('registers the five governance KRIs with appetite bindings', () => {
    for (const id of [
      'kri_regulatory_obligation_overdue',
      'kri_vendor_concentration',
      'kri_privacy_request_overdue',
      'kri_training_completion',
      'kri_repeat_control_failures',
    ]) {
      expect(KRI_BY_ID.has(id), `missing KRI ${id}`).toBe(true);
    }
    const vendorKri = KRI_BY_ID.get('kri_vendor_concentration')!;
    expect(classifyKri(vendorKri, 10)).toBe('green');
    expect(classifyKri(vendorKri, 40)).toBe('amber');
    expect(classifyKri(vendorKri, 75)).toBe('red');
  });

  it('appetite registry covers the new dimensions', () => {
    for (const dim of [
      'regulatory_obligation_overdue',
      'vendor_concentration',
      'privacy_request_overdue',
      'repeat_control_failures',
    ] as const) {
      expect(RISK_APPETITE.some((a) => a.dimension === dim), `missing appetite ${dim}`).toBe(true);
    }
    expect(evaluateAppetite('regulatory_obligation_overdue', 0)?.breached).toBe(false);
    expect(evaluateAppetite('regulatory_obligation_overdue', 1)?.breached).toBe(true);
    expect(evaluateAppetite('vendor_concentration', 40)?.breached).toBe(false);
    expect(evaluateAppetite('vendor_concentration', 41)?.breached).toBe(true);
  });
});
