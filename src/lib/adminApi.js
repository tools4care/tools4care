import { supabase } from "../supabaseClient";

// Thin client for the admin-users Edge Function — replaces the old
// src/supabaseAdmin.js (a service_role client that ran in the browser).
// The function itself checks the caller is an admin before doing anything.
async function callAdminUsers(action, payload) {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action, payload },
  });
  if (error) {
    const serverMessage = error.context?.body?.error;
    throw new Error(serverMessage || error.message || "Admin request failed");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function createUser({ email, password, nombre, rol }) {
  return callAdminUsers("create_user", { email, password, nombre, rol });
}

export function deleteUser(id) {
  return callAdminUsers("delete_user", { id });
}

export function updatePermissions({ id, descuento_max, modulos, locationIds, isAdminRole }) {
  return callAdminUsers("update_permissions", { id, descuento_max, modulos, locationIds, isAdminRole });
}

export function getLocationAccess(id) {
  return callAdminUsers("get_location_access", { id });
}

export function resetPassword({ id, email, password }) {
  return callAdminUsers("reset_password", { id, email, password });
}

export function createTenant({ businessName, ownerName, email, phone, plan }) {
  return callAdminUsers("create_tenant", { businessName, ownerName, email, phone, plan });
}
