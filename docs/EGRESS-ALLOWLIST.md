# Egress Allowlist — Adverse-Media & Source-Intelligence Retrieval

## Why this exists

Hawkeye Sterling's adverse-media dossier (`/api/news-search`) and several
source-triangulation domains fan out to external news and OSINT feeds at
request time. When the deployment's network policy blocks outbound traffic to
those hosts, **every feed fetch fails** and the screening engine reports:

- `retrieval: "unavailable"` from `/api/news-search` (0 feeds reachable), and
- the UI banners **"Signals uncorroborated — live retrieval unavailable"** and
  **"Live news retrieval unavailable"** on the subject detail panel.

This is **deliberate FATF R.10 fail-safe behaviour**: a zero-article result is
NOT presented as a confirmed negative finding when retrieval could not run. It
also means the keyword-classifier categories (e.g. "corruption / organised
crime") are reference-text matches only — they are not backed by retrieved
articles until a reachable feed returns them.

If adverse-media evidence is not showing for a subject who is genuinely
reported in the press, **the first thing to check is egress**, using the steps
below.

## Required outbound hosts

Allow HTTPS (443) egress to the following from the runtime that serves
`/api/news-search` (Netlify Functions / container / k8s pod):

| Host | Purpose |
|---|---|
| `news.google.com` | Google News RSS (100+ locale adverse-media fan-out) |
| `api.gdeltproject.org` | GDELT Doc 2.0 global news (keyless) |
| `aleph.occrp.org`, `*.occrp.org` | OCCRP Aleph investigative corpus |
| `api.opensanctions.org`, `data.opensanctions.org` | OpenSanctions entity + PEP data |
| `www.icij.org` | ICIJ leaks / offshore corpus |
| host of any enabled news-API key | `NEWSAPI_KEY`, GNews, MarketAux, etc. |

For the MASAK (Turkey) sanctions feed, if you set `FEED_TR_MASAK` to a live
URL, also allow that host. When `FEED_TR_MASAK` is unset the adapter runs
against its curated static seed and needs no egress.

## Verify reachability

From the deployment runtime (not your laptop):

```bash
curl -s -m 8 -o /dev/null -w "%{http_code}\n" \
  "https://api.gdeltproject.org/api/v2/doc/doc?query=test&format=json"
curl -s -m 8 -o /dev/null -w "%{http_code}\n" \
  "https://news.google.com/rss/search?q=test"
```

`200` = reachable. `403`/timeouts = egress blocked → fix the network policy.

Then check the live endpoint:

```bash
curl 'https://<your-host>/api/news-search?q=OZCAN+HALAC' | jq '{retrieval, feedsAttempted, feedsReachable, articleCount}'
```

- `retrieval: "live"` with `feedsReachable > 0` → working; articles render as
  evidence and the "uncorroborated" banner is suppressed.
- `retrieval: "unavailable"` with `feedsReachable: 0` → egress still blocked.
- `retrieval: "degraded"` → partial outage (<20% of feeds reachable).

## Code path (for reference)

- Retrieval-health classification: `web/app/api/news-search/route.ts`
  (`feedsReachable === 0 → "unavailable"`).
- A successful news-API adapter counts toward `feedsReachable` even if every
  RSS feed is blocked — so enabling one keyed provider that the deployment can
  reach is sufficient to flip `retrieval` to `live`.
- UI consumption: `web/components/screening/SubjectDetailPanel.tsx`
  (adverse-media section) and `web/lib/hooks/useNewsSearch.ts`.

The fail-safe semantics are intentional and must not be weakened: do not make
the endpoint return `live` when no source was actually reached.
