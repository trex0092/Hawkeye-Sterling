import { beforeEach, describe, expect, it, vi } from "vitest";

const blobs = new Map<string, unknown>();
vi.mock("@/lib/server/store", () => ({
  getJson: vi.fn(async (key: string) => blobs.get(key) ?? null),
  setJson: vi.fn(async (key: string, value: unknown) => {
    blobs.set(key, value);
  }),
}));

import { readHistory, recordAndGetPrior } from "@/lib/server/attestation-history";

describe("attestation history", () => {
  beforeEach(() => blobs.clear());

  it("returns prior days only and persists today", async () => {
    blobs.set("hs-attest/history/screening.json", [
      { date: "2026-06-08", state: "C" },
      { date: "2026-06-09", state: "A" },
    ]);
    const prior = await recordAndGetPrior("screening", "2026-06-10", "E");
    expect(prior).toEqual([
      { date: "2026-06-08", state: "C" },
      { date: "2026-06-09", state: "A" },
    ]);
    expect(await readHistory("screening")).toEqual([
      { date: "2026-06-08", state: "C" },
      { date: "2026-06-09", state: "A" },
      { date: "2026-06-10", state: "E" },
    ]);
  });

  it("is idempotent for the same date (re-runs overwrite, never duplicate)", async () => {
    await recordAndGetPrior("screening", "2026-06-10", "C");
    await recordAndGetPrior("screening", "2026-06-10", "E");
    const history = await readHistory("screening");
    expect(history).toEqual([{ date: "2026-06-10", state: "E" }]);
  });

  it("keeps at most 7 days", async () => {
    for (let d = 1; d <= 9; d++) {
      await recordAndGetPrior("screening", `2026-06-${String(d).padStart(2, "0")}`, "C");
    }
    const history = await readHistory("screening");
    expect(history).toHaveLength(7);
    expect(history[0]?.date).toBe("2026-06-03");
  });

  it("degrades malformed blobs to empty history", async () => {
    blobs.set("hs-attest/history/screening.json", { nonsense: true });
    expect(await readHistory("screening")).toEqual([]);
  });
});
