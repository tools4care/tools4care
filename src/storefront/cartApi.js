// src/storefront/cartApi.js
import { supabase } from "../supabaseClient";
import { getAnonId } from "../utils/anon";

/* ---------------------------- helpers de stock ---------------------------- */

async function getOnlineVanId() {
  const { data, error } = await supabase
    .from("vans")
    .select("id, nombre_van")
    .ilike("nombre_van", "%online%")
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function getStockFor(productoId) {
  const vanId = await getOnlineVanId();
  if (!vanId) return 0;

  const { data, error } = await supabase
    .from("stock_van")
    .select("cantidad")
    .eq("van_id", vanId)
    .eq("producto_id", productoId)
    .maybeSingle();

  if (error) throw error;
  return Number(data?.cantidad ?? 0);
}

/* ------------------------------ helpers carrito ------------------------------ */

export async function ensureCart() {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;
  const col = userId ? "user_id" : "anon_id";
  const val = userId ?? getAnonId();

  // buscar existente
  const { data: found, error: selErr } = await supabase
    .from("carts")
    .select("id")
    .eq(col, val)
    .maybeSingle();

  if (!selErr && found?.id) return found.id;
  if (selErr && selErr.code !== "PGRST116") throw selErr;

  // crear
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

async function getCartLineQty(cartId, productoId) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("qty")
    .eq("cart_id", cartId)
    .eq("producto_id", productoId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.qty ?? 0);
}

/**
 * Ajusta una línea del carrito a la cantidad deseada, respetando el stock.
 * Si desiredQty <= 0 -> elimina la línea.
 * Devuelve { appliedQty, maxStock }.
 */
async function setCartQtyClamped(cartId, productoId, desiredQty) {
  const maxStock = await getStockFor(productoId);
  const nextQty = Math.max(0, Math.min(Number(desiredQty || 0), maxStock));

  if (nextQty <= 0) {
    // eliminar si existe
    await supabase
      .from("cart_items")
      .delete()
      .eq("cart_id", cartId)
      .eq("producto_id", productoId);
    return { appliedQty: 0, maxStock };
  }

  // upsert con clave única (cart_id, producto_id)
  const { error } = await supabase
    .from("cart_items")
    .upsert(
      { cart_id: cartId, producto_id: productoId, qty: nextQty },
      { onConflict: "cart_id,producto_id" }
    );
  if (error) throw error;

  return { appliedQty: nextQty, maxStock };
}

/* --------------------------------- API usada -------------------------------- */

export async function addToCart(product, inc = 1) {
  const cartId = await ensureCart();
  const current = await getCartLineQty(cartId, product.id);
  const { appliedQty, maxStock } = await setCartQtyClamped(
    cartId,
    product.id,
    current + Number(inc || 0)
  );

  if (appliedQty < current + Number(inc || 0)) {
    // Se topó con el stock: mostrará alerta el caller si lo desea,
    // aquí solo devolvemos info.
    console.warn(
      `addToCart: limitado por stock. solicitado=${current + Number(inc || 0)} aplicado=${appliedQty} stock=${maxStock}`
    );
  }

  return await cartCount(cartId);
}

export async function updateCartItemQty(productoId, nextQty) {
  const cartId = await ensureCart();
  const { appliedQty, maxStock } = await setCartQtyClamped(
    cartId,
    productoId,
    Number(nextQty || 0)
  );
  return { appliedQty, maxStock };
}

export async function removeCartItem(productoId) {
  const cartId = await ensureCart();
  await supabase
    .from("cart_items")
    .delete()
    .eq("cart_id", cartId)
    .eq("producto_id", productoId);
  return await cartCount(cartId);
}

export async function listCartItems(cartId) {
  const cid = cartId || (await ensureCart());
  const { data: items, error } = await supabase
    .from("cart_items")
    .select("producto_id, qty")
    .eq("cart_id", cid);
  if (error) throw error;

  const ids = (items || []).map((i) => i.producto_id);
  if (!ids.length) return [];

  // Datos del producto + precio
  const { data: productos, error: pErr } = await supabase
    .from("productos")
    .select("id, codigo, nombre, marca, precio")
    .in("id", ids);
  if (pErr) throw pErr;
  const mapProd = new Map((productos || []).map((p) => [p.id, p]));

  // Imagen principal (opcional)
  const { data: covers, error: cErr } = await supabase
    .from("product_main_image_v")
    .select("producto_id, main_image_url")
    .in("producto_id", ids);
  if (cErr) throw cErr;
  const mapImg = new Map((covers || []).map((c) => [c.producto_id, c.main_image_url]));

  // También traemos stock actual y, si hace falta, bajamos qty en DB
  const result = [];
  for (const it of items) {
    const p = mapProd.get(it.producto_id);
    if (!p) continue;

    const stock = await getStockFor(it.producto_id);
    let qty = Number(it.qty || 0);

    if (qty > stock) {
      // clamp en DB para evitar oversell si el usuario dejó el carrito abierto
      await setCartQtyClamped(cid, it.producto_id, stock);
      qty = stock;
    }

    const price = Number(p.precio || 0);
    result.push({
      producto_id: it.producto_id,
      nombre: p.nombre,
      marca: p.marca ?? null,
      codigo: p.codigo ?? null,
      price,
      qty,
      subtotal: qty * price,
      main_image_url: mapImg.get(it.producto_id) || null,
    });
  }

  return result;
}

export async function cartCount(cartId) {
  const cid = cartId || (await ensureCart());
  const { data, error } = await supabase
    .from("cart_items")
    .select("qty", { count: "exact", head: false })
    .eq("cart_id", cid);

  if (error) throw error;
  return (data || []).reduce((a, r) => a + Number(r.qty || 0), 0);
}
