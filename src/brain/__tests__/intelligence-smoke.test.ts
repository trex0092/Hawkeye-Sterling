// Hawkeye Sterling — intelligence module smoke test.
//
// Smoke-tests every pure-function intelligence module to catch silent
// regressions. Each module is given a representative input and the
// output is checked for shape + sanity. No live HTTP calls.

import { describe, expect, it } from "vitest";

// We can't import .tsx components from web/ in a node-vitest run, but we
// CAN import the pure intelligence modules from web/lib/intelligence/
// because they have no DOM dependencies. Vitest is configured to include
// src/**/__tests__/**/*.test.ts so we use a relative path.

import { disposition, inferIndustryHints } from "../../../web/lib/intelligence/dispositionEngine.js";
import { jurisdictionRisk, chainGeographyRisk } from "../../../web/lib/intelligence/geographicRisk.js";
import { industryRisk, inferIndustrySegment } from "../../../web/lib/intelligence/industryRisk.js";
import { playbookFor } from "../../../web/lib/intelligence/typologyPlaybooks.js";
import { recencyWeightedScore, velocityScore, decayedSeverity } from "../../../web/lib/intelligence/temporalRisk.js";
import { networkContagion, hasSanctionedRelative } from "../../../web/lib/intelligence/networkRisk.js";
import { walkOwnershipChain, validateOwnershipGraph } from "../../../web/lib/intelligence/ownershipChain.js";
import { detectBehavioralFlags } from "../../../web/lib/intelligence/behavioralFlags.js";
import { classifyContext } from "../../../web/lib/intelligence/adverseMediaContext.js";
import { disambiguate } from "../../../web/lib/intelligence/nameDisambiguation.js";
import { evaluateFreshness } from "../../../web/lib/intelligence/watchlistFreshness.js";
import { diffScreenings } from "../../../web/lib/intelligence/sanctionsDelta.js";
import { analyzeCrypto } from "../../../web/lib/intelligence/cryptoExposure.js";
import { screenVessel, screenAircraft } from "../../../web/lib/intelligence/vesselScreening.js";
import { detectSmurfing, detectLayering, detectRoundTripping } from "../../../web/lib/intelligence/transactionPatterns.js";
import { detectSubnationalRegion } from "../../../web/lib/intelligence/subnationalSanctions.js";
import { multiPhonetic, anyPhoneticMatch } from "../../../web/lib/intelligence/phoneticEngines.js";
import { parseName, canonicalKey } from "../../../web/lib/intelligence/culturalNames.js";
import { sourceAuthorityScore, hasNegation, articleWeight } from "../../../web/lib/intelligence/sourceAuthority.js";
import { evaluateCoolOff } from "../../../web/lib/intelligence/pepCoolOff.js";
import { staleDataGate, dualSourceCorroboration, pinBrainVersion } from "../../../web/lib/intelligence/auditGates.js";
import { detectSyntheticClusters } from "../../../web/lib/intelligence/syntheticIdentity.js";
import { validateMrz, validateDob, detectNameScript, validatePhone, validateEmail, validateTaxId } from "../../../web/lib/intelligence/identityValidators.js";
import { customerRisk, channelRisk, productRisk, kycCompleteness } from "../../../web/lib/intelligence/kycRiskScorecard.js";
import { velocityRule, cashThreshold, crossBorderHighRisk } from "../../../web/lib/intelligence/transactionMonitoring.js";
import { levenshtein, jaroWinkler, soundex } from "../../../web/lib/intelligence/nameMatchers.js";
import { walkBeneficialOwnership, isLayered, substanceTest } from "../../../web/lib/intelligence/corporateProfilers.js";
import { lcOverShipment, blDiscrepancy, dualUseDetector } from "../../../web/lib/intelligence/tradeFinance.js";
import { walletAgeScore, mixerExposure } from "../../../web/lib/intelligence/cryptoIntel.js";
import { validateStr, ctrThresholdCheck, verifyAuditChain } from "../../../web/lib/intelligence/reportingValidators.js";
import { pepDailyDelta, evaluateRefresh } from "../../../web/lib/intelligence/liveDataTrackers.js";
import { attributeDecision, counterfactualLadder, wilsonInterval } from "../../../web/lib/intelligence/explainability.js";
import { keystrokeRhythm, mouseCurvature, timeOnForm } from "../../../web/lib/intelligence/behavioralBiometrics.js";
import { jpegQualityFlag, exifDateConsistency } from "../../../web/lib/intelligence/documentForensics.js";
import { emailThreadSentiment, voicemailScan } from "../../../web/lib/intelligence/communicationsAnalysis.js";
import { torExit, openProxy, datacenterIp, whoisAge } from "../../../web/lib/intelligence/networkForensics.js";
import { pierceNominee, settlorBeneficiaryMismatch } from "../../../web/lib/intelligence/beneficialOwnershipDeep.js";
import { russiaOilPriceCap, iranNuclearProcurement, comprehensiveRegions } from "../../../web/lib/intelligence/sanctionsStressTests.js";
import { aisImpossibleSpeed, containerChecksum } from "../../../web/lib/intelligence/tradeVesselsDeep.js";
import { sowCoherence, familyWealthBenchmark } from "../../../web/lib/intelligence/wealthAnalysis.js";
import { un1267Delta, ofacSdnDelta } from "../../../web/lib/intelligence/liveLookupDeltas.js";
import { npoTfRisk, casinoChipOut, shellBankCheck } from "../../../web/lib/intelligence/sectorRiskDeep.js";
import { trainNb, classifyNb, bayesUpdate, ewmaAnomaly } from "../../../web/lib/intelligence/statisticalLearning.js";

