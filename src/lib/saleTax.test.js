import { describe, expect, it } from "vitest";
import { getSaleTaxParts } from "./saleTax";

describe("getSaleTaxParts", () => {
  it("uses the tax actually recorded with the sale", () => {
    expect(getSaleTaxParts({
      total: 108.25,
      pago_json: { subtotal: 100, tax_amount: 8.25 },
    })).toEqual({ subtotal: 100, tax: 8.25, grand: 108.25 });
  });

  it("reads the payment JSON stored in the ventas.pago column", () => {
    expect(getSaleTaxParts({
      total: 108.25,
      pago: { subtotal: 100, tax_amount: 8.25 },
    })).toEqual({ subtotal: 100, tax: 8.25, grand: 108.25 });
  });

  it("does not apply today's tax settings to old tax-free sales", () => {
    expect(getSaleTaxParts({ total: 100 }, { enabled: true, rate: 8.25, includeInPrice: false }))
      .toEqual({ subtotal: 100, tax: 0, grand: 100 });
  });

  it("can estimate legacy tax-inclusive sales", () => {
    const result = getSaleTaxParts({ total: 108.25 }, { enabled: true, rate: 8.25, includeInPrice: true });
    expect(result.subtotal).toBeCloseTo(100, 2);
    expect(result.tax).toBeCloseTo(8.25, 2);
    expect(result.grand).toBe(108.25);
  });
});
