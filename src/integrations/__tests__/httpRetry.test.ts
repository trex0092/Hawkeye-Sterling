import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchJsonWithRetry, fetchAnthropicStreamText } from '../httpRetry.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(opts: {
  ok?: boolean;
  status?: number;
  body?: string;
  streamChunks?: string[];
}) {
  const { ok = true, status = 200, body = '{}', streamChunks } = opts;

  if (streamChunks !== undefined) {
    // Build a ReadableStream from chunks
    const encoder = new TextEncoder();
    let idx = 0;
    const readable = new ReadableStream({
      pull(controller) {
        if (idx < streamChunks.length) {
          controller.enqueue(encoder.encode(streamChunks[idx++]));
        } else {
          controller.close();
        }
      },
    });
    return {
      ok,
      status,
      body: readable,
      text: async () => body,
    };
  }

  // Build a simple response with a body stream
  const encoder = new TextEncoder();
  const bytes = encoder.encode(body);
  const readable = new ReadableStream({
    pull(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

  return {
    ok,
    status,
    body: readable,
    text: async () => body,
  };
}

// ── fetchJsonWithRetry — basic success ────────────────────────────────────────

describe('fetchJsonWithRetry — success on first attempt', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns ok=true with parsed JSON on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ body: '{"hello":"world"}' }) as unknown as Response);
    const result = await fetchJsonWithRetry<{ hello: string }>('https://example.com', {}, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.json?.hello).toBe('world');
    expect(result.error).toBeNull();
    expect(result.attempts).toBe(1);
    expect(result.partial).toBe(false);
  });

  it('includes elapsedMs in result', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ body: '{"x":1}' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('passes init headers to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({ body: '{}' }) as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);
    await fetchJsonWithRetry('https://api.example.com', { headers: { Authorization: 'Bearer token' } }, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
    );
  });
});

// ── fetchJsonWithRetry — HTTP error codes ─────────────────────────────────────

