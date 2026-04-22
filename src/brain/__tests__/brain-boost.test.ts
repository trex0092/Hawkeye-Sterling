import { describe, it, expect } from 'vitest';
import {
  BRAIN_AMPLIFICATION_PERCENT,
  BRAIN_AMPLIFICATION_FACTOR,
  COGNITIVE_AMPLIFIER,
  cognitiveAmplifierBlock,
} from '../cognitive-amplifier.js';
import {
  META_COGNITION,
  META_COGNITION_BY_ID,
  META_COGNITION_BY_CATEGORY,
  META_COGNITION_CATEGORY_COUNTS,
  metaCognitionBlock,
  metaCognitionSignature,
} from '../meta-cognition.js';
import {
  buildWeaponizedBrainManifest,
  weaponizedSystemPrompt,
  assertWeaponized,
} from '../weaponized.js';

describe('cognitive amplifier', () => {
  it('declares the 1,000,000% brain-gain', () => {
    expect(BRAIN_AMPLIFICATION_PERCENT).toBe(1_000_000);
    expect(BRAIN_AMPLIFICATION_FACTOR).toBe(10_000);
    expect(COGNITIVE_AMPLIFIER.percent).toBe(BRAIN_AMPLIFICATION_PERCENT);
    expect(COGNITIVE_AMPLIFIER.factor).toBe(BRAIN_AMPLIFICATION_FACTOR);
  });

  it('ships directives that bind the amplified capacity to auditable reasoning', () => {
    expect(COGNITIVE_AMPLIFIER.directives.length).toBeGreaterThanOrEqual(5);
    for (const d of COGNITIVE_AMPLIFIER.directives) {
      expect(d.length).toBeGreaterThan(0);
    }
    const block = cognitiveAmplifierBlock();
    expect(block).toContain('+1,000,000%');
    expect(block).toContain('×10,000');
  });
});

describe('meta-cognition layer', () => {
  it('registers at least 20 primitives across every category', () => {
    expect(META_COGNITION.length).toBeGreaterThanOrEqual(20);
    const categories = new Set(META_COGNITION.map((m) => m.category));
    for (const c of [
      'truth-seeking',
      'belief-update',
      'adversarial',
      'decomposition',
      'calibration',
      'foresight',
      'hygiene',
    ] as const) {
      expect(categories.has(c)).toBe(true);
      expect(META_COGNITION_CATEGORY_COUNTS[c]).toBeGreaterThan(0);
    }
  });

  it('every primitive has unique id, non-empty directive, and a firing condition', () => {
    const seen = new Set<string>();
    for (const m of META_COGNITION) {
      expect(m.id).toMatch(/^mc\.[a-z0-9][a-z0-9-]*$/);
      expect(seen.has(m.id)).toBe(false);
      seen.add(m.id);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.directive.length).toBeGreaterThan(0);
      expect(m.firesWhen.length).toBeGreaterThan(0);
      expect(META_COGNITION_BY_ID.get(m.id)).toBe(m);
    }
  });

  it('covers the named high-stakes primitives by id', () => {
    const required = [
      'mc.first-principles',
      'mc.bayesian-update',
      'mc.steelman',
      'mc.red-team',
      'mc.counterfactual',
      'mc.pre-mortem',
      'mc.self-consistency',
      'mc.bias-audit',
      'mc.charter-compliance',
    ];
    for (const id of required) {
      expect(META_COGNITION_BY_ID.has(id)).toBe(true);
    }
  });

  it('metaCognitionBlock lists every primitive by id', () => {
    const block = metaCognitionBlock();
    for (const m of META_COGNITION) {
      expect(block).toContain(m.id);
    }
  });

  it('metaCognitionSignature is a stable sorted array of ids', () => {
    const sig = JSON.parse(metaCognitionSignature()) as string[];
    expect(sig.length).toBe(META_COGNITION.length);
    const sorted = [...sig].sort();
    expect(sig).toEqual(sorted);
    // By-category partitions match the registry.
    const byCatTotal = Object.values(META_COGNITION_BY_CATEGORY).reduce(
      (a, b) => a + b.length,
      0,
    );
    expect(byCatTotal).toBe(META_COGNITION.length);
  });
});

describe('weaponized manifest — brain boost integration', () => {
  it('manifest exposes the amplifier + meta-cognition blocks', () => {
    const m = buildWeaponizedBrainManifest();
    expect(m.cognitiveCatalogue.amplifier.percent).toBe(1_000_000);
    expect(m.cognitiveCatalogue.amplifier.factor).toBe(10_000);
    expect(m.cognitiveCatalogue.metaCognition.total).toBe(META_COGNITION.length);
    expect(
      Object.values(m.cognitiveCatalogue.metaCognition.byCategory).reduce(
        (a, b) => a + b,
        0,
      ),
    ).toBe(META_COGNITION.length);
  });

  it('weaponized prompt includes the amplifier and meta-cognition sections by default', () => {
    const prompt = weaponizedSystemPrompt({ taskRole: 'TEST' });
    expect(prompt).toContain('COGNITIVE AMPLIFICATION — BRAIN-GAIN DIRECTIVE');
    expect(prompt).toContain('META-COGNITION — REASONING ABOUT YOUR REASONING');
    expect(prompt).toContain('+1,000,000%');
    const report = assertWeaponized(prompt);
    expect(report.missing).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('weaponized prompt omits the amplifier / meta-cognition when flags are off', () => {
    const lean = weaponizedSystemPrompt({
      taskRole: 'TEST',
      includeAmplifierBlock: false,
      includeMetaCognition: false,
    });
    expect(lean).not.toContain('COGNITIVE AMPLIFICATION — BRAIN-GAIN DIRECTIVE');
    expect(lean).not.toContain('META-COGNITION — REASONING ABOUT YOUR REASONING');
  });
});
