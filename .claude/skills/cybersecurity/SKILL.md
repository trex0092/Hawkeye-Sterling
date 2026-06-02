---
name: cybersecurity
description: "Security-aware development for compliance-critical codebases. Applies MITRE ATT&CK, MITRE ATLAS (AI adversarial), NIST AI RMF, NIST CSF 2.0, and D3FEND frameworks when reviewing or writing security-sensitive code. Use this skill when: (1) reviewing auth, audit, or egress code in web/lib/server/, (2) adding or modifying adversarial probes, (3) evaluating AI governance decisions in the model registry, (4) assessing a proposed change against NIST AI RMF GOVERN/MAP/MEASURE/MANAGE, (5) identifying attack surfaces in new features. Triggers: security review, threat model, MITRE, NIST, AI attack, adversarial, governance, probe, audit, egress."
---

# Cybersecurity Skill — Hawkeye Sterling

Guides security-aware development across the Hawkeye Sterling AML/CFT platform using five industry frameworks mapped to the codebase's specific attack surfaces.

## Framework Quick-Reference

| Framework | Scope | Primary files |
|-----------|-------|---------------|
| MITRE ATT&CK | Adversary tactics & techniques (traditional) | `web/lib/server/adversarial-probes.ts`, `web/lib/server/enforce.ts` |
| MITRE ATLAS | AI-specific adversarial behavior | `web/lib/server/adversarial-probes.ts`, `web/lib/server/hallucination-gate.ts` |
| NIST CSF 2.0 | Cybersecurity framework (GOVERN/IDENTIFY/PROTECT/DETECT/RESPOND/RECOVER) | `web/lib/server/`, `k8s/`, `Dockerfile` |
| NIST AI RMF | AI risk management (GOVERN/MAP/MEASURE/MANAGE) | `web/lib/server/ai-governance.ts`, `web/lib/server/drift-monitor.ts`, `web/lib/server/bias-monitor.ts` |
| D3FEND | Defensive countermeasures | `web/lib/server/rate-limit.ts`, `web/lib/server/circuitBreaker.ts`, `web/lib/server/egress-check.ts` |

---

## MITRE ATLAS — AI Adversarial Tactics Relevant to Hawkeye Sterling

When reviewing or adding adversarial probes, check coverage against these ATLAS tactics:

### Reconnaissance (AML.TA0001)
- **AML.T0000** — Search for victim's publicly available research materials
- **AML.T0001** — Search victim-owned websites

### Resource Development (AML.TA0002)
- **AML.T0017** — Develop capabilities (craft adversarial inputs)

### Initial Access (AML.TA0003)
- **AML.T0010** — ML supply chain compromise ← covered by `SC-001`, `SC-002` probes
- **AML.T0012** — Valid account abuse

### ML Attack Staging (AML.TA0004)
- **AML.T0019** — Publish poisoned datasets
- **AML.T0020** — Train proxy model

### Model Access (AML.TA0005)
- **AML.T0040** — ML model inference API access

### Discovery (AML.TA0006)
- **AML.T0024** — Discover ML artifacts ← covered by `DATA-002` probe
- **AML.T0025** — Discover model ontology ← covered by `AI-ATK-001` probe

### Collection (AML.TA0007)
- **AML.T0035** — ML artifact collection
- **AML.T0037** — Data from information repositories ← covered by `DATA-001` probe

### Exfiltration (AML.TA0009)
- **AML.T0024** — Exfiltrate ML model ← covered by `AI-ATK-001`, `DATA-001` probes

### Impact (AML.TA0010)
- **AML.T0031** — Erode ML model integrity
- **AML.T0043** — Craft adversarial data ← covered by `AI-ATK-002` probe
- **AML.T0048** — Generate adversarial ML examples

### Uncovered attack surfaces (gap analysis)
The following ATLAS tactics have **no current probe coverage** — consider adding:
- AML.T0048: Adversarial ML examples (perturbed entity names designed to evade name-matching)
- AML.T0031: Model integrity erosion via systematic drift probing

---

## NIST AI RMF — Mapping to Hawkeye Sterling Controls

