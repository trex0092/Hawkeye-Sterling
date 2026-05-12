// Hawkeye Sterling — weaponized brain composer.
// Fuses the compliance charter, the 10 faculties, the 200 reasoning modes,
// the 5-category adverse-media taxonomy, the match-confidence taxonomy, and
// the mandatory output structure into a single signed contract that any
// downstream integration (Claude agent, narrative generator, search assistant,
// internal screening pipeline) can import as its governing policy.
//
// Principle: one source of truth. No integration is permitted to paraphrase
// the charter. Integrations append their task-specific role + audience only.

import { FACULTIES } from './faculties.js';
import { REASONING_MODES } from './reasoning-modes.js';
import { ADVERSE_MEDIA_CATEGORIES, ADVERSE_MEDIA_QUERY } from './adverse-media.js';
import { DOCTRINES, mandatoryDoctrines } from './doctrines.js';
import { RED_FLAGS, RED_FLAGS_BY_TYPOLOGY } from './red-flags.js';
import { TYPOLOGIES } from './typologies.js';
import { SANCTION_REGIMES, MANDATORY_UAE_REGIMES } from './sanction-regimes.js';
import { JURISDICTION_RISK_SEED } from './jurisdictions.js';
import { DPMS_KPIS, DPMS_KPIS_BY_CLUSTER } from './dpms-kpis.js';
import { CAHRA_SEED } from './cahra.js';
import { THRESHOLDS } from './thresholds.js';
import { PLAYBOOKS } from './playbooks.js';
import { REDLINES } from './redlines.js';
import { FATF_RECOMMENDATIONS } from './fatf-index.js';
import { DISPOSITIONS } from './dispositions.js';
import {
  SKILLS,
  SKILLS_DOMAIN_COUNTS,
  SKILLS_LAYER_COUNTS,
  skillsCatalogueSignature,
  skillsCatalogueSummary,
  type SkillDomain,
  type SkillLayer,
} from './skills-catalogue.js';
import {
  COGNITIVE_AMPLIFIER,
  cognitiveAmplifierBlock,
  type CognitiveAmplifier,
} from './cognitive-amplifier.js';
import {
  META_COGNITION,
  META_COGNITION_CATEGORY_COUNTS,
  metaCognitionBlock,
  metaCognitionSignature,
  type MetaCognitionCategory,
} from './meta-cognition.js';
import {
  SYSTEM_PROMPT,
  MATCH_CONFIDENCE_LEVELS,
  OUTPUT_SECTIONS,
  ABSOLUTE_PROHIBITIONS,
  REGULATORY_ANCHORS,
  AUTHORITATIVE_LISTS,
  type MatchConfidenceLevel,
  type OutputSection,
  type ProhibitionId,
} from '../policy/systemPrompt.js';
import { TYPOLOGY_PRIORS, hasCalibratedPrior } from './typology-priors.js';
import { primacyOf } from './regime-conflict.js';

