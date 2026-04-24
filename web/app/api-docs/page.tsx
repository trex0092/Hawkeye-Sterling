"use client";

import { useEffect } from "react";

export default function ApiDocsPage() {
  useEffect(() => {
    // Swagger UI is loaded from jsDelivr so this page adds zero weight to
    // the main bundle. The OpenAPI spec itself is served statically from
    // web/public/openapi.json.
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css";
    document.head.appendChild(link);

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
        });
      }
    };
    document.body.appendChild(bundle);

    return () => {
      link.remove();
      bundle.remove();
    };
  }, []);

  return (
    <main className="bg-bg-panel min-h-screen">
      <div id="swagger-root" />
    </main>
  );
}
