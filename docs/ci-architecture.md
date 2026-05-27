# CI/CD Architecture

## Overview

Hawkeye Sterling uses a multi-tier GitHub Actions pipeline that enforces a strict security gate order: all security and quality checks must pass before the production build runs.

```
Push / PR (concurrency: cancel stale PR runs, never cancel main)
│
├── TIER 1 — parallel, no dependencies
│   ├── build          [20m] compile → typecheck → unit tests → integration tests → governance
│   ├── security-audit [15m] npm audit → SBOM → Trivy CVE scan → SARIF → Security tab
│   ├── semgrep        [15m] SAST (p/typescript + p/nodejs + p/nextjs) → SARIF → Security tab
│   ├── k8s-validate   [10m] kubeconform against Kubernetes 1.31.0 schemas
│   └── gitleaks       [10m] full-history secret scan (100+ credential patterns)
│
├── TIER 2 — depends on build
│   └── lint-web       [15m] web typecheck + ESLint root + Next.js lint
│
└── TIER 3 — production gate (ALL must pass)
    └── nextjs-build   [25m] Next.js production build + 9-route presence check
        needs: build, security-audit, semgrep, k8s-validate, lint-web, gitleaks
```

A security failure in any Tier 1 job blocks `nextjs-build`. There is no path to a signed or deployed artifact without passing every gate.

---

## Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `ci.yml` | push/PR to main | Main validation pipeline (all 7 jobs above) |
| `release.yml` | push tag `v*.*.*` | SLSA provenance + Trivy scan + Cosign image signing |
| `codeql.yml` | push/PR to main + weekly Mon 02:00 UTC | Deep CodeQL security analysis |
| `dependency-review.yml` | PR to main | Blocks PRs introducing HIGH/CRITICAL CVE packages |
| `nightly-eval.yml` | weekly Mon 03:00 UTC + manual | Adversarial probes + eval harness KPI battery |
| `load-test.yml` | weekly Mon 04:00 UTC + manual | k6 load test (p95 ≤ 5s @ 50 VUs) |
| `asana-rebuild.yml` | manual dispatch | Rebuilds Asana board section layout |
| `labels.yml` | push .github/labels.yml + manual | GitHub label sync |

---

## Security Gates

| Gate | Tool | Blocks | Finding → |
|------|------|--------|-----------|
| Dependency CVEs | `npm audit --audit-level=high` | `nextjs-build` | Fix or document in .trivyignore |
| Filesystem CVEs | Trivy 0.28.0 (SARIF) | `nextjs-build` | Security tab + fix or add to .trivyignore |
| SAST | Semgrep 1.90.0 (SARIF) | `nextjs-build` | Security tab + fix or add `# nosemgrep` comment |
| Full-history secrets | Gitleaks 8.22.1 | `nextjs-build` | Rotate secret + purge from git history |
| In-source secrets | Custom grep (sk-ant-*, AKIA*) | `nextjs-build` (via security-audit) | Rotate + remove from source |
| SAST (deep) | CodeQL security-extended | PR blocked + Security tab | Fix or dismiss with justification |
| New vulnerable deps | dependency-review-action | PR merge | Upgrade or document exception |
| K8s schema | kubeconform 0.6.7 | `nextjs-build` | Fix manifest against K8s 1.31.0 schema |
| Auth opt-out count | Custom grep (requireAuth:false) | `nextjs-build` | Bump ALLOWED_COUNT with documented justification |
| Prompt hash integrity | validate-prompt-hashes.mjs | build | Run `node scripts/validate-prompt-hashes.mjs --update` |
| Reasoning mode pins | check-mode-versions.mjs | build | Add version pin + MLRO/CO approval |
| Control 5.08 | lethal-trifecta-check.mjs | build | Fix disposition engine logic |

---

## Release Pipeline

```
push tag v*.*.* 
│
├── build-and-sign     — create tarball, compute SHA-256, generate SBOM, attach to release
├── provenance         — SLSA level 2 signed provenance (slsa-framework/slsa-github-generator)
├── scan-osint-bridge  — Trivy container CVE scan (SARIF → Security tab) — MUST PASS FIRST
└── sign-osint-bridge  — Cosign keyless OIDC signing (sigstore transparency log)
                         only runs after scan-osint-bridge passes
```

