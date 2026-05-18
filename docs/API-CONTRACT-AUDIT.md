# Hawkeye-Sterling — API Contract Audit

Findings from the D15 + D16 + D17 audit on branch tip
`claude/fix-build-failures` `dbb3f7c1` (2026-05-18).

Scope: every route under `web/app/api/**/route.ts` (**391 routes total**).
Methodology: grep-based pattern audit + manual inspection of 30
representative routes. This is a SAMPLE audit, not a per-route line audit.

The findings drive a follow-up migration; the helpers needed
(`buildErrorBody`, `buildSuccessBody`, `validateBody`,
`getRequestId`) all shipped earlier on this branch.

## Headline numbers

| Metric | Count |
|---|---|
| Total routes under `web/app/api/**/route.ts` | 391 |
| Routes already emitting `hint:` field on errors | 10 |
| Routes already emitting `generatedAt:` field | ~10 (same set) |
| Routes using legacy `{ ok: false, error: "<text>" }` shape | ~350+ |
| Routes generating their own `requestId` | 0 (none today) |
| Routes that read incoming `x-request-id` | 0 (none today) |
| Routes using zod validation | 0 (none today; helper just shipped) |

## D15 — uniform error contract (RULE 9)

The mega-prompt RULE 9 specifies every error response must match:

```json
{
  "ok": false,
  "status": 500,
  "error": "snake_case_code",
  "hint": "Human readable explanation.",
  "requestId": "uuid",
  "generatedAt": "ISO-8601"
}
```

### Current state (sampled)

Most routes use a 3-field shape:

```ts
NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 })
```

Missing fields per RULE 9:
- ❌ `status` (the HTTP status is on the response but not mirrored in the body)
- ❌ `hint` (the `error` field carries human-readable text instead of a snake_case code)
- ❌ `requestId` (no propagation today)
- ❌ `generatedAt` (no timestamp today)

Additionally:
- The `error` field today is human-readable English text. RULE 9 calls
  for a snake_case error CODE in `error` and the human-readable text
  in `hint`.

### Helpers shipped on this branch

`buildErrorBody(httpStatus, errorCode, hint, rid)` in
`web/lib/server/request-id.ts` produces the RULE-9-compliant shape.
Used today only in the routes touched on this branch
(`/api/forensic/case/[subjectId]`, the validate.ts helper) — every
other route is pending migration.

### Migration recipe (per route)

```diff
- return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
+ const rid = getRequestId(req);
+ return NextResponse.json(
+   buildErrorBody(400, "invalid_json", "Request body is not valid JSON.", rid),
+   { status: 400, headers: { "x-request-id": rid } },
+ );
```

For routes already gated by `enforce(req)`, the gate response already
includes `x-request-id` from middleware via `applySecurityHeaders` —
calling `getRequestId(req)` reads it back.

### D15 status: **not closed on this branch.**

- ✅ Helper available (`buildErrorBody`).
- ✅ Pattern documented above + in OBSERVABILITY-STANDARDS.md.
- ❌ Per-route migration not done — pending a follow-up wave that
  touches each route. ~350 routes remain.

## D16 — uniform success contract (RULE 10)

RULE 10:

```json
{
  "ok": true,
  "requestId": "uuid",
  "generatedAt": "ISO-8601",
  "...": "endpoint-specific payload"
}
```

### Current state (sampled)

Most routes use:

```ts
NextResponse.json({ ok: true, item: enrichedItem })
NextResponse.json({ ok: true, count: items.length, items })
```

Missing:
- ❌ `requestId`
- ❌ `generatedAt` (the few routes that emit it embed it inside the
  payload field, not at the envelope level)

### Helper shipped

`buildSuccessBody(payload, rid)` returns the envelope. Used today only
in the routes touched on this branch.

### Migration recipe (per route)

```diff
- return NextResponse.json({ ok: true, item: enrichedItem });
+ const rid = getRequestId(req);
+ return NextResponse.json(
+   buildSuccessBody({ item: enrichedItem }, rid),
+   { headers: { "x-request-id": rid } },
+ );
```

### D16 status: **not closed on this branch.**

Same as D15 — helper + recipe shipped, route-by-route migration
pending.

## D17 — API schema drift between similar endpoints

Surveyed pairs:

### `/api/quick-screen` vs `/api/batch-screen`

