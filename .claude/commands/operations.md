# Operations & SOP Plugin

**Context:** Process documentation, operational procedures, deployment operations, and SOP drafting for Hawkeye Sterling — a production AML/CFT compliance platform deployed on Netlify serverless + Docker + Kubernetes.

## Capabilities

### Incident Response SOPs
Reference `docs/INCIDENT-RECOVERY.md` for the master runbook. Standard incident workflow:

**P1 — Critical (compliance breach, data exposure, audit chain failure):**
1. Immediately notify MLRO + CTO
2. Freeze affected screening queues
3. Capture audit chain state (do not modify)
4. Open incident in `docs/INCIDENTS.md` with timestamp
5. Engage four-eyes review for any remediation actions
6. File regulatory notification if required (UAE FIU SLA: 30 days)

**P2 — High (LLM service degradation, rate limit breach, circuit breaker open):**
1. Circuit breaker auto-triggers — verify `web/lib/server/circuitBreaker.ts` state
2. Check model-router fallback (Claude → Groq) is active
3. Review egress gate behavior (must remain fail-closed)
4. Update incident log within 1 hour

**P3 — Medium (bias ratio drift, attestation overdue, probe regression):**
1. Flag in MLRO daily digest
2. Assign owner and target resolution date
3. Update COMPLIANCE_GAPS.md if gap not already tracked

### Deployment Checklist
Before deploying to production:
- [ ] `npm run typecheck` — zero errors
- [ ] `npx vitest run` — all pass
- [ ] `node scripts/validate-prompt-hashes.mjs` — manifest current
- [ ] `node scripts/lethal-trifecta-check.mjs` — governance gate pass
- [ ] `cd web && npm run lint` — zero warnings
- [ ] `node scripts/adversarial-runner.mjs --dry-run` — no regressions
- [ ] `npm audit --audit-level=high` — no HIGH/CRITICAL vulnerabilities
- [ ] Semgrep passes (p/typescript, p/nodejs, p/nextjs)
- [ ] All MODEL_REGISTRY attestations current (not overdue)
- [ ] COMPLIANCE_GAPS.md reviewed — no newly OPEN gaps

### Kubernetes Operations
Manifests are in `k8s/`. Key operational concerns:
- `securityContext.runAsNonRoot: true` must remain in all pod specs
- `readOnlyRootFilesystem: true` where possible
- `resources.limits` set for CPU and memory on all containers
- Network policies restrict egress to known endpoints only
- Secrets mounted via env vars (never in image layers)

### Environment Variable Checklist
Critical env vars that must be set in production:
```
ANTHROPIC_API_KEY          — LLM primary (fail-closed if absent)
GROQ_API_KEY               — LLM cost fallback
JWT_SIGNING_SECRET         — Current JWT secret (HS256)
JWT_SIGNING_SECRET_PREV    — Previous JWT secret (zero-downtime rotation)
AUDIT_HMAC_KEY             — Audit chain integrity key
GOAML_REPORTING_ENTITY_ID  — CG-4 OPEN: operator must set real goAML ID
GOAML_REPORTING_ENTITY_BRANCH — CG-4 OPEN: operator must set real branch ID
```

### SOC2 Operational Controls
Key SOC2 controls from `docs/SOC2.md`:
- **CC7.4** (Incident Response): Follow `docs/INCIDENT-RECOVERY.md` — tested annually
- **CC6.1** (Logical Access): All compliance routes behind `enforce.ts` fail-closed auth
- **CC6.6** (Encryption): JWT HS256, audit HMAC-SHA256, Ed25519 regulator tokens
- **CC8.1** (Change Management): All changes via PR + CI pipeline (no direct push to main)

### Compliance Gap Tracker Operations
When reviewing `COMPLIANCE_GAPS.md`:
- **OPEN**: Requires operator/MLRO action — flag in daily digest
- **PARTIAL**: Implementation exists, enrollment/configuration pending — track weekly
- **CLOSED**: Document closure date and evidence
- Never remove a CLOSED gap — keep for audit trail

### SOP Drafting Template
For new operational procedure:
```
## SOP-[ID]: [Title]
**Owner:** [MLRO | CTO | DevOps]
**Trigger:** [When this SOP applies]
**Regulatory anchor:** [Article/Regulation]
**Last reviewed:** [Date]

### Pre-conditions
[What must be true before starting]

### Steps
1. [Action] → [Expected outcome]
2. ...

### Verification
[How to confirm the procedure completed successfully]

### Escalation
[Who to contact if steps fail or outcome is unexpected]
```

## Output Format

For incidents: State severity (P1/P2/P3), required notifications, and immediate actions as numbered steps.
For deployment: Return the checklist with ✅/❌ status against each item.
For SOP drafting: Use the template above with all sections populated.
For gap tracking: Reference the COMPLIANCE_GAPS.md ID, current status, and owner.
