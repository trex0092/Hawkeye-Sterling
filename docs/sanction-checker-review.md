# Code Review: PirSalmanShah/sanction-checker

**Repository:** https://github.com/PirSalmanShah/sanction-checker  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 0

---

## Summary

sanction-checker is a lightweight Node.js client library that wraps the OpenSanctions API for batch entity name-screening against consolidated sanctions lists. The library abstracts the OpenSanctions `/match` endpoint, handles request batching, response normalisation, and match-score thresholding. For Hawkeye Sterling's `src/services/`, this is the most relevant public reference for a minimal, TypeScript-compatible sanctions API wrapper — particularly the thin-wrapper pattern for serverless batch name checks where a heavy SDK would be overkill.

---

## Architecture

```
Input: array of entity objects { name, dob?, country?, entityType? }
  ↓
sanction-checker client
  ├── Batch builder    ← groups entities into 100-item batches (OpenSanctions limit)
  ├── HTTP client      ← POST /match with retries and exponential backoff
  ├── Response parser  ← extracts match results, normalises score to 0–1
  └── Threshold filter ← discards matches below configurable score threshold
  ↓
Output: array of { inputEntity, matches: [{ sanctionsList, score, entityId, listEntry }] }
```

The library is a single JavaScript module (~300 lines) with no production dependencies beyond `axios` and `p-retry`. It is designed to be embedded as a utility in a larger application, not deployed as a standalone service.

---

## Key Technical Patterns

**1. Thin Wrapper with Zero Business Logic**

The library's defining characteristic is its deliberate minimalism. It makes exactly the API calls OpenSanctions expects, parses exactly the fields Hawkeye Sterling needs, and returns a normalised result. There is no caching, no entity deduplication, no graph building. This is the correct pattern for a serverless batch invocation context: keep the library stateless and let the caller manage orchestration.

**2. Batching to OpenSanctions Limits**

OpenSanctions' `/match` endpoint accepts up to 100 entities per request. The library's batch builder automatically splits larger entity arrays into sub-batches, executes them with configurable concurrency (`maxConcurrent`, default 3), and merges results. This is critical for Hawkeye Sterling's bulk onboarding screening path (hundreds to thousands of entities at once).

**3. Exponential Backoff with Jitter**

The `p-retry` integration wraps every API call with configurable retry logic (default: 3 retries, exponential backoff with ±100ms jitter). This is the correct resilience pattern for calls to an external API under rate-limit constraints — important because OpenSanctions' API has a free-tier limit and throttles at scale.

**4. Score Threshold Configuration**

The library accepts a `matchThreshold` constructor option (default 0.70) and filters out matches below threshold before returning. This allows Hawkeye Sterling to configure different thresholds for different screening contexts (e.g., higher threshold for automatic clear, lower threshold for manual review queue).

---

## What Hawkeye Sterling Can Extract

- **Thin wrapper pattern**: the library's stateless, thin-wrapper design is exactly right for Hawkeye Sterling's `src/services/sanctionsClient.ts` — adopt the pattern, port to TypeScript
- **Batching logic**: the 100-entity batch builder with configurable concurrency is directly reusable in Hawkeye Sterling's bulk screening path
- **Retry with jitter**: the `p-retry` exponential-backoff pattern should be adopted in all of Hawkeye Sterling's external API client wrappers, not just sanctions
- **Threshold configuration**: the constructor-level `matchThreshold` option maps to Hawkeye Sterling's alert-tier thresholds (auto-clear / review / escalate)
- **Response normalisation**: the normalised `{ inputEntity, matches }` output schema is a clean template for Hawkeye Sterling's sanctions match result model

---

## Integration Path

**TypeScript REST client.** The library is JavaScript/Node.js, easily ported to TypeScript with type definitions added. Use directly in Hawkeye Sterling's `src/services/sanctionsClient.ts` without a Python microservice — OpenSanctions has a well-documented REST API that is language-agnostic. The full integration is: TypeScript service → OpenSanctions `/match` API → normalised match results → `src/brain/` for scoring. Add a Redis cache layer for repeated name lookups (names rarely change between screenings).

---

## Caveats

- **Stars: 0 / no tests**: the library has zero tests and no README beyond a minimal usage snippet. Treat as a pattern reference, not a production dependency.
- **JavaScript only**: the library is plain JavaScript with no TypeScript types. Port to TypeScript with strict types before using in Hawkeye Sterling — the `match` response schema in particular needs careful typing.
- **No caching**: every call hits the OpenSanctions API. For Hawkeye Sterling's continuous monitoring path (re-screening existing customers), this is expensive. Add a Redis TTL cache keyed on `{entity_name}:{entity_type}:{list_version}`.
- **OpenSanctions API key required**: the OpenSanctions API requires an API key for production use (free tier available but rate-limited). The library accepts the key as a constructor argument but provides no guidance on secret management. Store in Hawkeye Sterling's secret manager (AWS Secrets Manager, Vault).
- **No sanctions list selection**: the library hits OpenSanctions' default combined list. For specific regulatory requirements (OFAC-only, EU-only), OpenSanctions supports list filtering via the `dataset` parameter — the library does not expose this. Add it when porting.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Wrapper minimalism | Excellent | Stateless, thin, no unnecessary abstractions |
| Batching | Very Good | 100-entity batching with concurrency control |
| Resilience | Good | Retry with backoff, but no circuit breaker |
| TypeScript support | Poor | Plain JS, no types |
| Production readiness | Poor | No tests, no caching, no list selection |
| HS fit | ★★ | Good pattern reference; port to TypeScript with caching and list filtering |

---

## Recommendation

**Port to TypeScript and adopt in `src/services/sanctionsClient.ts`.** The thin-wrapper pattern, batching logic, and retry mechanism are all correct. The gaps (no tests, no TypeScript, no caching, no list selection) are all straightforward to fill during the port. Add a Redis cache layer, expose the `dataset` parameter, and add strict TypeScript types. The result will be Hawkeye Sterling's canonical sanctions API client.
