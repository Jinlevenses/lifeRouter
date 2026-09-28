import { expect, test } from "./fixtures";

const PAGES = [
  "/",
  "/plans",
  "/plans?tab=routines",
  "/plans?tab=calendar",
  "/assets",
  "/notes",
  "/inbox",
  "/reviews",
  "/collections",
  "/settings",
];

test.describe("E2E-WEB-001 / A11Y-001 (automated part) layout", () => {
  test("no horizontal overflow, labelled navigation, visible focus", async ({ authed: page }, info) => {
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
      await expect(page.getByRole("navigation", { name: "주 메뉴" }).first()).toBeAttached();
      await expect(page.locator("h1").first()).toBeVisible();
    }
    if (info.project.name === "desktop") {
      const sidebar = page.locator("aside").first();
      expect((await sidebar.boundingBox())?.width).toBe(232);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe("rgb(247, 248, 250)");
    } else {
      await expect(page.getByRole("button", { name: "빠른 캡처" })).toBeVisible();
    }
    await page.goto("/");
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).not.toBe("none");
  });
});