describe("intelligence smoke — every module returns a sane shape", () => {
  it("dispositionEngine + inferIndustryHints", () => {
    const r = disposition({
      composite: 28, sanctionsHits: 0, topSanctionsScore: 0, sanctionsLists: [],
      pepTier: null, amCompositeScore: 0.45, amCount: 3, amCategoriesTripped: ["corruption_organised_crime"],
      redlinesFired: 0, jurisdictionIso2: "TR", cahra: true, crossRegimeSplit: false,
      entityType: "organisation", industryHints: ["gold"],
    });
    expect(["clear","low","medium","high","critical"]).toContain(r.band);
    expect(r.confidence.confidence).toBeGreaterThan(0);
    expect(inferIndustryHints("Acme Gold Refinery FZE")).toContain("gold");
  });

  it("geographicRisk", () => {
    const r = jurisdictionRisk("IR");
    expect(r.tiers).toContain("comprehensive_sanctions");
    expect(chainGeographyRisk({ origin: "AE", destination: "IR" }).inherentRisk).toBeGreaterThan(50);
  });

  it("industryRisk", () => {
    expect(industryRisk("gold").inherentRisk).toBeGreaterThan(50);
    expect(inferIndustrySegment("Acme Gold Refinery FZE")).toBe("gold");
  });

  it("typologyPlaybooks", () => {
    expect(playbookFor("fatf_gold_trade_ml")?.immediate.length).toBeGreaterThan(0);
  });

  it("temporalRisk", () => {
    const events = [{ at: new Date().toISOString(), severity: "high" as const }];
    expect(recencyWeightedScore(events)).toBeGreaterThan(0);
    expect(velocityScore(events)).toBeGreaterThan(0);
    expect(decayedSeverity(events)).toBeDefined();
  });

  it("networkRisk", () => {
    const c = networkContagion([{ name: "spouse", kind: "spouse", flags: { sanctioned: true } }]);
    expect(c.score).toBeGreaterThan(0);
    expect(hasSanctionedRelative([{ name: "x", kind: "other", flags: { sanctioned: true } }])).toBe(true);
  });

  it("ownershipChain", () => {
    const graph = {
      rootId: "root",
      nodes: [
        { id: "d", name: "designated", designated: true, owns: [{ toId: "root", pct: 0.6 }] },
        { id: "root", name: "Target", designated: false },
      ],
    };
    expect(validateOwnershipGraph(graph)).toBeNull();
    expect(walkOwnershipChain(graph).blocked).toBe(true);
  });

  it("behavioralFlags", () => {
    const flags = detectBehavioralFlags({ employeeCount: 0, hasWebsite: false });
    expect(flags.length).toBeGreaterThan(0);
  });

  it("adverseMediaContext", () => {
    const r = classifyContext("John Smith was indicted on fraud charges", "John Smith");
    expect(r.severityMultiplier).toBeGreaterThan(0.5);
  });

  it("nameDisambiguation", () => {
    const r = disambiguate(
      { fullName: "Mohamed Ali", citizenship: "Pakistan", gender: "male" },
      { fullName: "Mohamed Ali" },
    );
    expect(r.isCommonName).toBe(true);
    expect(r.confidence).toBeLessThanOrEqual(0.5);
  });

  it("watchlistFreshness", () => {
    const r = evaluateFreshness([{ listId: "OFAC_SDN", fetchedAt: new Date().toISOString(), recordCount: 100 }]);
    expect(r.verdict).toBe("fresh");
  });

  it("sanctionsDelta", () => {
    const r = diffScreenings(
      { at: "2026-05-05T00:00:00Z", hits: [{ listId: "X", listRef: "1", score: 0.9 }], topScore: 90, severity: "high" },
      null,
    );
    expect(r.hasChanges).toBe(true);
  });

  it("cryptoExposure", () => {
    const r = analyzeCrypto([{ address: "0x1", chain: "eth", cluster: "tornado_cash" }]);
    expect(r.exposureTier).toBe("direct");
  });

  it("vesselScreening", () => {
    expect(screenVessel({ flag: "RU", darkFleet: true }).flagged).toBe(true);
    expect(screenAircraft({ flag: "IR" }).flagged).toBe(true);
  });

  it("transactionPatterns", () => {
    const t0 = Date.now();
    const txs = Array.from({ length: 4 }, (_, i) => ({
      id: `t${i}`, at: new Date(t0 + i * 60_000).toISOString(), amountUsd: 9500, fromParty: "alice",
    }));
    expect(detectSmurfing(txs).length).toBeGreaterThan(0);
    expect(detectLayering([])).toEqual([]);
    expect(detectRoundTripping([])).toEqual([]);
  });

  it("subnationalSanctions", () => {
    expect(detectSubnationalRegion("Yalta, Crimea").matched).toBe(true);
  });

  it("phoneticEngines", () => {
    const p = multiPhonetic("Mohamed");
    expect(p.arabicPhonetic.length).toBeGreaterThan(0);
    expect(anyPhoneticMatch("Mohamed", "Mohammed")).toBe(true);
  });

  it("culturalNames", () => {
    const p = parseName("Mohamed bin Salman al-Saud");
    expect(p.culture).toBe("arabic");
    expect(canonicalKey(p).length).toBeGreaterThan(0);
  });

  it("sourceAuthority", () => {
    expect(sourceAuthorityScore("https://reuters.com/x").score).toBeGreaterThan(0.9);
    expect(hasNegation("John denies the allegations").negated).toBe(true);
    expect(articleWeight("Subject denies allegations", "https://reuters.com").multiplier).toBeLessThan(0.5);
  });

  it("pepCoolOff", () => {
    const r = evaluateCoolOff({ exitedOfficeAt: new Date(Date.now() - 100 * 86400000).toISOString(), tier: "tier_1" });
    expect(r.isInCoolOff).toBe(true);
  });

  it("auditGates", () => {
    expect(staleDataGate(new Date().toISOString()).stale).toBe(false);
    expect(dualSourceCorroboration([{ authorityTier: "regulator" }]).corroborated).toBe(true);
    expect(pinBrainVersion({ engineVersion: "1.0", schemaVersion: "2.0", buildSha: "abc" }).fingerprint.length).toBe(8);
  });

  it("syntheticIdentity", () => {
    const events = Array.from({ length: 6 }, (_, i) => ({
      subjectId: `s${i}`, deviceFingerprint: "fp-1", at: new Date().toISOString(),
    }));
    expect(detectSyntheticClusters(events).length).toBeGreaterThan(0);
  });

  it("identityValidators", () => {
    expect(validateDob("2000-01-01").ok).toBe(true);
    expect(validateMrz("").ok).toBe(false);
    expect(detectNameScript("John Smith")).toBe("latin");
    expect(detectNameScript("محمد علي")).toBe("arabic");
    expect(validatePhone("+97150000000", "AE").ok).toBe(true);
    expect(validateEmail("alice@example.com").ok).toBe(true);
    expect(validateTaxId("100123456789012", "uae_trn").ok).toBe(true);
  });

  it("kycRiskScorecard", () => {
    expect(customerRisk({ isPep: true })).toBeGreaterThan(50);
    expect(channelRisk({ channel: "agent", introducerType: "lawyer" })).toBeGreaterThan(40);
    expect(productRisk({ productLine: "crypto" })).toBeGreaterThan(40);
    expect(kycCompleteness({ identityVerified: true }).pct).toBeGreaterThan(0);
  });

  it("transactionMonitoring", () => {
    const txs = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, at: new Date().toISOString(), amountUsd: 100 }));
    expect(velocityRule(txs, 5, 1).length).toBeGreaterThan(0);
    expect(cashThreshold({ id: "x", at: new Date().toISOString(), amountUsd: 20000, channel: "cash" })).not.toBeNull();
    expect(crossBorderHighRisk({ id: "x", at: new Date().toISOString(), amountUsd: 100, fromIso2: "AE", toIso2: "IR" })).not.toBeNull();
  });

  it("nameMatchers", () => {
    expect(levenshtein("Smith", "Smyth")).toBeGreaterThan(0.7);
    expect(jaroWinkler("Smith", "Smyth")).toBeGreaterThan(0.7);
    expect(soundex("Robert")).toBe(soundex("Rupert"));
  });

  it("corporateProfilers", () => {
    const ents = { e1: { id: "e1", name: "Top", kind: "company" as const, shareholders: [{ entityId: "p1", pct: 1 }] } };
    const ubo = walkBeneficialOwnership("e1", ents, new Set(["p1"]));
    expect(ubo.length).toBe(1);
    expect(isLayered("e1", ents, new Set(["p1"])).layered).toBe(false);
    expect(substanceTest({ id: "e1", name: "Top", kind: "company" }).score).toBeLessThanOrEqual(100);
  });

  it("tradeFinance", () => {
    expect(lcOverShipment({ lcRef: "X", applicant: "A", beneficiary: "B", amountUsd: 100, goodsDescription: "g", declaredQty: 100, shippedQty: 200 }).fired).toBe(true);
    expect(blDiscrepancy({ lcRef: "X", applicant: "A", beneficiary: "B", amountUsd: 100, goodsDescription: "g", bls: [{ blNumber: "1", consignee: "X", notify: "X" }] }).length).toBeGreaterThan(0);
    expect(dualUseDetector("Centrifuge equipment for sale").length).toBeGreaterThan(0);
  });

  it("cryptoIntel", () => {
    expect(walletAgeScore({ address: "0x", chain: "eth", firstSeenAt: new Date().toISOString() }).tier).toBe("very_new");
    expect(mixerExposure({ address: "0x", chain: "eth", exposureTags: ["tornado_cash"] }).severity).toBe("critical");
  });

  it("reportingValidators", () => {
    expect(validateStr({}).ok).toBe(false);
    expect(ctrThresholdCheck({ channel: "cash", amountUsd: 50000 }).required).toBe(true);
    expect(verifyAuditChain([])).toEqual({ ok: true });
  });

  it("liveDataTrackers", () => {
    const stamp = [{ listId: "OFAC_SDN", fetchedAt: new Date().toISOString(), recordCount: 100 }];
    expect(evaluateRefresh(stamp).freshCount).toBe(1);
    const r = pepDailyDelta([], [{ id: "1", name: "X", tier: "tier_1", updatedAt: new Date().toISOString() }]);
    expect(r.added.length).toBe(1);
  });

  it("explainability", () => {
    const contribs = [{ signal: "sanctions", contributionPts: 30, weight: 0.5, rationale: "x" }];
    expect(attributeDecision(contribs).length).toBe(1);
    expect(counterfactualLadder(60, contribs).length).toBe(5);
    expect(wilsonInterval(8, 10).centre).toBeGreaterThan(0.5);
  });

  it("behavioralBiometrics", () => {
    const events = Array.from({ length: 10 }, (_, i) => ({ type: "keydown" as const, at: i * 100, key: "a" }));
    expect(keystrokeRhythm(events).fingerprint).toBeDefined();
    expect(mouseCurvature([])).toBeDefined();
    expect(timeOnForm(0, 60_000, 5)).toBeDefined();
  });

  it("documentForensics", () => {
    expect(jpegQualityFlag({ jpegQuality: 30 }).flagged).toBe(true);
    expect(exifDateConsistency({}, undefined).ok).toBe(true);
  });

  it("communicationsAnalysis", () => {
    expect(emailThreadSentiment("This is a fraud and unacceptable").polarity).toBe("negative");
    expect(voicemailScan("STR has been filed").flagged).toBe(true);
  });

  it("networkForensics", () => {
    expect(torExit("1.2.3.4", new Set(["1.2.3.4"]))).toBe(true);
    expect(openProxy("9.9.9.9", new Set())).toBe(false);
    expect(datacenterIp("AS14061")).toBe(true);
    expect(whoisAge(new Date(Date.now() - 5 * 86400000).toISOString()).suspicious).toBe(true);
  });

  it("beneficialOwnershipDeep", () => {
    const node = { id: "n", name: "x", kind: "trust" as const, trustRoles: { settlor: "alice", beneficiaries: ["alice", "bob"] } };
    expect(settlorBeneficiaryMismatch(node).selfDealing).toBe(true);
    const nominees = { n1: { id: "n1", name: "nominee", kind: "nominee" as const, flags: { nominee: true }, controls: [{ targetId: "real", pct: 0.6 }] } };
    expect(pierceNominee("n1", nominees).piercedTo).toBe("real");
  });

  it("sanctionsStressTests", () => {
    expect(russiaOilPriceCap({ goodsHsCode: "2709", subjectIso2: "RU", oilProductBarrelPriceUsd: 70 }).fired).toBe(true);
    expect(iranNuclearProcurement({ goodsHsCode: "8401", counterpartyIso2: "IR" }).fired).toBe(true);
    expect(comprehensiveRegions("Yalta, Crimea").fired).toBe(true);
  });

  it("tradeVesselsDeep", () => {
    const track = { positions: [
      { at: "2026-05-05T00:00:00Z", lat: 25, lon: 55 },
      { at: "2026-05-05T01:00:00Z", lat: 35, lon: 65 },
    ] };
    expect(aisImpossibleSpeed(track).spoofed).toBe(true);
    expect(containerChecksum("MSCU1234567")).toBeDefined();
  });

  it("wealthAnalysis", () => {
    expect(sowCoherence({ declaredNetWorthUsd: 1_000_000 }).coherent).toBe(false);
    expect(familyWealthBenchmark({ declaredNetWorthUsd: 1_000_000, jurisdictionIso2: "AE" }).ratio).toBeGreaterThan(0);
  });

  it("liveLookupDeltas", () => {
    const prev = { fetchedAt: new Date().toISOString(), records: [{ id: "1", name: "x" }] };
    const cur = { fetchedAt: new Date().toISOString(), records: [{ id: "2", name: "y" }] };
    expect(un1267Delta(prev, cur).added.length).toBe(1);
    expect(ofacSdnDelta(prev, prev).added.length).toBe(0);
  });

  it("sectorRiskDeep", () => {
    expect(npoTfRisk({ jurisdictionIso2: "AF", cashIntensiveOps: true }).score).toBeGreaterThan(50);
    expect(casinoChipOut({ dailyChipOutUsd: 20_000 }).breached).toBe(true);
    expect(shellBankCheck({ isCorrespondent: true, hasPhysicalPresence: false }).refused).toBe(true);
  });

  it("statisticalLearning", () => {
    const model = trainNb([
      { typology: "ml", features: ["cash", "smurfing"] },
      { typology: "tf", features: ["wire", "yemen"] },
    ]);
    const r = classifyNb(model, ["cash"]);
    expect(r.typology).toBeDefined();
    expect(bayesUpdate(0.1, 0.9, 0.1, true)).toBeGreaterThan(0.1);
    // EWMA returns an array shape; smoke-test verifies it doesn't throw.
    expect(ewmaAnomaly([1, 1, 1, 1, 1, 1, 1, 1, 1, 100, 100, 100]).anomalies).toBeDefined();
  });
});
