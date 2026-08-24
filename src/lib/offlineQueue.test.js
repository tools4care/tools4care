import { describe, expect, it } from "vitest";
import {
  OFFLINE_QUEUE_SCHEMA_VERSION,
  buildOfflinePaymentBatchRpc,
  groupOfflinePayments,
  normalizeOfflinePayment,
  normalizeOfflineSale,
  validateOfflinePaymentBatch,
} from "./offlineQueue";

function ids() {
  let value = 0;
  return () => `generated-${++value}`;
}

describe("offline queue normalization", () => {
  it("assigns a persistent idempotency key to a legacy sale", () => {
    const sale = normalizeOfflineSale({ _offline_id: 123, total: 20 }, ids());
    expect(sale._offline_id).toBe(123);
    expect(sale.transaction_id).toBe("generated-1");
    expect(sale._queue_schema_version).toBe(OFFLINE_QUEUE_SCHEMA_VERSION);
  });

  it("never replaces identifiers already stored on a sale", () => {
    const sale = normalizeOfflineSale({
      _offline_id: "local-sale",
      transaction_id: "transaction-sale",
    }, () => { throw new Error("must not generate an id"); });
    expect(sale._offline_id).toBe("local-sale");
    expect(sale.transaction_id).toBe("transaction-sale");
  });

  it("gives a legacy payment separate source and batch identifiers", () => {
    const payment = normalizeOfflinePayment({ _offline_id: 456, monto: 10 }, ids());
    expect(payment.transaction_id).toBe("generated-1");
    expect(payment.payment_batch_id).toBe("generated-2");
  });
});

describe("offline payment batches", () => {
  const shared = {
    cliente_id: "customer-1",
    van_id: "location-1",
    store_cash_session_id: null,
    metodo_pago: "cash",
  };

  it("groups split payment sources into one atomic batch", () => {
    const payments = [
      { ...shared, _offline_id: "a", payment_batch_id: "batch-1", transaction_id: "part-1", monto: 7, metodo_pago: "cash" },
      { ...shared, _offline_id: "b", payment_batch_id: "batch-1", transaction_id: "part-2", monto: 3, metodo_pago: "card" },
      { ...shared, _offline_id: "c", payment_batch_id: "batch-2", transaction_id: "part-3", monto: 2, metodo_pago: "cash" },
    ];
    const groups = groupOfflinePayments(payments);
    expect(groups).toHaveLength(2);
    expect(groups[0].parts.map((part) => part._offline_id)).toEqual(["a", "b"]);
    expect(validateOfflinePaymentBatch(groups[0].parts)).toBe(groups[0].parts[0]);
    expect(buildOfflinePaymentBatchRpc(groups[0])).toEqual({
      p_cliente_id: "customer-1",
      p_location_id: "location-1",
      p_session_id: null,
      p_parts: [
        { amount: 7, method: "cash", reference: null, transaction_id: "part-1" },
        { amount: 3, method: "card", reference: null, transaction_id: "part-2" },
      ],
      p_transaction_id: "batch-1",
      p_paid_at: undefined,
    });
  });

  it("rejects a batch that mixes customer accounts", () => {
    expect(() => validateOfflinePaymentBatch([
      { ...shared, transaction_id: "part-1", monto: 5 },
      { ...shared, cliente_id: "customer-2", transaction_id: "part-2", monto: 5 },
    ])).toThrow(/mixes customers/i);
  });

  it("rejects invalid amounts before any network request", () => {
    expect(() => validateOfflinePaymentBatch([
      { ...shared, transaction_id: "part-1", monto: 0 },
    ])).toThrow(/invalid payment source/i);
  });
});
