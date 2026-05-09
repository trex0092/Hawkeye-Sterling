"use client";

// Replaces the default Next.js black-screen error with a visible stack trace
// so we can identify the root cause in production.

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html>
      <body style={{ background: "#0b1320", color: "#e2e8f0", fontFamily: "monospace", padding: "2rem" }}>
        <h1 style={{ color: "#f87171", fontSize: "1.1rem", marginBottom: "1rem" }}>
          Application error
        </h1>
        <p style={{ color: "#fbbf24", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
          {error?.message ?? "Unknown error"}
        </p>
        {error?.digest && (
          <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            Digest: {error.digest}
          </p>
        )}
        <pre style={{
          color: "#94a3b8",
          fontSize: "0.75rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          background: "#1e293b",
          padding: "1rem",
          borderRadius: "0.5rem",
          maxHeight: "80vh",
          overflow: "auto",
        }}>
          {error?.stack ?? "No stack trace available"}
        </pre>
      </body>
    </html>
  );
}
