import { expect, test } from "./fixtures";

test.describe("E2E-TODAY-001 오늘 (FR-001)", () => {
  test("redirects signed-out visitors and has no public sign-up", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/plans");
    await expect(page).toHaveURL(/\/login\?next=%2Fplans/);
    const signup = await page.request.post("/api/auth/sign-up/email", {
      data: { email: "x@example.com", password: "long enough password", name: "x" },
      headers: { origin: "http://localhost:3100" },
    });
    expect(signup.ok()).toBe(false);
    await context.close();
  });

  test("adds a Top 3 task, completes it and records a routine", async ({ authed: page }) => {
    await page.getByLabel("새 할 일을 오늘의 3가지로 추가").fill("세금 서류 챙기기");
    await page.getByRole("button", { name: "추가", exact: true }).click();
    await expect(page.getByRole("button", { name: "세금 서류 챙기기", exact: true })).toBeVisible();
    await expect(page.getByText("1/3 · 완료 0")).toBeVisible();
    await page.getByLabel("세금 서류 챙기기 완료", { exact: true }).check();
    await expect(page.getByText("0/3 · 완료 1")).toBeVisible();

    await page.goto("/plans?tab=routines");
    await page.getByRole("button", { name: "새 루틴" }).click();
    await page.getByRole("textbox", { name: "루틴" }).fill("스트레칭");
    await page.getByRole("button", { name: "저장" }).click();
    await page.goto("/");
    await page.getByRole("button", { name: "완료", exact: true }).click();
    await expect(page.getByText("오늘 1/1 완료")).toBeVisible();
  });
});
