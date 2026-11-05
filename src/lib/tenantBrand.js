// src/lib/tenantBrand.js
// Resolves the seller identity (business name, address, phone, email) that
// should appear on an invoice, SMS, or any other customer-facing document.
// A sale/client with tenant_id = null is Tools4Care's own business (the
// platform owner) and always keeps the Tools4Care identity below; a tenant
// sale resolves to that tenant's own `tenants` row, falling back to
// Tools4Care field-by-field for anything the tenant hasn't filled in yet.
import { supabase } from "../supabaseClient";

export const TOOLS4CARE_BRAND = {
  nombre: "TOOLS4CARE",
  direccion: "108 Lafayette St, Salem, MA 01970",
  telefono: "(978) 594-1624",
  email: "soporte@tools4care.com",
  logoUrl: "",
};

const cache = new Map();

export async function resolveTenantBrand(tenantId) {
  if (!tenantId) return TOOLS4CARE_BRAND;
  if (cache.has(tenantId)) return cache.get(tenantId);

  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("business_name,address,phone,email,logo_url")
        .eq("id", tenantId)
        .maybeSingle();
      if (error || !data) return TOOLS4CARE_BRAND;
      return {
        nombre: data.business_name?.trim() || TOOLS4CARE_BRAND.nombre,
        direccion: data.address?.trim() || TOOLS4CARE_BRAND.direccion,
        telefono: data.phone?.trim() || TOOLS4CARE_BRAND.telefono,
        email: data.email?.trim() || TOOLS4CARE_BRAND.email,
        logoUrl: data.logo_url?.trim() || "",
      };
    } catch {
      return TOOLS4CARE_BRAND;
    }
  })();

  cache.set(tenantId, promise);
  return promise;
}
