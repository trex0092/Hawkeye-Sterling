// Hawkeye Sterling — operational defaults + low-privilege fallback keys.
//
// Values are sourced from the operator's configuration. Any of these can be
// overridden at deploy time by setting the corresponding environment variable
// in Netlify (env always wins — consumers read process.env first).
//
// ACCEPTED-RISK DECISION (operator-approved): the *News / market-data API keys*
// below are inlined here ON PURPOSE. They are free-tier, read-only, and carry
// no auth / audit / financial / data-access privilege — worst-case abuse is
// third-party news-API quota exhaustion. They are inlined to stay within the
// AWS Lambda 4 KB total environment-variable limit (see the commit that
// introduced them: "inline HAWKEYE_SECRETS values as code defaults to unblock
// Lambda 4KB limit"). Documented as an accepted deviation in SECURITY-NOTES.md;
// rotate periodically since they are present in git history.
//
// HARD RULE — enforced by web/lib/config/__tests__/hs-defaults.test.ts:
// NEVER inline a privileged secret here (session / JWT / audit-chain / admin /
// Ed25519 / signing / HMAC / webhook / password / Anthropic / Groq / MoonDB,
// etc). Privileged secrets MUST come from environment variables only. The
// guardrail test fails CI if a privileged-looking key name is added here.
export const HS_DEFAULTS = {
  GOAML_MLRO_FULL_NAME:  "HAWKEYE STERLING - MLRO",
  GOAML_MLRO_EMAIL:      "hawkeye.sterling.v2@gmail.com",
  GOAML_MLRO_PHONE:      "+971582687507",
  EOCN_FEED_URL:         "https://www.uaeiec.gov.ae/en-us/un-page",
  COMTRADE_BASE_URL:     "https://comtradeapi.un.org/public/v1/preview",
  MARBLE_API_URL:        "https://api.marble.co",
  GROQ_PREFERRED:        "1",
  PLAYWRIGHT_MEDIA_ENABLED: "1",
  OPENSANCTIONS_DATASETS:
    "ae_local_terrorists,un_sc_sanctions,us_ofac_sdn,eu_fsf," +
    "gb_hmt_sanctions,ca_dfatd_sema_sanctions,au_dfat_sanctions,ch_seco_sanctions",
  // News / market-data API keys (free-tier, non-privileged)
  ALPHAVANTAGE_API_KEY:  "0RV40USO9ZZE8KEA",
  CURRENTS_API_KEY:      "T2Wm46Qma-r7mAb3Yx8A-uDOA4mtN88SoQXoIuSSW0IFpKnB",
  GNEWS_API_KEY:         "a0cb3ae8398375fbe31d2fd2e26f9bf1",
  MARKETAUX_API_KEY:     "9GNwbkJaOTQUaO0R5hvBrwL1PdZd8RhZRtJMDoZM",
  MEDIACLOUD_API_KEY:    "9472bbc86757c21c025996e52857ae0e88e5502d",
  MEDIASTACK_API_KEY:    "8d6d75bfa66e43854e4f124dd3c9f669",
  NEWSAPI_API_KEY:       "ea607b9e29e44c7f8173dc0375ab72aa",
  NEWSCATCHER_API_KEY:   "I5ZwHnSqIQW4YP5TjsDi0JiWNJVdRoDd7skjntjWf2k",
  NEWSDATA_API_KEY:      "pub_db578e37088449c894c6c711655e394d",
  NYT_API_KEY:           "1oW0ABTkkpU14TTBsG5ZOqRQqTQPrZjw1RZrOXy470HOWRHg",
  OSINT_NEWSAPI_KEY:     "ea607b9e29e44c7f8173dc0375ab72aa",
  TIINGO_API_KEY:        "58033ca6ac27436a62c56bc789fe5d744143eeef",
  WORLDNEWS_API_KEY:     "8ee7710a2597468ebe94d1e1d10172c3",

  // ── Non-secret deployment config ────────────────────────────────────────
  // Inline these to drop the matching variable from Netlify's *runtime* scope
  // and stay under the AWS Lambda 4 KB env-var limit (see
  // docs/ENV_4KB_OPTIMIZATION.md §3b). They are NOT secrets.
  //
  // EMPTY string == "sourced from the environment variable" (current behavior,
  // nothing changes). To inline: paste the value between the quotes, then
  // delete the variable from Netlify. The environment variable ALWAYS wins
  // when set, so inlining can never override a live deployment by surprise.
  HAWKEYE_ENTITIES:        "",  // JSON array of reporting entities, single line
  UPSTASH_REDIS_REST_URL:  "",  // e.g. https://<id>.upstash.io — the *_TOKEN stays in env
  GMAIL_CLIENT_ID:         "",  // Google OAuth 2.0 client ID — public by design
} as const;
