import { describe, expect, it } from "vitest";
import {
  buildStoreCloseoutThermalHtml,
  closeoutHasVariance,
  closeoutPaymentRows,
} from "./storeCloseoutReport";

const report = {
  report_number: "STORE-20260716-ABC-V1",
  location_name: "Physical Store",
  register_name: "Front Register",
  cashier_name: "Cashier One",
  closed_by_name: "Supervisor",
  close_version: 1,
  print_count: 0,
  opened_at: "2026-07-16T12:00:00Z",
  closed_at: "2026-07-16T20:00:00Z",
  system_summary: {
    expected_cash: 150,
    gross_sales: 700,
    refund_total: 20,
    net_sales: 680,
    discounts: 5,
    tax_net: 40,
    completed_sales_count: 10,
    return_count: 1,
    opening_float: 50,
    manual_deposits: 0,
    withdrawals: 0,
    expenses: 0,
    system_payments: { cash: 100, card: 500, transfer: 60, other: 20 },
    payment_breakdown: {
      cash: { gross: 110, refunds: 10, ar: 0, net: 100 },
      card: { gross: 510, refunds: 10, ar: 0, net: 500 },
      transfer: { gross: 60, refunds: 0, ar: 0, net: 60 },
      other: { gross: 20, refunds: 0, ar: 0, net: 20 },
    },
  },
  declared_totals: { cash: 149, card: 500, transfer: 60, other: 20 },
  variances: { cash: -1, card: 0, transfer: 0, other: 0 },
  card_batch_reference: "BATCH-44",
  notes: "Cash drawer is one dollar short.",
};

describe("store shift closeout report", () => {
  it("builds reconciliation rows from system and declared totals", () => {
    expect(closeoutPaymentRows(report)).toEqual([
      { key: "cash", label: "Cash", system: 150, declared: 149, variance: -1 },
      { key: "card", label: "Card", system: 500, declared: 500, variance: 0 },
      { key: "transfer", label: "Transfer", system: 60, declared: 60, variance: 0 },
      { key: "other", label: "Check / Other", system: 20, declared: 20, variance: 0 },
    ]);
  });

  it("detects a variance in any payment source", () => {
    expect(closeoutHasVariance(report.variances)).toBe(true);
    expect(closeoutHasVariance({ cash: 0, card: 0, transfer: 0, other: 0 })).toBe(false);
  });

  it("creates an 80mm report with audit and reconciliation details", () => {
    const html = buildStoreCloseoutThermalHtml(report);
    expect(html).toContain("SHIFT CLOSEOUT");
    expect(html).toContain("STORE-20260716-ABC-V1");
    expect(html).toContain("BATCH-44");
    expect(html).toContain("Cash drawer is one dollar short.");
    expect(html).toContain("@page{size:80mm auto");
  });

  it("labels subsequent copies as reprints", () => {
    expect(buildStoreCloseoutThermalHtml({ ...report, print_count: 1 })).toContain("REPRINT");
  });
});
