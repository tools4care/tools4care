// src/lib/salesReport.js
//
// Pure aggregation helpers modeling the "net sales" rule used across Reportes.jsx /
// Dashboard.jsx: a return (tipo === "devolucion") is tracked separately from gross sales
// and subtracted to produce the net figure, grouped by vendor (usuario_id) or by day.
//
// CAVEAT: the real reports partly read from DB views (facturas_ext,
// v_financial_ledger_daily) whose SQL is NOT tracked in supabase/migrations/ (created
// directly in the Supabase SQL editor, per the audit). This module was written against
// the client-side usage patterns found in Reportes.jsx/Dashboard.jsx, not against the
// view definitions themselves — treat it as the intended business rule, not a proven
// mirror of the deployed views. Validating it against the real views needs the test-DB
// environment proposed alongside this report.

function signedAmount(venta) {
  const total = Number(venta.total_venta ?? venta.total ?? 0);
  return venta.tipo === "devolucion" ? -Math.abs(total) : total;
}

function emptyBucket(key, keyField) {
  return { [keyField]: key, bruto: 0, devoluciones: 0, neto: 0, cantidad: 0 };
}

function accumulate(bucket, venta) {
  const amt = signedAmount(venta);
  if (venta.tipo === "devolucion") bucket.devoluciones = Math.round((bucket.devoluciones + Math.abs(amt)) * 100) / 100;
  else bucket.bruto = Math.round((bucket.bruto + amt) * 100) / 100;
  bucket.neto = Math.round((bucket.neto + amt) * 100) / 100;
  bucket.cantidad += 1;
}

/** Priority 8: reporte por vendedor. */
export function aggregateByVendor(ventas) {
  const out = new Map();
  for (const v of ventas || []) {
    const key = v.usuario_id ?? "desconocido";
    if (!out.has(key)) out.set(key, emptyBucket(key, "usuario_id"));
    accumulate(out.get(key), v);
  }
  return Array.from(out.values());
}

/** Priority 9: reporte del día (o de un rango, agrupado por fecha). */
export function aggregateByDay(ventas, dateField = "fecha") {
  const out = new Map();
  for (const v of ventas || []) {
    const day = String(v[dateField] || "").slice(0, 10);
    if (!out.has(day)) out.set(day, emptyBucket(day, "fecha"));
    accumulate(out.get(day), v);
  }
  return Array.from(out.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
