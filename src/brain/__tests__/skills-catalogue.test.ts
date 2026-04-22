import { describe, it, expect } from 'vitest';
import {
  SKILLS,
  SKILLS_BY_ID,
  SKILLS_BY_DOMAIN,
  SKILLS_BY_LAYER,
  SKILLS_DOMAIN_COUNTS,
  SKILLS_LAYER_COUNTS,
  inferDomain,
  skillsCatalogueSignature,
  skillsCatalogueSummary,
  type SkillDomain,
} from '../skills-catalogue.js';
import { weaponizedSystemPrompt, buildWeaponizedBrainManifest } from '../weaponized.js';

describe('skills catalogue — shape', () => {
  it('registers at least 300 skills', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(300);
  });

  it('gives every entry a non-empty kebab-case id, label, domain, layer, and default weight', () => {
    for (const s of SKILLS) {
      expect(s.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.domain.length).toBeGreaterThan(0);
      expect(['competency', 'reasoning', 'analysis']).toContain(s.layer);
      expect(s.weight).toBeGreaterThan(0);
      expect(s.weight).toBeLessThanOrEqual(1);
    }
  });

  it('has unique ids across the whole catalogue', () => {
    const ids = SKILLS.map((s) => s.id);
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) dups.push(id);
      seen.add(id);
    }
    expect(dups).toEqual([]);
    expect(seen.size).toBe(SKILLS.length);
  });

  it('SKILLS_BY_ID lookup returns every entry by its id', () => {
    expect(SKILLS_BY_ID.size).toBe(SKILLS.length);
    for (const s of SKILLS) {
      expect(SKILLS_BY_ID.get(s.id)).toBe(s);
    }
  });

  it('SKILLS_BY_DOMAIN partitions the catalogue without loss', () => {
    const flattened = Object.values(SKILLS_BY_DOMAIN).flat();
    expect(flattened.length).toBe(SKILLS.length);
    for (const [d, list] of Object.entries(SKILLS_BY_DOMAIN)) {
      for (const s of list) expect(s.domain).toBe(d);
    }
  });

  it('SKILLS_BY_LAYER partitions the catalogue without loss', () => {
    const flattened = Object.values(SKILLS_BY_LAYER).flat();
    expect(flattened.length).toBe(SKILLS.length);
    for (const [layer, list] of Object.entries(SKILLS_BY_LAYER)) {
      for (const s of list) expect(s.layer).toBe(layer);
    }
  });

  it('domain + layer counts sum to the total', () => {
    const domainSum = Object.values(SKILLS_DOMAIN_COUNTS).reduce((a, b) => a + b, 0);
    const layerSum = Object.values(SKILLS_LAYER_COUNTS).reduce((a, b) => a + b, 0);
    expect(domainSum).toBe(SKILLS.length);
    expect(layerSum).toBe(SKILLS.length);
  });

  it('catalogue is frozen (runtime immutability)', () => {
    expect(Object.isFrozen(SKILLS)).toBe(true);
  });
});

describe('skills catalogue — domain routing spot checks', () => {
  const cases: Array<[string, SkillDomain]> = [
    ['Sanctions Screening Capability', 'SANCTIONS_TFS'],
    ['TFS Compliance', 'SANCTIONS_TFS'],
    ['LBMA RGG Steps 1-5', 'SUPPLY_CHAIN'],
    ['CAHRA Assessment', 'SUPPLY_CHAIN'],
    ['Cryptocurrencies Monitoring', 'DIGITAL_ASSETS'],
    ['VARA Reasoning', 'DIGITAL_ASSETS'],
    ['PDPL Data Privacy', 'DATA_PRIVACY'],
    ['PEP Identification', 'KYC_CDD'],
    ['UBO Tracing', 'KYC_CDD'],
    ['Board Reporting', 'REPORTING'],
    ['GOAML Reporting', 'REPORTING'],
    ['FATF Compliance', 'REGULATORY'],
    ['Negotiation Skills', 'SOFT_SKILLS'],
    ['Structuring Detection', 'INVESTIGATIONS'],
    ['Record-Keeping', 'DOCUMENTATION'],
    ['Inherent Risk Assessment', 'RISK_ASSESSMENT'],
  ];

  for (const [label, expected] of cases) {
    it(`routes "${label}" → ${expected}`, () => {
      expect(inferDomain(label)).toBe(expected);
      const entry = SKILLS.find((s) => s.label === label);
      expect(entry).toBeDefined();
      expect(entry?.domain).toBe(expected);
    });
  }
});

