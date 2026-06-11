// Guards the core-sanctions-list coverage check that prevents a degraded
// corpus from producing false CLEAR verdicts (incident 2026-06-11: OFAC SDN
// timed out of the load behind a too-short blob-read timeout, and the prior
// guard only blocked when BOTH OFAC SDN and UN were missing — so a screen
// proceeded against partial coverage with OFAC SDN absent).

import { describe, it, expect } from "vitest";
import { CORE_SANCTIONS_LISTS, missingCoreSanctionsLists } from "../candidates-loader";

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
