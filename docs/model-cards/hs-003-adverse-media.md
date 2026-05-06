# Model Card — HS-003 Adverse Media Detector

| Field | Value |
|---|---|
| **System ID** | HS-003 |
| **Version** | v2.3.1 |
| **Status** | Production |
| **Classification** | AML/CFT Decision-Support — Media Intelligence |
| **Owner** | Data Science (primary) / MLRO (accountability) |
| **Last Updated** | 2026-05-06 |
| **Next Review** | 2026-11-06 |
| **Regulatory Framework** | UAE FDL 20/2018 (as amended by FDL 10/2025); Cabinet Decision 10/2019; FATF R.10, R.12; FATF Guidance on Beneficial Ownership |

---

## 1. System Description

HS-003 is the adverse-media detection and classification subsystem of Hawkeye Sterling. It constructs structured boolean search queries from a five-category keyword taxonomy, executes those queries against a multi-source news and intelligence feed constellation, retrieves candidate articles, applies category classification and relevance scoring, and returns a structured adverse-media finding set to HS-001.

The system is not a trained neural classifier. Category assignment is deterministic, based on keyword-set membership and boolean logic. Relevance scoring applies source-tier weighting and entity-name proximity to the matched keyword.

---

## 2. Five-Category Adverse-Media Taxonomy

### 2.1 Category 1 — Money Laundering and Financial Crime (ML/FC)

**Category ID**: `ml_financial_crime`

Covers: money laundering (all three stages), financial crime, fraud, embezzlement, extortion, identity theft, market manipulation, accounting fraud, asset misappropriation, tax evasion and fraud, VAT fraud, cyber fraud, wire fraud, structuring and smurfing, trade-based laundering, shell and front companies, invoice fraud, carousel and missing-trader fraud, BEC / business email compromise, APP fraud, synthetic identity, money-mule operations, wash trading, layering, placement, integration, phoenix company schemes.

**Keyword count**: 47 English keywords plus multilingual packs (Arabic, Farsi, French, Spanish, Russian, Mandarin — approximately 80 additional terms).

### 2.2 Category 2 — Terrorist Financing (TF)

**Category ID**: `terrorist_financing`

Covers: terrorism and terrorist financing, extremism and radicalisation, foreign terrorist organisations (FTOs), designated group affiliations (ISIS/ISIL/Daesh, Al-Qaeda, Hezbollah, Hamas, Al-Shabaab, Boko Haram, Taliban, IRGC), lone-wolf activity, foreign fighters, recruitment and indoctrination.

**Keyword count**: 24 English keywords plus multilingual packs.

### 2.3 Category 3 — Proliferation Financing (PF)

**Category ID**: `proliferation_financing`

Covers: weapons of mass destruction, dual-use goods, sanctions evasion for proliferation purposes, arms trafficking and weapons smuggling, nuclear and missile programmes (uranium, enrichment, plutonium, fissile material, ballistic, centrifuge), chemical and biological weapons (VX, sarin, precursor chemicals), chip / semiconductor export controls and diversion, DPRK and Iran sanctions evasion.

**Keyword count**: 29 English keywords plus multilingual packs.

### 2.4 Category 4 — Corruption, Bribery, and Organised Crime (Corruption/OC)

**Category ID**: `corruption_organised_crime`

Covers: corruption and bribery in all forms, abuse of power, kleptocracy and state capture, organised crime groups (mafia, triad, yakuza, bratva, cartels, crime families), drug trafficking and narcotics, human trafficking and people smuggling, forced labour and modern slavery, wildlife and ivory trafficking, cybercrime and ransomware, darknet markets and crypto mixers, illegal gambling, racketeering and extortion, facilitation payments, cronyism and nepotism, sex trafficking and CSAM.

**Keyword count**: 52 English keywords plus multilingual packs.

### 2.5 Category 5 — Legal, Criminal, and Regulatory Proceedings (Legal/Regulatory)

**Category ID**: `legal_criminal_regulatory`