describe('skills catalogue — signature stability', () => {
  it('skillsCatalogueSignature is deterministic', () => {
    expect(skillsCatalogueSignature()).toBe(skillsCatalogueSignature());
  });

  it('signature is a JSON array of every skill id, sorted', () => {
    const parsed = JSON.parse(skillsCatalogueSignature()) as string[];
    expect(parsed.length).toBe(SKILLS.length);
    const sorted = [...parsed].sort();
    expect(parsed).toEqual(sorted);
    for (const id of parsed) expect(SKILLS_BY_ID.has(id)).toBe(true);
  });
});

describe('skills catalogue — prompt injection', () => {
  it('skillsCatalogueSummary lists every domain with its count', () => {
    const summary = skillsCatalogueSummary();
    expect(summary).toContain(`${SKILLS.length} skills registered`);
    for (const d of Object.keys(SKILLS_BY_DOMAIN) as SkillDomain[]) {
      expect(summary).toContain(`- ${d}: ${SKILLS_DOMAIN_COUNTS[d]}`);
    }
  });

  it('skillsCatalogueSummary({ includeFullList: true }) dumps every label', () => {
    const full = skillsCatalogueSummary({ includeFullList: true });
    for (const s of SKILLS) expect(full).toContain(s.label);
  });

  it('weaponizedSystemPrompt includes the SKILLS CATALOGUE section by default', () => {
    const prompt = weaponizedSystemPrompt({ taskRole: 'TEST' });
    expect(prompt).toContain('SKILLS CATALOGUE — YOU EMBODY EVERY ONE OF THESE');
    expect(prompt).toContain(`${SKILLS.length} skills registered`);
  });

  it('weaponizedSystemPrompt omits the SKILLS CATALOGUE section when flag is false', () => {
    const prompt = weaponizedSystemPrompt({ taskRole: 'TEST', includeSkillsCatalogue: false });
    expect(prompt).not.toContain('SKILLS CATALOGUE — YOU EMBODY EVERY ONE OF THESE');
  });

  it('weaponizedSystemPrompt injects the full skill list only when explicitly requested', () => {
    const lean = weaponizedSystemPrompt({ taskRole: 'TEST' });
    const full = weaponizedSystemPrompt({ taskRole: 'TEST', includeSkillsFullList: true });
    expect(full.length).toBeGreaterThan(lean.length);
    // Sample a handful of labels — they should be absent in the lean prompt
    // (unless they happened to be a domain-sample) but present in the full.
    const probe = [
      'Retention Schedule Verification',
      'Multiple Transaction Analysis',
      'Compliance Assertion Verification',
    ];
    for (const label of probe) expect(full).toContain(label);
  });
});

describe('skills catalogue — manifest integration', () => {
  it('buildWeaponizedBrainManifest exposes the skills block with matching totals', () => {
    const m = buildWeaponizedBrainManifest();
    expect(m.cognitiveCatalogue.skills.total).toBe(SKILLS.length);
    expect(
      Object.values(m.cognitiveCatalogue.skills.byLayer).reduce((a, b) => a + b, 0),
    ).toBe(SKILLS.length);
    expect(
      Object.values(m.cognitiveCatalogue.skills.byDomain).reduce((a, b) => a + b, 0),
    ).toBe(SKILLS.length);
  });
});
