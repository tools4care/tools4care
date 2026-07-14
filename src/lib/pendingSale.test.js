import { describe, expect, it } from "vitest";
import { isCloudPendingSale, resolvePendingSaleClient } from "./pendingSale";

describe("pending sale customer restoration", () => {
  it("restores the customer stored with a cloud pending sale", () => {
    const sale = {
      id: "pending-1",
      cliente_id: "client-1",
      cliente_data: { id: "client-1", nombre: "EL DURACO" },
    };

    expect(isCloudPendingSale(sale)).toBe(true);
    expect(resolvePendingSaleClient(sale)).toMatchObject({
      id: "client-1",
      nombre: "EL DURACO",
    });
  });

  it("uses the selected customer as a fallback for a limited pending-sale row", () => {
    const limitedSale = { id: "pending-1", cart: [{ producto_id: "p1" }] };
    const selectedCustomer = { id: "client-1", nombre: "EL DURACO", balance: 295.4 };

    expect(isCloudPendingSale(limitedSale, selectedCustomer)).toBe(true);
    expect(resolvePendingSaleClient(limitedSale, selectedCustomer)).toEqual(selectedCustomer);
  });

  it("keeps legacy localStorage sales on the legacy path", () => {
    const legacySale = {
      id: "legacy-1",
      client: { id: "client-2", nombre: "Legacy Customer" },
    };

    expect(isCloudPendingSale(legacySale)).toBe(false);
    expect(resolvePendingSaleClient(legacySale)).toMatchObject({
      id: "client-2",
      nombre: "Legacy Customer",
    });
  });
});
