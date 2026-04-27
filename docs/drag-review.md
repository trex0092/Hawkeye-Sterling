# Code Review: bdi-lab/DRAG

**Repository:** https://github.com/bdi-lab/DRAG  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 27

---

## Summary

DRAG (Dynamic Relation-Attentive Graph neural network) is the official implementation of the ICDMW 2023 paper "DRAG: Dynamic Relation-Attentive Graph Neural Networks for Fraud Detection". It extends standard GNNs to handle dynamic (temporally evolving) relationship types — not just changing graph topology, but changing relationship semantics over time. For example, two accounts may shift from a `NORMAL_PAYMENT` relationship to a `STRUCTURING` relationship as their interaction pattern changes. DRAG models this relationship-type evolution with a relation-type attention mechanism, making it particularly relevant for Hawkeye Sterling's `src/brain/` temporal-graph modes where relationship semantics evolve as part of the laundering typology.

---

## Architecture

```
Input: temporal transaction graph with typed, time-stamped edges
  ↓
Relation Type Encoder
  ├── Each edge assigned a relation type embedding (e.g., P2P, WIRE, BATCH, ATM)
  ├── Relation type embedding is updated per time step (not static)
  └── Captures: how the "meaning" of a relationship changes as pattern evolves
  ↓
Dynamic Relation-Attentive Aggregation
  ├── Per-node, per-time-step: attend over all neighbour (edge_type, time_step) pairs
  ├── Attention weight = f(node_feature, neighbour_feature, relation_embedding, Δt)
  └── High attention → this (neighbour, relation_type, time) triplet is anomalous
  ↓
Node classification head
  ├── Fraud probability per node per time step
  └── Attention attribution: which (neighbour, relation_type, time) drove the score?
```

The key distinction from EvolveGCN (DynamicSocialNetworkFraudDetection): DRAG evolves both the graph topology *and* the relation type representations simultaneously, capturing cases where the same two entities change what they are doing to each other over time.

---

## Key Technical Patterns

**1. Relation-Type Attention as Explainability**

DRAG's attention weights are three-dimensional: `(node i, neighbour j, relation_type r, time t)`. The highest-attention triplets are the model's explanation for why an entity is flagged — e.g., "account X was flagged because its interaction with account Y via WIRE_TRANSFER at t=14 had anomalously high attention." This is directly usable as Hawkeye Sterling's STR evidence narrative input.

**2. Evolving Relation Type Embeddings**

Relation type embeddings are updated via a GRU cell at each time step. This means the model can learn that a `P2P_PAYMENT` relationship in week 1 has different risk implications than a `P2P_PAYMENT` relationship in week 20, if the broader network context has changed. This is the correct model for detecting structuring that starts as normal behaviour and gradually transitions to threshold-avoidance patterns.

**3. Temporal Sampling for Efficiency**

DRAG uses neighbour sampling at each time step (GraphSAGE-style) rather than full-neighbourhood aggregation. This keeps training and inference tractable on dense financial graphs without sacrificing classification quality significantly. The sampling budget (neighbours per node, time steps per batch) is configurable.

**4. Multi-Relation Dataset Benchmarks**

The repo includes evaluation on the OTC and Amazon benchmark fraud datasets, which have multiple relation types (similar to AML's multi-channel transaction types). Performance metrics are reported with standard deviations across 10 runs — methodologically sound for a published academic result.

---

## What Hawkeye Sterling Can Extract

- **Relation-type attention for STR evidence**: the three-dimensional attention attribution `(neighbour, relation_type, time)` is a ready-made explanation format for Hawkeye Sterling's STR narrative generation — "alert driven by unusual WIRE_TRANSFER activity with entity X in the period Y–Z"
- **Evolving relation embeddings**: adopt for Hawkeye Sterling's `RELATIONSHIP_EVOLUTION` forensic mode — detects when entities shift from normal to structuring relationship patterns over time
- **Temporal sampling budget configuration**: the configurable sampling budget is a production-necessary optimisation — limit to 20 neighbours × 12 time steps for real-time inference
- **Multi-relation schema mapping**: DRAG's relation type taxonomy maps cleanly to Hawkeye Sterling's transaction channel taxonomy (WIRE, ACH, SWIFT, CRYPTO, CASH_DEPOSIT) — define Hawkeye Sterling's relation types as the DRAG edge type vocabulary
- **ICDMW 2023 citation**: the paper provides academic grounding for Hawkeye Sterling's model card and regulatory model risk management documentation

---

## Integration Path

**Python microservice.** DRAG is implemented in PyTorch + PyTorch Geometric. Serve as a FastAPI inference endpoint. The inference input is a subgraph JSON (entity + typed, timestamped neighbourhood edges); the output is `{ fraud_probability, attention_triplets: [{neighbour, relation_type, time, weight}] }`. Hawkeye Sterling's TypeScript core passes the attention triplets directly to the STR narrative generator.

Training is offline on AMLSim data augmented with manually labelled relation types (map AMLSim transaction types to DRAG relation type vocabulary before training).

---

## Caveats

- **Stars: 27 / research code**: ICDMW 2023 workshop paper implementation. Well-written for academic code but not production-hardened. No deployment documentation.
- **PyG version sensitivity**: PyTorch Geometric has breaking API changes between versions. The repo targets a specific PyG version — pin exactly and test on upgrade.
- **Relation type vocabulary must be pre-defined**: DRAG requires a fixed, pre-defined set of relation types. Hawkeye Sterling must define its transaction channel taxonomy (the "relation type vocabulary") before training — this is a design decision that affects model behaviour and cannot be changed without retraining.
- **Multi-year data required**: like other temporal GNNs, DRAG requires sufficient temporal history to learn meaningful relation-type evolution patterns. At minimum 6–12 months of labelled data.
- **No online learning**: DRAG is a batch-trained model. New relation types or structural drifts require full retraining, not incremental updates. Plan for quarterly model refresh cycles.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Relation-type temporal modelling | Excellent | Key differentiator: relation semantics evolve, not just topology |
| Explainability | Excellent | 3D attention attribution is directly STR-usable |
| Production readiness | Fair | Research implementation; needs service wrapper and tests |
| Academic grounding | Excellent | Peer-reviewed ICDMW 2023 |
| Data requirements | High | Labelled multi-year transaction history with relation types |
| HS fit | ★★★ | Best-in-class temporal-graph model for evolving AML relationships |

---

## Recommendation

**Adopt DRAG as Hawkeye Sterling's preferred temporal-graph model for the `RELATIONSHIP_EVOLUTION` forensic mode.** The 3D attention attribution is uniquely valuable for STR narrative generation — it provides interpretable, time-stamped evidence that satisfies regulatory explainability requirements. Define the Hawkeye Sterling transaction channel taxonomy as the DRAG relation type vocabulary, train on AMLSim + real data, and expose the attention triplets in the alert payload. This is the strongest academically grounded model in this review catalogue.
