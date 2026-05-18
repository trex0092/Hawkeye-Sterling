"use client";

// Catches catastrophic errors that crash the root layout itself.
// Stack traces are only shown in non-production environments to prevent
// leaking internal architecture, source paths, and library versions.

const IS_PROD = process.env.NODE_ENV === "production";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ background: "#0b1320", color: "#e2e8f0", fontFamily: "monospace", padding: "2rem" }}>
        <h1 style={{ color: "#f87171", fontSize: "1.1rem", marginBottom: "1rem" }}>
          Application error
        </h1>
        <p style={{ color: "#fbbf24", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
          {IS_PROD ? "An unexpected error occurred. Please reload and try again." : (error?.message ?? "Unknown error")}
        </p>
        {error?.digest && (
          <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            Reference: {error.digest}
          </p>
        )}
        {/* Only show stack in non-production to prevent leaking internal paths */}
        {!IS_PROD && (
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
        )}
        <button
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            background: "#1e40af",
            color: "#e2e8f0",
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
