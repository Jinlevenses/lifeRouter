import { test as base, expect, type Page } from "@playwright/test";

/** Pages start signed in (storage state from global setup) on the Today screen. */
export const test = base.extend<{ authed: Page }>({
  authed: async ({ page }, use) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await use(page);
  },
});
export { expect };
