export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJwt } from "@/lib/server/jwt";
import { getJson, setJson, del } from "@/lib/server/store";

const REDIRECT_URI = "https://hawkeye-sterling.netlify.app/api/auth/gmail/callback";
const OAUTH_STATE_KEY = "hawkeye-gmail-oauth-state/v1.json";
const GMAIL_OAUTH_TOKEN_KEY = "hawkeye-gmail-oauth/v1.json";

interface StoredState { state: string; expiresAt: number; }
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

const BASE = "https://hawkeye-sterling.netlify.app";

export async function GET(req: Request): Promise<NextResponse> {
  // Check session cookie — browser navigation route, no enforce() needed
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("hs_session")?.value ?? "";
  if (!sessionToken || !verifyJwt(sessionToken).ok) {
    return NextResponse.redirect(`${BASE}/login`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateReceived = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=error&reason=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=error&reason=no_code`);
  }

  // Verify CSRF state (non-fatal if Blobs unavailable)
  try {
    const stored = await getJson<StoredState>(OAUTH_STATE_KEY);
    if (stored && stateReceived && stored.state !== stateReceived) {
      return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=error&reason=state_mismatch`);
    }
    if (stored && Date.now() > stored.expiresAt) {
      return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=error&reason=state_expired`);
    }
  } catch { /* Blobs unavailable — skip CSRF check */ }

  const clientId = process.env["GMAIL_CLIENT_ID"];
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=error&reason=missing_credentials`);
  }

  let data: TokenResponse;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
    });
    data = (await res.json()) as TokenResponse;
    if (!res.ok || data.error) {
      const reason = encodeURIComponent(data.error_description ?? data.error ?? `HTTP ${res.status}`);
      return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=error&reason=${reason}`);
    }
  } catch (err) {
    const reason = encodeURIComponent(err instanceof Error ? err.message : "token_exchange_failed");
    return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=error&reason=${reason}`);
  }

  if (!data.refresh_token) {
    return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=error&reason=no_refresh_token_revoke_first`);
  }

  try {
    await setJson(GMAIL_OAUTH_TOKEN_KEY, { refreshToken: data.refresh_token, storedAt: new Date().toISOString() });
    try { await del("hawkeye-gmail-token/v1.json"); } catch { /* non-fatal */ }
  } catch {
    return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=error&reason=blobs_write_failed`);
  }

  return NextResponse.redirect(`${BASE}/tfs-alerts?gmail=authorized`);
}
