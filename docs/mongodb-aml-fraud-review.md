# Code Review: mongodb-industry-solutions/AML-Fraud-prevention-Demo

**Repository:** https://github.com/mongodb-industry-solutions/AML-Fraud-prevention-Demo  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 13

---

## Summary

AML-Fraud-prevention-Demo is MongoDB's official industry-solutions reference for real-time AML fraud detection integrated with GenAI. It demonstrates streaming transaction analysis using MongoDB Atlas with Change Streams, Atlas Vector Search for semantic similarity matching, and an LLM reasoning layer that evaluates flagged transactions against known AML typologies at clearing time. For Hawkeye Sterling's `src/monitoring/` layer, this is the strongest public reference for a real-time, event-driven alert architecture that combines streaming databases with LLM-based reasoning.

---

## Architecture

```
Transaction stream (simulated payment events)
  ↓
MongoDB Atlas (transaction documents inserted in real time)
  ↓
Atlas Change Streams
  ├── Triggers on new transaction insert
  ├── Enriches document with counterparty profile
  └── Routes to alert evaluation pipeline
  ↓
Atlas Vector Search
  ├── Embeds transaction narrative (amount, parties, channel, notes)
  └── Semantic nearest-neighbour search against known AML typology embeddings
  ↓
LLM Reasoning Layer (OpenAI / Azure OpenAI)
  ├── Receives flagged transaction + top-k similar typology descriptions
  ├── Evaluates whether the transaction fits any typology
  └── Produces structured alert: {typology, confidence, narrative, next_action}
  ↓
Alert output (MongoDB collection + webhook notification)
```

The Change Stream triggers the enrichment and vector search pipeline within the document write path, targeting sub-200ms latency from transaction insert to alert generation.

---

## Key Technical Patterns

**1. Change Streams as the Real-Time Trigger**

MongoDB Atlas Change Streams emit a document-level event for every insert/update. The demo wires a Change Stream listener (Python `watch()` loop) that triggers immediately on new transaction documents. This is the correct pattern for Hawkeye Sterling's real-time monitoring path: no polling, no separate message queue — the database itself is the event source.

**2. Vector Search for Typology Matching**

Rather than hardcoded rules, the demo uses Atlas Vector Search to find the closest matching AML typology from a pre-embedded typology library (FATF guidance descriptions, ACAMS case studies, FinCEN advisories). The embedding query returns the top-3 closest typologies, which are then passed to the LLM as context. This hybrid retrieval-augmented approach produces more nuanced typology classification than rules alone.

**3. LLM Structured Output for Alert Generation**

The LLM is prompted to produce a structured JSON response (typology code, confidence 0–1, narrative, recommended next action) rather than free-form text. The demo uses OpenAI's `response_format: {type: "json_object"}` parameter to enforce this. Hawkeye Sterling should adopt the same pattern for the alert generation step in its LLM reasoning chain.

**4. Atlas Aggregation for Velocity Checks**

Before the LLM call, the pipeline runs a MongoDB aggregation pipeline to compute 24-hour transaction velocity metrics for the originating account. If velocity is below threshold, the LLM call is skipped (cost control). This pre-filter pattern maps to Hawkeye Sterling's tiered evaluation logic.

---

## What Hawkeye Sterling Can Extract

- **Change Stream trigger pattern**: adopt in `src/monitoring/` as the real-time transaction event source — eliminates polling loops
- **Vector Search typology library**: the embedded FATF/ACAMS typology corpus is directly reusable; build the same index in Hawkeye Sterling's Atlas or OpenSearch instance
- **LLM structured output pattern**: the `json_object` response format enforcement is a must-have in Hawkeye Sterling's LLM integration layer
- **Velocity pre-filter**: the aggregation-pipeline velocity check before the LLM call is a direct template for Hawkeye Sterling's tiered alert cost control
- **Alert document schema**: the `{typology, confidence, narrative, next_action}` alert schema is a good baseline for Hawkeye Sterling's internal alert model

---

## Integration Path

**TypeScript REST client or direct MongoDB driver.** MongoDB has first-class Node.js/TypeScript drivers. Hawkeye Sterling can implement the Change Stream listener directly in TypeScript using `mongodb` npm package, eliminating the need for a Python microservice for the monitoring layer. The Atlas Vector Search queries and aggregation pipelines are also callable from the Node.js driver. The LLM call should go through Hawkeye Sterling's existing LLM abstraction layer (swap OpenAI for Anthropic Claude).

---

## Caveats

- **Atlas lock-in**: the demo is tightly coupled to MongoDB Atlas-specific features (Change Streams at scale, Vector Search, Atlas Triggers). Self-hosted MongoDB Community does not support Atlas Vector Search. Hawkeye Sterling must use Atlas or replace Vector Search with an alternative (OpenSearch, pgvector).
- **OpenAI dependency**: the LLM layer targets OpenAI GPT-4. Swapping to Anthropic Claude requires updating the client and the structured output prompt — straightforward but not documented in the repo.
- **No graph relationships**: MongoDB is a document store, not a graph database. The demo does not model multi-hop entity relationships. For Hawkeye Sterling's graph-based AML modes (ring detection, layering), this pattern must be supplemented with a graph layer (Neptune, Memgraph).
- **Simulated transaction stream**: the demo's transaction stream is simulated, not connected to a real payment rail. Production integration requires adapters for SWIFT, ACH, SEPA, or the relevant payment infrastructure.
- **LLM latency at clearing time**: sub-200ms is achievable for simple vector search + short LLM prompts, but degrades under load. Profile carefully before committing to synchronous LLM calls in the clearing path.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Real-time architecture | Excellent | Change Streams are the right pattern for event-driven monitoring |
| Typology matching | Very Good | Vector Search + LLM is more robust than hardcoded rules |
| Graph capability | Poor | Document store only; no multi-hop relationship modelling |
| Atlas dependency | Fair | Powerful but creates vendor lock-in |
| HS fit | ★★★ | Primary reference for `src/monitoring/` real-time alert layer |

---

## Recommendation

**Adopt the Change Stream + Vector Search + LLM pipeline as the `src/monitoring/` real-time alert layer.** This is the most production-relevant pattern in the public AML reference landscape for streaming transaction monitoring. Swap OpenAI for Anthropic Claude in the LLM layer. Supplement with a graph database (Memgraph or Neptune) for multi-hop AML detection — MongoDB handles the real-time event stream; the graph layer handles relationship traversal. Evaluate Atlas Vector Search vs. pgvector based on whether Hawkeye Sterling is Atlas-committed.
