# Hawkeye Sterling — Unified Screening

A server-side sanctions, PEP, and adverse-media screening engine built for
the Hawkeye-Sterling AML/CFT suite. Replaces the browser-side simulated
`tfs-engine.js` with real data ingestion, fuzzy matching across scripts,
and a tamper-evident audit trail that stands up to regulator inspection.

## What it does

1. **Ingests** public sanctions + PEP feeds from their canonical publishers
   and stores them in a local, indexed entity store.
2. **Screens** any subject (person or entity) across every list in a single
   call, using composite scoring: character-level fuzzy + token-set ratio +
   phonetic (Soundex + Double Metaphone) + date-of-birth + country.
3. **Enriches** medium/high hits with adverse-media coverage from GDELT.
4. **Audits** every screening, every list refresh, every MLRO decision
   into a hash-chained append-only log. Tampering with any prior entry
   breaks the chain and is detected by `verify`.
5. **Exposes** the whole thing as an MCP server so Claude Desktop, Claude
   Code, Cursor, or any other MCP-aware host can screen names in
   conversation.

## Sources

| ID | Publisher | License | Format |
|---|---|---|---|
| `opensanctions-default` | OpenSanctions consolidated (UN + OFAC + EU + UK + national lists + PEPs + crime + wanted) | CC-BY 4.0 | CSV |
| `un-consolidated` | UN Security Council Consolidated List | Public domain | XML |
| `ofac-sdn` | US Treasury OFAC Specially Designated Nationals | Public domain | CSV |
| `uk-ofsi` | UK HM Treasury Office of Financial Sanctions Implementation | Open Government Licence | CSV |
| `eu-fsf` | EU Financial Sanctions File | EU (token-gated; disabled by default, covered by OpenSanctions) | XML |
| `gdelt-adverse-media` | GDELT 2.0 Document API | GDELT (attribution) | JSON (runtime) |

The OpenSanctions `default` dataset already consolidates UN + OFAC + EU +
UK + many national lists + PEPs in one attribution-friendly feed, so it is
the primary source. The individual publisher adapters remain as
authoritative fallbacks for jurisdictions that require screening against
the publisher's own file (e.g., OFAC for US correspondent banking).

## Layout

```
screening/
  config.js              source registry, paths, thresholds, FATF lists
  index.js               public API: init, refreshAll, screen, batch, decision, verify
  lib/
    normalize.js         Unicode → canonical form + transliteration (Arabic, Cyrillic)
    phonetic.js          Soundex + Double Metaphone
    fuzzy.js             Levenshtein, Jaro–Winkler, token-set, token-sort, partial
    score.js             composite scoring + band classification
    http.js              fetch with on-disk cache, ETag, retries, gzip
    store.js             JSON-backed entity store with phonetic + trigram indexes
    audit.js             hash-chained append-only log
    diff.js              source list diff (added / removed / updated)
  sources/
    base.js              runBulkIngest helper, CSV + XML parsers
    opensanctions.js
    ofac.js
    un.js
    uk.js
    eu.js
    adverse-media.js     GDELT runtime adapter
  bin/
    refresh.mjs          CLI: refresh sources
    screen.mjs           CLI: screen a subject
    verify.mjs           CLI: verify audit chain
    mcp-server.mjs       MCP stdio server
  test/
    smoke.mjs            offline unit tests
```

## Install & first run

Zero runtime dependencies — requires only Node ≥ 20.

```bash
cd screening
node bin/refresh.mjs              # download & index all enabled sources
node bin/screen.mjs "Vladimir Putin"
node bin/screen.mjs "ACME Trading LLC" --type entity --country AE
node bin/verify.mjs               # verify the audit chain
```

Data is stored under `.screening/` at the repository root (override via
`HAWKEYE_SCREENING_DIR`). The store is a single JSON file; the audit log
is NDJSON.

## Programmatic API

```js
import Screening from './screening/index.js';

await Screening.init();
await Screening.refreshAll();                          // once per day via cron

const result = await Screening.screen({
  name: 'Mohammed Bin Salman',
  type: 'person',
  dob: '1985-08-31',
  countries: ['SA'],
  subjectId: 'CUST-00123',
});

// result.decision   →  'clear' | 'review' | 'block'
// result.topBand    →  'reject' | 'low' | 'medium' | 'high' | 'exact'
// result.hits[]     →  scored matches with source, score, signals
// result.adverseMedia[] (when topBand ≥ medium)
// result.auditSeq   →  sequence number in the immutable audit chain
```

### Recording decisions

