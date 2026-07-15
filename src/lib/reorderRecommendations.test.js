import { describe, expect, it } from "vitest";
import { buildReorderRecommendations } from "./reorderRecommendations";

const NOW = new Date("2026-07-14T12:00:00Z");

function lines(productId, quantities, daysAgo = 5) {
  return quantities.map((cantidad, index) => ({
    producto_id: productId,
    cantidad,
    productos: { id: productId, nombre: `Product ${productId}` },
    ventas: {
      created_at: new Date(NOW.getTime() - (daysAgo + index) * 86400000).toISOString(),
      tipo: "venta",
    },
  }));
}

describe("smart reorder recommendations", () => {
  it("ignores one-time purchases even when stock is zero", () => {
    const result = buildReorderRecommendations({
      salesLines: lines("once", [1]),
      stockRows: [{ producto_id: "once", cantidad: 0 }],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("marks a repeated out-of-stock seller as critical and calculates order quantity", () => {
    const result = buildReorderRecommendations({
      salesLines: lines("fast", [4, 4, 4, 4]),
      stockRows: [{ producto_id: "fast", cantidad: 0 }],
      now: NOW,
    });
    expect(result[0]).toEqual(expect.objectContaining({
      producto_id: "fast",
      urgencia: "critico",
      esMasVendido: true,
      cantidad: 0,
    }));
    expect(result[0].cantidadRecomendada).toBeGreaterThan(1);
  });

  it("warns before a best seller runs out even when stock is above ten", () => {
    const result = buildReorderRecommendations({
      salesLines: lines("best", [20, 20, 20]),
      stockRows: [{ producto_id: "best", cantidad: 15 }],
      now: NOW,
    });
    expect(result[0]).toEqual(expect.objectContaining({
      producto_id: "best",
      esMasVendido: true,
      urgencia: "bajo",
    }));
  });

  it("does not recommend well-stocked products", () => {
    const result = buildReorderRecommendations({
      salesLines: lines("safe", [3, 3, 3]),
      stockRows: [{ producto_id: "safe", cantidad: 100 }],
      now: NOW,
    });
    expect(result).toEqual([]);
  });
});
