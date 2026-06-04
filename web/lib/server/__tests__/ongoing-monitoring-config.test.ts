import { describe, it, expect } from "vitest";
import {
  GLOBAL_SCREEN_FLOOR_SLOTS_UTC,
  nextGlobalFloorSlot,
  isScreenDueWithFloor,
  nextScreenAtWithFloor,
} from "../ongoing-monitoring-config";

const ms = (iso: string) => Date.parse(iso);

describe("global 3×/day monitoring floor", () => {
  describe("nextGlobalFloorSlot", () => {
    it("returns the next slot later the same day", () => {
      expect(nextGlobalFloorSlot(ms("2026-06-04T10:00:00Z"))).toBe(
        ms("2026-06-04T11:00:00Z"),
      );
      expect(nextGlobalFloorSlot(ms("2026-06-04T02:00:00Z"))).toBe(
        ms("2026-06-04T04:30:00Z"),
      );
    });

    it("is strictly-after — a time exactly on a slot rolls to the next slot", () => {
      expect(nextGlobalFloorSlot(ms("2026-06-04T11:00:00Z"))).toBe(
        ms("2026-06-04T13:30:00Z"),
      );
    });

    it("wraps to the first slot of the next day after the last slot", () => {
      expect(nextGlobalFloorSlot(ms("2026-06-04T20:00:00Z"))).toBe(
        ms("2026-06-05T04:30:00Z"),
      );
    });

    it("exposes exactly three slots", () => {
      expect(GLOBAL_SCREEN_FLOOR_SLOTS_UTC).toHaveLength(3);
    });
  });

  describe("isScreenDueWithFloor", () => {
    it("a never-screened subject is always due", () => {
      expect(isScreenDueWithFloor("standard", null, ms("2026-06-04T12:00:00Z"))).toBe(true);
    });

    it("a low-risk subject not due by tier IS due once a floor slot elapses", () => {
      // standard tier = 365d (not due), but a slot (13:30) passed since 11:05.
      const last = ms("2026-06-04T11:05:00Z");
      expect(isScreenDueWithFloor("standard", last, ms("2026-06-04T13:35:00Z"))).toBe(true);
    });

    it("a low-risk subject is NOT due before the next floor slot", () => {
      const last = ms("2026-06-04T11:05:00Z"); // next slot is 13:30
      expect(isScreenDueWithFloor("standard", last, ms("2026-06-04T12:00:00Z"))).toBe(false);
    });

    it("a tighter risk tier remains due via its own cadence", () => {
      const last = ms("2026-05-28T00:00:00Z"); // 7 days ago
      expect(isScreenDueWithFloor("pep", last, ms("2026-06-04T00:00:00Z"))).toBe(true);
    });
  });

  describe("nextScreenAtWithFloor", () => {
    it("caps a low-risk (365d) subject to the next floor slot", () => {
      const now = ms("2026-06-04T11:05:00Z");
      expect(nextScreenAtWithFloor("standard", now, now)).toBe(ms("2026-06-04T13:30:00Z"));
    });

    it("the floor dominates every tier (none screens less than 3×/day)", () => {
      const now = ms("2026-06-04T11:05:00Z");
      const slot = ms("2026-06-04T13:30:00Z");
      for (const tier of ["standard", "enhanced", "intensive", "pep", "prohibited"] as const) {
        expect(nextScreenAtWithFloor(tier, now, now)).toBe(slot);
      }
    });
  });
});