An image is **never signed before passing a Trivy scan**. `sign-osint-bridge` has `needs: [build-and-sign, scan-osint-bridge]`.

---

## SBOM Generation

SBOMs are generated in CycloneDX format for SOC 2 Type II / ISO 27001 evidence:

- **CI runs** (`ci.yml`): `sbom-{sha}` artifact, 365-day retention
- **Releases** (`release.yml`): `hawkeye-sterling-{version}.cdx.json` attached to the GitHub Release

Primary command: `npm sbom --sbom-format cyclonedx --sbom-type library --omit dev`  
Fallback (if peer-dep conflict prevents `--omit dev`): `npm sbom --sbom-format cyclonedx --sbom-type library` (includes dev deps)  
If both fail: CI fails — no fake fallback SBOM is produced.

The React 19 peer-dep conflict (`react-debounce-input`, `react-inspector`) may trigger the fallback. Tracked in `COMPLIANCE_GAPS.md`.

---

## Dependency Updates

Dependabot (`.github/dependabot.yml`) opens weekly PRs for:
- npm packages — root workspace
- npm packages — web/ workspace  
- GitHub Actions

All Dependabot PRs run the full CI pipeline and the `dependency-review` workflow before merging.

---

## Security Tab

The following tools upload SARIF to the GitHub Security → Code scanning tab:
- **CodeQL** — deep semantic analysis (weekly + push/PR)
- **Trivy (filesystem)** — dependency CVE scan (every push/PR)
- **Trivy (container)** — osint-bridge image CVE scan (every release)
- **Semgrep** — pattern-based SAST (every push/PR)

Findings persist in the Security tab even after the triggering commit is gone. Dismiss with justification; never ignore silently.

---

## Required Secrets

| Secret | Used By | Purpose |
|--------|---------|---------|
| `GITHUB_TOKEN` | all workflows | Built-in — container registry, release uploads, SARIF upload |
| `ANTHROPIC_API_KEY` | `nightly-eval.yml` | Live API eval harness (only runs in main repo, not forks) |
| `SEMGREP_APP_TOKEN` | `ci.yml` semgrep job | Optional — enables Semgrep Cloud dashboards; falls back to local rules |
| `LOAD_TEST_TARGET_URL` | `load-test.yml` | k6 load test target endpoint |
| `LOAD_TEST_API_KEY` | `load-test.yml` | Auth header for load test requests |
| `ASANA_TOKEN` | `asana-rebuild.yml` | Asana board section reconstruction |

---

## Scheduled Workflows

| Schedule | Workflow | Purpose |
|----------|---------|---------|
| Mon 02:00 UTC | `codeql.yml` | Weekly deep CodeQL scan |
| Mon 03:00 UTC | `nightly-eval.yml` | Adversarial probes + eval KPI battery |
| Mon 04:00 UTC | `load-test.yml` | k6 performance regression check |

All three are staggered to avoid runner contention.

---

## Maintenance Notes

### Updating pinned action versions
Action versions are pinned (e.g., `trivy-action@0.28.0`, `semgrep==1.90.0`). Dependabot opens PRs for `github-actions` ecosystem updates. Review before merging — verify changelogs for breaking changes.

### Adding a public route (requireAuth: false)
1. Add the route to `web/app/api/.../route.ts` with `requireAuth: false`
2. Increment `ALLOWED_COUNT` in the `Auth coverage gate` step in `ci.yml`
3. Add a comment documenting why the route is public (no PII, public metadata, etc.)

### Suppressing a Trivy CVE
1. Add the CVE ID to `.trivyignore` with a comment: reason, date reviewed, next review date
2. Requires MLRO/Security team sign-off for CRITICAL or HIGH suppressions

### Suppressing a Semgrep finding
Add `# nosemgrep: <rule-id>` on the offending line with a justification comment.

### Updating the prompt hash manifest
After intentionally changing a `SYSTEM_PROMPT` constant:
```bash
node scripts/validate-prompt-hashes.mjs --update
git add scripts/prompt-hash-manifest.json
```

### Changing the K8s target version
Update `-kubernetes-version` in the `k8s-validate` job in `ci.yml` to match the target cluster version.