```js
await Screening.decision(
  result.caseId,
  'false-positive',
  'DOB mismatch confirmed via passport scan',
  'mlro.luisa'
);
```

Decisions are appended to the audit chain and never modify the original
screen entry. The resulting log can be exported verbatim for regulator
inspection.

### Verifying the audit trail

```js
const v = await Screening.verify();
// { ok: true, entries: 1847, break: null }
```

If any prior entry has been edited the verifier reports `ok: false` and
identifies the sequence number where the chain broke. For additional
guarantees, the daily refresh job can embed `Screening.stats().auditHead`
into a Git commit message so the chain is anchored to the repository's
immutable history.

## Scheduling

Recommended: run `node screening/bin/refresh.mjs` every 6 hours from cron
or a GitHub Actions schedule. Sanctions publishers typically update once
per day; 6-hourly refresh keeps the store fresh without pressure on
publisher infrastructure. Conditional HTTP requests (ETag +
If-Modified-Since) mean unchanged lists cost a single round-trip.

## Thresholds

Default score bands are tuned for a UAE / Panama MLRO caseload and can be
overridden via environment variables or the `thresholds` option on any
call:

| Band     | Default score | Decision  |
|----------|---------------|-----------|
| `exact`  | ≥ 0.995       | block     |
| `high`   | ≥ 0.92        | block     |
| `medium` | ≥ 0.82        | review    |
| `low`    | ≥ 0.72        | review    |
| `reject` | < 0.62        | clear     |

Override via env: `HAWKEYE_T_HIGH=0.90 HAWKEYE_T_MEDIUM=0.80 ...`

## MCP integration

Register the server with any MCP host. For Claude Desktop
(`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "hawkeye-screening": {
      "command": "node",
      "args": ["/absolute/path/to/Hawkeye-Sterling/screening/bin/mcp-server.mjs"]
    }
  }
}
```

Tools exposed:

| Tool | Purpose |
|---|---|
| `screen_subject` | screen one subject |
| `screen_batch` | screen many subjects |
| `refresh_sources` | refresh sanctions feeds |
| `record_decision` | log an MLRO decision on a case |
| `whitelist_entity` | mark a stored entity as a false positive |
| `verify_audit` | verify the hash-chained audit log |
| `list_sources` | list sources + last refresh status |
| `audit_tail` | tail the audit log, optionally filtered |

Because the server speaks JSON-RPC 2.0 directly and the audit chain is
append-only, all tool calls from LLM hosts are recorded with the same
integrity guarantees as CLI calls. This makes it safe to give a model
agentic access to screening — a regulator can still reconstruct every
decision.

## Smoke tests

```bash
cd screening
node test/smoke.mjs
```

Runs offline. Verifies the matcher, audit chain roundtrip, tamper
detection, and store indexing. CI-friendly exit codes.

## What this replaces / supplements

- **Supplements** `tfs-engine.js`: that file is the browser-side UI state
  for list status pages. It stays. The new module is the server-side data
  and decision layer.
- **Feeds** `scripts/*.mjs`: counterparty registers, customer file
  summaries, filing drafts, and board AML packs can import `Screening`
  directly to populate sanctions/PEP sections with real hits instead of
  narrative.
- **Feeds** the MCP interface: MLROs can screen names directly from Claude
  Code or Claude Desktop while drafting a filing.

## Regulatory posture

- No proprietary data — all sources are publicly licensed.
- No customer data leaves the local machine except GDELT queries, which
  only transmit the subject's name (by design, adverse-media search
  cannot avoid naming the subject).
- Audit chain covers FATF Recommendation 11 (record-keeping) and the
  equivalent provisions in UAE FDL 10/2025, Panamanian Law 23 of 2015,
  and most national AML frameworks.
- Retention is controlled by the caller — the audit file is append-only
  but never deleted by this module.

## Limitations (and what to add next)

- The embedded XML/CSV parsers are pragmatic, not exhaustive. They work
  against current UN, OFAC, UK OFSI, and OpenSanctions feed layouts. A
  publisher format change would require an adapter update.
- The entity store is a single JSON file. Tested comfortably up to ~250k
  entities. Beyond that, swap `lib/store.js` for a SQLite backend — the
  API is narrow enough that only that one file needs replacing.
- Fuzzy matching covers Latin, Arabic, and Cyrillic scripts. CJK
  transliteration is not implemented; CJK names require a Latin alias in
  the source data (which OpenSanctions already provides).
- Adverse media is GDELT-only. For richer coverage, a second adapter
  against a licensed news API can be added under `sources/` without any
  core changes.
