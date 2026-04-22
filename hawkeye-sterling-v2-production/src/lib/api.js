// Hawkeye Sterling V2 — browser API client.
// Thin wrappers around the brain-reason server (dev: Vite proxy → :8081;
// prod: Netlify function at /api/quick-screen).

const DEFAULT_TIMEOUT_MS = 8_000;

async function postJson(path, body, { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const composite = signal
    ? mergeSignals(signal, ctrl.signal)
    : ctrl.signal;
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: composite,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

function mergeSignals(a, b) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (a.aborted || b.aborted) ctrl.abort();
  else {
    a.addEventListener('abort', onAbort, { once: true });
    b.addEventListener('abort', onAbort, { once: true });
  }
  return ctrl.signal;
}

export async function screenSubject(subject, candidates, options = {}) {
  return postJson('/api/quick-screen', { subject, candidates, options });
}
