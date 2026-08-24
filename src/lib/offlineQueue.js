export const OFFLINE_QUEUE_SCHEMA_VERSION = 2;

export function normalizeOfflineSale(sale, createId) {
  if (!sale || typeof sale !== "object") return sale;
  return {
    ...sale,
    _offline_id: sale._offline_id || createId(),
    transaction_id: sale.transaction_id || createId(),
    _queue_schema_version: OFFLINE_QUEUE_SCHEMA_VERSION,
  };
}

export function normalizeOfflinePayment(payment, createId) {
  if (!payment || typeof payment !== "object") return payment;
  const transactionId = payment.transaction_id || createId();
  return {
    ...payment,
    _offline_id: payment._offline_id || createId(),
    transaction_id: transactionId,
    payment_batch_id: payment.payment_batch_id || createId(),
    _queue_schema_version: OFFLINE_QUEUE_SCHEMA_VERSION,
  };
}

export function groupOfflinePayments(payments = []) {
  const groups = new Map();
  for (const payment of payments) {
    const key = payment.payment_batch_id;
    if (!key) throw new Error("Offline payment is missing its batch id");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(payment);
  }
  return Array.from(groups, ([batchId, parts]) => ({ batchId, parts }));
}

export function validateOfflinePaymentBatch(parts = []) {
  if (!parts.length) throw new Error("Offline payment batch is empty");
  if (parts.length > 4) throw new Error("Offline payment batch has more than four payment sources");
  const first = parts[0];
  for (const part of parts) {
    if (part.cliente_id !== first.cliente_id || part.van_id !== first.van_id) {
      throw new Error("Offline payment batch mixes customers or locations");
    }
    if ((part.store_cash_session_id || null) !== (first.store_cash_session_id || null)) {
      throw new Error("Offline payment batch mixes cash-register sessions");
    }
    if (!part.transaction_id || Number(part.monto || 0) <= 0 || String(part.metodo_pago || "").trim().length < 2) {
      throw new Error("Offline payment batch contains an invalid payment source");
    }
  }
  return first;
}

export function buildOfflinePaymentBatchRpc(group) {
  const first = validateOfflinePaymentBatch(group?.parts || []);
  if (!group?.batchId) throw new Error("Offline payment batch is missing its idempotency key");
  return {
    p_cliente_id: first.cliente_id,
    p_location_id: first.van_id,
    p_session_id: first.store_cash_session_id || null,
    p_parts: group.parts.map((part) => ({
      amount: Number(part.monto),
      method: part.metodo_pago,
      reference: part.referencia || null,
      transaction_id: part.transaction_id,
    })),
    p_transaction_id: group.batchId,
    p_paid_at: first.fecha_pago || first._offline_timestamp,
  };
}
