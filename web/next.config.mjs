import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API routes (quick-screen, super-brain, news-search, ongoing/run,
  // compliance-report, sar-report, screening-report, etc.) import the
  // compiled brain from ../dist/src/brain/**. Next.js's default tracing
  // roots at the `web/` project directory, so dist/ — which lives at the
  // repo root — is silently dropped from the serverless function bundle
  // and every route 502s at cold-start with a MODULE_NOT_FOUND error.
  // Lifting the tracing root one level up + explicitly including dist/
  // guarantees the compiled brain ships with every function.
  //
  // Next.js 14 still keeps these knobs under `experimental`; at top-level
  // they're silently ignored (the build emits "Unrecognized key(s) in
  // object: 'outputFileTracingRoot', 'outputFileTracingIncludes'" and the
  // tracing override never takes effect). Promoted to top-level in Next 15.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, ".."),
    outputFileTracingIncludes: {
      // Include compiled brain for all API routes.
      "/api/**/*": ["../dist/**/*.js"],
      // styled-jsx is dynamically required by next/dist/server/require-hook.js
      // via a string literal, so the static file tracer never detects it.
      // Explicitly include it for every route so it lands in the Lambda bundle.
      "/**": ["./node_modules/styled-jsx/**/*"],
    },
  },
};

export default nextConfig;
