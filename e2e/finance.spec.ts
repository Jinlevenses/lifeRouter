import { expect, test } from "./fixtures";

test.describe("E2E-FIN-001 자산 (FR-005)", () => {
  test("records balances as decimal strings and subtracts liabilities", async ({ authed: page }) => {
    await page.goto("/assets");
    await page.getByRole("button", { name: "계좌" }).click();
    await page.getByLabel("이름").fill("생활비 통장");
    await page.getByRole("button", { name: "저장" }).click();
    await page.getByRole("button", { name: "잔액", exact: true }).first().click();
    await page.getByLabel("금액 (KRW)").fill("1,234,567");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("1,234,567원").first()).toBeVisible();

    await page.getByRole("button", { name: "계좌" }).click();
    await page.getByRole("radio", { name: "부채" }).click();
    await page.getByLabel("이름").fill("카드 대금");
    await page.getByRole("button", { name: "저장" }).click();
    await page.getByRole("button", { name: "잔액", exact: true }).nth(1).click();
    await page.getByLabel("금액 (KRW)").fill("234567");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("1,000,000원", { exact: true })).toBeVisible();
  });
});
