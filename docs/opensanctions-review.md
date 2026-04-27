# Code Review: opensanctions/opensanctions

**Repository:** https://github.com/opensanctions/opensanctions  
**Stars:** 720 | **Forks:** 158 | **Open Issues:** 86 | **Commits:** 15,000+  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

OpenSanctions is the data pipeline behind the OpenSanctions database — the most comprehensive open-source aggregation of international sanctions lists, PEP databases, and related entities. It crawls 120+ sources (UN, OFAC, EU, UK, Interpol, national lists, Transparency International, OCCRP), normalises all data to FtM schema, deduplicates across sources using `nomenklatura`, and exposes the result via `yente` (reviewed separately). The code is MIT-licensed; the **data is CC 4.0 Attribution-NonCommercial** — commercial use requires a paid licence.

For Hawkeye Sterling, OpenSanctions is the **canonical sanctions and PEP data source**: it replaces six separate direct-source scrapers with a single, maintained, deduplicated dataset covering more sources than any commercial vendor at a fraction of the price. Purchasing the commercial data licence is the correct path.

---

## Architecture

```
120+ Source Crawlers (zavod framework)
    ├── UN Security Council consolidated list
    ├── OFAC SDN + non-SDN lists
    ├── EU consolidated sanctions list
    ├── UK HM Treasury financial sanctions
    ├── Interpol Red Notices
    ├── National lists (AU, CA, CH, UAE EOCN, ...)
    ├── PEP databases (Transparency International, national PEP lists)
    └── OCCRP / investigative journalism entities
    ↓
FtM Schema Normalisation
    (Person, Company, Sanction, Address, BankAccount entities)
    ↓
nomenklatura (deduplication + data lineage)
    (same person appears in UN + OFAC + EU → merged canonical entity)
    ↓
Output: FtM JSON, CSV (simplified)
    ↓
yente REST API (search + match + reconcile)
```

**Associated tools in the ecosystem:**

| Tool | Role |
|------|------|
| `zavod` | Crawler/ETL framework for running pipeline |
| `nomenklatura` | Entity deduplication and data lineage |
| `yente` | REST API for screening (reviewed separately) |
| `followthemoney` | Schema (reviewed separately) |

---

## Strengths

### 1. 120+ Sources Maintained and Deduplicated

OpenSanctions crawls and normalises more sanctions and PEP sources than any open alternative. Maintaining these crawlers is a full-time engineering effort — OpenSanctions is a funded organisation (the Netherlands) that does this professionally. Building equivalent scraper coverage in-house would take 6–12 months of engineering time and requires ongoing maintenance as source formats change.

### 2. FtM-Native Output

All data is emitted as FtM entities (`Person`, `Company`, `Sanction`, `Ownership`). This is the same schema that Hawkeye Sterling is adopting as its internal entity standard. Zero transformation needed between the OpenSanctions data pipeline and the rest of the HS stack.

### 3. Cross-Source Deduplication via nomenklatura

The same individual appearing in OFAC, EU, and UN lists is merged into a single canonical FtM entity with data provenance tracking. Without deduplication, screening against multiple lists produces duplicate matches that require manual merging by compliance officers. OpenSanctions' `nomenklatura` does this automatically.

### 4. MIT Licence on Code — Reference Architecture Available

The crawler codebase (zavod + individual crawlers) is MIT-licensed. Hawkeye Sterling can study the OFAC, EU, and UN scraper implementations as reference architectures for any direct-source ingestion it builds for sources not covered by OpenSanctions (e.g., UAE EOCN if not yet in OS).

### 5. Docker Deployment in One Command

```bash
make build && make run
# or
docker compose run --rm app opensanctions run
```

The full data refresh pipeline runs in Docker with a single command, writing output to `./data/`. This makes it straightforward to schedule periodic data refreshes (daily or weekly) as a cron job in Hawkeye Sterling's infrastructure.

### 6. Actively Maintained — 15,000+ Commits

OpenSanctions is professionally maintained with 15,000+ commits and 18 months of release history. When OFAC updates its SDN list format (which happens frequently), the crawler is updated within days. Building equivalent maintenance capacity in-house is not economical.

---

## Issues and Concerns

### 1. Data Licence Is CC BY-NC — Commercial Use Requires Paid Licence

**Severity: Critical**

The data produced by the pipeline is licensed under **Creative Commons 4.0 Attribution-NonCommercial (CC BY-NC)**. This means:

- **Free use**: Academic research, journalism, non-profit AML, personal projects
- **Commercial use**: Requires a paid OpenSanctions commercial licence

