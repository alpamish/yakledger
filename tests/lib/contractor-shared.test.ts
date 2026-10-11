import {
  resolveHourlyRate,
  resolveTimesheetHourlyRate,
  findRateTier,
  computeTimesheetRevenue,
} from "@/lib/contractor-rate";
import {
  calculateTotalHours,
  calculateHoursWithOvertime,
  calculateSegmentHours,
} from "@/lib/timesheet-hours";

describe("contractor-rate resolver", () => {
  it("prefers an explicit hourly rate", () => {
    const rate = resolveHourlyRate({
      machinery: { hourlyRate: 50, dailyRate: 450, monthlyRate: 12000, workHoursPerDay: 9 },
    });
    expect(rate).toBe(50);
  });

  it("derives hourly from daily using the machinery's configured workHoursPerDay (never a hard-coded 9)", () => {
    const rate = resolveHourlyRate({
      machinery: { hourlyRate: 0, dailyRate: 900, monthlyRate: 0, workHoursPerDay: 8 },
    });
    expect(rate).toBeCloseTo(112.5, 5);
  });

  it("derives hourly from monthly using configured days and hours", () => {
    const rate = resolveHourlyRate({
      machinery: {
        hourlyRate: 0,
        dailyRate: 0,
        monthlyRate: 20160,
        workHoursPerDay: 8,
        contractDaysPerMonth: 28,
      },
    });
    expect(rate).toBeCloseTo(90, 5); // 20160 / (28 * 8)
  });

  it("rate tier wins over machinery fields", () => {
    const rate = resolveHourlyRate({
      rateTier: { hourlyRate: 75, dailyRate: 700, monthlyRate: 0, workHoursPerDay: 9 },
      machinery: { hourlyRate: 50, dailyRate: 450, monthlyRate: 0, workHoursPerDay: 9 },
    });
    expect(rate).toBe(75);
  });

  it("falls back to machinery when the tier has no usable rates", () => {
    const rate = resolveHourlyRate({
      rateTier: { hourlyRate: 0, dailyRate: 0, monthlyRate: 0 },
      machinery: { hourlyRate: 40, dailyRate: 0, monthlyRate: 0, workHoursPerDay: 9 },
    });
    expect(rate).toBe(40);
  });

  it("tier daily rate uses the tier's own workHoursPerDay", () => {
    const rate = resolveHourlyRate({
      rateTier: { hourlyRate: 0, dailyRate: 800, monthlyRate: 0, workHoursPerDay: 10 },
      machinery: { hourlyRate: 0, dailyRate: 900, monthlyRate: 0, workHoursPerDay: 8 },
    });
    expect(rate).toBeCloseTo(80, 5); // 800 / 10, not 900 / 8
  });

  it("returns 0 when nothing is configured", () => {
    expect(resolveHourlyRate({})).toBe(0);
    expect(
      resolveHourlyRate({ machinery: { hourlyRate: 0, dailyRate: 0, monthlyRate: 0 } })
    ).toBe(0);
  });
});

describe("findRateTier / resolveTimesheetHourlyRate", () => {
  const rates = [
    { id: "r-default", machineryId: "m1", isDefault: true, hourlyRate: 50, dailyRate: 450, monthlyRate: 0, workHoursPerDay: 9 },
    { id: "r-night", machineryId: "m1", isDefault: false, hourlyRate: 80, dailyRate: 0, monthlyRate: 0, workHoursPerDay: 9 },
  ];
  const machinery = { id: "m1", hourlyRate: 30, dailyRate: 0, monthlyRate: 0, workHoursPerDay: 9 };

  it("linked tier wins", () => {
    const tier = findRateTier({ machineryId: "m1", machineryRateId: "r-night" }, rates);
    expect(tier?.id).toBe("r-night");
    expect(
      resolveTimesheetHourlyRate({ machineryId: "m1", machineryRateId: "r-night" }, rates, machinery)
    ).toBe(80);
  });

  it("falls back to the machinery's default tier", () => {
    expect(
      resolveTimesheetHourlyRate({ machineryId: "m1" }, rates, machinery)
    ).toBe(50);
  });

  it("falls back to the machinery's own rates when no tier matches", () => {
    expect(
      resolveTimesheetHourlyRate({ machineryId: "m2" }, rates, { ...machinery, id: "m2", hourlyRate: 35 })
    ).toBe(35);
  });

  it("returns 0 without machinery", () => {
    expect(resolveTimesheetHourlyRate({ machineryId: "m1" }, rates, null)).toBe(50); // default tier still found
    expect(resolveTimesheetHourlyRate({}, rates, null)).toBe(0);
  });
});

describe("computeTimesheetRevenue", () => {
  it("multiplies hours by rate and rounds to 2 decimals", () => {
    expect(computeTimesheetRevenue(7.5, 112.5)).toBe(843.75);
  });

  it("rounds to 2 decimals", () => {
    expect(computeTimesheetRevenue(1, 33.333)).toBe(33.33);
  });

  it("treats null hours as 0", () => {
    expect(computeTimesheetRevenue(null, 50)).toBe(0);
  });
});

describe("timesheet-hours", () => {
  it("computes morning + afternoon segments", () => {
    expect(calculateTotalHours("08:00", "12:00", "13:00", "17:00")).toBe(8);
    expect(calculateSegmentHours("08:00", "12:00")).toBe(4);
  });

  it("returns 0 when lunch boundaries are missing", () => {
    expect(calculateTotalHours("08:00", null, null, "17:00")).toBe(0);
  });

  it("derives overtime against the configured work hours", () => {
    const res = calculateHoursWithOvertime("08:00", "12:00", "13:00", "18:00", 8);
    expect(res.totalHours).toBe(9);
    expect(res.overtimeHours).toBe(1);
  });

  it("never reports negative overtime", () => {
    const res = calculateHoursWithOvertime("08:00", "12:00", "13:00", "16:00", 9);
    expect(res.totalHours).toBe(7);
    expect(res.overtimeHours).toBe(0);
  });
});
