export function paymentMethodKind(value) {
  const method = String(value || "").trim().toLowerCase();
  if (/cash|efectivo/.test(method)) return "cash";
  if (/card|tarjeta|stripe/.test(method)) return "card";
  if (/transfer|zelle|venmo|cash\s?app|apple\s?pay|paypal/.test(method)) return "transfer";
  return "other";
}

export function cashRefundAmount(transaction) {
  if (transaction?.tipo !== "devolucion") return 0;
  const recordedCash = Math.abs(Number(transaction?.pago_efectivo || 0));
  if (recordedCash > 0) return recordedCash;
  if (paymentMethodKind(transaction?.metodo_pago) !== "cash") return 0;
  return Math.abs(Number(transaction?.total_venta ?? transaction?.total ?? 0));
}
