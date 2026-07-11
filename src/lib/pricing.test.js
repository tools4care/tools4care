import { describe, it, expect } from "vitest";
import {
  r2,
  unitPriceFromProduct,
  computeUnitPriceFromRow,
  resolveLineDiscountPct,
  lineSubtotal,
  computeCartTotals,
} from "./pricing";

describe("r2", () => {
  it("rounds to 2 decimals", () => {
    expect(r2(10.1234)).toBe(10.12);
    expect(r2(null)).toBe(0);
  });
});

describe("unitPriceFromProduct", () => {
  it("returns the base price with no discount and no bulk", () => {
    expect(unitPriceFromProduct({ base: 10, pct: 0, bulkMin: null, bulkPrice: null }, 1)).toBe(10);
  });

  it("applies a catalog percentage discount", () => {
    expect(unitPriceFromProduct({ base: 10, pct: 20, bulkMin: null, bulkPrice: null }, 1)).toBe(8);
  });

  it("uses the bulk price once quantity reaches the bulk minimum", () => {
    expect(unitPriceFromProduct({ base: 10, pct: 0, bulkMin: 5, bulkPrice: 7 }, 5)).toBe(7);
    expect(unitPriceFromProduct({ base: 10, pct: 0, bulkMin: 5, bulkPrice: 7 }, 4)).toBe(10);
  });

  it("bulk price wins over a catalog percentage discount when both apply", () => {
    expect(unitPriceFromProduct({ base: 10, pct: 20, bulkMin: 5, bulkPrice: 7 }, 5)).toBe(7);
  });
});

describe("computeUnitPriceFromRow", () => {
  it("reads price/discount off a joined productos row", () => {
    const row = { productos: { precio: 15, descuento_pct: 10 } };
    expect(computeUnitPriceFromRow(row, 1)).toBe(13.5);
  });

  it("falls back to bulk_unit_price when there is no catalog price", () => {
    const row = { productos: { precio: 0, bulk_unit_price: 5, bulk_min_qty: 3 } };
    expect(computeUnitPriceFromRow(row, 3)).toBe(5);
  });

  it("returns 0 for a product with no usable price at all", () => {
    const row = { productos: { precio: 0 } };
    expect(computeUnitPriceFromRow(row, 1)).toBe(0);
  });
});

describe("resolveLineDiscountPct — priority 2: cálculo de descuento", () => {
  it("prefers a manual discount over everything else", () => {
    const pct = resolveLineDiscountPct({
      manualDescuento: 15, base: 100, qty: 10, bulkMin: 5, bulkPrice: 80, catalogPct: 5,
    });
    expect(pct).toBe(15);
  });

  it("falls back to the bulk-implied discount when no manual override and qty qualifies", () => {
    const pct = resolveLineDiscountPct({
      manualDescuento: 0, base: 100, qty: 10, bulkMin: 5, bulkPrice: 80, catalogPct: 5,
    });
    expect(pct).toBeCloseTo(20, 9); // (1 - 80/100) * 100 — floating point, not exactly 20
  });

  it("falls back to the catalog discount when qty doesn't qualify for bulk", () => {
    const pct = resolveLineDiscountPct({
      manualDescuento: 0, base: 100, qty: 2, bulkMin: 5, bulkPrice: 80, catalogPct: 5,
    });
    expect(pct).toBe(5);
  });

  it("is 0 when nothing applies", () => {
    const pct = resolveLineDiscountPct({ manualDescuento: 0, base: 100, qty: 1, bulkMin: null, bulkPrice: null, catalogPct: 0 });
    expect(pct).toBe(0);
  });
});

describe("lineSubtotal", () => {
  it("computes subtotal with no discount", () => {
    expect(lineSubtotal({ base: 10, qty: 3, discountPct: 0 })).toBe(30);
  });

  it("computes subtotal with a discount applied", () => {
    expect(lineSubtotal({ base: 10, qty: 3, discountPct: 10 })).toBe(27); // 9 * 3
  });
});

describe("computeCartTotals — priority 1: cálculo de total de venta", () => {
  it("totals a single-item cart with tax disabled", () => {
    const res = computeCartTotals({
      cart: [{ cantidad: 2, precio_unitario: 25 }],
      taxEnabled: false, taxRate: 7, taxIncluded: false,
    });
    expect(res.saleTotal).toBe(50);
    expect(res.taxAmount).toBe(0);
    expect(res.saleTotalWithTax).toBe(50);
  });

  it("priority 6: totals a cart with several different products correctly", () => {
    const cart = [
      { cantidad: 2, precio_unitario: 10 },  // 20
      { cantidad: 1, precio_unitario: 35.5 }, // 35.5
      { cantidad: 3, precio_unitario: 4.99 }, // 14.97
    ];
    const res = computeCartTotals({ cart, taxEnabled: false, taxRate: 0, taxIncluded: false });
    expect(res.saleTotal).toBe(70.47);
  });

  it("adds tax on top when tax is not included in the listed price", () => {
    const res = computeCartTotals({
      cart: [{ cantidad: 1, precio_unitario: 100 }],
      taxEnabled: true, taxRate: 8, taxIncluded: false,
    });
    expect(res.saleTotal).toBe(100);
    expect(res.taxAmount).toBe(8);
    expect(res.saleTotalWithTax).toBe(108);
  });

  it("extracts tax from an already tax-included price instead of adding it", () => {
    const res = computeCartTotals({
      cart: [{ cantidad: 1, precio_unitario: 108 }],
      taxEnabled: true, taxRate: 8, taxIncluded: true,
    });
    expect(res.saleTotal).toBe(108);
    expect(res.taxAmount).toBe(8);
    // customer-visible total does not change — tax was already baked in
    expect(res.saleTotalWithTax).toBe(108);
  });

  it("an empty cart totals to zero", () => {
    const res = computeCartTotals({ cart: [], taxEnabled: true, taxRate: 8, taxIncluded: false });
    expect(res.saleTotal).toBe(0);
    expect(res.saleTotalWithTax).toBe(0);
  });
});
