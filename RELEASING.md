# Releasing

This document describes how a Hawkeye Sterling release is cut, verified, and
published with provenance. Releases are a governance touchpoint: a material
change ships only after its CI gate is green and any required committee decision
is recorded (see [`GOVERNANCE.md`](./GOVERNANCE.md)).

## Versioning

We follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

- **MAJOR** — a breaking API/contract change, or the reversal of an architecture
  invariant (requires an ADR and a committee decision).
- **MINOR** — backward-compatible capability.
- **PATCH** — backward-compatible fix or hardening.

Tags are `vX.Y.Z`. The changelog is maintained in
[`CHANGELOG.md`](./CHANGELOG.md) (and `docs/CHANGELOG.md`); GitHub's generated
notes are categorised by [`.github/release.yml`](./.github/release.yml).

## Pre-release gate

A release candidate must pass the full CI gate on `main`:

1. `lint` → 2. `typecheck` → 3. unit tests → 4. `security-audit`
   (npm audit HIGH+CRITICAL, secret scan, Trivy, SBOM) → 5. Semgrep →
   6. CodeQL → 7. prompt-hash integrity → 8. integration tests.

Plus the governance checks:

```bash
npm run brain:audit
node scripts/validate-prompt-hashes.mjs
node scripts/lethal-trifecta-check.mjs
node scripts/weaponize-brain.mjs        # weaponized-brain integrity (mode content hashes)
node scripts/validate-governance.mjs    # governance-surface consistency
```

> A HIGH/CRITICAL advisory in `npm audit` blocks a release. Resolve it (or record
> an explicit, time-boxed operator-accepted deviation) before tagging — do not
> ship over a red `security-audit`.

## Cutting a release

1. Confirm `main` is green and the changelog is updated.
2. Ensure any invariant-affecting change has an accepted ADR.
3. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
4. The release workflows produce the artifacts and provenance:
   - [`release.yml`](./.github/workflows/release.yml) — build, SBOM, container image, Cosign signing.
   - [`release-provenance.yml`](./.github/workflows/release-provenance.yml) — SLSA provenance attestation.
5. Verify the published SBOM and signature are attached to the release.

## Supply-chain integrity

- **SBOM** — CycloneDX SBOM generated in CI and attached to the release.
- **Signing** — container images signed with Cosign (keyless OIDC).
- **Provenance** — SLSA provenance attestation for release artifacts.
- **Posture** — OpenSSF Scorecard ([`scorecard.yml`](./.github/workflows/scorecard.yml))
  and Security Insights ([`SECURITY-INSIGHTS.yml`](./SECURITY-INSIGHTS.yml)).

## Rollback

If a release regresses a control path, follow the incident runbook
([`docs/INCIDENT-RECOVERY.md`](./docs/INCIDENT-RECOVERY.md)): revert to the last
known-good tag, record an incident in [`docs/INCIDENTS.md`](./docs/INCIDENTS.md),
and open a compliance gap if a control was weakened.
