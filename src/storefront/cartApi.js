// src/storefront/cartApi.js
import { supabase } from "../supabaseClient";
import { getAnonId } from "../utils/anon";

/* =========================
   Config / helpers comunes
========================= */
const MAX_QTY_PER_LINE = 999; // límite de seguridad si no hay stock conocido
const USE_RPC =
  String(import.meta.env.VITE_CART_USE_RPC || "").toLowerCase() === "true";

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

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
  const rows = data || [];
  cartCache.items = new Map(rows.map((r) => [r.producto_id, toInt(r.qty, 0)]));
  cartCache.count = rows.reduce((s, r) => s + toInt(r.qty, 0), 0);
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
  return toInt(data?.stock, 0);
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

  const total = (data || []).reduce((s, r) => s + toInt(r.qty, 0), 0);
  if (cartCache.id === id) {
    cartCache.count = total;
    cartCache.hydrated = true;
    cartCache.items = new Map(); // llenaremos items al listar
  }
  return total;
}

/* ----------------------------------------------------
   Agregar al carrito (suma EXACTAMENTE 1 por clic)
   y CLAMPEA a stock online (o MAX_QTY_PER_LINE)
   - Fast path opcional por RPC (si USE_RPC=true)
   - Fallback robusto en cliente
-----------------------------------------------------*/
export async function addToCart(product, delta = 1) {
  const cartId = await ensureCart();

  // Normaliza delta: siempre +1/-1; 0 o >1 se fuerzan a +1
  let d = toInt(delta, 1);
  if (d === 0) d = 1;
  if (d > 1) d = 1;
  if (d < -1) d = -1;

  // Validación temprana si el catálogo trae stock visible
  const incomingStock =
    product && Number.isFinite(Number(product.stock))
      ? toInt(product.stock, 0)
      : null;
  if (incomingStock != null && incomingStock <= 0 && d > 0) {
    throw new Error("Out of stock");
  }

  // --------- FAST PATH: RPC (opcional) ---------
  if (USE_RPC) {
    try {
      const { data, error } = await supabase.rpc("cart_add_clamped", {
        p_cart_id: cartId,
        p_producto_id: product.id,
        p_delta: d,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const newQty = toInt(row?.new_qty, 0);
      const newTotal = toInt(row?.new_total, 0);

      if (cartCache.id === cartId) {
        cartCache.items.set(product.id, newQty);
        cartCache.count = newTotal;
        cartCache.hydrated = true;
      }
      return newTotal;
    } catch (rpcErr) {
      console.warn(
        "[cart_add_clamped] RPC no disponible/cambió firma; usando fallback.",
        rpcErr?.message || rpcErr
      );
      // continúa al fallback
    }
  }

  // -------------- Fallback (cliente) --------------
  const stock =
    incomingStock != null ? incomingStock : await getOnlineStock(product.id);

  // Lee qty actual
  let current = 0;
  if (cartCache.hydrated && cartCache.items.has(product.id)) {
    current = toInt(cartCache.items.get(product.id), 0);
  } else {
    const { data: cur, error: selErr } = await supabase
      .from("cart_items")
      .select("qty")
      .eq("cart_id", cartId)
      .eq("producto_id", product.id)
      .maybeSingle();
    if (selErr && selErr.code !== "PGRST116") throw selErr;
    current = toInt(cur?.qty, 0);
  }

  // Si no conocemos stock, permite hasta MAX_QTY_PER_LINE
  const stockCap = stock > 0 ? stock : MAX_QTY_PER_LINE;

  const desired = clamp(current + d, 0, stockCap);
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

/* =====================================================
   Listar líneas del carrito (con price/stock/imagen)
   - Clampea visualmente qty a stock/MAX_QTY_PER_LINE
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
    cartCache.items = new Map(lines.map((r) => [r.producto_id, toInt(r.qty, 0)]));
    cartCache.count = lines.reduce((s, r) => s + toInt(r.qty, 0), 0);
    cartCache.hydrated = true;
  }

  return lines.map((it) => {
    const p = prodMap.get(it.producto_id) || {};
    const price = Number(p.price_online ?? p.price_base ?? 0);
    const rawQty = toInt(it.qty, 0);
    const stock = toInt(p.stock, 0);
    const cap = stock > 0 ? stock : MAX_QTY_PER_LINE;
    const qty = clamp(rawQty, 0, cap); // clamp visual
    return {
      producto_id: it.producto_id,
      qty,
      nombre: p.nombre || "",
      marca: p.marca || "",
      codigo: p.codigo || "",
      price_base: p.price_base ?? null,
      price_online: p.price_online ?? null,
      price,
      stock: stock,
      main_image_url: coverMap.get(it.producto_id) || null,
      subtotal: price * qty,
    };
  });
}

/* ----------------------------------------------------
   Cambiar qty (CLAMPEA a stock; <=0 elimina la línea)
   Usa RPC cart_set_qty_clamped si existe (opcional)
-----------------------------------------------------*/
export async function updateCartQty(producto_id, qty) {
  const cartId = await ensureCart();
  const wantedRaw = toInt(qty, 0);

  // --------- FAST PATH RPC (opcional) ---------
  if (USE_RPC) {
    try {
      const { data, error } = await supabase.rpc("cart_set_qty_clamped", {
        p_cart_id: cartId,
        p_producto_id: producto_id,
        p_wanted: wantedRaw,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const newQty = toInt(row?.new_qty, 0);
      const newTotal = toInt(row?.new_total, 0);

      if (cartCache.id === cartId) {
        if (newQty <= 0) cartCache.items.delete(producto_id);
        else cartCache.items.set(producto_id, newQty);
        cartCache.count = newTotal;
        cartCache.hydrated = true;
      }
      return newTotal;
    } catch {
      // sigue al fallback
    }
  }

  // -------------- Fallback (cliente) --------------
  const stock = await getOnlineStock(producto_id);
  const cap = stock > 0 ? stock : MAX_QTY_PER_LINE;
  const clamped = clamp(wantedRaw, 0, cap);

  // si <=0 => eliminar
  if (clamped <= 0) return removeFromCart(producto_id);

  // qty previa (desde cache si hay)
  let prev = 0;
  if (cartCache.hydrated && cartCache.items.has(producto_id)) {
    prev = toInt(cartCache.items.get(producto_id), 0);
  } else {
    const { data: cur } = await supabase
      .from("cart_items")
      .select("qty")
      .eq("cart_id", cartId)
      .eq("producto_id", producto_id)
      .maybeSingle();
    prev = toInt(cur?.qty, 0);
  }

  if (prev === clamped) {
    return cartCache.count || (await cartCount(cartId));
  }

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
  return (data || []).reduce((s, r) => s + toInt(r.qty, 0), 0);
}
export const updateCartItemQty = updateCartQty;

/* ---------------------- eliminar / limpiar ---------------------- */
export async function removeFromCart(producto_id) {
  const cartId = await ensureCart();
  const prev = toInt(cartCache.items.get(producto_id), 0);

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

  return (data || []).reduce((s, r) => s + toInt(r.qty, 0), 0);
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

// Alias más expresivo
export { removeFromCart as removeCartItem };
