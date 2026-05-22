export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/server/auth";
import { randomBytes } from "node:crypto";
import { setJson } from "@/lib/server/store";

// MUST match exactly what is registered in Google Cloud Console → Authorized redirect URIs
const REDIRECT_URI = "https://hawkeye-sterling.netlify.app/api/auth/gmail/callback";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const OAUTH_STATE_KEY = "hawkeye-gmail-oauth-state/v1.json";

export async function GET(): Promise<NextResponse> {
  // Check session cookie — browser navigation route, no enforce() needed
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  if (!sessionToken || !verifySession(sessionToken)) {
    return NextResponse.redirect("https://hawkeye-sterling.netlify.app/login?next=/api/auth/gmail/authorize");
  }

  const clientId = process.env["GMAIL_CLIENT_ID"];
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      "https://hawkeye-sterling.netlify.app/tfs-alerts?gmail=error&reason=missing_client_credentials"
    );
  }

  const state = randomBytes(32).toString("hex");
  // Store CSRF state — non-fatal if Blobs unavailable
  try {
    await setJson(OAUTH_STATE_KEY, { state, expiresAt: Date.now() + 10 * 60 * 1000 });
  } catch {
    // continue without CSRF state — acceptable for internal tool
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
