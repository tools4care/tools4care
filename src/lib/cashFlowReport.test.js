import { describe, expect, it } from "vitest";
import { aggregateLedgerByWeek, ledgerPeriodPreset, startOfWeek } from "./cashFlowReport";

describe("cash flow report", () => {
  it("uses Monday as the beginning of a reporting week", () => {
    expect(startOfWeek("2026-08-24")).toBe("2026-08-24");
    expect(startOfWeek("2026-08-30")).toBe("2026-08-24");
  });

  it("combines daily ledger totals without changing their signs", () => {
    expect(aggregateLedgerByWeek([
      { business_date: "2026-08-24", money_in: 100, refunds: 10, expenses: 20, net_cash_movement: 70, net_ar_change: 15, cash_entries: 2 },
      { business_date: "2026-08-25", money_in: 50.25, refunds: 0, expenses: 5.1, net_cash_movement: 45.15, net_ar_change: -10, cash_entries: 1 },
    ])).toEqual([{
      week_start: "2026-08-24", money_in: 150.25, refunds: 10, expenses: 25.1,
      net_cash_movement: 115.15, net_ar_change: 5, cash_entries: 3,
    }]);
  });

  it("builds common weekly and rolling period presets", () => {
    expect(ledgerPeriodPreset("this_week", "2026-08-24")).toEqual({ from: "2026-08-24", to: "2026-08-24" });
    expect(ledgerPeriodPreset("last_week", "2026-08-24")).toEqual({ from: "2026-08-17", to: "2026-08-23" });
    expect(ledgerPeriodPreset("30_days", "2026-08-24")).toEqual({ from: "2026-07-26", to: "2026-08-24" });
  });
});
