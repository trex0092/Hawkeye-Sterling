export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

const ALLOWED_PROTOCOLS = ["https:", "http:"];

function stripHtml(html: string): string {
  // Remove scripts, styles, nav, header, footer, aside
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer|aside|figure|figcaption|noscript|button|form|input|label|select|option|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Preserve paragraph/heading breaks
    .replace(/<\/?(p|br|h[1-6]|li|tr|div|section|article|blockquote)[^>]*>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

function extractArticleText(html: string): string {
  // Try to find article body first
  const articleMatch =
    /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html) ??
    /<div[^>]*(?:class|id)="[^"]*(?:article-body|story-body|article__body|post-content|entry-content|main-content|paywall-content|ArticleBody|articleBody)[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html) ??
    /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);

  const source = articleMatch?.[1] ?? html;
  return stripHtml(source);
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { url: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) return NextResponse.json({ ok: false, error: "url required" }, { status: 400, headers: gate.headers });

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400, headers: gate.headers });
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return NextResponse.json({ ok: false, error: "Only http/https URLs are supported" }, { status: 400, headers: gate.headers });
  }

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HawkeyeAML/1.0; +https://hawkeye-sterling.netlify.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(20_000),
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return NextResponse.json({ ok: false, error: "URL does not return an HTML page" }, { status: 422, headers: gate.headers });
    }

    const html = await response.text();
    const articleText = extractArticleText(html);

    // Truncate to 8000 chars for downstream use
    const truncated = articleText.length > 8000 ? articleText.slice(0, 8000) + "\n\n[Article truncated — paste more text manually if needed]" : articleText;

    // If we got very little text, it's likely paywalled
    const isPaywalled = truncated.trim().length < 300;

    return NextResponse.json(
      {
        ok: true,
        text: truncated,
        charCount: articleText.length,
        domain: parsed.hostname.replace(/^www\./, ""),
        paywallSuspected: isPaywalled,
        paywallNote: isPaywalled
          ? "Limited text extracted — article may be paywalled. Copy and paste the article text manually."
          : null,
      },
      { headers: gate.headers }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[hawkeye] fetch-article failed:", msg);
    return NextResponse.json(
      { ok: false, error: "Could not fetch article. The site may block automated access. Please copy and paste the article text manually." },
      { status: 502, headers: gate.headers }
    );
  }
}
