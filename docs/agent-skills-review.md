# Code Review: Deep-Identity-Inc/agent-skills

**Repository:** https://github.com/Deep-Identity-Inc/agent-skills  
**Stars:** 2 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

An MCP (Model Context Protocol) server exposing identity verification and AML screening capabilities as Claude agent skills. The server wraps the DeepIDV commercial API, providing Claude Code and Claude agent workflows with native tools for face liveness detection, ID document verification, deepfake detection, and AML name screening — without the agent needing to implement HTTP clients or parse API responses directly. The skills are registered as MCP tools and can be invoked by Claude in agentic reasoning chains.

For Hawkeye Sterling, this is the **MCP identity verification skill for Claude agents** in `src/integrations`: it enables Claude-native agentic pipelines (investigation agents, onboarding agents) to call identity verification and AML screening functions as first-class tool calls within their reasoning chain.

**License:** MIT — fully permissive. Note: the underlying DeepIDV API is a commercial service.

---

## What the Tool Does

```
Claude agent (MCP client)
    ↓ tool calls via MCP protocol
agent-skills MCP server (Node.js / Python)
    ├── Tool: verify_face_liveness
    │       Input: { image_base64 }
    │       Output: { is_live: bool, score: float, deepfake_detected: bool }
    ├── Tool: verify_id_document
    │       Input: { document_image_base64, document_type? }
    │       Output: { name, dob, doc_number, expiry, mrz_valid: bool }
    ├── Tool: match_faces
    │       Input: { face1_base64, face2_base64 }
    │       Output: { match: bool, similarity: float }
    └── Tool: screen_aml
            Input: { name, dob?, nationality?, entity_type }
            Output: { sanctions_hit: bool, pep_hit: bool,
                      adverse_media_hit: bool, matches: [...] }
    ↓ (DeepIDV API backend)
```

**MCP server registration:**
```json
{
  "mcpServers": {
    "deep-identity": {
      "command": "npx",
      "args": ["-y", "@deep-identity/agent-skills"],
      "env": {
        "DEEPIDV_API_KEY": "${DEEPIDV_API_KEY}"
      }
    }
  }
}
```

**Claude agent usage (natural language):**
```
Agent: "Verify the identity document in the uploaded file and screen 
       the extracted name against AML databases"
    → verify_id_document({ document_image_base64: "..." })
    → screen_aml({ name: "Jane Smith", nationality: "GB", entity_type: "individual" })
```

---

## Strengths

### 1. Native MCP Integration — Zero HTTP Client Code

MCP tools are first-class capabilities in Claude Code and Claude agent workflows. An HS investigation agent can call `verify_id_document` and `screen_aml` directly in its reasoning chain without any custom TypeScript HTTP client. This dramatically reduces integration friction for agent-native workflows.

### 2. AML Screening Tool Available to Agents

The `screen_aml` tool exposes AML name screening (sanctions + PEP + adverse media) as an agent-callable function. This enables autonomous investigation agents that can, mid-reasoning, verify whether a name extracted from a document or news article has AML relevance — without needing a human to trigger a separate query.

### 3. Deepfake Detection Exposed as Agent Tool

The `verify_face_liveness` tool includes deepfake detection in its output. An agent handling a customer onboarding document can proactively check for deepfakes as part of its verification reasoning, without the capability needing to be hardcoded into the onboarding pipeline.

### 4. Composability with Other MCP Tools

MCP tools compose naturally — an agent can call `verify_id_document`, then immediately call `screen_aml` on the extracted name, then call `web_search` (if available) to find adverse media, all within a single agentic reasoning chain. This is the correct architecture for autonomous due diligence agents.

---

## Issues and Concerns

### 1. DeepIDV API — Proprietary Service, 2 Stars

**Severity: High**

The MCP skills are a wrapper around the DeepIDV commercial API. The GitHub repository itself has 2 stars, indicating it is very new or lightly adopted. The critical questions are: (1) what is DeepIDV's data handling policy for the identity documents and AML queries sent to their API? (2) What are the SLA and uptime guarantees?

**Recommendation:** Review DeepIDV's data processing agreement before any production use. Identity documents and AML query data are sensitive; third-party processing requires DPA compliance (GDPR, CCPA). Consider whether HS should instead wrap its own internal AML engine as an MCP server.

### 2. Hawkeye Sterling Should Be Its Own MCP Server

**Severity: Medium**

The highest-value architectural insight from this repository is not the DeepIDV integration itself — it is the pattern of exposing AML capabilities as MCP tools. Hawkeye Sterling should implement its own MCP server wrapping its core screening capabilities, so that Claude agents (internal investigation agents, onboarding agents) can call HS's own sanctions screening, risk scoring, and entity resolution as MCP tools.

**Recommendation:** Create `src/integrations/mcp_server.ts` exposing HS capabilities as MCP tools: `screen_sanctions`, `screen_pep`, `get_entity_risk_score`, `run_benford_analysis`, `verify_document`. This is a higher-priority integration than the DeepIDV dependency.

### 3. No Error Handling Patterns Shown

**Severity: Low**

MCP tool calls in agentic chains need robust error handling — partial failures (API timeout, invalid image format) should degrade gracefully and be communicated back to the agent in structured form. The repository does not demonstrate error handling patterns for failed API calls.

---

## Integration Architecture for Hawkeye Sterling

```
Option A: Use agent-skills for DeepIDV (external dependency)
    Claude investigation agent
        → screen_aml({ name }) → DeepIDV API
    Risk: data residency, DPA compliance required

Option B (Recommended): Build HS as its own MCP server
    src/integrations/mcp_server.ts
        ├── Tool: screen_sanctions({ name, dob, nationality })
        ├── Tool: screen_pep({ name, entity_type })
        ├── Tool: get_entity_risk_score({ entity_id })
        ├── Tool: run_benford_analysis({ transaction_data })
        └── Tool: verify_document({ document_image })
    Claude investigation agent
        → screen_sanctions({ name: "Jane Smith", nationality: "RU" })
        → get_entity_risk_score({ entity_id: "cust_12345" })
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| MCP integration pattern | Excellent | First-class Claude agent tool use |
| AML tool exposure | Good | screen_aml + deepfake detection as agent tools |
| DeepIDV dependency | Caution | Proprietary API, DPA compliance required |
| Community maturity | Poor | 2 stars, very early stage |
| Licensing | Excellent | MIT (wrapper); DeepIDV commercial for backend |
| HS fit | ★★★ | Pattern: build HS as MCP server; use DeepIDV with DPA |

---

## Recommendation

**Adopt the MCP server pattern, not the DeepIDV dependency.** Use this repository as the reference architecture for building Hawkeye Sterling's own MCP server in `src/integrations/mcp_server.ts`. Expose HS's core screening capabilities as MCP tools so that Claude agents can call them natively. If DeepIDV's data processing agreement is acceptable, use the agent-skills package in proof-of-concept mode; replace with HS-native tools in production.
