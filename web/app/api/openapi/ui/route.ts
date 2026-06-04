// GET /api/openapi/ui
//
// Returns an HTML page that renders the Hawkeye Sterling OpenAPI spec
// via the Swagger UI CDN.  Fetches the spec from /api/openapi so the
// same auth token passed to this page is forwarded automatically.
//
// Protected by enforce(req) — unauthenticated callers get a 401.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const SWAGGER_UI_VERSION = "5.17.14";
const CDN = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

function buildHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hawkeye Sterling API — OpenAPI Explorer</title>
  <link rel="stylesheet" href="${CDN}/swagger-ui.css" />
  <style>
    /* ── Brand overrides ─────────────────────────────────────── */
    :root {
      --hs-navy:  #0a1628;
      --hs-gold:  #c9a84c;
      --hs-slate: #1e2d42;
    }

    html, body { margin: 0; padding: 0; background: var(--hs-navy); font-family: system-ui, sans-serif; }

    #hawkeye-header {
      background: var(--hs-navy);
      border-bottom: 2px solid var(--hs-gold);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 14px;
    }

    #hawkeye-header svg { flex-shrink: 0; }

    #hawkeye-header .brand {
      display: flex;
      flex-direction: column;
    }

    #hawkeye-header .brand-name {
      color: var(--hs-gold);
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1.2;
    }

    #hawkeye-header .brand-sub {
      color: #8da4c2;
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    #swagger-ui {
      background: #fff;
      min-height: calc(100vh - 66px);
    }

    /* Tighten up the default Swagger UI top-bar */
    .swagger-ui .topbar { display: none; }

    .swagger-ui .info { margin: 20px 0; }

    .swagger-ui .scheme-container { background: #f5f7fa; padding: 12px 20px; }

    /* Tag section headers */
    .swagger-ui .opblock-tag { font-size: 1rem; }

    /* Accent the Authorize button */
    .swagger-ui .btn.authorize { border-color: var(--hs-gold); color: var(--hs-gold); }
    .swagger-ui .btn.authorize svg { fill: var(--hs-gold); }
  </style>
</head>
<body>

  <!-- Hawkeye Sterling branded header -->
  <div id="hawkeye-header">
    <!-- Minimal hawk-eye icon (SVG inline for zero external dependency) -->
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="20" cy="20" r="19" stroke="#c9a84c" stroke-width="2"/>
      <ellipse cx="20" cy="20" rx="11" ry="7" stroke="#c9a84c" stroke-width="1.5"/>
      <circle cx="20" cy="20" r="4" fill="#c9a84c"/>
      <circle cx="20" cy="20" r="1.5" fill="#0a1628"/>
    </svg>
    <div class="brand">
      <span class="brand-name">Hawkeye Sterling</span>
      <span class="brand-sub">AML Platform &mdash; API Explorer</span>
    </div>
  </div>

  <div id="swagger-ui"></div>

  <script src="${CDN}/swagger-ui-bundle.js" crossorigin="anonymous"></script>
  <script src="${CDN}/swagger-ui-standalone-preset.js" crossorigin="anonymous"></script>
  <script>
    window.onload = function () {
      const ui = SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: "#swagger-ui",
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        layout: "StandaloneLayout",
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        requestSnippetsEnabled: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        syntaxHighlight: { theme: "monokai" },
        // Expose the bearerAuth scheme in the UI so testers can paste a JWT.
        initOAuth: {
          clientId: "",
          usePkceWithAuthorizationCodeGrant: false,
        },
      });
      window.ui = ui;
    };
  </script>

</body>
</html>`;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "openapi.ui_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const url = new URL(req.url);
  // Build the absolute spec URL on the same host so Swagger UI fetches it
  // with the same origin (avoids CORS complications).
  const specUrl = `${url.protocol}//${url.host}/api/openapi`;

  const html = buildHtml(specUrl);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      // Permit Swagger UI to load scripts from unpkg CDN.
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' https://unpkg.com 'unsafe-inline'",
        "style-src 'self' https://unpkg.com 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "font-src 'self' https://unpkg.com",
      ].join("; "),
    },
  });
}
