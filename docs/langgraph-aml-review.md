# Code Review: subrata-samanta/Langgraph_AML_Detection

**Repository:** https://github.com/subrata-samanta/Langgraph_AML_Detection  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 9

---

## Summary

Langgraph_AML_Detection is a multi-step agentic AML pipeline built on LangGraph, LangChain, and a local LLM backend. It demonstrates how to decompose AML analysis into discrete, composable graph nodes — data ingestion, pattern matching, entity flagging, and report generation — wired together as a directed acyclic state machine. For Hawkeye Sterling, this is the closest public reference for the agentic reasoning architecture in `src/brain/`: it shows exactly how to structure LangGraph nodes as a reusable AML pipeline with typed state passed between steps.

---

## Architecture

```
LangGraph StateGraph
  ├── ingest_node        ← Loads transaction CSV / JSON into typed state
  ├── graph_build_node   ← Constructs NetworkX entity-relationship graph
  ├── pattern_match_node ← Runs heuristic rules (fan-in, fan-out, cycle)
  ├── entity_flag_node   ← Tags suspicious entities with risk scores
  ├── llm_reason_node    ← Passes flagged subgraph to LLM for narrative
  └── report_node        ← Emits structured alert JSON + STR draft
```

State is a typed `TypedDict` passed through every node; each node receives the full state, mutates its slice, and returns. Conditional edges route execution based on whether entities were flagged, enabling short-circuit paths for clean transactions.

---

## Key Technical Patterns

**1. Typed State as the AML Context Object**

The pipeline's central innovation is using LangGraph's `TypedDict` state as a running AML context — it carries raw transactions, constructed graph, flagged entities, LLM reasoning chain, and final alert together. This eliminates callback hell and makes each node independently testable.

**2. Conditional Edge Routing**

Pattern-matching nodes emit a `suspicious: bool` field on the state. LangGraph conditional edges branch to the LLM reasoning node only when suspicious is true, skipping expensive inference for clean paths. This maps directly to Hawkeye Sterling's need for tiered evaluation (fast-path vs. deep-reasoning).

**3. Graph-Based Pattern Matching**

The `pattern_match_node` builds a NetworkX DiGraph from the transaction log, then applies cycle detection (`nx.simple_cycles`), degree centrality analysis, and temporal proximity checks. Suspicious subgraphs are extracted as induced subgraphs and serialised into the state for the LLM node.

**4. Streaming Node Output**

Each node uses LangChain's `.stream()` callback, so intermediate reasoning steps are visible in real time — useful for operator dashboards.

---

## What Hawkeye Sterling Can Extract

- **Node wiring pattern**: the `StateGraph` + `TypedDict` approach is a direct blueprint for wiring `src/brain/` reasoning modes as composable LangGraph nodes
- **Conditional routing**: the `suspicious` flag pattern maps to Hawkeye Sterling's tiered pipeline (heuristic pre-filter → GNN → LLM)
- **Graph extraction helper**: the `graph_build_node` logic (building a DiGraph from a transaction list) is reusable in `src/ingestion/`
- **State schema**: the typed state structure is a template for Hawkeye Sterling's `ScreeningContext` object

---

## Integration Path

**Python microservice.** The LangGraph runtime and NetworkX are Python-native. Wrap the pipeline as a FastAPI endpoint that accepts a `ScreeningRequest` payload and returns a structured `AlertResult`. Hawkeye Sterling's TypeScript core calls this service via REST. Keep the LangGraph orchestrator in Python and the API contract thin (JSON in/out).

---

## Caveats

- **Stars: 9 / no CI**: the repo is a proof-of-concept with no tests, no requirements.txt pinning, and no Docker setup. Treat as a pattern reference, not production code.
- **LLM backend is local Ollama**: the repo targets Ollama with Mistral or LLaMA3. Hawkeye Sterling will need to swap this for the Anthropic Claude API — straightforward via LangChain's `ChatAnthropic` adapter.
- **No persistence**: state is in-memory only; there is no checkpoint or resume capability. For Hawkeye Sterling's multi-step screenings, add LangGraph's `SqliteSaver` or `PostgresSaver` checkpointer.
- **Small-scale only**: tested on toy datasets of a few hundred transactions. Graph operations are not optimised for the millions-of-transactions scale Hawkeye Sterling targets.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Architecture clarity | Excellent | Clean node/edge/state separation |
| Production readiness | Poor | PoC only, no tests, no pinned deps |
| Pattern relevance | Excellent | Direct blueprint for `src/brain/` LangGraph wiring |
| Scale | Poor | Not tested beyond toy data |
| HS fit | ★★★ | Must-read for agentic pipeline architecture |

---

## Recommendation

**Use as design reference for `src/brain/` node architecture.** Port the `StateGraph` wiring pattern, the `TypedDict` state schema, and the conditional routing logic into Hawkeye Sterling's Python microservice. Do not copy the code directly — adapt it with production concerns: pinned deps, Anthropic backend, PostgreSQL checkpointer, and proper test coverage. The pattern-matching heuristics in `pattern_match_node` are a useful starting point but should be replaced by Hawkeye Sterling's GNN-based modes for production accuracy.
