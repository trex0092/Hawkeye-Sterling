---
name: ecc
description: "Agent harness instincts for security-critical, compliance-first development. Enforces research-before-code discipline, security-aware editing, and cross-faculty context maintenance across Hawkeye Sterling's 508 TypeScript files. Use this skill when: (1) about to edit any file in web/lib/server/ (security instincts), (2) about to add a new feature (research-first gate), (3) navigating the 15 brain faculties (context instincts), (4) reviewing a change for compliance architecture invariants. Triggers: ecc, instinct, research first, security check, before editing, compliance check."
---

# ECC Agent Instincts — Hawkeye Sterling

Operationalizes the ECC (Enhanced Coding Companion) philosophy for the Hawkeye Sterling compliance platform: security-aware, research-first, architecture-respecting.

---

## Security Instincts

Run these mental checks **before editing any file in `web/lib/server/`**:

### Authentication & Authorization (`enforce.ts`, `jwt.ts`)
- Is `enforce(req)` being called with `requireAuth: true`?
- Is `requireRole()` being used for SAR, goAML, four-eyes, ai-override routes?
- Is JWT HS256 pinned? (never `alg: none`)
- Is the dual-secret rotation path (`JWT_SIGNING_SECRET_PREV`) preserved?

### PII & Credential Safety
- No raw IP addresses in logs — must use `anonIpKey()` HMAC hash
- No API key values in logs — `keyIdPrefix: plaintext.slice(0, 8)` at most
- No PII in LLM prompts without redaction (check `web/lib/server/llm.ts` pipeline)
- No `X-Forwarded-For` first value trusted — always use last (proxy-appended)

### Audit Chain
- Does this change involve an AI decision, screening result, SAR filing, or four-eyes action?
- If yes: `writeAuditChainEntry()` must be called with a `tenantId`
- Audit chain is append-only — never delete or overwrite entries

### Egress Gate
- Egress gate must fail closed: missing API key, LLM failure, or parse failure → `held_review`
- Never `return { allowed: true }` on an error path

### Hallucination Gate
- Any `await` on the hallucination gate must be wrapped in `void ... .catch(...)`
- Must not block the response path

### Metrics
- `# HELP`/`# TYPE` emitted once per Prometheus metric family, not per label set
- Increment relevant metric counter for new observable operations

---

## Research-First Gate

**Before implementing any new feature or fix**, answer these questions:

1. **Does this already exist?** Search `web/lib/server/`, `src/brain/`, `src/integrations/` first.
   - Auth patterns → `enforce.ts`
   - LLM calls → `llm.ts`, `llm-fallback.ts`
   - Audit writing → `audit-chain.ts`
   - Rate limiting → `rate-limit.ts`
   - Metrics → `metrics-store.ts`

2. **Which architecture invariant applies?** (CLAUDE.md lists 10 — check before coding)

3. **Is there a test?** If adding a probe or governance entry, a test or dry-run must exist.

4. **Does this touch the system prompt?** If yes:
   - Update `scripts/prompt-hash-manifest.json`
   - Run `node scripts/validate-prompt-hashes.mjs`

5. **Does this touch a MODEL_REGISTRY entry?** If yes:
   - Confirm `riskTier`, `approval`, `cardRef` populated
   - Verify `nextAttestationDue` is set correctly

---

## Context Instincts — Navigating 508 Files

### Faculty Map (quick orientation)
```
src/brain/
├── (207 root files)  — Screening orchestrators, entity resolution, adverse media NLP
├── lib/              — Utilities: name matching, crypto risk, graph theory, jurisdiction
├── modes/            — 158 behavioral/analytical modes + WAVE3/WAVE4 typology batches
├── registry/         — Governance: adversarial probes, eval harness, citation validation
└── __tests__/        — 109 test files

web/lib/server/       — All production server-side controls
web/app/api/          — Route handlers (each calls enforce(req) first)
src/integrations/     — model-router.ts (Claude + Groq), external API clients
src/policy/           — systemPrompt.ts (the compliance charter)
```

### Editing a brain faculty file?
- Check `src/brain/registry/eval-harness.ts` — does the eval harness cover this faculty?
- Check `__tests__/` for existing tests in the same wave/mode family
- Check `scripts/check-mode-versions.mjs` — mode version pins must be explicit

### Editing a route handler?
- Pattern: `enforce(req)` → business logic → `writeAuditChainEntry()` → return
- Check `web/app/api/metrics/route.ts` for Prometheus metric family names

---

## Pre-Commit Checklist

Before committing any change to this codebase:

- [ ] `npm run typecheck` — no TS errors
- [ ] `npx vitest run` — unit tests pass
- [ ] `node scripts/validate-prompt-hashes.mjs` — prompt integrity verified
- [ ] `node scripts/lethal-trifecta-check.mjs` — governance check passes
- [ ] `cd web && npm run lint` — lint clean (max-warnings=0)
- [ ] If adversarial probes modified: `node scripts/adversarial-runner.mjs --dry-run`
