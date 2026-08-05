import { supabase } from "../supabaseClient";

// Thin client for the admin-users Edge Function — replaces the old
// src/supabaseAdmin.js (a service_role client that ran in the browser).
// The function itself checks the caller is an admin before doing anything.
async function callAdminUsers(action, payload) {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action, payload },
  });
  if (error) {
    let serverMessage = error.context?.body?.error;
    if (!serverMessage && typeof error.context?.clone === "function") {
      try {
        const body = await error.context.clone().json();
        serverMessage = body?.error;
      } catch {
        // The function may return a non-JSON gateway error.
      }
    }
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

export function listTenants() {
  return callAdminUsers("list_tenants", {});
}

export function resendTenantInvite(tenantId) {
  return callAdminUsers("resend_tenant_invite", { tenantId });
}

export function setTenantStatus(tenantId, status) {
  return callAdminUsers("set_tenant_status", { tenantId, status });
}

export function completeTenantOnboarding() {
  return callAdminUsers("complete_tenant_onboarding", {});
}

export function updateTenant(tenantId, { businessName, ownerName, phone, plan }) {
  return callAdminUsers("update_tenant", { tenantId, businessName, ownerName, phone, plan });
}

export function deleteTenant(tenantId, confirmBusinessName) {
  return callAdminUsers("delete_tenant", { tenantId, confirmBusinessName });
}
