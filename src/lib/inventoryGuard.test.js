import { describe, it, expect } from "vitest";
import { createFakeStockTable, strictSell, legacyDecrementStock, restoreStock } from "./inventoryGuard";

describe("strictSell — priority 3: validación de stock suficiente", () => {
  it("allows a sale when stock is sufficient", () => {
    const stock = createFakeStockTable({ van1: { prodA: 10 } });
    const res = strictSell(stock, "van1", [{ producto_id: "prodA", cantidad: 4 }]);
    expect(res.ok).toBe(true);
    expect(stock.get("van1", "prodA")).toBe(6);
  });

  it("rejects a sale that requests more than available stock", () => {
    const stock = createFakeStockTable({ van1: { prodA: 2 } });
    expect(() => strictSell(stock, "van1", [{ producto_id: "prodA", cantidad: 3 }])).toThrow(
      /Insufficient stock/
    );
    // stock must be untouched after a rejected sale
    expect(stock.get("van1", "prodA")).toBe(2);
  });

  it("rejects a zero or negative quantity", () => {
    const stock = createFakeStockTable({ van1: { prodA: 10 } });
    expect(() => strictSell(stock, "van1", [{ producto_id: "prodA", cantidad: 0 }])).toThrow(
      /Invalid quantity/
    );
  });
});

describe("strictSell — priority 4: evitar stock negativo", () => {
  it("never leaves stock negative even when requesting exactly all of it", () => {
    const stock = createFakeStockTable({ van1: { prodC: 1 } });
    strictSell(stock, "van1", [{ producto_id: "prodC", cantidad: 1 }]);
    expect(stock.get("van1", "prodC")).toBe(0);
  });

  it("simulates two vendors racing for the last unit: only one sale succeeds, stock never goes negative", () => {
    const stock = createFakeStockTable({ van1: { prodC: 1 } });
    const vendorA = () => strictSell(stock, "van1", [{ producto_id: "prodC", cantidad: 1 }]);
    const vendorB = () => strictSell(stock, "van1", [{ producto_id: "prodC", cantidad: 1 }]);

    // strictSell is synchronous, so this models the atomicity Postgres' FOR UPDATE lock
    // gives the real RPC: whichever call runs first wins, the second sees the updated state.
    expect(vendorA()).toEqual({ ok: true });
    expect(() => vendorB()).toThrow(/Insufficient stock/);
    expect(stock.get("van1", "prodC")).toBe(0);
  });

  it("known issue (see audit): the legacy decrement path does NOT prevent oversell — it silently clamps to 0", () => {
    const stock = createFakeStockTable({ van1: { prodC: 1 } });
    // Two "vendors" both call the legacy path for 1 unit against a stock of 1.
    const afterFirst = legacyDecrementStock(stock, "van1", "prodC", 1);
    const afterSecond = legacyDecrementStock(stock, "van1", "prodC", 1); // should have been rejected, but isn't
    expect(afterFirst).toBe(0);
    expect(afterSecond).toBe(0); // no exception thrown, no negative value — but a unit was sold twice with no record of the conflict
  });
});

describe("strictSell — priority 6: venta con varios productos", () => {
  it("decrements every line of a multi-product sale correctly", () => {
    const stock = createFakeStockTable({ van1: { prodA: 20, prodB: 10, prodC: 5 } });
    strictSell(stock, "van1", [
      { producto_id: "prodA", cantidad: 2 },
      { producto_id: "prodB", cantidad: 3 },
      { producto_id: "prodC", cantidad: 1 },
    ]);
    expect(stock.get("van1", "prodA")).toBe(18);
    expect(stock.get("van1", "prodB")).toBe(7);
    expect(stock.get("van1", "prodC")).toBe(4);
  });

  it("is all-or-nothing: if any line is short, no line is decremented", () => {
    const stock = createFakeStockTable({ van1: { prodA: 20, prodB: 1 } });
    expect(() =>
      strictSell(stock, "van1", [
        { producto_id: "prodA", cantidad: 2 },
        { producto_id: "prodB", cantidad: 5 }, // insufficient
      ])
    ).toThrow(/Insufficient stock/);
    // prodA must NOT have been decremented even though it had enough stock
    expect(stock.get("van1", "prodA")).toBe(20);
    expect(stock.get("van1", "prodB")).toBe(1);
  });
});

describe("restoreStock — priority 7: anulación y restauración de inventario", () => {
  it("adds returned quantity back to stock", () => {
    const stock = createFakeStockTable({ van1: { prodA: 5 } });
    const next = restoreStock(stock, "van1", "prodA", 2, { originalQty: 4, previouslyReturned: 0 });
    expect(next).toBe(7);
  });

  it("rejects returning more than was originally sold", () => {
    const stock = createFakeStockTable({ van1: { prodA: 5 } });
    expect(() =>
      restoreStock(stock, "van1", "prodA", 3, { originalQty: 2, previouslyReturned: 0 })
    ).toThrow(/exceeds available quantity/);
    expect(stock.get("van1", "prodA")).toBe(5); // untouched
  });

  it("accounts for a prior partial return when checking the over-return guard", () => {
    const stock = createFakeStockTable({ van1: { prodA: 5 } });
    // originally sold 4, already returned 3 -> only 1 more can be returned
    expect(() =>
      restoreStock(stock, "van1", "prodA", 2, { originalQty: 4, previouslyReturned: 3 })
    ).toThrow(/exceeds available quantity/);

    const next = restoreStock(stock, "van1", "prodA", 1, { originalQty: 4, previouslyReturned: 3 });
    expect(next).toBe(6);
  });
});
