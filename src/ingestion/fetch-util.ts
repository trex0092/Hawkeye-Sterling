// HTTP fetch with timeout + retry. No external deps — Node 20's global fetch.

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
  accept?: string;
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const retries = opts.retries ?? 2;
  const backoff = opts.retryBackoffMs ?? 1500;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: {
          'User-Agent': 'Hawkeye-Sterling/1.0 (+https://github.com/trex0092/Hawkeye-Sterling)',
          ...(opts.accept ? { Accept: opts.accept } : {}),
        },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, backoff * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetch failed');
}

export async function sha256Hex(text: string): Promise<string> {
  // Use WebCrypto; works in Node 20+ and Netlify Functions.
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
