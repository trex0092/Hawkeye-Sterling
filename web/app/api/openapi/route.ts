// GET /api/openapi
//
// Returns the complete OpenAPI 3.1.0 specification for the Hawkeye Sterling
// AML platform.  Every major API route is documented with request/response
// schemas, security requirements, and FATF/regulatory context.
//
// requireAuth: false — the spec itself contains no secrets and is safe for
// public consumption.  Callers do not need a Bearer JWT or x-api-key.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

// ── Shared schema fragments ────────────────────────────────────────────────

const ErrorResponse = {
  type: "object",
  properties: {
    ok:    { type: "boolean", example: false },
    error: { type: "string", example: "Unauthorised" },
    code:  { type: "string", example: "UNAUTHORIZED" },
  },
  required: ["ok", "error"],
} as const;

const RiskLevel = {
  type: "string",
  enum: ["critical", "high", "medium", "low", "clear"],
  description: "Ordinal risk band derived from the composite score",
} as const;

const standardResponses = {
  "400": {
    description: "Bad request — missing or invalid body fields",
    content: { "application/json": { schema: ErrorResponse } },
  },
  "401": {
    description: "Unauthorised — missing or invalid Bearer JWT / x-api-key",
    content: { "application/json": { schema: ErrorResponse } },
  },
  "429": {
    description: "Rate limit exceeded",
    headers: {
      "X-RateLimit-Limit":     { schema: { type: "integer" } },
      "X-RateLimit-Remaining": { schema: { type: "integer" } },
      "Retry-After":           { schema: { type: "integer" } },
    },
    content: { "application/json": { schema: ErrorResponse } },
  },
  "500": {
    description: "Internal server error",
    content: { "application/json": { schema: ErrorResponse } },
  },
} as const;

// ── Full OpenAPI 3.1.0 document ────────────────────────────────────────────

function buildSpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Hawkeye Sterling AML Platform API",
      version: "2.0.0",
      description: [
        "The Hawkeye Sterling AML platform provides a comprehensive suite of",
        "anti-money-laundering, sanctions screening, and compliance intelligence",
        "endpoints.  All routes are protected by Bearer JWT authentication.",
        "",
        "**Regulatory alignment:** FATF Recommendations (2023 revision),",
        "UAE FDL 10/2025 (AML/CFT), OFAC SDN, UN Security Council, EU",
        "Consolidated List, UKOFSI, goAML XML schema v5.x.",
        "",
        "**Rate limits:** Tier-based (see `X-RateLimit-*` response headers).",
        "Tier 1 (Starter): 60 req/min.  Tier 2 (Professional): 300 req/min.",
        "Tier 3 (Enterprise): 1 000 req/min.",
      ].join("\n"),
      contact: {
        name: "Hawkeye Sterling Support",
        email: "support@hawkeyesterling.com",
        url: "https://hawkeyesterling.com",
      },
      license: {
        name: "Proprietary",
        url: "https://hawkeyesterling.com/terms",
      },
    },
    servers: [
      { url: "/api", description: "Current deployment" },
      { url: baseUrl, description: "Absolute base URL" },
      { url: "https://hawkeye-sterling.netlify.app", description: "Production" },
    ],
    tags: [
      { name: "Screening",        description: "Sanctions, PEP, watchlist, and batch screening" },
      { name: "Adverse Media",    description: "News search and adverse media analysis" },
      { name: "Risk Assessment",  description: "Entity, sector, and transaction risk scoring" },
      { name: "Compliance",       description: "STR/SAR narrative generation, goAML XML, audit trail" },
      { name: "Case Management",  description: "Compliance case lifecycle and designation alerts" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Hawkeye Sterling JWT issued by POST /api/auth/login, or a static API key issued from the dashboard.  Pass as `Authorization: Bearer <token>` or the `x-api-key` header.",
        },
      },
      schemas: {
        Error: ErrorResponse,
        RiskLevel,
        // ── Core entity schemas required by the platform spec ──────────────
        Subject: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", maxLength: 512, description: "Full legal name of the individual or organisation", example: "Ahmad Al-Rashid" },
            dob:  { type: "string", format: "date", description: "Date of birth (YYYY-MM-DD) for individual subjects", example: "1975-03-15" },
            nationality: { type: "string", maxLength: 3, description: "ISO 3166-1 alpha-2 or alpha-3 nationality code", example: "AE" },
            type: { type: "string", enum: ["individual", "organisation", "vessel", "aircraft", "other"], description: "Entity type; defaults to individual if omitted" },
            aliases:      { type: "array", items: { type: "string" }, maxItems: 50, description: "Alternative names or aliases for the subject" },
            jurisdiction: { type: "string", description: "ISO 3166-1 alpha-2 jurisdiction code", example: "AE" },
          },
        },
        Hit: {
          type: "object",
          required: ["listId", "listRef", "candidateName", "score", "method"],
          properties: {
            listId:        { type: "string", description: "Internal identifier of the sanctions or watchlist", example: "ofac_sdn" },
            listRef:       { type: "string", description: "Reference identifier within the list", example: "OFAC-1234" },
            candidateName: { type: "string", description: "Name of the matched candidate on the list" },
            score:         { type: "number", minimum: 0, maximum: 1, description: "Fuzzy-match similarity score (0–1)" },
            baseScore:     { type: "number", minimum: 0, maximum: 1, description: "Base phonetic/token score before boosting" },
            method:        { type: "string", description: "Matching algorithm used", example: "token_set" },
            programs:      { type: "array", items: { type: "string" }, description: "Sanction programmes the candidate is designated under" },
            reason:        { type: "string", description: "Human-readable rationale for the match" },
            autoResolution: { type: "string", enum: ["flagged", "whitelisted", "pending"], description: "Automated disposition of this hit" },
            sourceList:    { type: "string", description: "Source list identifier (alias for listId)" },
            sourceLabel:   { type: "string", description: "Human-readable name of the source list", example: "OFAC Specially Designated Nationals" },
            riskCategory:  { type: "string", enum: ["sanctions", "pep", "adverse_media"], description: "Risk category of the match" },
            matchedLists:  { type: "array", items: { type: "string" }, description: "All list IDs where this candidate was found (deduplication)" },
          },
        },
        WebhookRegistration: {
          type: "object",
          required: ["url", "events"],
          properties: {
            id:          { type: "string", description: "Unique webhook registration identifier" },
            url:         { type: "string", format: "uri", description: "HTTPS endpoint to deliver webhook payloads to", example: "https://your-system.example.com/webhooks/hawkeye" },
            events:      { type: "array", items: { type: "string" }, description: "List of event types to subscribe to", example: ["screening.completed", "case.opened"] },
            secret:      { type: "string", description: "HMAC signing secret for payload verification (write-only)" },
            createdAt:   { type: "string", format: "date-time", description: "ISO 8601 timestamp when the webhook was registered" },
            active:      { type: "boolean", description: "Whether the webhook is currently active" },
          },
        },
        ScreeningHit: {
          type: "object",
          description: "A single sanction list or watchlist match",
          properties: {
            id:         { type: "string" },
            name:       { type: "string" },
            score:      { type: "number", minimum: 0, maximum: 1 },
            listId:     { type: "string" },
            listLabel:  { type: "string" },
            entityType: { type: "string" },
            datasets:   { type: "array", items: { type: "string" } },
          },
        },
        PepMatchHit: {
          type: "object",
          properties: {
            id:        { type: "string" },
            name:      { type: "string" },
            score:     { type: "number", minimum: 0, maximum: 1 },
            positions: { type: "array", items: { type: "string" } },
            countries: { type: "array", items: { type: "string" } },
            topics:    { type: "array", items: { type: "string" } },
            birthDate: { type: "string", format: "date" },
            datasets:  { type: "array", items: { type: "string" } },
            caption:   { type: "string" },
          },
        },
        AuditEntry: {
          type: "object",
          properties: {
            seq:       { type: "integer" },
            prevHash:  { type: "string" },
            entryHash: { type: "string" },
            payload:   { type: "object" },
            at:        { type: "string", format: "date-time" },
          },
        },
        HsCase: {
          type: "object",
          properties: {
            id:          { type: "string" },
            subjectId:   { type: "string" },
            subjectName: { type: "string" },
            status:      { type: "string", enum: ["open", "under_review", "escalated", "closed"] },
            severity:    { type: "string", enum: ["critical", "high", "medium", "low", "clear"] },
            riskCategory: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
            slaDeadline: { type: "string", format: "date-time" },
            createdAt:   { type: "string", format: "date-time" },
            updatedAt:   { type: "string", format: "date-time" },
          },
        },
        DesignationAlert: {
          type: "object",
          properties: {
            id:         { type: "string" },
            sourceRef:  { type: "string" },
            listId:     { type: "string" },
            listLabel:  { type: "string" },
            entityName: { type: "string" },
            action:     { type: "string", enum: ["designated", "delisted", "amended"] },
            effectiveDate: { type: "string", format: "date" },
            detectedAt:    { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {

      // ── /api/screen ──────────────────────────────────────────────────────
      "/api/screen": {
        post: {
          tags: ["Screening"],
          operationId: "sanctionsScreen",
          summary: "Sanctions & watchlist screening",
          description: [
            "Screens a subject name (or entity) against OFAC SDN, UN Security",
            "Council, EU Consolidated List, UKOFSI, UAE EOCN, and the",
            "OpenSanctions bulk snapshot.  Returns fuzzy-matched hits with",
            "phonetic scoring, alias expansion, and transliteration variants.",
            "",
            "**FATF R.6 / R.10:** Required KYC/CDD screening step.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name:       { type: "string", example: "Al Baraka Trading LLC", description: "Full legal name to screen" },
                    entityType: { type: "string", enum: ["individual", "corporate", "vessel", "aircraft"], default: "individual" },
                    birthYear:  { type: "integer", example: 1975, description: "Narrows PEP/sanctions search for individuals" },
                    aliases:    { type: "array", items: { type: "string" }, description: "Known aliases or alternate spellings" },
                    country:    { type: "string", example: "AE", description: "ISO 3166-1 alpha-2 country code" },
                    threshold:  { type: "number", minimum: 0, maximum: 1, default: 0.7, description: "Minimum similarity score (0–1) to return a hit" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Screening result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:      { type: "boolean" },
                      hits:    { type: "array", items: { $ref: "#/components/schemas/ScreeningHit" } },
                      score:   { type: "number", description: "Highest match score 0–1" },
                      band:    { $ref: "#/components/schemas/RiskLevel" },
                      latencyMs: { type: "integer" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/super-brain ─────────────────────────────────────────────────
      "/api/super-brain": {
        post: {
          tags: ["Screening", "Risk Assessment"],
          operationId: "superBrain",
          summary: "Comprehensive risk assessment",
          description: [
            "The flagship endpoint.  Runs the full Hawkeye Sterling intelligence",
            "pipeline on a subject: sanctions + PEP screening, adverse media",
            "analysis, ESG/corruption scoring, typology matching, jurisdiction",
            "profiling, and a composite risk band.",
            "",
            "**FATF R.10, R.12, R.20:** Single call satisfies initial CDD",
            "and EDD screening obligations.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name:         { type: "string", example: "Rashid Al Maktoum" },
                    entityType:   { type: "string", enum: ["individual", "corporate", "vessel", "aircraft"], default: "individual" },
                    nationality:  { type: "string", example: "AE" },
                    birthYear:    { type: "integer", example: 1968 },
                    aliases:      { type: "array", items: { type: "string" } },
                    jurisdiction: { type: "string", example: "Dubai, UAE" },
                    industry:     { type: "string", example: "Real estate" },
                    context:      { type: "string", description: "Free-text context for the LLM analysis step" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Full risk intelligence report",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:              { type: "boolean" },
                      riskScore:       { type: "number", minimum: 0, maximum: 100 },
                      riskBand:        { $ref: "#/components/schemas/RiskLevel" },
                      sanctionsHits:   { type: "array", items: { $ref: "#/components/schemas/ScreeningHit" } },
                      pepHits:         { type: "array", items: { $ref: "#/components/schemas/PepMatchHit" } },
                      adverseMedia:    { type: "object", properties: { score: { type: "number" }, summary: { type: "string" }, articles: { type: "array", items: { type: "object" } } } },
                      typologies:      { type: "array", items: { type: "string" } },
                      redlines:        { type: "array", items: { type: "string" } },
                      recommendation:  { type: "string", enum: ["pass", "review", "escalate", "decline"] },
                      summary:         { type: "string" },
                      latencyMs:       { type: "integer" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/news-search ─────────────────────────────────────────────────
      "/api/news-search": {
        get: {
          tags: ["Adverse Media"],
          operationId: "newsSearch",
          summary: "Adverse media / news search",
          description: [
            "Searches multiple news adapters (NewsAPI, GDELT, Bing News, RSS feeds)",
            "for adverse media coverage of the named subject.  Articles are",
            "classified by keyword group (money laundering, terrorism financing,",
            "bribery, fraud, etc.) and an aggregate adverse-media score is returned.",
          ].join("\n"),
          parameters: [
            { name: "q",         in: "query", required: true,  schema: { type: "string" }, description: "Subject name to search" },
            { name: "lang",      in: "query", required: false, schema: { type: "string", default: "en" }, description: "BCP-47 language code" },
            { name: "maxItems",  in: "query", required: false, schema: { type: "integer", default: 20, maximum: 100 } },
            { name: "threshold", in: "query", required: false, schema: { type: "number",  default: 0.3 }, description: "Minimum relevance score" },
          ],
          responses: {
            "200": {
              description: "Adverse media search results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:           { type: "boolean" },
                      query:        { type: "string" },
                      adverseScore: { type: "number", minimum: 0, maximum: 100 },
                      band:         { $ref: "#/components/schemas/RiskLevel" },
                      articles:     {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title:       { type: "string" },
                            url:         { type: "string", format: "uri" },
                            publishedAt: { type: "string", format: "date-time" },
                            source:      { type: "string" },
                            sentiment:   { type: "string", enum: ["negative", "neutral", "positive"] },
                            groups:      { type: "array", items: { type: "string" } },
                          },
                        },
                      },
                      latencyMs: { type: "integer" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/pep-match ───────────────────────────────────────────────────
      "/api/pep-match": {
        post: {
          tags: ["Screening"],
          operationId: "pepMatch",
          summary: "PEP screening",
          description: [
            "Screens a name against the OpenSanctions PEP bulk dataset",
            "(cached in Netlify Blobs, refreshed daily).  Returns similarity-scored",
            "hits with position, country, topic, and dataset metadata.",
            "",
            "**FATF R.12:** Required EDD measure for politically exposed persons.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name:      { type: "string", example: "Mohammed Al Rashidi" },
                    birthYear: { type: "integer", example: 1965, description: "Narrows search for common names" },
                    aliases:   { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "PEP match results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:           { type: "boolean" },
                      hits:         { type: "array", items: { $ref: "#/components/schemas/PepMatchHit" } },
                      source:       { type: "string", enum: ["blobs", "cdn", "none"] },
                      queriedName:  { type: "string" },
                      totalCorpus:  { type: "integer" },
                      latencyMs:    { type: "integer" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/pep-profile ─────────────────────────────────────────────────
      "/api/pep-profile": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "pepProfile",
          summary: "PEP profile deep analysis",
          description: [
            "Generates a full enhanced due diligence profile for a confirmed",
            "politically exposed person.  Uses Claude LLM to assess political",
            "exposure tier, source of wealth plausibility, network map,",
            "sanctions exposure, and required EDD measures.",
            "",
            "**FATF R.12:** Supports EDD obligation for PEPs.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name:        { type: "string", example: "Ahmad Hassan Al-Farsi" },
                    position:    { type: "string", example: "Minister of Finance" },
                    country:     { type: "string", example: "AE" },
                    birthYear:   { type: "integer" },
                    sourceOfWealth: { type: "string", description: "Declared source of wealth" },
                    assets:      { type: "string" },
                    associates:  { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "PEP risk profile",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:               { type: "boolean" },
                      pepTier:          { type: "string", enum: ["tier1", "tier2", "tier3", "tier4", "rca"] },
                      riskScore:        { type: "number", minimum: 0, maximum: 100 },
                      politicalExposure: {
                        type: "object",
                        properties: {
                          current:    { type: "boolean" },
                          positions:  { type: "array", items: { type: "string" } },
                          powerLevel: { type: "string" },
                        },
                      },
                      sourceOfWealthAssessment: {
                        type: "object",
                        properties: {
                          plausibility: { type: "string" },
                          gaps:         { type: "array", items: { type: "string" } },
                          redFlags:     { type: "array", items: { type: "string" } },
                        },
                      },
                      requiredMeasures: { type: "array", items: { type: "string" } },
                      reviewFrequency:  { type: "string", enum: ["annual", "semi_annual", "quarterly", "monthly"] },
                      recommendation:   { type: "string", enum: ["accept_standard", "accept_enhanced", "senior_approval", "decline"] },
                      summary:          { type: "string" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/ubo-risk ────────────────────────────────────────────────────
      "/api/ubo-risk": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "uboRisk",
          summary: "Ultimate beneficial owner risk assessment",
          description: [
            "Assesses AML risk for an entity's ultimate beneficial ownership",
            "structure.  Evaluates layering depth, bearer-share indicators,",
            "PEP exposure of UBOs, high-risk nationalities, and CDD gaps.",
            "",
            "**FATF R.24/R.25:** Beneficial ownership transparency requirements.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["entity", "registered", "ubos"],
                  properties: {
                    entity:     { type: "string", example: "Global Ventures FZE" },
                    registered: { type: "string", example: "AE", description: "ISO 3166-1 jurisdiction of registration" },
                    ubos: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["name", "dob", "nationality", "gender", "ownershipPct", "role"],
                        properties: {
                          name:         { type: "string" },
                          dob:          { type: "string", format: "date" },
                          nationality:  { type: "string" },
                          gender:       { type: "string" },
                          ownershipPct: { type: "string", example: "25%" },
                          role:         { type: "string" },
                        },
                      },
                    },
                    ownershipChain:       { type: "array", items: { type: "string" } },
                    ownershipDescription: { type: "string" },
                    layeringDepth:        { type: "integer", minimum: 0 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "UBO risk assessment",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:                         { type: "boolean" },
                      overallRisk:                { $ref: "#/components/schemas/RiskLevel" },
                      riskNarrative:              { type: "string" },
                      ownershipStructureRisk:     { type: "string" },
                      pepRiskFlags:               { type: "array", items: { type: "string" } },
                      nationalityRisks:           { type: "array", items: { type: "string" } },
                      cddGaps:                    { type: "array", items: { type: "string" } },
                      recommendedActions:         { type: "array", items: { type: "string" } },
                      eddRequired:                { type: "boolean" },
                      sanctionsScreeningRequired: { type: "boolean" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/crypto-risk ─────────────────────────────────────────────────
      "/api/crypto-risk": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "cryptoRisk",
          summary: "Crypto wallet AML risk scoring",
          description: [
            "Scores a crypto wallet address for AML risk using taint analysis.",
            "Checks OFAC-designated wallets, mixer/tumbler associations",
            "(Tornado Cash, Chipmixer, Sinbad), dark-web marketplace links,",
            "VASP risk tier, and chain-specific privacy modifiers.",
            "",
            "**FATF R.15 / VASP Guidance 2021:** Virtual asset risk assessment.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["address"],
                  properties: {
                    address:   { type: "string", example: "0x742d35Cc6634C0532925a3b8D4C9C0581e2F8D04", description: "Blockchain wallet address" },
                    chain:     { type: "string", enum: ["ethereum", "bitcoin", "tron", "solana"], default: "ethereum" },
                    vasp:      { type: "string", description: "VASP / exchange name associated with the address" },
                    txMixers:  { type: "array", items: { type: "string" }, description: "Known mixer addresses interacted with" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Crypto wallet risk result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:            { type: "boolean" },
                      riskScore:     { type: "number", minimum: 0, maximum: 100 },
                      riskLevel:     { $ref: "#/components/schemas/RiskLevel" },
                      sanctioned:    { type: "boolean" },
                      mixerExposure: { type: "boolean" },
                      flags:         { type: "array", items: { type: "string" } },
                      recommendation: { type: "string" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/transaction-anomaly ─────────────────────────────────────────
      "/api/transaction-anomaly": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "transactionAnomaly",
          summary: "Transaction pattern anomaly detection",
          description: [
            "Real-time transaction anomaly scoring using a streaming HalfSpaceTrees",
            "+ z-score ensemble model.  Detects structuring, round-number patterns,",
            "velocity spikes, geographic dispersion, dormant reactivation, and",
            "correspondent layering.",
            "",
            "**FATF R.20:** Suspicious transaction reporting support.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["transaction"],
                  properties: {
                    sessionId: { type: "string", description: "Groups transactions from the same session for stateful scoring" },
                    transaction: {
                      type: "object",
                      required: ["amountUsd", "currency", "timestampUtc"],
                      properties: {
                        amountUsd:        { type: "number", example: 9800 },
                        currency:         { type: "string", example: "USD" },
                        timestampUtc:     { type: "string", format: "date-time" },
                        counterpartyName: { type: "string" },
                        counterpartyBank: { type: "string" },
                        originCountry:    { type: "string" },
                        destCountry:      { type: "string" },
                        channel:          { type: "string", enum: ["wire", "cash", "crypto", "card", "ach", "swift"] },
                        reference:        { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Anomaly scoring result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:           { type: "boolean" },
                      tier:         { type: "string", enum: ["pass", "flag", "hold"] },
                      anomalyScore: { type: "number" },
                      drivers:      { type: "array", items: { type: "string" } },
                      anomalyFlags: { type: "array", items: { type: "string" } },
                      sessionId:    { type: "string" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/correspondent-risk ──────────────────────────────────────────
      "/api/correspondent-risk": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "correspondentRisk",
          summary: "Correspondent banking risk assessment",
          description: [
            "Scores the AML risk of a correspondent banking relationship.",
            "Applies FATF grey/blacklist jurisdiction penalties, SWIFT BIC",
            "validation, nested correspondent detection, and shell-bank indicators.",
            "",
            "**FATF R.13 / R.14:** Correspondent banking due diligence.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["bankName", "countryCode"],
                  properties: {
                    bankName:             { type: "string", example: "First Trade Bank LLC" },
                    swiftCode:            { type: "string", example: "FTBLAEAD" },
                    countryCode:          { type: "string", example: "AE" },
                    relationships:        { type: "array", items: { type: "string" }, description: "Named respondent banks" },
                    services:             { type: "array", items: { type: "string" }, description: "Products offered (USD clearing, crypto custody, etc.)" },
                    isNested:             { type: "boolean", description: "True if nested correspondent relationship" },
                    shellBankIndicators:  { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Correspondent risk result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:              { type: "boolean" },
                      riskScore:       { type: "number", minimum: 0, maximum: 100 },
                      riskLevel:       { $ref: "#/components/schemas/RiskLevel" },
                      flags:           { type: "array", items: { type: "object", properties: { code: { type: "string" }, description: { type: "string" }, score: { type: "number" }, regulatoryBasis: { type: "string" } } } },
                      recommendation:  { type: "string" },
                      regulatoryBasis: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/real-estate-risk ────────────────────────────────────────────
      "/api/real-estate-risk": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "realEstateRisk",
          summary: "Real estate DNFBP AML risk assessment",
          description: [
            "Scores AML risk for UAE real-estate transactions.",
            "Assesses: high-value threshold (>AED 2 M), cash/crypto payment,",
            "off-plan purchase, price manipulation, corporate buyer complexity,",
            "high-risk buyer nationality, and rapid resale.",
            "",
            "**UAE FDL 10/2025 Art.14 / RERA AML Guidelines 2024 / FATF R.22.**",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["transactionValue", "currency", "buyerNationality", "propertyLocation"],
                  properties: {
                    transactionValue:    { type: "number", example: 3500000, description: "Transaction value in the specified currency" },
                    currency:            { type: "string", example: "AED" },
                    paymentMethod:       { type: "string", enum: ["cash", "wire_transfer", "mortgage", "crypto", "mixed"] },
                    buyerNationality:    { type: "string", example: "IR", description: "ISO 3166-1 alpha-2" },
                    buyerType:           { type: "string", enum: ["individual", "corporate", "trust"] },
                    propertyLocation:    { type: "string", example: "Dubai Marina" },
                    isOffPlan:           { type: "boolean" },
                    marketValueVariance: { type: "number", description: "% difference from market benchmark (negative = below market)" },
                    intermediaryCount:   { type: "integer", description: "Number of agents/intermediaries in chain" },
                    daysSincePurchase:   { type: "integer", description: "For rapid-resale detection" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Real estate risk result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:                 { type: "boolean" },
                      riskScore:          { type: "number" },
                      riskLevel:          { $ref: "#/components/schemas/RiskLevel" },
                      eddRequired:        { type: "boolean" },
                      strRequired:        { type: "boolean" },
                      flags:              { type: "array", items: { type: "string" } },
                      regulatoryBasis:    { type: "array", items: { type: "string" } },
                      recommendation:     { type: "string" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/gold-dealer-risk ────────────────────────────────────────────
      "/api/gold-dealer-risk": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "goldDealerRisk",
          summary: "Gold & precious metals dealer AML risk",
          description: [
            "AML risk scoring for gold and precious metals transactions by",
            "UAE-regulated dealers (DMCC, CBUAE).  Assesses cash-purchase",
            "risk, refining chain opacity, DMCC Responsible Sourcing compliance,",
            "and customer type risk.",
            "",
            "**UAE FDL 10/2025 / FATF DPMS Guidance / DMCC Responsible Sourcing Programme.**",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["dealerName", "countryCode", "transactionValue", "currency", "metalType", "transactionType", "paymentMethod", "customerType"],
                  properties: {
                    dealerName:       { type: "string" },
                    licenseNumber:    { type: "string" },
                    countryCode:      { type: "string", example: "AE" },
                    transactionValue: { type: "number" },
                    currency:         { type: "string", example: "AED" },
                    metalType:        { type: "string", enum: ["gold", "silver", "platinum", "diamonds", "precious_stones", "mixed"] },
                    transactionType:  { type: "string", enum: ["purchase", "sale", "exchange", "refining", "export"] },
                    paymentMethod:    { type: "string", enum: ["cash", "wire_transfer", "cheque", "crypto", "barter"] },
                    customerType:     { type: "string", enum: ["individual", "corporate", "wholesale_dealer"] },
                    customerCountry:  { type: "string" },
                    originCountry:    { type: "string", description: "Gold origin / provenance" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Gold dealer AML risk result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:              { type: "boolean" },
                      riskScore:       { type: "number" },
                      riskLevel:       { $ref: "#/components/schemas/RiskLevel" },
                      reportingThreshold: { type: "string", enum: ["none", "CDD", "EDD", "STR"] },
                      flags:           { type: "array", items: { type: "string" } },
                      recommendation:  { type: "string" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/hawala-risk ─────────────────────────────────────────────────
      "/api/hawala-risk": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "hawalaRisk",
          summary: "Hawala / IVTS risk assessment",
          description: [
            "Scores AML risk for informal value transfer system (hawala) operators.",
            "Evaluates unregistered MTO status, high-risk corridor pairs,",
            "volume thresholds, counterparty sanctions exposure, and",
            "record-keeping gaps.",
            "",
            "**FATF Guidance on Hawala (2013) / UAE FDL 10/2025 Art.14.**",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["entityName", "entityType", "countryCode", "isRegisteredMTO"],
                  properties: {
                    entityName:           { type: "string" },
                    entityType:           { type: "string", enum: ["individual", "corporate"] },
                    countryCode:          { type: "string" },
                    hawalaCodes:          { type: "array", items: { type: "string" } },
                    transactionPattern:   { type: "string" },
                    networkSize:          { type: "integer" },
                    monthlyVolume:        { type: "number" },
                    primaryCurrency:      { type: "string" },
                    counterpartyCountries: { type: "array", items: { type: "string" } },
                    isRegisteredMTO:      { type: "boolean" },
                    regulatoryId:         { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Hawala risk assessment result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:             { type: "boolean" },
                      riskScore:      { type: "number" },
                      riskLevel:      { $ref: "#/components/schemas/RiskLevel" },
                      flags:          { type: "array", items: { type: "string" } },
                      recommendation: { type: "string" },
                      regulatoryBasis: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/ngo-risk ────────────────────────────────────────────────────
      "/api/ngo-risk": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "ngoRisk",
          summary: "NGO / charity CFT risk assessment",
          description: [
            "Counter-terrorism financing risk assessment for non-profit",
            "organisations.  Evaluates sector, operating jurisdictions,",
            "foreign funding sources, beneficiary populations, and",
            "registration gaps.",
            "",
            "**FATF R.8 / NPO Guidance 2023:** CFT obligations for NPO sector.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["organizationName", "countryCode", "operatingCountries", "fundingSources", "isRegistered", "sector"],
                  properties: {
                    organizationName:    { type: "string" },
                    registrationNumber:  { type: "string" },
                    countryCode:         { type: "string" },
                    operatingCountries:  { type: "array", items: { type: "string" } },
                    fundingSources:      { type: "array", items: { type: "string" } },
                    beneficiaries:       { type: "string" },
                    annualBudget:        { type: "number" },
                    hasGovernmentFunding: { type: "boolean" },
                    hasForeignFunding:   { type: "boolean" },
                    foreignFundingCountries: { type: "array", items: { type: "string" } },
                    isRegistered:        { type: "boolean" },
                    sector:              { type: "string", enum: ["humanitarian", "religious", "advocacy", "development", "education", "health", "other"] },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "NGO/NPO CFT risk result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:             { type: "boolean" },
                      riskScore:      { type: "number" },
                      riskLevel:      { $ref: "#/components/schemas/RiskLevel" },
                      cftFlags:       { type: "array", items: { type: "string" } },
                      recommendation: { type: "string" },
                      regulatoryBasis: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/proliferation-risk ──────────────────────────────────────────
      "/api/proliferation-risk": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "proliferationRisk",
          summary: "Proliferation financing risk assessment",
          description: [
            "Assesses proliferation financing (PF) risk for a subject,",
            "transaction, or trade.  Evaluates UN Security Council resolution",
            "exposure, dual-use goods indicators, export-control flags,",
            "and destination country risk.",
            "",
            "**FATF R.7 / UN SCR 1737, 1718, 2231:** PF targeted financial sanctions.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subjectName", "subjectType", "countryCode", "destinationCountries"],
                  properties: {
                    subjectName:          { type: "string" },
                    subjectType:          { type: "string", enum: ["individual", "corporate", "vessel", "freight_forwarder"] },
                    countryCode:          { type: "string" },
                    commodities:          { type: "array", items: { type: "string" } },
                    hsCodesInvolved:      { type: "array", items: { type: "string" } },
                    destinationCountries: { type: "array", items: { type: "string" } },
                    endUserCertificate:   { type: "boolean" },
                    exportLicense:        { type: "boolean" },
                    transactionValue:     { type: "number" },
                    relatedEntities:      { type: "array", items: { type: "string" } },
                    paymentStructure:     { type: "string", enum: ["advance", "lc", "open_account", "cash", "crypto"] },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Proliferation financing risk result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:                      { type: "boolean" },
                      riskScore:               { type: "number" },
                      riskLevel:               { $ref: "#/components/schemas/RiskLevel" },
                      sanctionsExposure:        { type: "array", items: { type: "string" } },
                      unResolutionsApplicable:  { type: "array", items: { type: "string" } },
                      exportControlFlags:       { type: "array", items: { type: "string" } },
                      recommendation:           { type: "string" },
                      regulatoryBasis:          { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/trade-finance-risk ──────────────────────────────────────────
      "/api/trade-finance-risk": {
        post: {
          tags: ["Risk Assessment"],
          operationId: "tradeFinanceRisk",
          summary: "Trade-based money laundering (TBML) risk",
          description: [
            "LLM-assisted TBML risk analysis.  Detects over/under-invoicing,",
            "multiple-invoicing, phantom shipments, dual-use goods, sanctions",
            "evasion via re-routing, and complex payment structures inconsistent",
            "with trade norms.",
            "",
            "**FATF Guidance on Trade-Based ML (2006 / 2021 update) / R.20.**",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["exporter", "importer", "goods", "invoiceValue", "currency"],
                  properties: {
                    exporter:        { type: "string" },
                    exporterCountry: { type: "string" },
                    importer:        { type: "string" },
                    importerCountry: { type: "string" },
                    goods:           { type: "string", description: "Description of the goods" },
                    hsCode:          { type: "string" },
                    invoiceValue:    { type: "number" },
                    currency:        { type: "string" },
                    paymentTerms:    { type: "string", enum: ["advance", "lc", "open_account", "cash", "crypto"] },
                    shippingRoute:   { type: "array", items: { type: "string" }, description: "Intermediate countries in shipment route" },
                    inconsistencies: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "TBML risk assessment",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:             { type: "boolean" },
                      riskScore:      { type: "number" },
                      riskLevel:      { $ref: "#/components/schemas/RiskLevel" },
                      schemes:        { type: "array", items: { type: "object", properties: { scheme: { type: "string" }, description: { type: "string" }, evidence: { type: "string" }, fatfRef: { type: "string" } } } },
                      priceAnalysis:  { type: "object" },
                      recommendation: { type: "string" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/vessel-check ────────────────────────────────────────────────
      "/api/vessel-check": {
        post: {
          tags: ["Screening"],
          operationId: "vesselCheck",
          summary: "Vessel sanctions screening",
          description: [
            "Screens a vessel (by IMO number) against sanctions lists and",
            "returns ownership chain, flag state risk, and AIS/dark-shipping",
            "indicators.  Accepts single or batch IMO numbers.",
            "",
            "**FATF Guidance on Trade-Based ML / OFAC Vessel Advisory 2020.**",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    imoNumber:  { type: "string", example: "9166778", description: "Single IMO number" },
                    imoNumbers: { type: "array", items: { type: "string" }, description: "Batch of IMO numbers (max 50)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Vessel screening result(s)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:      { type: "boolean" },
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            imoNumber:      { type: "string" },
                            vesselName:     { type: "string" },
                            flagState:      { type: "string" },
                            flagRisk:       { type: "string" },
                            sanctioned:     { type: "boolean" },
                            ownershipChain: { type: "array", items: { type: "string" } },
                            riskLevel:      { $ref: "#/components/schemas/RiskLevel" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/batch-screen ────────────────────────────────────────────────
      "/api/batch-screen": {
        post: {
          tags: ["Screening"],
          operationId: "batchScreen",
          summary: "Batch sanctions & watchlist screening",
          description: [
            "Screens up to 500 subjects in a single request.  Each subject is",
            "run through the same pipeline as `/api/screen` with configurable",
            "concurrency.  Returns per-subject results with overall batch stats.",
            "",
            "**FATF R.6:** Periodic bulk re-screening of customer portfolios.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subjects"],
                  properties: {
                    subjects: {
                      type: "array",
                      maxItems: 500,
                      items: {
                        type: "object",
                        required: ["name"],
                        properties: {
                          id:         { type: "string", description: "Caller-supplied identifier echoed in results" },
                          name:       { type: "string" },
                          entityType: { type: "string", enum: ["individual", "corporate", "vessel"] },
                          country:    { type: "string" },
                        },
                      },
                    },
                    threshold: { type: "number", minimum: 0, maximum: 1, default: 0.7 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Batch screening results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:      { type: "boolean" },
                      total:   { type: "integer" },
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id:    { type: "string" },
                            name:  { type: "string" },
                            band:  { $ref: "#/components/schemas/RiskLevel" },
                            score: { type: "number" },
                            hits:  { type: "array", items: { $ref: "#/components/schemas/ScreeningHit" } },
                          },
                        },
                      },
                      stats: {
                        type: "object",
                        properties: {
                          critical: { type: "integer" },
                          high:     { type: "integer" },
                          medium:   { type: "integer" },
                          low:      { type: "integer" },
                          clear:    { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/str-narrative ───────────────────────────────────────────────
      "/api/str-narrative": {
        post: {
          tags: ["Compliance"],
          operationId: "strNarrative",
          summary: "SAR / STR narrative generation",
          description: [
            "Generates a FATF R.20-compliant Suspicious Transaction Report",
            "narrative using Claude LLM.  Returns the narrative with word count,",
            "quality score, FATF coverage gaps, and goAML field mappings.",
            "",
            "**UAE FDL 10/2025 Art.17:** 48-hour STR filing obligation.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subjectName", "activityDescription"],
                  properties: {
                    subjectName:          { type: "string" },
                    subjectType:          { type: "string", enum: ["individual", "corporate"] },
                    subjectNationality:   { type: "string" },
                    activityDescription:  { type: "string", description: "Description of the suspicious activity" },
                    amounts:              { type: "string" },
                    dates:                { type: "string" },
                    counterparty:         { type: "string" },
                    jurisdiction:         { type: "string" },
                    redFlags:             { type: "array", items: { type: "string" } },
                    actionsTaken:         { type: "string" },
                    additionalFacts:      { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "STR/SAR narrative",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:               { type: "boolean" },
                      narrative:        { type: "string" },
                      wordCount:        { type: "integer" },
                      qualityScore:     { type: "number" },
                      fatfR20Coverage:  { type: "array", items: { type: "string" } },
                      missingElements:  { type: "array", items: { type: "string" } },
                      goAmlFields:      { type: "object" },
                      regulatoryBasis:  { type: "string" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/goaml-xml ───────────────────────────────────────────────────
      "/api/goaml-xml": {
        post: {
          tags: ["Compliance"],
          operationId: "goamlXml",
          summary: "goAML XML generation",
          description: [
            "Generates a goAML-compliant STR/SAR XML file for manual submission",
            "through the UAE FIU goAML portal.  Validates the output against the",
            "goAML XSD schema v5.x and returns any validation warnings.",
            "",
            "**UAE FDL 10/2025 Art.17 / UAE FIU goAML Technical Guide v3.1.**",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reportType", "reportingEntity", "subject", "transactions"],
                  properties: {
                    reportType:      { type: "string", enum: ["STR", "SAR", "CTR", "THR"] },
                    reportingEntity: {
                      type: "object",
                      required: ["name", "type", "licenseNumber"],
                      properties: {
                        name:          { type: "string" },
                        type:          { type: "string" },
                        licenseNumber: { type: "string" },
                        contactName:   { type: "string" },
                        contactEmail:  { type: "string", format: "email" },
                      },
                    },
                    subject: {
                      type: "object",
                      required: ["name", "type"],
                      properties: {
                        name:        { type: "string" },
                        type:        { type: "string", enum: ["individual", "corporate"] },
                        nationality: { type: "string" },
                        dob:         { type: "string", format: "date" },
                        idNumber:    { type: "string" },
                      },
                    },
                    transactions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          amount:    { type: "number" },
                          currency:  { type: "string" },
                          date:      { type: "string", format: "date" },
                          type:      { type: "string" },
                          reference: { type: "string" },
                        },
                      },
                    },
                    narrative: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "goAML XML output",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:                  { type: "boolean" },
                      xml:                 { type: "string", description: "Full goAML-compliant XML string" },
                      validationErrors:    { type: "array", items: { type: "string" } },
                      validationWarnings:  { type: "array", items: { type: "string" } },
                      reportRef:           { type: "string", example: "UAE-STR-2025-1716473920000" },
                      submissionChecklist: { type: "array", items: { type: "string" } },
                      degraded:            { type: "boolean" },
                      degradedReason:      { type: "string" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/audit-trail ─────────────────────────────────────────────────
      "/api/audit-trail": {
        get: {
          tags: ["Compliance"],
          operationId: "auditTrail",
          summary: "Tamper-evident audit trail",
          description: [
            "Returns paginated entries from the FNV-1a tamper-evident audit chain.",
            "The chain is verified hourly by the `audit-chain-probe` scheduled",
            "function.  Optionally includes per-entry hash status.",
          ].join("\n"),
          parameters: [
            { name: "page",     in: "query", schema: { type: "integer", default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
            { name: "verified", in: "query", schema: { type: "boolean", default: false }, description: "Include computed hash status per entry" },
          ],
          responses: {
            "200": {
              description: "Paginated audit entries",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:           { type: "boolean" },
                      totalEntries: { type: "integer" },
                      page:         { type: "integer" },
                      pageSize:     { type: "integer" },
                      entries:      { type: "array", items: { $ref: "#/components/schemas/AuditEntry" } },
                      tamperMarker: {
                        type: "object",
                        nullable: true,
                        properties: {
                          detectedAt:   { type: "string", format: "date-time" },
                          tamperedAt:   { type: "array", items: { type: "integer" } },
                          brokenLinkAt: { type: "array", items: { type: "integer" } },
                          totalEntries: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/hs-cases ────────────────────────────────────────────────────
      "/api/hs-cases": {
        get: {
          tags: ["Case Management"],
          operationId: "listHsCases",
          summary: "List compliance cases",
          description: "Returns a paginated, filterable list of Hawkeye Sterling compliance cases with summary statistics.",
          parameters: [
            { name: "status",      in: "query", schema: { type: "string", enum: ["open", "under_review", "escalated", "closed"] } },
            { name: "severity",    in: "query", schema: { type: "string", enum: ["critical", "high", "medium", "low", "clear"] } },
            { name: "subjectId",   in: "query", schema: { type: "string" } },
            { name: "riskCategory", in: "query", schema: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] } },
          ],
          responses: {
            "200": {
              description: "Case list with summary",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:      { type: "boolean" },
                      cases:   { type: "array", items: { $ref: "#/components/schemas/HsCase" } },
                      summary: {
                        type: "object",
                        properties: {
                          total:      { type: "integer" },
                          bySeverity: { type: "object" },
                          byStatus:   { type: "object" },
                          slaNearing: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
        post: {
          tags: ["Case Management"],
          operationId: "createHsCase",
          summary: "Create a compliance case",
          description: "Opens a new compliance case from a screening or investigation result.  Automatically sets SLA deadline based on severity.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subjectName"],
                  properties: {
                    subjectId:    { type: "string" },
                    subjectName:  { type: "string" },
                    severity:     { type: "string", enum: ["critical", "high", "medium", "low", "clear"], default: "medium" },
                    riskCategory: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
                    hits:         { type: "array", items: { type: "object" }, description: "Screening hits that triggered the case" },
                    notes:        { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Case created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:   { type: "boolean" },
                      case: { $ref: "#/components/schemas/HsCase" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/designation-alerts ──────────────────────────────────────────
      "/api/designation-alerts": {
        get: {
          tags: ["Case Management"],
          operationId: "designationAlerts",
          summary: "Sanctions designation alerts",
          description: [
            "Returns recent sanctions designations and delistings from OFAC,",
            "UN SC, EU, UKOFSI, and UAE EOCN.  Combines stored alerts (populated",
            "hourly) with a live delta from OpenSanctions or the FATF RSS feed.",
          ].join("\n"),
          parameters: [
            { name: "since", in: "query", schema: { type: "string", format: "date-time" }, description: "Return alerts newer than this ISO timestamp (default: 24h ago)" },
            { name: "limit", in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 100 } },
          ],
          responses: {
            "200": {
              description: "Designation alert feed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:     { type: "boolean" },
                      alerts: { type: "array", items: { $ref: "#/components/schemas/DesignationAlert" } },
                      total:  { type: "integer" },
                      since:  { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/quick-screen ────────────────────────────────────────────────
      "/api/quick-screen": {
        post: {
          tags: ["Screening"],
          operationId: "quickScreen",
          summary: "Real-time subject screening against global sanctions watchlists",
          description: [
            "Screens a subject against OFAC SDN, UN Consolidated, EU FSF,",
            "UK OFSI, UAE EOCN/LTL, and additional watchlists.  Returns a",
            "severity verdict and list of hits within the 5-second SLA.",
            "Authentication required.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject"],
                  properties: {
                    subject: { $ref: "#/components/schemas/Subject" },
                    candidates: {
                      type: "array",
                      description: "Optional caller-supplied candidate list; if omitted the live watchlist corpus is used",
                      items: {
                        type: "object",
                        properties: {
                          listId:  { type: "string" },
                          listRef: { type: "string" },
                          name:    { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Screening completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok", "severity", "hits", "durationMs"],
                    properties: {
                      ok:       { type: "boolean" },
                      severity: { type: "string", enum: ["clear", "low", "medium", "high", "critical"] },
                      hits:     { type: "array", items: { $ref: "#/components/schemas/Hit" } },
                      durationMs: { type: "integer" },
                      screeningWarnings: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/gdpr/erasure ────────────────────────────────────────────────
      "/api/gdpr/erasure": {
        post: {
          tags: ["Compliance"],
          operationId: "gdprErasure",
          summary: "Pseudonymise a data subject (GDPR Art. 17 right to erasure)",
          description: [
            "Pseudonymises all stored personal data for the given subject ID.",
            "The erasure is irreversible.  An audit record is created for",
            "the erasure event.  Compliant with GDPR Art. 17.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subjectId"],
                  properties: {
                    subjectId: { type: "string", description: "Unique identifier of the data subject to erase", example: "sub-ae-123456" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Subject successfully pseudonymised",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok", "pseudonymized"],
                    properties: {
                      ok:            { type: "boolean" },
                      pseudonymized: { type: "boolean", description: "True when pseudonymisation was applied" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/gdpr/export ─────────────────────────────────────────────────
      "/api/gdpr/export": {
        get: {
          tags: ["Compliance"],
          operationId: "gdprExport",
          summary: "Export all data held for a subject (GDPR Art. 15 right of access)",
          description: [
            "Returns a structured JSON export of all personal data held for the",
            "specified subject, including screening records, audit entries, and",
            "case records.  Compliant with GDPR Art. 15.",
          ].join("\n"),
          parameters: [
            { name: "subjectId", in: "query", required: true, schema: { type: "string" }, description: "Unique identifier of the data subject" },
          ],
          responses: {
            "200": {
              description: "GDPR data export",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      subjectId:        { type: "string" },
                      exportedAt:       { type: "string", format: "date-time" },
                      screeningRecords: { type: "array", items: { type: "object" } },
                      auditEntries:     { type: "array", items: { $ref: "#/components/schemas/AuditEntry" } },
                      caseRecords:      { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/sanctions/status ────────────────────────────────────────────
      "/api/sanctions/status": {
        get: {
          tags: ["Compliance"],
          operationId: "sanctionsStatus",
          summary: "Get health and freshness status of all loaded sanctions lists",
          description: [
            "Returns per-list freshness, entity counts, and ingestion timestamps",
            "for all configured sanctions lists.  Used by ops dashboards and",
            "automated monitoring to verify list data is up-to-date.",
          ].join("\n"),
          responses: {
            "200": {
              description: "Sanctions list status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok", "lists"],
                    properties: {
                      ok:          { type: "boolean" },
                      lists: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            listId:       { type: "string" },
                            displayName:  { type: "string" },
                            configured:   { type: "boolean" },
                            entityCount:  { type: "integer", nullable: true },
                            lastModified: { type: "string", format: "date-time", nullable: true },
                            ageHours:     { type: "number", nullable: true },
                            status:       { type: "string", enum: ["healthy", "stale", "missing", "unconfigured", "degraded"] },
                          },
                        },
                      },
                      lastUpdated: { type: "string", format: "date-time", description: "Timestamp of the most recent successful list refresh" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/webhooks ────────────────────────────────────────────────────
      "/api/webhooks": {
        get: {
          tags: ["Case Management"],
          operationId: "listWebhooks",
          summary: "List all registered webhook endpoints",
          description: "Returns all webhook registrations for the authenticated tenant.",
          responses: {
            "200": {
              description: "List of registered webhooks",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["webhooks"],
                    properties: {
                      webhooks: { type: "array", items: { $ref: "#/components/schemas/WebhookRegistration" } },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
        post: {
          tags: ["Case Management"],
          operationId: "registerWebhook",
          summary: "Register a new webhook endpoint",
          description: [
            "Registers a new HTTPS webhook endpoint to receive compliance events.",
            "Payloads are signed with HMAC-SHA256 using the provided secret.",
            "Events include: screening.completed, case.opened, case.closed, sanctions.list.refreshed.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url", "events"],
                  properties: {
                    url:         { type: "string", format: "uri", description: "HTTPS endpoint URL", example: "https://your-system.example.com/webhooks/hawkeye" },
                    events:      { type: "array", items: { type: "string" }, description: "Event types to subscribe to", example: ["screening.completed"] },
                    secret:      { type: "string", description: "Signing secret for HMAC payload verification" },
                    description: { type: "string", description: "Optional human-readable description" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Webhook registered successfully",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/WebhookRegistration" } },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/workflow/run ────────────────────────────────────────────────
      "/api/workflow/run": {
        post: {
          tags: ["Case Management"],
          operationId: "workflowRun",
          summary: "Run workflow rules against a subject",
          description: [
            "Runs the configured workflow rule engine against the provided subject",
            "and screening context.  Returns actions recommended by the rule set",
            "(e.g. escalate, close, request documents).  Used for automated case",
            "routing and triage.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject"],
                  properties: {
                    subject: { $ref: "#/components/schemas/Subject" },
                    screeningResult: {
                      type: "object",
                      description: "Optional prior screening result",
                      properties: {
                        severity: { type: "string", enum: ["clear", "low", "medium", "high", "critical"] },
                        hits:     { type: "array", items: { $ref: "#/components/schemas/Hit" } },
                      },
                    },
                    ruleSetId: { type: "string", description: "Optional specific rule set to evaluate; defaults to tenant default" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Workflow evaluation result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:    { type: "boolean" },
                      actions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type:   { type: "string" },
                            reason: { type: "string" },
                            ruleId: { type: "string" },
                          },
                        },
                      },
                      rulesEvaluated: { type: "integer" },
                      durationMs:     { type: "integer" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/predictive-risk ─────────────────────────────────────────────
      "/api/predictive-risk": {
        get: {
          tags: ["Risk Assessment"],
          operationId: "predictiveRisk",
          summary: "Get predictive risk score and signals for a subject",
          description: [
            "Returns an ML-derived predictive risk score for a subject along with",
            "contributing signals and a natural-language explanation.  Scores are",
            "based on behavioural baselines, transaction patterns, and history.",
          ].join("\n"),
          parameters: [
            { name: "subjectId", in: "query", schema: { type: "string" }, description: "Subject identifier to score" },
            { name: "name",      in: "query", schema: { type: "string" }, description: "Subject name (used when subjectId is not available)" },
          ],
          responses: {
            "200": {
              description: "Predictive risk assessment",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["score", "signals", "explanation"],
                    properties: {
                      score: { type: "number", minimum: 0, maximum: 1, description: "Composite risk score (0=lowest, 1=highest risk)" },
                      signals: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name:      { type: "string" },
                            value:     { type: "number" },
                            weight:    { type: "number" },
                            direction: { type: "string", enum: ["up", "down", "neutral"] },
                          },
                        },
                      },
                      explanation:  { type: "string", description: "Natural-language explanation of the risk assessment" },
                      tier:         { type: "string", enum: ["low", "medium", "high", "critical"] },
                      generatedAt:  { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            ...standardResponses,
          },
        },
      },

      // ── /api/health ──────────────────────────────────────────────────────
      "/api/health": {
        get: {
          tags: ["Compliance"],
          operationId: "healthCheck",
          summary: "Platform liveness and sanctions-list health probe",
          description: [
            "Returns the operational status of the platform including brain module",
            "health and mandatory sanctions list freshness.  Returns 200 when fully",
            "healthy, 207 when 1–2 mandatory lists are down, and 503 when 3+ lists",
            "are down or the brain is unavailable.",
          ].join("\n"),
          security: [],
          responses: {
            "200": {
              description: "Platform fully operational",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok", "status"],
                    properties: {
                      ok:                    { type: "boolean" },
                      status:                { type: "string", enum: ["operational", "degraded", "down"] },
                      mandatoryListsHealthy: { type: "boolean" },
                      sanctionsDown:         { type: "integer" },
                      brain:                 { type: "object", properties: { ok: { type: "boolean" } } },
                      ts:                    { type: "string", format: "date-time" },
                      runtime:               { type: "string" },
                      version:               { type: "string" },
                      uptime:                { type: "number", description: "Process uptime in seconds" },
                    },
                  },
                },
              },
            },
            "207": {
              description: "Platform degraded — some mandatory sanctions lists unavailable",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:            { type: "boolean" },
                      status:        { type: "string", enum: ["degraded"] },
                      sanctionsDown: { type: "integer" },
                      downListIds:   { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            "503": {
              description: "Platform down — brain or 3+ mandatory lists unavailable",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
          },
        },
      },
    },
  };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  // requireAuth: false — the OpenAPI spec is a public document.
  const gate = await enforce(req, { requireAuth: false });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const spec = buildSpec(baseUrl);

  return new NextResponse(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
