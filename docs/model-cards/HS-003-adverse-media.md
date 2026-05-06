# Model Card: Adverse Media Detector
## HS-003 — Version 2.3.1

**Document ID:** HS-MC-003
**Status:** Production
**Last Updated:** 2026-05-06

---

## 1. System Identification

| Field | Value |
|---|---|
| System ID | HS-003 |
| System Name | Adverse Media Detector |
| Version | 2.3.1 |
| Primary Source | `src/brain/adverse-media.ts`, `netlify/functions/adverse-media-rss.mts` |
| Primary Endpoint | `GET /api/news-search` |

---

## 2. Purpose

Searches multiple real-time news and media sources for adverse information about a named subject. Returns structured, source-cited findings classified across a five-category risk taxonomy. All results are presented to the MLRO as indicators, never as legal findings, in compliance with prohibition P5 (`src/policy/systemPrompt.ts`).

---

## 3. Five-Category Risk Taxonomy

| Category | Description | Example Keywords |
|---|---|---|
| 1. Money Laundering & Financial Crime | ML, fraud, asset concealment, financial crime | money laundering, fraud, embezzlement, shell company, suspicious transaction |
| 2. Terrorist Financing | TF indicators, NPO misuse, designated party financing | terrorist financing, terrorist group, ISIL, Al-Qaeda, designated terrorist |
| 3. Proliferation Financing | WMD finance, dual-use goods, UNSC 1540 | proliferation, weapons of mass destruction, nuclear, chemical weapons, dual-use |
| 4. Corruption, Bribery & Organised Crime | PEP exposure, bribery, OC networks | corruption, bribery, organised crime, cartel, kickback, money mule |
| 5. Legal, Criminal & Regulatory Proceedings | Court cases, enforcement actions, regulatory sanctions | arrested, convicted, indicted, regulatory action, FCA, SEC, FinCEN |

**Total taxonomy:** 180+ keywords compiled into a single boolean OR query exposed as `ADVERSE_MEDIA_QUERY` in `src/brain/adverse-media.ts`.

---

## 4. Data Sources

| Source | Coverage | Refresh | Required Env Var | Known Limitation |
|---|---|---|---|---|
| NewsAPI | 120+ global outlets | Every 30 min | `NEWSAPI_KEY` | Paywalled content excluded |
| GDELT | Global event database | Every 30 min | `GDELT_API_KEY` | Event-level, not article-level |
| Google Custom Search | Regulatory + official sources | On demand | `GOOGLE_CSE_ID` + `GOOGLE_CSE_KEY` | Rate-limited |
| Direct RSS | Regional + sector feeds | Every 30 min | None (configured in function) | Local-language gaps |

**Fallback:** If all API keys are absent, system uses Google News RSS (free, multi-locale). Disclosed in SCOPE_DECLARATION.

---

## 5. Known Limitations

| Limitation | Description | Mitigation |
|---|---|---|
| False positive rate | ~3.2% (non-AML news tagged as AML-relevant) | All results presented as indicators; MLRO adjudicates |
| Paywalled content | Premium articles not indexed | Noted in scope declaration |
| Local-language coverage | Arabic, Chinese, Russian, etc. underrepresented | Planned integration (Phase 3); disclosed gap |
| Publication latency | 4–48 hours from event to indexed article | Disclosed; daily monitoring catches delayed articles |
| Source credibility variance | Not all indexed sources are equally credible | Source credibility check (Alexa ranking), duplicate detection (content hash) |

---

## 6. Compliance Charter Enforcement

- P2: No fabricated citations — every adverse media finding must trace to a source article present in the input
- P5: No allegation-to-finding upgrade — "arrested" never becomes "convicted" without evidence
- P7: Scope must always be declared — if NewsAPI key is absent, SCOPE_DECLARATION must state this

---

## Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| Data Science Lead | | | |
| MLRO | | | |
