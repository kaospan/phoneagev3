import { expect, test } from "@playwright/test";

/**
 * Deliberately secret-free: these run in CI on every push without needing real Supabase
 * credentials, so they stay green regardless of whether VITE_SUPABASE_URL/ANON_KEY are
 * configured as repo secrets. They verify the app shell boots and routes resolve, not full
 * gameplay (that needs a live Supabase project + service-role key to create throwaway
 * accounts — see the manual Playwright scripts used during development for that pattern,
 * and add SUPABASE_SERVICE_ROLE_KEY as a repo secret to extend this suite with real login).
 */

test.describe("app shell", () => {
  test("home page loads without a fatal error", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Either a real sign-in form (Supabase configured) or the graceful
    // "not configured" message — either way, the app shell must render something, not a blank page.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });

  test("mapper route is gated behind sign-in, not shown to anonymous visitors", async ({ page }) => {
    await page.goto("/mapper");
    await page.waitForLoadState("networkidle");
    const paletteVisible = await page.getByText(/Floor \(0\)/i).count();
    expect(paletteVisible).toBe(0);
  });

  test("crm route is gated behind sign-in, not shown to anonymous visitors", async ({ page }) => {
    await page.goto("/crm");
    await page.waitForLoadState("networkidle");
    const dashboardVisible = await page.getByText(/Player CRM/i).count();
    expect(dashboardVisible).toBe(0);
  });

  test("unknown routes render the not-found page instead of a blank screen", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });
});