| RMF Function | Control | Implementation |
|---|---|---|
| GOVERN-1.1 | Policies for AI risk | `web/lib/server/ai-governance.ts` MODEL_REGISTRY |
| GOVERN-1.2 | Accountability structures | `web/lib/server/audit-chain.ts`, four-eyes gate |
| GOVERN-1.7 | AI risk communication | `docs/governance/AI_GOVERNANCE_POLICY.md` |
| MAP-1.1 | Context established | System prompt in `src/policy/systemPrompt.ts` |
| MAP-2.2 | Scientific integrity | Prompt hash manifest `scripts/prompt-hash-manifest.json` |
| MEASURE-2.5 | AI system performance | `src/brain/registry/eval-harness.ts` (50 scenarios) |
| MEASURE-2.6 | Bias testing | `web/lib/server/bias-monitor.ts`, biasRatio ≤ 1.15 |
| MEASURE-2.7 | Adversarial testing | `web/lib/server/adversarial-probes.ts`, `scripts/adversarial-runner.mjs` |
| MANAGE-1.3 | Incident response | `docs/INCIDENT-RECOVERY.md`, `docs/INCIDENTS.md` |
| MANAGE-2.4 | Model drift detection | `web/lib/server/drift-monitor.ts` |

**When reviewing AI governance changes**, verify changes preserve all four RMF functions above.

---

## NIST CSF 2.0 — Development Checklist

Before shipping a security-sensitive change, verify:

### GOVERN
- [ ] Model registry entry has `riskTier`, `approval`, `cardRef`
- [ ] New AI capability documented in `docs/governance/AI_GOVERNANCE_POLICY.md`

### IDENTIFY
- [ ] Threat model updated if new external data input added
- [ ] COMPLIANCE_GAPS.md updated if gap identified

### PROTECT
- [ ] `enforce(req)` called with `requireAuth: true` on any new compliance route
- [ ] PII masked before LLM transmission (check `web/lib/server/llm.ts`)
- [ ] No raw IP in logs — use `anonIpKey()` HMAC hash

### DETECT
- [ ] Audit chain entry written for new AI decision or screening result
- [ ] Prometheus metric incremented for new observable operation
- [ ] OTel span added at boundary point

### RESPOND
- [ ] Egress gate fails closed (`held_review` on error, never `allowed`)
- [ ] Hallucination gate is fire-and-forget (wrapped in `void ... .catch(...)`)

### RECOVER
- [ ] New probe added to `adversarial-probes.ts` if new attack surface introduced

---

## D3FEND — Defensive Countermeasures Map

| D3FEND Technique | Implementation |
|---|---|
| D3-AH: Application Hardening | Dockerfile non-root, read-only fs, k8s securityContext |
| D3-NTF: Network Traffic Filtering | Egress gate `web/lib/server/egress-check.ts` |
| D3-RA: Resource Access | `enforce.ts` fail-closed auth + `requireRole()` RBAC |
| D3-IDA: Input Data Analysis | PII redaction pipeline in `web/lib/server/llm.ts` |
| D3-OAM: Outbound Access Management | Egress tipping-off gate |
| D3-FCR: Fault Countermeasure Recovery | Circuit breaker `web/lib/server/circuitBreaker.ts` |

---

## Usage Patterns

### Before editing `web/lib/server/` security files
1. Identify which NIST CSF function is affected (PROTECT/DETECT/RESPOND)
2. Check D3FEND countermeasure is preserved
3. Verify no architecture invariant is broken (see CLAUDE.md)

### Adding a new adversarial probe
1. Assign an ID from the correct category (`AI-ATK-NNN`, `SC-NNN`, `DATA-NNN`, `GOV-NNN`, etc.)
2. Map to MITRE ATLAS tactic/technique in a comment
3. Write a `passCondition` that is regex-based, not string-includes-only
4. Add stub response for the category in `scripts/adversarial-runner.mjs`
5. Run `node scripts/adversarial-runner.mjs --dry-run` to verify

### Reviewing AI governance registry changes
1. Confirm `riskTier` is appropriate (High for screening/SAR, Medium for classification)
2. Confirm NIST AI RMF GOVERN-1.2 audit accountability is maintained
3. Check attestation dates are not overdue
