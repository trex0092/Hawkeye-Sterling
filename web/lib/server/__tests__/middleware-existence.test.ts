import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Next.js middleware', () => {
  it('must be named middleware.ts (not proxy.ts or any other name)', () => {
    const webRoot = resolve(__dirname, '../../..');
    const middlewarePath = resolve(webRoot, 'middleware.ts');
    const proxyPath = resolve(webRoot, 'proxy.ts');

    expect(
      existsSync(middlewarePath),
      `web/middleware.ts must exist — Next.js ignores any other filename. Found proxy.ts instead? Rename it.`,
    ).toBe(true);

    expect(
      existsSync(proxyPath),
      `web/proxy.ts must not exist — it is not recognized as Next.js middleware. Rename it to middleware.ts.`,
    ).toBe(false);
  });

  it('must export a default function named middleware', async () => {
    const webRoot = resolve(__dirname, '../../..');
    const middlewarePath = resolve(webRoot, 'middleware.ts');
    if (!existsSync(middlewarePath)) return; // covered by previous test

    const src = await import('node:fs').then(fs =>
      fs.readFileSync(middlewarePath, 'utf8')
    );

    expect(
      src.includes('export default async function middleware') ||
      src.includes('export default function middleware') ||
      src.includes('export { middleware }') ||
      src.includes('export async function middleware'),
      'middleware.ts must export a default function or named "middleware" export for Next.js to recognize it',
    ).toBe(true);
  });
});
