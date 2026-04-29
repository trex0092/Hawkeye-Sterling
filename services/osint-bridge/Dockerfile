# Hawkeye Sterling — OSINT Bridge Dockerfile
# Multi-stage build: installs Python deps + OSINT CLI tools.
#
# Build:  docker build -t hs-osint-bridge .
# Run:    docker run -p 8080:8080 -e OSINT_BRIDGE_API_KEY=secret hs-osint-bridge

FROM python:3.12-slim AS base

# System deps required by OSINT tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    nmap \
    dnsutils \
    whois \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------------------------------------------------------------------------
# Dependency layer — cached unless requirements.txt changes
# ---------------------------------------------------------------------------
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Application layer
# ---------------------------------------------------------------------------
COPY main.py ./

# Create non-root user for runtime
RUN useradd -r -s /bin/false -u 10001 osint
USER osint

# ---------------------------------------------------------------------------
# Runtime configuration
# ---------------------------------------------------------------------------
ENV OSINT_BRIDGE_API_KEY=""
ENV OSINT_BRIDGE_TIMEOUT_S="30"
ENV PORT="8080"
ENV PYTHONUNBUFFERED="1"
ENV PYTHONDONTWRITEBYTECODE="1"

EXPOSE 8080

# Uvicorn with 4 workers; tune via UVICORN_WORKERS env var
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers ${UVICORN_WORKERS:-4}"]

# ---------------------------------------------------------------------------
# Health check (Docker native)
# ---------------------------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -sf http://localhost:${PORT}/health || exit 1
