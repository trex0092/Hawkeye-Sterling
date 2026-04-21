// GET /api/brain — registry metadata for the UI HUD.

import type { Handler } from '@netlify/functions';
import {
  FACULTIES,
  REASONING_MODES,
  QUESTION_TEMPLATES,
  SCENARIOS,
  ADVERSE_MEDIA_CATEGORIES,
  ADVERSE_MEDIA_QUERY,
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
