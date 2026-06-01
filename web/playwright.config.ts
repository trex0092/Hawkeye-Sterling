import { defineConfig, devices } from "@playwright/test";

// TEST-06: detect CI via env so flaky network/timing failures don't fail the
// whole suite, and e2e tests parallelise across cores in CI. Local dev keeps
// retries:0 + workers:1 so test authors see the deterministic failure mode
// before it's hidden by retries.
const isCI = !!process.env["CI"];

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: isCI ? 2 : 0,
  workers: isCI ? 4 : 1,
  // Fail fast on `.only` in CI — accidental commits of focused tests are a
  // common false-pass pattern.
  forbidOnly: isCI,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",

  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // Only reuse an already-running dev server locally; CI must start a fresh
    // one so a stale background process can't silently serve the tests.
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
