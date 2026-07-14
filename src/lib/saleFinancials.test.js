import { describe, it, expect } from "vitest";
import {
  r2,
  calcularPagoMinimo,
  policyLimit,
  getClientBalance,
  computeSaleFinancials,
} from "./saleFinancials";

const baseArgs = {
  saleTotalWithTax: 100,
  paid: 0,
  cxcBalance: 0,
  selectedClient: null,
  cxcLimit: null,
  cxcAvailable: null,
  clientHistoryHas: false,
  clientStoreCredit: 0,
  isOffline: false,
};

describe("r2", () => {
  it("rounds to 2 decimals", () => {
    // Known floating-point quirk: 1.005 * 100 = 100.49999999999999, so this rounds down to 1.
    expect(r2(1.005)).toBe(1);
    expect(r2(10.1234)).toBe(10.12);
    expect(r2(null)).toBe(0);
    expect(r2(undefined)).toBe(0);
  });
});

describe("calcularPagoMinimo", () => {
  it("returns 0 when balance is below the skip threshold", () => {
    expect(calcularPagoMinimo(0)).toBe(0);
    expect(calcularPagoMinimo(9.99)).toBe(0);
  });

  it("returns the fixed minimum when 20% is below it", () => {
    // 20% of 50 = 10, fixed minimum is 30 -> max(10, 30) = 30
    expect(calcularPagoMinimo(50)).toBe(30);
  });

  it("returns 20% of balance when that exceeds the fixed minimum", () => {
    // 20% of 500 = 100 > 30
    expect(calcularPagoMinimo(500)).toBe(100);
  });

  it("never exceeds the balance itself", () => {
    // 20% of 20 = 4, fixed min 30 -> would be 30, but balance is only 20
    expect(calcularPagoMinimo(20)).toBe(20);
  });
});

describe("policyLimit", () => {
  it("maps credit score ranges to credit limits", () => {
    expect(policyLimit(450)).toBe(0);
    expect(policyLimit(520)).toBe(30);
    expect(policyLimit(580)).toBe(80);
    expect(policyLimit(620)).toBe(150);
    expect(policyLimit(680)).toBe(200);
    expect(policyLimit(720)).toBe(350);
    expect(policyLimit(780)).toBe(500);
    expect(policyLimit(850)).toBe(800);
  });

  it("defaults to score 600 when not provided", () => {
    expect(policyLimit(undefined)).toBe(150);
  });
});

describe("getClientBalance", () => {
  it("returns 0 for missing client", () => {
    expect(getClientBalance(null)).toBe(0);
  });

  it("prefers _saldo_real over other balance fields", () => {
    expect(getClientBalance({ _saldo_real: 12.5, balance: 99, saldo_total: 99, saldo: 99 })).toBe(12.5);
  });

  it("falls back through balance fields in order", () => {
    expect(getClientBalance({ balance: 12.5 })).toBe(12.5);
    expect(getClientBalance({ saldo_total: 12.5 })).toBe(12.5);
    expect(getClientBalance({ saldo: 12.5 })).toBe(12.5);
  });
});

describe("computeSaleFinancials — cash sale, no debt", () => {
  it("a fully paid cash sale leaves no balance and no change", () => {
    const res = computeSaleFinancials({ ...baseArgs, paid: 100 });
    expect(res.totalAPagar).toBe(100);
    expect(res.paidApplied).toBe(100);
    expect(res.change).toBe(0);
    expect(res.balanceAfter).toBe(0);
    expect(res.amountToCredit).toBe(0);
    expect(res.mostrarAdvertencia).toBe(false);
  });

  it("overpaying produces change and no balance left", () => {
    const res = computeSaleFinancials({ ...baseArgs, paid: 120 });
    expect(res.change).toBe(20);
    expect(res.mostrarAdvertencia).toBe(true);
    expect(res.balanceAfter).toBe(0);
  });

  it("underpaying creates a new CxC balance equal to the shortfall", () => {
    const res = computeSaleFinancials({ ...baseArgs, paid: 40 });
    expect(res.paidApplied).toBe(40);
    expect(res.balanceAfter).toBe(60);
    expect(res.amountToCredit).toBe(60);
    expect(res.change).toBe(0);
  });

  it("a $0 payment on a sale with no debt creates a balance equal to the sale total", () => {
    const res = computeSaleFinancials({ ...baseArgs, paid: 0 });
    expect(res.balanceAfter).toBe(100);
    expect(res.amountToCredit).toBe(100);
  });
});

describe("computeSaleFinancials — FIFO with existing CxC debt", () => {
  const withDebt = { ...baseArgs, cxcBalance: 50, paid: 0 };

  it("old debt is reported separately from the new sale", () => {
    const res = computeSaleFinancials(withDebt);
    expect(res.oldDebt).toBe(50);
    expect(res.grossTotalDue).toBe(150);
    expect(res.totalAPagar).toBe(150);
  });

  it("a zero payment keeps prior A/R and sends only the new sale to A/R", () => {
    const res = computeSaleFinancials(withDebt);
    expect(res.balanceAfter).toBe(150);
    expect(res.amountToCredit).toBe(100);
  });

  it("a payment smaller than the old debt is applied entirely to the old debt first", () => {
    const res = computeSaleFinancials({ ...withDebt, paid: 30 });
    expect(res.paidToOldDebt).toBe(30);
    expect(res.paidForSale).toBe(0);
    expect(res.paidApplied).toBe(30);
    // balance after = 50 (old) + 100 (new) - 30 paid = 120
    expect(res.balanceAfter).toBe(120);
  });

  it("a payment covering the old debt plus part of the sale splits correctly", () => {
    const res = computeSaleFinancials({ ...withDebt, paid: 80 });
    expect(res.paidToOldDebt).toBe(50);
    expect(res.paidForSale).toBe(30);
    expect(res.paidApplied).toBe(80);
    expect(res.balanceAfter).toBe(70); // 150 - 80
  });

  it("a payment that fully covers debt + sale leaves balance 0 and no change", () => {
    const res = computeSaleFinancials({ ...withDebt, paid: 150 });
    expect(res.balanceAfter).toBe(0);
    expect(res.change).toBe(0);
    expect(res.amountToCredit).toBe(0);
  });

  it("overpaying beyond debt + sale produces change", () => {
    const res = computeSaleFinancials({ ...withDebt, paid: 200 });
    expect(res.paidApplied).toBe(150);
    expect(res.change).toBe(50);
    expect(res.balanceAfter).toBe(0);
  });
});

