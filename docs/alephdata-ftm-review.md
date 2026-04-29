# Code Review: alephdata/followthemoney

**Repository:** https://github.com/alephdata/followthemoney  
**Stars:** 269 | **Version:** 3.8.4 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

`alephdata/followthemoney` is the original FollowTheMoney (FtM) library maintained by OCCRP (Organized Crime and Corruption Reporting Project) and the Journalism Development Network. It is the general-purpose investigative data model behind the Aleph platform — the primary open-source tool used by investigative journalists for corruption and financial crime research. Version 3.8.4 (2024), Python 3.10–3.12, MIT licence.

We have already reviewed `opensanctions/followthemoney` (a downstream fork specialised for sanctions lists). This review compares the two forks and assesses which Hawkeye Sterling should adopt.

**TL;DR: Use `alephdata/followthemoney` as the primary dependency.** It is the canonical reference implementation with richer tooling (aggregation, sieve, mapping, RDF/GEXF/Cypher export), and both forks are maintained by overlapping teams.

---

## Fork Comparison: alephdata vs opensanctions

| Dimension | alephdata/followthemoney | opensanctions/followthemoney |
|-----------|--------------------------|------------------------------|
| Maintainer | OCCRP / Journalism Dev Network | OpenSanctions team |
| Focus | General investigative data modelling | Sanctions + PEP data specifically |
| Stars | 269 | 58 |
| Version | 3.8.4 | Tracking OS data pipeline |
| CLI tools | `ftm aggregate`, `ftm sieve`, `ftm mapping`, `ftm csv`, `ftm excel`, `ftm rdf`, `ftm gexf`, `ftm cypher` | Fewer export tools |
| Neo4j export | Yes (`ftm cypher`) | No |
| RDF export | Yes (`ftm rdf`) | No |
| Graph export | Yes (`ftm gexf`) | No |
| Schema parity | Identical core schemas | Adds sanctions-specific properties |
| PyPI package | `followthemoney` | `followthemoney` (same package name — check version source) |
| Used by | Aleph, OCCRP, dozens of fincrime tools | yente, OpenSanctions data pipeline |

---

## Additional Tooling in alephdata Fork

### CLI Commands Not in opensanctions Fork

```bash
# Aggregate duplicate entities by fingerprint
ftm aggregate < entities.ftm.json > deduplicated.ftm.json

# Filter entities by schema type
ftm sieve --schema Person < all_entities.json > persons_only.json

# Map tabular data (CSV) to FtM schema
ftm mapping -m mapping.yml < data.csv > entities.ftm.json

# Export to CSV / Excel
ftm csv < entities.ftm.json > entities.csv
ftm excel < entities.ftm.json > entities.xlsx

# Export to RDF (for knowledge graph tooling)
ftm rdf < entities.ftm.json > entities.ttl

# Export to GEXF (for Gephi / graph visualisation)
ftm gexf < entities.ftm.json > graph.gexf

# Export to Cypher (for Neo4j import)
ftm cypher < entities.ftm.json > import.cypher
```

The Cypher export is particularly valuable for Hawkeye Sterling: it converts FtM entity graphs directly into Neo4j import scripts, enabling the beneficial ownership chain graph (Person → Ownership → Company → Directorship → Person) to be loaded into Neo4j for Cypher-based chain queries.

### Additional Python Dependencies

`alephdata/followthemoney` adds:
- `networkx` — graph traversal in Python
- `rdflib` — RDF serialisation for knowledge graph export
- `fingerprints` — entity fingerprinting for deduplication (more advanced than in OS fork)
- `phonenumbers` — phone number normalisation
- `sqlalchemy` — ORM support for database-backed entity storage
- `openpyxl` — Excel export

---

## Strengths

### 1. Canonical Reference Implementation

All FtM tooling (Aleph, yente, nomenklatura, OpenSanctions) ultimately traces to this fork. Schema updates, new entity types, and ontology decisions are made here first. Using the canonical fork reduces the risk of schema drift.

### 2. Neo4j / Cypher Export — Direct Graph Database Loading

