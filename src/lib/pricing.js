// src/lib/pricing.js
// Pure pricing/discount/cart-total calculations mirrored from src/Ventas.jsx
// (unitPriceFromProduct, extractPricingFromRow, computeUnitPriceFromRow at the top of that
// file, and the cart-total/tax block around Ventas.jsx:2820-2849 / discount resolution
// around Ventas.jsx:4084-4146). Extracted so this logic can be unit-tested independently.
//
// NOTE: Ventas.jsx still has its own inline copies of this logic as of this writing — it
// does not import from this file yet. Wiring Ventas.jsx to import from here instead of
// keeping two copies is a separate, reviewable follow-up change (flagged in the test report).

export function r2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

const firstNumber = (arr, def = 0, acceptZero = false) => {
  for (const v of arr) {
    const n = Number(v);
    if (Number.isFinite(n) && (acceptZero ? n >= 0 : n > 0)) return n;
  }
  return def;
};

export function extractPricingFromRow(row) {
  const p = row?.productos ?? row ?? {};
  const base = firstNumber(
    [
      p.precio, row?.precio,
      p.precio_unit, row?.precio_unit,
      p.price, row?.price,
      p.bulk_unit_price, row?.bulk_unit_price,
    ],
    0,
    false
  );
  const pct = firstNumber([p.descuento_pct, row?.descuento_pct], 0, true);
  const bulkMin =
    p?.bulk_min_qty != null
      ? Number(p.bulk_min_qty)
      : row?.bulk_min_qty != null
      ? Number(row.bulk_min_qty)
      : null;
  const bulkPrice = firstNumber([p.bulk_unit_price, row?.bulk_unit_price], null, false) ?? null;
  return { base, pct, bulkMin, bulkPrice };
}

export function unitPriceFromProduct({ base, pct, bulkMin, bulkPrice }, qty) {
  const q = Number(qty || 0);
  const hasBulk = bulkMin != null && bulkPrice != null && q >= Number(bulkMin);
  if (hasBulk) return r2(bulkPrice);
  const pctNum = Number(pct || 0);
  if (pctNum > 0) return r2(base * (1 - pctNum / 100));
  return r2(base);
}

export function computeUnitPriceFromRow(row, qty = 1) {
  const pr = extractPricingFromRow(row);
  let base = Number(pr.base || 0);
  if ((!base || base <= 0) && pr.bulkPrice && (!pr.bulkMin || qty >= Number(pr.bulkMin))) {
    base = Number(pr.bulkPrice);
  }
  if (!base || !Number.isFinite(base)) return 0;
  return unitPriceFromProduct(
    { base, pct: pr.pct, bulkMin: pr.bulkMin, bulkPrice: pr.bulkPrice },
    qty
  );
}

/**
 * Resolves the effective discount % for one cart line: manual override > bulk-implied
 * discount > catalog discount. Mirrors Ventas.jsx:4088-4102.
 */
export function resolveLineDiscountPct({ manualDescuento, base, qty, bulkMin, bulkPrice, catalogPct }) {
  const hasBulk = bulkMin != null && bulkPrice != null && Number(qty) >= Number(bulkMin);
  if (Number(manualDescuento) > 0) return Number(manualDescuento);
  if (hasBulk && Number(base) > 0 && Number(bulkPrice) > 0) {
    return Math.max(0, (1 - Number(bulkPrice) / Number(base)) * 100);
  }
  if (Number(catalogPct) > 0) return Number(catalogPct);
  return 0;
}

/** Subtotal for one cart line after discount. Mirrors Ventas.jsx:4136-4146. */
export function lineSubtotal({ base, qty, discountPct }) {
  const finalUnit = r2(Number(base) * (1 - Number(discountPct || 0) / 100));
  return r2(finalUnit * Number(qty || 0));
}

/**
 * Cart total + tax, mirrors Ventas.jsx:2820-2849.
 * cart items: { cantidad, precio_unitario }
 */
export function computeCartTotals({ cart, taxEnabled, taxRate, taxIncluded }) {
  const items = Array.isArray(cart) ? cart : [];
  const saleTotal = r2(
    items.reduce((t, p) => t + Number(p.cantidad || 0) * Number(p.precio_unitario || 0), 0)
  );
  const rate = Number(taxRate || 0);
  if (!taxEnabled || rate === 0) {
    return { saleTotal, taxAmount: 0, saleTotalWithTax: saleTotal };
  }
  if (taxIncluded) {
    const taxAmount = r2(saleTotal - saleTotal / (1 + rate / 100));
    return { saleTotal, taxAmount, saleTotalWithTax: saleTotal };
  }
  const taxAmount = r2(saleTotal * (rate / 100));
  return { saleTotal, taxAmount, saleTotalWithTax: r2(saleTotal + taxAmount) };
}
