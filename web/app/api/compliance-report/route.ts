import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import {
  buildComplianceReport,
  type ReportInput,
} from "@/lib/reports/complianceReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/compliance-report
// Body: { subject, result, superBrain?, reportingEntity?, mlro? }
// Returns text/plain — the Hawkeye Sterling MLRO report, generated
// strictly from the payload (no invented facts, no narrative hallucinations).

// Strip characters that would let a caller inject response headers or
// break the filename quoting. Subject IDs are user-controlled; without
// this, "HS-10\r\nX-Evil: 1" in the body would split the header.
function safeFilenameSegment(s: string | undefined | null): string {
  if (!s) return "unknown";
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64) || "unknown";
}

// Escape any user-controlled text that ends up in the HTML PDF payload
// so a subject name like "</title><script>" can't break out of the
// page shell we emit.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtmlReport(text: string, subjectName: string): string {
  const safeTitle = escapeHtml(`Hawkeye Sterling — ${subjectName}`);
  const safeBody = escapeHtml(text);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body {
      font-family: "Courier New", ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 32px 40px;
      font-size: 11.5px;
      line-height: 1.5;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 0;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-bottom: 16px;
    }
    .toolbar button {
      font: inherit;
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background: #fff;
      cursor: pointer;
    }
    .toolbar button.primary {
      background: #111;
      color: #fff;
      border-color: #111;
    }
    @media print {
      body { padding: 16px 20px; }
      .toolbar { display: none; }
      @page { margin: 16mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()" class="primary">Save as PDF</button>
    <button onclick="window.close()">Close</button>
  </div>
  <pre>${safeBody}</pre>
  <script>
    // Auto-open the native print dialog so "Save as PDF" is one keystroke
    // away. Users can cancel to keep the on-screen preview.
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`;
}

async function handleComplianceReport(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "text").toLowerCase();

  let body: ReportInput;
  try {
    body = (await req.json()) as ReportInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.subject?.name || !body?.result) {
    return NextResponse.json(
      { ok: false, error: "subject and result are required" },
      { status: 400 },
    );
  }
  let report: string;
  try {
    report = buildComplianceReport(body);
  } catch (err) {
    console.error("compliance-report failed to build", err);
    return NextResponse.json(
      { ok: false, error: "report generation failed" },
      { status: 500 },
    );
  }

  if (format === "html" || format === "pdf") {
    const html = renderHtmlReport(report, body.subject.name);
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // inline so the browser renders it directly; user saves as PDF
        // via the auto-opened print dialog.
        "content-disposition": `inline; filename="hawkeye-report-${safeFilenameSegment(body.subject.id)}.html"`,
        "cache-control": "no-store",
      },
    });
  }

  const filename = `hawkeye-report-${safeFilenameSegment(body.subject.id)}.txt`;
  return new Response(report, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const POST = withGuard(handleComplianceReport);
