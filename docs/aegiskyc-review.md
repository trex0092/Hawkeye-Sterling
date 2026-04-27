# Code Review: ishansurdi/AegisKYC

**Repository:** https://github.com/ishansurdi/AegisKYC  
**Stars:** 11 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

AegisKYC is an end-to-end AI KYC platform that integrates adaptive risk scoring, document OCR, deepfake detection, and cryptographic credential issuance into a single pipeline. The system is designed to reduce manual KYC verification to 8–12 minutes per customer. It combines open-source ML components (OCR, face analysis) with a rules-based adaptive risk engine and issues verifiable credentials (W3C VC standard) upon successful verification.

For Hawkeye Sterling, AegisKYC is the **full end-to-end KYC pipeline reference implementation** in `src/integrations` — the most architecturally complete open-source KYC system reviewed, providing a blueprint for the entire identity verification flow from document submission to risk score to credential issuance.

**License:** MIT — fully permissive.

---

## What the Tool Does

```
Customer submission: document images + selfie
    ↓
AegisKYC Pipeline
    ├── Document OCR
    │       Tesseract + custom pre-processing
    │       Fields: name, DOB, document number, address, expiry
    ├── Deepfake Detection
    │       CNN-based artifact classifier
    │       Detects: GAN images, face swaps, screen replay
    ├── Face Liveness + Matching
    │       Liveness: passive texture analysis
    │       Match: FaceNet cosine similarity
    ├── Adaptive Risk Scoring
    │       Weighted rule engine:
    │           document_score + liveness_score + face_match_score
    │           + data_consistency_score + watchlist_check_score
    │       Output: LOW / MEDIUM / HIGH / REJECT
    └── Verifiable Credential Issuance
            W3C VC standard (JSON-LD)
            Signed with institution DID
            Contains: identity claims, verification timestamp, risk tier
    ↓
Output: risk tier + W3C Verifiable Credential (or rejection with reason)
```

**Adaptive risk engine (Python, illustrative):**
```python
class AdaptiveRiskEngine:
    def score(self, verification_result: VerificationResult) -> RiskTier:
        weights = {
            'document':      0.30,
            'face_match':    0.25,
            'liveness':      0.20,
            'consistency':   0.15,
            'watchlist':     0.10,
        }
        composite = sum(
            weights[k] * getattr(verification_result, k + '_score')
            for k in weights
        )
        return RiskTier.from_score(composite)
```

---

## Strengths

### 1. Adaptive Risk Scoring Architecture

The weighted composite scoring model is directly applicable to Hawkeye Sterling's risk aggregation in `src/brain`. The pattern of combining multiple verification signal scores into a single risk tier with configurable weights is the correct approach for a regulatory-grade KYC system — it allows weight tuning without code changes and provides an audit trail showing how each component contributed to the final decision.

### 2. W3C Verifiable Credential Issuance

Issuing a W3C VC upon successful KYC creates a portable, cryptographically verifiable identity proof. For financial institutions with multiple correspondent relationships, a customer holding a VC from a trusted KYC provider can reuse it — reducing re-verification cost. The HS platform can both issue and accept VCs.

### 3. Deepfake Detection Built In

Unlike the eKYC reference (which relies on active liveness only), AegisKYC includes a deepfake classifier as a separate component in the pipeline. This is the correct architecture: liveness and deepfake detection address different attack vectors and should not be conflated.

### 4. Data Consistency Check

The consistency check (name on document matches name declared, DOB on document matches declared DOB, address consistency) catches application fraud where genuine identity documents are submitted with mismatched supporting information. This is a pattern often seen in synthetic identity fraud.

---

## Issues and Concerns

### 1. OCR Based on Tesseract — Lower Accuracy on Non-Latin Scripts

**Severity: Medium**

Tesseract is a general-purpose OCR engine. For AML-relevant jurisdictions with non-Latin scripts (Arabic, Chinese, Cyrillic), Tesseract's accuracy degrades significantly compared to specialised engines. Identity documents from high-risk jurisdictions (Russia, China, Middle East) are disproportionately common in AML investigation.

**Recommendation:** Replace Tesseract with the KBY-AI IDCardRecognition service (see separate review) for document OCR in the Hawkeye Sterling integration. Keep AegisKYC's risk scoring and credential issuance layers.

### 2. 8–12 Minute Claim Requires Validation

**Severity: Low**

The 8–12 minute verification claim is a headline figure that appears to include human review steps. The automated pipeline component alone is likely sub-30 seconds for a simple case. Clarify the benchmark conditions.

### 3. Small Community — Limited Testing Evidence

**Severity: Low**

11 stars and a small contributor base means the codebase has not been stress-tested against adversarial inputs (deliberately corrupted documents, FGSM adversarial images). The deepfake classifier in particular should be tested against current SOTA deepfake generators (Stable Diffusion face inpainting, FaceSwap, DeepFaceLab).

**Recommendation:** Maintain an adversarial test suite in `tests/kyc_adversarial/` covering known deepfake types, document tampering scenarios, and OCR edge cases before production deployment.

---

## Integration Architecture for Hawkeye Sterling

```
KYC onboarding submission
    ↓
src/integrations/aegiskyc_client.ts (TypeScript REST client)
    ├── POST /verify  { document, selfie }
    │       → AegisKYC FastAPI service (Python microservice)
    ├── Replace: document OCR → KBY-AI IDCardRecognition
    ├── Keep:    deepfake detection, liveness, risk scoring, VC issuance
    └── Response: { risk_tier, credential: W3C_VC, rejection_reason? }
    ↓
src/brain/onboarding_risk_mode.ts
    ├── risk_tier = REJECT → deny onboarding, log reason
    ├── risk_tier = HIGH → flag for enhanced due diligence
    ├── risk_tier = MEDIUM → standard onboarding + monitoring
    └── risk_tier = LOW → streamlined onboarding
    ↓
Customer record: store W3C VC as portable identity proof
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Pipeline completeness | Excellent | OCR + deepfake + liveness + risk score + VC issuance |
| Risk scoring architecture | Excellent | Weighted composite, configurable, auditable |
| Verifiable credentials | Excellent | W3C VC standard, portable, cryptographically signed |
| Deepfake detection | Good | Separate from liveness — correct architecture |
| OCR accuracy | Caution | Tesseract — weak on non-Latin scripts |
| Community maturity | Low | 11 stars, adversarial testing needed |
| Licensing | Excellent | MIT |
| HS fit | ★★★ | Full KYC pipeline blueprint; swap OCR for KBY-AI |

---

## Recommendation

**Use as the primary KYC pipeline reference and partial implementation.** Adopt the adaptive risk scoring engine and W3C VC issuance layer directly. Replace the Tesseract OCR component with KBY-AI IDCardRecognition for production-grade document coverage. Build an adversarial test suite before deployment. The risk scoring architecture is the highest-value component for Hawkeye Sterling's `src/brain` design.
