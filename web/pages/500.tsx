// Custom 500 page for Next.js standalone build.
// Required so Next.js generates 500.html in .next/server/pages/ during build.
// This file uses the Pages Router — it coexists with the App Router.
export default function Custom500() {
  return (
    <div
      style={{
        background: "#0b1320",
        color: "#e2e8f0",
        fontFamily: "monospace",
        padding: "2rem",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ color: "#f87171", fontSize: "1.1rem", marginBottom: "1rem" }}>
        500 — Server Error
      </h1>
      <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
        An unexpected error occurred. Please reload and try again.
      </p>
    </div>
  );
}
