# Code Review: luuisotorres/AML-MultiAgent-RAG

**Repository:** https://github.com/luuisotorres/AML-MultiAgent-RAG  
**Stars:** 14 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

AML-MultiAgent-RAG is a multi-agent Retrieval-Augmented Generation (RAG) platform for answering AML/CFT compliance questions. It indexes 7 regulatory documents (USA PATRIOT Act, EU AML Directives 5th/6th, Brazil BCB circulars) into a Qdrant vector database, and routes queries through four coordinated agents — RAG, Confidence, Consistency, and Orchestrator — to produce source-cited answers with validated confidence scores. Built on GPT-4o + LangChain + LlamaIndex + FastAPI.

For Hawkeye Sterling, this is the **compliance Q&A faculty**: an analyst can ask "what is the EDD threshold for PEPs under EU 5AMLD?" and receive a source-cited answer extracted directly from the directive, with a confidence score and consistency validation.

**License:** MIT — fully permissive.

---

## Architecture

```
Regulatory Documents (7 PDFs, 3 jurisdictions)
    ↓ PyMuPDF extraction → LangChain chunking → OpenAI embeddings
Qdrant Vector Database
    (collection: aml-documents, 1536-dim vectors)
    ↓
Query → POST /api/v1/query or /api/v1/multi-agent/query
    ↓
MultiAgentOrchestrator
    ├── RAG Agent (AMLRagAgent)
    │   ├── Language detection (EN/PT)
    │   ├── Semantic search → top-K chunks retrieved
    │   └── GPT-4o response generation with source citations
    ├── Confidence Agent
    │   ├── Source quality score
    │   ├── Answer quality score
    │   ├── Semantic alignment score
    │   └── Uncertainty adjustment
    │   → Confidence: 0–100%, High/Medium/Low tier
    └── Consistency Agent
        ├── Citation validation
        ├── Jurisdictional coherence
        ├── Contradiction detection
        └── Relevance check
        → consistency score >= 0.6 required to pass quality gate
    ↓
Structured response: answer + citations + confidence + jurisdiction
```

**Two endpoints:**
- `POST /api/v1/query` — Single RAG agent (fast, lower validation overhead)
- `POST /api/v1/multi-agent/query` — Full 4-agent pipeline with quality gates

---

## Document Coverage (7 Sources)

| Jurisdiction | Document |
|-------------|---------|
| USA | PATRIOT Act (Public Law 107-56) |
| USA | Bank Secrecy Act Section 8 |
| EU | 5th AMLD (Directive 2015/849) |
| EU | 6th AMLD (Directive 2018/843) |
| EU | EU AML Package 2021 |
| Brazil | BCB Circular 4001 (AML/CFT) |
| Brazil | BCB Circular 3978 (CDD) |

---

## Strengths

### 1. Multi-Agent Quality Validation — Not Just RAG

Most RAG systems return whatever the LLM generates from the retrieved context. This system adds two validation agents: a Confidence Agent that scores answer quality and source relevance, and a Consistency Agent that checks for jurisdictional coherence and contradictions between the answer and cited documents. The quality gate (consistency ≥ 0.6, confidence ≥ 0.4) prevents low-confidence regulatory interpretations from reaching analysts.

### 2. Source Citation — Audit-Ready Answers

Every answer includes citations to specific regulatory documents and sections. For a compliance officer filing a SAR or responding to a regulatory examination, a source-cited answer is directly usable as evidence. An answer without a citation ("I think the threshold is €15,000") is not.

### 3. Bilingual Support (EN + Portuguese)

The system auto-detects query language and generates responses in the same language. For UAE-based Hawkeye Sterling with international compliance officers, multilingual support matters — Arabic support would be a natural extension.

### 4. Qdrant + LangChain + LlamaIndex Stack

Qdrant is a production-grade vector database with Docker deployment. LangChain and LlamaIndex are the two most widely used RAG orchestration frameworks. This stack is well-tested and has extensive community support and documentation.

### 5. FastAPI + Pydantic — Clean REST API

The OpenAPI-compliant FastAPI backend with Pydantic validation is immediately integrable with Hawkeye Sterling's TypeScript frontend. The `/docs` Swagger UI is auto-generated.

---

## Issues and Concerns

### 1. Only 7 Documents — Coverage Is Narrow

**Severity: High for production use**

The current document corpus covers 3 jurisdictions (USA, EU, Brazil). Hawkeye Sterling's primary jurisdiction is UAE. Key missing documents:

