import { describe, it, expect } from "vitest";
import { HS_DEFAULTS } from "../hs-defaults";

// Guardrail: HS_DEFAULTS may carry low-privilege operational defaults and
// free-tier news/market-data API keys ONLY. Inlining a privileged secret
// (session / JWT / audit-chain / admin / signing / etc.) into source — even as
// a "default" — would leak it into git history and the client-reachable bundle.
//
// This test fails CI the moment a privileged-looking key name appears in
// HS_DEFAULTS, forcing such secrets to come from environment variables.
//
// See web/lib/config/hs-defaults.ts header for the accepted-risk rationale.

describe("hs-defaults privileged-secret guardrail", () => {
  // Substrings that mark a key name as privileged. Matched case-insensitively
  // against each HS_DEFAULTS key. Deliberately excludes "API_KEY" because the
  // accepted-risk set is exactly the free-tier *_API_KEY news/market vars.
  const PRIVILEGED_PATTERNS = [
    "SESSION",
    "JWT",
    "AUDIT_CHAIN",
    "ADMIN",
    "ED25519",
    "PRIVATE_KEY",
    "SIGNING",
    "HMAC",
    "PASSWORD",
    "SECRET",
    "_TOKEN",
    "ANTHROPIC",
    "GROQ_API",
    "MOONDB",
    "WEBHOOK",
    "MCP_API",
  ];

  // Explicit allowlist of the low-privilege inline values that are an accepted
  // deviation. Adding a NEW inline value requires updating this list — a
  // conscious decision, not a silent slip.
  const ALLOWED_INLINE_KEYS = new Set([
    "GOAML_MLRO_FULL_NAME",
    "GOAML_MLRO_EMAIL",
    "GOAML_MLRO_PHONE",
    "EOCN_FEED_URL",
    "COMTRADE_BASE_URL",
    "MARBLE_API_URL",
    "GROQ_PREFERRED",
    "PLAYWRIGHT_MEDIA_ENABLED",
    "OPENSANCTIONS_DATASETS",
    "ALPHAVANTAGE_API_KEY",
    "CURRENTS_API_KEY",
    "GNEWS_API_KEY",
    "MARKETAUX_API_KEY",
    "MEDIACLOUD_API_KEY",
    "MEDIASTACK_API_KEY",
    "NEWSAPI_API_KEY",
    "NEWSCATCHER_API_KEY",
    "NEWSDATA_API_KEY",
    "NYT_API_KEY",
    "OSINT_NEWSAPI_KEY",
    "TIINGO_API_KEY",
    "WORLDNEWS_API_KEY",
    // Non-secret deployment config (empty by default; inlined per deployment).
    "HAWKEYE_ENTITIES",
    "UPSTASH_REDIS_REST_URL",
    "GMAIL_CLIENT_ID",
  ]);

  const keys = Object.keys(HS_DEFAULTS);

  it("contains no privileged-secret key names", () => {
    const offenders = keys.filter((k) => {
      const upper = k.toUpperCase();
      return PRIVILEGED_PATTERNS.some((p) => upper.includes(p));
    });
    expect(
      offenders,
      `Privileged secret(s) inlined in hs-defaults.ts: ${offenders.join(", ")}. ` +
        `Privileged secrets must come from environment variables only.`,
    ).toEqual([]);
  });

  it("only inlines values from the reviewed accepted-risk allowlist", () => {
    const unexpected = keys.filter((k) => !ALLOWED_INLINE_KEYS.has(k));
    expect(
      unexpected,
      `New inline default(s) not on the reviewed allowlist: ${unexpected.join(", ")}. ` +
        `If intentional and low-privilege, add to ALLOWED_INLINE_KEYS and SECURITY-NOTES.md.`,
    ).toEqual([]);
  });
});
