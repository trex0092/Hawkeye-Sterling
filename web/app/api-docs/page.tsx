"use client";

import { useEffect } from "react";
import { Header } from "@/components/layout/Header";

export default function ApiDocsPage() {
  useEffect(() => {
    // Swagger UI is loaded from jsDelivr so this page adds zero weight to
    // the main bundle. The OpenAPI spec itself is served statically from
    // web/public/openapi.json.
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css";
    document.head.appendChild(link);

    const style = document.createElement("style");
    style.textContent = `
      /* Compact the Servers + Authorize bar */
      .swagger-ui .scheme-container {
        padding: 6px 20px !important;
        box-shadow: none !important;
        margin: 0 !important;
      }
      .swagger-ui .servers { margin: 0 !important; }
      .swagger-ui .servers > label {
        font-size: 11px !important;
        margin: 0 0 2px !important;
      }
      .swagger-ui .servers select,
      .swagger-ui .servers .servers-title { font-size: 12px !important; }
      .swagger-ui .auth-wrapper { padding: 0 !important; }
      .swagger-ui .auth-btn-wrapper { margin: 0 !important; }
      .swagger-ui .btn.authorize {
        padding: 3px 10px !important;
        font-size: 12px !important;
        height: 28px !important;
      }
    `;
    document.head.appendChild(style);

    const bundle = document.createElement("script");
    bundle.src = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js";
    bundle.crossOrigin = "anonymous";
    bundle.onload = () => {
      const w = window as unknown as {
        SwaggerUIBundle?: (opts: Record<string, unknown>) => void;
      };
      if (w.SwaggerUIBundle) {
        w.SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger-root",
          docExpansion: "list",
          defaultModelsExpandDepth: 0,
          persistAuthorization: true,
          filter: true,
        });
      }
    };
    document.body.appendChild(bundle);

    return () => {
      link.remove();
      style.remove();
      bundle.remove();
    };
  }, []);

  return (
    <>
      <Header />
      <main className="bg-bg-panel min-h-screen">
        <div id="swagger-root" />
      </main>
    </>
  );
}
