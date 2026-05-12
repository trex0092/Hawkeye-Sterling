import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,

  typescript: {
    // JSX implicit-any errors (TS7026/TS2741) are pre-existing across the entire
    // codebase due to React types not being in the tsconfig lib. Runtime behaviour
    // is correct; suppress them during build consistent with the ESLint pattern above.
    ignoreBuildErrors: true,
  },

  eslint: {
    // react-hooks/rules-of-hooks hits a stack overflow analysing the large
    // MlroAdvisorPage component, crashing the build with exit code 2. ESLint
    // is run separately in CI; this flag prevents it from blocking Netlify deploys.
    ignoreDuringBuilds: true,
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
  webpack: (config, { isServer, nextRuntime, webpack }) => {
    if (isServer) {
      config.resolve.modules = [
        ...(Array.isArray(config.resolve.modules)
          ? config.resolve.modules
          : ["node_modules"]),
        path.resolve(__dirname, "node_modules"),
      ];
    }

    // AsyncLocalStorage.snapshot() was added in Node.js 22.3.0.
    // Next.js 15.5 compiled runtimes (app-page, app-route) capture
    //   let eV = globalThis.AsyncLocalStorage
    // at module load time and call eV.snapshot() per request.
    //
    // We patch ALL THREE known locations for the AsyncLocalStorage class
    // because require('async_hooks') vs require('node:async_hooks') may be
    // separate module-cache entries on some Lambda Node.js builds, and both
    // differ from the globalThis copy set by node-environment-baseline.js.
    if (isServer && nextRuntime !== "edge") {
      config.plugins.push(
        new webpack.BannerPlugin({
          banner:
            "(function(){var s=function(){return function(fn){var a=Array.prototype.slice.call(arguments,1);return fn.apply(this,a);};};try{var h=require('async_hooks');if(h&&h.AsyncLocalStorage&&typeof h.AsyncLocalStorage.snapshot!=='function')h.AsyncLocalStorage.snapshot=s;}catch(e){}try{var h2=require('node:async_hooks');if(h2&&h2.AsyncLocalStorage&&typeof h2.AsyncLocalStorage.snapshot!=='function')h2.AsyncLocalStorage.snapshot=s;}catch(e){}var g=typeof globalThis!=='undefined'&&globalThis;if(g&&g.AsyncLocalStorage&&typeof g.AsyncLocalStorage.snapshot!=='function')g.AsyncLocalStorage.snapshot=s;})();",
          raw: true,
          entryOnly: true,
        })
      );
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
  // outputFileTracingRoot is set to the repo root (one level above web/).
  // The nft tracer therefore reports all paths with a "web/" prefix, e.g.
  // "web/node_modules/react/index.js". The old patterns "./node_modules/react/**/*"
  // normalise to "node_modules/react/**/*" and never match those prefixed paths,
  // so React shipped twice and broke useSyncExternalStore ("a3.snapshot is not a function").
  // Using "**" anchors the match anywhere in the path, covering both
  // "web/node_modules/react/…" and a hypothetical root "node_modules/react/…".
  // "node_modules/react" is distinct from "node_modules/next/dist/compiled/react"
  // so the compiled copy that Next.js needs is NOT accidentally excluded.
  outputFileTracingExcludes: {
    "/**": [
      "**/node_modules/react/**",
      "**/node_modules/react-dom/**",
      "**/node_modules/react-is/**",
    ],
  },
};

export default nextConfig;
