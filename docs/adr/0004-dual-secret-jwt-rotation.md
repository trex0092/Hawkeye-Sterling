# ADR-0004: Dual-secret JWT rotation

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** MLRO, Engineering Lead
- **Governance-impacting:** Yes
- **Regulatory anchor:** SOC 2 CC6.1 (logical access); UAE FDL 20/2018 (record-keeping continuity)

## Context

Session and service tokens are signed JWTs. Rotating the signing secret is a
routine security hygiene requirement, but a naive single-secret rotation
invalidates every live token at the instant of rotation — forcing re-auth,
breaking in-flight regulated workflows, and creating an availability incident on
a fail-closed platform. We need to rotate secrets with **zero downtime** while
keeping the algorithm pinned.

## Decision

We will verify JWTs against **two secrets** — current and previous — while
signing only with the current one (`web/lib/server/jwt.ts`):

- Signing always uses `JWT_SIGNING_SECRET`.
- Verification accepts a token signed by either `JWT_SIGNING_SECRET` or
  `JWT_SIGNING_SECRET_PREV`.
- The algorithm is pinned to **HS256**; `alg: none` and any non-HS256 token are
  rejected.
- Rotation procedure: promote current → prev, set a new current, redeploy. Live
  tokens signed with the old secret remain valid until natural expiry, then the
  prev slot is retired on the next rotation.

The `JWT_SIGNING_SECRET_PREV` verification path must not be collapsed to a
single secret — doing so reintroduces the downtime it exists to prevent.

## Consequences

- Secrets rotate with no forced re-auth and no broken in-flight workflows.
- Two secrets are trusted simultaneously during the overlap window — an accepted,
  bounded trade-off; the prev secret is retired at the following rotation.
- Enforced as an invariant (see [`CLAUDE.md`](../../CLAUDE.md) #3); a CodeQL
  query (`jwt-decode-outside-jwt-ts.ql`) prevents JWT verification from being
  reimplemented outside this hardened module.
- Collapsing to a single secret is a governance reversal requiring a superseding
  ADR.

## Alternatives considered

- **Single-secret rotation** — invalidates all live tokens on rotation; rejected.
- **Asymmetric (RS/ES) keys with a JWKS endpoint** — stronger key separation but
  adds a key-distribution surface and latency not justified at current scale;
  retained as a future option, not adopted now.