export interface WeaponizedBrainManifest {
  product: 'Hawkeye Sterling';
  version: string;
  generatedAt: string;
  charter: {
    prohibitions: ReadonlyArray<{ id: ProhibitionId; label: string }>;
    matchConfidence: ReadonlyArray<MatchConfidenceLevel>;
    outputStructure: ReadonlyArray<OutputSection>;
    regulatoryAnchors: ReadonlyArray<string>;
    authoritativeLists: ReadonlyArray<string>;
  };
  cognitiveCatalogue: {
    faculties: Array<{
      id: string;
      displayName: string;
      describes: string;
      synonyms: string[];
      modeCount: number;
    }>;
    reasoningModes: {
      total: number;
      byCategory: Record<string, number>;
      byWave: { wave1: number; wave2: number; wave3: number; wave4: number; wave5: number; wave6: number };
    };
    adverseMedia: {
      categories: Array<{ id: string; displayName: string; keywordCount: number }>;
      totalKeywords: number;
      queryLength: number;
      weaponized: {
        severityTiers: string[];
        fatfMapping: boolean;
        sarTrigger: boolean;
        counterfactual: boolean;
        investigationNarrative: boolean;
        modesCited: boolean;
      };
    };
    doctrines: {
      total: number;
      mandatoryInUAE: number;
      byAuthority: Record<string, number>;
    };
    redFlags: {
      total: number;
      bySeverity: { low: number; medium: number; high: number };
      byTypology: Record<string, number>;
    };
    typologies: {
      total: number;
      ids: string[];
    };
    matching: {
      methods: string[];
    };
    sanctionRegimes: {
      total: number;
      mandatoryInUAE: number;
      byAuthority: Record<string, number>;
    };
    jurisdictions: {
      total: number;
      byFatfStatus: Record<string, number>;
    };
    dpmsKpis: {
      total: number;
      byCluster: Record<string, number>;
    };
    cahra: {
      total: number;
      activeCount: number;
    };
    thresholds: {
      total: number;
      ids: string[];
    };
    playbooks: {
      total: number;
      ids: string[];
    };
    redlines: {
      total: number;
      ids: string[];
    };
    fatf: {
      total: number;
      ids: string[];
    };
    dispositions: {
      total: number;
      ids: string[];
    };
    skills: {
      total: number;
      byLayer: Record<SkillLayer, number>;
      byDomain: Record<SkillDomain, number>;
    };
    amplifier: CognitiveAmplifier;
    metaCognition: {
      total: number;
      byCategory: Record<MetaCognitionCategory, number>;
      ids: string[];
    };
    bayesianCalibration: {
      defaultPrior: number;
      calibratedCount: number;
      uncalibratedCount: number;
      typologyPriors: Record<string, number>;
    };
    regimeConflict: {
      tier1Count: number;
      tier2Count: number;
      tier3Count: number;
      primacy: Record<string, number>;
    };
  };
  integrity: {
    charterHash: string;
    catalogueHash: string;
  };
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildWeaponizedBrainManifest(version = '0.2.0'): WeaponizedBrainManifest {
  const byCategory: Record<string, number> = {};
  const byWave = { wave1: 0, wave2: 0, wave3: 0, wave4: 0, wave5: 0, wave6: 0 };
  for (const mode of REASONING_MODES) {
    byCategory[mode.category] = (byCategory[mode.category] ?? 0) + 1;
    if (mode.wave === 1) byWave.wave1 += 1;
    else if (mode.wave === 3) byWave.wave3 += 1;
    else if (mode.wave === 4) byWave.wave4 += 1;
    else if (mode.wave === 5) byWave.wave5 += 1;
    else if (mode.wave === 6) byWave.wave6 += 1;
    else byWave.wave2 += 1;
  }

  const faculties = FACULTIES.map((f) => ({
    id: f.id,
    displayName: f.displayName,
    describes: f.describes,
    synonyms: [...f.synonyms],
    modeCount: f.modes.length,
  }));

  const adverseCategories = ADVERSE_MEDIA_CATEGORIES.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    keywordCount: c.keywords.length,
  }));
  const totalKeywords = ADVERSE_MEDIA_CATEGORIES.reduce(
    (sum, c) => sum + c.keywords.length,
    0,
  );

  const doctrineByAuthority: Record<string, number> = {};
  for (const d of DOCTRINES) {
    doctrineByAuthority[d.authority] = (doctrineByAuthority[d.authority] ?? 0) + 1;
  }

  const rfBySeverity = { low: 0, medium: 0, high: 0 };
  for (const rf of RED_FLAGS) rfBySeverity[rf.severity] += 1;
  const rfByTypology: Record<string, number> = {};
  for (const [typology, list] of Object.entries(RED_FLAGS_BY_TYPOLOGY)) {
    rfByTypology[typology] = list.length;
  }

  const regimeByAuthority: Record<string, number> = {};
  for (const r of SANCTION_REGIMES) {
    regimeByAuthority[r.authority] = (regimeByAuthority[r.authority] ?? 0) + 1;
  }

  const jurByFatf: Record<string, number> = {};
  for (const j of JURISDICTION_RISK_SEED) {
    jurByFatf[j.fatf] = (jurByFatf[j.fatf] ?? 0) + 1;
  }

  const kpiByCluster: Record<string, number> = {};
  for (const [cluster, list] of Object.entries(DPMS_KPIS_BY_CLUSTER)) {
    kpiByCluster[cluster] = list.length;
  }

  const calibratedTypologyPriors: Record<string, number> = {};
  let calibratedCount = 0;
  for (const t of TYPOLOGIES) {
    const p = TYPOLOGY_PRIORS[t.id];
    if (typeof p === 'number') {
      calibratedTypologyPriors[t.id] = p;
      calibratedCount += 1;
    }
  }
  const uncalibratedCount = TYPOLOGIES.length - calibratedCount;

  const regimePrimacy: Record<string, number> = {};
  let tier1 = 0;
  let tier2 = 0;
  let tier3 = 0;
  for (const r of SANCTION_REGIMES) {
    const p = primacyOf(r.id);
    regimePrimacy[r.id] = p;
    if (p >= 0.95) tier1 += 1;
    else if (p >= 0.75) tier2 += 1;
    else tier3 += 1;
  }
  // Reference imported helper to keep tree-shaking honest about the export.
  const _hasCalibrated = hasCalibratedPrior;
  void _hasCalibrated;

  const catalogueSignature = JSON.stringify({
    faculties: faculties.map((f) => f.id).sort(),
    modes: REASONING_MODES.map((m) => m.id).sort(),
    adverse: adverseCategories.map((c) => c.id).sort(),
    doctrines: DOCTRINES.map((d) => d.id).sort(),
    redFlags: RED_FLAGS.map((rf) => rf.id).sort(),
    typologies: TYPOLOGIES.map((t) => t.id).sort(),
    regimes: SANCTION_REGIMES.map((r) => r.id).sort(),
    jurisdictions: JURISDICTION_RISK_SEED.map((j) => j.iso2).sort(),
    kpis: DPMS_KPIS.map((k) => k.id).sort(),
    cahra: CAHRA_SEED.map((c) => c.iso2).sort(),
    thresholds: THRESHOLDS.map((t) => t.id).sort(),
    playbooks: PLAYBOOKS.map((p) => p.id).sort(),
    redlines: REDLINES.map((r) => r.id).sort(),
    fatf: FATF_RECOMMENDATIONS.map((r) => r.id).sort(),
    dispositions: DISPOSITIONS.map((d) => d.code).sort(),
    typologyPriors: Object.entries(calibratedTypologyPriors).sort(([a], [b]) => a.localeCompare(b)),
    regimePrimacy: Object.entries(regimePrimacy).sort(([a], [b]) => a.localeCompare(b)),
    skills: JSON.parse(skillsCatalogueSignature()),
    amplifier: {
      version: COGNITIVE_AMPLIFIER.version,
      percent: COGNITIVE_AMPLIFIER.percent,
      factor: COGNITIVE_AMPLIFIER.factor,
    },
    metaCognition: JSON.parse(metaCognitionSignature()),
  });

  return {
    product: 'Hawkeye Sterling',
    version,
    generatedAt: new Date().toISOString(),
    charter: {
      prohibitions: ABSOLUTE_PROHIBITIONS,
      matchConfidence: MATCH_CONFIDENCE_LEVELS,
      outputStructure: OUTPUT_SECTIONS,
      regulatoryAnchors: REGULATORY_ANCHORS,
      authoritativeLists: AUTHORITATIVE_LISTS,
    },
    cognitiveCatalogue: {
      faculties,
      reasoningModes: {
        total: REASONING_MODES.length,
        byCategory,
        byWave,
      },
      adverseMedia: {
        categories: adverseCategories,
        totalKeywords,
        queryLength: ADVERSE_MEDIA_QUERY.length,
        weaponized: {
          severityTiers: ['critical', 'high', 'medium', 'low', 'clear'],
          fatfMapping: true,
          sarTrigger: true,
          counterfactual: true,
          investigationNarrative: true,
          modesCited: true,
        },
      },
      doctrines: {
        total: DOCTRINES.length,
        mandatoryInUAE: mandatoryDoctrines().length,
        byAuthority: doctrineByAuthority,
      },
      redFlags: {
        total: RED_FLAGS.length,
        bySeverity: rfBySeverity,
        byTypology: rfByTypology,
      },
      typologies: {
        total: TYPOLOGIES.length,
        ids: TYPOLOGIES.map((t) => t.id),
      },
      matching: {
        methods: [
          'exact', 'levenshtein', 'jaro', 'jaro_winkler',
          'soundex', 'double_metaphone', 'token_set',
        ],
      },
      sanctionRegimes: {
        total: SANCTION_REGIMES.length,
        mandatoryInUAE: MANDATORY_UAE_REGIMES.length,
        byAuthority: regimeByAuthority,
      },
      jurisdictions: {
        total: JURISDICTION_RISK_SEED.length,
        byFatfStatus: jurByFatf,
      },
      dpmsKpis: {
        total: DPMS_KPIS.length,
        byCluster: kpiByCluster,
      },
      cahra: {
        total: CAHRA_SEED.length,
        activeCount: CAHRA_SEED.filter((c) => c.status === 'active_cahra').length,
      },
      thresholds: {
        total: THRESHOLDS.length,
        ids: THRESHOLDS.map((t) => t.id),
      },
      playbooks: {
        total: PLAYBOOKS.length,
        ids: PLAYBOOKS.map((p) => p.id),
      },
      redlines: {
        total: REDLINES.length,
        ids: REDLINES.map((r) => r.id),
      },
      fatf: {
        total: FATF_RECOMMENDATIONS.length,
        ids: FATF_RECOMMENDATIONS.map((r) => r.id),
      },
      dispositions: {
        total: DISPOSITIONS.length,
        ids: DISPOSITIONS.map((d) => d.code),
      },
      skills: {
        total: SKILLS.length,
        byLayer: SKILLS_LAYER_COUNTS as Record<SkillLayer, number>,
        byDomain: SKILLS_DOMAIN_COUNTS as Record<SkillDomain, number>,
      },
      amplifier: COGNITIVE_AMPLIFIER,
      metaCognition: {
        total: META_COGNITION.length,
        byCategory: META_COGNITION_CATEGORY_COUNTS as Record<MetaCognitionCategory, number>,
        ids: META_COGNITION.map((m) => m.id),
      },
      bayesianCalibration: {
        defaultPrior: 0.01,
        calibratedCount,
        uncalibratedCount,
        typologyPriors: calibratedTypologyPriors,
      },
      regimeConflict: {
        tier1Count: tier1,
        tier2Count: tier2,
        tier3Count: tier3,
        primacy: regimePrimacy,
      },
    },
    integrity: {
      charterHash: fnv1a(SYSTEM_PROMPT),
      catalogueHash: fnv1a(catalogueSignature),
    },
  };
}

