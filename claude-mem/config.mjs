/**
 * Configuration for the Hawkeye-Sterling Claude memory system.
 *
 * All paths default to a .claude-mem/ directory in the project root.
 * Override with CLAUDE_MEM_DIR environment variable.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

export const DATA_DIR = process.env.CLAUDE_MEM_DIR
  || join(PROJECT_ROOT, '.claude-mem');

export const PATHS = {
  dataDir: DATA_DIR,
  dbFile: join(DATA_DIR, 'memory.db'),
  contextDir: join(DATA_DIR, 'context'),
  summariesDir: join(DATA_DIR, 'summaries'),
};

/** Maximum tokens to inject at session start. */
export const MAX_INJECT_TOKENS = 2000;

/** Observation categories relevant to AML/CFT compliance. */
export const CATEGORIES = Object.freeze([
  'screening_result',
  'compliance_decision',
  'regulatory_observation',
  'entity_interaction',
  'filing_activity',
  'mlro_directive',
  'risk_assessment',
  'workflow_note',
  'error_resolution',
  'architecture_change',
]);

/**
 * Context tiers (OpenViking-inspired L0/L1/L2).
 *
 *   L0 — always loaded: project identity, regulatory framework, active alerts
 *   L1 — session-relevant: recent screenings, current tasks, pending deadlines
 *   L2 — deep retrieval: historical decisions, archived reports, full regulatory text
 */
export const TIERS = Object.freeze({
  L0: { label: 'core',    maxTokens: 600,  alwaysLoad: true  },
  L1: { label: 'session', maxTokens: 800,  alwaysLoad: false },
  L2: { label: 'archive', maxTokens: 600,  alwaysLoad: false },
});

/** Compression threshold: sessions with more than this many observations get compressed. */
export const COMPRESS_THRESHOLD = 20;

/** How many recent sessions to consider for L1 context. */
export const RECENT_SESSION_COUNT = 5;

/** Search result limits. */
export const SEARCH_DEFAULTS = {
  maxResults: 20,
  maxDetailResults: 5,
};
