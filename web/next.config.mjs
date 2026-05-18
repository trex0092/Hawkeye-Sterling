import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Capture the deployed git SHA at build time. Netlify provides `COMMIT_REF`;
// other CI providers expose it under different names. Without this, runtime
// lookups against `process.env.COMMIT_REF` in serverless functions fall
// through to "dev" because Next.js' Lambda runtime doesn't propagate build
// env vars unless they're inlined here. Audit M-06 / governance trail.
const BUILD_COMMIT_REF =
  process.env.COMMIT_REF ??
  process.env.GIT_COMMIT_SHA ??
  process.env.NETLIFY_COMMIT_REF ??
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  "dev";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,

  // Don't disclose the framework + version to attackers. Removes the default
  // `x-powered-by: Next.js` response header. Zero functional impact.
  poweredByHeader: false,

  env: {
    HAWKEYE_BUILD_COMMIT_REF: BUILD_COMMIT_REF,
  },

  typescript: {
    // TypeScript is clean — tsc --noEmit exits 0 with no errors.
    ignoreBuildErrors: false,
  },

  eslint: {
    // ESLint is configured and errors are real. Warnings (unused-vars) are
    // tolerated during builds; errors (eqeqeq, no-duplicate-imports) are fixed.
    ignoreDuringBuilds: false,
  },

  // NOTE: Next.js `async headers()` was tried in PR #496 but @netlify/plugin-nextjs
  // 5.7.2 silently ignores it for SSR + Lambda responses (verified empirically:
  // headers landed on /manifest.webmanifest from netlify.toml, but NOT on /login
  // or /api/health). Security headers for dynamic surfaces are now set in
  // web/middleware.ts via applySecurityHeaders().

  async redirects() {
    return [
      { source: "/adverse-media", destination: "/screening", permanent: true },
      { source: "/compliance-qa", destination: "/mlro-advisor", permanent: true },
    ];
  },

  // NOTE: .well-known rewrites used to live here as Next.js `rewrites()`
  // entries. Verified empirically that @netlify/plugin-nextjs does not
  // honour Next rewrites for dot-prefix paths in production — /.well-known/
  // calls returned 404 while the underlying /api/well-known/ routes worked.
  // The rewrite is now done in web/middleware.ts (early-return NextResponse
  // .rewrite) which the plugin DOES honour.

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
      // NOTE: the OpenSanctions sanctions.json (48 MB) trace include was
      // removed alongside the file itself. The file repeatedly broke
      // Netlify builds (exit code 2) — even after switching to runtime
      // load, the file-tracer / plugin-nextjs choked on the 48 MB asset
      // during bundling. openSanctions.ts now degrades to an empty index
      // when the file is missing; restore the include once the dataset
      // is hosted outside the repo bundle (Netlify Blobs / S3 / CDN).
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
