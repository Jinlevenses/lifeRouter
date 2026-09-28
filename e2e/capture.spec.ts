import { expect, test } from "./fixtures";

test.describe("E2E-CAPTURE-001 iPhone 캡처 → Inbox → 할 일 (FR-007)", () => {
  test("a capture token posts into Inbox and the item converts once", async ({ authed: page }) => {
    await page.goto("/settings");
    await page.getByLabel("이름", { exact: true }).fill("테스트 iPhone");
    await page.getByRole("button", { name: "발급" }).click();
    const secret = (await page
      .locator("code")
      .filter({ hasText: /^lrc_[\w-]{40,}$/ })
      .textContent())!.trim();
    expect(secret).toMatch(/^lrc_/);
    await page.keyboard.press("Escape");

    const bad = await page.request.post("/api/v1/capture", {
      data: { kind: "text", text: "x" },
      headers: { authorization: "Bearer lrc_invalidinvalidinvalid" },
    });
    expect(bad.status()).toBe(401);
    const res = await page.request.post("/api/v1/capture", {
      data: { kind: "text", text: "단축어로 보낸 메모" },
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(res.status()).toBe(201);

    await page.goto("/inbox");
    await expect(page.getByText("단축어로 보낸 메모")).toBeVisible();
    await expect(page.getByText("단축어").first()).toBeVisible();
    await page.getByRole("button", { name: "할 일" }).first().click();
    await expect(page.getByText("단축어로 보낸 메모")).toHaveCount(0);
    await page.goto("/plans?tab=tasks");
    await expect(page.getByRole("button", { name: "단축어로 보낸 메모", exact: true })).toBeVisible();
  });

  test("cookie-authenticated writes from another origin are refused (CSRF)", async ({ authed: page }) => {
    const res = await page.request.post("/api/v1/commands", {
      data: { type: "inbox.create", payload: { kind: "text", text: "csrf" } },
      headers: { origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);
  });
});
