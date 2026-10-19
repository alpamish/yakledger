import { describe, it, expect } from "vitest";
import { formatMajor, formatMinor, toMinor, fromMinor } from "@/lib/money";

describe("money helpers", () => {
  it("formats minor-unit amounts by dividing by 100", () => {
    expect(formatMinor(5000000, "AFN")).toBe("AFN\u00a050,000.00");
    expect(formatMinor(0, "AFN")).toBe("AFN\u00a00.00");
  });

  it("formats major-unit amounts as-is (no division)", () => {
    // A wallet with 50,000 major units must not render as 500.
    expect(formatMajor(50000, "AFN")).toBe("AFN\u00a050,000.00");
    expect(formatMajor(222587.232, "AFN")).toBe("AFN\u00a0222,587.23");
    expect(formatMajor(0, "AFN")).toBe("AFN\u00a00.00");
  });

  it("treats null/undefined as zero and falls back for unknown currencies", () => {
    expect(formatMajor(null, "AFN")).toBe("AFN\u00a00.00");
    expect(formatMajor(undefined, "AFN")).toBe("AFN\u00a00.00");
    // Malformed currency codes throw in Intl; the helper falls back to a plain string.
    expect(formatMajor(1234.5, "ABCD")).toBe("1234.50 ABCD");
  });

  it("round-trips major and minor units", () => {
    expect(toMinor(25000)).toBe(2500000);
    expect(fromMinor(2500000)).toBe(25000);
  });
});
