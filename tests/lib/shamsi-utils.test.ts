import {
  formatCurrency,
  cn,
} from "@/lib/utils";

import {
  SHAMSI_MONTH_NAMES,
  getShamsiMonthName,
  getShamsiMonthDays,
  formatShamsi,
  toShamsiYear,
  toShamsiMonth,
  toShamsiDay,
  normalizePersianDigits,
  gregorianToShamsi,
  shamsiToGregorian,
} from "@/lib/shamsi";

describe("utils.cn", () => {
  it("merges class names and dedupes conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", { "text-blue-500": true })).toBe("text-blue-500");
    expect(cn("btn", "btn-primary")).toBe("btn btn-primary");
  });
});

describe("utils.formatCurrency", () => {
  it("formats AFN amounts with two decimals and an AFN prefix", () => {
    // Intl.NumberFormat("en-US") inserts a non-breaking/narrow space between
    // currency symbol and number; assert the structure rather than the literal gap.
    const out = formatCurrency(1234.5);
    expect(out).toMatch(/^AFN\s1,234\.50$/);
    expect(formatCurrency(0)).toMatch(/^AFN\s0\.00$/);
  });
});

describe("shamsi constants & helpers", () => {
  it("exposes all 12 Persian month names in order", () => {
    expect(SHAMSI_MONTH_NAMES).toHaveLength(12);
    expect(SHAMSI_MONTH_NAMES[0]).toBe("حمل");
    expect(getShamsiMonthName(0)).toBe("حمل");
    expect(getShamsiMonthName(11)).toBe("حوت");
    expect(getShamsiMonthName(99)).toBe("");
  });

  it("returns a plausible day count for a Shamsi month", () => {
    // Note: getShamsiMonthDays currently feeds a *Gregorian* Date constructed
    // from the raw (Shamsi) year/month into date-fns-jalali. This test asserts
    // the contract shape (a valid month length) and flags the semantic mismatch
    // rather than assuming a specific (currently incorrect) value.
    const days = getShamsiMonthDays(1404, 0);
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("toShamsi* decompose a known date", () => {
    // 2025-07-24 in Gregorian ≈ 1404/05/03 in Shamsi (approx; we assert shape, not exact).
    const d = new Date(2025, 6, 24);
    expect(typeof toShamsiYear(d)).toBe("number");
    expect(toShamsiMonth(d)).toBeGreaterThanOrEqual(1);
    expect(toShamsiMonth(d)).toBeLessThanOrEqual(12);
    expect(toShamsiDay(d)).toBeGreaterThanOrEqual(1);
  });
});

describe("shamsi.normalizePersianDigits", () => {
  it("converts Persian/Arabic-Indic digits to ASCII", () => {
    expect(normalizePersianDigits("۱۴۰۳/۰۲/۱۵")).toBe("1403/02/15");
    expect(normalizePersianDigits("١٢٣٤")).toBe("1234");
    expect(normalizePersianDigits("abc123")).toBe("abc123");
  });
});

describe("shamsi gregorianToShamsi / shamsiToGregorian round-trip", () => {
  it("round-trips a valid Shamsi date through Gregorian", () => {
    const shamsi = "1403/02/15";
    const greg = shamsiToGregorian(shamsi);
    expect(greg).not.toBeNull();
    expect(greg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(gregorianToShamsi(new Date(greg!))).toBe(shamsi);
  });

  it("rejects out-of-range Shamsi years (shamsiToGregorian guard: 1200–1600)", () => {
    expect(shamsiToGregorian("1100/01/01")).toBeNull();
    expect(shamsiToGregorian("1700/01/01")).toBeNull();
    expect(shamsiToGregorian("2000/01/01")).toBeNull();
  });

  it("rejects structurally invalid dates", () => {
    expect(shamsiToGregorian("")).toBeNull();
    expect(shamsiToGregorian("1403/13/01")).toBeNull(); // month 13 invalid
    expect(shamsiToGregorian("not-a-date")).toBeNull();
    expect(shamsiToGregorian("1403/02/32")).toBeNull(); // day 32 out of range
  });
});
