// Manages Gmail OAuth access tokens with automatic refresh.
//
// Priority order:
//   1. Netlify Blobs cache — used if not expired (fast path, no network call)
//   2. Refresh via GMAIL_REFRESH_TOKEN + GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET
//   3. Fallback to GMAIL_ACCESS_TOKEN env var (static, expires in 1h)
//
// Required env vars for permanent auto-refresh:
//   GMAIL_REFRESH_TOKEN   — long-lived refresh token (never expires if using own credentials)
//   GMAIL_CLIENT_ID       — Google Cloud OAuth 2.0 client ID
//   GMAIL_CLIENT_SECRET   — Google Cloud OAuth 2.0 client secret
//
// Optional (temporary / testing only):
//   GMAIL_ACCESS_TOKEN    — static access token, valid ~1 hour, no auto-refresh

import { getJson, setJson } from "@/lib/server/store";

const TOKEN_CACHE_KEY = "hawkeye-gmail-token/v1.json";
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

  const data = (await res.json()) as RefreshResponse;

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
  const refreshToken = process.env["GMAIL_REFRESH_TOKEN"];
  const clientId = process.env["GMAIL_CLIENT_ID"];
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"];
  const staticToken = process.env["GMAIL_ACCESS_TOKEN"];

  const canAutoRefresh = Boolean(refreshToken && clientId && clientSecret);

  // ── 1. Check Netlify Blobs cache ────────────────────────────────────────
  if (canAutoRefresh) {
    try {
      const cached = await getJson<CachedToken>(TOKEN_CACHE_KEY);
      if (cached?.accessToken && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
        return cached.accessToken;
      }
    } catch {
      // Cache miss or store unavailable — fall through to refresh
    }
  }

  // ── 2. Auto-refresh via refresh token ───────────────────────────────────
  if (canAutoRefresh) {
    const fresh = await refreshAccessToken(refreshToken!, clientId!, clientSecret!);
    // Store in Blobs so subsequent calls within the same hour skip the refresh
    try {
      await setJson(TOKEN_CACHE_KEY, fresh);
    } catch {
      // Cache write failure is non-fatal — we still have the token for this request
    }
    return fresh.accessToken;
  }

  // ── 3. Static fallback (expires in ~1h, no auto-refresh) ────────────────
  if (staticToken) {
    return staticToken;
  }

  throw new Error("GMAIL_NOT_CONFIGURED");
}
