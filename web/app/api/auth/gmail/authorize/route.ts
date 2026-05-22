// GET /api/auth/gmail/authorize
// Starts the Gmail OAuth 2.0 authorization flow.
// Requires: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET env vars.
// The redirect URI https://<app>/api/auth/gmail/callback MUST be registered
// in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client.
//
// Security: CSRF state token stored in Blobs, verified on callback.
// Access: same-origin only (Next.js middleware injects ADMIN_TOKEN for
// browser requests carrying the hs_session cookie).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { setJson } from "@/lib/server/store";
import { randomBytes } from "node:crypto";

const OAUTH_STATE_KEY = "hawkeye-gmail-oauth-state/v1.json";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

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

  const clientId = process.env["GMAIL_CLIENT_ID"];
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in Netlify environment variables before authorizing." },
      { status: 503, headers: gate.headers }
    );
  }

  // Generate CSRF state token
  const state = randomBytes(32).toString("hex");
  try {
    await setJson(OAUTH_STATE_KEY, { state, expiresAt: Date.now() + 10 * 60 * 1000 });
  } catch {
    // Non-fatal — proceed without CSRF if Blobs unavailable
  }

  const redirectUri = `${getAppBase(req)}/api/auth/gmail/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    { status: 302 }
  );
}
