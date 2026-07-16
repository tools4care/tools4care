import { describe, expect, it } from "vitest";
import { cashRefundAmount, paymentMethodKind } from "./paymentMethod";

describe("paymentMethodKind", () => {
  it("normalizes store payment labels", () => {
    expect(paymentMethodKind("Cash")).toBe("cash");
    expect(paymentMethodKind("efectivo")).toBe("cash");
    expect(paymentMethodKind("Card - Stripe")).toBe("card");
    expect(paymentMethodKind("Transfer - Zelle")).toBe("transfer");
    expect(paymentMethodKind("Check #123")).toBe("other");
  });
});

describe("cashRefundAmount", () => {
  it("uses the explicit cash breakdown when present", () => {
    expect(cashRefundAmount({ tipo: "devolucion", pago_efectivo: 12.5, total_venta: 20 })).toBe(12.5);
  });

  it("falls back to the return total for legacy cash refunds", () => {
    expect(cashRefundAmount({ tipo: "devolucion", metodo_pago: "Cash", total_venta: 20 })).toBe(20);
  });

  it("does not remove cash for card refunds", () => {
    expect(cashRefundAmount({ tipo: "devolucion", metodo_pago: "Card", total_venta: 20 })).toBe(0);
  });
});