Covers: arrests, convictions, court cases, regulatory enforcement actions, debarment and blacklisting, indictments and plea deals, consent orders, deferred prosecution agreements, non-prosecution agreements, license revocations, FATF grey/black list designations, OFAC designations, SDN listings, asset freezes and travel bans, civil and administrative penalties, class actions, whistleblower proceedings.

**Keyword count**: 43 English keywords plus multilingual packs.

---

## 3. Multilingual Coverage

HS-003 maintains keyword packs for the following languages:

| Language | ISO Code | Approximate Additional Terms |
|---|---|---|
| Arabic | `ar` | 16 |
| Farsi / Persian | `fa` | 8 |
| French | `fr` | 17 |
| Spanish | `es` | 15 |
| Russian | `ru` | 13 |
| Mandarin Chinese | `zh` | 12 |

Combined English + multilingual coverage: approximately **180+ unique keywords** across all six languages and five categories. The multilingual module (`adverse-media-i18n.ts`) applies language detection and applies the corresponding keyword pack before query construction.

---

## 4. Boolean Query Construction

For each category, HS-003 compiles a boolean OR query of the form:

```
("keyword_1" OR "keyword_2" OR ... OR "keyword_N") AND ("{subject_name}" OR "{alias_1}" OR ...)
```

Phrase-level matching is used for multi-word keywords. Subject-name variants (aliases, transliterations, script variants) from HS-001 are injected into the entity filter. The query is constructed at runtime and is fully auditable in the verdict envelope.

---

## 5. Data Sources and Refresh Schedule

| Source | Type | Refresh Cadence | Coverage |
|---|---|---|---|
| **NewsAPI** | REST JSON — English/multilingual news | 30-minute rolling | Global: 150,000+ sources |
| **GDELT** | Event stream — global media | 30-minute rolling | Global: 100+ languages |
| **Google CSE** (Custom Search Engine) | Search API — targeted domains | On-demand per screening | Configurable domain list |
| **RSS feeds** (curated) | Regulator and watchdog publications | 30-minute rolling | ~200 curated sources |

Total effective refresh cycle: **30 minutes**. A `STALE_MEDIA` gap flag is raised if any primary source (NewsAPI, GDELT) has not returned results within 60 minutes.

---

## 6. Source Tier Weighting

Not all sources carry equal evidential weight. HS-003 applies a three-tier source-reliability model aligned with the NATO admiralty grading system (adapted for media intelligence):

| Tier | Examples | Weight Multiplier |
|---|---|---|
| **Tier 1 — Authoritative** | Regulator press releases, court documents, official gazette publications | 1.0 |
| **Tier 2 — Established** | Major international and regional news outlets with editorial standards | 0.75 |
| **Tier 3 — Unverified** | Blogs, social media, unverified RSS, single-source reports | 0.40 |

Source-tier weighting is factored into the relevance score but does not alter the keyword-match determination. All Tier 3 findings are flagged with a `LOW_SOURCE_RELIABILITY` tag and require additional corroboration before MLRO escalation.

---

## 7. Performance Metrics

| Metric | Value | Target |
|---|---|---|
| **Category classification accuracy** | 96.8% | ≥95% |
| **False positive rate (entity-level)** | ~3.2% | ≤4.0% |
| **False negative rate** | ~1.1% | ≤2.0% |
| **Recall (sensitivity)** | 98.9% | ≥98% |
| **Median query execution time** | 1.4 s | ≤3 s |
| **p99 query execution time** | 4.7 s | ≤10 s |

False positive rate is measured at the entity level (an entity for which at least one irrelevant article is returned and miscategorised). The most common FP driver is common-name collision — a subject shares a name with an unrelated party mentioned in adverse coverage.

---

## 8. Disaggregated Fairness Evaluation

### 8.1 By Entity Type

| Entity Type | FP Rate | Notes |
|---|---|---|
| Individual (rare name) | 1.8% | Low FP — strong name discrimination |
| Individual (common name) | 6.1% | High FP — name collision; mitigated by entity filter |
| Legal Entity | 2.4% | Company name collisions less frequent |
| Vessel | 1.2% | Vessel names rarely collide |

### 8.2 By Jurisdiction

