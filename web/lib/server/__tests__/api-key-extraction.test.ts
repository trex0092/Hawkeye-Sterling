// Tests for the key extraction function in api-keys.ts.
//
// Validates the security property that API keys are ONLY accepted via
// Authorization: Bearer or X-Api-Key headers — never from URL query
// parameters, which appear in CDN/server/proxy logs.

import { describe, expect, it } from 'vitest';
import { extractKey } from '../api-keys';

function req(opts: {
  authorization?: string;
  apiKeyHeader?: string;
  queryParam?: string;
}): Request {
  const url = opts.queryParam
    ? `https://api.test/endpoint?api_key=${encodeURIComponent(opts.queryParam)}`
    : 'https://api.test/endpoint';
  const headers: Record<string, string> = {};
  if (opts.authorization) headers['authorization'] = opts.authorization;
  if (opts.apiKeyHeader)  headers['x-api-key'] = opts.apiKeyHeader;
  return new Request(url, { headers });
}

describe('extractKey — header-only authentication', () => {
  it('extracts key from Authorization: Bearer header', () => {
    const key = extractKey(req({ authorization: 'Bearer hks_live_abc123' }));
    expect(key).toBe('hks_live_abc123');
  });

  it('extracts key from X-Api-Key header', () => {
    const key = extractKey(req({ apiKeyHeader: 'hks_live_xyz789' }));
    expect(key).toBe('hks_live_xyz789');
  });

  it('returns null when no auth header is present', () => {
    const key = extractKey(req({}));
    expect(key).toBeNull();
  });

  it('returns null when only a query param is supplied — prevents CDN log key exposure', () => {
    // SECURITY: api_key query params appear in CDN/server logs.
    // Removing this extraction path was a CRITICAL security fix.
    const key = extractKey(req({ queryParam: 'hks_live_secret' }));
    expect(key).toBeNull();
  });

  it('prefers Authorization: Bearer over X-Api-Key when both present', () => {
    const key = extractKey(req({
      authorization: 'Bearer bearer-key',
      apiKeyHeader: 'header-key',
    }));
    expect(key).toBe('bearer-key');
  });

  it('ignores query param even when Authorization header is also absent', () => {
    const key = extractKey(req({ queryParam: 'hks_live_shouldbeignored', apiKeyHeader: undefined }));
    expect(key).toBeNull();
  });

  it('trims whitespace from Authorization: Bearer value', () => {
    const key = extractKey(req({ authorization: 'Bearer   trimmed-key   ' }));
    expect(key).toBe('trimmed-key');
  });

  it('is case-insensitive for Bearer scheme', () => {
    const key = extractKey(req({ authorization: 'bearer hks_live_lower' }));
    expect(key).toBe('hks_live_lower');
  });

  it('returns null for malformed Authorization header without Bearer', () => {
    const key = extractKey(req({ authorization: 'Basic dXNlcjpwYXNz' }));
    expect(key).toBeNull();
  });
});