describe("computeSaleFinancials — pago mínimo (minimum payment on old debt)", () => {
  it("no minimum required when there is no old debt", () => {
    const res = computeSaleFinancials({ ...baseArgs, cxcBalance: 0, paid: 0 });
    expect(res.pagoMinimo).toBe(0);
    expect(res.cubrioMinimo).toBe(true);
    expect(res.faltaParaMinimo).toBe(0);
  });

  it("flags an unmet minimum payment on old debt", () => {
    // oldDebt = 500 -> pagoMinimo = max(500*0.2, 30) = 100
    const res = computeSaleFinancials({ ...baseArgs, cxcBalance: 500, paid: 50 });
    expect(res.pagoMinimo).toBe(100);
    expect(res.cubrioMinimo).toBe(false);
    expect(res.faltaParaMinimo).toBe(50);
  });

  it("meeting the minimum payment clears the warning", () => {
    const res = computeSaleFinancials({ ...baseArgs, cxcBalance: 500, paid: 100 });
    expect(res.cubrioMinimo).toBe(true);
    expect(res.faltaParaMinimo).toBe(0);
  });

  it("store credit applied toward old debt counts toward the minimum", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      cxcBalance: 500,
      paid: 50,
      selectedClient: { id: "c1" },
      clientStoreCredit: 50,
    });
    // creditAppliedToDebt = min(50, 500) = 50; paid(50) + 50 = 100 = pagoMinimo
    expect(res.cubrioMinimo).toBe(true);
    expect(res.faltaParaMinimo).toBe(0);
  });
});

describe("computeSaleFinancials — store credit application", () => {
  const client = { id: "c1" };

  it("store credit reduces the total due before payments are applied", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      selectedClient: client,
      clientStoreCredit: 30,
      paid: 70,
    });
    expect(res.storeCreditApplied).toBe(30);
    expect(res.totalAPagar).toBe(70);
    expect(res.paidApplied).toBe(100); // 70 cash + 30 store credit
    expect(res.balanceAfter).toBe(0);
  });

  it("store credit is capped at the gross total due", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      selectedClient: client,
      clientStoreCredit: 1000,
      paid: 0,
    });
    expect(res.storeCreditApplied).toBe(100); // capped to grossTotalDue
    expect(res.totalAPagar).toBe(0);
    expect(res.balanceAfter).toBe(0);
  });

  it("store credit is ignored when offline (no client sync)", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      selectedClient: client,
      clientStoreCredit: 30,
      isOffline: true,
      paid: 70,
    });
    expect(res.storeCreditApplied).toBe(0);
    expect(res.totalAPagar).toBe(100);
    expect(res.balanceAfter).toBe(30);
  });

  it("store credit is ignored for guest sales without a client id", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      selectedClient: { id: null },
      clientStoreCredit: 30,
      paid: 70,
    });
    expect(res.storeCreditApplied).toBe(0);
  });
});

describe("computeSaleFinancials — credit limit / availability", () => {
  it("hides the credit panel for clients with no history and no balance", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      selectedClient: { id: "c1", score_credito: 700 },
      clientHistoryHas: false,
      cxcBalance: 0,
    });
    expect(res.showCreditPanel).toBe(false);
    expect(res.creditLimit).toBe(0);
    expect(res.creditAvailable).toBe(0);
  });

  it("shows the credit panel and computes available credit from policy limit when no cxc data", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      selectedClient: { id: "c1", score_credito: 700 }, // policyLimit(700) = 350
      clientHistoryHas: true,
      cxcBalance: 50,
      paid: 0,
    });
    expect(res.creditLimit).toBe(350);
    expect(res.creditAvailable).toBe(300); // 350 - 50
  });

  it("uses explicit cxcLimit/cxcAvailable when provided", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      selectedClient: { id: "c1", score_credito: 700 },
      clientHistoryHas: true,
      cxcBalance: 50,
      cxcLimit: 300,
      cxcAvailable: 250,
      paid: 0,
    });
    expect(res.creditLimit).toBe(300);
    expect(res.creditAvailable).toBe(250);
  });

  it("reports excess credit when the new debt would exceed availability", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      selectedClient: { id: "c1", score_credito: 700 },
      clientHistoryHas: true,
      cxcBalance: 50,
      cxcAvailable: 30,
      paid: 0, // amountToCredit will be 100 (full sale)
    });
    expect(res.amountToCredit).toBe(100);
    expect(res.excesoCredito).toBe(70); // 100 - 30
  });

  it("reports no excess credit when availability covers the new debt", () => {
    const res = computeSaleFinancials({
      ...baseArgs,
      selectedClient: { id: "c1", score_credito: 700 },
      clientHistoryHas: true,
      cxcBalance: 50,
      cxcAvailable: 150,
      paid: 0,
    });
    expect(res.excesoCredito).toBe(0);
  });
});
