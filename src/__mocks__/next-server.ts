// Minimal next/server mock for Vitest.
// NextResponse is a thin wrapper around the Web API Response — replicate that
// behaviour so tests that call validateBody() can inspect .status / .json() /
// .headers without importing the full Next.js runtime.

class NextResponse extends Response {
  static override json(body: unknown, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }
}

export { NextResponse };
