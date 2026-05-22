// GET /api/auth/gmail/callback
// Handles the Google OAuth 2.0 callback after user consent.
// Exchanges the authorization code for access + refresh tokens and stores
// the refresh token in Netlify Blobs so gmail-token.ts can use it without
// a manual GMAIL_REFRESH_TOKEN env var update.
//
// After success, redirects to /tfs-alerts?gmail=authorized
// After failure, redirects to /tfs-alerts?gmail=error&reason=<msg>
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, setJson, del } from "@/lib/server/store";

const OAUTH_STATE_KEY = "hawkeye-gmail-oauth-state/v1.json";
const GMAIL_OAUTH_TOKEN_KEY = "hawkeye-gmail-oauth/v1.json";

interface StoredState {
  state: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

function getAppBase(req: Request): string {
  const explicit = process.env["NEXT_PUBLIC_APP_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://hawkeye-sterling.netlify.app";
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const appBase = getAppBase(req);
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateReceived = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    const reason = encodeURIComponent(oauthError);
    return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=error&reason=${reason}`, { status: 302 });
  }

  if (!code) {
    return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=error&reason=no_code`, { status: 302 });
  }

  // Verify CSRF state
  try {
    const stored = await getJson<StoredState>(OAUTH_STATE_KEY);
    if (stored && stateReceived && stored.state !== stateReceived) {
      return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=error&reason=state_mismatch`, { status: 302 });
    }
    if (stored && Date.now() > stored.expiresAt) {
      return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=error&reason=state_expired`, { status: 302 });
    }
  } catch {
    // Blobs unavailable — skip CSRF check (state was non-fatal to store too)
  }

  const clientId = process.env["GMAIL_CLIENT_ID"];
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=error&reason=missing_credentials`, { status: 302 });
  }

  const redirectUri = `${appBase}/api/auth/gmail/callback`;

  let data: TokenResponse;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    data = (await res.json()) as TokenResponse;
    if (!res.ok || data.error) {
      const reason = encodeURIComponent(data.error_description ?? data.error ?? `HTTP ${res.status}`);
      return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=error&reason=${reason}`, { status: 302 });
    }
  } catch (err) {
    const reason = encodeURIComponent(err instanceof Error ? err.message : "token_exchange_failed");
    return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=error&reason=${reason}`, { status: 302 });
  }

  if (!data.refresh_token) {
    // Happens when prompt=consent was not sent or token was already granted.
    // Redirect with a hint to revoke first.
    return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=error&reason=no_refresh_token_revoke_first`, { status: 302 });
  }

  // Store the new refresh token in Blobs — gmail-token.ts will use it
  try {
    await setJson(GMAIL_OAUTH_TOKEN_KEY, {
      refreshToken: data.refresh_token,
      storedAt: new Date().toISOString(),
    });
    // Invalidate any stale cached access token so the new refresh token is used immediately
    try { await del("hawkeye-gmail-token/v1.json"); } catch { /* non-fatal */ }
  } catch {
    // Blobs write failed — this is a problem
    return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=error&reason=blobs_write_failed`, { status: 302 });
  }

  return NextResponse.redirect(`${appBase}/tfs-alerts?gmail=authorized`, { status: 302 });
}
