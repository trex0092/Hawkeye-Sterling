# Hawkeye Sterling — Service Level Agreement

## Availability targets

| Tier | Monthly uptime | Annual uptime |
| ---- | -------------- | ------------- |
| Free | 99.9% | 99.5% |
| Starter | 99.95% | 99.9% |
| Pro | 99.99% | 99.99% |
| Enterprise | 99.99% (signed) | 99.99% |

Uptime is measured against `/api/status` returning HTTP 200 within 1,500 ms
from an external monitor (third-party status provider). Planned maintenance
windows (announced ≥ 72 h in advance) are excluded from the calculation.

## Response latency (p95)

| Endpoint | Target |
| --- | --- |
| `/api/quick-screen` | ≤ 350 ms |
| `/api/super-brain` | ≤ 900 ms |
| `/api/news-search` | ≤ 3,000 ms (multi-locale fan-out) |
| `/api/ongoing` | ≤ 250 ms |

Enterprise deployments measure from the tenant's own region; public tier
SLAs measure from Netlify's global edge.

## Service credits

If monthly uptime falls below the target, the customer is entitled to a
pro-rated credit:

| Availability | Credit |
| ------------ | ------ |
| < target but ≥ 99.0% | 10% |
| < 99.0% but ≥ 95.0% | 25% |
| < 95.0% | 50% |

## Incident response

| Severity | First response | Status updates |
| -------- | -------------- | -------------- |
| Sev-1 — platform down | 15 min | Every 30 min |
| Sev-2 — degraded core path | 1 h | Every 2 h |
| Sev-3 — single feature impaired | 4 h | Daily |

Status dashboard: `https://hawkeye-sterling.netlify.app/status` (also
JSON-consumable at `/api/status`).
