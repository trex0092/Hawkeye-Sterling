import { describe, it, expect } from "vitest";
import { classifyCybercrime } from "../CybercrimeClassifier.js";

describe("CybercrimeClassifier — BEC", () => {
  it("labels a BEC article", () => {
    const result = classifyCybercrime(
      "A sophisticated business email compromise scheme defrauded the company of $2.1m via payment redirection. The CEO fraud was discovered after funds were wired to a mule account.",
    );
    expect(result.hasAnyLabel).toBe(true);
    expect(result.labels.some(l => l.id === "bec")).toBe(true);
    const bec = result.labels.find(l => l.id === "bec")!;
    expect(bec.confidence).toBeGreaterThanOrEqual(0.4);
    expect(bec.fatfR15Relevant).toBe(false);
  });

  it("does not flag FATF R.15 for BEC", () => {
    const result = classifyCybercrime("Business email compromise caused wire transfer fraud.");
    expect(result.fatfR15Flag).toBe(false);
  });
});

describe("CybercrimeClassifier — ransomware", () => {
  it("labels a ransomware article and flags R.15", () => {
    const result = classifyCybercrime(
      "LockBit ransomware operators demanded a bitcoin ransom payment of 50 BTC after deploying double extortion tactics against the hospital network.",
    );
    expect(result.labels.some(l => l.id === "ransomware_payment")).toBe(true);
    expect(result.fatfR15Flag).toBe(true);
  });
});

describe("CybercrimeClassifier — crypto fraud", () => {
  it("labels a rug pull as crypto_fraud", () => {
    const result = classifyCybercrime(
      "The DeFi project's founders executed a rug pull and exit scam, draining $8m in crypto fraud. Investigators identified a pump and dump crypto scheme in virtual asset fraud.",
    );
    expect(result.labels.some(l => l.id === "crypto_fraud")).toBe(true);
    expect(result.fatfR15Flag).toBe(true);
  });
});

describe("CybercrimeClassifier — state-sponsored", () => {
  it("labels Lazarus Group activity as state_cyber_theft", () => {
    const result = classifyCybercrime(
      "OFAC sanctioned Lazarus Group, the North Korea-linked APT responsible for the $620m crypto exchange hack, using an advanced persistent threat toolkit.",
    );
    expect(result.labels.some(l => l.id === "state_cyber_theft")).toBe(true);
    expect(result.fatfR15Flag).toBe(true);
  });
});

describe("CybercrimeClassifier — social engineering", () => {
  it("labels SIM-swap as social_engineering", () => {
    const result = classifyCybercrime(
      "The suspect carried out a SIM swap and vishing campaign, combining smishing with OTP fraud to enable account takeover via social engineering.",
    );
    expect(result.labels.some(l => l.id === "social_engineering")).toBe(true);
  });
});

describe("CybercrimeClassifier — phishing wire fraud", () => {
  it("labels SWIFT phishing as phishing_wire_fraud", () => {
    const result = classifyCybercrime(
      "Attackers used spear phishing and credential theft to enable wire fraud. SWIFT fraud was committed via credential stuffing and online banking fraud techniques.",
    );
    expect(result.labels.some(l => l.id === "phishing_wire_fraud")).toBe(true);
  });
});

describe("CybercrimeClassifier — clean text", () => {
  it("returns no labels for AML-only text with no cyber angle", () => {
    const result = classifyCybercrime(
      "The defendant was convicted of money laundering through shell companies in the British Virgin Islands.",
    );
    // No cyber-specific labels expected
    const cyberLabels = ["bec", "ransomware_payment", "crypto_fraud", "state_cyber_theft", "phishing_wire_fraud"];
    expect(result.labels.filter(l => cyberLabels.includes(l.id))).toHaveLength(0);
    expect(result.fatfR15Flag).toBe(false);
  });

  it("returns no labels for empty text", () => {
    const result = classifyCybercrime("");
    expect(result.hasAnyLabel).toBe(false);
    expect(result.labels).toHaveLength(0);
  });
});

describe("CybercrimeClassifier — multi-label", () => {
  it("can apply multiple labels to a complex article", () => {
    const result = classifyCybercrime(
      "The Lazarus Group APT, a North Korea hack-linked advanced persistent threat, deployed LockBit ransomware with a bitcoin ransom payment while simultaneously running a BEC campaign with CEO fraud wire transfer fraud.",
    );
    expect(result.labels.length).toBeGreaterThanOrEqual(2);
    expect(result.labels.some(l => l.id === "state_cyber_theft")).toBe(true);
    expect(result.labels.some(l => l.id === "ransomware_payment")).toBe(true);
  });
});

describe("CybercrimeClassifier — confidence", () => {
  it("returns confidence between 0 and 1", () => {
    const result = classifyCybercrime(
      "Business email compromise, BEC fraud, CEO fraud, payment redirection, wire transfer fraud.",
    );
    for (const label of result.labels) {
      expect(label.confidence).toBeGreaterThanOrEqual(0);
      expect(label.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("reports matched keywords", () => {
    const result = classifyCybercrime("LockBit ransomware with ransom payment demanded.");
    const rw = result.labels.find(l => l.id === "ransomware_payment");
    expect(rw?.keywords.length).toBeGreaterThan(0);
  });
});
