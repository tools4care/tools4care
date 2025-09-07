// src/storefront/cartApi.js
import { supabase } from "../supabaseClient";
import { getAnonId } from "../utils/anon";

/* ----------------- caché ligera en memoria ----------------- */
let cartCache = {
  id: null,
  items: new Map(), // producto_id -> qty
  count: 0,
  hydrated: false,
};

async function hydrateCartCache(cartId) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("producto_id, qty")
    .eq("cart_id", cartId);
  if (error) throw error;
  cartCache.items = new Map((data || []).map((r) => [r.producto_id, Number(r.qty || 0)]));
  cartCache.count = (data || []).reduce((s, r) => s + Number(r.qty || 0), 0);
  cartCache.hydrated = true;
}

/* ----------------- utils ----------------- */
async function getOnlineStock(productId) {
  const { data, error } = await supabase
    .from("online_products_v")
    .select("id, stock")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.stock ?? 0);
}

/* ------------------------------------------
   Crea (o reutiliza) un carrito del usuario
-------------------------------------------*/
export async function ensureCart() {
  if (cartCache.id) return cartCache.id;

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
  if (found?.id) {
    cartCache.id = found.id;
    return found.id;
  }

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
    if (again?.id) {
      cartCache.id = again.id;
      return again.id;
    }
  }
  if (insErr) throw insErr;

  cartCache.id = inserted.id;
  return inserted.id;
}

/* -----------------------------
   Contador total de unidades
------------------------------*/
export async function cartCount(cartId) {
  const id = cartId || (await ensureCart());
  if (cartCache.id === id && cartCache.hydrated) return cartCache.count;

  const { data, error } = await supabase
    .from("cart_items")
    .select("qty")
    .eq("cart_id", id);
  if (error) throw error;

  const total = (data || []).reduce((s, r) => s + Number(r.qty || 0), 0);
  if (cartCache.id === id) {
    cartCache.count = total;
    cartCache.hydrated = true;
    cartCache.items = new Map();
  }
  return total;
}

