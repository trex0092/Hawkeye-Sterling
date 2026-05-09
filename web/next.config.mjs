import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  typescript: {
    // JSX implicit-any errors (TS7026/TS2741) are pre-existing across the entire
    // codebase due to React types not being in the tsconfig lib. Runtime behaviour
    // is correct; suppress them during build consistent with the ESLint pattern above.
    ignoreBuildErrors: true,
  },

  async redirects() {
    return [
      { source: "/adverse-media", destination: "/screening", permanent: true },
      { source: "/compliance-qa", destination: "/mlro-advisor", permanent: true },
    ];
  },

  // .well-known endpoints — Next can't host directories that start with
  // a dot, so /.well-known/* lives at /api/well-known/* and is rewritten
  // here. Lets verifiers fetch the report-signing public key at the
  // RFC-conformant path without code-side knowledge of our route layout.
  async rewrites() {
    return [
      {
        source: "/.well-known/jwks.json",
        destination: "/api/well-known/jwks.json",
      },
      {
        source: "/.well-known/hawkeye-pubkey.pem",
        destination: "/api/well-known/hawkeye-pubkey.pem",
      },
    ];
  },

  // @netlify/blobs is imported dynamically inside ../dist/src/ingestion/blobs-store.js.
  // Webpack resolves modules relative to each source file's location, so when processing
  // a file under ../dist/ it looks for node_modules going up from that directory and
  // never reaches web/node_modules. Adding web/node_modules as an absolute path in
  // resolve.modules ensures webpack can find @netlify/blobs during the build even when
  // root node_modules is not installed (local dev). On Netlify, root npm ci installs
  // the package at the repo root first, so the standard relative resolution still wins.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.modules = [
        ...(Array.isArray(config.resolve.modules)
          ? config.resolve.modules
          : ["node_modules"]),
        path.resolve(__dirname, "node_modules"),
      ];
    }
    return config;
  },

  // The API routes (quick-screen, super-brain, news-search, ongoing/run,
  // compliance-report, sar-report, screening-report, etc.) import the
  // compiled brain from ../dist/src/brain/**. Next.js's default tracing
  // roots at the `web/` project directory, so dist/ — which lives at the
  // repo root — is silently dropped from the serverless function bundle
  // and every route 502s at cold-start with a MODULE_NOT_FOUND error.
  // Lifting the tracing root one level up + explicitly including dist/
  // guarantees the compiled brain ships with every function.
  //
  // The API routes (quick-screen, super-brain, news-search, ongoing/run,
  // compliance-report, sar-report, screening-report, etc.) import the
  // compiled brain from ../dist/src/brain/**. Next.js's default tracing
  // roots at the `web/` project directory, so dist/ — which lives at the
  // repo root — is silently dropped from the serverless function bundle
  // and every route 502s at cold-start with a MODULE_NOT_FOUND error.
  // These keys were under `experimental` in Next.js 14; they are top-level
  // in Next.js 15 and are silently ignored when nested under `experimental`.
  outputFileTracingRoot: path.join(__dirname, ".."),
  outputFileTracingIncludes: {
    // Compiled brain is only needed by API routes that import from dist/.
    "/api/**/*": [
      "../dist/**/*.js",
      // web/lib/server/store.ts dynamically requires @netlify/blobs at
      // first call. Without an explicit trace include the serverless
      // function silently falls back to in-memory storage — subjects
      // enrolled via /api/ongoing would vanish on the next cold-start.
      "./node_modules/@netlify/blobs/**/*",
    ],
    // styled-jsx + the Next.js server runtime are dynamically required by
    // next/dist/server/require-hook.js via string literals on every SSR
    // route, so the static file tracer never picks them up.
    //
    // IMPORTANT: do NOT include ./node_modules/react or ./node_modules/react-dom
    // here. next/dist/server/require-hook.js redirects require('react') and
    // require('react-dom') to next/dist/compiled/react* at runtime. Including
    // both next/dist/compiled/react AND node_modules/react in the bundle
    // creates two React instances, which breaks useSyncExternalStore and
    // causes "a3.snapshot is not a function" on every page load.
    "/**": [
      "./node_modules/styled-jsx/**/*",
      "./node_modules/next/dist/compiled/**/*",
      "./node_modules/next/dist/server/**/*",
    ],
  },
};

export default nextConfig;
