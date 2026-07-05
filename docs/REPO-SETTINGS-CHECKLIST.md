# Repository Settings Checklist

Some governance controls live in **GitHub repository settings**, not in files —
they cannot be committed. This checklist tracks them so the repository's
configured posture is auditable alongside the in-repo governance surface. Tick
each item once set; note the date and who set it.

> Owner: repository maintainer (MLRO). Review at each access review
> (see [`IDENTITY-ACCESS-ATTESTATION.md`](./IDENTITY-ACCESS-ATTESTATION.md)).

## Branch protection — `main`

- [ ] Require a pull request before merging
- [ ] Require **review from Code Owners** (activates [`.github/CODEOWNERS`](../.github/CODEOWNERS))
- [ ] Require status checks to pass: `build`, `typecheck`, `security-audit`, `semgrep`, `CodeQL`, `Governance check`
- [ ] Require branches to be up to date before merging
- [ ] Require conversation resolution before merging
- [ ] Do not allow bypassing the above (include administrators)
- [ ] Restrict force pushes and deletions on `main`

## Signed commits (clears the "Unverified" badge)

- [ ] Enable **Require signed commits** on `main`, and/or configure signed merge
      commits, so GitHub-generated merge commits are shown Verified

## Security & analysis

- [ ] Dependency graph: enabled
- [ ] Dependabot alerts: enabled
- [ ] Dependabot security updates: enabled (config in [`.github/dependabot.yml`](../.github/dependabot.yml))
- [ ] Secret scanning + push protection: enabled
- [ ] Code scanning (CodeQL): enabled (workflow in [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml))
- [ ] Private vulnerability reporting: enabled (aligns with [`SECURITY.md`](../SECURITY.md))

## Features

- [ ] **Discussions**: enabled (renders [`.github/DISCUSSION_TEMPLATE/`](../.github/DISCUSSION_TEMPLATE))
- [ ] Issues: enabled (templates in [`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE))
- [ ] Wikis: disabled (docs live in-repo under `docs/`)

## About panel (repository landing page)

- [ ] Description set (e.g. *"Regulator-grade AML/CFT/sanctions/PEP/adverse-media compliance platform."*)
- [ ] Website set (deployment URL, if public)
- [ ] Topics set: `aml`, `cft`, `sanctions-screening`, `pep`, `adverse-media`,
      `compliance`, `ai-governance`, `fatf`, `iso-42001`, `nextjs`, `typescript`

## Community Standards

- [ ] Insights → Community Standards shows **100%** (README, Code of Conduct,
      Contributing, License, Security policy, Issue templates, PR template) — all
      files are present in-repo; confirm the checklist renders green

## Actions

- [ ] Actions permissions: allow only actions used by this repo
- [ ] Require approval for workflows from outside collaborators
- [ ] Default `GITHUB_TOKEN` permissions: read-only (workflows request scopes explicitly)
