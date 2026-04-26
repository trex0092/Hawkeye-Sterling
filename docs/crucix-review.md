# Code Review: calesthio/Crucix

**Repository:** https://github.com/calesthio/Crucix  
**Review Date:** 2026-04-26  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

Crucix is a local OSINT intelligence dashboard that aggregates 29 public data sources (geopolitical events, financial indicators, satellite tracking, environmental sensors, social media, conflict databases) into a single real-time HUD. It runs as a Node.js Express server with Server-Sent Events for live updates, a delta engine for change detection, optional LLM-generated analysis, and Telegram/Discord bot integration. Zero cloud dependencies; single runtime dependency (Express).

The architecture is sound for its scope: modular sources, graceful degradation, clean separation between data collection, delta computation, and presentation. The main concerns are around Telegram scraping legality, the absence of tests, keyword-based content classification, and a few security considerations in dashboard rendering.

---

## Strengths

### 1. Minimal Dependency Philosophy

The project ships with a single runtime dependency (`express`). All 29 source integrations are plain `fetch()` calls over public APIs. Discord is optional. The LLM layer uses raw HTTP, not an SDK. This means:
- Tiny attack surface (one dependency to audit)
- Trivial deployment (`npm install && node server.mjs`)
- No supply-chain risk from 40+ transitive SDK dependencies

The `undici` version override in `package.json` (forced to 7.24.4) is the only exception — it suggests a known vulnerability or compatibility issue in the version pulled transitively by Node.js or Express, and it's the right way to handle it.

### 2. `Promise.allSettled()` Orchestration

`briefing.mjs` uses `Promise.allSettled()` with a 30-second per-source timeout for all 29 sources. This is correct:
- One failing or hanging source never blocks the sweep
- Results include both successful data and error details per source
- Performance metrics are collected per source

A `Promise.all()` design (common in less careful implementations) would cause the entire sweep to fail if any single source times out.

### 3. Delta Engine with Semantic Deduplication

The delta engine is the most technically interesting component. For Telegram posts, it deduplicates using a three-tier key strategy: message ID → channel+date → normalized content hash (SHA256 of text with timestamps/numbers stripped). This prevents the same wire post re-shared across channels from generating multiple alerts — a real problem for conflict-zone monitoring where the same report propagates through dozens of channels.

The threshold system (percentage-based for financial metrics, count-based for geospatial events) is well-calibrated. The `±500 thermal detections` threshold for NASA FIRMS prevents wildfire noise from triggering daily alerts in fire-prone regions.

### 4. Graceful LLM Degradation

The LLM layer returns `null` from `createLLMProvider()` if no provider is configured or an unknown provider is specified, and the server handles `null` cleanly. Trade idea generation and signal evaluation simply don't run. This is the correct pattern — the system's core value (data aggregation and delta tracking) doesn't depend on LLM availability.

### 5. SSE for Live Dashboard Updates

Using Server-Sent Events rather than WebSockets for the dashboard push is the right call for this use case: unidirectional updates from server to browser, no need for client-to-server messages, automatic reconnection via the browser's EventSource API, and no WebSocket handshake overhead.

---

## Issues and Concerns

### 1. Telegram Web Scraping Is Legally and Technically Fragile

**Severity: High**

The Telegram source module has two modes:
1. Bot API (primary) — uses `getUpdates()` on a Telegram bot token
2. Web scraping fallback — parses `https://t.me/s/{channel}` HTML

The web scraping path is fragile and legally gray. Telegram's Terms of Service prohibit automated scraping of their web interface. The HTML structure of `t.me/s/` can change without notice, breaking parsing silently. If Telegram implements rate limiting or blocks the scraper's IP, the fallback fails with no signal to the user.

More significantly: the bot API mode (`getUpdates`) is designed for bots responding to messages sent *to* them, not for monitoring arbitrary channels. A bot cannot read public channel posts via `getUpdates` unless it's a member. The code may silently return empty results for channels the bot hasn't joined.

**Recommendation:** Document clearly that the bot API mode requires the bot to be a member of each monitored channel. For public channel monitoring, the official path is the Telegram MTProto API (via a user account and a library like `gramjs`). Warn users in the README that the scraping fallback is unofficial.

### 2. No Tests

**Severity: High**

There are no tests in the repository. For a system that:
- Parses external API responses that change without notice
- Does text classification via keyword matching
- Computes financial deltas that trigger alerts

...the absence of tests means regressions are invisible. A changed field name in the FRED API response or a Telegram HTML structure change will silently degrade output.

**Recommendation:** Add at minimum: (a) unit tests for the delta engine's numeric/count threshold logic using hardcoded inputs; (b) fixture-based tests for each source parser using saved API responses; (c) a smoke test that runs `briefing.mjs` against mock source modules.

### 3. Keyword-Based Classification Is Brittle

**Severity: Medium**

Content categorization (conflicts, economy, health, crisis in GDELT; military, geopolitics, finance in Telegram) is done by matching title/text against hardcoded keyword lists. This approach:
- Produces false positives (an article about "striking" oil prices categorized as conflict)
- Misses articles that discuss topics without using the expected keywords
- Has no language handling for non-English content (GDELT covers 100+ languages)

The system is advertised as providing "expert navigation patterns," but keyword matching is closer to a search filter than reasoning.

**Recommendation:** This is an area where the optional LLM layer could add real value — classify articles/posts using a zero-shot prompt rather than keywords. Alternatively, document the keyword lists so users can customize them.

### 4. Dashboard XSS Risk from External Content Rendering

**Severity: Medium**

