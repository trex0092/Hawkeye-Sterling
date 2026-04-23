import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // web/ is a workspace inside the monorepo; the API routes import the
  // compiled brain from ../dist/src/brain/**. Tell Next's file-trace that
  // the workspace root is one level up so Netlify's Next plugin bundles
  // those files into the serverless function. Without this, cold-starts
  // on Netlify 502 because the traced function can't resolve the import.
  experimental: {
    // Next.js 14 still exposes tracing knobs under `experimental`; they
    // were promoted to top-level in Next.js 15.
    outputFileTracingRoot: path.join(__dirname, ".."),
    outputFileTracingIncludes: {
      "/api/quick-screen": ["../dist/src/brain/**/*.js"],
      "/api/super-brain": ["../dist/src/brain/**/*.js"],
      "/api/news-search": ["../dist/src/brain/**/*.js"],
      "/api/batch-screen": ["../dist/src/brain/**/*.js"],
    },
  },
};

export default nextConfig;
