// POST /api/tfs-alerts/search
// Searches Gmail for TFS alert emails from EOCN (sanctions@eocn.gov.ae).
// Access token is managed automatically via gmail-token.ts (auto-refresh).
//
// Runs three queries, deduplicates by threadId, returns new alert candidates.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getGmailAccessToken } from "@/lib/server/gmail-token";

const GMAIL_BASE = "https://www.googleapis.com/gmail/v1/users/me";

const SEARCH_QUERIES = [
  "from:sanctions@eocn.gov.ae",
  "from:eocn.gov.ae",
  'subject:"Targeted Financial Sanctions" from:eocn.gov.ae',
];

interface GmailMessageRef {
  id: string;
  threadId: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: GmailHeader[];
    body?: { data?: string };
    parts?: GmailMessagePart[];
  };
}

interface GmailSearchResult {
  messages?: GmailMessageRef[];
}

function getHeader(msg: GmailMessage, name: string): string {
  return (
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function decodeBase64Url(encoded: string): string {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractTextFromParts(parts: GmailMessagePart[]): string {
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      const nested = extractTextFromParts(part.parts);
      if (nested) return nested;
    }
  }
  return "";
}

function extractBody(msg: GmailMessage): string {
  if (msg.payload?.body?.data) {
    return decodeBase64Url(msg.payload.body.data);
  }
  if (msg.payload?.parts) {
    return extractTextFromParts(msg.payload.parts);
  }
  return msg.snippet ?? "";
}

async function gmailFetch(path: string, token: string): Promise<Response> {
  return fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function searchMessages(query: string, token: string): Promise<GmailMessageRef[]> {
  const res = await gmailFetch(
    `/messages?q=${encodeURIComponent(query)}&maxResults=50`,
    token,
  );
  if (!res.ok) {
    if (res.status === 401) throw new Error("GMAIL_AUTH_FAILED");
    throw new Error(`Gmail search error ${res.status}`);
  }
  const data = (await res.json()) as GmailSearchResult;
  return data.messages ?? [];
}

async function getMessage(id: string, token: string): Promise<GmailMessage> {
  const res = await gmailFetch(`/messages/${id}?format=full`, token);
  if (!res.ok) throw new Error(`Gmail message fetch error ${res.status}`);
  return (await res.json()) as GmailMessage;
}

export interface TFSAlertCandidate {
  threadId: string;
  messageId: string;
  dateReceived: string;
  subject: string;
  sender: string;
  snippet: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let token: string;
  try {
    token = await getGmailAccessToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "GMAIL_NOT_CONFIGURED") {
      return NextResponse.json({ ok: false, error: "GMAIL_NOT_CONFIGURED" }, { status: 503, headers: gate.headers });
    }
    if (msg.startsWith("GMAIL_REFRESH_FAILED")) {
      return NextResponse.json({ ok: false, error: "GMAIL_REFRESH_FAILED" }, { status: 401, headers: gate.headers });
    }
    return NextResponse.json({ ok: false, error: "GMAIL_AUTH_FAILED" }, { status: 401, headers: gate.headers });
  }

  let body: { knownThreadIds?: string[] } = {};
  try {
    body = (await req.json()) as { knownThreadIds?: string[] };
  } catch {
    // empty body is fine
  }
  const knownIds = new Set(body.knownThreadIds ?? []);

  try {
    // Run all three queries, collect unique message refs by threadId
    const threadMap = new Map<string, GmailMessageRef>();

    for (const query of SEARCH_QUERIES) {
      let refs: GmailMessageRef[];
      try {
        refs = await searchMessages(query, token);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "GMAIL_AUTH_FAILED") {
          return NextResponse.json({ ok: false, error: "GMAIL_AUTH_FAILED" }, { status: 401, headers: gate.headers });
        }
        // Non-auth errors: log and continue to next query
        console.warn(`[tfs-search] query "${query}" failed:`, msg);
        continue;
      }
      for (const ref of refs) {
        if (!threadMap.has(ref.threadId)) {
          threadMap.set(ref.threadId, ref);
        }
      }
    }

    if (threadMap.size === 0) {
      return NextResponse.json({ ok: true, candidates: [] }, { headers: gate.headers });
    }

    // Filter to only NEW (not yet tracked) threads
    const newRefs = Array.from(threadMap.values()).filter((r) => !knownIds.has(r.threadId));

    // Fetch full details for new threads
    const candidates: TFSAlertCandidate[] = [];
    for (const ref of newRefs) {
      try {
        const msg = await getMessage(ref.id, token);
        const subject = getHeader(msg, "Subject");
        const from = getHeader(msg, "From");
        const date = getHeader(msg, "Date");
        const body = extractBody(msg);
        const snippet = body.slice(0, 300) || msg.snippet?.slice(0, 300) || "";
        const dateReceived = msg.internalDate
          ? new Date(parseInt(msg.internalDate, 10)).toISOString()
          : date
            ? new Date(date).toISOString()
            : new Date().toISOString();

        candidates.push({
          threadId: ref.threadId,
          messageId: ref.id,
          dateReceived,
          subject,
          sender: from,
          snippet,
        });
      } catch (err) {
        console.warn(`[tfs-search] failed to fetch message ${ref.id}:`, err);
      }
    }

    return NextResponse.json({ ok: true, candidates }, { headers: gate.headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("timeout")) {
      return NextResponse.json({ ok: false, error: "NETWORK_TIMEOUT" }, { status: 504, headers: gate.headers });
    }
    console.error("[tfs-search] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500, headers: gate.headers });
  }
}
