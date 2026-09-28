import { describe, expect, it } from "vitest";
import { safeNextPath } from "../src/lib/safe-next";

describe("SEC-LOGIN-001 post-login redirect stays on this origin", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeNextPath("/plans?tab=tasks#top")).toBe("/plans?tab=tasks#top");
    expect(safeNextPath("/notes/0190a0b2-0000-7000-8000-000000000001")).toBe(
      "/notes/0190a0b2-0000-7000-8000-000000000001",
    );
  });

  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "plans",
    "",
  ])("rejects %j", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("rejects non-string values such as a repeated ?next=", () => {
    expect(safeNextPath(["/a", "/b"])).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});
