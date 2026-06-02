import { describe, it, expect } from "vitest";
import { extractIOCs, mergeIOCs } from "../IOCExtractor.js";

describe("IOCExtractor — IPv4", () => {
  it("extracts a public IPv4 address", () => {
    const iocs = extractIOCs("C2 server observed at 203.0.113.42 during the intrusion.", "art1");
    expect(iocs.some(i => i.type === "ipv4" && i.value === "203.0.113.42")).toBe(true);
  });

  it("suppresses private / loopback ranges", () => {
    const text = "Internal relay 192.168.1.1 and loopback 127.0.0.1 are not IOCs.";
    const iocs = extractIOCs(text, "art1");
    expect(iocs.filter(i => i.type === "ipv4")).toHaveLength(0);
  });

  it("suppresses 10.x.x.x private range", () => {
    const iocs = extractIOCs("Internal: 10.0.0.5", "art1");
    expect(iocs.filter(i => i.type === "ipv4")).toHaveLength(0);
  });
});

describe("IOCExtractor — crypto addresses", () => {
  it("extracts a legacy BTC address", () => {
    const iocs = extractIOCs(
      "Ransom paid to 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2 on-chain.",
      "art2",
    );
    expect(iocs.some(i => i.type === "btc_address" && i.value.startsWith("1Bv"))).toBe(true);
  });

  it("extracts an ETH address", () => {
    const iocs = extractIOCs(
      "Stolen funds sent to 0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe.",
      "art3",
    );
    expect(iocs.some(i => i.type === "eth_address")).toBe(true);
  });
});

describe("IOCExtractor — file hashes", () => {
  it("extracts SHA-256 hash", () => {
    const hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const iocs = extractIOCs(`Malware hash: ${hash}`, "art4");
    expect(iocs.some(i => i.type === "sha256" && i.value === hash)).toBe(true);
  });

  it("extracts MD5 hash", () => {
    const hash = "d41d8cd98f00b204e9800998ecf8427e";
    const iocs = extractIOCs(`File MD5: ${hash}`, "art5");
    expect(iocs.some(i => i.type === "md5" && i.value === hash)).toBe(true);
  });

  it("does not confuse SHA-256 (64 chars) with MD5 (32 chars)", () => {
    const sha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const iocs = extractIOCs(sha, "art6");
    expect(iocs.every(i => i.type !== "md5")).toBe(true);
    expect(iocs.some(i => i.type === "sha256")).toBe(true);
  });
});

describe("IOCExtractor — SWIFT BIC", () => {
  it("extracts a valid 8-char SWIFT BIC", () => {
    const iocs = extractIOCs(
      "Wire routed through DEUTDEDB — Deutsche Bank Frankfurt.",
      "art7",
    );
    expect(iocs.some(i => i.type === "swift_bic" && i.value === "DEUTDEDB")).toBe(true);
  });

  it("suppresses BICs shorter than 8 characters", () => {
    const iocs = extractIOCs("Code ABC is not a BIC.", "art8");
    expect(iocs.filter(i => i.type === "swift_bic")).toHaveLength(0);
  });
});

describe("IOCExtractor — domains", () => {
  it("extracts a .onion domain", () => {
    const iocs = extractIOCs("Data dump at darkmarket.onion for sale.", "art9");
    expect(iocs.some(i => i.type === "domain" && i.value.endsWith(".onion"))).toBe(true);
  });

  it("extracts a .com domain", () => {
    const iocs = extractIOCs("Phishing site: evil-bank-login.com", "art10");
    expect(iocs.some(i => i.type === "domain")).toBe(true);
  });
});

describe("IOCExtractor — source article tagging", () => {
  it("tags each IOC with the given article ID", () => {
    const iocs = extractIOCs("Server 203.0.113.99 used in attack.", "article-xyz");
    expect(iocs[0]!.sourceArticleIds).toContain("article-xyz");
  });
});

describe("IOCExtractor — deduplication", () => {
  it("deduplicates repeated values within one article", () => {
    const text = "IP 203.0.113.1 and again 203.0.113.1 flagged twice.";
    const iocs = extractIOCs(text, "artA");
    expect(iocs.filter(i => i.value === "203.0.113.1")).toHaveLength(1);
  });
});

describe("mergeIOCs", () => {
  it("merges and deduplicates across articles, accumulating sourceArticleIds", () => {
    const listA = extractIOCs("C2 at 203.0.113.5", "artA");
    const listB = extractIOCs("Same C2 at 203.0.113.5 again", "artB");
    const merged = mergeIOCs([listA, listB]);
    const ip = merged.find(i => i.value === "203.0.113.5");
    expect(ip?.sourceArticleIds).toContain("artA");
    expect(ip?.sourceArticleIds).toContain("artB");
    expect(merged.filter(i => i.value === "203.0.113.5")).toHaveLength(1);
  });
});

describe("IOCExtractor — empty / edge cases", () => {
  it("returns empty array for empty text", () => {
    expect(extractIOCs("", "artZ")).toHaveLength(0);
  });

  it("returns empty array for plain prose with no IOCs", () => {
    const iocs = extractIOCs(
      "The defendant was charged with bribery in Dubai District Court.",
      "artZ",
    );
    expect(iocs.filter(i => ["ipv4", "eth_address", "btc_address", "sha256", "md5"].includes(i.type))).toHaveLength(0);
  });
});
