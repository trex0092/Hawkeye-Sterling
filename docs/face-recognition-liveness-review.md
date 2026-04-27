# Code Review: recognito-vision/Windows-FaceRecognition-FaceLivenessDetection-Python

**Repository:** https://github.com/recognito-vision/Windows-FaceRecognition-FaceLivenessDetection-Python  
**Stars:** 65 | **License:** Proprietary SDK (MIT wrapper/demo code)  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

Python demo and integration wrapper for Recognito's face recognition and passive liveness detection SDK — ranked Top-1 in NIST FRVT (Face Recognition Vendor Test). The SDK provides deepfake-resistant biometric verification without requiring active user challenges (blink, head movement). The repository provides Windows-native Python bindings and a demo application that calls the underlying C++ SDK via ctypes/DLL.

For Hawkeye Sterling, this represents the **highest-accuracy biometric verification option** for `src/integrations`, specifically for high-risk customer onboarding scenarios (PEP, HNWI, correspondent banking) where passive liveness and deepfake resistance are required.

**License:** The demo/wrapper code is MIT, but the underlying Recognito SDK is proprietary and requires a commercial licence. A free trial SDK key is available for evaluation.

---

## What the Tool Does

```
Input: selfie image or video frame
    ↓
Recognito SDK (C++ engine, Python bindings)
    ├── Face detection (proprietary CNN)
    ├── Passive liveness detection
    │       ├── Texture analysis (not a printed photo)
    │       ├── 3D depth cues (not a flat screen)
    │       ├── Temporal consistency (video frames)
    │       └── Deepfake artefact detection (GAN fingerprints)
    └── Face recognition
            ├── 512-d face embedding extraction
            ├── 1:1 verification (selfie vs document photo)
            └── 1:N search (selfie vs enrolled gallery)
    ↓
Output: { liveness_score, is_live, similarity_score, is_match }
```

**Python integration pattern:**
```python
from recognito import FaceRecognition, LivenessDetection

recognizer = FaceRecognition(licence_key=LICENCE_KEY)
liveness   = LivenessDetection(licence_key=LICENCE_KEY)

live_result    = liveness.detect(selfie_image)
# live_result.score: 0.0–1.0, live_result.is_live: bool

match_result   = recognizer.verify(selfie_image, document_photo)
# match_result.similarity: 0.0–1.0, match_result.is_match: bool
```

---

## Strengths

### 1. NIST FRVT Top-1 Ranking

NIST FRVT is the gold-standard independent benchmark for face recognition algorithms. A Top-1 ranking is the most credible technical credential available in this domain. For a compliance-adjacent use case where biometric accuracy directly affects false-positive rates (genuine customers incorrectly flagged) and false-negative rates (impostors incorrectly passed), NIST FRVT ranking provides regulatory defensibility.

### 2. Passive Liveness — No User Cooperation Required

Unlike active liveness (blink challenges), passive liveness detection works on a single static image or video frame, with no required user action. This is critical for asynchronous onboarding workflows (document upload via email or mobile) where interactive challenges are impractical.

### 3. Deepfake Detection

Deepfake face-swap attacks (where a GAN-generated face is injected into a video stream) are an emerging identity fraud vector. The Recognito SDK explicitly addresses GAN fingerprint detection — distinguishing AI-generated faces from real captures. This is a differentiating capability that open-source pipelines (FaceNet + MTCNN) do not provide.

### 4. 1:N Gallery Search

Beyond 1:1 verification (selfie vs document), the SDK supports 1:N search against an enrolled face gallery. This enables Hawkeye Sterling to detect the same biometric identity appearing under multiple customer profiles — a synthetic identity or account takeover signal.

---

## Issues and Concerns

### 1. Proprietary SDK — Commercial Licence Required

**Severity: High**

The Recognito SDK is not open source. Production deployment requires a paid commercial licence. Pricing is not published; enterprise pricing applies.

**Recommendation:** Evaluate the free trial SDK for proof-of-concept. Obtain commercial pricing and compare against Onfido / Jumio / AWS Rekognition for a build-vs-buy decision for the biometric verification module.

### 2. Windows-Native SDK — Linux Deployment Requires Different Build

**Severity: Medium**

The repository name specifies Windows. The underlying C++ SDK has Linux variants, but the Python bindings in this repository target Windows DLLs. Production deployment in a Linux Docker container requires the Linux SDK variant and corresponding Python bindings.

**Recommendation:** Request the Linux SDK build from Recognito support during evaluation. Confirm that the Python binding API is identical across platforms.

### 3. No GDPR/Biometric Data Handling Guidance

**Severity: Medium**

Biometric data (face embeddings) is special-category personal data under GDPR Article 9. The repository provides no guidance on embedding storage, retention, or deletion. Processing biometric data for KYC without explicit consent and a lawful basis is a regulatory violation in EU jurisdictions.

**Recommendation:** Define a biometric data handling policy for HS: embeddings are used only for 1:1 verification at onboarding, not stored post-verification, unless explicit consent for 1:N re-identification has been obtained.

---

## Integration Architecture for Hawkeye Sterling

```
High-risk onboarding trigger (PEP, HNWI, correspondent banking)
    ↓
src/integrations/biometric_client.ts
    ├── POST /biometric/verify  (selfie + document photo)
    │       → Python microservice wrapping Recognito SDK (Linux build)
    ├── Passive liveness check: score < 0.85 → SPOOF_SUSPECTED
    ├── Face match: similarity < 0.75 → IDENTITY_MISMATCH
    └── 1:N gallery check: match found → DUPLICATE_IDENTITY alert
    ↓
src/brain/high_risk_onboarding_mode.ts
    ├── Deepfake flag → escalate to manual review
    ├── Duplicate identity → freeze account, SAR consideration
    └── Liveness pass + face match → biometric verification complete
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Accuracy | Excellent | NIST FRVT Top-1 ranked |
| Passive liveness | Excellent | No user cooperation required |
| Deepfake resistance | Excellent | GAN fingerprint detection |
| Licence | Caution | Proprietary SDK — commercial cost |
| Platform | Caution | Windows native; Linux build requires separate request |
| GDPR | Gap | No biometric data handling guidance |
| HS fit | ★★★ | Best-in-class biometrics for high-risk onboarding |

---

## Recommendation

**Adopt as the biometric verification backend for high-risk customer segments.** Run as a Python microservice (Linux SDK build). Engage Recognito for commercial licensing during HS proof-of-concept phase. For standard-risk customers, the open-source FaceNet/MTCNN pipeline (eKYC review) is sufficient. Reserve this SDK for PEP, HNWI, and correspondent banking onboarding where deepfake resistance and NIST-validated accuracy are required.
