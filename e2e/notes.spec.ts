import { expect, test } from "./fixtures";

test.describe("E2E-NOTE-001 노트 (FR-006)", () => {
  test("autosaves with versions and keeps revisions", async ({ authed: page }) => {
    await page.goto("/notes");
    await page.getByRole("button", { name: "새 노트" }).click();
    await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);
    await page.getByRole("textbox", { name: "제목" }).fill("여행 준비");
    const body = page.getByRole("textbox", { name: "노트 본문" });
    await body.click();
    await page.keyboard.type("여권 확인하기");
    await expect(page.getByRole("status")).toHaveText("저장됨", { timeout: 10_000 });
    await page.reload();
    await expect(page.getByRole("textbox", { name: "제목" })).toHaveValue("여행 준비");
    await expect(body).toContainText("여권 확인하기");
    await page.getByRole("button", { name: /이전 버전/ }).click();
    await expect(page.getByText(/^v1/)).toBeVisible();
  });
});
