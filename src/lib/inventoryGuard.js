// src/lib/inventoryGuard.js
//
// SIMULATION / SPEC — not the real database function.
//
// These functions model the documented business rules of the Postgres RPCs found in:
//   - supabase/migrations/20260614_save_sale_transaction.sql (guardar_venta_transaccional)
//   - supabase/migrations/20260427_decrementar_stock_van.sql (decrementar_stock_van, legacy)
//   - supabase/migrations/20260617_process_return_transaction.sql (procesar_devolucion_transaccional)
//
// They operate on an in-memory fake stock table so the *business rules* can be unit-tested
// with fake data and no real database connection. They do NOT prove the deployed SQL
// functions behave this way today — only a test against a real Postgres test database can
// prove that. See the test-DB structure proposal in the accompanying report.

export function createFakeStockTable(initial = {}) {
  // initial shape: { [van_id]: { [producto_id]: cantidad } }
  const table = new Map();
  for (const [vanId, products] of Object.entries(initial)) {
    table.set(vanId, new Map(Object.entries(products).map(([pid, qty]) => [pid, Number(qty)])));
  }
  return {
    get(vanId, productoId) {
      return table.get(vanId)?.get(productoId) ?? 0;
    },
    set(vanId, productoId, qty) {
      if (!table.has(vanId)) table.set(vanId, new Map());
      table.get(vanId).set(productoId, qty);
    },
  };
}

/**
 * Mirrors guardar_venta_transaccional's stock loop (migration lines 50-65, 102-104):
 * checks EVERY item's availability first (all-or-nothing) and only decrements if every
 * line has enough stock. Throws — never leaves stock negative or partially decremented —
 * if any item is short.
 */
export function strictSell(stockTable, vanId, items) {
  // items: [{ producto_id, cantidad }]
  for (const { producto_id, cantidad } of items) {
    if (cantidad <= 0) throw new Error(`Invalid quantity for product ${producto_id}`);
    const available = stockTable.get(vanId, producto_id);
    if (available < cantidad) {
      throw new Error(
        `Insufficient stock for product ${producto_id}. Available: ${available}, requested: ${cantidad}`
      );
    }
  }
  for (const { producto_id, cantidad } of items) {
    stockTable.set(vanId, producto_id, stockTable.get(vanId, producto_id) - cantidad);
  }
  return { ok: true };
}

/**
 * Mirrors the LEGACY decrementar_stock_van (migration 20260427): a single clamp-to-zero
 * update with NO availability check and NO exception. Documents the risky behavior found
 * in the audit — unlike strictSell, this function WILL silently oversell.
 */
export function legacyDecrementStock(stockTable, vanId, productoId, cantidad) {
  const current = stockTable.get(vanId, productoId);
  const next = Math.max(0, current - Number(cantidad));
  stockTable.set(vanId, productoId, next);
  return next;
}

/**
 * Mirrors procesar_devolucion_transaccional's restore logic + over-return guard
 * (migration 20260617, lines 66-84, 136-143): additive restore, rejects returning more
 * than was originally sold.
 */
export function restoreStock(stockTable, vanId, productoId, qty, { originalQty, previouslyReturned = 0 } = {}) {
  if (originalQty != null && previouslyReturned + Number(qty) > originalQty + 0.005) {
    throw new Error("Return quantity exceeds available quantity to return");
  }
  const current = stockTable.get(vanId, productoId);
  const next = current + Number(qty);
  stockTable.set(vanId, productoId, next);
  return next;
}
