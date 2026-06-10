import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Patch fs.promises with a concurrency semaphore + EMFILE retry.
// The output:standalone trace phase opens ~3000 node_modules files concurrently
// via readFile, spiking fds from ~245 to ~3246 (past the 4096 hard limit on
// Netlify build agents). Semaphore caps concurrent fd-acquiring calls at 500.
// Guard: preload-graceful-fs.cjs (via --require) runs earlier and sets
// fs.__emfilePatched; skip here to avoid double-patching and shared semaphore state.
;(function patchFsPromises() {
  const fs = require("fs");
  if (fs.__emfilePatched) return;
  fs.__emfilePatched = true;

  const MAX_CONCURRENT_FD = 500;
  let active = 0;
  const waiting = [];

  function acquire() {
    return new Promise(resolve => {
      if (active < MAX_CONCURRENT_FD) { active++; resolve(); }
      else waiting.push(resolve);
    });
  }

  function release() {
    if (waiting.length > 0) {
      waiting.shift()();
    } else {
      active--;
    }
  }

  const MAX_RETRIES = 20;
  const FD_METHODS = new Set(["readFile", "writeFile", "appendFile", "copyFile"]);
  const METHODS = ["open", "writeFile", "readFile", "appendFile", "copyFile",
                   "rename", "mkdir", "readdir", "stat", "lstat", "access"];

  for (const method of METHODS) {
    const orig = fs.promises[method];
    if (typeof orig !== "function") continue;
    const limited = FD_METHODS.has(method);

    fs.promises[method] = async function emfileRetry(...args) {
      if (limited) await acquire();
      try {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            return await orig.apply(this, args);
          } catch (err) {
            if ((err.code === "EMFILE" || err.code === "ENFILE") && attempt < MAX_RETRIES) {
              await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
              continue;
            }
            throw err;
          }
        }
      } finally {
        if (limited) release();
      }
    };
  }

  // Also patch callback-based API via graceful-fs if available.
  try {
    const gfs = require("graceful-fs");
    gfs.gracefulify(fs);
  } catch {
    // graceful-fs unavailable — rely on ulimit and the promises patch above
  }
})();

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

  // @upstash/box ships ESM-only ("type":"module", exports.import only, no exports.require).
  // Without transpilePackages webpack tries to bundle it as CJS and fails at runtime
  // with "exports is not defined" or similar. transpilePackages runs the package through
  // SWC before bundling, converting ESM export syntax to webpack-compatible CJS.
  transpilePackages: ["@upstash/box"],

  // EMFILE mitigation for Netlify build agents (fd hard limit ~4096).
  // cpus:1 — serialises page generation to 1 worker (default = os.cpus()-1 = 3).
  // The IIFE at the top of this file caps concurrent fd calls at 500 with
  // EMFILE retry (up to 20 attempts, 50 ms × attempt backoff). graceful-fs
  // is also preloaded via NODE_OPTIONS --require in scripts/build.sh.
  // Note: experimental.workerThreads is not a recognized Next.js 16 config
  // key and is silently ignored — removed to avoid misleading documentation.
  experimental: {
    cpus: 1,
  },

  // Don't disclose the framework + version to attackers. Removes the default
  // `x-powered-by: Next.js` response header. Zero functional impact.
  poweredByHeader: false,

  env: {
    HAWKEYE_BUILD_COMMIT_REF: BUILD_COMMIT_REF,
  },

  typescript: {
    // Previously set ignoreBuildErrors: true for TS7026/TS2741 JSX implicit-any
    // errors. Verified 2026-05-18 those errors no longer exist (bare
    // `npx tsc --noEmit -p tsconfig.json` exits 0). Flag removed so build-time
    // type errors fail the deploy instead of shipping silently.
    ignoreBuildErrors: false,
  },

  // NOTE: Next.js `async headers()` was tried in PR #496 but @netlify/plugin-nextjs
  // 5.7.2 silently ignores it for SSR + Lambda responses (verified empirically:
  // headers landed on /manifest.webmanifest from netlify.toml, but NOT on /login
  // or /api/health). Security headers for dynamic surfaces are now set in
  // web/proxy.ts via applySecurityHeaders().

  async redirects() {
    return [
      { source: "/adverse-media", destination: "/screening", permanent: true },
      { source: "/compliance-qa", destination: "/mlro-advisor", permanent: true },
      { source: "/weaponized-brain", destination: "/intelligence-hub?tab=workbench", permanent: true },
      // Intelligence Hub — old standalone pages redirect to the unified hub tab
      { source: "/analytics", destination: "/intelligence-hub?tab=analytics", permanent: false },
      { source: "/brain-intelligence", destination: "/intelligence-hub?tab=brain", permanent: false },
      { source: "/workbench", destination: "/intelligence-hub?tab=workbench", permanent: false },
      { source: "/intel/telemetry", destination: "/intelligence-hub?tab=telemetry", permanent: false },
      { source: "/intel/red-team", destination: "/intelligence-hub?tab=red-team", permanent: false },
      { source: "/security-audit", destination: "/intelligence-hub?tab=security-audit", permanent: false },
      { source: "/status", destination: "/intelligence-hub?tab=status", permanent: false },
      { source: "/api-docs", destination: "/intelligence-hub?tab=api-docs", permanent: false },
    ];
  },

  // NOTE: .well-known rewrites used to live here as Next.js `rewrites()`
  // entries. Verified empirically that @netlify/plugin-nextjs does not
  // honour Next rewrites for dot-prefix paths in production — /.well-known/
  // calls returned 404 while the underlying /api/well-known/ routes worked.
  // The rewrite is now done in web/proxy.ts (early-return NextResponse
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

      // OpenTelemetry packages are optional peer deps loaded dynamically in
      // instrumentation.ts. Mark them as externals so webpack stops emitting
      // "Module not found" warnings for packages that intentionally may not
      // be installed.
      //
      // config.externals can be an array, a function, or undefined depending
      // on the Next.js version and runtime. Preserve whatever is already there
      // by normalising to an array before appending — a bare function must be
      // kept as-is (wrapping it) so Next.js's own externalization logic runs.
      const otelExternals = [
        "@opentelemetry/sdk-node",
        "@opentelemetry/auto-instrumentations-node",
        "@opentelemetry/resources",
        "@opentelemetry/semantic-conventions",
      ];
      if (Array.isArray(config.externals)) {
        config.externals = [...config.externals, ...otelExternals];
      } else if (config.externals) {
        // Bare function — wrap it in an array so both the original function
        // and the OTel string patterns coexist.
        config.externals = [config.externals, ...otelExternals];
      } else {
        config.externals = otelExternals;
      }
    }

    // AsyncLocalStorage.snapshot() polyfill — BannerPlugin injection.
    //
    // WHY: AsyncLocalStorage.snapshot() was added in Node.js 22.3.0. Next.js 15.5
    // compiled runtimes (app-page, app-route) capture `let eV = globalThis.AsyncLocalStorage`
    // at module load time and call `eV.snapshot()` per request. On Lambda/Netlify builds
    // that ship a Node.js version < 22.3.0, this throws at runtime with no useful error.
    //
    // WHY THREE LOCATIONS: require('async_hooks') and require('node:async_hooks') can be
    // separate module-cache entries on some Lambda Node.js builds (depends on how the
    // resolver is initialised). Both may differ from the globalThis copy set by
    // node-environment-baseline.js. Patching all three guarantees the polyfill is present
    // regardless of which path Next.js or a dependency uses to obtain the class.
    //
    // WHY BANNER (not a polyfill module): The banner is injected as raw JS at the top of
    // every compiled server entry, before any module evaluation. A runtime polyfill module
    // would be too late — ALS is captured at module-load time, not at request time.
    //
    // WHEN CAN THIS BE REMOVED: When the minimum deployed Node.js version is >= 22.3.0
    // across all Netlify function runtimes AND all k8s node pools. Check with
    //   node -e "const {AsyncLocalStorage}=require('async_hooks');console.log(typeof AsyncLocalStorage.snapshot)"
    // on each target environment. If it prints "function" everywhere, remove this block
    // and the corresponding step in scripts/build.sh (patch-als.cjs).
    //
    // NOTE: The minified banner string has no source map. Stack traces from within it will
    // show as anonymous code. This is acceptable — the polyfill only runs if snapshot() is
    // absent; errors inside it indicate a Node.js environment regression, not app code.
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

    // src/brain/**/*.ts files use NodeNext-style `.js` extension imports
    // (e.g. `import { X } from './y.js'`). Webpack 5's extensionAlias
    // transparently tries `.ts` before `.js` so brain modules imported by
    // web/app/api/** routes resolve correctly without extension changes.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };

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
  // @resvg/resvg-js ships a platform-specific native binding (.node). Keep it
  // external so Next never tries to parse/bundle the binary — the file tracer
  // still copies the module into the function via normal dependency tracing
  // (CCL-2026-023, attestation status-card rasteriser).
  serverExternalPackages: ["@resvg/resvg-js"],
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
    // styled-jsx is dynamically resolved at runtime by
    // next/dist/server/require-hook.js (defaultOverrides), so the static file
    // tracer cannot pick it up. Keep this explicit include.
    //
    // REMOVED 2026-05-18: "./node_modules/next/dist/compiled/**/*" (1125 files)
    // and "./node_modules/next/dist/server/**/*" (1243 files) — these globs
    // add ALL files in those directories to EVERY route's .nft.json (509 routes
    // × 2368 files = 1.2M trace entries), exhausting Netlify build-agent RAM
    // during "Collecting build traces" (exit code 2). Both directories are
    // already included automatically by Next.js's file tracer in the standalone
    // output (.next/standalone/web/node_modules/next/dist/compiled+server) so
    // removing them from outputFileTracingIncludes has no functional impact.
    //
    // IMPORTANT: do NOT include ./node_modules/react or ./node_modules/react-dom
    // here. next/dist/server/require-hook.js redirects require('react') and
    // require('react-dom') to next/dist/compiled/react* at runtime. Including
    // both next/dist/compiled/react AND node_modules/react in the bundle
    // creates two React instances, which breaks useSyncExternalStore and
    // causes "a3.snapshot is not a function" on every page load.
    "/**": [
      "./node_modules/styled-jsx/**/*",
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
