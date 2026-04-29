# Code Review: opensanctions/yente

**Repository:** https://github.com/opensanctions/yente  
**Version:** 5.3.0  
**Review Date:** 2026-04-26  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

Yente is a self-hostable REST API for sanctions screening and entity matching, backed by OpenSanctions data indexed in ElasticSearch or OpenSearch. It exposes four endpoint families: text search (`/search`), query-by-example screening (`/match`), entity graph traversal (`/entities`), and the W3C Reconciliation API (`/reconcile`). It is the production API layer used by OpenSanctions itself and is the most mature open-source name-matching service available.

For Hawkeye Sterling this is the highest-priority integration: it replaces ad-hoc fuzzy name matching with a purpose-built, benchmarked, and actively maintained service — all on-premises, no data leaves the server.

---

## Strengths

### 1. Batch Async Matching with `asyncio.TaskGroup`

The `/match/{dataset}` endpoint processes multiple entity queries concurrently:

```python
async with asyncio.TaskGroup() as tg:
    for name, query in match.queries.items():
        tasks[name] = tg.create_task(match_one(...))
```

This is the correct pattern for I/O-bound batch screening — all candidate lookups run in parallel against ElasticSearch. A synchronous implementation would multiply latency by the number of entities in the batch. The `await asyncio.sleep(0)` in `scoring.py` yields to the event loop during CPU-bound scoring to prevent blocking other requests.

### 2. Four-Endpoint API Design Maps Perfectly to Screening Workflows

| Endpoint | Use case in Hawkeye Sterling |
|----------|------------------------------|
| `/search/{dataset}` | User-facing name search box in the screening UI |
| `/match/{dataset}` | Programmatic batch screening of uploaded subject lists |
| `/entities/{entity_id}` | Drill-down on a hit — full entity + adjacent (addresses, family) |
| `/reconcile` | OpenRefine integration for analyst bulk-reconciliation workflows |

### 3. Configurable Scoring with Algorithm Selection

The matching endpoint accepts an `algorithm` parameter and configurable `weights`. The scoring layer (`scoring.py`) is decoupled from the search layer — different algorithms can be swapped without changing the API contract. Default thresholds (70% result, 50% cutoff) are documented and overridable per-request.

### 4. OpenTelemetry Tracing Built In

`scoring.py` instruments every `algorithm.compare()` call with duration measurements and span attributes (algorithm name, schema, candidate count, match count). This means Hawkeye Sterling's observability stack can trace exactly how long each matching step takes per entity, without adding instrumentation code.

### 5. FollowTheMoney Native

Yente natively consumes FtM-format entities for both the index and the query. Submitting an FtM `Person` or `Company` entity as a match query returns scored FtM entities from the sanctions dataset. This means adopting Yente and FtM together gives a unified entity format across ingestion, screening, and output.

### 6. Thundering Herd Protection

`settings.py` uses randomised cron scheduling (jittered intervals) for data refresh to prevent all replica instances from simultaneously hitting the OpenSanctions dataset endpoint. This is a production-readiness detail most open-source tools omit.

---

## Issues and Concerns

### 1. ElasticSearch / OpenSearch Dependency Is Heavy

**Severity: Medium**

Yente requires a running ES/OpenSearch cluster for the index. For Hawkeye Sterling deployments without existing ES infrastructure, this adds ~2GB RAM baseline and operational complexity. The `docker-compose` files simplify setup, but it is not a lightweight dependency.

**Recommendation:** For small deployments (< 1M entities), evaluate whether yente's in-process index mode (if available) or a SQLite-backed alternative suffices. For production, ES is the right choice given its performance at scale.

### 2. MAX_BATCH Cap of 100 Entities Per Request

**Severity: Low–Medium**

The batch match endpoint caps at 100 entities per request (`MAX_BATCH: 100`). Screening a large uploaded list (e.g., 10,000 counterparty names) requires chunking on the caller side. There is no built-in streaming or chunked batch mode.

**Recommendation:** Implement a thin Hawkeye Sterling wrapper that chunks input lists into 100-entity batches and fans them out concurrently, then merges results. This should be a single utility function in `src/services/yente_client.ts`.

