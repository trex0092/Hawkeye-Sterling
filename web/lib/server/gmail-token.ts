// Manages Gmail OAuth access tokens with automatic refresh.
//
// Priority order:
//   1. Netlify Blobs cache — used if not expired (fast path, no network call)
//   2. Refresh via Blobs-stored refresh token (written by /api/auth/gmail/callback)
//   3. Refresh via GMAIL_REFRESH_TOKEN + GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET env vars
//   4. Fallback to GMAIL_ACCESS_TOKEN env var (static, expires in 1h)
//
// Re-authorization: visit /api/auth/gmail/authorize to get a new refresh token
// stored in Blobs. No manual Netlify env var update needed.
//
// Required env vars for permanent auto-refresh:
//   GMAIL_CLIENT_ID       — Google Cloud OAuth 2.0 client ID
//   GMAIL_CLIENT_SECRET   — Google Cloud OAuth 2.0 client secret
//   GMAIL_REFRESH_TOKEN   — long-lived refresh token (OR use the OAuth flow above)

import { getJson, setJson } from "@/lib/server/store";

const TOKEN_CACHE_KEY = "hawkeye-gmail-token/v1.json";
// Written by /api/auth/gmail/callback
const OAUTH_CREDS_KEY = "hawkeye-gmail-oauth/v1.json";
// Refresh 5 minutes before actual expiry to avoid races
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix ms
}

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  let data: RefreshResponse;
  try {
    data = (await res.json()) as RefreshResponse;
  } catch {
    throw new Error(`GMAIL_REFRESH_FAILED: HTTP ${res.status} — non-JSON response from Google`);
  }

  if (!res.ok || data.error) {
    const detail = data.error_description ?? data.error ?? `HTTP ${res.status}`;
    throw new Error(`GMAIL_REFRESH_FAILED: ${detail}`);
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function getGmailAccessToken(): Promise<string> {
  const clientId = process.env["GMAIL_CLIENT_ID"];
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"];
  const envRefreshToken = process.env["GMAIL_REFRESH_TOKEN"];
  const staticToken = process.env["GMAIL_ACCESS_TOKEN"];
  const hasCredentials = Boolean(clientId && clientSecret);

  // ── 1. Check Netlify Blobs access-token cache ────────────────────────────
  if (hasCredentials) {
    try {
      const cached = await getJson<CachedToken>(TOKEN_CACHE_KEY);
      if (cached?.accessToken && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
        return cached.accessToken;
      }
    } catch {
      // Cache miss or store unavailable — fall through to refresh
    }
  }

  // ── 2. Refresh via Blobs-stored refresh token (set by OAuth flow) ────────
  if (hasCredentials) {
    try {
      const stored = await getJson<{ refreshToken: string }>(OAUTH_CREDS_KEY);
      if (stored?.refreshToken) {
        const fresh = await refreshAccessToken(stored.refreshToken, clientId!, clientSecret!);
        try { await setJson(TOKEN_CACHE_KEY, fresh); } catch { /* non-fatal */ }
        return fresh.accessToken;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If the Blobs token was also revoked, fall through to env var
      if (!msg.startsWith("GMAIL_REFRESH_FAILED")) throw err;
    }
  }

  // ── 3. Refresh via GMAIL_REFRESH_TOKEN env var ───────────────────────────
  if (hasCredentials && envRefreshToken) {
    const fresh = await refreshAccessToken(envRefreshToken, clientId!, clientSecret!);
    try { await setJson(TOKEN_CACHE_KEY, fresh); } catch { /* non-fatal */ }
    return fresh.accessToken;
  }

  // ── 4. Static fallback (expires in ~1h, no auto-refresh) ────────────────
  if (staticToken) {
    return staticToken;
  }

  throw new Error("GMAIL_NOT_CONFIGURED");
}
