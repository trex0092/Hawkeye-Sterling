# Reducing Runtime Env Vars — AWS Lambda 4 KB Limit Playbook

**Goal:** keep the *fewest possible* environment variables in the function
runtime so the deployment stays under the **AWS Lambda 4 KB total
environment-variable limit**, while keeping every genuine secret in the
environment (never in source).

> Last reviewed: 2026-06-03. Cross-reference: `SECURITY-NOTES.md` §3, §11.

---

## 0. The key fact most people miss

The 4 KB cap applies **only to variables injected into the *function
runtime***. In Netlify, a variable **"Scoped to Builds"** only is **not**
shipped to the Lambda runtime and **does not count** against the 4 KB budget.

So the cheapest win — **zero code change, zero security change** — is to
narrow the *scope* of any variable that is only consumed at build time to
**"Builds"** in Netlify (Site settings → Environment variables → Scopes).

Already Builds-only (cost you nothing at runtime today):
`BRAIN_REVIEWED_AT`, `BRAIN_VERSION`, `CHARTER_HASH`, `GITHUB_TOKEN`,
`GOOGLE_NEWS_RSS_ENABLED`, `HS_DISABLED`, `MCP_ENABLED`,
`MLRO_RETRIEVAL_CONFIDENCE_THRESHOLD`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_COMTRADE_ENABLED`, `NEXT_PUBLIC_GMAIL_CONFIGURED`,
`NEXT_TELEMETRY_DISABLED`.

(`NEXT_PUBLIC_*` are inlined into the client bundle at build time, so they are
correctly build-only and must NOT be moved to runtime.)

---

## 1. ⛔ MUST stay in the environment — never inline into source

These are secrets. Inlining any of them into code leaks them into git history
and (for client-reachable code) the browser bundle. The CI guardrail
`web/lib/config/__tests__/hs-defaults.test.ts` blocks them from `hs-defaults.ts`.

| Variable | Leak impact |
|---|---|
| `SESSION_SECRET` | Forge any portal session |
| `JWT_SIGNING_SECRET` | Mint valid API / regulator JWTs |
| `AUDIT_CHAIN_SECRET` | **Forge the tamper-evident audit chain — destroys regulatory integrity** |
| `HAWKEYE_SIGNING_KEY` | Forge signed payloads |
| `REPORT_SIGNING_KEY`, `REPORT_ED25519_PRIVATE_KEY` | Forge signed compliance reports / certificates |
| `WEBHOOK_HMAC_SECRET`, `HAWKEYE_WEBHOOK_SECRET` | Forge outbound webhook signatures |
| `ADMIN_TOKEN` | Full admin bypass |
| `LUISA_INITIAL_PASSWORD` | Portal login / recovery |
| `ANTHROPIC_API_KEY`, `GROQ_API_KEY` | Billable LLM access |
| `ASANA_TOKEN` | Write access to your Asana workspace |
| `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Mailbox access |
| `NETLIFY_BLOBS_TOKEN` | Read/write all stored data |
| `UPSTASH_REDIS_REST_TOKEN` | Rate-limit store access |
| `MCP_API_KEY`, `LSEG_WORLDCHECK_API_KEY`, `LSEG_WORLDCHECK_API_SECRET`, `FRAUDSHIELD_API_KEY` | Third-party credentials |

---

## 2. 🟡 Middle tier — endpoint-gating cron tokens

`HAWKEYE_CRON_TOKEN`, `ALERTS_CRON_TOKEN`, `SANCTIONS_CRON_TOKEN`,
`ONGOING_RUN_TOKEN`.

Inlining these lets anyone with **repo access** trigger the corresponding cron
endpoints. Lower blast radius than §1 (they only fire scheduled jobs, and
production also requires Netlify's `x-netlify-scheduled-function` header), but
still **keep them in env**.

**Optional consolidation (code change, not yet applied):** the cron routes
could be made to accept a single shared cron token with fallback, collapsing 4
runtime vars → 1. `/api/cron/transaction-monitor` already accepts
`CRON_SECRET ?? ONGOING_RUN_TOKEN`. Extending this pattern is a deliberate
security-model change — request it explicitly if you want it.

---

## 3. ✅ Safe to remove from the runtime — no secret value involved

### 3a. Delete now — code already falls back (no value needed)

| Variable | Why it's safe to delete | Caveat |
|---|---|---|
| `NETLIFY_SITE_ID` | Code reads `NETLIFY_SITE_ID ?? SITE_ID`; Netlify auto-injects `SITE_ID` into the function runtime. See `web/lib/server/blob-getter.ts`, `audit-chain.ts`, `screening-audit.ts`. | Verify Blobs read/write in a **deploy preview** before deleting in production. |
| `HAWKEYE_DEFAULT_ENTITY_ID` | `getEntity()` falls back to the **first** entry of `HAWKEYE_ENTITIES` when unset (`web/lib/config/entities.ts:114`). | Make sure your primary reporting entity is listed **first** in `HAWKEYE_ENTITIES`. |

### 3b. Inline into code — non-secret, but I need the value from you

These carry no secret material, so they can move into `web/lib/config/hs-defaults.ts`
(env always overrides via the `process.env[...] ?? HS_DEFAULTS.X` pattern). I
can't inline them blind — the values live in your Netlify config, not the repo.

| Variable | Sensitivity | Where it's read | Biggest win? |
|---|---|---|---|
| `HAWKEYE_ENTITIES` | Config data — `goamlRentityId`s are FIU-assigned identifiers, not secrets | `web/lib/config/entities.ts` (`loadEntities`) | ✅ **Largest single runtime var** — inline this first |
| `UPSTASH_REDIS_REST_URL` | The URL is public; only the paired `*_TOKEN` is secret | `web/lib/server/rate-limit.ts`, `circuitBreaker.ts` | medium |
| `GMAIL_CLIENT_ID` | OAuth client IDs are public by design | `web/lib/server/gmail-token.ts`, `web/app/api/auth/gmail/authorize/route.ts` | small |

**To finish 3b:** paste the non-secret values and I will (1) add them to
`hs-defaults.ts` / `entities.ts` with env-override preserved, (2) add them to the
guardrail allowlist, (3) confirm typecheck + tests, then you delete them from
Netlify's *runtime* scope.

---

## 4. Recommended order of operations

1. **Re-scope** every build-only var to "Builds" in Netlify (§0). Free.
2. **Delete** `NETLIFY_SITE_ID` and `HAWKEYE_DEFAULT_ENTITY_ID` (§3a) — verify in
   a deploy preview. Free, no value needed.
3. **Inline** `HAWKEYE_ENTITIES` first (§3b) — the largest runtime var, then
   `UPSTASH_REDIS_REST_URL` and `GMAIL_CLIENT_ID` if you still need headroom.
4. Leave everything in §1 and §2 in the environment.

Steps 1–2 alone usually clear the 4 KB pressure with **no security tradeoff**.