### 3. Default Score Thresholds May Need Tuning for HS Use Case

**Severity: Medium**

Default thresholds (70% result, 50% cutoff) are calibrated for general sanctions screening. Hawkeye Sterling's use case — AML/CFT with Arabic name transliteration and CJK normalisation — may require lower thresholds to avoid false negatives on transliterated names (e.g., "Mohammed Al-Rashid" vs "Muhammad Alrashid"). Conversely, lowering thresholds increases false positives.

**Recommendation:** Run calibration against a labelled test set of known true-positive HS screenings to determine optimal thresholds before going live. Document chosen thresholds in the HS compliance charter.

### 4. Authentication Is Token-Only with Deprecation Warning

**Severity: Low**

`settings.py` shows authentication via a token environment variable with deprecation warnings on the legacy variable name. There is no OAuth2, MTLS, or role-based access control. In a multi-tenant HS deployment (multiple compliance officers), all users share the same token.

**Recommendation:** Place yente behind an API gateway (e.g., Kong, Nginx) with per-user token management, or restrict yente to the internal network and let Hawkeye Sterling's own auth layer gate access.

### 5. No Result Explanation / Feature Breakdown

**Severity: Low**

The match response returns a score (0–1) but does not explain which fields drove the score (name similarity 0.9, DOB match 0.8, nationality mismatch -0.1). Compliance officers need to understand *why* a match was scored as a hit to make a defensible decision.

**Recommendation:** Extend the response with a `score_breakdown` field per candidate. This requires a change to yente's scoring layer or a post-processing step in Hawkeye Sterling that re-runs the comparison algorithm locally and extracts field-level contributions.

---

## Integration Guide for Hawkeye Sterling

### Deployment

```yaml
# docker-compose addition to HS stack
yente:
  image: ghcr.io/opensanctions/yente:latest
  environment:
    YENTE_ELASTICSEARCH_URL: http://elasticsearch:9200
    YENTE_DATASETS: "default"          # OpenSanctions default dataset
    YENTE_DEFAULT_THRESHOLD: "0.65"    # Lower than default for transliteration
  ports:
    - "8000:8000"
```

### Screening call from `src/services/`

```typescript
async function screenEntity(entity: FtMEntity): Promise<YenteMatchResult[]> {
  const chunks = chunkArray(entities, 100);
  const results = await Promise.all(
    chunks.map(chunk =>
      fetch(`${YENTE_URL}/match/default`, {
        method: 'POST',
        body: JSON.stringify({ queries: toQueryMap(chunk) })
      }).then(r => r.json())
    )
  );
  return results.flatMap(r => Object.values(r.responses));
}
```

### Which HS Module

- **`src/ingestion/`** — data refresh scheduler (mirrors OpenSanctions dataset on a cron)
- **`src/services/yente_client.ts`** — typed wrapper for all four endpoints
- **`src/brain/`** — sanctions-match reasoning mode consumes yente scores as evidence
- **`web/`** — search endpoint powers the live name-search box in the screening UI

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| API design | Excellent | 4 endpoints covering every screening workflow |
| Performance | Very Good | Async batch, ES backend, OTel tracing |
| Scoring | Good | Configurable algorithm + thresholds; no field-level explanation |
| Deployment | Good | Docker/K8s ready; ES dependency is substantial |
| Security | Fair | Token auth only; no RBAC |
| FtM integration | Excellent | Native entity format — zero transformation needed |
| HS fit | ★★★ | Highest-priority integration — replaces core name-matching today |

---

## Recommendation

**Integrate immediately.** Yente is production-grade, actively maintained by the OpenSanctions team, and directly replaces the ad-hoc name matching in Hawkeye Sterling's screening pipeline. The only pre-work needed is threshold calibration against your labelled screening data and wrapping the 100-entity batch limit.

**Priority fixes before production:**
1. Calibrate `YENTE_DEFAULT_THRESHOLD` against known HS true positives (especially Arabic/CJK names)
2. Implement 100-entity chunking wrapper in `src/services/yente_client.ts`
3. Add score breakdown post-processing for compliance officer explainability
4. Gate behind HS auth layer — do not expose yente port externally
