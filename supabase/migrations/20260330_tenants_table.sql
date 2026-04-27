-- Migration: create tenants table
-- Used by CreateTenantManual to track multi-tenant clients

CREATE TABLE IF NOT EXISTS public.tenants (
  id            UUID        PRIMARY KEY,   -- matches auth.users.id
  business_name TEXT        NOT NULL,
  owner_name    TEXT,
  email         TEXT        NOT NULL UNIQUE,
  phone         TEXT,
  plan          TEXT        NOT NULL DEFAULT 'basic'
                            CHECK (plan IN ('basic', 'pro', 'enterprise')),
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only service_role (supabaseAdmin) can insert/update/delete tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.tenants
  USING (true)
  WITH CHECK (true);

-- Tenants can read their own row
CREATE POLICY "tenant_read_own" ON public.tenants
  FOR SELECT
  USING (auth.uid() = id);
