// Layer 6 acceptance tests — reasoning quality.
//
// Build-spec acceptance: feed the Advisor a borderline scenario and
// confirm the output contains both probe outcomes and a verdict that
// explicitly references them. Tests below verify each sub-component
// in isolation (the Advisor wrapper is in the route handler).

import { describe, expect, it } from 'vitest';
import {
  classifyDpmsTypologies,
  DPMS_TYPOLOGIES,
  type DpmsTypologyId,
} from '../registry/dpms-typologies.js';
import {
  extractCountries,
  lookupCountry,
  resolveJurisdictionalLookups,
  LIST_SNAPSHOTS,
} from '../registry/jurisdictional-lookup.js';
import {
  PROBE_PROMPTS,
  parseProbeOutcomes,
  applyProbeOverride,
} from '../registry/adversarial-probe.js';

describe('Layer 6.1: DPMS typology classifier', () => {
  it('catalogues all 8 typologies the build-spec named', () => {
    const ids: DpmsTypologyId[] = [
      'scrap_to_kilobar', 'refining_margin_abuse', 'weight_discrepancy_laundering',
      'free_zone_re_export_structuring', 'hawala_linked_cash_out', 'dore_misdeclaration',
      'cahra_origin_laundering', 'sub_threshold_structuring',
    ];
    for (const id of ids) {
      expect(DPMS_TYPOLOGIES.find((t) => t.id === id), `missing typology: ${id}`).toBeTruthy();
    }
  });

  it('classifies a scrap-jewellery-to-kilobar query', () => {
    const hits = classifyDpmsTypologies('Walk-in customer with cash purchase of scrap jewellery to be refined into kilo-bar');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.typology.id).toBe('scrap_to_kilobar');
  });

  it('classifies a CAHRA origin laundering query', () => {
    const hits = classifyDpmsTypologies('Doré shipment claiming UAE origin but transit hub from DRC and Mali');
    const ids = hits.map((h) => h.typology.id);
    expect(ids).toContain('cahra_origin_laundering');
    // dore_misdeclaration also fires.
    expect(ids).toContain('dore_misdeclaration');
  });

  it('classifies a sub-threshold structuring query', () => {
    const hits = classifyDpmsTypologies('Customer split deposit into amounts just below the threshold across consecutive days');
    const ids = hits.map((h) => h.typology.id);
    expect(ids).toContain('sub_threshold_structuring');
  });

  it('returns empty for an unrelated query', () => {
    const hits = classifyDpmsTypologies('What is the capital of France?');
    expect(hits).toEqual([]);
  });

  it('every typology has at least one anchor source', () => {
    for (const t of DPMS_TYPOLOGIES) {
      expect(t.anchorSources.length).toBeGreaterThan(0);
    }
  });
});

describe('Layer 6.2: five-list jurisdictional lookup', () => {
  it('exposes all five lists', () => {
    const ids = Object.keys(LIST_SNAPSHOTS).sort();
    expect(ids).toEqual(['CAHRA_OECD', 'EU_high_risk', 'FATF_grey_black', 'OFAC_SDN', 'UNSC_consolidated']);
  });

  it('extracts countries from free-text questions', () => {
    const cs = extractCountries('Customer has gold supplier in Mali and beneficial owner in Iran');
    const ids = cs.map((c) => c.iso2).sort();
    expect(ids).toEqual(['IR', 'ML']);
  });

  it('lookupCountry surfaces all hit lists AND clears the rest', () => {
    const r = lookupCountry('IR', 'Iran', new Date('2026-04-29'));
    const hitLists = r.hits.map((h) => h.list).sort();
    // Iran is on FATF black, EU high-risk, UNSC, OFAC.
    expect(hitLists).toEqual(['EU_high_risk', 'FATF_grey_black', 'OFAC_SDN', 'UNSC_consolidated']);
    expect(r.cleared).toContain('CAHRA_OECD'); // Iran is not in OECD CAHRA snapshot
    const fatf = r.hits.find((h) => h.list === 'FATF_grey_black');
    expect(fatf?.classification).toBe('black');
  });

  it('resolveJurisdictionalLookups returns one entry per detected country', () => {
    const rs = resolveJurisdictionalLookups('Onboarding entity from Switzerland with subsidiary in Mali');
    expect(rs.map((r) => r.iso2).sort()).toEqual(['ML']); // Switzerland not in our table; Mali is
    expect(rs[0]!.hits.length).toBeGreaterThan(0);
  });

  it('flags stale snapshots when asOf is past staleAfterDays', () => {
    // OFAC_SDN staleAfterDays=14 and asOf=2026-04-20. Probe at 2026-06-20.
    const r = lookupCountry('CU', 'Cuba', new Date('2026-06-20'));
    const ofac = r.hits.find((h) => h.list === 'OFAC_SDN');
    expect(ofac?.stale).toBe(true);
  });

  it('does NOT flag fresh snapshots', () => {
    const r = lookupCountry('CU', 'Cuba', new Date('2026-04-25'));
    const ofac = r.hits.find((h) => h.list === 'OFAC_SDN');
    expect(ofac?.stale).toBe(false);
  });
});

