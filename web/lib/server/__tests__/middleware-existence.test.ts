import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Next.js proxy (middleware)', () => {
  it('must be named proxy.ts (Next.js 16+ convention)', () => {
    const webRoot = resolve(__dirname, '../../..');
    const proxyPath = resolve(webRoot, 'proxy.ts');
    const middlewarePath = resolve(webRoot, 'middleware.ts');

    expect(
      existsSync(proxyPath),
      `web/proxy.ts must exist — Next.js 16 uses proxy.ts (middleware.ts is deprecated and does not generate middleware.js.nft.json, causing Netlify plugin failures).`,
    ).toBe(true);

    expect(
      existsSync(middlewarePath),
      `web/middleware.ts must NOT exist — Next.js 16 throws a build error if both proxy.ts and middleware.ts are present. The deprecated middleware.ts convention was replaced by proxy.ts.`,
    ).toBe(false);
  });

  it('must export a proxy function', async () => {
    const webRoot = resolve(__dirname, '../../..');
    const proxyPath = resolve(webRoot, 'proxy.ts');
    if (!existsSync(proxyPath)) return; // covered by previous test

    const src = await import('node:fs').then(fs =>
      fs.readFileSync(proxyPath, 'utf8')
    );

    expect(
      src.includes('export async function proxy') ||
      src.includes('export function proxy') ||
      src.includes('export { proxy }'),
      'proxy.ts must export a named "proxy" function — Next.js 16 resolves mod.proxy || mod.default',
    ).toBe(true);
  });
});
