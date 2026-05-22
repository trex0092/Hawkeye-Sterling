# TEST REPORT
**Date:** 2026-05-22  
**Branch:** claude/gracious-wright-2ACpz  
**Prepared by:** Automated CI + Claude Code audit  

## Commands Run

### 1. Root dependency install
```
cd /home/user/Hawkeye-Sterling && npm install
```
**Result:** 98 packages installed. 2 moderate vulnerabilities (non-critical, no audit fix available without breaking changes).

### 2. Root TypeScript compilation
```
cd /home/user/Hawkeye-Sterling && npm run build
```
**Result:** EXIT 0 — TypeScript compiled successfully, dist/ generated.

### 3. Root unit tests
```
cd /home/user/Hawkeye-Sterling && npm run test
```
**Result:** EXIT 0 — 230 test files, 5507 tests, all passed. Duration: ~19s.

### 4. Web dependency install
```
cd /home/user/Hawkeye-Sterling/web && npm install
```
**Result:** 691 packages installed. 2 moderate vulnerabilities.

### 5. Web TypeScript check
```
cd /home/user/Hawkeye-Sterling/web && npm run typecheck
```
**Result:** EXIT 0 — 0 TypeScript errors.

### 6. Web lint
```
cd /home/user/Hawkeye-Sterling/web && npm run lint
```
**Result:** EXIT 0 — ✔ No ESLint warnings or errors (after 2026-05-22 fixes).

### 7. Web Next.js build
```
cd /home/user/Hawkeye-Sterling/web && npm run build
```
**Result:** EXIT 0 — Compiled successfully in ~32s. 88 static pages generated. All API routes and dynamic pages built.

## Test Coverage Summary

| Suite | Files | Tests | Passed | Failed |
|-------|-------|-------|--------|--------|
| src/ unit tests | 230 | 5507 | 5507 | 0 |
| web/lib/**/__tests__ | included in above | included | included | 0 |

## Known Skipped Tests
- **E2E tests** (`web/e2e/*.spec.ts`): Playwright tests skipped — require a running server with valid env vars (ANTHROPIC_API_KEY, ASANA_TOKEN, etc.) that are not set in this environment. Run manually against a staging deployment.

## Dependency Vulnerabilities
```
npm audit (web/)
2 moderate severity vulnerabilities
```
Both moderate vulnerabilities are in transitive dependencies with no available non-breaking fix. They do not affect the production security posture of the application (neither is in a path reachable from production code). Re-audit after next major dependency update cycle.

## Build Notes
- Netlify Blobs warning during build: `[candidates-loader] Failed to open Blobs stores` — expected in local dev without Netlify context. Runtime behavior is correct (in-memory fallback with logged warning).
- `NEXT_TELEMETRY_DISABLED=1` required to prevent network calls during build in offline/CI environments.