- FATF Recommendations and Guidance Notes
- UAE Federal AML Law (Federal Decree-Law No. 20 of 2018)
- UAE CBUAE AML/CFT Standards
- UK Proceeds of Crime Act / MLR 2017
- OFAC Programme-Specific Guidance

**Recommendation:** Extend the document ingestion pipeline with at least 20–30 additional regulatory documents before production use. The PDF processing and embedding pipeline is already built — adding documents is a configuration task.

### 2. GPT-4o Dependency — Data Residency Risk

**Severity: Medium**

Regulatory document text and analyst queries are sent to OpenAI's API (GPT-4o). For a UAE-based deployment, sending compliance document content to US-hosted LLM APIs may violate data residency requirements or create confidentiality concerns.

**Recommendation:** Evaluate replacing GPT-4o with a locally-hosted LLM (Llama 3.1, Mistral, or a UAE-hosted Azure OpenAI endpoint). The LangChain integration makes LLM provider substitution straightforward — only the `openai` client needs replacing.

### 3. Embedding Model Also OpenAI

**Severity: Low–Medium**

`text-embedding-3-small` is also an OpenAI cloud API. The same data residency concern applies to the embedding generation step.

**Recommendation:** Replace with a locally-hosted embedding model (`sentence-transformers/all-mpnet-base-v2` or similar). Local embeddings eliminate the data residency concern at the cost of slightly lower embedding quality.

### 4. Quality Gate Thresholds Are Hardcoded

**Severity: Low**

The orchestrator quality gates (`consistency >= 0.6`, `confidence >= 0.4`) are hardcoded constants. For different regulatory contexts (higher-stakes regulatory examination vs. routine analyst query), different thresholds are appropriate.

**Recommendation:** Expose thresholds as configurable parameters in `pydantic-settings` configuration.

---

## Extension Plan for Hawkeye Sterling

```python
# Additional documents to add for HS deployment:
ADDITIONAL_DOCS = [
    "fatf_recommendations_2023.pdf",
    "fatf_guidance_virtual_assets.pdf",
    "uae_aml_law_20_2018.pdf",
    "cbuae_aml_cft_standards.pdf",
    "uk_mlr_2017.pdf",
    "uk_proceeds_of_crime_act.pdf",
    "ofac_sanctions_programme_guidance.pdf",
    "un_security_council_sanctions_regime_notes.pdf",
    "fatf_risk_based_approach_banking.pdf",
    "egmont_guidance_fiu_cooperation.pdf",
]
```

**Integration with Hawkeye Sterling:**

```typescript
// src/services/compliance_qa.ts
async function askComplianceQuestion(query: string): Promise<ComplianceAnswer> {
  const resp = await fetch(`${AML_RAG_URL}/api/v1/multi-agent/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  const result = await resp.json();
  return {
    answer: result.answer,
    citations: result.citations,        // regulatory articles cited
    confidence: result.confidence_score, // 0–100
    jurisdiction: result.jurisdiction,
  };
}
```

| RAG Component | HS Module | Use |
|--------------|-----------|-----|
| RAG Agent answers | `src/brain/` | Regulatory Q&A for forensic mode reasoning |
| Confidence scores | `web/` | Show analyst answer reliability |
| Source citations | Compliance reports | SAR narrative supporting evidence |
| Consistency validation | `src/brain/` | Prevent hallucinated regulatory claims |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Multi-agent validation | Very Good | Confidence + Consistency agents reduce hallucination risk |
| Source citation | Excellent | Audit-ready with document references |
| Document coverage | Poor (for HS) | 7 docs — needs UAE/FATF/UK expansion |
| LLM dependency | Caution | GPT-4o cloud — data residency concern for UAE |
| Stack quality | Very Good | FastAPI + Qdrant + LangChain — production-grade |
| License | Excellent | MIT |
| HS fit | ★★★ | Compliance Q&A faculty — extend document corpus first |

---

## Recommendation

**Adopt as the compliance Q&A faculty after extending the document corpus.** The multi-agent architecture with confidence and consistency validation is the correct design for regulatory Q&A — it prevents hallucinated regulatory interpretations from reaching compliance officers. The immediate work is: (1) add 20+ UAE/FATF/UK regulatory documents, (2) replace GPT-4o with a UAE-resident LLM for data residency compliance, (3) expose quality gate thresholds as configurable parameters.
