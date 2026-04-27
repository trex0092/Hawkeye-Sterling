# Code Review: AkshatJha0411/Graph-Based-AML-Detection

**Repository:** https://github.com/AkshatJha0411/Graph-Based-AML-Detection  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 1

---

## Summary

Graph-Based-AML-Detection is a forensic GNN system targeting structuring and smurfing detection at scale (5M+ transactions), with a focus on explainable AI (XAI) tools to map complete "Mastermind" ring topologies — identifying not just mule accounts but the controlling entity orchestrating the ring. The system combines a Graph Attention Network (GAT) for node-level fraud scoring with SHAP-based feature attribution and subgraph visualisation to produce human-interpretable ring topology maps. For Hawkeye Sterling's `src/brain/`, this is the primary reference for structuring and smurfing ring topology detection with built-in explainability — a regulatory requirement for STR filing.

---

## Architecture

```
Transaction graph (5M+ transactions as directed edges)
  ↓
Graph construction
  ├── Account nodes: features [balance, age, txn_count, avg_amount, velocity_7d]
  ├── Transaction edges: features [amount, timestamp, channel, counterparty_jurisdiction]
  └── Structuring signal edges: pre-computed "threshold proximity" edge weights
        (1 - |amount - reporting_threshold| / reporting_threshold)
  ↓
Graph Attention Network (GAT)
  ├── Multi-head attention (8 heads) over transaction neighbourhood
  ├── 3 message-passing layers (captures up to 3-hop ring membership)
  └── Node-level fraud probability output
  ↓
Ring topology extraction
  ├── Threshold: flag nodes with GAT score ≥ 0.75
  ├── Connected component extraction on flagged subgraph
  ├── Centrality analysis: identify "Mastermind" node (highest betweenness centrality)
  └── Ring topology map: {mastermind, mule_accounts, transaction_flows, amounts}
  ↓
XAI layer
  ├── SHAP TreeExplainer on GAT node embeddings → feature importance per node
  ├── GNNExplainer subgraph → critical edges for each flagged node
  └── Visualisation: NetworkX ring topology plot with amount annotations
```

---

## Key Technical Patterns

**1. Structuring Signal as an Edge Weight**

The pre-computed "threshold proximity" edge weight (`1 - |amount - 10000| / 10000` for USD CTR threshold) encodes structuring signal directly into the graph structure. Edges where amounts are close to the reporting threshold get higher weights, biasing GAT attention toward structuring-relevant transactions. This is a clever way to inject domain knowledge into the GNN without hard-coding rules.

**2. Mastermind Identification via Betweenness Centrality**

After the GAT flags a suspicious connected component, betweenness centrality is computed on the flagged subgraph. The node with the highest betweenness centrality is designated the "Mastermind" — the account through which all ring traffic flows. This is the correct graph-theoretic approach: the Mastermind is the hub that bridges mule sub-groups, maximising its betweenness. Hawkeye Sterling should adopt this as the standard ring controller identification method.

**3. SHAP on GAT Embeddings**

SHAP (SHapley Additive exPlanations) is applied to the GAT's final node embeddings (not the raw input features) to attribute fraud probability to individual input features. The top SHAP features for a flagged account might be: high `velocity_7d`, low `avg_amount` (structuring amounts), and high `counterparty_entropy`. These SHAP values are directly usable as evidence in Hawkeye Sterling's STR narrative.

**4. Scalability at 5M+ Transactions**

The repo uses neighbour sampling (GraphSAGE-style mini-batch training) and sparse adjacency representation to handle 5M+ transaction edges. Full-graph GAT would be infeasible at this scale; the sampling approach maintains tractability while capturing the 3-hop ring structure needed for smurfing detection.

---

## What Hawkeye Sterling Can Extract

- **Threshold-proximity edge weight**: encode structuring signal directly into the transaction graph edge weights in Hawkeye Sterling's ingestion layer — this is a domain-specific graph feature with strong predictive power
- **Betweenness centrality for Mastermind detection**: adopt as a post-classification analysis step in Hawkeye Sterling's ring detection mode — identify the controlling node in every flagged connected component
- **SHAP on node embeddings**: use as the explainability layer for Hawkeye Sterling's GAT-based scoring; SHAP feature importances map directly to STR evidence narratives
- **Ring topology visualisation**: the NetworkX ring topology plot with amount annotations is directly adaptable to `web/components/RingTopologyView.tsx` for the case management UI
- **GAT with 3-hop message passing**: the 3-layer, 8-head GAT architecture is appropriate for smurfing rings (typically 2–4 hops deep) — adopt as Hawkeye Sterling's structuring/smurfing GNN

---

## Integration Path

**Python microservice.** The GAT (PyTorch Geometric), SHAP, and GNNExplainer are all Python-native. Expose two endpoints via FastAPI:
- `POST /score-ring`: accepts a transaction subgraph, returns GAT scores + SHAP attributions + Mastermind identification
- `GET /topology/{ring_id}`: returns the ring topology map (nodes, edges, amounts, centrality scores) for visualisation

Hawkeye Sterling's TypeScript `src/brain/` calls `/score-ring` during forensic analysis and passes the topology map to the `web/` layer for the case management UI. The ring topology is also serialised into the STR evidence payload.

---

## Caveats

- **Stars: 1 / PoC quality**: single-contributor repo with no tests, no CI, and minimal documentation. Architecture is sound; code quality requires hardening before production use.
- **USD CTR threshold hardcoded**: the structuring threshold proximity calculation hardcodes $10,000 (USD CTR). Hawkeye Sterling needs to parameterise this per jurisdiction (€15,000 EU, CHF 15,000 Switzerland, AED 40,000 UAE, etc.) — the threshold proximity logic is correct but must be configurable.
- **Betweenness centrality is O(V·E)**: computing betweenness centrality on large flagged subgraphs can be slow. For rings with >1,000 nodes, use approximate betweenness (NetworkX `betweenness_centrality` with `k` parameter) or restrict to ego-networks of high-degree nodes.
- **SHAP on embeddings, not raw features**: SHAP is applied to the post-embedding representation, not the original transaction features. This means SHAP values are attributions over learned embedding dimensions, not directly interpretable business features. Consider supplementing with LIME on the original feature space for regulatory explainability.
- **No multi-currency normalisation**: the amount-based features (avg_amount, threshold proximity) are not normalised across currencies. Hawkeye Sterling must convert all amounts to a base currency before computing these features.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Structuring detection | Very Good | Threshold proximity edge weight is a strong innovation |
| Mastermind identification | Excellent | Betweenness centrality is the correct approach |
| Explainability | Very Good | SHAP + GNNExplainer provides STR-usable evidence |
| Scale | Good | Mini-batch sampling handles 5M+ transactions |
| Production readiness | Poor | PoC quality; no tests, no multi-currency support |
| HS fit | ★★★ | Key reference for structuring/smurfing topology detection in `src/brain/` |

---

## Recommendation

**Adopt the GAT + betweenness centrality + SHAP pipeline as Hawkeye Sterling's structuring and smurfing ring detection mode.** The threshold-proximity edge weight and Mastermind identification are novel contributions that Hawkeye Sterling should incorporate. Parameterise the structuring threshold per jurisdiction, add multi-currency normalisation, and replace hardcoded thresholds with configurable constants. The ring topology output (Mastermind + mule accounts + transaction flows) is the ideal input for Hawkeye Sterling's STR narrative generator and case management UI.
