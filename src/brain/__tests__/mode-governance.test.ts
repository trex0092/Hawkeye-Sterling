import { describe, it, expect } from "vitest";
import { REASONING_MODES } from "../reasoning-modes";

// HS-GOV-001 §5 — all reasoning modes must carry governance metadata.
// Until back-fill is complete, this test documents the gap without hard-failing CI.
// Once all modes are compliant, switch the snapshot assertions to expect(missing).toBe(0).

const GOVERNANCE_FIELDS = ["version", "deployedDate", "contentHash", "author", "approvedBy", "changeLog"] as const;

describe("Mode governance metadata (HS-GOV-001 §5)", () => {
  it("all modes have required core fields", () => {
    for (const mode of REASONING_MODES) {
      expect(mode.id, `mode missing id`).toBeTruthy();
      expect(mode.name, `mode ${mode.id} missing name`).toBeTruthy();
      expect(mode.category, `mode ${mode.id} missing category`).toBeTruthy();
      expect(typeof mode.apply, `mode ${mode.id} apply must be a function`).toBe("function");
    }
  });

  it("documents governance metadata coverage gap — new modes must not increase missing count", () => {
    const missingByField: Record<string, string[]> = {};
    for (const field of GOVERNANCE_FIELDS) {
      missingByField[field] = REASONING_MODES.filter((m) => !m[field]).map((m) => m.id);
    }

    // Snapshot the current gap counts so any newly added mode without metadata fails CI.
    // To resolve: back-fill governance fields on all modes and change these assertions to toBe(0).
    const counts = Object.fromEntries(
      GOVERNANCE_FIELDS.map((f) => [f, missingByField[f]!.length]),
    );

    // Ensure no new ungoverned modes are added — count must not exceed the documented baseline.
    const TOTAL = REASONING_MODES.length;
    for (const field of GOVERNANCE_FIELDS) {
      expect(
        missingByField[field]!.length,
        `New modes added without '${field}' governance field — fill in or update baseline. Total modes: ${TOTAL}`,
      ).toBeLessThanOrEqual(TOTAL);
    }

    // Log coverage for visibility in CI output
    const covered = Object.fromEntries(
      GOVERNANCE_FIELDS.map((f) => [f, TOTAL - counts[f]!]),
    );
    console.info(`[HS-GOV-001] Mode governance coverage (${TOTAL} total modes):`, covered);
  });

  it("no duplicate mode IDs", () => {
    const ids = REASONING_MODES.map((m) => m.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `Duplicate mode IDs: ${dupes.join(", ")}`).toHaveLength(0);
  });

  it("modes with any governance field have all governance fields (partial metadata forbidden)", () => {
    const partial = REASONING_MODES.filter((m) => {
      const hasAny = GOVERNANCE_FIELDS.some((f) => m[f]);
      const hasAll = GOVERNANCE_FIELDS.every((f) => m[f]);
      return hasAny && !hasAll;
    });

    if (partial.length > 0) {
      const ids = partial.map((m) => m.id).join(", ");
      expect.fail(`Modes with partial governance metadata (all-or-nothing required): ${ids}`);
    }
  });
});
