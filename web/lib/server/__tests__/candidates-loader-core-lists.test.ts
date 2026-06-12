// Guards the core-sanctions-list coverage check that prevents a degraded
// corpus from producing false CLEAR verdicts (incident 2026-06-11: OFAC SDN
// timed out of the load behind a too-short blob-read timeout, and the prior
// guard only blocked when BOTH OFAC SDN and UN were missing — so a screen
// proceeded against partial coverage with OFAC SDN absent).

import { describe, it, expect } from "vitest";
import {
  CORE_SANCTIONS_LISTS,
  CORE_LIST_MINIMUMS,
  missingCoreSanctionsLists,
  coreSanctionsCoverageGaps,
} from "../candidates-loader";

describe("missingCoreSanctionsLists", () => {
  it("returns empty when every core sanctions list is loaded", () => {
    const loaded = new Set([...CORE_SANCTIONS_LISTS, "ofac_cons", "uae_ltl"]);
    expect(missingCoreSanctionsLists(loaded)).toEqual([]);
  });

  it("flags OFAC SDN as missing even when UN Consolidated loaded (the incident hole)", () => {
    // Exactly the 2026-06-11 state: UN/OFAC-Cons loaded, the big lists timed out.
    const loaded = new Set(["un_consolidated", "ofac_cons"]);
    const missing = missingCoreSanctionsLists(loaded);
    expect(missing).toContain("ofac_sdn");
    expect(missing).toContain("eu_fsf");
    expect(missing).toContain("uk_ofsi");
    // The prior "both OFAC SDN and UN missing" rule would NOT have blocked here.
    expect(missing.length).toBeGreaterThan(0);
  });

  it("flags any single missing core list", () => {
    const loaded = new Set(["ofac_sdn", "un_consolidated", "eu_fsf"]); // uk_ofsi absent
    expect(missingCoreSanctionsLists(loaded)).toEqual(["uk_ofsi"]);
  });

  it("treats an empty corpus as all core lists missing", () => {
    expect(missingCoreSanctionsLists(new Set())).toEqual([...CORE_SANCTIONS_LISTS]);
  });

  it("accepts a plain iterable, not only a Set", () => {
    expect(missingCoreSanctionsLists(["ofac_sdn", "un_consolidated"])).toEqual(["eu_fsf", "uk_ofsi"]);
  });

  it("does not require UAE EOCN/LTL (tracked as a separate operator gap)", () => {
    const loaded = new Set(CORE_SANCTIONS_LISTS); // no uae_eocn / uae_ltl
    expect(missingCoreSanctionsLists(loaded)).toEqual([]);
  });
});

describe("coreSanctionsCoverageGaps (count-aware)", () => {
  function corpus(perList: Record<string, number>): Array<{ listId: string }> {
    return Object.entries(perList).flatMap(([listId, n]) =>
      Array.from({ length: n }, () => ({ listId })),
    );
  }

  it("passes when every core list meets its minimum (live-like counts)", () => {
    const live = corpus({ ofac_sdn: 19_065, un_consolidated: 1_002, eu_fsf: 5_994, uk_ofsi: 5_135 });
    expect(coreSanctionsCoverageGaps(live)).toEqual([]);
  });

  it("flags ALL core lists for a static-seed-like corpus with one token entry per regime (the 2026-06-12 hole)", () => {
    // The 65-entry bundled seed contains a listId sample per regime — presence
    // checks pass, count floors must not.
    const seed = corpus({ ofac_sdn: 1, un_consolidated: 1, eu_fsf: 1, uk_ofsi: 1, ch_seco: 61 });
    expect(coreSanctionsCoverageGaps(seed)).toEqual([...CORE_SANCTIONS_LISTS]);
  });

  it("flags only the list that is below its floor", () => {
    const partial = corpus({ ofac_sdn: 1_000, un_consolidated: 200, eu_fsf: 500, uk_ofsi: 499 });
    expect(coreSanctionsCoverageGaps(partial)).toEqual(["uk_ofsi"]);
  });

  it("floors sit well below the current live counts so routine shrinkage never trips them", () => {
    expect(CORE_LIST_MINIMUMS.ofac_sdn).toBeLessThanOrEqual(19_065 / 10);
    expect(CORE_LIST_MINIMUMS.un_consolidated).toBeLessThanOrEqual(1_002 / 2);
    expect(CORE_LIST_MINIMUMS.eu_fsf).toBeLessThanOrEqual(5_994 / 5);
    expect(CORE_LIST_MINIMUMS.uk_ofsi).toBeLessThanOrEqual(5_135 / 5);
  });
});
