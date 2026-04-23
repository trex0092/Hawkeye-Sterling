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
  //
  // Why the extra node_modules entries below:
  //   Lifting outputFileTracingRoot out of the web/ directory is what
  //   lets ../dist ride along, but it also suppresses Next's default
  //   transitive node_modules tracing — which used to pick up
  //   styled-jsx and the rest of the Next server runtime automatically.
  //   With the override, the serverless function was crashing on every
  //   request with `Cannot find module 'styled-jsx/style'` out of
  //   next/dist/server/require-hook.js. Explicitly including
  //   styled-jsx + next's server + react/react-dom restores a
  //   self-contained function bundle. Paths are relative to the app
  //   directory (web/), not the tracing root.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, ".."),
    outputFileTracingIncludes: {
      "/**/*": [
        "../dist/**/*.js",
        "./node_modules/styled-jsx/**/*",
        "./node_modules/next/dist/compiled/**/*",
        "./node_modules/next/dist/server/**/*",
        "./node_modules/react/**/*",
        "./node_modules/react-dom/**/*",
      ],
    },
  },
};

export default nextConfig;
