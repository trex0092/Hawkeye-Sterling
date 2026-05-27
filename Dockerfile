# Hawkeye Sterling — hardened multi-stage Dockerfile for the Next.js web app.
# For Netlify deployment, use scripts/build.sh instead.
# This Dockerfile targets self-hosted or regulated-cloud Kubernetes deployments.
#
# Stages:
#   base    — minimal node:22-alpine image
#   deps    — install web production dependencies
#   builder — compile TypeScript brain + build Next.js standalone
#   runner  — minimal runtime image (non-root, read-only rootfs)
#
# Security posture:
#   - Non-root user (uid:gid 1001:1001)
#   - Read-only root filesystem (writable /tmp and Next.js cache via emptyDir)
#   - No dev dependencies in final image
#   - HEALTHCHECK via /api/health
#   - Signal-forward via tini (graceful shutdown)

# syntax=docker/dockerfile:1
# Multi-arch support: BUILDPLATFORM = builder host (amd64 or arm64),
# TARGETPLATFORM = final image target. Using --platform=$BUILDPLATFORM on
# build-only stages (deps, builder) avoids slow cross-compilation emulation
# while ensuring the runner image matches the target platform.
ARG BUILDPLATFORM
ARG TARGETPLATFORM

FROM --platform=$BUILDPLATFORM node:22-alpine AS base
# Install tini for proper PID 1 signal forwarding (graceful shutdown support)
RUN apk add --no-cache tini
# Disable Next.js telemetry globally
ENV NEXT_TELEMETRY_DISABLED=1

# ── Dependency installation ───────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM base AS deps
WORKDIR /app

# Copy manifests for cache-efficient layer invalidation
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --include=dev --no-audit --no-fund

# ── Build stage ───────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM deps AS builder
WORKDIR /app

# Copy all source (after deps are cached)
COPY . .

# Compile TypeScript brain → dist/
RUN npm run build

# Generate weaponized brain catalogue (required by Next.js routes at startup)
RUN node scripts/gen-weaponized-brain.cjs

# Apply AsyncLocalStorage polyfill patches (required for Next.js 15 + Node 22)
RUN cd web && node ../scripts/patch-als.cjs && node ../scripts/patch-runtime-snapshot.cjs

# Build Next.js in standalone mode (bundles all deps into .next/standalone/)
RUN cd web && NODE_ENV=production npm run build

# ── Production runner ─────────────────────────────────────────────────────────
# Runner uses TARGETPLATFORM so the output image runs on the intended platform.
FROM --platform=$TARGETPLATFORM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy the standalone Next.js build (self-contained Node.js server)
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
# Copy static assets separately (not bundled in standalone)
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./.next/static
# Copy public assets
COPY --from=builder --chown=nextjs:nodejs /app/web/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

# Health check via the tiered /api/health endpoint (200 = all lists healthy)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# tini as PID 1 for proper signal handling + graceful shutdown
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
