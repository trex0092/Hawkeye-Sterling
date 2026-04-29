# Code Review: PatrickAttankurugu/AfricaPEP

**Repository:** https://github.com/PatrickAttankurugu/AfricaPEP  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 1

---

## Summary

AfricaPEP is an open-source PEP (Politically Exposed Person) database covering all 54 African countries, implemented as a FastAPI service backed by Neo4j with fuzzy name matching. It addresses a significant gap in commercial AML data vendors — most PEP lists (World-Check, Dow Jones, Acuris) have sparse coverage for Sub-Saharan African officials, local government figures, and state-owned enterprise directors. For Hawkeye Sterling's `src/ingestion/` layer, AfricaPEP is the primary candidate for supplementing commercial PEP lists with Africa-region coverage.

---

## Architecture

```
Data collection (web scraping + manual curation)
  ├── African Union official lists
  ├── National parliament / government portals (54 countries)
  ├── State-owned enterprise registries
  └── Judicial appointment records
  ↓
ETL pipeline (Python / pandas)
  ├── Name normalisation (transliteration, diacritic stripping)
  ├── Entity deduplication (fuzzy blocking + exact match)
  └── Relationship extraction (family, business, political)
  ↓
Neo4j graph store
  ├── PEP nodes (name, country, role, entity_type, active_since, active_until)
  ├── Relationship edges (FAMILY_OF, BUSINESS_ASSOCIATE_OF, POLITICAL_ALLY_OF)
  └── Alias nodes (alternative spellings, transliterations)
  ↓
FastAPI service
  ├── GET /search?name=...&threshold=...  ← fuzzy name search, returns ranked matches
  ├── GET /entity/{id}                   ← full PEP profile with relationships
  ├── GET /network/{id}                  ← 2-hop associate network via Neo4j
  └── GET /export/bulk                   ← full dataset export (JSON / CSV)
```

---

## Key Technical Patterns

**1. Fuzzy Name Matching with Threshold Control**

The `/search` endpoint uses RapidFuzz for Levenshtein/Jaro-Winkler similarity scoring against all PEP name strings (primary name + aliases). Results are returned sorted by similarity score with a configurable threshold (default 0.80). This is the correct approach for African names, where transliteration from Arabic, Amharic, Swahili, or French can produce multiple valid romanisations of the same name.

**2. Neo4j Relationship Graph**

The Neo4j model captures PEP relationships as typed edges (`FAMILY_OF`, `BUSINESS_ASSOCIATE_OF`), enabling 2-hop associate screening — finding companies or individuals who are not themselves PEPs but are closely connected to PEPs. This matters for beneficial ownership screening, where the direct UBO may not be listed but their spouse or business partner is.

**3. Alias Nodes as First-Class Entities**

Each PEP can have multiple alias nodes (e.g., "Moussa Faki" and "Moussa Faki Mahamat" and "موسى فكي"). Alias nodes participate in the fuzzy search index, ensuring that searching for any known variant of a name returns the canonical PEP entity. This is essential for Africa-region name matching.

**4. Bulk Export Endpoint**

The `/export/bulk` endpoint returns the full dataset in JSON or CSV. This allows Hawkeye Sterling to cache a local snapshot of the AfricaPEP data and serve name matches internally — avoiding per-query API latency and rate limits. The snapshot should be refreshed on a weekly schedule.

---

## What Hawkeye Sterling Can Extract

- **Africa PEP data source**: integrate AfricaPEP's bulk export into `src/ingestion/pep-loader.ts` alongside commercial PEP list imports, filling the Sub-Saharan Africa coverage gap
- **Fuzzy name matching with threshold**: the RapidFuzz threshold-controlled scoring is a reference implementation for Hawkeye Sterling's name matching layer — especially for transliterated names
- **Alias node model**: adopt the alias-as-first-class-entity pattern in Hawkeye Sterling's entity graph (Neo4j or Memgraph) to ensure variant spellings are screened
- **2-hop associate query**: the Neo4j 2-hop network query is directly portable to Hawkeye Sterling's PEP proximity detection mode in `src/brain/`
- **Relationship type taxonomy**: `FAMILY_OF`, `BUSINESS_ASSOCIATE_OF`, `POLITICAL_ALLY_OF` is a useful starting taxonomy for Hawkeye Sterling's entity relationship model

---

## Integration Path

**TypeScript REST client.** AfricaPEP exposes a FastAPI REST API with clear JSON response schemas. Hawkeye Sterling's `src/services/pepClient.ts` calls the `/search` and `/network/{id}` endpoints. For production, run a local AfricaPEP instance (Docker + Neo4j) and load the bulk export nightly. Do not call the public API directly in the screening hot path — latency and availability are not guaranteed for a community-hosted service.

---

## Caveats

- **Stars: 1 / data freshness unknown**: the repo is maintained by a single contributor. African government personnel changes rapidly (elections, appointments, removals from office). Understand the data update cadence before relying on AfricaPEP for live PEP determinations.
- **Coverage depth varies by country**: coverage is strong for large economies (Nigeria, Kenya, South Africa, Ethiopia, Egypt) and thinner for smaller states. Spot-check coverage against known PEP lists for the specific Africa markets Hawkeye Sterling targets.
- **No API authentication**: the FastAPI service has no auth layer in the repo. If self-hosting, add API-key middleware before exposing externally.
- **Neo4j licensing**: Neo4j Community Edition is open source but has limitations (no clustering, no advanced analytics). For production Hawkeye Sterling deployments, evaluate Neo4j AuraDB (managed) or migrate the graph to Memgraph, which is Apache 2.0 licensed.
- **Not a substitute for commercial lists**: AfricaPEP supplements, it does not replace, commercial PEP data vendors. Hawkeye Sterling's compliance policy should specify the hierarchy of PEP data sources.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Africa PEP coverage | Good | Strong for major markets, variable for smaller states |
| Fuzzy name matching | Very Good | RapidFuzz with threshold control, alias indexing |
| Graph relationship modelling | Good | 2-hop associate queries, typed relationships |
| Data freshness | Unknown | Single-contributor maintenance, update cadence unclear |
| HS fit | ★★ | Valuable supplementary PEP source for Africa region — not a primary replacement |

---

## Recommendation

**Integrate as a supplementary PEP data source for Africa-region screening.** Ingest the AfricaPEP bulk export weekly into Hawkeye Sterling's PEP data lake alongside commercial PEP list data. Use AfricaPEP's fuzzy name matching logic as the reference implementation for Africa-name transliteration handling in `src/ingestion/`. Audit coverage for the specific African countries in Hawkeye Sterling's customer base before go-live.