export interface WeaponizedSystemPromptOptions {
  taskRole?: string;
  audience?: string;
  includeCatalogueSummary?: boolean;
  /**
   * Inject the MLRO / compliance skills catalogue summary. Default true.
   * When `includeSkillsFullList` is also true, every skill id + label + domain
   * + layer is dumped into the prompt (adds ~400 lines; use only when the
   * caller needs per-skill citation).
   */
  includeSkillsCatalogue?: boolean;
  includeSkillsFullList?: boolean;
  /**
   * Inject the cognitive amplifier block (brain-gain directive). Default true.
   * Disable only in low-stakes, read-only contexts where the amplified chain
   * of reasoning would be overkill.
   */
  includeAmplifierBlock?: boolean;
  /**
   * Inject the meta-cognition primitives (counterfactual, Bayesian, steelman,
   * red-team, pre-mortem, first-principles, analogical, self-consistency, …).
   * Default true. These sit ABOVE the domain reasoning modes and the skills
   * catalogue; disabling them only makes sense for unit tests of the lower
   * layers.
   */
  includeMetaCognition?: boolean;
  /** Emit the charter/catalogue/composite hashes at the end of the prompt. Default true. */
  includeIntegrityBlock?: boolean;
  /**
   * Inject the citation-enforcement block — primary-source-only rule, the
   * forbidden-hedge list, the stale-warning mandate, and the inline
   * regulator-anchor format. Default true. Disable only when the caller is
   * generating non-regulator-facing internal scaffolding (e.g. a draft summary
   * for an in-house playbook) where regulator citation density is unnecessary.
   */
  includeCitationEnforcement?: boolean;
}

