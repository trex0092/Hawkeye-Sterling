# Code Review: opensanctions/followthemoney

**Repository:** https://github.com/opensanctions/followthemoney  
**Review Date:** 2026-04-26  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

FollowTheMoney (FtM) is a pragmatic entity data model and processing library for investigative journalism and financial crime analysis. It defines a shared ontology for the entities most common in compliance work — people, companies, assets, payments, ownership relations, addresses, court cases — and provides Python, Java, and TypeScript implementations with validation, normalisation, and graph-traversal tools.

FtM is the shared data format used across OpenSanctions, OpenAleph (the OCCRP investigation platform), yente (the sanctions API reviewed separately), and dozens of other fincrime tools. Adopting it in Hawkeye Sterling creates immediate interoperability with the entire OpenSanctions ecosystem and provides a schema foundation that is already validated in production financial crime investigations.

---

## Strengths

### 1. Purpose-Built Ontology for Financial Crime

FtM models exactly the entity types Hawkeye Sterling works with:

| FtM Schema | HS Use |
|-----------|--------|
| `Person` | Subject screening — name, DOB, nationality, ID numbers |
| `Company` | Corporate entity screening — registration, jurisdiction |
| `Ownership` | Beneficial ownership chains — `owner` → `asset` |
| `Directorship` | Corporate officers — `director` → `organization` |
| `Payment` | Transaction monitoring — amount, currency, date, parties |
| `Address` | Entity location — normalised, geocodable |
| `Sanction` | Sanctions list entry — authority, program, dates |
| `Family` | PEP family relationships — `person` → `relative` |
| `Associate` | PEP associate relationships |
| `BankAccount` | Account-level entity — IBAN, BIC, holder |
| `LegalEntity` | Abstract base for Person + Company |

This is not an academic ontology — it was built by investigators who needed to model real cases. The design choices reflect what investigators actually encounter in beneficial ownership research, sanctions evasion, and shell company analysis.

### 2. Multi-Language Implementations

FtM ships Python (primary), Java, and TypeScript implementations with schema parity. Hawkeye Sterling's TypeScript frontend and Python backend can both work with FtM entities natively:

```typescript
// TypeScript — in web/ components
import { Entity, Model } from 'followthemoney';
const model = new Model(schema);
const person = model.getEntity({ schema: 'Person', properties: { name: ['John Doe'] } });
```

```python
# Python — in src/services/
from followthemoney import model
entity = model.make_entity('Person')
entity.set('name', 'John Doe')
entity.set('nationality', 'GB')
```

### 3. Property Normalisation Built In

FtM normalises property values at set time — names are lowercased and tokenised for fingerprinting, dates are standardised, countries are mapped to ISO codes, currencies are normalised. This means two entities representing the same person entered from different sources (one from OFAC, one from EU list) will produce comparable fingerprints for deduplication.

### 4. Entity Fingerprinting and Deduplication

FtM generates stable fingerprints for entities based on their normalised key properties. The `followthemoney.dedupe` module provides entity merging — combining two partial records for the same person into one canonical entity. This directly supports Hawkeye Sterling's need to deduplicate entities across its 6+ direct-source lists (UN, OFAC, EU, UK, UAE EOCN, OpenSanctions).

### 5. Actively Maintained by OpenSanctions

The `opensanctions/followthemoney` fork (58 stars) is the active development fork used by OpenSanctions production. It receives regular updates tied to the OpenSanctions data pipeline and is co-maintained with yente. The `alephdata/followthemoney` repo (269 stars) is the original OCCRP version, still used by OpenAleph.

---

## Issues and Concerns

### 1. `pyicu` Dependency Is Painful to Install

**Severity: Medium**

FtM depends on `pyicu` (Python bindings for ICU — International Components for Unicode) for text normalisation. `pyicu` requires the ICU C++ library to be installed at the system level, which is not available in minimal Docker images or on Windows without manual setup. Build failures on `pyicu` are the most common FtM installation issue.

**Recommendation:** Pin a known working `pyicu` version in Hawkeye Sterling's requirements. Use the `ghcr.io/opensanctions/yente` Docker image as a base (it has `pyicu` pre-installed) for any Python services that use FtM.

### 2. Schema Is Opinionated About Property Cardinality

**Severity: Low–Medium**

