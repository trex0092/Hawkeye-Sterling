# Code Review: dhiaej/AML-Fraud-Detection-System

**Repository:** https://github.com/dhiaej/AML-Fraud-Detection-System  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 1

---

## Summary

AML-Fraud-Detection-System is a full-stack AML application integrating a PyTorch Geometric GNN risk scorer, a FastAPI backend, and a React TypeScript frontend. The GNN (Graph Convolutional Network variant) scores individual accounts and transactions by aggregating neighbourhood features from the transaction graph, producing a continuous 0–1 risk score per entity. For Hawkeye Sterling, this is the most directly relevant public reference for the `web/` + `src/services/` integration challenge: it shows a working FastAPI microservice pattern for serving GNN scores to a TypeScript frontend.

---

## Architecture

```
PyG GNN model (trained offline)
  ↓ saved as .pt checkpoint
FastAPI service (Python)
  ├── POST /score          ← accepts entity graph JSON, returns risk score
  ├── POST /batch-score    ← bulk scoring for ingestion pipeline
  └── GET  /explain/{id}  ← GNNExplainer subgraph for a given entity
  ↓ REST JSON
React TypeScript frontend
  ├── Risk dashboard (entity list, score heatmap)
  ├── Entity detail view (subgraph visualisation via D3)
  └── Alert queue (sorted by risk score, manual review workflow)
```

The FastAPI service loads the trained GNN checkpoint at startup, holds it in memory, and serves synchronous scoring requests. Entity graphs are serialised as adjacency lists in the request body and reconstructed as PyG `Data` objects server-side.

---

## Key Technical Patterns

**1. FastAPI Scoring Endpoint Contract**

The `/score` endpoint accepts a flat JSON payload:

```json
{
  "node_features": [[...], ...],
  "edge_index": [[src, ...], [dst, ...]],
  "edge_attr": [[amount, ts_delta], ...]
}
```

This thin contract is language-agnostic — Hawkeye Sterling's TypeScript code can call it directly with `fetch`. The response is `{"entity_id": "...", "risk_score": 0.87, "risk_label": "HIGH"}`.

**2. GNNExplainer Integration**

The `/explain/{id}` endpoint runs PyG's `GNNExplainer` on the requested entity and returns an importance-weighted subgraph. This gives Hawkeye Sterling's frontend a ready-made pattern for the "why is this entity flagged?" drill-down view, which is a regulatory requirement for STR filing.

**3. Model Versioning via FastAPI Startup**

The service loads a model checkpoint path from an environment variable (`MODEL_PATH`). Swapping model versions is a config change with a service restart — no code change required. This is the correct pattern for Hawkeye Sterling's model deployment lifecycle.

**4. React D3 Subgraph Visualisation**

The frontend renders the GNNExplainer subgraph as a force-directed D3 graph in the entity detail view. Nodes are coloured by entity type (account, merchant, counterparty), edges sized by transaction amount. This is directly reusable in `web/` as Hawkeye Sterling's entity graph view.

---

## What Hawkeye Sterling Can Extract

- **FastAPI scoring contract**: the JSON request/response schema is a direct template for `src/services/gnn-scorer.py`
- **GNNExplainer endpoint**: adopt the `/explain/{id}` pattern for Hawkeye Sterling's alert explanation API
- **Model loading pattern**: environment-variable model path with startup checkpoint loading is the right pattern for `src/services/`
- **D3 subgraph component**: the React force-directed graph component is reusable in `web/components/EntityGraph.tsx`
- **Batch scoring endpoint**: the `/batch-score` pattern maps to Hawkeye Sterling's bulk ingestion scoring path

---

## Integration Path

**Python microservice + TypeScript REST client.** Deploy the FastAPI service as a Docker container alongside Hawkeye Sterling's main Node.js process. Hawkeye Sterling's `src/services/gnnClient.ts` calls the scoring endpoints via HTTP. Keep model training entirely offline (in a separate Python notebook/script); the FastAPI service is inference-only. Use environment variables for `MODEL_PATH`, `PORT`, and `LOG_LEVEL`.

The React components can be adapted into Hawkeye Sterling's `web/` layer directly since the project already uses TypeScript/React — check import patterns and replace any Create React App assumptions with the project's actual bundler.

---

## Caveats

- **Stars: 1 / no tests**: no unit tests, no integration tests, no CI pipeline. The FastAPI service has no input validation beyond Pydantic model parsing.
- **Synchronous inference**: the scoring endpoints are synchronous. For high-throughput batch scoring, replace with async background tasks (`BackgroundTasks`) or a Celery queue.
- **No authentication on FastAPI**: the service exposes no auth layer. Add OAuth2 or API-key middleware before deployment in any environment accessible from the internet.
- **Model not published**: the trained `.pt` checkpoint is not committed. The README describes training steps but does not provide a pre-trained model. Hawkeye Sterling must train its own GNN on AMLSim or real data.
- **PyG version sensitivity**: PyTorch Geometric has broken APIs between minor versions. Pin the exact `torch`, `torch-geometric`, `torch-scatter`, and `torch-sparse` versions to avoid silent breakage.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| API contract design | Very Good | Clean, language-agnostic JSON contract |
| Explainability | Very Good | GNNExplainer endpoint is production-relevant |
| Frontend UI | Good | D3 subgraph view is directly reusable |
| Security | Poor | No auth, no input sanitisation |
| Production readiness | Fair | Synchronous only, no tests, no CI |
| HS fit | ★★★ | Best public reference for GNN-as-microservice pattern |

---

## Recommendation

**Use as the template for `src/services/gnn-scorer.py`.** The FastAPI scoring contract, GNNExplainer endpoint, and model loading pattern are all production-grade ideas wrapped in a PoC implementation. Adopt the interface, harden the implementation: add Pydantic input validation, async inference, API-key authentication, and health-check endpoints. Port the D3 subgraph component to `web/components/EntityGraph.tsx` for the alert drill-down view.
