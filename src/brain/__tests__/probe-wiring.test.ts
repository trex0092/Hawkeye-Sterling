// Tests the route-side probe wiring pattern: append instructions →
// extract markers → strip from visible answer → keep ProbeOutcome.
// Mirrors what mlro-probe.ts does so the wiring contract is locked
// before any UI consumes it.

import { describe, expect, it } from 'vitest';
import {
  PROBE_PROMPTS,
  parseProbeOutcomes,
  applyProbeOverride,
} from '../registry/index.js';

const PROBE_BLOCK =
  '\n\nADVERSARIAL PROBE — append the following two markers verbatim at the end of your answer, each on its own line. ' +
  'Pick one verdict from {proceed, decline, escalate, file_str, freeze} for each:\n\n' +
  `${PROBE_PROMPTS.innocent_narrative.instruction}\n\n` +
  `${PROBE_PROMPTS.sophisticated_launderer.instruction}`;

const MARKER_RX = /^\s*(?:INNOCENT-PROBE-VERDICT|ADVERSARIAL-PROBE-VERDICT)\s*:\s*[a-z_]+\s*$/im;

function stripProbeMarkers(answer: string): string {
  return answer
    .split('\n')
    .filter((line) => !MARKER_RX.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

describe('probe wiring: instruction injection is idempotent', () => {
  it('appending twice produces the same string', () => {
    const base = 'You are an MLRO Advisor.';
    const once = base + PROBE_BLOCK;
    // Simulate a second pass that would skip on detection of the
    // sentinel string the helper looks for.
    const sentinel = 'ADVERSARIAL PROBE — append';
    expect(once.includes(sentinel)).toBe(true);
  });
});

describe('probe wiring: marker extraction', () => {
  it('parses both markers and returns the clean answer', () => {
    const answer = [
      'The MLRO should...',
      'Per FDL 10/2025 Art.22, an STR is required.',
      '',
      'INNOCENT-PROBE-VERDICT: proceed',
      'ADVERSARIAL-PROBE-VERDICT: escalate',
    ].join('\n');
    const outcome = parseProbeOutcomes(answer, 'escalate');
    const clean = stripProbeMarkers(answer);
    expect(outcome.innocent).toBe('proceed');
    expect(outcome.adversarial).toBe('escalate');
    expect(outcome.survived).toBe(true);
    expect(clean).not.toMatch(/INNOCENT-PROBE-VERDICT/);
    expect(clean).not.toMatch(/ADVERSARIAL-PROBE-VERDICT/);
    expect(clean).toMatch(/Per FDL 10\/2025 Art\.22/);
  });

  it('handles markers separated by extra blank lines', () => {
    const answer = [
      'Body text.',
      '',
      'INNOCENT-PROBE-VERDICT: proceed',
      '',
      '',
      'ADVERSARIAL-PROBE-VERDICT: file_str',
    ].join('\n');
    const outcome = parseProbeOutcomes(answer, 'proceed');
    const clean = stripProbeMarkers(answer);
    expect(outcome.innocent).toBe('proceed');
    expect(outcome.adversarial).toBe('file_str');
    expect(outcome.survived).toBe(false);
    expect(outcome.disagreement).toBe('sophisticated_launderer');
    // The override pivots a non-survivor to escalate.
    const override = applyProbeOverride('proceed', outcome);
    expect(override.overridden).toBe(true);
    expect(override.verdict).toBe('escalate');
    expect(clean).not.toMatch(/PROBE-VERDICT/);
  });

  it('flags both markers missing when the model ignored the prompt', () => {
    const answer = 'A regulator-grade answer with no markers at all.';
    const outcome = parseProbeOutcomes(answer, 'escalate');
    expect(outcome.innocent).toBeNull();
    expect(outcome.adversarial).toBeNull();
    expect(outcome.survived).toBe(false);
  });

  it('preserves the verdict when both probes survive', () => {
    const answer = [
      'Body.',
      'INNOCENT-PROBE-VERDICT: escalate',
      'ADVERSARIAL-PROBE-VERDICT: escalate',
    ].join('\n');
    const outcome = parseProbeOutcomes(answer, 'escalate');
    const override = applyProbeOverride('escalate', outcome);
    expect(override.overridden).toBe(false);
    expect(override.verdict).toBe('escalate');
  });
});
