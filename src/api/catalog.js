import { supabase } from "../../supabaseClient";

/**
 * Lee el catálogo online desde la vista vw_storefront_catalog.
 * - Aplica visible_online = true
 * - Opcionalmente filtra solo con stock > 0
 * - Calcula price = price_online ?? price_base
 */
export async function getStorefrontCatalog({
  onlyInStock = true,
  search = "",
  limit = 60,
} = {}) {
  let q = supabase
    .from("vw_storefront_catalog")
    .select("id,codigo,nombre,marca,price_base,price_online,descripcion,stock")
    .eq("visible_online", true);

  if (onlyInStock) q = q.gt("stock", 0);
  if (search) q = q.or(
    `nombre.ilike.%${search}%,codigo.ilike.%${search}%`
  );

  q = q.order("nombre", { ascending: true }).limit(limit);

  const { data, error } = await q;
  if (error) throw error;

  // Normalizamos precio para el UI
  return (data || []).map((p) => ({
    ...p,
    price: Number(p.price_online ?? p.price_base),
  }));
}