Hawkeye Sterling is a commercial AML/compliance product — the CC BY-NC free tier does **not** apply. Using OpenSanctions data commercially without a licence is a licence violation.

**Recommendation:** Contact OpenSanctions to purchase a commercial data licence. OpenSanctions offers commercial licences tiered by company size and use case. The cost is significantly lower than commercial data vendors (World-Check, Dow Jones Risk & Compliance) while covering comparable source breadth. This is a budgeted cost, not a technical blocker.

### 2. 86 Open Issues — Data Quality Gaps

**Severity: Medium**

86 open issues include documented data quality gaps:
- PEP data alignment quality (some national PEP lists are incomplete)
- Missing company entities in securities sanctions
- Incomplete coverage of some national lists

These are known gaps being actively worked on. For production use, verify that the specific lists most critical to Hawkeye Sterling's jurisdiction (UAE EOCN, UN SC, OFAC) are complete and up to date.

### 3. Data Freshness Depends on Refresh Schedule

**Severity: Low–Medium**

OpenSanctions publishes data refreshes on a rolling schedule — most major lists update daily, but crawlers can fail silently if source formats change. Running the pipeline locally means Hawkeye Sterling is responsible for its own refresh schedule and monitoring for crawler failures.

**Recommendation:** Use the OpenSanctions-hosted API (via yente) rather than self-hosting the pipeline. The hosted API is refreshed and monitored by OpenSanctions directly. Self-host only if data residency requirements mandate it.

### 4. `libicu` and `libleveldb` System Dependencies

**Severity: Low**

The Docker image installs `libicu74` and `libleveldb1d` at the system level. These are non-trivial C library dependencies. The Dockerfile handles this cleanly, but custom base image builds (e.g., Alpine-based) will require porting these dependencies.

---

## Integration Architecture for Hawkeye Sterling

### Option A: Use OpenSanctions Hosted API (Recommended)

```yaml
# docker-compose.yml addition
yente:
  image: ghcr.io/opensanctions/yente:latest
  environment:
    YENTE_ELASTICSEARCH_URL: http://elasticsearch:9200
    YENTE_DATASETS: "default"        # Uses OpenSanctions hosted data
    YENTE_API_KEY: "${OPENSANCTIONS_API_KEY}"
```

The hosted API refreshes automatically. Commercial licence required.

### Option B: Self-Host the Pipeline (Data Residency)

```bash
# Data refresh cron (daily)
docker compose run --rm app opensanctions run --dataset default

# Output: ./data/datasets/default/entities.ftm.json
# Feed to yente for indexing
```

### Source Coverage Relevant to Hawkeye Sterling

| OpenSanctions Source | HS Jurisdiction Relevance |
|---------------------|--------------------------|
| UN Security Council | Universal — all jurisdictions |
| OFAC SDN + Non-SDN | US dollar transactions, US correspondent banks |
| EU consolidated list | EU counterparties, EUR transactions |
| UK HM Treasury | UK counterparties, GBP transactions |
| UAE EOCN | Primary HS deployment jurisdiction |
| Interpol Red Notices | Cross-border criminal exposure |
| OCCRP entities | Investigative journalism intelligence |
| Transparency International PEPs | PEP database across 180+ countries |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Source breadth | Excellent | 120+ lists — best open-source coverage available |
| Data quality | Very Good | Deduplicated, FtM-normalised, actively maintained |
| FtM integration | Excellent | Native format — zero transformation |
| Code licence | Excellent | MIT |
| Data licence | Critical note | CC BY-NC — commercial licence required |
| Deployment | Excellent | Docker + make in one command |
| Maintenance | Excellent | Professional team, 15,000+ commits |
| HS fit | ★★★ | Core sanctions/PEP data source — purchase commercial licence |

---

## Recommendation

**Purchase the OpenSanctions commercial data licence and use as the primary sanctions/PEP data source.** This is the single highest-leverage data integration available to Hawkeye Sterling:

1. 120+ maintained sources replace 6+ bespoke scrapers
2. FtM output integrates directly with the rest of the HS stack
3. Cross-source deduplication is handled by OpenSanctions
4. Daily refresh removes the data staleness risk
5. Cost is a fraction of commercial vendor alternatives

**Adoption order:**
1. Purchase commercial data licence
2. Deploy `yente` pointed at OpenSanctions default dataset
3. Configure `YENTE_DEFAULT_THRESHOLD: "0.65"` for transliteration tolerance
4. Retire direct-source scrapers for covered lists (UN, OFAC, EU, UK)
5. Keep direct UAE EOCN scraper until confirmed in OpenSanctions coverage
