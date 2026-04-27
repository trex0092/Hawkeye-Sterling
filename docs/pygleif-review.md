# Code Review: ggravlingen/pygleif

**Repository:** https://github.com/ggravlingen/pygleif  
**Stars:** 21 | **Releases:** 18 | **Commits:** 493  
**Version:** 2025.7.1  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

PyGleif is a Python wrapper for the GLEIF (Global Legal Entity Identifier Foundation) REST API. It retrieves Legal Entity Identifier (LEI) records for registered legal entities — returning the entity's legal name, jurisdiction, registration status, parent LEI, and relationship data. It uses Pydantic for strict response validation.

For Hawkeye Sterling, pygleif is the **corporate beneficial ownership chain resolver**: given a company name or LEI code, it traverses the GLEIF relationship graph (direct parent → ultimate parent) to build the full legal ownership chain. This is essential for UBO (Ultimate Beneficial Owner) screening and shell company detection.

**License:** MIT — fully permissive.

---

## What the Tool Does

GLEIF is the global registry of LEIs — unique identifiers for legal entities that participate in financial transactions. Every LEI record includes:

- **Entity data:** Legal name, registered address, jurisdiction, legal form, registration status
- **Relationship data:** Direct parent LEI, ultimate parent LEI (if reported)
- **Registration metadata:** Issuing LOU, initial registration date, last update, renewal date, validation status

PyGleif exposes two interfaces:

```python
from pygleif import PyGleif, Search

# Look up a specific LEI
record = PyGleif("549300MLUDYVRQOOXS22")
name = record.response.data.attributes.entity.legal_name.name
jurisdiction = record.response.data.attributes.entity.jurisdiction

# Search by organisation registration number
results = Search("5560142720")
lei = results.data[0].attributes.lei
```

---

## Strengths

### 1. Pydantic-Validated Responses

All API responses are parsed through Pydantic models, not raw dicts. This means type errors (field renames, missing fields in GLEIF API updates) surface immediately as validation errors rather than silently producing `None` or `KeyError` at runtime. For a data pipeline feeding compliance decisions, fail-fast validation is the correct design.

### 2. Actively Maintained With Calendar Versioning

18 releases, 493 commits, and version `2025.7.1` indicate genuine ongoing maintenance. Calendar versioning (YYYY.M.patch) makes it clear when the library was last updated relative to GLEIF API changes.

### 3. MIT License — Zero Friction Integration

No copyleft concerns. Can be imported directly into Hawkeye Sterling's Python services without any disclosure obligation.

### 4. Direct Path to UBO Chain Traversal

The GLEIF relationship API exposes direct parent → ultimate parent links. By traversing the `relationships.direct_parent.data` and `relationships.ultimate_parent.data` fields iteratively, a full ownership chain can be resolved without any external data source beyond GLEIF's public API.

---

## Issues and Concerns

### 1. Only Two Exposed Functions — No Relationship Traversal

**Severity: Medium**

The current library provides `PyGleif(lei)` (single record lookup) and `Search(org_number)` (search by org number). It does not expose:
- Relationship traversal (direct/ultimate parent chain)
- Reverse lookup (find all subsidiaries of a given parent LEI)
- Bulk batch queries
- Fund/branch entity type queries

For full UBO chain resolution, Hawkeye Sterling will need to implement traversal logic on top of the library using iterative `PyGleif()` calls.

**Recommendation:** Write `src/services/gleif_chain_resolver.py` that iterates parent relationships up to the ultimate parent, with a depth limit (10 hops) and cycle detection. Each step calls `PyGleif(parent_lei)`.

### 2. GLEIF API Rate Limits

**Severity: Low–Medium**

The GLEIF public API has rate limits (undocumented, but typically ~60 req/min for the free tier). For a screening system that may need to resolve ownership chains for hundreds of counterparties, iterative per-LEI calls will hit rate limits during bulk screening runs.

**Recommendation:** Cache GLEIF records in Redis with a 24-hour TTL (LEI records change infrequently). Batch bulk resolution during off-peak hours with rate-aware throttling.

### 3. Small Community — Single Maintainer Risk

**Severity: Low**

21 stars and apparently a single active maintainer. If the maintainer stops updating the library after GLEIF API changes, pygleif will silently return empty or incorrectly parsed data.

**Recommendation:** Fork and vendor the library in `src/vendors/pygleif/` so GLEIF API changes can be patched independently of upstream release cadence. The library is small enough (~10 files) to maintain internally.

### 4. No Async Support

**Severity: Low**

The library uses synchronous HTTP calls. In an async TypeScript/Node context or a FastAPI backend, synchronous GLEIF calls will block the event loop.

**Recommendation:** Wrap calls in `asyncio.to_thread()` or switch to `httpx.AsyncClient` for the HTTP layer in the chain resolver.

---

## UBO Chain Resolution for Hawkeye Sterling

```python
# src/services/gleif_chain_resolver.py

from pygleif import PyGleif
from functools import lru_cache
import time

MAX_DEPTH = 10

@lru_cache(maxsize=1000)
def fetch_lei_record(lei: str):
    time.sleep(0.1)  # 10 req/sec rate limit guard
    return PyGleif(lei)

def resolve_ownership_chain(starting_lei: str) -> list[dict]:
    chain = []
    current_lei = starting_lei
    seen = set()

    for _ in range(MAX_DEPTH):
        if current_lei in seen:
            break  # Cycle detected
        seen.add(current_lei)

        record = fetch_lei_record(current_lei)
        entity = record.response.data.attributes.entity
        chain.append({
            "lei": current_lei,
            "name": entity.legal_name.name,
            "jurisdiction": entity.jurisdiction,
            "status": entity.status,
        })

        # Traverse to direct parent
        rel = record.response.data.relationships
        parent = getattr(rel, "direct_parent", None)
        if not parent or not parent.data:
            break
        current_lei = parent.data.id

    return chain
```

---

## Integration Map for Hawkeye Sterling

| GLEIF Data | HS Module | Use |
|-----------|-----------|-----|
| Entity name + jurisdiction | `src/ingestion/` | Augment FtM `Company` entity |
| Ownership chain | `src/brain/` beneficial ownership mode | Detect shell company layers |
| Ultimate parent LEI | `src/brain/` | Sanctions check on ultimate owner |
| Validation source + status | `src/brain/` | Flag inactive/lapsed registrations |
| Registration date | `src/brain/` | Flag recently registered shells |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Data quality | Excellent | GLEIF is the authoritative global LEI source |
| API coverage | Fair | Only 2 functions; no built-in traversal |
| Pydantic validation | Very Good | Fail-fast response parsing |
| Community | Poor | 21 stars, single maintainer |
| Async support | Poor | Synchronous only |
| License | Excellent | MIT |
| HS fit | ★★★ | Essential for UBO chain resolution — wrap with custom traversal |

---

## Recommendation

**Adopt with custom traversal logic.** GLEIF data is authoritative and free — there is no better source for legal entity identification and ownership chain resolution. The library handles the HTTP + Pydantic layer correctly. Write `src/services/gleif_chain_resolver.py` for depth-limited, cached, cycle-safe parent traversal. Fork and vendor the library to hedge against single-maintainer abandonment.