| Field | quick-screen | batch-screen | drift? |
|---|---|---|---|
| `ok` | ✅ | ✅ | none |
| top-level array of results | `hits[]` | `results[]` | ⚠️ name diverges |
| per-match score field | `score` | `topScore` | ⚠️ name diverges |
| severity | `severity` | `severity` (per row) | none |
| `summary{}` rollup | ❌ (single subject) | ✅ | by design (batch needs rollup) |
| `latencyMs` | ❌ | ✅ | quick-screen lacks |

**Recommended:** both return a `requestId` (post D8) + `generatedAt`
once the contracts are unified. The `hits` / `results` naming should
be aligned in a v2 contract pass — likely renaming `batch-screen`
output to `rows[]` since each entry is a per-row screen result, not a
per-list hit.

### `/api/audit/sign` vs `/api/audit/verify`

| Field | sign | verify |
|---|---|---|
| `ok` | ✅ | ✅ |
| `entry` returned | full entry | per-entry on fault only |
| Error envelope | partial RULE 9 (`hint` present) | partial RULE 9 (`hint` present) |

**Recommended:** /api/audit/sign should also expose a top-level
`head` field mirroring /api/audit/verify so callers can confirm the
new head sequence + hash without an extra round-trip.

### `/api/four-eyes` GET vs POST vs PATCH

| Field | GET | POST | PATCH |
|---|---|---|---|
| `ok` | ✅ | ✅ | ✅ |
| body shape | `{ count, items[] }` | `{ item }` | `{ item, asanaTaskUrl? }` |
| error code style | n/a | English text | English text |

**Recommended:** unify by using `{ ok, items? \| item, asanaTaskUrl? }`.

### `/api/sanctions/status` vs `/api/screening/health` vs `/api/health`

| Field | sanctions/status | screening/health | health |
|---|---|---|---|
| Per-component status field | `status: 'healthy'\|'stale'\|'missing'\|'unconfigured'` | `status: 'healthy'\|'degraded'\|'down'` | `status: 'healthy'\|'degraded'` |
| HTTP status semantics | always 200 (body carries detail) | 200 / 207 / 503 | 200 / 207 (fixed this branch) |
| Detail field | `detail` | `detail` | `detail` |

**Status enum drift:** four different vocabularies across three
endpoints. Recommend canonicalising to `'healthy' | 'degraded' |
'down' | 'unconfigured'` and aliasing per route as needed.

**HTTP semantics drift:** sanctions/status returns 200 with the body
carrying the actual state. screening/health correctly uses 207/503.
Recommend `/api/sanctions/status` switch to 207 when any list is
`stale` or `missing`, 503 when all lists are missing.

## D5 — goAML XSD validation

Surveyed: `src/integrations/goaml-xml.ts` builds the XML; an
existing test `src/integrations/__tests__/goaml-xml.test.ts` covers
shape regression. **No `.xsd` file in the repo.**

The UAE FIU goAML XSD is a controlled artefact distributed to
registered reporting entities via the goAML portal. It is NOT
public-domain redistributable.

**Status: blocked on operator action.**

To close D5:
1. MLRO retrieves the current goAML XSD from
   https://goaml.uae.gov.ae (logged in as a registered RE).
2. Commit the XSD under `src/integrations/schemas/goaml.xsd` (or
   path-equivalent).
3. Wire `libxmljs` or `xmllint` to validate the generated XML in
   `goaml-xml.ts` AND in the test suite.
4. Vitest case: build a known-valid STR XML, validate against XSD,
   expect pass. Build a known-invalid mutation, expect XSD failure.

The code-side wiring is straightforward once the XSD is available.

## Document follow-up scope

Closing D15 + D16 across 391 routes is a multi-day mechanical
migration. The recipe above turns each route into a 3-line diff;
a script could automate the trivial cases. Recommended order:

1. **Tier 1 (~30 routes)** — every route that already shows up in
   `enforce()` audit log: high-traffic, regulator-facing. Migrate
   first.
2. **Tier 2 (~80 routes)** — secondary screening + reporting
   endpoints.
3. **Tier 3 (~280 routes)** — agent-style "AI-helper" endpoints
   that produce LLM output. Lower migration urgency.

D17 schema-drift closures should ride alongside D15/D16 since the
helper migration touches the same lines.
