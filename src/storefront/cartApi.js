// src/storefront/cartApi.js
import { supabase } from "../supabaseClient";
import { getAnonId } from "../utils/anon";

export async function ensureCart() {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;
  const col = userId ? "user_id" : "anon_id";
  const val = userId ?? getAnonId();

  const { data: found, error: selErr } = await supabase
    .from("carts")
    .select("id")
    .eq(col, val)
    .maybeSingle();
  if (selErr && selErr.code !== "PGRST116") throw selErr;
  if (found?.id) return found.id;

  const { data: inserted, error: insErr } = await supabase
    .from("carts")
    .insert({ [col]: val })
    .select("id")
    .single();

  if (insErr && String(insErr.code) === "23505") {
    const { data: again } = await supabase
      .from("carts")
      .select("id")
      .eq(col, val)
      .maybeSingle();
    if (again?.id) return again.id;
  }
  if (insErr) throw insErr;
  return inserted.id;
}

export async function cartCount(cartId) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("qty")
    .eq("cart_id", cartId);
  if (error) throw error;
  return (data || []).reduce((s, r) => s + Number(r.qty || 0), 0);
}

// src/storefront/cartApi.js
export async function addToCart(product, qty = 1) {
  const cartId = await ensureCart();

  // 1) intenta subir cantidad con upsert (actualiza si existe, inserta si no)
  const { error } = await supabase
    .from("cart_items")
    .upsert(
      { cart_id: cartId, producto_id: product.id, qty },  // si ya existía, esta qty REEMPLAZA
      { onConflict: "cart_id,producto_id" }
    );
  if (error) throw error;

  // 2) devuelve el conteo actualizado
  return cartCount(cartId);
}
