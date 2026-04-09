# ---------------------------------------------------------------------------
# Hawkeye-Sterling  --  AML/CFT Compliance Screening Engine
# Multi-stage Docker build  |  node:22-alpine
# ---------------------------------------------------------------------------

# =====  Stage 1: Install dependencies  =====================================
FROM node:22-alpine AS build

WORKDIR /build

# -- screening module --------------------------------------------------------
COPY screening/package.json screening/package.json
RUN cd screening && npm ci --ignore-scripts

# -- scripts module ----------------------------------------------------------
COPY scripts/package.json scripts/package.json
RUN cd scripts && npm ci --ignore-scripts

# -- claude-mem module -------------------------------------------------------
COPY claude-mem/package.json claude-mem/package.json
RUN cd claude-mem && npm ci --ignore-scripts

# -- Copy application source -------------------------------------------------
COPY screening/ screening/
COPY scripts/   scripts/
COPY claude-mem/ claude-mem/

# =====  Stage 2: Runtime  ==================================================
FROM node:22-alpine AS runtime

LABEL org.opencontainers.image.title="Hawkeye-Sterling" \
      org.opencontainers.image.description="AML/CFT compliance screening engine for UAE DNFBP operations" \
      org.opencontainers.image.version="2.0.0" \
      org.opencontainers.image.vendor="Hawkeye-Sterling"

# Install curl for health checks
RUN apk add --no-cache curl

# Non-root user
RUN addgroup -S compliance && adduser -S compliance -G compliance

WORKDIR /app

# Copy built artefacts from build stage
COPY --from=build /build/screening/ screening/
COPY --from=build /build/scripts/   scripts/
COPY --from=build /build/claude-mem/ claude-mem/

# Create directories the app expects at runtime
RUN mkdir -p .screening history && chown -R compliance:compliance /app

USER compliance

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["node", "screening/api/server.mjs"]
