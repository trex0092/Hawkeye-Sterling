// Screening latency budgets — single source of truth for the 5-second SLA.
//
// Every screening-facing route (quick-screen, screening/run, adverse-media)
// derives its internal deadlines from this table so the end-to-end response
// time can never exceed the 5s ceiling the operator requires. Budget tests in
// web/lib/server/__tests__/screening-budgets.test.ts assert the invariants;
// change a number here and the test suite tells you whether the SLA still
// holds.
//
// Route files cannot export arbitrary constants (Next.js App Router rejects
// non-handler exports), which is why these live in lib/ and are imported.

export const SCREENING_SLA_MS = 5_000;

export const SCREENING_BUDGETS = {
  // ── /api/quick-screen ──────────────────────────────────────────────────────
  // Hard deadline before the route returns with enrichmentPending; the
  // remaining ~150ms reserve covers summary build + serialization.
  QUICK_SCREEN_HARD_DEADLINE_MS: 3_000,
  // Per-adapter cap for fast HTTP augmentation adapters (registries, news).
  QUICK_SCREEN_ADAPTER_TIMEOUT_MS: 1_500,
  // LLM adverse-media adapters are kicked off early (parallel with the local
  // corpus screen) so they get more useful wall-clock than the HTTP group.
  QUICK_SCREEN_LLM_ADAPTER_TIMEOUT_MS: 2_500,

  // ── /api/screening/run (multi-source lanes) ────────────────────────────────
  RUN_OVERALL_DEADLINE_MS: 4_300,
  // uaeStale + PEP pre-work race — runs concurrently with the lanes.
  RUN_PREWORK_TIMEOUT_MS: 1_500,
  // Lane B: OpenSanctions via Yente.
  RUN_LANE_B_OUTER_MS: 4_000,
  RUN_LANE_B_YENTE_MS: 3_500,
  // Lane C: adverse media (Taranis primary, OSINT fallback).
  RUN_LANE_C_TOTAL_MS: 3_500,
  RUN_LANE_C_TARANIS_OUTER_MS: 2_500,
  RUN_LANE_C_TARANIS_INNER_MS: 2_300,
  // OSINT fallback only runs when at least this much of Lane C's budget is
  // left — otherwise the lane reports provider 'skipped_budget' (degraded).
  RUN_LANE_C_OSINT_MIN_REMAINING_MS: 1_500,
  // Lane D: LSEG World-Check One.
  RUN_LANE_D_OUTER_MS: 4_000,

  // ── /api/adverse-media ─────────────────────────────────────────────────────
  ADVERSE_MEDIA_ROUTE_BUDGET_MS: 4_300,
  ADVERSE_MEDIA_TARANIS_OUTER_MS: 2_500,
  ADVERSE_MEDIA_TARANIS_INNER_MS: 2_300,
  ADVERSE_MEDIA_VENDOR_MS: 1_500,
  // Claude verdict call: capped at MAX, skipped entirely (deterministic
  // keyword classifier instead) when less than MIN budget remains.
  ADVERSE_MEDIA_CLAUDE_MAX_MS: 3_200,
  ADVERSE_MEDIA_CLAUDE_MIN_MS: 1_800,
  ADVERSE_MEDIA_ENRICHMENT_MS: 1_000,
} as const;

export type ScreeningBudgets = typeof SCREENING_BUDGETS;
