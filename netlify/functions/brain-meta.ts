// GET /api/brain — registry metadata for the UI HUD.

import type { Handler } from '@netlify/functions';
import {
  FACULTIES,
  REASONING_MODES,
  QUESTION_TEMPLATES,
  SCENARIOS,
  ADVERSE_MEDIA_CATEGORIES,
  ADVERSE_MEDIA_QUERY,
  COMBINED_SYNONYM_POOL,
  INTELLIGENCE_KEYWORDS,
  SCREENING_TAXONOMY,
  countModesWithRealApply,
  COMPLIANCE_POLICY_VERSION,
  PROHIBITIONS,
  MATCH_CONFIDENCE_TAXONOMY,
  MANDATORY_OUTPUT_SECTIONS,
  UAE_REGULATORY_ANCHORS,
} from '../../src/brain/index.js';

export const handler: Handler = async () => {
  const modesByCategory: Record<string, number> = {};
  for (const m of REASONING_MODES) {
    modesByCategory[m.category] = (modesByCategory[m.category] ?? 0) + 1;
  }

  const body = {
    tool: 'Hawkeye Sterling',
    version: '0.1.0',
    positioning: 'regulator-grade · built to surpass Refinitiv World-Check',
    totals: {
      faculties: FACULTIES.length,
      reasoningModes: REASONING_MODES.length,
      questionTemplates: QUESTION_TEMPLATES.length,
      scenarios: SCENARIOS.length,
      adverseMediaCategories: ADVERSE_MEDIA_CATEGORIES.length,
      adverseMediaKeywords: ADVERSE_MEDIA_CATEGORIES
        .reduce((n, c) => n + c.keywords.length, 0),
      adverseMediaQueryChars: ADVERSE_MEDIA_QUERY.length,
      combinedSynonymPool: COMBINED_SYNONYM_POOL.length,
      intelligenceKeywords: INTELLIGENCE_KEYWORDS.size,
      screeningTaxonomyBuckets: Object.keys(SCREENING_TAXONOMY).length,
      reasoningModesWithRealApply: countModesWithRealApply(),
    },
    modesByCategory,
    faculties: FACULTIES.map((f) => ({
      id: f.id,
      displayName: f.displayName,
      synonyms: f.synonyms,
      modeCount: f.modes.length,
    })),
    adverseMedia: ADVERSE_MEDIA_CATEGORIES.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      keywordCount: c.keywords.length,
    })),
    compliancePolicy: {
      version: COMPLIANCE_POLICY_VERSION,
      prohibitionCount: PROHIBITIONS.length,
      matchConfidenceTiers: MATCH_CONFIDENCE_TAXONOMY.map((t) => t.id),
      mandatoryOutputSections: MANDATORY_OUTPUT_SECTIONS,
      regulatoryAnchors: UAE_REGULATORY_ANCHORS,
    },
    sourceCoverage: {
      sanctions: [
        'UN Consolidated List',
        'OFAC SDN & Consolidated',
        'EU Financial Sanctions Files',
        'UK OFSI Consolidated',
        'UAE Executive Office for Control & Non-Proliferation (EOCN)',
        'UAE Local Terrorist List',
      ],
      pep: ['OpenSanctions PEP collections'],
      adverseMedia: ['NewsAPI', 'GDELT', 'Google CSE', 'Direct RSS feeds'],
    },
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
    body: JSON.stringify(body),
  };
};
