import { test, expect } from "@playwright/test";

// These tests verify that the Next.js middleware correctly guards protected
// routes. No authentication is set up, so every request should redirect to /login.

test.describe("Middleware auth guard — protected routes redirect to /login", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure no session cookie is present for each test
    await context.clearCookies();
  });

  test("GET /screening redirects to /login", async ({ page }) => {
    const response = await page.goto("/screening");
    await expect(page).toHaveURL(/\/login/);
    // Either a redirect chain led here or the page itself is the login page
    expect(response?.status()).toBeLessThan(400);
  });

  test("GET /mlro-advisor redirects to /login", async ({ page }) => {
    const response = await page.goto("/mlro-advisor");
    await expect(page).toHaveURL(/\/login/);
    expect(response?.status()).toBeLessThan(400);
  });

  test("GET /cases redirects to /login", async ({ page }) => {
    const response = await page.goto("/cases");
    await expect(page).toHaveURL(/\/login/);
    expect(response?.status()).toBeLessThan(400);
  });

  test("GET /analytics redirects to /login", async ({ page }) => {
    const response = await page.goto("/analytics");
    await expect(page).toHaveURL(/\/login/);
    expect(response?.status()).toBeLessThan(400);
  });

  test("login page itself is publicly accessible", async ({ page }) => {
    const response = await page.goto("/login");
    // Should NOT redirect away from /login
    await expect(page).toHaveURL(/\/login/);
    expect(response?.status()).toBe(200);
  });
});
