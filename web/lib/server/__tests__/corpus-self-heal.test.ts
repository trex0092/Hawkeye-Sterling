// Guards the corpus self-heal trigger added after incident 2026-06-12: the
// hawkeye-lists store sat empty, every screen 503'd behind the count-floor
// guard, and recovery required a manual operator-refresh. Any load that
// falls back to the static seed must now kick off a full re-ingestion by
// itself — throttled so a request storm cannot stampede the ingestion
// pipeline.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { triggerCorpusSelfHeal, __setSelfHealRunnerForTests } from "../candidates-loader";

// anyWriteFailed: true keeps the meta-write convergence path out of unit
// tests (it would hit the real blob store helper); the meta write is gated
// on a fully clean run exactly like refresh-lists-core.
const cleanRun = { ok_count: 9, failed_count: 0, anyWriteFailed: true, summary: [] };

describe("triggerCorpusSelfHeal", () => {
  beforeEach(() => {
    // Installs the runner seam and resets the in-memory throttle.
    __setSelfHealRunnerForTests(vi.fn(async () => cleanRun));
  });

  afterEach(() => {
    __setSelfHealRunnerForTests(null);
  });

  it("runs the ingestion with the operator-refresh tier budgets", async () => {
    const runner = vi.fn(async () => cleanRun);
    __setSelfHealRunnerForTests(runner);

    expect(triggerCorpusSelfHeal("test: corpus empty")).toBe(true);

    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    expect(runner).toHaveBeenCalledWith("corpus-self-heal", {
      adapterTimeoutMs: 45_000,
      heavyAdapterTimeoutMs: 120_000,
    });
  });

  it("throttles repeat attempts inside the min interval", async () => {
    const runner = vi.fn(async () => cleanRun);
    __setSelfHealRunnerForTests(runner);

    expect(triggerCorpusSelfHeal("first")).toBe(true);
    expect(triggerCorpusSelfHeal("second within interval")).toBe(false);
    expect(triggerCorpusSelfHeal("third within interval")).toBe(false);

    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("never throws to the caller when the ingestion rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runner = vi.fn(async () => {
      throw new Error("upstream feed exploded");
    });
    __setSelfHealRunnerForTests(runner);

    expect(triggerCorpusSelfHeal("rejection path")).toBe(true);

    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    // The rejection must be swallowed by the fire-and-forget catch (logged,
    // not propagated as an unhandled rejection).
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[candidates-loader] corpus self-heal failed:",
        "upstream feed exploded",
      ),
    );
    consoleError.mockRestore();
  });
});
