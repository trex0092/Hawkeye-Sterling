# Code Review: zoharbabin/due-diligence-agents

**Repository:** https://github.com/zoharbabin/due-diligence-agents  
**Stars:** 9 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

A multi-agent M&A due diligence framework where specialised agents (legal, financial, commercial, technical) independently analyse a corpus of contract documents and produce synthesis reports with exact citation cross-referencing back to source documents. Each agent is scoped to its domain, and a coordinator agent aggregates findings with citation chains maintained throughout — enabling traceability of every claim in the final report back to its source document and page.

For Hawkeye Sterling, this is the **agentic due diligence pattern and citation architecture** for `src/brain` — demonstrating how to build multi-agent investigation pipelines where every finding is grounded in source citations, which is the evidentiary standard required for AML investigation reports and SAR documentation.

**License:** MIT — fully permissive.

---

## What the Tool Does

```
Input: document corpus (contracts, financial statements, legal filings)
       + due diligence scope

Coordinator Agent
    ├── Document indexing (RAG: chunk → embed → vector store)
    ├── Dispatch to specialised agents:
    │       ├── Legal Agent
    │       │       Scope: contract terms, liabilities, IP, compliance
    │       │       Output: findings + citations { doc, page, quote }
    │       ├── Financial Agent
    │       │       Scope: revenue, EBITDA, debt, working capital
    │       │       Output: findings + citations
    │       ├── Commercial Agent
    │       │       Scope: market position, customer concentration, competition
    │       │       Output: findings + citations
    │       └── Technical Agent
    │               Scope: tech stack, IP ownership, security posture
    │               Output: findings + citations
    └── Synthesis Agent
            Cross-reference findings across agents
            Detect contradictions (legal vs financial claims)
            Produce final report: findings + citation chain

Output: structured due diligence report
    {
      "finding": "Company X has a $5M contingent liability...",
      "citations": [
        { "document": "Share Purchase Agreement.pdf",
          "page": 47,
          "quote": "...indemnification cap of $5,000,000..." }
      ]
    }
```

**Agent implementation (Claude API):**
```python
legal_agent = DueDiligenceAgent(
    role="legal",
    system_prompt=LEGAL_AGENT_PROMPT,
    tools=[vector_search, citation_extractor],
    model="claude-opus-4-5"
)
finding = legal_agent.analyse(query="What are the termination rights?")
# finding.text + finding.citations[{ doc, page, quote }]
```

---

## Strengths

### 1. Citation-Grounded Findings — AML Investigation Standard

AML investigations and SAR filings require that every factual claim be traceable to a source (a transaction record, a news article, a company filing). A multi-agent investigation system that hallucinates facts without citations is a liability risk. This framework enforces citation grounding at the architecture level — every agent output includes source references, and the synthesis layer verifies citation consistency.

### 2. Multi-Agent Domain Decomposition

The pattern of decomposing a complex analysis task into specialised agents — each with a narrow scope and deep domain prompt — produces higher-quality analysis than a single general-purpose agent with a broad prompt. For AML investigation, this translates to: sanctions agent, adverse media agent, financial forensics agent, corporate structure agent — each specialised, coordinated by a synthesis layer.

### 3. Cross-Agent Contradiction Detection

The synthesis agent flags contradictions between agent findings. In AML context: a company that a financial agent identifies as having consistent revenue across documents, but whose legal agent finds a lawsuit alleging fraudulent financial reporting — the synthesis layer should flag this contradiction rather than presenting both findings without reconciliation. This is directly applicable to complex investigation reports.

### 4. RAG Architecture for Document Corpus

The vector store / RAG (Retrieval Augmented Generation) architecture enables the agents to query a large document corpus at analysis time rather than fitting everything in context. For AML investigations involving hundreds of pages of corporate filings, news articles, and transaction records, RAG is the necessary architecture.

---

## Issues and Concerns

### 1. M&A Document Focus — Needs Adaptation for AML Documents

**Severity: Medium**

The agent prompts and document parsing pipelines are tuned for M&A documents (contracts, financial statements). AML investigations involve different document types: SWIFT messages, bank statements, corporate registry filings, regulatory enforcement actions, court documents. The agent scope definitions and extraction prompts require significant adaptation.

**Recommendation:** Create AML-specialised agent variants: `SanctionsScreeningAgent`, `AdverseMediaAgent`, `CorporateStructureAgent`, `TransactionPatternAgent` — each with AML-specific system prompts, replacing the M&A domain specialisations.

### 2. 9 Stars — Early Community Adoption

**Severity: Low**

The framework is conceptually sound and the architecture is well-designed, but limited community validation means edge cases (very large document corpora, non-English documents, OCR-quality PDFs) have not been stress-tested.

**Recommendation:** Test against a corpus of real AML investigation documents (redacted enforcement actions, public court filings) before production deployment. Focus on citation accuracy — the most critical quality metric for regulatory use.

### 3. Citation Accuracy Depends on RAG Chunk Boundaries

**Severity: Medium**

RAG citation quality is sensitive to document chunking strategy. If a key fact (e.g., a beneficial owner name) spans two chunks, neither chunk may contain enough context to generate a precise citation. Poor chunking produces vague or incorrect citations, which undermines the core value proposition.

**Recommendation:** Use semantic chunking (split at paragraph/section boundaries) rather than fixed-token chunking. Implement citation verification: after the agent produces a citation, programmatically verify that the quoted text appears in the cited document and page.

---

## Integration Architecture for Hawkeye Sterling

```
AML investigation triggered (SAR candidate, complex entity)
    ↓ async investigation job
src/brain/due_diligence_agent_mode.ts
    ├── Collect document corpus:
    │       Company filings, news articles, transaction records,
    │       sanctions designations, court documents
    ├── Build RAG vector store (document chunks + embeddings)
    └── Dispatch multi-agent investigation:
            SanctionsScreeningAgent → OFAC/UN/EU list hits + citations
            AdverseMediaAgent → news hits + citations
            CorporateStructureAgent → UBO, jurisdiction + citations
            TransactionPatternAgent → Benford, velocity, clustering
            ↓
            SynthesisAgent → final investigation report
                { findings[], contradictions[], citations[], risk_tier }
    ↓
src/brain/sar_report_generator.ts
    ├── Use citation-grounded findings as SAR narrative basis
    └── Every claim linked to source document, page, and quote
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Citation architecture | Excellent | Every finding traceable to source — AML standard |
| Multi-agent decomposition | Excellent | Correct approach for complex investigation |
| Contradiction detection | Good | Directly AML-relevant |
| RAG document querying | Good | Necessary for large corpus investigations |
| AML document adaptation | Required | M&A-tuned; prompts need AML rewriting |
| Community maturity | Low | 9 stars; test before production |
| Licensing | Excellent | MIT |
| HS fit | ★★★ | Core agentic investigation pattern for src/brain |

---

## Recommendation

**Adopt the multi-agent citation architecture as the design blueprint for Hawkeye Sterling's investigation agent pipeline.** Port the coordinator/specialist/synthesis agent pattern to AML domain specialisations (`SanctionsScreeningAgent`, `AdverseMediaAgent`, `CorporateStructureAgent`, `TransactionPatternAgent`). Implement citation verification as a programmatic step to ensure claim–source traceability. This is the highest-value pattern from the entire reviewed portfolio for complex AML investigation automation.