export function weaponizedSystemPrompt(
  opts: WeaponizedSystemPromptOptions = {},
): string {
  const parts: string[] = [SYSTEM_PROMPT];

  if (opts.includeCatalogueSummary ?? true) {
    const manifest = buildWeaponizedBrainManifest();
    parts.push(
      [
        '',
        '================================================================================',
        'COGNITIVE CATALOGUE — AVAILABLE TO YOU',
        '================================================================================',
        '',
        `Faculties: ${manifest.cognitiveCatalogue.faculties.length} (${manifest.cognitiveCatalogue.faculties.map((f) => f.id).join(', ')}).`,
        `Reasoning modes: ${manifest.cognitiveCatalogue.reasoningModes.total} registered (wave 1: ${manifest.cognitiveCatalogue.reasoningModes.byWave.wave1}, wave 2: ${manifest.cognitiveCatalogue.reasoningModes.byWave.wave2}, wave 3: ${manifest.cognitiveCatalogue.reasoningModes.byWave.wave3}, wave 4: ${manifest.cognitiveCatalogue.reasoningModes.byWave.wave4}, wave 5: ${manifest.cognitiveCatalogue.reasoningModes.byWave.wave5}, wave 6: ${manifest.cognitiveCatalogue.reasoningModes.byWave.wave6}).`,
        `Adverse-media categories: ${manifest.cognitiveCatalogue.adverseMedia.categories.length} (${manifest.cognitiveCatalogue.adverseMedia.totalKeywords} keywords). Weaponized analyser: FATF-predicate mapping, ${manifest.cognitiveCatalogue.adverseMedia.weaponized.severityTiers.join('/')} severity tiers, SAR trigger (R.20), counterfactual, investigation narrative, mode citations — active.`,
        `Doctrines: ${manifest.cognitiveCatalogue.doctrines.total} (${manifest.cognitiveCatalogue.doctrines.mandatoryInUAE} mandatory in UAE).`,
        `Red flags: ${manifest.cognitiveCatalogue.redFlags.total} (high=${manifest.cognitiveCatalogue.redFlags.bySeverity.high}, medium=${manifest.cognitiveCatalogue.redFlags.bySeverity.medium}, low=${manifest.cognitiveCatalogue.redFlags.bySeverity.low}).`,
        `Typologies: ${manifest.cognitiveCatalogue.typologies.total}.`,
        `Sanction regimes: ${manifest.cognitiveCatalogue.sanctionRegimes.total} (${manifest.cognitiveCatalogue.sanctionRegimes.mandatoryInUAE} mandatory in UAE).`,
        `Jurisdictions indexed: ${manifest.cognitiveCatalogue.jurisdictions.total}.`,
        `DPMS KPIs: ${manifest.cognitiveCatalogue.dpmsKpis.total}.`,
        `Matching methods available: ${manifest.cognitiveCatalogue.matching.methods.join(', ')}.`,
        `CAHRA registry: ${manifest.cognitiveCatalogue.cahra.total} countries (${manifest.cognitiveCatalogue.cahra.activeCount} active CAHRA).`,
        `Thresholds: ${manifest.cognitiveCatalogue.thresholds.total} named thresholds available.`,
        `Playbooks: ${manifest.cognitiveCatalogue.playbooks.total} MLRO procedures available.`,
        `Redlines: ${manifest.cognitiveCatalogue.redlines.total} hard-stop rules active.`,
        `FATF recommendations indexed: ${manifest.cognitiveCatalogue.fatf.total}.`,
        `Disposition codes: ${manifest.cognitiveCatalogue.dispositions.total}.`,
        'Use named modes in your reasoning chain. Every finding must cite the mode id(s) that produced it, and — where applicable — the doctrine id, red-flag id, typology id, sanction-regime id, jurisdiction iso2, CAHRA status, DPMS KPI id, threshold id, playbook id, redline id, FATF recommendation id, disposition code, matching method id, and evidence id. Training-data evidence must carry the stale-warning. Any risk score must state methodology + inputs + weights + gaps (P9). Any outbound customer-facing text must pass the tipping-off guard (P4). Final narratives must pass the observable-facts linter (P3, P5).',
      ].join('\n'),
    );
  }

  if (opts.includeSkillsCatalogue ?? true) {
    parts.push(
      [
        '',
        '================================================================================',
        'SKILLS CATALOGUE — YOU EMBODY EVERY ONE OF THESE',
        '================================================================================',
        '',
        skillsCatalogueSummary(
          opts.includeSkillsFullList ? { includeFullList: true } : {},
        ),
      ].join('\n'),
    );
  }

  if (opts.includeMetaCognition ?? true) {
    parts.push(
      [
        '',
        '================================================================================',
        'META-COGNITION — REASONING ABOUT YOUR REASONING',
        '================================================================================',
        '',
        metaCognitionBlock(),
      ].join('\n'),
    );
  }

  if (opts.includeAmplifierBlock ?? true) {
    parts.push(
      [
        '',
        '================================================================================',
        'COGNITIVE AMPLIFICATION — BRAIN-GAIN DIRECTIVE',
        '================================================================================',
        '',
        cognitiveAmplifierBlock(),
      ].join('\n'),
    );
  }

  if (opts.includeCitationEnforcement ?? true) {
    parts.push(
      [
        '',
        '================================================================================',
        'CITATION ENFORCEMENT — PRIMARY-SOURCE-ONLY DOCTRINE',
        '================================================================================',
        '',
        'Every factual assertion in your output MUST satisfy ALL of the following:',
        '',
        '1. PRIMARY SOURCE ANCHOR. Cite the originating instrument by its proper',
        '   short name + article/section, e.g. "FDL No.10/2025 Art.16(2)", "CR No.134/2025 Art.6",',
        '   "FATF R.10 INR.10(b)", "EU 5AMLD Art.18a(3)",',
        '   "OFAC 31 CFR §501.603", "BSA 31 USC §5318(g)", "MLR 2017 Reg.18". A',
        '   bare jurisdiction tag ("UAE", "EU") is NOT a citation. A regulator',
        '   name without an instrument ("the FCA says…") is NOT a citation.',
        '',
        '2. NO HEDGING ON FACTS. The following phrases are FORBIDDEN inside any',
        '   factual claim, regulatory threshold, or definition: "may", "might",',
        '   "could be", "typically", "generally", "usually", "often", "tends',
        '   to", "I believe", "in my opinion", "it seems", "appears to",',
        '   "probably", "perhaps". State the rule as the regulation states it,',
        '   or refuse the claim. Hedges are ONLY permissible when explicitly',
        '   labelling a forward-looking prediction or a counterfactual',
        '   ("Forward-looking: …", "Counterfactual: …").',
        '',
        '3. STALE-WARNING (P8). If a fact is sourced from training data rather',
        '   than the supplied evidence pack or a primary instrument, prefix it',
        '   with "[STALE — verify against current text]" and recommend the',
        '   primary-source check as a next step.',
        '',
        '4. NUMERIC THRESHOLDS REQUIRE THE INSTRUMENT THAT FIXED THEM. Any',
        '   amount, ratio, percentage, day-count, or look-back period MUST cite',
        '   the regulation that defined the number, not a secondary',
        '   commentary. "EDD applies above EUR 15,000" without a 5AMLD/AMLD6',
        '   article number is a P9 violation (opaque scoring).',
        '',
        '5. JURISDICTION DISCIPLINE. If the question implicates more than one',
        '   regime, treat each regime as a SEPARATE PARAGRAPH with its own',
        '   citations. Do NOT collapse "UAE/EU/UK all require X" into one',
        '   sentence — the rules differ in scope, threshold, and exemption.',
        '',
        '6. CITATION DENSITY. The final REGULATOR-FACING NARRATIVE section',
        '   must contain at least ONE primary-source citation per substantive',
        '   paragraph. A paragraph with zero citations is provisional only and',
        '   must be marked "[provisional — no primary source on file]".',
        '',
        '7. NEVER INVENT INSTRUMENTS. Article numbers, section codes, recital',
        '   numbers, and regulator-issued circular IDs are NOT to be guessed.',
        '   When uncertain, cite the parent instrument and flag the article',
        '   number as "[article reference unverified]" — fabrication is a P2',
        '   violation and triggers BLOCKED verdict.',
        '',
        'A response that violates ANY of points 1–7 in a factual claim is a',
        'CHARTER VIOLATION and the advisor verdict MUST be at minimum',
        '"returned_for_revision". Mass violation (≥3 unsourced factual claims)',
        'triggers BLOCKED.',
      ].join('\n'),
    );
  }

  if (opts.taskRole) {
    parts.push(
      [
        '',
        '================================================================================',
        'TASK ROLE',
        '================================================================================',
        '',
        opts.taskRole,
      ].join('\n'),
    );
  }

  if (opts.audience) {
    parts.push(`\nAudience: ${opts.audience}`);
  }

  if (opts.includeIntegrityBlock ?? true) {
    const integrity = weaponizedIntegrity();
    parts.push(
      [
        '',
        '================================================================================',
        'INTEGRITY — DO NOT DRIFT',
        '================================================================================',
        '',
        `charterHash:   ${integrity.charterHash}`,
        `catalogueHash: ${integrity.catalogueHash}`,
        `compositeHash: ${integrity.compositeHash}`,
        `You MUST echo these three hashes verbatim in your AUDIT_LINE. Any output that omits them, paraphrases the charter, or asserts a skill / mode / doctrine / regime / CAHRA / FATF / playbook / disposition id that is not in the cognitive catalogue is a CHARTER VIOLATION and MUST be treated as a BLOCKED verdict.`,
      ].join('\n'),
    );
  }

  return parts.join('\n');
}

