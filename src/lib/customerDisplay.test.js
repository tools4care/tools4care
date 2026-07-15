import { describe, expect, it } from "vitest";
import { buildCustomerDisplaySnapshot } from "./customerDisplay";

describe("buildCustomerDisplaySnapshot", () => {
  it("creates safe line totals and checkout amounts", () => {
    const snapshot = buildCustomerDisplaySnapshot({
      locationId: "store-1",
      customerName: "Walk-in Customer",
      items: [{ producto_id: "p1", nombre: "Clipper", cantidad: 2, precio_unitario: 9.995 }],
      subtotal: 19.99,
      taxAmount: 1.4,
      total: 21.39,
      previousBalance: 10,
      amountDue: 31.39,
      paid: 25,
      change: 3.61,
    });

    expect(snapshot.items[0]).toMatchObject({ quantity: 2, unitPrice: 9.99, lineTotal: 19.99 });
    expect(snapshot.purchaseTotal).toBe(21.39);
    expect(snapshot.previousBalance).toBe(10);
    expect(snapshot.amountDue).toBe(31.39);
    expect(snapshot.change).toBe(3.61);
  });
});
