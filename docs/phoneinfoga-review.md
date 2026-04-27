# Code Review: sundowndev/phoneinfoga

**Repository:** https://github.com/sundowndev/phoneinfoga  
**Stars:** 16,300+ | **Forks:** 4,900+  
**Version:** v2.11.0 (February 2024)  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

PhoneInfoga is an OSINT tool for gathering intelligence on international phone numbers: carrier identification, line type classification, VOIP detection, reputation checks, and search-engine-based social media discovery. It is written in Go with a Vue.js frontend and exposes a REST API alongside a CLI. The project has 16k+ stars but is explicitly declared **unmaintained** — the maintainer warns that upcoming bugs will not be fixed and the repository may be archived.

For Hawkeye Sterling, PhoneInfoga covers the **contact-point verification mode**: validating whether a phone number supplied at onboarding is a real carrier number, a VOIP/burner number, or a disposable SIM — which is a meaningful AML risk signal.

**License:** GPL v3 — copyleft; direct code integration into a proprietary product requires GPL disclosure. Use via REST API to avoid this obligation.

---

## What the Tool Does

```
Input: International phone number (E.164 format)
    ↓
PhoneInfoga (Go + Vue.js)
    ├── Basic validation (country, region, format, local number)
    ├── Carrier / line type identification
    ├── VOIP detection flag
    ├── Reputation lookup (spam/fraud databases)
    ├── Disposable number detection
    └── Search-engine-based social discovery
    ↓
Output: JSON report (REST API) or HTML report (web UI)
```

**REST API:**
```bash
# Start server
phoneinfoga serve

# Query
GET /api/v2/phoneinfoga/scan/{number}
```

**Docker deployment:**
```bash
docker run -p 5000:5000 sundowndev/phoneinfoga serve
```

---

## Strengths

### 1. REST API Available

PhoneInfoga exposes a REST API when run in server mode (`phoneinfoga serve`). This is the correct integration pattern — consume it as a microservice, avoiding GPL contamination and decoupling the Go binary from Hawkeye Sterling's TypeScript/Python stack.

### 2. VOIP / Burner Detection Is an AML Signal

VOIP numbers (Skype-in, Google Voice, VoIP.ms) and temporary SIM services are disproportionately used by sanctioned persons and high-risk individuals to avoid carrier-based identity verification. A phone number supplied at onboarding that resolves to a VOIP provider or disposable service is a concrete, documentable risk factor.

### 3. International E.164 Coverage

The tool handles international phone numbers in E.164 format. Given Hawkeye Sterling's UAE-first deployment (international counterparties, cross-border transactions), coverage of Middle Eastern, Asian, and African carrier databases is important.

### 4. Go Binary — Fast and Self-Contained

The Go binary has no runtime dependencies. Docker deployment is a single-command operation. For a microservice that answers point queries, this is operationally simple.

---

## Issues and Concerns

### 1. Project Is Explicitly Unmaintained

**Severity: Critical**

The maintainer has posted a warning directly in the repository: *"Upcoming bugs won't be fixed and repository could be archived at any time."* The last release was v2.11.0 in February 2024. With 56 open issues and 14 open PRs, the maintenance backlog is real.

For a tool relied upon for compliance-critical phone number validation, unmaintained status means:
- Scanner modules that depend on external APIs will break as those APIs change
- Security vulnerabilities will not be patched
- The tool may stop functioning without warning

**Recommendation:** Do not build a production dependency on PhoneInfoga. Either maintain a private fork or evaluate maintained alternatives: NumVerify (commercial), Twilio Lookup API, or GSMA number portability APIs.

### 2. GPL v3 License

**Severity: Medium**

GPL v3 is a strong copyleft licence. If Hawkeye Sterling embeds PhoneInfoga code directly, the entire Hawkeye Sterling codebase would be subject to GPL disclosure requirements. Use **REST API only** — the network boundary exempts Hawkeye Sterling from GPL obligations.

### 3. Scanner Modules Require External API Keys

**Severity: Medium**

Most intelligence-gathering scanners require API keys from third-party services. As PhoneInfoga is unmaintained, there is no guarantee that scanner module API compatibility will track provider changes. Modules that relied on now-changed APIs may silently return empty results.

### 4. Does Not Provide Real-Time Tracking or Verified Data

**Severity: Low**

The tool explicitly disclaims real-time location tracking and guaranteed data accuracy. Results are OSINT aggregations from public sources — they can be stale or incorrect. Phone number data in particular ages quickly as carriers reassign numbers.

---

## Alternative: Twilio Lookup API

For production AML use, the Twilio Lookup API is the correct commercial alternative:

```typescript
// src/services/phone_verification.ts
import twilio from 'twilio';

const client = twilio(TWILIO_SID, TWILIO_TOKEN);

async function verifyPhone(number: string) {
  const result = await client.lookups.v2
    .phoneNumbers(number)
    .fetch({ fields: "line_type_intelligence,caller_name" });

  return {
    valid: result.valid,
    lineType: result.lineTypeIntelligence?.type,    // "mobile", "voip", "landline"
    carrier: result.lineTypeIntelligence?.carrier_name,
    country: result.countryCode,
  };
}
```

Twilio Lookup is maintained, has an SLA, covers 180+ countries, and returns line type intelligence including VOIP flagging — exactly the signals needed for AML contact-point verification.

---

## Integration Map for Hawkeye Sterling

| PhoneInfoga Feature | HS Module | Use |
|--------------------|-----------|-----|
| VOIP detection | `src/brain/` onboarding checks | Flag VOIP phone as risk signal |
| Carrier identification | `src/brain/` | Cross-border carrier mismatch detection |
| Disposable number flag | `src/brain/` | Onboarding risk score input |
| REST API `/scan/{number}` | `src/services/phone_verification.ts` | Microservice call at onboarding |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Data coverage | Good | Carrier, VOIP, reputation, social discovery |
| REST API | Good | Available in server mode |
| Maintenance status | Poor | Explicitly unmaintained — critical concern |
| License | Caution | GPL v3 — REST API boundary required |
| Production reliability | Poor | 56 open issues, no bug fixes committed |
| HS fit | ★☆☆ | Use Twilio Lookup in production; PhoneInfoga only for prototyping |

---

## Recommendation

**Do not use in production.** PhoneInfoga is unmaintained and GPL-licensed. The capability it provides (VOIP detection, carrier identification) is available from maintained commercial services (Twilio Lookup, NumVerify, or GSMA APIs) with proper SLAs and active support. Use PhoneInfoga only for local development/prototyping to understand what data is available before committing to a commercial API.