```bash
# Load Hawkeye Sterling's entity graph into Neo4j
ftm cypher < hs_entities.ftm.json | neo4j-shell
```

This enables Cypher queries on beneficial ownership chains:
```cypher
// Find all entities within 3 hops of a sanctioned person
MATCH path = (s:Sanction)-[:ENTITY*1..3]-(e)
WHERE s.authority = 'UN Security Council'
RETURN e.name, length(path) as hops, path
```

### 3. GEXF Export — Direct Gephi / NetworkX Loading

```python
import networkx as nx
G = nx.read_gexf("hs_entities.gexf")
# Full graph analytics: centrality, community detection, etc.
```

### 4. `ftm aggregate` for Cross-Source Deduplication

```bash
# Merge the same person appearing in OFAC + EU + UN lists
cat ofac.ftm.json eu.ftm.json un.ftm.json | ftm aggregate > canonical.ftm.json
```

The aggregate command deduplicates entities by fingerprint — the same operation that OpenSanctions' `nomenklatura` does for the full dataset. For Hawkeye Sterling's own ingestion pipeline, `ftm aggregate` handles cross-source deduplication without a separate deduplication service.

### 5. `ftm mapping` — Convert Any Tabular Data to FtM

```yaml
# mapping.yml: convert a CSV sanctions list to FtM
queries:
  - csv_url: "ofac_sdn.csv"
    entities:
      person:
        schema: Person
        keys: [SDNID]
        properties:
          name: [FirstName, LastName]
          nationality: [Nationality]
```

This is the standard pattern for onboarding any CSV-format source list into Hawkeye Sterling's FtM-based entity store.

---

## Issues and Concerns

### 1. Heavy Dependencies for Full Feature Set

**Severity: Low**

`rdflib`, `networkx`, `sqlalchemy`, and `openpyxl` add significant package weight for users who only need basic entity creation and serialisation. However, all are optional in practice — the core entity model works without them.

### 2. `pyicu` Dependency (Shared with OS Fork)

**Severity: Medium**

Both forks share the `pyicu` dependency for text normalisation. Installation remains painful outside Docker (requires system-level ICU C++ library). Mitigate with the `ghcr.io/opensanctions/yente` Docker base image which has `pyicu` pre-installed.

---

## Integration Map for Hawkeye Sterling

| FtM Tool | HS Module | Use |
|---------|-----------|-----|
| `ftm mapping` | `src/ingestion/` | Convert CSV sanctions lists to FtM |
| `ftm aggregate` | `src/ingestion/` | Cross-source deduplication |
| `ftm sieve` | `src/ingestion/` | Filter entities by schema type |
| `ftm cypher` | `src/brain/` graph modes | Load entity graph into Neo4j |
| `ftm gexf` | `src/brain/` graph modes | Load into NetworkX for traversal |
| `ftm csv` / `ftm excel` | `src/services/` | Export for compliance reports |
| Python library | `src/brain/`, `src/ingestion/` | Entity creation, validation, fingerprinting |

---

## Recommendation: Use alephdata Over opensanctions Fork

**Primary dependency:** `pip install followthemoney` (install from alephdata's releases, currently 3.8.4)

Use the opensanctions fork only indirectly — through `yente`, which runs its own pinned version. Do not take a separate direct dependency on `opensanctions/followthemoney`.

The alephdata fork provides a superset of functionality (Cypher, GEXF, RDF, aggregate, sieve, mapping) that is directly needed for Hawkeye Sterling's ingestion and graph export pipelines.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Tooling breadth | Excellent | Cypher/GEXF/RDF export + aggregate/sieve/mapping |
| Schema | Excellent | Canonical reference — all forks trace here |
| Neo4j integration | Excellent | `ftm cypher` directly loads entity graphs |
| Cross-source dedup | Very Good | `ftm aggregate` handles without external service |
| pyicu dependency | Fair | Painful install; use Docker base image |
| License | Excellent | MIT |
| HS fit | ★★★ | Primary FtM dependency — use over opensanctions fork |
