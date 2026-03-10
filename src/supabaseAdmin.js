// src/supabaseAdmin.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin Supabase client — uses the service_role key to:
//   • Create users  (bypasses email-confirmation requirement)
//   • Delete users  (removes auth.users record)
//   • Ban / unban   (real auth-level block)
//
// ⚠️  SETUP REQUIRED:
//   1. Go to  Supabase Dashboard → Project Settings → API
//   2. Copy   "service_role" secret key
//   3. Add to .env:  VITE_SUPABASE_SERVICE_KEY=eyJ...
//   4. Add the same variable in Vercel → Project → Settings → Environment Variables
//   5. Redeploy
//
// The service_role key bypasses RLS — only used in the admin user-management page.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const url        = import.meta.env.VITE_SUPABASE_URL        || "https://gvloygqbavibmpakzdma.supabase.co";
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || "";

/** Admin client (null if service key is not configured) */
export const supabaseAdmin = serviceKey
  ? createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

/** True when VITE_SUPABASE_SERVICE_KEY is present in env */
export const isAdminConfigured = !!serviceKey;
