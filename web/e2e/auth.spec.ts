import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders with username and password fields", async ({ page }) => {
    await expect(page).toHaveTitle(/Hawkeye|Login|Sterling/i);

    const usernameInput = page.locator('input[type="text"], input[autocomplete="username"]');
    const passwordInput = page.locator('input[type="password"]');

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test("submitting with empty credentials shows browser validation", async ({ page }) => {
    // The form has `required` on both fields — browser prevents submit
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")');
    await expect(submitButton).toBeVisible();

    // Clicking submit with empty fields should NOT navigate away (required validation fires)
    await submitButton.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("invalid credentials shows error message", async ({ page }) => {
    const usernameInput = page.locator('input[type="text"], input[autocomplete="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await usernameInput.fill("invalid_user_xyz");
    await passwordInput.fill("not-a-real-password");

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for the error message to appear after the async fetch
    const errorMessage = page.locator("text=/Invalid username or password/i");
    await expect(errorMessage).toBeVisible({ timeout: 10_000 });
  });

  test("unauthenticated navigation to protected route redirects to login", async ({ page }) => {
    // Clear any cookies first
    await page.context().clearCookies();

    await page.goto("/screening");
    // Middleware redirects to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
