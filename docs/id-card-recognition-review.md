# Code Review: kby-ai/IDCardRecognition-Docker

**Repository:** https://github.com/kby-ai/IDCardRecognition-Docker  
**Stars:** 21 | **License:** Proprietary SDK (MIT demo wrapper)  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

A Dockerised document scanning microservice from KBY-AI that provides REST API access to a proprietary ID card, passport, and driving licence OCR engine. The system handles MRZ scanning, barcode decoding (PDF417, QR), and NFC chip reading (for e-passport chips). It covers 10,000+ document types from 200+ countries, with pre-built Docker images for both CPU and GPU deployment.

For Hawkeye Sterling, this is the **document scanning microservice** for KYC onboarding in `src/integrations` — a drop-in Docker container that converts document images to structured JSON identity records, covering a wider document type range than open-source alternatives.

**License:** Demo code is MIT; underlying KBY-AI OCR engine is proprietary and requires a licence key. Free evaluation tier available.

---

## What the Tool Does

```
Input: document image (JPEG/PNG) via REST API
    ↓
IDCardRecognition Docker container (KBY-AI OCR engine)
    ├── Document classification (ID card / passport / driving licence)
    ├── MRZ zone detection + OCR
    │       ICAO Doc 9303: TD1, TD2, TD3 formats
    │       Fields: doc_number, surname, given_names, nationality,
    │               DOB, expiry, gender, check_digits
    ├── Visual zone OCR (biographical data page)
    │       Address fields, issuing authority, issue date
    ├── Barcode decoding
    │       PDF417 (US driving licences), QR codes, DataMatrix
    └── NFC chip reading (e-passport SAC/BAC/EAC)
            RFID chip: DG1 (MRZ data), DG2 (face image), SOD (signatures)
    ↓
Output: structured JSON
    {
      "type": "passport",
      "mrz": { "doc_number": "AB1234567", ... },
      "visual": { "address": "...", "issue_date": "2023-03-01" },
      "barcode": { ... },
      "nfc": { "chip_verified": true, "face_image": "base64..." }
    }
```

**Docker deployment:**
```bash
docker pull kbyai/id-card-recognition:latest
docker run -p 8080:8080 -e LICENCE_KEY=$KBY_KEY kbyai/id-card-recognition

# REST call from TypeScript
const result = await fetch(`${IDCR_URL}/recognise`, {
  method: 'POST',
  body: formData  // document image
});
```

---

## Strengths

### 1. 10,000+ Document Types Across 200+ Countries

Global AML screening requires handling identity documents from high-risk jurisdictions (Panama, BVI, Cayman, UAE, etc.) where document templates differ significantly from EU/US formats. KBY-AI's coverage of 200+ countries is a differentiating advantage over open-source OCR pipelines trained primarily on Western ID card formats.

### 2. NFC Chip Reading for E-Passport Verification

E-passports issued after 2006 contain ICAO-compliant RFID chips with digitally signed biographic data and a face image. Reading and verifying the NFC chip (BAC/SAC/EAC protocols) provides cryptographic proof of document authenticity — the chip data is signed by the issuing country's national PKI. This is the strongest form of document verification available short of physical inspection.

### 3. PDF417 Barcode for US Driving Licences

US state driving licences encode structured identity data in a PDF417 barcode on the back (AAMVA standard). Barcode reading is more reliable than OCR for this document type and includes fields not visible in the visual zone (organ donor status, vehicle class). KBY-AI's barcode support handles this natively.

### 4. REST API + Docker — TypeScript-Friendly

The REST API interface makes this service a clean integration target for the TypeScript-native Hawkeye Sterling stack. No Python bindings required — call it from `src/integrations/idcr_client.ts` as a standard HTTP microservice.

### 5. MRZ Check Digit Validation

KBY-AI explicitly validates ICAO check digits, which catches corrupted or tampered MRZ fields. This closes the gap identified in the eKYC review.

---

## Issues and Concerns

### 1. Proprietary Engine — Vendor Dependency

**Severity: Medium**

The OCR engine is proprietary. If KBY-AI discontinues the service or changes pricing, the document scanning capability is lost. The Docker image includes the licence-gated binary.

**Recommendation:** Cache all OCR results (structured JSON) permanently in the HS customer record. The raw document image can be discarded after verification (GDPR data minimisation), but the extracted structured fields are the persistent record.

### 2. NFC Requires Hardware Reader or Mobile NFC

**Severity: Medium**

NFC chip reading requires an NFC-capable device (NFC reader hardware, NFC-enabled smartphone). This cannot be performed on uploaded static images — it requires a live NFC session with the physical document. The REST API NFC endpoint is therefore only applicable to mobile onboarding flows with NFC-capable devices.

**Recommendation:** Use NFC verification as an optional enhancement for mobile app onboarding. Fall back to MRZ + visual OCR for web/email onboarding flows.

### 3. Low Star Count for a Proprietary SDK Wrapper

**Severity: Low**

21 stars primarily reflects the repository being a demo/wrapper, not the underlying SDK quality. Evaluate KBY-AI's commercial reputation and enterprise support independently of GitHub metrics.

---

## Integration Architecture for Hawkeye Sterling

```
Customer document upload (web / mobile)
    ↓
src/integrations/idcr_client.ts
    ├── POST /recognise  { document: <image> }
    ├── Parse: type, mrz.doc_number, mrz.surname, mrz.given_names,
    │          mrz.nationality, mrz.dob, mrz.expiry, mrz.check_digits_valid
    ├── Flag: check_digits_valid = false → DOCUMENT_TAMPERING
    ├── Flag: expiry < today → EXPIRED_DOCUMENT
    └── Mobile NFC path: chip_verified = false → CHIP_INVALID
    ↓
src/brain/onboarding_risk_mode.ts
    ├── Nationality from MRZ → sanctions jurisdiction check
    ├── Name from MRZ → normalised for sanctions/PEP list matching
    └── DOB + doc_number → identity cross-reference
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Document type coverage | Excellent | 10,000+ types, 200+ countries |
| MRZ parsing + check digits | Excellent | ICAO-compliant, validates check digits |
| NFC chip reading | Excellent | Cryptographic document authenticity |
| PDF417 barcode | Excellent | US driving licence native support |
| REST API | Excellent | TypeScript-friendly, Docker self-hosted |
| Licence | Caution | Proprietary engine, commercial key required |
| HS fit | ★★★ | Primary document scanning microservice for KYC |

---

## Recommendation

**Integrate as the primary document scanning microservice** for Hawkeye Sterling KYC onboarding. Call from `src/integrations/idcr_client.ts` via REST. Enable NFC verification for mobile onboarding flows; fall back to MRZ + visual OCR for web flows. Obtain commercial licence from KBY-AI. Permanently cache structured OCR output in the customer record to mitigate vendor dependency risk.
