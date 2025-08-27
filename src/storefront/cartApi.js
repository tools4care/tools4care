// src/storefront/cartApi.js
import { supabase } from "../supabaseClient";
import { getAnonId } from "../utils/anon";

/* ------------------------------------------
   Crea (o reutiliza) un carrito del usuario
-------------------------------------------*/
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

  // carrera: si otro proceso creó el carrito, lo leemos
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

/* -----------------------------
   Contador total de unidades
------------------------------*/
export async function cartCount(cartId) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("qty")
    .eq("cart_id", cartId);

  if (error) throw error;
  return (data || []).reduce((s, r) => s + Number(r.qty || 0), 0);
}

/* ----------------------------------------------------
   Agrega una línea (o la crea si no existe).
   Nota: hoy REEMPLAZA la qty si ya existía.
-----------------------------------------------------*/
export async function addToCart(product, qty = 1) {
  const cartId = await ensureCart();

  const { error } = await supabase
    .from("cart_items")
    .upsert(
      { cart_id: cartId, producto_id: product.id, qty: Number(qty) },
      { onConflict: "cart_id,producto_id" }
    );

  if (error) throw error;
  return cartCount(cartId);
}

/* =====================================================
   NUEVO: helpers para el panel del carrito (listado, 
   cambio de cantidad, eliminar línea, vaciar carrito)
=====================================================*/

// Lista líneas del carrito enriquecidas con datos del producto e imagen principal
export async function listCartItems(cartIdInput) {
  const cartId = cartIdInput || (await ensureCart());

  // 1) líneas puras
  const { data: items, error } = await supabase
    .from("cart_items")
    .select("producto_id, qty")
    .eq("cart_id", cartId);

  if (error) throw error;

  const lines = items || [];
  if (!lines.length) return [];

  // 2) productos asociados
  const ids = lines.map((r) => r.producto_id);

  const { data: prods, error: pErr } = await supabase
    .from("online_products_v")
    .select("id,codigo,nombre,marca,price_base,price_online,stock")
    .in("id", ids);
  if (pErr) throw pErr;

  // 3) portada (imagen principal)
  let coverMap = new Map();
  const { data: covers, error: cErr } = await supabase
    .from("product_main_image_v")
    .select("producto_id, main_image_url")
    .in("producto_id", ids);
  if (!cErr && covers) {
    coverMap = new Map(covers.map((c) => [c.producto_id, c.main_image_url]));
  }

  const prodMap = new Map((prods || []).map((p) => [p.id, p]));

  // 4) unión + cálculos
  return lines.map((it) => {
    const p = prodMap.get(it.producto_id) || {};
    const price = Number(p.price_online ?? p.price_base ?? 0);
    const qty = Number(it.qty || 0);
    return {
      producto_id: it.producto_id,
      qty,
      nombre: p.nombre || "",
      marca: p.marca || "",
      codigo: p.codigo || "",
      price_base: p.price_base ?? null,
      price_online: p.price_online ?? null,
      price,
      stock: Number(p.stock ?? 0),
      main_image_url: coverMap.get(it.producto_id) || null,
      subtotal: price * qty,
    };
  });
}

// Cambia la cantidad de una línea (si qty <= 0, elimina). Devuelve el nuevo contador.
export async function updateCartQty(producto_id, qty) {
  const cartId = await ensureCart();
  if (!producto_id) return 0;

  const nQty = Number(qty);
  if (nQty <= 0) {
    return removeFromCart(producto_id);
  }

  const { error } = await supabase
    .from("cart_items")
    .upsert(
      { cart_id: cartId, producto_id, qty: nQty },
      { onConflict: "cart_id,producto_id" }
    );
  if (error) throw error;

  const { data } = await supabase
    .from("cart_items")
    .select("qty")
    .eq("cart_id", cartId);

  return (data || []).reduce((s, r) => s + Number(r.qty || 0), 0);
}

// Alias con el nombre que espera Storefront.jsx
export const updateCartItemQty = updateCartQty;

// Elimina una línea del carrito. Devuelve el nuevo contador.
export async function removeFromCart(producto_id) {
  const cartId = await ensureCart();

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("cart_id", cartId)
    .eq("producto_id", producto_id);
  if (error) throw error;

  const { data } = await supabase
    .from("cart_items")
    .select("qty")
    .eq("cart_id", cartId);

  return (data || []).reduce((s, r) => s + Number(r.qty || 0), 0);
}

// Vacía el carrito actual
export async function clearCart() {
  const cartId = await ensureCart();
  await supabase.from("cart_items").delete().eq("cart_id", cartId);
}

// Alias para compatibilidad con Storefront.jsx
export { removeFromCart as removeCartItem };
