// Smoke test for web/lib/reports/complianceReport.ts. Run with:
//   cd web && npx tsx scripts/test-compliance-report.mts
//
// Guards against regressions of the bugs PR #193 fixed:
//   - composite (not topScore) drives the headline
//   - "CLEAR" only appears next to the sanctions vector
//   - adverse-media findings emit when positive
//   - PEP role-match evidence emits when positive
//   - sanctions hits detail emits when positive
//   - dual SHA-256 hashes are present and deterministic
//   - HMAC signature only emits when REPORT_SIGNING_KEY is set

import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  createPublicKey,
  verify as nodeVerify,
} from "node:crypto";
import {
  buildComplianceReport,
  buildComplianceReportStructured,
  type ReportInput,
} from "../lib/reports/complianceReport";

let failed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${(err as Error).message}`);
  }
}

const baseSubject = {
  id: "HS-TEST",
  name: "test subject",
  entityType: "individual" as const,
  jurisdiction: "TR",
};

const nowFixed = new Date("2026-04-28T16:42:01Z");

// Fixture 1 — CLEAR: composite > topScore (the original screenshot bug)
function clearFixture(): ReportInput {
  return {
    subject: baseSubject,
    operator: { role: "analyst" },
    result: { topScore: 0, severity: "clear", hits: [] },
    superBrain: {
      pep: null,
      jurisdiction: { iso2: "TR", name: "Turkey", region: "EMEA", cahra: false, regimes: ["UN-ALQ"] },
      adverseMedia: [],
      adverseKeywordGroups: [],
      composite: { score: 42, breakdown: { sanctions: 0, juris: 28, redlines: 14 } },
      redlines: { fired: [], action: null },
    },
    now: nowFixed,
  };
}

// Fixture 2 — SANCTIONS positive
function sanctionsFixture(): ReportInput {
  return {
    subject: { ...baseSubject, name: "ivan ivanov", jurisdiction: "RU" },
    operator: { role: "mlro", id: "L.FERNANDA" },
    result: {
      topScore: 91,
      severity: "critical",
      hits: [
        { listId: "OFAC-SDN", listRef: "SDN-12345", candidateName: "IVAN IVANOV", score: 0.92, method: "fuzzy-name", programs: ["RUSSIA-EO14024"] },
      ],
    },
    superBrain: {
      pep: null,
      jurisdiction: { iso2: "RU", name: "Russia", region: "EMEA", cahra: true, regimes: ["EU-RUSSIA"] },
      adverseMedia: [],
      adverseKeywordGroups: [],
      composite: { score: 95, breakdown: { sanctions: 91, juris: 80 } },
      redlines: { fired: [{ id: "SAN-OFAC", label: "OFAC SDN match" }], action: "FREEZE — FFR pending" },
    },
    now: nowFixed,
  };
}

// Fixture 3 — PEP positive (Maduro-style)
function pepFixture(): ReportInput {
  return {
    subject: { ...baseSubject, name: "nicolas maduro", jurisdiction: "VE" },
    operator: { role: "mlro" },
    result: { topScore: 0, severity: "clear", hits: [] },
    superBrain: {
      pep: { tier: "tier_1", type: "state_leader", salience: 1.0, rationale: "head of state", matchedRule: "state_leader.tier1" },
      pepAssessment: {
        isLikelyPEP: true,
        highestTier: "tier_1",
        riskScore: 92,
        matchedRoles: [
          { tier: "tier_1", label: "Head of state", snippet: "President of Venezuela since 2013" },
        ],
      },
      jurisdiction: { iso2: "VE", name: "Venezuela", region: "LATAM", cahra: true, regimes: ["OFAC-VENEZUELA"] },
      adverseMedia: [],
      adverseKeywordGroups: [],
      composite: { score: 92 },
      redlines: { fired: [{ id: "PEP-T1" }, { id: "CAHRA" }], action: "EDD + Board approval" },
    },
    now: nowFixed,
  };
}

// Fixture 4 — Adverse media positive
function amFixture(): ReportInput {
  return {
    subject: { ...baseSubject, name: "maria gonzalez", jurisdiction: "VE" },
    operator: { role: "analyst" },
    result: { topScore: 0, severity: "clear", hits: [] },
    superBrain: {
      pep: null,
      jurisdiction: { iso2: "VE", name: "Venezuela", region: "LATAM", cahra: true, regimes: [] },
      adverseMedia: [
        { categoryId: "corruption", keyword: "bribery", offset: 122 },
      ],
      adverseKeywordGroups: [
        { group: "CORR", label: "Corruption / bribery", count: 6 },
      ],
      adverseMediaScored: {
        byCategory: { corruption: 6 },
        total: 6,
        distinctKeywords: 4,
        topKeywords: [{ keyword: "bribery", categoryId: "corruption", count: 4 }],
        categoriesTripped: ["corruption"],
        compositeScore: 65,
      },
      newsDossier: {
        articleCount: 3,
        topSeverity: "high",
        source: "google-news-rss",
        languages: ["en"],
        articles: [
          { title: "Bribery indictment", link: "https://news.example/1", pubDate: "2026-04-21", source: "Reuters", snippet: "Federal indictment...", severity: "high", keywordGroups: ["CORR"] },
        ],
      },
      composite: { score: 78 },
      redlines: { fired: [{ id: "AM-EXT" }], action: "ESCALATE — STR consideration" },
    },
    now: nowFixed,
  };
}

console.log("\n— complianceReport smoke tests —\n");

console.log("[CLEAR fixture]");
const clearTxt = buildComplianceReport(clearFixture());
check("composite (42) is the headline, not topScore (0)", () => {
  assert.match(clearTxt, /COMPOSITE\s+42\/100\s+BAND: MEDIUM/);
});
check("CLEAR appears only next to sanctions vector", () => {
  const sanLine = clearTxt.split("\n").find((l) => l.includes("Sanctions match"));
  assert.ok(sanLine?.includes("CLEAR"), "expected CLEAR on sanctions row");
  // headline disposition must NOT be CLEAR (composite=42 → CDD posture)
  assert.match(clearTxt, /DISPOSITION\s+:\s+CDD posture/);
});
check("dual SHA-256 hashes present", () => {
  assert.match(clearTxt, /payload\.sha256\s+[a-f0-9]{64}/);
  assert.match(clearTxt, /report\.sha256\s+[a-f0-9]{64}/);
});
check("payload hash is deterministic across builds", () => {
  const a = buildComplianceReport(clearFixture());
  const b = buildComplianceReport(clearFixture());
  const hashA = a.match(/payload\.sha256\s+([a-f0-9]{64})/)?.[1];
  const hashB = b.match(/payload\.sha256\s+([a-f0-9]{64})/)?.[1];
  assert.strictEqual(hashA, hashB, "payload hash drift");
});
check("no signature when REPORT_SIGNING_KEY unset", () => {
  delete process.env.REPORT_SIGNING_KEY;
  const t = buildComplianceReport(clearFixture());
  assert.ok(!t.includes("report.signature"), "signature line should be omitted");
});
check("signature present when REPORT_SIGNING_KEY set", () => {
  process.env.REPORT_SIGNING_KEY = "test-key-min-16-chars-please-12345";
  const t = buildComplianceReport(clearFixture());
  assert.match(t, /report\.signature\s+hmac-sha256:[a-f0-9]{64}/);
  assert.match(t, /signing\.key_fp\s+[a-f0-9]{12}/);
  delete process.env.REPORT_SIGNING_KEY;
});

console.log("\n[SANCTIONS fixture]");
const sanTxt = buildComplianceReport(sanctionsFixture());
check("tipping-off banner appears at the top", () => {
  assert.match(sanTxt, /TIPPING-OFF PROHIBITION ABSOLUTE/);
});
check("sanctions hits detail block emits with per-hit fields", () => {
  assert.match(sanTxt, /SANCTIONS HITS\s+—\s+DETAIL/);
  assert.match(sanTxt, /list_id\s+OFAC-SDN/);
  assert.match(sanTxt, /candidate\s+IVAN IVANOV/);
  assert.match(sanTxt, /score\s+0\.920\s+\(92\/100\)/);
});
check("disposition appears on the cover", () => {
  assert.match(sanTxt, /DISPOSITION\s+:\s+FREEZE — FFR pending/);
});

console.log("\n[PEP fixture]");
const pepTxt = buildComplianceReport(pepFixture());
check("PEP CLASSIFICATION & EVIDENCE block emits", () => {
  assert.match(pepTxt, /PEP CLASSIFICATION & EVIDENCE/);
});
check("matchedRoles evidence with snippet emits", () => {
  assert.match(pepTxt, /Matched roles \(evidence\):/);
  assert.match(pepTxt, /\[tier 1\]\s+Head of state/);
  assert.match(pepTxt, /"President of Venezuela since 2013"/);
});
check("source-posture footer cites FATF R.12", () => {
  assert.match(pepTxt, /FATF R\.12/);
});

console.log("\n[ADVERSE MEDIA fixture]");
const amTxt = buildComplianceReport(amFixture());
check("ADVERSE MEDIA — FINDINGS section emits", () => {
  assert.match(amTxt, /ADVERSE MEDIA\s+—\s+FINDINGS/);
});
check("hit volume and vector score render", () => {
  assert.match(amTxt, /Hit volume\s+:\s+6 keyword hit\(s\)/);
  assert.match(amTxt, /Vector score\s+:\s+65\/100/);
});
check("news dossier emits with article evidence", () => {
  assert.match(amTxt, /News dossier\s+:\s+3 article\(s\)/);
  assert.match(amTxt, /Reuters \[HIGH\]/);
  assert.match(amTxt, /Bribery indictment/);
  assert.match(amTxt, /https:\/\/news\.example\/1/);
});
check("AM banner appears at top with tipping-off prohibition", () => {
  assert.match(amTxt, /POSITIVE ADVERSE-MEDIA SIGNAL/);
  assert.match(amTxt, /TIPPING-OFF PROHIBITION ABSOLUTE/);
});

console.log("\n[Ed25519 signing]");
check("no Ed25519 signature when REPORT_ED25519_PRIVATE_KEY unset", () => {
  delete process.env.REPORT_ED25519_PRIVATE_KEY;
  const t = buildComplianceReport(clearFixture());
  assert.ok(!t.includes("report.signature_ed25519"), "ed25519 line should be omitted");
});
check("Ed25519 signature emits + verifies with the matching public key", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  process.env.REPORT_ED25519_PRIVATE_KEY = Buffer.from(privPem).toString("base64");
  const t = buildComplianceReport(clearFixture());
  const sigMatch = t.match(/report\.signature_ed25519\s+([a-f0-9]+)/);
  const reportHashMatch = t.match(/report\.sha256\s+([a-f0-9]{64})/);
  assert.ok(sigMatch, "expected ed25519 signature line");
  assert.ok(reportHashMatch, "expected report.sha256 line");
  const sig = new Uint8Array(Buffer.from(sigMatch![1]!, "hex"));
  const data = new Uint8Array(Buffer.from(reportHashMatch![1]!, "utf8"));
  const ok = nodeVerify(null, data, publicKey, sig);
  assert.ok(ok, "ed25519 signature did not verify against the matching public key");
  // pubkey fingerprint should also surface
  assert.match(t, /signing\.pubkey_fp\s+[a-f0-9]{12}/);
  delete process.env.REPORT_ED25519_PRIVATE_KEY;
});
check("structured report carries ed25519 fields when signing is on", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const privPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  process.env.REPORT_ED25519_PRIVATE_KEY = Buffer.from(privPem).toString("base64");
  const s = buildComplianceReportStructured(clearFixture());
  assert.match(s.hashes.signatureEd25519 ?? "", /^[a-f0-9]+$/);
  assert.match(s.hashes.signingPubkeyFp ?? "", /^[a-f0-9]{12}$/);
  delete process.env.REPORT_ED25519_PRIVATE_KEY;
});
check("invalid Ed25519 key in env is silently ignored (no fake signature)", () => {
  process.env.REPORT_ED25519_PRIVATE_KEY = Buffer.from("not a real key").toString("base64");
  const t = buildComplianceReport(clearFixture());
  assert.ok(!t.includes("report.signature_ed25519"), "should fail-closed on bad key");
  delete process.env.REPORT_ED25519_PRIVATE_KEY;
});

console.log(`\n${failed === 0 ? "PASS" : "FAIL"}: ${failed} failure(s)\n`);
process.exit(failed === 0 ? 0 : 1);
