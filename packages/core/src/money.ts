import Decimal from "decimal.js";

/**
 * Exact money arithmetic (ADR-002). Amounts travel as decimal strings and are only
 * converted to Decimal inside this module; a JS number never represents money.
 */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 });
export type Dec = InstanceType<typeof D>;

/** Plain decimal string: optional minus, no exponent, no leading "+", no thousands separators. */
export const DECIMAL_RE = /^-?(0|[1-9]\d*)(\.\d+)?$/;
/** Money has at most 4 fractional digits (KRW uses 0, USD 2; 4 leaves room for stored FX-converted values). */
export const MONEY_RE = /^-?(0|[1-9]\d{0,17})(\.\d{1,4})?$/;

export function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL_RE.test(value) && value !== "-0";
}

export function isMoney(value: unknown): value is string {
  return typeof value === "string" && MONEY_RE.test(value) && value !== "-0";
}

export function dec(value: string | Dec): Dec {
  if (typeof value !== "string") return value;
  if (!isDecimalString(value)) throw new MoneyFormatError(value);
  return new D(value);
}

export class MoneyFormatError extends Error {
  constructor(value: string) {
    super(`Invalid decimal string: ${JSON.stringify(value)}`);
    this.name = "MoneyFormatError";
  }
}

/** Serialises a Decimal to the canonical string form (no exponent, no trailing zeros, "0" not "-0"). */
export function toDecimalString(value: Dec): string {
  if (value.isZero()) return "0";
  return value.toFixed();
}

export function add(...values: string[]): string {
  return toDecimalString(values.reduce<Dec>((acc, v) => acc.plus(dec(v)), new D(0)));
}

export function sub(a: string, b: string): string {
  return toDecimalString(dec(a).minus(dec(b)));
}

export function mul(a: string, b: string): string {
  return toDecimalString(dec(a).times(dec(b)));
}

export function sum(values: readonly string[]): string {
  return add(...values);
}

export function cmp(a: string, b: string): -1 | 0 | 1 {
  return dec(a).comparedTo(dec(b)) as -1 | 0 | 1;
}

export function isNegative(a: string): boolean {
  return dec(a).isNegative() && !dec(a).isZero();
}

export function isPositive(a: string): boolean {
  return dec(a).greaterThan(0);
}

export function abs(a: string): string {
  return toDecimalString(dec(a).abs());
}

export function neg(a: string): string {
  return toDecimalString(dec(a).negated());
}

export type RoundingMode = "halfUp" | "up" | "down" | "halfEven";

const ROUNDING: Record<RoundingMode, Decimal.Rounding> = {
  halfUp: Decimal.ROUND_HALF_UP,
  up: Decimal.ROUND_UP,
  down: Decimal.ROUND_DOWN,
  halfEven: Decimal.ROUND_HALF_EVEN,
};

export function round(a: string, fractionDigits: number, mode: RoundingMode = "halfUp"): string {
  return toDecimalString(dec(a).toDecimalPlaces(fractionDigits, ROUNDING[mode]));
}

/** Divides and rounds to `fractionDigits`. Division by zero is a programming error. */
export function div(a: string, b: string, fractionDigits: number, mode: RoundingMode = "halfUp"): string {
  const divisor = dec(b);
  if (divisor.isZero()) throw new RangeError("Division by zero");
  return toDecimalString(dec(a).dividedBy(divisor).toDecimalPlaces(fractionDigits, ROUNDING[mode]));
}

/** Converts a foreign amount into KRW with the snapshot's fxRate, rounded to whole won (half-up). */
export function toKrw(amount: string, fxRate: string): string {
  return round(mul(amount, fxRate), 0, "halfUp");
}

/**
 * Normalises user input ("1,234,000", " 12000 ", "-3.50") into a canonical decimal string.
 * Returns null when the input is not a valid amount. Never uses parseFloat.
 */
export function parseMoneyInput(input: string, maxFractionDigits = 4): string | null {
  const cleaned = input.replace(/[\s,_]/g, "").replace(/원$|₩/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!m) return null;
  const [, sign, intPart = "0", frac = ""] = m;
  if (frac.length > maxFractionDigits) return null;
  const canonical = toDecimalString(new D(`${sign}${intPart}${frac ? `.${frac}` : ""}`));
  return isMoney(canonical) ? canonical : null;
}

/** Korean display format: "12,345,000" (+ currency suffix handled by the caller). */
export function formatAmount(value: string, fractionDigits?: number): string {
  const d = dec(value);
  const fixed = fractionDigits === undefined ? d.toFixed() : d.toFixed(fractionDigits, Decimal.ROUND_HALF_UP);
  const negative = fixed.startsWith("-");
  const [intPart = "0", frac] = (negative ? fixed.slice(1) : fixed).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

export function formatKrw(value: string): string {
  return `${formatAmount(round(value, 0))}원`;
}

/** Compact Korean unit display for large sums: 123,450,000 → "1억 2,345만원". */
export function formatKrwCompact(value: string): string {
  const rounded = dec(round(value, 0));
  const negative = rounded.isNegative();
  const absValue = rounded.abs();
  const eok = absValue.dividedToIntegerBy(100_000_000);
  const man = absValue.minus(eok.times(100_000_000)).dividedToIntegerBy(10_000);
  const rest = absValue.minus(eok.times(100_000_000)).minus(man.times(10_000));
  const parts: string[] = [];
  if (!eok.isZero()) parts.push(`${formatAmount(eok.toFixed())}억`);
  if (!man.isZero()) parts.push(`${formatAmount(man.toFixed())}만`);
  if (parts.length === 0) parts.push(formatAmount(rest.toFixed()));
  return `${negative ? "-" : ""}${parts.join(" ")}원`;
}