describe('Layer 6.3: adversarial probe', () => {
  it('PROBE_PROMPTS exports both passes', () => {
    expect(PROBE_PROMPTS.innocent_narrative.kind).toBe('innocent_narrative');
    expect(PROBE_PROMPTS.sophisticated_launderer.kind).toBe('sophisticated_launderer');
    expect(PROBE_PROMPTS.innocent_narrative.instruction).toMatch(/innocent/i);
    expect(PROBE_PROMPTS.sophisticated_launderer.instruction).toMatch(/sophisticated|adversarial|launderer/i);
  });

  it('parses probe markers out of a model draft', () => {
    const draft = `
      Reasoning ...
      INNOCENT-PROBE-VERDICT: proceed
      Reasoning ...
      ADVERSARIAL-PROBE-VERDICT: escalate
      Final draft below ...
    `;
    const o = parseProbeOutcomes(draft, 'escalate');
    expect(o.innocent).toBe('proceed');
    expect(o.adversarial).toBe('escalate');
    // escalate is compatible with proceed (escalate is conservative
    // pivot) and with escalate. So survived.
    expect(o.survived).toBe(true);
  });

  it('flags a verdict that did not survive the adversarial probe', () => {
    const draft = `
      INNOCENT-PROBE-VERDICT: proceed
      ADVERSARIAL-PROBE-VERDICT: file_str
    `;
    // Final verdict "proceed" but adversarial says "file_str" — does
    // not survive (proceed is less conservative than file_str).
    const o = parseProbeOutcomes(draft, 'proceed');
    expect(o.survived).toBe(false);
    expect(o.disagreement).toBe('sophisticated_launderer');
  });

  it('applyProbeOverride pivots non-survivor to "escalate"', () => {
    const o = parseProbeOutcomes('INNOCENT-PROBE-VERDICT: proceed\nADVERSARIAL-PROBE-VERDICT: file_str', 'proceed');
    const r = applyProbeOverride('proceed', o);
    expect(r.overridden).toBe(true);
    expect(r.verdict).toBe('escalate');
    expect(r.rationale).toMatch(/sophisticated_launderer/);
  });

  it('applyProbeOverride preserves a survivor verdict', () => {
    const o = parseProbeOutcomes('INNOCENT-PROBE-VERDICT: escalate\nADVERSARIAL-PROBE-VERDICT: escalate', 'escalate');
    const r = applyProbeOverride('escalate', o);
    expect(r.overridden).toBe(false);
    expect(r.verdict).toBe('escalate');
  });
});

describe('Layer 6 — borderline-scenario acceptance (integration)', () => {
  it('a CAHRA + sub-threshold + cash query surfaces typologies, jurisdictions, and probe prompts', () => {
    const q = 'Doré shipment from Mali via UAE free zone, multiple cash deposits just below threshold across consecutive days';
    const typologies = classifyDpmsTypologies(q);
    const lookups = resolveJurisdictionalLookups(q);
    const prompts = [PROBE_PROMPTS.innocent_narrative, PROBE_PROMPTS.sophisticated_launderer];
    expect(typologies.length).toBeGreaterThanOrEqual(2);
    expect(lookups.length).toBeGreaterThanOrEqual(1);
    expect(lookups[0]!.iso2).toBe('ML');
    expect(prompts).toHaveLength(2);
  });
});
