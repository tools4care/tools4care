export function getSaleTaxParts(sale, fallbackConfig = {}) {
  let payment = sale?.pago_json || {};
  if (typeof payment === "string") {
    try { payment = JSON.parse(payment); } catch { payment = {}; }
  }

  const storedSubtotal = Number(payment?.subtotal);
  const storedTax = Number(payment?.tax_amount);
  const grand = Number(sale?.total_venta ?? sale?.total ?? 0);
  if (payment?.subtotal != null && payment?.tax_amount != null && Number.isFinite(storedSubtotal) && Number.isFinite(storedTax)) {
    return { subtotal: storedSubtotal, tax: storedTax, grand };
  }

  // Compatibility for transactions created before tax details were stored.
  const rate = fallbackConfig.enabled ? (Number(fallbackConfig.rate) || 0) / 100 : 0;
  if (fallbackConfig.includeInPrice && rate > 0) {
    const subtotal = grand / (1 + rate);
    return { subtotal, tax: grand - subtotal, grand };
  }
  return { subtotal: grand, tax: 0, grand };
}
