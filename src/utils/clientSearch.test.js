import { describe, expect, it, vi } from "vitest";
import {
  canonicalPhoneDigits,
  clientSearchScore,
  filterClientsLocal,
  findClientIdsByPhone,
  phoneIdFilter,
} from "./clientSearch";

describe("client phone search normalization", () => {
  it.each([
    ["(978) 601-0824", "9786010824"],
    ["978-601-0824", "9786010824"],
    ["+1 978 601 0824", "9786010824"],
    ["1 (978) 601-0824", "9786010824"],
  ])("normalizes %s to the same US phone", (input, expected) => {
    expect(canonicalPhoneDigits(input)).toBe(expected);
  });

  it("matches equivalent phone formats in local and offline searches", () => {
    const clients = [
      { id: "a", nombre: "Edwin", telefono: "+1 (978) 601-0824" },
      { id: "b", nombre: "Other", telefono: "(857) 555-0100" },
    ];

    expect(filterClientsLocal(clients, "9786010824")).toEqual([clients[0]]);
    expect(filterClientsLocal(clients, "601-0824")).toEqual([clients[0]]);
    expect(clientSearchScore(clients[0], "1 978 601 0824")).toBe(0);
  });

  it("uses normalized database lookup for phone-like terms", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ cliente_id: "87299a6e-d046-4ad6-8097-124640b4159d" }],
      error: null,
    });

    await expect(findClientIdsByPhone({ rpc }, "(978) 601-0824", 25)).resolves.toEqual([
      "87299a6e-d046-4ad6-8097-124640b4159d",
    ]);
    expect(rpc).toHaveBeenCalledWith("buscar_clientes_por_telefono", {
      p_busqueda: "(978) 601-0824",
      p_limite: 25,
    });
  });

  it("builds only safe UUID filters", () => {
    expect(phoneIdFilter("cliente_id", [
      "87299a6e-d046-4ad6-8097-124640b4159d",
      "not-an-id",
    ])).toBe("cliente_id.in.(87299a6e-d046-4ad6-8097-124640b4159d)");
  });
});
