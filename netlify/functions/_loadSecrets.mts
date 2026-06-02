// Shared secrets-bundle loader for Netlify scheduled functions.
// These functions run outside the Next.js app lifecycle and never go through
// web/instrumentation.ts, so they call this directly at the top of their handler.
//
// Usage:
//   import { loadSecretsBundle } from "./_loadSecrets.mjs";
//   loadSecretsBundle(); // call once before accessing any vendor API key
//
// See web/instrumentation.ts for the equivalent loader used by app routes.

export function loadSecretsBundle(): void {
  const raw = process.env["HAWKEYE_SECRETS"];
  if (!raw?.trim()) return;
  try {
    const bundle = JSON.parse(raw) as Record<string, unknown>;
    let loaded = 0;
    for (const [key, value] of Object.entries(bundle)) {
      if (typeof value === "string" && value.trim() && !process.env[key]) {
        process.env[key] = value;
        loaded++;
      }
    }
    console.info(
      `[secrets-bundle] ${loaded} keys loaded, ${Object.keys(bundle).length - loaded} skipped (already set)`,
    );
  } catch (err) {
    console.error(
      "[secrets-bundle] HAWKEYE_SECRETS is not valid JSON — bundle not loaded:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
