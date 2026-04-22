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
      byWave: { wave1: number; wave2: number };
    };
    adverseMedia: {
      categories: Array<{ id: string; displayName: string; keywordCount: number }>;
      totalKeywords: number;
      queryLength: number;
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
  const byWave = { wave1: 0, wave2: 0 };
  for (const mode of REASONING_MODES) {
    byCategory[mode.category] = (byCategory[mode.category] ?? 0) + 1;
    if (mode.wave === 1) byWave.wave1 += 1;
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

  const catalogueSignature = JSON.stringify({
    faculties: faculties.map((f) => f.id).sort(),
    modes: REASONING_MODES.map((m) => m.id).sort(),
    adverse: adverseCategories.map((c) => c.id).sort(),
    doctrines: DOCTRINES.map((d) => d.id).sort(),
    redFlags: RED_FLAGS.map((rf) => rf.id).sort(),
    typologies: TYPOLOGIES.map((t) => t.id).sort(),
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
        `Reasoning modes: ${manifest.cognitiveCatalogue.reasoningModes.total} registered (wave 1: ${manifest.cognitiveCatalogue.reasoningModes.byWave.wave1}, wave 2: ${manifest.cognitiveCatalogue.reasoningModes.byWave.wave2}).`,
        `Adverse-media categories: ${manifest.cognitiveCatalogue.adverseMedia.categories.length} (${manifest.cognitiveCatalogue.adverseMedia.totalKeywords} keywords).`,
        `Doctrines: ${manifest.cognitiveCatalogue.doctrines.total} (${manifest.cognitiveCatalogue.doctrines.mandatoryInUAE} mandatory in UAE).`,
        `Red flags: ${manifest.cognitiveCatalogue.redFlags.total} (high=${manifest.cognitiveCatalogue.redFlags.bySeverity.high}, medium=${manifest.cognitiveCatalogue.redFlags.bySeverity.medium}, low=${manifest.cognitiveCatalogue.redFlags.bySeverity.low}).`,
        `Typologies: ${manifest.cognitiveCatalogue.typologies.total}.`,
        'Use named modes in your reasoning chain. Every finding must cite the mode id(s) that produced it, and — where applicable — the doctrine id, red-flag id, and typology id.',
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

  return parts.join('\n');
}