FtM properties have defined cardinality (single vs. multi-value) baked into the schema. For example, `Person.birthDate` is single-value but `Person.name` is multi-value (to support aliases). Hawkeye Sterling's current internal entity model may store these differently, requiring a mapping layer on ingest.

**Recommendation:** Write an explicit `src/ingestion/ftm_adapter.ts` that maps Hawkeye Sterling's internal subject model ↔ FtM schema. Document any cardinality mismatches explicitly — these are where data loss can silently occur.

### 3. No Built-In Graph Query Language

**Severity: Low**

FtM provides entity-level graph traversal (adjacent entities, property-based relationships) but does not include a graph query language (no Cypher, SPARQL, or Gremlin). Complex beneficial ownership chain queries (e.g., "find all entities within 3 hops of this sanctioned person") require either exporting to Neo4j/NetworkX or implementing traversal logic manually.

**Recommendation:** For ownership chain analysis, export FtM entities to NetworkX for ad-hoc traversal during screening, or to Neo4j for persistent beneficial ownership graphs. The FtM→NetworkX conversion is straightforward (each entity is a node, each relationship property is an edge).

### 4. Two Active Forks With Slight Divergence

**Severity: Low**

`alephdata/followthemoney` and `opensanctions/followthemoney` are both active. The OpenSanctions fork adds AML/fincrime-specific schema elements (e.g., additional sanction properties). Using the wrong fork can cause schema validation errors when consuming OpenSanctions data.

**Recommendation:** Use `opensanctions/followthemoney` as the dependency (available on PyPI as `followthemoney` from the OpenSanctions-maintained package). Pin the version to match the yente version in use.

---

## Core Entity Types for Hawkeye Sterling

```python
from followthemoney import model

# Screen a person
person = model.make_entity('Person')
person.id = "hs-subject-001"
person.set('name', 'Ahmad Al-Rashidi')
person.set('name', 'Ahmed Alrashidy')          # alias
person.set('birthDate', '1975-03-14')
person.set('nationality', 'AE')
person.set('idNumber', 'UAE-123456789')

# Model a company
company = model.make_entity('Company')
company.set('name', 'Falcon Trading LLC')
company.set('jurisdiction', 'AE')
company.set('registrationNumber', 'CN-987654')

# Beneficial ownership link
ownership = model.make_entity('Ownership')
ownership.set('owner', person.id)
ownership.set('asset', company.id)
ownership.set('percentage', '51')

# Serialise for storage or API call
import json
print(json.dumps(person.to_dict(), indent=2))
```

---

## Integration Map for Hawkeye Sterling

| FtM Component | HS Module | What It Enables |
|--------------|-----------|-----------------|
| `Person`, `Company`, `LegalEntity` schemas | `src/ingestion/` | Unified entity type system across all 6+ data sources |
| `Ownership`, `Directorship` schemas | `src/brain/` graph modes | Beneficial ownership chain modelling |
| `Sanction` schema | `src/ingestion/` | Standard sanctions entry format across UN/OFAC/EU/UK/UAE |
| `Payment` schema | `src/brain/` transaction modes | Transaction-entity linking |
| Entity fingerprinting | `src/ingestion/` | Cross-list deduplication |
| TypeScript model | `web/` | Frontend entity rendering without custom types |
| `followthemoney.dedupe` | `src/ingestion/` | Merging duplicate entities from multiple sources |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Ontology coverage | Excellent | Every entity type HS needs is modelled |
| Python implementation | Very Good | Normalisation, fingerprinting, deduplication |
| Multi-language | Good | Python + Java + TypeScript parity |
| Installation | Fair | `pyicu` dependency is fragile |
| Graph query | Fair | No query language; requires NetworkX/Neo4j for complex traversals |
| HS fit | ★★★ | Foundational schema layer — adopt before yente |

---

## Recommendation

**Adopt as the internal entity schema standard.** FtM should be the canonical entity type system in Hawkeye Sterling. All data source adapters should emit FtM entities; all screening, reasoning, and reporting modules should consume them. This creates automatic interoperability with yente, OpenSanctions, and future OCCRP/OpenAleph integrations.

**Adoption order:**
1. Write `src/ingestion/ftm_adapter.ts` mapping HS subjects to FtM `Person`/`Company`
2. Update OFAC/UN/EU/UK ingestion to emit FtM `Sanction` entities
3. Model beneficial ownership as FtM `Ownership`/`Directorship` edges
4. Wire yente to accept FtM entity queries directly
