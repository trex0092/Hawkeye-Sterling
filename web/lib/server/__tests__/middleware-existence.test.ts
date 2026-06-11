import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Why middleware.ts and NOT proxy.ts (this test once asserted the opposite —
// that theory was falsified in production):
//
// Next 16 compiles proxy.ts for the Node runtime ONLY. It lands in
// functions-config-manifest.json as `/_middleware` (runtime "nodejs") and
// leaves middleware-manifest.json EMPTY. @netlify/plugin-nextjs 5.15.11's
// node-middleware deploy path silently failed for this site: production
// deploy 6a2a510e (2026-06-11, built from HEAD) shipped ZERO middleware
// functions — only the unrelated fetch-relay edge function — so the session
// guard, CSP headers, and ADMIN_TOKEN injection were all dead in production.
// Anonymous visitors loaded the full dashboard shell and its pollers spammed
// 401s without bound. `next dev`/`next start` honor proxy.ts, so local runs
// and local Playwright kept passing while production was unguarded.
//
// middleware.ts (deprecated in Next 16, still supported) compiles for the
// EDGE runtime into middleware-manifest.json, which the plugin deploys as a
// Netlify Edge Function in front of the CDN. Edge placement is required
// regardless of the plugin bug: dashboard pages are static-prerendered and
// served straight from the CDN, which a Lambda-hosted Node middleware never
// fronts. Revisit only when the plugin's node-middleware path is proven on
// this site (verify a deploy actually ships a middleware function).

describe('Next.js middleware (session guard)', () => {
  const webRoot = resolve(__dirname, '../../..');
  const middlewarePath = resolve(webRoot, 'middleware.ts');
  const proxyPath = resolve(webRoot, 'proxy.ts');

  it('must be named middleware.ts (edge runtime → Netlify Edge Function)', () => {
    expect(
      existsSync(middlewarePath),
      `web/middleware.ts must exist — it is the only convention @netlify/plugin-nextjs 5.15.11 verifiably deploys (edge runtime via middleware-manifest.json). proxy.ts compiles for the Node runtime, which the plugin silently failed to deploy (prod deploy 6a2a510e shipped no middleware at all).`,
    ).toBe(true);

    expect(
      existsSync(proxyPath),
      `web/proxy.ts must NOT exist — Next.js 16 throws build error E900 when both proxy.ts and middleware.ts are present, and the proxy.ts (Node runtime) variant is the one that silently never deployed on Netlify.`,
    ).toBe(false);
  });

  it('must export a middleware function', () => {
    if (!existsSync(middlewarePath)) return; // covered by previous test

    const src = readFileSync(middlewarePath, 'utf8');

    expect(
      src.includes('export async function middleware') ||
      src.includes('export function middleware') ||
      src.includes('export { middleware }'),
      'middleware.ts must export a named "middleware" function — Next.js resolves mod.middleware || mod.default for the middleware.ts convention',
    ).toBe(true);
  });

  it('must keep the matcher excluding only static assets', () => {
    if (!existsSync(middlewarePath)) return;

    const src = readFileSync(middlewarePath, 'utf8');
    expect(
      src.includes('_next/static|_next/image|favicon.ico'),
      'config.matcher must keep fronting every non-static route — narrowing it reopens unguarded page loads',
    ).toBe(true);
  });
});
