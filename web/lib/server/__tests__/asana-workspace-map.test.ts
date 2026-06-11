import { describe, expect, it } from 'vitest';
import {
  MODULE_BOARDS,
  boardCharter,
  boardNarrative,
  attestationTaskName,
} from '../asana-workspace-map';

// Pins the narrative companion (asana-module-narratives.json): every module
// board's charter must carry its long-form audit narrative below the
// structured fields, and the result must stay within Asana's notes limit.

const ASANA_NOTES_LIMIT = 65_535;

describe('module board narratives', () => {
  it('provides a non-empty narrative for every one of the 84 module boards', () => {
    // 2026-06-11: Brain Intel, UBO Walker, Operator Console, and Data
    // Quality boards retired with their modules (88 → 84).
    expect(MODULE_BOARDS.length).toBe(84);
    for (const b of MODULE_BOARDS) {
      const n = boardNarrative(b.num);
      expect(n.length, `board ${b.num} (${b.label}) has no narrative`).toBeGreaterThan(100);
    }
  });

  it('renders the NARRATIVE section in every board charter', () => {
    for (const b of MODULE_BOARDS) {
      const charter = boardCharter(b);
      expect(charter, `charter for ${b.num}`).toContain('\nNARRATIVE\n');
      expect(charter).toContain(boardNarrative(b.num));
      // Structured header fields stay intact above the narrative.
      expect(charter.startsWith(`HAWKEYE STERLING · MODULE BOARD ${b.num}`)).toBe(true);
      expect(charter).toContain('CHANGE CONTROL');
    }
  });

  it('keeps every charter within the Asana notes size limit', () => {
    for (const b of MODULE_BOARDS) {
      expect(boardCharter(b).length, `charter for ${b.num}`).toBeLessThan(ASANA_NOTES_LIMIT);
    }
  });

  it('returns an empty string for unknown board numbers (charter omits section)', () => {
    expect(boardNarrative('9.99')).toBe('');
  });

  it('keeps attestation task naming stable', () => {
    const b = MODULE_BOARDS[0]!;
    expect(attestationTaskName(b)).toBe(`📌 ${b.label} — Compliance Attestation`);
  });
});