The SECURITY.md explicitly lists "cross-site scripting in the dashboard" and "unsafe rendering of external content" as high-priority concerns — which implies the maintainer is aware of the risk. The dashboard renders content from 29 external sources (article titles, Telegram posts, GDELT event descriptions, Reddit post text) that ultimately comes from the web.

If any of these are rendered via `innerHTML` without sanitization, a malicious actor could craft a news article title or Telegram post containing `<script>` tags or `javascript:` URIs that execute in the user's browser. The risk is mitigated somewhat by the local-only deployment model (no internet-exposed dashboard by default), but Docker deployments that expose port 3117 externally are vulnerable.

**Recommendation:** Audit all dashboard rendering paths for `innerHTML` usage. Replace with `textContent` for user-visible strings, or add DOMPurify sanitization for any HTML that must be rendered. The README should explicitly warn against exposing port 3117 to the internet without authentication.

### 5. GDELT Rate Limit Hardcoded, Other Sources Unthrottled

**Severity: Low–Medium**

The GDELT module respects a 5.5-second delay between its API calls. No other source modules appear to have rate limiting. For sources like FRED (22 indicators fetched per sweep), BLS, Treasury, and EIA, firing 22+ concurrent requests per 15-minute sweep could hit rate limits or get the server's IP temporarily blocked.

There's no shared rate-limit manager or per-domain request queue. Each source module is responsible for its own throttling — and most don't implement any.

**Recommendation:** Add a lightweight per-domain request queue or minimum-interval enforcer in `utils` that source modules can opt into. For free public APIs (FRED, BLS, NOAA), respecting rate limits also reduces the risk of being banned.

### 6. AGPL-3.0 Copyleft Has Integration Implications

**Severity: Low (but important for adopters)**

The AGPL-3.0 license requires that any software incorporating Crucix's code that is provided as a network service must release its complete source code under the same license. This is more restrictive than MIT or Apache 2.0. Developers who want to integrate Crucix's source modules into a proprietary dashboard or SaaS product cannot do so without open-sourcing their entire application.

This is not a bug — it's an intentional license choice — but it should be clearly noted in the README for developers evaluating integration.

---

## Code Quality Notes

### Source Module Pattern
Each of the 29 source modules exports a `briefing()` async function returning a structured object. This is a clean, consistent interface. The 30-second timeout wrapper in `briefing.mjs` is applied uniformly. The pattern makes adding a new source straightforward (implement `briefing()`, import it, add to `Promise.allSettled()`).

### Config Pattern
`crucix.config.mjs` reads environment variables with sensible defaults and exports a single config object. All magic values (port, refresh interval, API keys, delta thresholds) are centralized. This is good practice.

### Server State
The server uses module-level mutable state (`let sweepInProgress`, `let latestData`, `let clients`) rather than a proper state container. This is fine for a single-process Node.js server but makes the code harder to test in isolation.

### Error Logging
`briefing.mjs` captures per-source errors with source name, error message, and duration. This structured error log is surfaced in the health API response. This is well above average for a project of this size.

---

## What Can Be Added to the Hawkeye-Sterling App

| Feature | How to Use | Effort |
|---------|-----------|--------|
| **Live financial pulse** | Wire FRED, Treasury, BLS, EIA source modules; surface macro indicators (VIX, yields, CPI) in a widget | Low — source modules are standalone |
| **GDELT news feed** | Pull top geopolitical events by topic; display as a live ticker with tone/sentiment | Low — `briefing()` returns structured JSON |
| **SSE live dashboard** | Adopt the SSE pattern from `server.mjs` for push updates without WebSocket complexity | Low — standard browser EventSource |
| **Delta alerting** | Adapt the delta engine to track changes in your app's own metrics over time | Medium — requires adapting thresholds |
| **Conflict/crisis monitoring** | Surface ACLED, ReliefWeb, WHO alerts; useful for risk-aware financial or logistics features | Low — modules are drop-in |
| **Telegram channel monitoring** | Monitor public channels relevant to your domain; pipe summaries to a notification feed | Medium — requires Telegram bot setup |
| **LLM signal analysis** | Use the LLM factory pattern to route AI analysis across multiple providers with a single abstraction | Low — `lib/llm/index.mjs` is reusable |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Architecture | Very Good | `Promise.allSettled`, SSE, modular sources, single dep |
| Delta engine | Very Good | Semantic dedup, calibrated thresholds, multi-tier keying |
| Data breadth | Excellent | 29 sources across geopolitical/financial/environmental |
| Tests | None | Major gap for a parsing-heavy, alert-generating system |
| Security | Fair | XSS risk flagged by maintainer; scraping ToS concerns |
| Telegram integration | Poor | Scraping fallback is fragile and legally gray |
| Classification quality | Fair | Keyword matching; LLM layer not used for classification |
| License | Note | AGPL-3.0 blocks proprietary integrations |

---

## Recommendation

Impressive scope for a solo project with minimal dependencies. The architecture is clean and the delta engine is well-thought-out. The two priority fixes before any serious deployment are: (1) audit dashboard rendering paths for XSS, and (2) clarify the Telegram integration's actual capabilities vs. documented claims. The keyword classification and lack of tests are the main quality gaps.

**Suggested priority fixes:**
1. Audit `jarvis.html` for `innerHTML` usage; replace with `textContent` or add DOMPurify
2. Document Telegram bot API limitations (bot must be channel member); warn against relying on scraping fallback
3. Add fixture-based tests for at minimum the delta engine and GDELT/FRED parsers
4. Add per-domain request throttling for FRED and other high-frequency source calls
5. Add a README warning against exposing port 3117 publicly without authentication
