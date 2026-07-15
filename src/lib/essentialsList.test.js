import { describe, expect, it } from "vitest";
import {
  addEssentialProduct,
  buildEssentialsText,
  normalizeEssentialList,
  updateEssentialQuantity,
} from "./essentialsList";

describe("Essentials purchase list", () => {
  it("adds a product once and defaults its quantity to one", () => {
    const product = { id: "p1", nombre: "Gloves", marca: "Care" };
    const first = addEssentialProduct([], product);
    const duplicate = addEssentialProduct(first.items, product);

    expect(first.added).toBe(true);
    expect(first.items).toEqual([
      expect.objectContaining({ id: "p1", nombre: "Gloves", cantidad: 1 }),
    ]);
    expect(duplicate.added).toBe(false);
    expect(duplicate.items).toHaveLength(1);
  });

  it("upgrades old saved lists and keeps quantities at one or more", () => {
    const oldList = [{ id: "p1", nombre: "Gloves" }];
    expect(normalizeEssentialList(oldList)[0].cantidad).toBe(1);
    expect(updateEssentialQuantity(oldList, "p1", 4)[0].cantidad).toBe(4);
    expect(updateEssentialQuantity(oldList, "p1", 0)[0].cantidad).toBe(1);
  });

  it("includes quantities in the shared purchase order", () => {
    const text = buildEssentialsText(
      [{ id: "p1", nombre: "Gloves", cantidad: 3, codigo: "ABC" }],
      "Van 1",
      new Date("2026-07-14T12:00:00")
    );

    expect(text).toContain("LISTA DE COMPRAS ESENCIALES — Van 1");
    expect(text).toContain("1. Gloves");
    expect(text).toContain("Cantidad: 3");
    expect(text).toContain("Código: ABC");
  });
});
