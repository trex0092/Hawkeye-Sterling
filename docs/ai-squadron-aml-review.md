# Code Review: gregorizeidler/AI-squadron-AML

**Repository:** https://github.com/gregorizeidler/AI-squadron-AML  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 1

---

## Summary

AI-squadron-AML implements a coordinated multi-agent AML system in which each agent handles a distinct specialisation: a blockchain monitor agent watches on-chain transactions, a transaction pattern agent applies heuristic and ML-based pattern detectors, and an STR report-filing agent drafts and formats Suspicious Transaction Reports. Agents communicate through a shared message bus and coordinate via a supervisor agent that routes findings between them. For Hawkeye Sterling's `src/brain/`, this is the most directly relevant public reference for multi-agent orchestration across AML sub-tasks — each agent mapping to a Hawkeye Sterling forensic mode.

---

## Architecture

```
Supervisor Agent
  ├── Blockchain Monitor Agent
  │     ├── On-chain transaction polling (Etherscan / RPC node)
  │     ├── Wallet clustering (common-input-ownership heuristic)
  │     └── Mixer / tumbler detection (CoinJoin pattern matching)
  ├── Transaction Pattern Agent
  │     ├── Velocity analysis (txn count + volume per time window)
  │     ├── Structuring detector (amounts just below reporting threshold)
  │     └── Fan-in / fan-out subgraph extraction
  └── STR Report Filing Agent
        ├── Narrative generation (LLM-based)
        ├── FATF typology mapping
        └── Structured STR output (JSON + PDF)
```

The supervisor uses a round-robin routing strategy with escalation: if the pattern agent raises an alert above a confidence threshold, it triggers the STR agent immediately. Agents are implemented as LangChain `AgentExecutor` instances with custom tool lists, not raw LLM calls.

---

## Key Technical Patterns

**1. Agent-per-Specialisation Structure**

Each agent has a constrained tool list matching its domain: the blockchain agent has access to Etherscan API wrappers and wallet-clustering tools; the pattern agent has DuckDB query tools and NetworkX graph tools; the STR agent has a report template tool and a PDF renderer. This hard separation of tools is the right safety pattern — agents cannot access tools outside their domain.

**2. Supervisor Routing with Escalation Threshold**

The supervisor agent holds a confidence threshold (default 0.7). Findings below threshold are logged and discarded; findings above threshold trigger the STR agent. This maps directly to Hawkeye Sterling's tiered alert model (informational → review → file).

**3. Shared State via Message Bus**

Agents communicate through a simple in-memory message bus (a Python `asyncio.Queue`). Each agent publishes findings as typed `AgentMessage` objects with a `payload`, `confidence`, and `agent_id` field. This avoids tight coupling between agents and makes it straightforward to add a new agent (e.g., a sanctions-screening agent) without modifying existing agents.

**4. STR Narrative via LLM**

The STR filing agent passes the structured findings from the pattern agent to an LLM with a carefully engineered prompt that maps detected patterns to FATF typology codes and produces GOAML-compatible narrative text. The prompt includes few-shot examples of real STR narratives (anonymised), which noticeably improves output quality over zero-shot.

---

## What Hawkeye Sterling Can Extract

- **Agent-per-mode pattern**: map each Hawkeye Sterling forensic mode (smurfing, sanctions hit, PEP proximity, structuring) to a dedicated agent with constrained tool access — adopt in `src/brain/`
- **Escalation threshold logic**: the `confidence >= threshold → escalate` routing is a direct template for Hawkeye Sterling's alert-tier assignment
- **Blockchain agent tool list**: the Etherscan + wallet clustering tools are directly reusable for Hawkeye Sterling's crypto screening mode
- **STR narrative prompt**: the few-shot LLM STR generation prompt is a strong starting point for Hawkeye Sterling's report generation module
- **Message bus pattern**: the `asyncio.Queue`-based agent communication pattern is clean and testable; replace with Redis Streams for production durability

---

## Integration Path

**Python microservice.** The multi-agent orchestration is Python-native (LangChain, asyncio). Expose the supervisor agent as a `POST /screen` FastAPI endpoint. Hawkeye Sterling's TypeScript core calls this endpoint and receives a structured result object containing per-agent findings, the combined confidence score, and (if applicable) a draft STR payload. Keep the agent graph in Python; do not attempt to rewrite orchestration logic in TypeScript.

---

## Caveats

- **Stars: 1 / no CI**: experimental code with no tests, no pinned dependencies, and no Docker setup. Treat as a pattern reference.
- **In-memory message bus is not durable**: if the supervisor crashes mid-screening, in-flight agent messages are lost. Replace `asyncio.Queue` with Redis Streams before production use.
- **Blockchain agent is Ethereum-only**: the on-chain monitor targets Ethereum via Etherscan. Hawkeye Sterling's crypto screening will need adapters for Bitcoin (BlockCypher/Chainalysis) and Tron/Polygon if those are in scope.
- **No rate limiting on external API calls**: the Etherscan tool wrappers do not implement backoff. Under sustained load, this will hit Etherscan's 5 req/s free-tier limit and fail silently.
- **LLM prompt is not validated**: the STR narrative prompt produces plausible-sounding text but is not validated against actual GOAML schema requirements. Legal review is required before using generated narratives in real STR filings.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Multi-agent architecture | Very Good | Clean agent separation, escalation routing |
| Blockchain coverage | Fair | Ethereum only, no Bitcoin or stablecoin support |
| STR generation | Good | Few-shot LLM prompt is a strong starting point |
| Durability | Poor | In-memory message bus, no crash recovery |
| HS fit | ★★★ | Primary reference for multi-agent orchestration in `src/brain/` |

---

## Recommendation

**Adopt the agent-per-specialisation pattern in `src/brain/`.** The supervisor + constrained-tool-list architecture is the right model for Hawkeye Sterling's multi-mode forensic pipeline. Do not use the code as-is — harden it with Redis Streams, pinned deps, Pydantic validation, and a proper test suite. The STR narrative prompt is valuable: evaluate its output against GOAML schema requirements and iterate before using in production STR filings.