/* ----------------------------------------------------
   Agregar al carrito (suma y CLAMPEA a stock online)
   Fast-path: RPC cart_add_clamped (1 roundtrip)
   Fallback: camino anterior si el RPC no existe
-----------------------------------------------------*/
export async function addToCart(product, delta = 1) {
  const cartId = await ensureCart();
  const deltaNum = Number(delta || 0);

  // si del catálogo viene stock, validación temprana (mejor UX)
  const incomingStock =
    product && Number.isFinite(Number(product.stock)) ? Number(product.stock) : null;
  if (incomingStock != null && incomingStock <= 0) {
    throw new Error("Out of stock");
  }

  // ---------- FAST PATH: RPC ----------
  try {
    const { data, error } = await supabase.rpc("cart_add_clamped", {
      p_cart_id: cartId,
      p_producto_id: product.id,
      p_delta: deltaNum,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const newQty = Number(row?.new_qty ?? 0);
    const newTotal = Number(row?.new_total ?? 0);

    if (cartCache.id === cartId) {
      cartCache.items.set(product.id, newQty);
      cartCache.count = newTotal;
      cartCache.hydrated = true;
    }
    return newTotal;
  } catch (rpcErr) {
    // Si el RPC aún no existe, usamos el camino anterior
    // ------- LEGACY PATH (mismo comportamiento) -------
    const stock =
      incomingStock != null ? incomingStock : await getOnlineStock(product.id);
    if (stock <= 0) throw new Error("Out of stock");

    let current = 0;
    if (cartCache.hydrated && cartCache.items.has(product.id)) {
      current = Number(cartCache.items.get(product.id) || 0);
    } else {
      const { data: cur, error: selErr } = await supabase
        .from("cart_items")
        .select("qty")
        .eq("cart_id", cartId)
        .eq("producto_id", product.id)
        .maybeSingle();
      if (selErr && selErr.code !== "PGRST116") throw selErr;
      current = Number(cur?.qty ?? 0);
    }

    const desired = Math.max(0, Math.min(stock, current + deltaNum));
    if (desired === current) {
      return cartCache.count || (await cartCount(cartId));
    }

    const { error: upErr } = await supabase
      .from("cart_items")
      .upsert(
        { cart_id: cartId, producto_id: product.id, qty: desired },
        { onConflict: "cart_id,producto_id" }
      );
    if (upErr) throw upErr;

    if (cartCache.id === cartId) {
      cartCache.items.set(product.id, desired);
      cartCache.count += desired - current;
      cartCache.hydrated = true;
      return cartCache.count;
    }
    return cartCount(cartId);
  }
}

/* =====================================================
   Listar líneas del carrito (con price/stock/imagen)
=====================================================*/
export async function listCartItems(cartIdInput) {
  const cartId = cartIdInput || (await ensureCart());
  const { data: items, error } = await supabase
    .from("cart_items")
    .select("producto_id, qty")
    .eq("cart_id", cartId);
  if (error) throw error;

  const lines = items || [];
  if (!lines.length) {
    if (cartCache.id === cartId) {
      cartCache.items = new Map();
      cartCache.count = 0;
      cartCache.hydrated = true;
    }
    return [];
  }

  const ids = lines.map((r) => r.producto_id);

  const { data: prods, error: pErr } = await supabase
    .from("online_products_v")
    .select("id,codigo,nombre,marca,price_base,price_online,stock")
    .in("id", ids);
  if (pErr) throw pErr;

  const { data: covers } = await supabase
    .from("product_main_image_v")
    .select("producto_id, main_image_url")
    .in("producto_id", ids);

  const coverMap = new Map((covers || []).map((c) => [c.producto_id, c.main_image_url]));
  const prodMap = new Map((prods || []).map((p) => [p.id, p]));

  if (cartCache.id === cartId) {
    cartCache.items = new Map(lines.map((r) => [r.producto_id, Number(r.qty || 0)]));
    cartCache.count = lines.reduce((s, r) => s + Number(r.qty || 0), 0);
    cartCache.hydrated = true;
  }

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

/* ----------------------------------------------------
   Cambiar qty (CLAMPEA a stock; <=0 elimina la línea)
   Usa RPC cart_set_qty_clamped si existe
-----------------------------------------------------*/
export async function updateCartQty(producto_id, qty) {
  const cartId = await ensureCart();
  const wanted = Math.max(0, Number(qty || 0));

  // FAST PATH RPC
  try {
    const { data, error } = await supabase.rpc("cart_set_qty_clamped", {
      p_cart_id: cartId,
      p_producto_id: producto_id,
      p_wanted: wanted,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const newQty = Number(row?.new_qty ?? 0);
    const newTotal = Number(row?.new_total ?? 0);

    if (cartCache.id === cartId) {
      if (newQty <= 0) cartCache.items.delete(producto_id);
      else cartCache.items.set(producto_id, newQty);
      cartCache.count = newTotal;
      cartCache.hydrated = true;
    }
    return newTotal;
  } catch {
    // Fallback legacy
    const stock = await getOnlineStock(producto_id);
    const clamped = Math.min(wanted, Math.max(0, stock));
    if (clamped <= 0) return removeFromCart(producto_id);

    const prev = cartCache.items.get(producto_id) || 0;

    const { error } = await supabase
      .from("cart_items")
      .upsert(
        { cart_id: cartId, producto_id, qty: clamped },
        { onConflict: "cart_id,producto_id" }
      );
    if (error) throw error;

    if (cartCache.id === cartId) {
      cartCache.items.set(producto_id, clamped);
      cartCache.count += clamped - prev;
      cartCache.hydrated = true;
      return cartCache.count;
    }

    const { data } = await supabase
      .from("cart_items")
      .select("qty")
      .eq("cart_id", cartId);
    return (data || []).reduce((s, r) => s + Number(r.qty || 0), 0);
  }
}
export const updateCartItemQty = updateCartQty;

/* ---------------------- eliminar / limpiar ---------------------- */
export async function removeFromCart(producto_id) {
  const cartId = await ensureCart();
  const prev = cartCache.items.get(producto_id) || 0;

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("cart_id", cartId)
    .eq("producto_id", producto_id);
  if (error) throw error;

  if (cartCache.id === cartId) {
    cartCache.items.delete(producto_id);
    cartCache.count = Math.max(0, cartCache.count - prev);
    cartCache.hydrated = true;
    return cartCache.count;
  }

  const { data } = await supabase
    .from("cart_items")
    .select("qty")
    .eq("cart_id", cartId);

  return (data || []).reduce((s, r) => s + Number(r.qty || 0), 0);
}
export async function clearCart() {
  const cartId = await ensureCart();
  await supabase.from("cart_items").delete().eq("cart_id", cartId);
  if (cartCache.id === cartId) {
    cartCache.items = new Map();
    cartCache.count = 0;
    cartCache.hydrated = true;
  }
}
export { removeFromCart as removeCartItem };
