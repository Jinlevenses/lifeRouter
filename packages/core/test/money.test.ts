import { describe, expect, it } from "vitest";
import {
  add,
  cmp,
  div,
  formatAmount,
  formatKrw,
  formatKrwCompact,
  isMoney,
  parseMoneyInput,
  round,
  sub,
  sum,
  toKrw,
} from "../src/money";

describe("money (ADR-002 exact decimal)", () => {
  it("adds without float error", () => {
    expect(add("0.1", "0.2")).toBe("0.3");
    expect(sum(["100000000", "-25000000.5", "0.5"])).toBe("75000000");
    expect(sub("1", "1")).toBe("0");
  });

  it("validates canonical money strings", () => {
    expect(isMoney("1234")).toBe(true);
    expect(isMoney("-12.5")).toBe(true);
    expect(isMoney("01")).toBe(false);
    expect(isMoney("1e5")).toBe(false);
    expect(isMoney("1,000")).toBe(false);
    expect(isMoney("-0")).toBe(false);
    expect(isMoney("1.12345")).toBe(false);
    expect(isMoney(1000)).toBe(false);
  });

  it("parses Korean-style user input", () => {
    expect(parseMoneyInput("1,234,000")).toBe("1234000");
    expect(parseMoneyInput(" 12000원 ")).toBe("12000");
    expect(parseMoneyInput("-3.50")).toBe("-3.5");
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("1.23456")).toBeNull();
    expect(parseMoneyInput("")).toBeNull();
  });

  it("rounds and divides with explicit modes", () => {
    expect(div("10", "3", 0, "up")).toBe("4");
    expect(div("10", "3", 0, "halfUp")).toBe("3");
    expect(round("2.5", 0, "halfEven")).toBe("2");
    expect(() => div("1", "0", 0)).toThrow(RangeError);
  });

  it("converts FX to whole won", () => {
    expect(toKrw("1000.25", "1385.12")).toBe("1385466");
  });

  it("compares", () => {
    expect(cmp("100000000", "99999999.9999")).toBe(1);
    expect(cmp("-1", "0")).toBe(-1);
  });

  it("formats for Korean display", () => {
    expect(formatAmount("1234567.5")).toBe("1,234,567.5");
    expect(formatKrw("-1234567")).toBe("-1,234,567원");
    expect(formatKrwCompact("123450000")).toBe("1억 2,345만원");
    expect(formatKrwCompact("5000")).toBe("5,000원");
  });
});
