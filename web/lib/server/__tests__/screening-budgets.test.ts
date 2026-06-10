import { describe, expect, it } from 'vitest';
import { SCREENING_BUDGETS, SCREENING_SLA_MS } from '../screening-budgets';

// The operator's hard requirement: every screening-facing route responds in
// ≤5 seconds. These tests fail any budget change that would break the SLA.

describe('screening budgets — 5s SLA invariants', () => {
  it('every individual budget is below the 5s SLA', () => {
    for (const [key, value] of Object.entries(SCREENING_BUDGETS)) {
      expect(value, key).toBeLessThanOrEqual(SCREENING_SLA_MS);
    }
  });

  it('quick-screen: hard deadline + response reserve fits the SLA', () => {
    // 150ms response reserve + 100ms early-news grace are carved out of the
    // deadline by the route; 3_000 + ~250 << 5_000.
    expect(SCREENING_BUDGETS.QUICK_SCREEN_HARD_DEADLINE_MS + 500).toBeLessThanOrEqual(SCREENING_SLA_MS);
    expect(SCREENING_BUDGETS.QUICK_SCREEN_ADAPTER_TIMEOUT_MS).toBeLessThanOrEqual(
      SCREENING_BUDGETS.QUICK_SCREEN_HARD_DEADLINE_MS,
    );
    expect(SCREENING_BUDGETS.QUICK_SCREEN_LLM_ADAPTER_TIMEOUT_MS).toBeLessThanOrEqual(
      SCREENING_BUDGETS.QUICK_SCREEN_HARD_DEADLINE_MS,
    );
  });

  it('screening/run: no lane outer race exceeds the overall deadline', () => {
    const { RUN_OVERALL_DEADLINE_MS } = SCREENING_BUDGETS;
    expect(SCREENING_BUDGETS.RUN_LANE_B_OUTER_MS).toBeLessThanOrEqual(RUN_OVERALL_DEADLINE_MS);
    expect(SCREENING_BUDGETS.RUN_LANE_C_TOTAL_MS).toBeLessThanOrEqual(RUN_OVERALL_DEADLINE_MS);
    expect(SCREENING_BUDGETS.RUN_LANE_D_OUTER_MS).toBeLessThanOrEqual(RUN_OVERALL_DEADLINE_MS);
    expect(SCREENING_BUDGETS.RUN_PREWORK_TIMEOUT_MS).toBeLessThanOrEqual(RUN_OVERALL_DEADLINE_MS);
    // ~700ms route overhead (auth, adversarial check, merge, serialize).
    expect(RUN_OVERALL_DEADLINE_MS + 700).toBeLessThanOrEqual(SCREENING_SLA_MS);
  });

  it('screening/run lane C: inner races fit inside the lane total', () => {
    expect(SCREENING_BUDGETS.RUN_LANE_C_TARANIS_INNER_MS).toBeLessThanOrEqual(
      SCREENING_BUDGETS.RUN_LANE_C_TARANIS_OUTER_MS,
    );
    expect(SCREENING_BUDGETS.RUN_LANE_C_TARANIS_OUTER_MS).toBeLessThanOrEqual(
      SCREENING_BUDGETS.RUN_LANE_C_TOTAL_MS,
    );
    expect(SCREENING_BUDGETS.RUN_LANE_C_OSINT_MIN_REMAINING_MS).toBeLessThanOrEqual(
      SCREENING_BUDGETS.RUN_LANE_C_TOTAL_MS - SCREENING_BUDGETS.RUN_LANE_C_TARANIS_OUTER_MS +
        SCREENING_BUDGETS.RUN_LANE_C_TOTAL_MS, // sanity: min-remaining must be attainable
    );
    expect(SCREENING_BUDGETS.RUN_LANE_B_YENTE_MS).toBeLessThanOrEqual(
      SCREENING_BUDGETS.RUN_LANE_B_OUTER_MS,
    );
  });

  it('adverse-media route: budget-aware components are mutually consistent', () => {
    const b = SCREENING_BUDGETS;
    // The fallback path computes the Claude timeout from REMAINING budget
    // (min(CLAUDE_MAX, remaining − reserve), skip below CLAUDE_MIN), so the
    // static invariants are: each component fits the budget alone, and the
    // vendor-slow path still leaves room for a minimally-useful Claude call.
    expect(b.ADVERSE_MEDIA_TARANIS_OUTER_MS).toBeLessThanOrEqual(b.ADVERSE_MEDIA_ROUTE_BUDGET_MS);
    expect(b.ADVERSE_MEDIA_TARANIS_INNER_MS).toBeLessThanOrEqual(b.ADVERSE_MEDIA_TARANIS_OUTER_MS);
    expect(b.ADVERSE_MEDIA_CLAUDE_MIN_MS).toBeLessThanOrEqual(b.ADVERSE_MEDIA_CLAUDE_MAX_MS);
    expect(b.ADVERSE_MEDIA_CLAUDE_MAX_MS + 150).toBeLessThanOrEqual(b.ADVERSE_MEDIA_ROUTE_BUDGET_MS);
    expect(
      b.ADVERSE_MEDIA_VENDOR_MS + b.ADVERSE_MEDIA_CLAUDE_MIN_MS + 150,
    ).toBeLessThanOrEqual(b.ADVERSE_MEDIA_ROUTE_BUDGET_MS);
    // Route budget + ~700ms overhead (auth, body parse, serialize) ≤ SLA.
    expect(b.ADVERSE_MEDIA_ROUTE_BUDGET_MS + 700).toBeLessThanOrEqual(SCREENING_SLA_MS);
  });
});
