import { describe, expect, it } from "vitest";
import { getMoneyAppliedToSale, getReturnLineUnit, getReturnQuote, readSalePaymentMetadata } from "./returnPricing";

describe("return pricing", () => {
  it("reads both current and legacy payment metadata", () => {
    expect(readSalePaymentMetadata({ pago: { tax_amount: 8.25 } }).tax_amount).toBe(8.25);
    expect(readSalePaymentMetadata({ pago_json: JSON.stringify({ tax_amount: 4 }) }).tax_amount).toBe(4);
  });

  it("uses the amount actually charged after discount", () => {
    expect(getReturnLineUnit({ cantidad: 2, precio_unitario: 10, descuento: 25, subtotal: 15 })).toBe(7.5);
    expect(getReturnLineUnit({ cantidad: 2, precio_unitario: 10, descuento: 25 })).toBe(7.5);
  });

  it("does not treat customer store credit as refundable money", () => {
    expect(getMoneyAppliedToSale({ total_pagado: 100, pago: { aplicado_venta: 60 } })).toBe(60);
    expect(getMoneyAppliedToSale({ total_pagado: 45 })).toBe(45);
  });

  it("adds proportional exclusive tax to a partial return", () => {
    const quote = getReturnQuote({
      total: 108.25,
      pago: { subtotal: 100, tax_amount: 8.25, tax_rate: 8.25, tax_included: false },
      detalle_ventas: [{ id: "line-1", cantidad: 4, subtotal: 100, precio_unitario: 25 }],
    }, { "line-1": 1 });

    expect(quote).toEqual({ merchandise: 25, tax: 2.06, total: 27.06, taxRate: 8.25, taxIncluded: false });
  });

  it("does not add tax twice when prices include tax", () => {
    const quote = getReturnQuote({
      total: 108.25,
      pago: { subtotal: 108.25, tax_amount: 8.25, tax_rate: 8.25, tax_included: true },
      detalle_ventas: [{ id: "line-1", cantidad: 1, subtotal: 108.25, precio_unitario: 108.25 }],
    }, { "line-1": 1 });

    expect(quote).toEqual({ merchandise: 108.25, tax: 8.25, total: 108.25, taxRate: 8.25, taxIncluded: true });
  });

  it("keeps tax-free returns tax-free", () => {
    const quote = getReturnQuote({
      total: 40,
      detalle_ventas: [{ id: "line-1", cantidad: 2, subtotal: 40, precio_unitario: 20 }],
    }, { "line-1": 1 });

    expect(quote.total).toBe(20);
    expect(quote.tax).toBe(0);
  });
});
