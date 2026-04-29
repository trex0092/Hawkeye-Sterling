# Code Review: AnirudhBabu/AMLPatternDetection

**Repository:** https://github.com/AnirudhBabu/AMLPatternDetection  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 1

---

## Summary

AMLPatternDetection demonstrates a high-performance AML data pipeline combining DuckDB for vectorised SQL analytics and Memgraph for in-memory graph traversal across 850K accounts and 9M transactions. The project targets detection of structuring, fan-in aggregation, and cycle patterns via SQL window functions (for velocity/threshold queries) paired with Cypher traversals (for multi-hop relationship analysis). For Hawkeye Sterling's `src/ingestion/` layer, this is the closest public reference for a dual-engine ingestion pattern that handles both tabular analytics and graph queries over the same underlying data.

---

## Architecture

```
Raw transaction data (CSV / Parquet)
  ↓
DuckDB engine
  ├── Vectorised SQL window functions (velocity, threshold, burst detection)
  ├── Aggregation queries (fan-in/fan-out degree, daily sum per account)
  └── Output: flagged account IDs + feature vectors
  ↓
Memgraph in-memory graph
  ├── Accounts → nodes, Transactions → directed edges
  ├── Cypher pattern queries (MATCH cycles, 2-hop paths, bipartite subgraphs)
  └── Output: suspicious subgraph extracts
  ↓
Merged alert output (account ID + pattern type + evidence subgraph)
```

The two engines share the same account ID namespace, so DuckDB flags can be used as Cypher seed nodes for targeted graph traversal — avoiding full-graph scans.

---

## Key Technical Patterns

**1. DuckDB for Threshold and Velocity Queries**

DuckDB's vectorised execution on Parquet files is orders of magnitude faster than pandas for the threshold queries that underpin structuring detection (e.g., daily totals just below $10,000). The repo uses `SUM() OVER (PARTITION BY account_id, DATE_TRUNC('day', ts))` window functions on 9M rows with sub-second latency. This is the right approach for Hawkeye Sterling's `STRUCTURING_THRESHOLD` rule.

**2. Memgraph Cypher for Multi-Hop Traversal**

Cycle detection via Cypher `MATCH p=(a)-[*3..6]->(a)` is more ergonomic and faster than NetworkX for large graphs because Memgraph executes in-memory with index-backed node lookups. The repo uses parameterised Cypher queries to constrain traversal depth and time window, preventing runaway graph searches.

**3. Seed-and-Traverse Pattern**

The most architecturally significant pattern: DuckDB produces a short list of high-risk account IDs (the threshold breakers), which are passed as seed nodes to Memgraph. Memgraph then traverses only the ego-network of those seeds rather than the entire graph. This dramatically reduces graph query cost at scale.

**4. Parquet as the Common Interchange**

Both engines read from the same Parquet partition layout (`year=YYYY/month=MM/`). There is no intermediate database or message queue — the Parquet lake is the single source of truth. This is a clean, low-dependency design.

---

## What Hawkeye Sterling Can Extract

- **Seed-and-traverse pattern**: adopt in `src/ingestion/` — run DuckDB velocity/threshold queries first, pass results as seed IDs to the graph traversal layer
- **DuckDB window function queries**: directly reusable for structuring threshold detection in `src/brain/forensic/structuring.py`
- **Memgraph Cypher patterns**: the cycle and fan-in/fan-out Cypher queries are well-parameterised and can be ported to Hawkeye Sterling's graph query layer
- **Parquet partition layout**: adopt the `year/month` Parquet scheme in Hawkeye Sterling's data lake for consistent dual-engine access

---

## Integration Path

**Python microservice.** Both DuckDB and Memgraph have Python clients. Wrap the dual-engine pipeline as a `POST /ingest` endpoint that accepts a batch of raw transactions, runs the DuckDB + Memgraph pipeline, and returns a list of flagged account IDs with pattern labels. Hawkeye Sterling's TypeScript orchestrator calls this service and forwards results to `src/brain/` for deeper analysis.

---

## Caveats

- **Stars: 1 / minimal documentation**: the repo has almost no README or inline comments. The code is navigable but requires reading carefully to understand the data flow.
- **Memgraph memory requirements**: loading 850K nodes + 9M edges into Memgraph requires ~8–16 GB RAM depending on property size. Hawkeye Sterling must provision appropriately or use Memgraph's on-disk mode for larger datasets.
- **No streaming support**: the pipeline is batch-oriented. For Hawkeye Sterling's real-time screening path, the DuckDB layer would need to be replaced with a streaming aggregation engine (e.g., Flink or Materialize) or micro-batched at sub-minute intervals.
- **No authentication on Memgraph**: the repo runs Memgraph without auth. Production deployments require enabling Memgraph's auth module and TLS.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Ingestion performance | Excellent | 9M transactions with DuckDB vectorisation |
| Graph query ergonomics | Very Good | Cypher patterns are well-parameterised |
| Documentation | Poor | Minimal README, no inline comments |
| Production readiness | Fair | No auth, no streaming, no tests |
| HS fit | ★★★ | Core ingestion pattern for `src/ingestion/` |

---

## Recommendation

**Adopt the seed-and-traverse pattern in `src/ingestion/`.** The DuckDB → Memgraph handoff is Hawkeye Sterling's most important architectural decision for the ingestion layer: it avoids full-graph scans while retaining the expressive power of Cypher for multi-hop AML patterns. Port the window function queries for structuring detection directly. Add streaming support via micro-batching before production use.
