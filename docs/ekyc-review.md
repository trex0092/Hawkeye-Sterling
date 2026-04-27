# Code Review: manhcuong02/eKYC

**Repository:** https://github.com/manhcuong02/eKYC  
**Stars:** 56 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

A complete electronic KYC pipeline implemented in Python with a FastAPI backend. The system handles three core identity verification tasks: document OCR for identity cards and passports (text extraction from MRZ and printed fields), face liveness detection (distinguishing a live person from a photo or screen replay attack), and face matching (comparing a selfie against the document photo). The face pipeline uses FaceNet for embeddings and MTCNN for face detection.

For Hawkeye Sterling, this is a **reference implementation for an identity document verification microservice** in `src/integrations` — covering the full document-to-selfie verification flow that is the entry point for customer onboarding.

**License:** MIT — fully permissive.

---

## What the Tool Does

```
Customer uploads:
    ├── Identity document image (ID card / passport)
    └── Selfie image or short video (liveness)
    ↓
eKYC Pipeline (FastAPI + Python)
    ├── Document OCR
    │       ├── MTCNN: detect document face zone
    │       ├── OpenCV: image preprocessing (deskew, denoise)
    │       └── OCR engine: extract name, DOB, document number, MRZ
    ├── Liveness Detection
    │       ├── Eye blink detection (dlib facial landmarks)
    │       ├── Head movement challenge (active liveness)
    │       └── Texture analysis (passive anti-spoofing)
    └── Face Matching
            ├── MTCNN: detect faces in document + selfie
            ├── FaceNet: 512-d embedding extraction
            └── Cosine similarity threshold (configurable, default 0.7)
    ↓
Output: JSON { ocr_result, liveness_passed, face_match_score, verified }
```

**FastAPI endpoint pattern:**
```python
POST /verify
Content-Type: multipart/form-data
{
  "document": <file>,
  "selfie":   <file>
}

Response:
{
  "name": "NGUYEN VAN A",
  "dob": "1990-01-15",
  "doc_number": "123456789",
  "liveness": true,
  "face_match": 0.91,
  "verified": true
}
```

---

## Strengths

### 1. Full Pipeline in a Single FastAPI Service

The end-to-end flow — document OCR → liveness → face match → verification decision — is implemented in a single deployable service. This is exactly the microservice decomposition Hawkeye Sterling needs: a self-contained identity verification endpoint that `src/integrations` can call with a document and selfie and receive a structured verification result.

### 2. MRZ Parsing

Machine-Readable Zone parsing is the most reliable OCR target on travel documents. MRZ characters are designed for machine reading (OCR-B font, fixed field positions per ICAO Doc 9303). The MRZ parser extracts document number, nationality, DOB, expiry, and check digits, providing a structured data record that is far more reliable than free-text OCR of the biographical data page.

### 3. MTCNN + FaceNet Pipeline Is Proven

MTCNN (Multi-task Cascaded Convolutional Networks) and FaceNet are widely validated, well-documented models. FaceNet achieves 99.63% accuracy on LFW benchmark. The combination is a sound choice for a compliance-adjacent biometric comparison — more defensible than custom models with no published benchmarks.

### 4. Liveness Prevents Selfie Spoofing

Without liveness detection, an adversary can pass face matching by holding up a printed photo of the document owner. The blink/head-movement challenge prevents this class of attack at low cost (no dedicated liveness hardware required).

---

## Issues and Concerns

### 1. Liveness Is Active, Not Passive

**Severity: Medium**

Active liveness (blink, head movement) requires user cooperation in real time, which is fine for web/mobile onboarding flows but fails for asynchronous document upload workflows where the customer submits a static selfie photo.

**Recommendation:** For HS onboarding flows that accept static selfie images (e.g., email-based onboarding), supplement with a passive anti-spoofing model (e.g., Silent-Face or FAS-SGTD) rather than relying on the active challenge.

### 2. No MRZ Checksum Validation Visible in Review

**Severity: Medium**

ICAO Doc 9303 MRZ fields include check digits (mod-10 weighted algorithm) that detect transcription errors and document tampering. If the implementation does not validate MRZ check digits, it will silently accept documents with corrupted or tampered MRZ fields.

**Recommendation:** Verify that check digit validation is implemented for document number, DOB, expiry, and composite check digits. If not, add it in the Hawkeye Sterling integration wrapper.

### 3. No Document Authenticity Check

**Severity: Medium**

The pipeline verifies that the person matches the document, but does not verify that the document itself is genuine (security feature detection: holograms, UV patterns, microprint). For high-risk customer onboarding, document authenticity verification requires a specialised SDK (e.g., Regula Forensics, Jumio).

**Recommendation:** Flag this as a gap in the HS integration notes. For standard onboarding, MRZ + face match is acceptable. For high-risk (PEP, HNWI, correspondent banking), add a document authenticity check via a commercial SDK.

---

## Integration Architecture for Hawkeye Sterling

```
Customer onboarding event (new account / periodic review)
    ↓
src/integrations/ekyc_client.ts
    ├── POST /verify  (document image + selfie)
    ├── Parse response: name, DOB, doc_number, liveness, face_match
    ├── Cross-reference: name + DOB against sanctions/PEP lists
    └── Flag: face_match < 0.7 → document mismatch → HOLD
    ↓
src/brain/onboarding_risk_mode.ts
    ├── MRZ name matches declared name? → name consistency check
    ├── Document expiry < 30 days? → expired document flag
    ├── Liveness failed? → spoofing attempt flag
    └── Face match < threshold → identity mismatch flag
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Pipeline completeness | Good | OCR + liveness + face match in one service |
| MRZ parsing | Good | Structured, reliable extraction |
| Face matching accuracy | Good | FaceNet/MTCNN, LFW-validated |
| Liveness | Caution | Active only — add passive for static selfie flows |
| Document authenticity | Poor | No security feature verification |
| Licensing | Excellent | MIT |
| HS fit | ★★★ | Identity verification microservice for KYC onboarding |

---

## Recommendation

**Integrate as a Python microservice** called from `src/integrations/ekyc_client.ts`. Add MRZ check digit validation in the integration wrapper. Supplement with a passive liveness model for asynchronous onboarding flows. Flag the absence of document authenticity checking as a risk gap for high-risk customer segments, and escalate those cases to a commercial document verification SDK.
