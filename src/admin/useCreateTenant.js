// src/admin/useCreateTenant.js
// Utility (not a hook) — uses supabaseAdmin (service_role) to:
//   1. Create auth user
//   2. Insert tenant row
//   3. Send magic-link welcome email
import { supabaseAdmin, isAdminConfigured } from '../supabaseAdmin'

/**
 * Creates a new tenant: auth user + tenants row + magic-link email.
 * Requires VITE_SUPABASE_SERVICE_KEY to be set.
 *
 * @param {{ businessName: string, ownerName: string, email: string, phone: string, plan: string }} params
 * @returns {{ userId: string, email: string }}
 */
export async function createTenant({ businessName, ownerName, email, phone, plan }) {
  if (!isAdminConfigured || !supabaseAdmin) {
    throw new Error('Admin key not configured — add VITE_SUPABASE_SERVICE_KEY to .env and Vercel')
  }

  // 1. Create auth user (email_confirm: true skips the confirmation email)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: Math.random().toString(36).slice(-12),
    email_confirm: true,
  })
  if (authError) throw new Error(`Auth error: ${authError.message}`)

  const userId = authData.user.id

  // 2. Insert row in tenants table
  const { error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      id: userId,
      business_name: businessName,
      owner_name: ownerName,
      email,
      phone: phone || null,
      plan,           // 'basic' | 'pro' | 'enterprise'
      active: true,
      created_at: new Date().toISOString(),
    })

  if (tenantError) {
    // Roll back auth user so we don't leave orphaned auth records
    await supabaseAdmin.auth.admin.deleteUser(userId)
    throw new Error(`Tenant DB error: ${tenantError.message}`)
  }

  // 3. Generate magic link — sends welcome email automatically
  const { error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError) {
    // Non-fatal: tenant was created, email just failed
    console.warn('Magic link warning:', linkError.message)
  }

  return { userId, email }
}