describe('fetchJsonWithRetry — HTTP error codes', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns ok=false for 4xx (non-retryable)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ ok: false, status: 400, body: 'Bad Request' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.attempts).toBe(1); // 400 is not retried
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse({ ok: false, status: 429, body: 'rate limited' }) as unknown as Response)
      .mockResolvedValue(makeResponse({ body: '{"ok":true}' }) as unknown as Response);

    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('retries on 500 and returns error after exhausting retries', async () => {
    // Use mockImplementation so each call gets a fresh response object (incl. fresh ReadableStream)
    vi.mocked(fetch).mockImplementation(async () => makeResponse({ ok: false, status: 500, body: 'Server Error' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.error).toContain('HTTP 500');
  });

  it('retries on 503', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse({ ok: false, status: 503 }) as unknown as Response)
      .mockResolvedValue(makeResponse({ body: '{"done":true}' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('retries on 408', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse({ ok: false, status: 408 }) as unknown as Response)
      .mockResolvedValue(makeResponse({ body: '{"done":true}' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('does not retry 401 (non-retryable 4xx)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ ok: false, status: 401, body: 'Unauthorized' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.attempts).toBe(1);
    expect(result.ok).toBe(false);
  });
});

// ── fetchJsonWithRetry — network errors ───────────────────────────────────────

describe('fetchJsonWithRetry — network errors', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('retries on TypeError (network error) and succeeds', async () => {
    const netErr = new TypeError('fetch failed');
    vi.mocked(fetch)
      .mockRejectedValueOnce(netErr)
      .mockResolvedValue(makeResponse({ body: '{"ok":1}' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('retries on AbortError and succeeds', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
    vi.mocked(fetch)
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValue(makeResponse({ body: '{"ok":1}' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('returns error after all retries fail with network error', async () => {
    const netErr = new TypeError('fetch failed');
    vi.mocked(fetch).mockRejectedValue(netErr);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.error).toContain('fetch failed');
  });

  it('returns error when error matches code pattern', async () => {
    const connErr = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    vi.mocked(fetch)
      .mockRejectedValueOnce(connErr)
      .mockResolvedValue(makeResponse({ body: '{"ok":1}' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('returns error for message containing "timeout"', async () => {
    const timeoutErr = Object.assign(new Error('stream idle timeout'), {});
    vi.mocked(fetch)
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValue(makeResponse({ body: '{"ok":1}' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('does not retry non-retryable errors', async () => {
    const regularErr = new Error('some unexpected error');
    vi.mocked(fetch).mockRejectedValue(regularErr);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(1);
  });
});

// ── fetchJsonWithRetry — JSON parse failure ────────────────────────────────────

describe('fetchJsonWithRetry — JSON parse failure', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns partial=true and retries on malformed JSON', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse({ body: 'not json {' }) as unknown as Response)
      .mockResolvedValue(makeResponse({ body: '{"fixed":true}' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('returns ok=false with json_parse_error after exhausting retries on malformed JSON', async () => {
    // Use mockImplementation so each retry gets a fresh response with a fresh ReadableStream
    vi.mocked(fetch).mockImplementation(async () => makeResponse({ body: 'not valid json {{' }) as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('json_parse_error');
    expect(result.partial).toBe(true);
  });
});

// ── fetchJsonWithRetry — caller signal (cancellation) ─────────────────────────

describe('fetchJsonWithRetry — caller cancellation', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns immediately when signal is already aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
      signal: ctl.signal,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('aborted');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ── fetchJsonWithRetry — custom retryOn ───────────────────────────────────────

describe('fetchJsonWithRetry — custom retryOn', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('uses custom retryOn predicate', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse({ ok: false, status: 418 }) as unknown as Response)
      .mockResolvedValue(makeResponse({ body: '{"ok":true}' }) as unknown as Response);

    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
      retryOn: (status) => status === 418, // custom: retry on 418
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });
});

// ── fetchJsonWithRetry — response without body (null body) ────────────────────

describe('fetchJsonWithRetry — null body stream', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('handles response with no body ReadableStream (falls back to text())', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => '{"nullBody":true}',
    } as unknown as Response);
    const result = await fetchJsonWithRetry('https://example.com', {}, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect((result.json as Record<string, boolean>)['nullBody']).toBe(true);
  });
});

// ── fetchAnthropicStreamText — basic success ─────────────────────────────────

describe('fetchAnthropicStreamText — success', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns ok=true with accumulated text from SSE stream', async () => {
    const sseLines = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" World"}}\n',
      'data: [DONE]\n',
    ];
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({ body: '', streamChunks: sseLines }) as unknown as Response,
    );
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Hello World');
    expect(result.error).toBeNull();
    expect(result.attempts).toBe(1);
    expect(result.partial).toBe(false);
  });

  it('accumulates thinking_delta events', async () => {
    const sseLines = [
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Thinking..."}}\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Answer"}}\n',
      'data: [DONE]\n',
    ];
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({ body: '', streamChunks: sseLines }) as unknown as Response,
    );
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.text).toBe('Answer');
    expect(result.thinking).toBe('Thinking...');
  });

  it('ignores malformed SSE lines (non-JSON data)', async () => {
    const sseLines = [
      'data: not-json\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n',
      'data: [DONE]\n',
    ];
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({ body: '', streamChunks: sseLines }) as unknown as Response,
    );
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('OK');
  });

  it('handles stream error event → partial=true and retries', async () => {
    const errorChunk = [
      'data: {"type":"error","error":{"message":"overloaded"}}\n',
    ];
    const successChunks = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Retry OK"}}\n',
      'data: [DONE]\n',
    ];
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse({ body: '', streamChunks: errorChunk }) as unknown as Response)
      .mockResolvedValue(makeResponse({ body: '', streamChunks: successChunks }) as unknown as Response);
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Retry OK');
  });
});

describe('fetchAnthropicStreamText — HTTP errors', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns ok=false on non-retryable 4xx', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'bad request' } }),
    } as unknown as Response);
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('400');
  });

  it('retries on 429 and succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => '{}',
      } as unknown as Response)
      .mockResolvedValue(makeResponse({ body: '', streamChunks: [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Done"}}\n',
        'data: [DONE]\n',
      ] }) as unknown as Response);
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('returns ok=false when aborted before first attempt', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 3, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
      signal: ctl.signal,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('aborted');
  });

  it('extracts API error message from JSON body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 529,
      text: async () => JSON.stringify({ error: { message: 'API overloaded' } }),
    } as unknown as Response);
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.error).toContain('API overloaded');
  });

  it('handles non-parseable error body gracefully', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'raw error text',
    } as unknown as Response);
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.error).toContain('HTTP 500');
  });
});

describe('fetchAnthropicStreamText — network errors and retries', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('retries on TypeError network error', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(makeResponse({ body: '', streamChunks: [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Ok"}}\n',
        'data: [DONE]\n',
      ] }) as unknown as Response);
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('returns error after exhausting all retries', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 2, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0, maxBackoffMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(2);
  });
});

describe('fetchAnthropicStreamText — null body', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('handles response with null body (no stream)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => '',
    } as unknown as Response);
    const result = await fetchAnthropicStreamText('https://api.anthropic.com', {}, {
      maxAttempts: 1, perAttemptMs: 5000, idleReadMs: 5000, initialBackoffMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('');
    expect(result.partial).toBe(false);
  });
});
