import { contractRateToTier } from "@/services/contract-rate.service";

describe("contractRateToTier", () => {
  it("projects HOURLY amounts into the hourly slot", () => {
    const tier = contractRateToTier({ rateType: "HOURLY", amount: 120 });
    expect(tier.hourlyRate).toBe(120);
    expect(tier.dailyRate).toBe(0);
    expect(tier.monthlyRate).toBe(0);
  });

  it("projects DAILY amounts into the daily slot", () => {
    const tier = contractRateToTier({ rateType: "DAILY", amount: 900 });
    expect(tier.hourlyRate).toBe(0);
    expect(tier.dailyRate).toBe(900);
  });

  it("projects MONTHLY amounts into the monthly slot", () => {
    const tier = contractRateToTier({ rateType: "MONTHLY", amount: 25000 });
    expect(tier.monthlyRate).toBe(25000);
  });

  it("UNIT rates resolve to no time-based hourly rate", () => {
    const tier = contractRateToTier({ rateType: "UNIT", amount: 50 });
    expect(tier.hourlyRate).toBe(0);
    expect(tier.dailyRate).toBe(0);
    expect(tier.monthlyRate).toBe(0);
  });

  it("inherits the contract's work hours and days for derivation", () => {
    const tier = contractRateToTier({
      rateType: "DAILY",
      amount: 800,
      contract: { workHoursPerDay: 10, contractDaysPerMonth: 30 },
    });
    expect(tier.workHoursPerDay).toBe(10);
    expect(tier.contractDaysPerMonth).toBe(30);
  });
});
