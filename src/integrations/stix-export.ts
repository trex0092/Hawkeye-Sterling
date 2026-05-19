// Hawkeye Sterling — STIX 2.1 export for AML typologies.
// Converts reasoning modes and typology data into STIX 2.1 bundles
// compatible with AMLTRIX, MITRE ATT&CK Navigator, and FATF intel sharing.
// STIX spec: https://docs.oasis-open.org/cti/stix/v2.1/os/stix-v2.1-os.html

// Use Web Crypto API (available in Node 22+ and all modern runtimes) to avoid
// requiring @types/node in contexts that target browser/edge environments.
function randomUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback: RFC 4122 v4 UUID via Math.random (non-cryptographic, dev only)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export type StixType =
  | 'bundle'
  | 'attack-pattern'
  | 'indicator'
  | 'course-of-action'
  | 'relationship'
  | 'threat-actor'
  | 'identity'
  | 'malware';

export interface StixObject {
  type: StixType;
  id: string;
  spec_version: '2.1';
  created: string;
  modified: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixObject[];
}

export interface AmlTypology {
  id: string;
  name: string;
  domain: string;
  description: string;
  indicators?: string[];
  mitigations?: string[];
  amltrixTacticId?: string;
  fatfCategory?: string;
}

// Load AMLTRIX tactic mapping (domain → AMLTRIX tactic ID)
const AMLTRIX_TACTIC_MAP: Record<string, string> = {
  'dpms': 'ML0001',       // Placement via DPMS
  'vasp': 'ML0003',       // Layering via VASP
  'tbml': 'ML0002',       // Trade-Based ML
  'pep': 'ML0006',        // PEP Exposure
  'real_estate': 'ML0004',// Real Estate Layering
  'crypto': 'ML0003',     // Crypto Layering
  'sanctions': 'ML0007',  // Sanctions Evasion
  'ngo': 'ML0005',        // NGO / NPO Abuse
  'terrorism': 'TF0001',  // Terrorist Financing
  'proliferation': 'PF0001', // Proliferation Financing
  'default': 'ML0000',
};

function stixId(type: string): string {
  return `${type}--${randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildAttackPattern(typology: AmlTypology): StixObject {
  return {
    type: 'attack-pattern',
    id: stixId('attack-pattern'),
    spec_version: '2.1',
    created: nowIso(),
    modified: nowIso(),
    name: typology.name,
    description: typology.description,
    x_hawkeye_domain: typology.domain,
    x_hawkeye_typology_id: typology.id,
    x_amltrix_tactic_id: typology.amltrixTacticId ?? AMLTRIX_TACTIC_MAP[typology.domain] ?? AMLTRIX_TACTIC_MAP['default'],
    x_fatf_category: typology.fatfCategory ?? 'ML',
    kill_chain_phases: [
      {
        kill_chain_name: 'amltrix',
        phase_name: AMLTRIX_TACTIC_MAP[typology.domain] ?? 'placement',
      },
    ],
  };
}

function buildIndicator(typology: AmlTypology, attackPatternId: string): StixObject[] {
  return (typology.indicators ?? []).map((indicator) => {
    const indicatorId = stixId('indicator');
    return {
      type: 'indicator',
      id: indicatorId,
      spec_version: '2.1',
      created: nowIso(),
      modified: nowIso(),
      name: `${typology.name} — Indicator`,
      description: indicator,
      pattern: `[x-aml:description = '${indicator.replace(/'/g, "\\'")}']`,
      pattern_type: 'stix',
      valid_from: new Date().toISOString(),
      x_hawkeye_typology_id: typology.id,
    } satisfies StixObject;
  });
}

function buildCourseOfAction(typology: AmlTypology): StixObject[] {
  return (typology.mitigations ?? []).map((mitigation) => ({
    type: 'course-of-action' as StixType,
    id: stixId('course-of-action'),
    spec_version: '2.1' as const,
    created: nowIso(),
    modified: nowIso(),
    name: `${typology.name} — Control`,
    description: mitigation,
    x_hawkeye_typology_id: typology.id,
  }));
}

function buildRelationship(fromId: string, toId: string, relType: string): StixObject {
  return {
    type: 'relationship',
    id: stixId('relationship'),
    spec_version: '2.1',
    created: nowIso(),
    modified: nowIso(),
    relationship_type: relType,
    source_ref: fromId,
    target_ref: toId,
  };
}

export function buildStixBundle(typologies: AmlTypology[]): StixBundle {
  const objects: StixObject[] = [];

  // Hawkeye identity object
  const identityId = stixId('identity');
  objects.push({
    type: 'identity',
    id: identityId,
    spec_version: '2.1',
    created: nowIso(),
    modified: nowIso(),
    name: 'Hawkeye Sterling',
    identity_class: 'system',
    description: 'Regulator-grade AML/CFT screening platform — UAE DNFBP compliant',
  });

  for (const typology of typologies) {
    const attackPattern = buildAttackPattern(typology);
    objects.push(attackPattern);

    const indicators = buildIndicator(typology, attackPattern.id);
    objects.push(...indicators);

    const controls = buildCourseOfAction(typology);
    objects.push(...controls);

    // Relationships: indicator indicates attack-pattern
    for (const ind of indicators) {
      objects.push(buildRelationship(ind.id, attackPattern.id, 'indicates'));
    }
    // Relationships: course-of-action mitigates attack-pattern
    for (const coa of controls) {
      objects.push(buildRelationship(coa.id, attackPattern.id, 'mitigates'));
    }
  }

  return {
    type: 'bundle',
    id: stixId('bundle'),
    objects,
  };
}

/** Build ATT&CK Navigator layer JSON for visualization */
export function buildNavigatorLayer(typologies: AmlTypology[]): Record<string, unknown> {
  return {
    name: 'Hawkeye Sterling — AML Typologies',
    versions: { attack: '14', navigator: '4.9', layer: '4.5' },
    domain: 'enterprise-attack',
    description: 'AML/CFT typologies mapped to AMLTRIX tactics — generated by Hawkeye Sterling',
    filters: { platforms: ['Financial Services'] },
    sorting: 0,
    layout: { layout: 'side', aggregateFunction: 'average', showID: true, showName: true },
    hideDisabled: false,
    techniques: typologies.map((t) => ({
      techniqueID: t.amltrixTacticId ?? AMLTRIX_TACTIC_MAP[t.domain] ?? 'ML0000',
      tactic: t.domain,
      color: '#ff6666',
      comment: t.description,
      enabled: true,
      metadata: [
        { name: 'hawkeye_id', value: t.id },
        { name: 'domain', value: t.domain },
        { name: 'fatf_category', value: t.fatfCategory ?? 'ML' },
      ],
      links: [],
      showSubtechniques: false,
    })),
    gradient: { colors: ['#ff6666', '#ffe766', '#8ec843'], minValue: 0, maxValue: 100 },
    legendItems: [],
    metadata: [
      { name: 'generator', value: 'Hawkeye Sterling' },
      { name: 'generated_at', value: new Date().toISOString() },
    ],
    links: [],
    showTacticRowBackground: false,
    tacticRowBackground: '#dddddd',
    selectTechniquesAcrossTactics: true,
    selectSubtechniquesWithParent: false,
    selectVisibleTechniques: false,
  };
}
