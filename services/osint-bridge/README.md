# Hawkeye Sterling — OSINT Bridge

A single FastAPI microservice that wraps six OSINT/analysis tools behind a
uniform, authenticated REST API. Consumed by the Hawkeye Sterling Next.js
application via the TypeScript client at
`src/integrations/osintBridge.ts`.

## Tools wrapped

| Tool | Purpose | Invocation |
|------|---------|------------|
| **Sherlock** | Username search across 400+ social networks | subprocess (CLI) |
| **Maigret** | Username → full profile dossier | subprocess (CLI) |
| **theHarvester** | Email / subdomain / employee harvesting | subprocess (CLI) |
| **Social Analyzer** | Person profile analysis across 1000+ platforms | Python module |
| **PyOD** | Anomaly detection (IsolationForest, COPOD, ECOD) | Python library |
| **AMLSim** | Synthetic AML transaction pattern generator | Python library / built-in |

## Prerequisites

- Python 3.11+
- The CLI tools in `PATH` (Sherlock, Maigret, theHarvester)

```bash
pip install -r requirements.txt
```

> **Note on AMLSim**: IBM AMLSim is not on PyPI. The bridge includes a
> built-in pure-Python fallback generator that produces equivalent synthetic
> patterns without needing the full AMLSim installation. To use the real
> AMLSim, clone the repo and ensure `amlsim` is importable.

## Running locally

```bash
# No auth (development)
uvicorn main:app --reload --port 8080

# With API key
OSINT_BRIDGE_API_KEY=secret uvicorn main:app --reload --port 8080
```

## Running with Docker

```bash
# Build
docker build -t hs-osint-bridge .

# Run
docker run -p 8080:8080 \
  -e OSINT_BRIDGE_API_KEY=your_secret_key \
  -e OSINT_BRIDGE_TIMEOUT_S=60 \
  hs-osint-bridge
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OSINT_BRIDGE_API_KEY` | *(unset)* | API key for `X-API-Key` header auth. If unset, auth is disabled. |
| `OSINT_BRIDGE_TIMEOUT_S` | `30` | Default subprocess timeout in seconds. |
| `PORT` | `8080` | Port to listen on (Docker only). |
| `UVICORN_WORKERS` | `4` | Number of Uvicorn worker processes (Docker only). |

## API reference

All endpoints accept `Content-Type: application/json` and return JSON.
Pass `?timeout=<seconds>` to override the default per-request timeout (max 300 s).

### `GET /health`

Returns tool availability status.

```json
{
  "ok": true,
  "tools": {
    "sherlock": true,
    "maigret": true,
    "harvester": true,
    "socialAnalyzer": false,
    "pyod": true,
    "amlsim": false
  }
}
```

### `POST /sherlock`

Search for a username across social networks.

**Request**
```json
{ "username": "johndoe" }
```

**Response**
```json
{
  "ok": true,
  "username": "johndoe",
  "profiles": [
    { "site": "GitHub", "url": "https://github.com/johndoe", "exists": true }
  ],
  "totalFound": 1
}
```

### `POST /maigret`

Build a full profile dossier.

**Request**
```json
{ "username": "johndoe", "sites": 100 }
```

**Response**
```json
{
  "ok": true,
  "username": "johndoe",
  "profiles": [
    { "site": "GitHub", "url": "https://github.com/johndoe", "tags": ["coding"], "ids": {} }
  ],
  "totalFound": 1
}
```

### `POST /harvester`

Harvest emails, subdomains, and IPs.

**Request**
```json
{ "domain": "example.com", "sources": ["google", "bing"] }
```

**Response**
```json
{
  "ok": true,
  "domain": "example.com",
  "emails": ["info@example.com"],
  "hosts": ["www.example.com", "mail.example.com"],
  "ips": ["93.184.216.34"]
}
```

### `POST /social-analyzer`

Analyze a person's social presence.

**Request**
```json
{ "person": "johndoe", "platforms": ["twitter", "instagram"] }
```

**Response**
```json
{
  "ok": true,
  "person": "johndoe",
  "profiles": [
    { "platform": "Twitter", "url": "https://twitter.com/johndoe", "score": 0.95 }
  ]
}
```

### `POST /anomaly`

Detect anomalies in a transaction feature matrix.

**Request**
```json
{
  "features": [[100.0, 1.5, 0.3], [50.0, 1.2, 0.1], [99999.0, 10.0, 9.9]],
  "algorithm": "IsolationForest"
}
```

Supported algorithms: `IsolationForest`, `COPOD`, `ECOD`

**Response**
```json
{
  "ok": true,
  "algorithm": "IsolationForest",
  "scores": [-0.12, -0.05, 0.43],
  "outliers": [2]
}
```

### `POST /amlsim/patterns`

Generate synthetic AML transaction patterns.

**Request**
```json
{ "pattern": "fan-out", "n_accounts": 5, "n_transactions": 10 }
```

Supported patterns: `fan-in`, `fan-out`, `cycle`, `scatter-gather`

**Response**
```json
{
  "ok": true,
  "pattern": "fan-out",
  "accounts": [{ "id": "ACCT-0000", "balance": 54321.00 }],
  "transactions": [{ "txId": "TX-ABCD1234", "src": "ACCT-0000", "dst": "ACCT-0001", "amount": 1500.00, "step": 0, "timestamp": "2024-01-01T00:00:00" }]
}
```

## Error responses

All errors follow a consistent shape:

```json
{ "ok": false, "error": "description of the error", "tool": "sherlock" }
```

HTTP status codes:
- `400` / `422` — bad request (invalid input)
- `401` — missing or invalid API key
- `500` — tool execution error
