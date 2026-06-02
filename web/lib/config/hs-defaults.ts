// Hawkeye Sterling — non-secret operational defaults.
// Values are sourced from the operator's configuration and safe to ship in
// the codebase. Any of these can be overridden at deploy time by setting the
// corresponding environment variable in Netlify.
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
} as const;
