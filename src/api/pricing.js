// src/api/pricing.js
import { supabase } from "../supabaseClient";

export async function getUnitPrice({ productId, customerId = null, qty = 1 }) {
  const { data, error } = await supabase.rpc("compute_price", {
    _product_id: productId,
    _customer_id: customerId,
    _qty: qty,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? { unit_price: null, source: null, applied_min_qty: null };
}
