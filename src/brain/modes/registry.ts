// Hawkeye Sterling — mode-implementation override registry.
//
// Any mode ID whose real implementation lives here wins over the stubApply()
// in reasoning-modes.ts. This is how Phase 7 stubs become real algorithms
// incrementally, without touching the 200-row registry file itself.
//
// To add a real implementation for an existing mode:
//   1. Write `export const fooApply: ModeApply = async (ctx) => { ... };`
//   2. Either import it here and add `foo: fooApply` to MODE_OVERRIDES,
//      or call `registerModeOverride('foo', fooApply)` at startup.

import type { BrainContext, Finding } from '../types.js';
import { META_MODE_APPLIES } from './meta.js';
import { LOGIC_MODE_APPLIES } from './logic.js';
import { FORENSIC_MODE_APPLIES } from './forensic.js';
import { COMPLIANCE_MODE_APPLIES } from './compliance.js';

export type ModeApply = (ctx: BrainContext) => Promise<Finding>;

export const MODE_OVERRIDES: Record<string, ModeApply> = {
  ...META_MODE_APPLIES,
  ...LOGIC_MODE_APPLIES,
  ...FORENSIC_MODE_APPLIES,
  ...COMPLIANCE_MODE_APPLIES,
};

/** Register (or replace) a real apply() for a mode at runtime. */
export function registerModeOverride(id: string, apply: ModeApply): void {
  MODE_OVERRIDES[id] = apply;
}

/** List IDs that have real implementations (i.e. are NOT stubs any more). */
export function listImplementedModeIds(): string[] {
  return Object.keys(MODE_OVERRIDES).sort();
}

/** Count real implementations vs a total mode count. Used by auditBrain. */
export function implementationCoverage(totalModes: number): {
  implemented: number;
  total: number;
  percent: number;
} {
  const implemented = Object.keys(MODE_OVERRIDES).length;
  return {
    implemented,
    total: totalModes,
    percent: totalModes === 0 ? 0 : Math.round((implemented / totalModes) * 100),
  };
}
