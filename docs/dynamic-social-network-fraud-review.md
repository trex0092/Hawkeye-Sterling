# Code Review: Zhu-Shatong/DynamicSocialNetworkFraudDetection

**Repository:** https://github.com/Zhu-Shatong/DynamicSocialNetworkFraudDetection  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 79

---

## Summary

DynamicSocialNetworkFraudDetection implements GNN-based fraud detection on dynamic (temporal) social networks, treating the graph as a sequence of evolving snapshots rather than a single static structure. The model captures how fraud rings change their topology over time — recruiting new mule accounts, rotating intermediaries, adjusting transaction timing — and flags entities whose neighbourhood evolution matches known fraud-ring temporal patterns. For Hawkeye Sterling's `src/brain/`, this is the key reference for temporal-motif detection: the ability to identify AML rings not just from their current graph structure, but from how their structure has changed over a lookback window.

---

## Architecture

```
Transaction log (timestamped edges)
  ↓
Temporal graph construction
  ├── Discretise time into windows (e.g., weekly snapshots for 52-week lookback)
  ├── Per-window adjacency matrices (sparse, account × account)
  └── Edge feature vectors: [amount_sum, count, avg_amount, velocity]
  ↓
Dynamic GNN (temporal message passing)
  ├── EvolveGCN-O / EvolveGCN-H (GRU-based weight evolution)
  │     ← GNN weight matrices evolve across time steps (not static)
  ├── Temporal attention (which time windows matter most for this node?)
  └── Node embedding trajectory: [emb_t1, emb_t2, ..., emb_tN]
  ↓
Fraud classification head
  ├── LSTM over embedding trajectory (captures sequential patterns)
  └── Sigmoid output: fraud probability per node at each time step
```

---

## Key Technical Patterns

**1. EvolveGCN for Weight Matrix Evolution**

The core innovation is EvolveGCN (Pareja et al., 2020): instead of a static GNN weight matrix, the weight matrix itself evolves through a GRU cell at each time step. This means the model learns how aggregation functions should change as the graph structure changes — critical for detecting fraud rings that deliberately rotate their communication patterns to evade static detectors.

**2. Temporal Attention over Time Windows**

A multi-head attention mechanism assigns importance weights to each time window in the lookback period. This allows the model to learn that, for example, activity in the 4-week window before a flagged transaction is more informative than activity 6 months ago. Hawkeye Sterling can expose this attention weight as an explainability feature ("the alert was primarily driven by activity in weeks 3–6 of the lookback").

**3. Negative Sampling for Class Imbalance**

AML fraud is highly imbalanced (typically <1% positive). The repo implements temporal negative sampling: for each confirmed fraud edge at time t, sample k non-fraud edges from the same time window. This within-window negative sampling is more challenging (and more realistic) than random negative sampling, because it forces the model to distinguish fraud from legitimate high-activity edges in the same period.

**4. Discretised vs. Continuous Time**

The repo supports both discretised time windows (fixed-width snapshots) and continuous-time models (TGAT variant). For AML applications where regulatory lookback windows are defined (e.g., 30-day structuring window, 12-month PEP look-back), discretised windows aligned to regulatory periods are the correct choice.

---

## What Hawkeye Sterling Can Extract

- **EvolveGCN temporal architecture**: adopt as the core model for Hawkeye Sterling's temporal-motif detection mode in `src/brain/` — detects rings that evolve their topology over time to evade static snapshot detection
- **Embedding trajectory as explainability input**: the sequence of node embeddings `[emb_t1...emb_tN]` can be visualised as an entity's "AML risk trajectory" — useful for the case management UI in `web/`
- **Regulatory-period discretisation**: align the time window discretisation to Hawkeye Sterling's regulatory lookback requirements (30-day, 90-day, 12-month) rather than arbitrary fixed windows
- **Temporal negative sampling**: adopt for training on AMLSim-generated data — within-window negative sampling produces more robust classifiers than random negatives
- **Temporal attention weights as STR evidence**: the attention weights over time windows are human-interpretable — include in STR narrative ("heightened activity concentrated in [date range]")

---

## Integration Path

**Python microservice.** The dynamic GNN requires PyTorch + DGL (or PyTorch Geometric Temporal). Expose as a FastAPI inference endpoint that accepts a node ID + time range and returns the node's fraud probability trajectory and attention weights. Hawkeye Sterling's TypeScript core calls this endpoint when the forensic mode is `TEMPORAL_MOTIF` or `RING_EVOLUTION`. Training is entirely offline on AMLSim temporal data.

---

## Caveats

- **Stars: 79 but research-grade code**: the repo is research code, not production software. There are no unit tests, no input validation, and the code is structured for notebook-style experimentation rather than service deployment.
- **GPU required for training**: EvolveGCN training at meaningful graph sizes (>100K nodes, >1M edges per time step) requires a GPU with ≥16GB VRAM. Training on CPU is feasible for small datasets but not practical at production AML scale.
- **Inference latency**: per-node inference requires loading the full neighbourhood for all time steps, which is latency-intensive. For real-time screening, pre-compute embeddings nightly and cache in a vector store; re-score on-demand only for high-priority cases.
- **Data requirements**: the temporal model requires multi-year transaction history to train effectively. For new Hawkeye Sterling deployments with limited historical data, the static GNN (sagemaker-graph-fraud-detection) is a better starting point; migrate to temporal when sufficient history is available.
- **Memory scaling**: storing per-time-step adjacency matrices for 52 weekly windows × 1M nodes × 10M edges exceeds RAM on standard servers. Use sparse matrix representations and DGL's built-in temporal sampling.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Temporal modelling depth | Excellent | EvolveGCN captures ring topology evolution |
| Explainability | Very Good | Attention weights over time windows |
| Production readiness | Poor | Research code, no tests, no service wrapper |
| Data requirements | High | Multi-year history needed for effective training |
| GPU dependency | Medium | Required for training; inference can be CPU |
| HS fit | ★★★ | Primary reference for temporal-motif detection mode in `src/brain/` |

---

## Recommendation

**Adopt EvolveGCN as Hawkeye Sterling's temporal-motif detection backbone.** Implement as a `TEMPORAL_MOTIF` forensic mode that activates when a screening has multi-year transaction history available. Train on AMLSim temporal data (AMLSim's 720-day simulation is a good fit for 52-week window discretisation). Pre-compute and cache node embeddings nightly; use real-time inference only for novel entities or on-demand deep screening. Add the temporal attention weights to Hawkeye Sterling's STR evidence payload.
