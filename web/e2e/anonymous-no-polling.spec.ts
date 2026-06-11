import { test, expect } from "@playwright/test";

// Regression pin for the production 401 storm: with no session, the root
// layout's pollers (CaseVaultSyncer's EventSource on /api/cases/stream,
// useAlerts' interval on /api/alerts) must stay dormant. Before the
// auth-state gate they re-dialled forever — /api/cases/stream every ~5s —
// flooding the console and the function budget with 401s.
//
// /login renders the full root layout (where every poller mounts), so six
// quiet seconds there — longer than the EventSource retry interval —
// proves the gate holds where it used to leak fastest.

test.describe("Anonymous visitors do not poll authenticated APIs", () => {
  test("no /api/cases/stream or /api/alerts requests while signed out", async ({ page }) => {
    const polled: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (
        url.pathname.startsWith("/api/cases/stream") ||
        url.pathname.startsWith("/api/alerts")
      ) {
        polled.push(url.pathname);
      }
    });

    await page.goto("/login");
    // Hold the page open past the old 5s EventSource retry interval.
    await page.waitForTimeout(6_000);

    expect(polled).toEqual([]);
  });
});
