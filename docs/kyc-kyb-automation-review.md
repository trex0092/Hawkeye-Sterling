# Code Review: mocharil/KYC-KYB-Automation

**Repository:** https://github.com/mocharil/KYC-KYB-Automation  
**Stars:** 6 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

A FastAPI service automating both KYC (individual identity verification) and KYB (Know Your Business / business entity verification) using Google Vertex AI for document analysis. Individual KYC covers ID OCR and selfie face comparison. KYB covers business registration documents, articles of incorporation, beneficial ownership declarations, and financial statements — tasks requiring document understanding rather than simple OCR field extraction. This dual KYC/KYB scope is the key differentiator.

For Hawkeye Sterling, this addresses the **KYB automation gap** in `src/integrations`: most KYC tools focus on individuals, but correspondent banking and corporate onboarding require structured extraction from complex business documents (company registration, UBO declarations, corporate structure charts).

**License:** MIT — fully permissive.

---

## What the Tool Does

```
KYC Path (individual):
    Input: ID document + selfie
        ↓ Vertex AI Document AI
        ├── ID OCR: name, DOB, address, document number
        ├── Face comparison (document photo vs selfie)
        └── Output: { identity_verified: bool, match_score: float }

KYB Path (business entity):
    Input: business documents (registration certificate,
           articles of incorporation, UBO declaration,
           financial statements, bank statements)
        ↓ Vertex AI Generative AI (Gemini)
        ├── Document classification (what type is this?)
        ├── Entity extraction:
        │       Company name, registration number, jurisdiction
        │       Directors and officers (names, roles)
        │       Beneficial owners (name, ownership %, nationality)
        │       Registered address, incorporation date
        ├── Cross-document consistency check
        │       Directors in articles match UBO declaration?
        │       Registration number consistent across documents?
        └── Output: { entity_profile: {...}, inconsistencies: [...] }
```

**FastAPI KYB endpoint:**
```python
POST /kyb/verify
Content-Type: multipart/form-data
{
  "company_name": "Acme Corp Ltd",
  "documents": [reg_cert.pdf, articles.pdf, ubo_declaration.pdf]
}

Response:
{
  "entity_profile": {
    "company_name": "ACME CORP LTD",
    "registration_number": "12345678",
    "jurisdiction": "England and Wales",
    "directors": [{"name": "Jane Smith", "role": "Director"}],
    "beneficial_owners": [{"name": "John Doe", "ownership_pct": 75.0}]
  },
  "inconsistencies": [],
  "kyb_passed": true
}
```

---

## Strengths

### 1. KYB Coverage — the Underserved Screening Gap

Individual KYC is well-served by open-source tools. KYB — verifying corporate entities, their ownership structures, and their controlling persons — is poorly served. Correspondent banking and trade finance AML require entity verification at the corporate level, not just individual level. This is the first tool reviewed that directly addresses KYB.

### 2. Vertex AI Gemini for Document Understanding

Simple OCR cannot extract beneficial ownership from an unstructured 40-page articles of incorporation document. Vertex AI Gemini (a large multimodal model) can read and understand complex business documents in any format, extracting structured data from narrative text. This is the correct technical approach for KYB document analysis.

### 3. Cross-Document Consistency Checking

UBO declarations that contradict articles of incorporation, or directors listed in company registration who do not appear in board resolutions, are red flags for deliberate corporate structure obfuscation. The cross-document consistency check directly targets this AML-relevant pattern.

### 4. FastAPI + REST — TypeScript-Friendly Integration

Same pattern as the other services reviewed: a clean REST API callable from `src/integrations/kyb_client.ts` without Python bindings.

---

## Issues and Concerns

### 1. Vertex AI Dependency — Cost and Data Residency

**Severity: Medium**

Vertex AI (Google Cloud) is a paid service with per-token pricing. For KYB document analysis, a 40-page document may involve 50,000+ tokens per processing call. At scale, Vertex AI costs must be budgeted. Additionally, document data (which may contain confidential corporate information) is processed on Google Cloud infrastructure — data residency and confidentiality obligations apply.

**Recommendation:** Assess Vertex AI cost at expected onboarding volumes. For EU-jurisdiction HS deployments, confirm Vertex AI data residency options (EU region). Consider self-hosted LLM alternatives (Ollama + LLaMA 3.1 70B) for sensitive document processing.

### 2. Only 6 Stars — Very Early Stage

**Severity: Medium**

6 stars and limited community contribution means this is likely a portfolio project rather than a production-tested system. Vertex AI Gemini document extraction quality on diverse international business documents (BVI company structures, Cayman fund documents) has not been community-validated.

**Recommendation:** Test against a corpus of 50+ business documents from high-risk jurisdictions before production deployment. Measure extraction accuracy for UBO names and ownership percentages against manually verified ground truth.

### 3. No Sanctions/PEP Screening of Extracted Names

**Severity: High**

The KYB pipeline extracts director and beneficial owner names but does not automatically screen them against sanctions lists or PEP databases. The extracted names are the most valuable output for AML purposes — the pipeline should feed them directly into the screening engine.

**Recommendation:** Add a post-processing step in `src/integrations/kyb_client.ts` that automatically submits all extracted director and UBO names to Hawkeye Sterling's core sanctions/PEP screening engine.

---

## Integration Architecture for Hawkeye Sterling

```
Corporate counterparty onboarding
    ↓
src/integrations/kyb_client.ts
    ├── POST /kyb/verify  { company_name, documents[] }
    │       → KYC-KYB-Automation FastAPI microservice
    ├── Extract: directors[], beneficial_owners[]
    ├── Flag: inconsistencies.length > 0 → DOCUMENT_INCONSISTENCY
    ├── For each director/UBO:
    │       → src/brain/sanctions_screener.ts (name + nationality)
    │       → src/brain/pep_screener.ts
    └── Aggregate: entity_profile → customer record
    ↓
src/brain/corporate_risk_mode.ts
    ├── UBO ownership > 25% but undisclosed → CDD escalation
    ├── UBO nationality in high-risk jurisdiction → EDD
    ├── Director sanctions hit → HOLD onboarding
    └── Corporate structure circular ownership → red flag
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| KYB coverage | Excellent | Unique among reviewed tools — addresses the gap |
| Document understanding | Good | Vertex AI Gemini handles complex unstructured docs |
| Cross-document consistency | Good | Directly AML-relevant for UBO obfuscation |
| Sanctions screening of names | Poor | Not built in — must add in integration layer |
| Vertex AI cost/residency | Caution | Per-token cost; data residency obligations |
| Community maturity | Low | 6 stars, not production-validated |
| Licensing | Excellent | MIT |
| HS fit | ★★★ | KYB automation — critical gap, needs hardening |

---

## Recommendation

**Integrate as the KYB document analysis microservice**, with the mandatory addition of automatic sanctions/PEP screening for all extracted director and UBO names. Assess Vertex AI costs and data residency before deployment. Test extraction accuracy on a corpus of high-risk-jurisdiction business documents. This fills the most significant coverage gap in the current HS integrations portfolio — corporate entity verification is not addressed by any other reviewed tool.
