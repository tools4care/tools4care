const roundMoney = (value) => Number((Number(value) || 0).toFixed(2));

export function readSalePaymentMetadata(sale) {
  let payment = sale?.pago ?? sale?.pago_json ?? {};
  if (typeof payment === "string") {
    try {
      payment = JSON.parse(payment);
    } catch {
      payment = {};
    }
  }
  return payment && typeof payment === "object" ? payment : {};
}

export function getReturnLineUnit(item) {
  const quantity = Number(item?.cantidad || 0);
  const storedSubtotal = Number(item?.subtotal);
  if (quantity > 0 && Number.isFinite(storedSubtotal) && storedSubtotal >= 0) {
    return storedSubtotal / quantity;
  }

  const base = Number(item?.precio_unitario || 0);
  const discount = Math.min(100, Math.max(0, Number(item?.descuento || 0)));
  return base * (1 - discount / 100);
}

export function getMoneyAppliedToSale(sale) {
  const payment = readSalePaymentMetadata(sale);
  if (payment.aplicado_venta != null && Number.isFinite(Number(payment.aplicado_venta))) {
    return roundMoney(Math.max(0, Number(payment.aplicado_venta)));
  }
  return roundMoney(Math.max(0, Number(sale?.total_pagado || 0)));
}

export function getReturnQuote(sale, quantities = {}) {
  const items = Array.isArray(sale?.detalle_ventas) ? sale.detalle_ventas : [];
  const merchandise = items.reduce((sum, item) => {
    const requested = Math.max(0, Number(quantities[item.id] || 0));
    return sum + requested * getReturnLineUnit(item);
  }, 0);

  const payment = readSalePaymentMetadata(sale);
  const originalTax = Math.max(0, Number(payment.tax_amount || 0));
  const originalSubtotal = Math.max(0, Number(payment.subtotal || 0));
  const originalTotal = Math.max(0, Number(sale?.total_venta ?? sale?.total ?? 0));
  const inferredIncluded = originalTax > 0
    && originalSubtotal > 0
    && Math.abs(originalTotal - originalSubtotal) <= 0.01;
  const taxIncluded = typeof payment.tax_included === "boolean"
    ? payment.tax_included
    : inferredIncluded;

  const tax = originalTax > 0 && originalSubtotal > 0
    ? Math.min(originalTax, originalTax * (merchandise / originalSubtotal))
    : 0;
  const total = taxIncluded ? merchandise : merchandise + tax;

  return {
    merchandise: roundMoney(merchandise),
    tax: roundMoney(tax),
    total: roundMoney(total),
    taxRate: Math.max(0, Number(payment.tax_rate || 0)),
    taxIncluded,
  };
}
