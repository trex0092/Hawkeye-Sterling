# Hawkeye Sterling — LSEG World-Check Activation Guide

**Audience:** Platform operators / compliance administrators  
**Last updated:** 2026-05-17

---

## Overview

Hawkeye Sterling integrates with LSEG World-Check One (WC1) for commercial-grade PEP and sanctions screening.
World-Check provides FATF-recommended screening coverage including PEP tiers I–IV, sanctions, adverse
media, and business interest data.

The integration is **opt-in** and **fail-soft**: without LSEG credentials the platform screens against
the open-source sanctions corpus (UN, OFAC, EU, UK, UAE, FATF). With credentials active, World-Check
results are layered on top for higher-confidence PEP detection.

---

## Step 1 — Obtain LSEG API Credentials

Contact your LSEG relationship manager to obtain:

| Credential | Description |
|-----------|-------------|
| API Key | Identifies your organisation |
| API Secret | Signs API requests (HMAC-SHA256) |
| App Key | Sub-application key (optional, required for some enterprise tiers) |
| Username | For CFS (Continuous Filtering System) bulk downloads |
| Password | For CFS bulk downloads |

You will receive these via LSEG's secure credential portal.  
**Do NOT share or commit these values.**

---

## Step 2 — Set Netlify Environment Variables

In **Netlify → Site Settings → Environment Variables**, add:

| Variable | Value | Notes |
|---------|-------|-------|
| `LSEG_WORLDCHECK_API_KEY` | `<your-api-key>` | Required for REST API |
| `LSEG_WORLDCHECK_API_SECRET` | `<your-api-secret>` | Required for REST API |
| `LSEG_APP_KEY` | `<your-app-key>` | Optional — enterprise tiers only |
| `LSEG_USERNAME` | `<username>` | Required for CFS bulk download |
| `LSEG_WC1_MCP_URL` | `http://localhost:4000` | If running WC1 MCP server locally |
| `LSEG_WC1_TIMEOUT_MS` | `15000` | Request timeout ms (default 15 s) |

Set **Context: Production** for all variables.

> **Security note:** These variables are secrets — never set them in preview or branch deploys
> unless you have explicitly approved test-credential access.

---

## Step 3 — Verify Credentials

After deploying, call the LSEG status endpoint:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://your-site.netlify.app/api/admin/lseg-status
```

Expected response (credentials configured, no CFS index yet):

```json
{
  "ok": true,
  "credentials": {
    "apiKeyConfigured": true,
    "apiSecretConfigured": true,
    "appKeyConfigured": false,
    "usernameConfigured": true,
    "fullyConfigured": true
  },
  "cfsIndex": {
    "indexed": false,
    "entitiesIndexed": 0,
    "builtAt": null
  }
}
```

---

## Step 4 — Build the CFS Index (Bulk Screening)

For bulk/batch screening, Hawkeye Sterling can ingest LSEG CFS (Continuous Filtering System)
delta files and build a local searchable index in Netlify Blobs.

### 4a — Upload CFS files

Download the current CFS delta archive from LSEG's secure delivery portal and upload via:

```bash
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@WorldCheck_CFS_delta_YYYYMMDD.zip" \
  https://your-site.netlify.app/api/lseg/cfs-files
```

### 4b — Trigger index build

```bash
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://your-site.netlify.app/api/admin/import-cfs
```

Index build time: ~2–5 minutes depending on delta size.

### 4c — Verify index

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://your-site.netlify.app/api/admin/lseg-status
```

Look for `cfsIndex.indexed: true` and `entitiesIndexed: N`.

---

## Step 5 — Automated CFS Updates

The `lseg-cfs-poll.mts` scheduled function runs on a configurable schedule and polls LSEG's
SQS delivery endpoint for new CFS delta files, automatically updating the local index.

Set the SQS endpoint environment variable:

| Variable | Value |
|---------|-------|
| `LSEG_SQS_ENDPOINT` | `<LSEG-provided SQS endpoint URL>` |

---

## Step 6 — Test Integration

Screen a known PEP against the live WC1 API:

```bash
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subjects":[{"name":"Viktor Bout","entityType":"individual"}]}' \
  https://your-site.netlify.app/api/screen/batch
```

A fully configured system should return `band: "critical"` and `recommendation: "match"` for
this UN 1267 / OFAC SDN entity.

---

## Activation Checklist

- [ ] LSEG credentials received from relationship manager
- [ ] `LSEG_WORLDCHECK_API_KEY` set in Netlify (Production context)
- [ ] `LSEG_WORLDCHECK_API_SECRET` set in Netlify (Production context)
- [ ] `/api/admin/lseg-status` returns `fullyConfigured: true`
- [ ] CFS files uploaded and index built (`entitiesIndexed > 0`)
- [ ] Viktor Bout test screening returns `band: "critical"`
- [ ] `lseg-cfs-poll.mts` function enabled and schedule set
- [ ] First scheduled CFS sync verified in function logs

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `fullyConfigured: false` | API key or secret missing | Check Netlify env vars |
| `cfsIndex.indexed: false` after import | Import failed | Check function logs for parse errors |
| Viktor Bout returns `clear` | CFS index empty or engine offline | Rebuild index; verify candidates blob |
| WC1 API 401 errors | Expired or rotated credentials | Request new credentials from LSEG |
| SQS poll failing | Endpoint URL incorrect | Verify `LSEG_SQS_ENDPOINT` value |

---

## Compliance Notes

- LSEG World-Check data is licensed — do not export raw entity data outside the platform
- Screen-result audit trail is maintained automatically (FDL 10/2025 Art. 24)
- CFS delta files must be processed within 48 h of delivery (FATF R.10 CDD timeliness)
- API key rotation: rotate annually or on any suspected compromise; update Netlify env vars and redeploy