/**
 * Compute the three integrity hashes used to sign every weaponized prompt.
 * `compositeHash` = fnv1a(charterHash | '·' | catalogueHash).
 */
export function weaponizedIntegrity(): {
  charterHash: string;
  catalogueHash: string;
  compositeHash: string;
} {
  const manifest = buildWeaponizedBrainManifest();
  const composite = fnv1a(
    `${manifest.integrity.charterHash}·${manifest.integrity.catalogueHash}`,
  );
  return {
    charterHash: manifest.integrity.charterHash,
    catalogueHash: manifest.integrity.catalogueHash,
    compositeHash: composite,
  };
}

export interface WeaponizationAssertion {
  id: string;
  label: string;
  present: boolean;
  evidence: string;
}

export interface WeaponizationReport {
  ok: boolean;
  prompt: { length: number; lines: number };
  integrity: {
    charterHash: string;
    catalogueHash: string;
    compositeHash: string;
  };
  sections: WeaponizationAssertion[];
  missing: string[];
}

/**
 * Verify that a weaponized prompt carries every catalogue headline + charter
 * marker we expect. Used by tests + the `brain:weaponize` CLI to catch silent
 * regressions where an integration accidentally strips a section.
 */
export function assertWeaponized(prompt: string): WeaponizationReport {
  const integrity = weaponizedIntegrity();
  const checks: Array<Omit<WeaponizationAssertion, 'present' | 'evidence'> & {
    match: RegExp | string;
  }> = [
    { id: 'charter-banner', label: 'Compliance charter banner', match: 'COMPLIANCE & OPERATIONAL ADVISORY INTELLIGENCE' },
    { id: 'prohibitions', label: 'Absolute prohibitions block', match: 'ABSOLUTE PROHIBITIONS' },
    { id: 'output-structure', label: 'Mandatory 7-section output structure', match: 'MANDATORY OUTPUT STRUCTURE' },
    { id: 'match-confidence', label: 'Match-confidence taxonomy', match: 'MATCH CONFIDENCE' },
    { id: 'cognitive-catalogue', label: 'Cognitive catalogue header', match: 'COGNITIVE CATALOGUE' },
    { id: 'faculties', label: 'Faculties line', match: /Faculties: \d+/ },
    { id: 'reasoning-modes', label: 'Reasoning modes line', match: /Reasoning modes: \d+/ },
    { id: 'adverse-media', label: 'Adverse-media categories line', match: /Adverse-media categories: \d+/ },
    { id: 'doctrines', label: 'Doctrines line', match: /Doctrines: \d+/ },
    { id: 'red-flags', label: 'Red flags line', match: /Red flags: \d+/ },
    { id: 'typologies', label: 'Typologies line', match: /Typologies: \d+/ },
    { id: 'sanction-regimes', label: 'Sanction regimes line', match: /Sanction regimes: \d+/ },
    { id: 'jurisdictions', label: 'Jurisdictions line', match: /Jurisdictions indexed: \d+/ },
    { id: 'dpms-kpis', label: 'DPMS KPIs line', match: /DPMS KPIs: \d+/ },
    { id: 'matching', label: 'Matching methods line', match: /Matching methods available:/ },
    { id: 'cahra', label: 'CAHRA registry line', match: /CAHRA registry: \d+/ },
    { id: 'thresholds', label: 'Thresholds line', match: /Thresholds: \d+/ },
    { id: 'playbooks', label: 'Playbooks line', match: /Playbooks: \d+/ },
    { id: 'redlines', label: 'Redlines line', match: /Redlines: \d+ hard-stop/ },
    { id: 'fatf', label: 'FATF recommendations line', match: /FATF recommendations indexed: \d+/ },
    { id: 'dispositions', label: 'Disposition codes line', match: /Disposition codes: \d+/ },
    { id: 'skills-catalogue', label: 'Skills catalogue header', match: 'SKILLS CATALOGUE' },
    { id: 'skills-total', label: 'Skills total line', match: /\d+ skills registered/ },
    { id: 'meta-cognition-header', label: 'Meta-cognition header', match: 'META-COGNITION — REASONING ABOUT YOUR REASONING' },
    { id: 'meta-cognition-total', label: 'Meta-cognition total line', match: /Meta-cognition primitives: \d+ registered/ },
    { id: 'amplifier-header', label: 'Cognitive amplifier header', match: 'COGNITIVE AMPLIFICATION — BRAIN-GAIN DIRECTIVE' },
    { id: 'amplifier-percent', label: 'Cognitive amplifier percent line', match: /Cognitive amplification: \+[\d,]+%/ },
    { id: 'integrity-block', label: 'Integrity block', match: 'INTEGRITY — DO NOT DRIFT' },
    { id: 'charter-hash', label: 'Charter hash emitted', match: `charterHash:   ${integrity.charterHash}` },
    { id: 'catalogue-hash', label: 'Catalogue hash emitted', match: `catalogueHash: ${integrity.catalogueHash}` },
    { id: 'composite-hash', label: 'Composite hash emitted', match: `compositeHash: ${integrity.compositeHash}` },
  ];

  const sections: WeaponizationAssertion[] = checks.map(({ id, label, match }) => {
    const present = typeof match === 'string' ? prompt.includes(match) : match.test(prompt);
    const evidence = typeof match === 'string' ? match : match.source;
    return { id, label, present, evidence };
  });
  const missing = sections.filter((s) => !s.present).map((s) => s.id);
  return {
    ok: missing.length === 0,
    prompt: { length: prompt.length, lines: prompt.split('\n').length },
    integrity,
    sections,
    missing,
  };
}
