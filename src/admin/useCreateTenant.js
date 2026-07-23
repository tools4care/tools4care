// src/admin/useCreateTenant.js
// Utility (not a hook) — calls the admin-users Edge Function to:
//   1. Create auth user
//   2. Insert tenant row
//   3. Send magic-link welcome email
// (Runs server-side now — no service_role key in the browser.)
import { createTenant as createTenantRequest } from '../lib/adminApi'

/**
 * Creates a new tenant: auth user + tenants row + magic-link email.
 *
 * @param {{ businessName: string, ownerName: string, email: string, phone: string, plan: string }} params
 * @returns {{ userId: string, email: string }}
 */
export async function createTenant({ businessName, ownerName, email, phone, plan }) {
  return createTenantRequest({ businessName, ownerName, email, phone, plan })
}