| Jurisdiction Group | FP Rate | Coverage Gap Risk |
|---|---|---|
| UAE / GCC | 3.0% | Moderate — Arabic-language outlet coverage improving |
| EU / UK | 2.1% | Low — high-quality English-language media |
| MENA (ex-GCC) | 4.8% | Elevated — local-language outlet underrepresentation |
| East / Southeast Asia | 5.2% | Elevated — CJK coverage limited to major outlets |
| Rest of World | 3.9% | Mixed |

### 8.3 Fairness Considerations

- **Language bias**: The keyword taxonomy is most complete in English. Non-English news coverage may miss or delay adverse-media signals for subjects primarily covered in local languages. The multilingual packs partially mitigate this but do not achieve parity.
- **Source availability bias**: Subjects from jurisdictions with limited English-language or digitally indexed media may receive systematically lower adverse-media coverage than the true signal warrants. This creates a systematic data-availability disadvantage, not a capability gap.
- **Paywall coverage gap**: A significant proportion of premium news content is behind paywalls and is not accessible to the system. Coverage gaps from paywalled sources are not currently flagged individually but contribute to the general `COVERAGE_INCOMPLETE` gap indicator.

---

## 9. Known Limitations and Coverage Gaps

1. **Local-language outlet underrepresentation**: Coverage of regional and local media in languages other than the six supported packs is absent. MLRO should supplement automated media screening with local-language checks for high-risk subjects.
2. **Paywalled content**: Major premium outlets (Financial Times, Wall Street Journal, Bloomberg, The Times, etc.) are not fully accessible. Subscription-based access for key outlets is on the data-infrastructure roadmap.
3. **Duplicate article detection**: The same adverse event reported by multiple outlets may generate multiple findings for the same event. The duplicate-detection module applies URL normalisation and title-similarity scoring but does not achieve 100% deduplication. MLRO review should consolidate duplicates.
4. **Historical coverage**: Adverse events predating the NewsAPI/GDELT historical window (varies by source: 1–5 years) may not be retrieved. MLRO should consult Dow Jones Factiva or LexisNexis for deep historical checks on high-risk subjects.
5. **Real-time vs. indexed delay**: Breaking news may take 15–90 minutes to index in searchable form. The 30-minute refresh cycle does not guarantee same-cycle coverage of very recent events.
6. **Entity disambiguation in articles**: Articles mentioning a subject may also name unrelated individuals with similar names. The entity-proximity scorer uses a ±150-word window around the keyword match; false-positives remain possible in long articles with multiple named subjects.

---

## 10. Mitigation Strategies for Known Bias

| Bias / Gap | Current Mitigation | Planned Enhancement |
|---|---|---|
| Common-name FP | Entity filter injects aliases + jurisdiction | Proper-noun disambiguation model (Q3 2026) |
| Local-language gap | 6-language multilingual packs | Expand to Portuguese, Turkish, Indonesian (Q4 2026) |
| Paywall gap | Curated RSS from major outlets | Subscription API integration (Q4 2026) |
| Duplicate detection | URL normalisation + title similarity | Semantic deduplication via embedding similarity (Q3 2026) |
| Source reliability | Tier-weighted scoring | Machine-learned source-credibility score (Q1 2027) |

---

## 11. Regulatory References

| Regulation | Relevance |
|---|---|
| UAE FDL 20/2018 (as amended by FDL 10/2025) | Adverse media as CDD component |
| Cabinet Decision 10/2019 | EDD triggers including adverse media |
| FATF Guidance on PEPs (2013, updated 2021) | Adverse media as risk signal for PEPs |
| FATF R.12 | PEP CDD — adverse media screening obligation |
| WOLFSBERG Group — Adverse Media / Negative News Screening Guidance | Industry standard for media screening programme design |

---

## 12. Approvals and Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| **MLRO** | [MLRO Name] | [Signature on file] | 2026-05-06 |
| **Head of Data Science** | [DS Lead Name] | [Signature on file] | 2026-05-06 |

---

*Document ID: MC-HS-003-v2.3.1 | Classification: Internal — Regulatory*
