-- Makes the manual tenant creator a real onboarding flow.
-- Existing installations remain the platform tenant; newly provisioned
-- businesses receive their own owner and initial store location.

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  owner_name text,
  email text NOT NULL UNIQUE,
  phone text,
  plan text NOT NULL DEFAULT 'basic'
    CHECK (plan IN ('basic', 'pro', 'enterprise')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenants
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS initial_location_id uuid,
  ADD COLUMN IF NOT EXISTS invitation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_status_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_status_check
      CHECK (status IN ('pending', 'active', 'suspended'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_uidx
  ON public.tenants (lower(slug))
  WHERE slug IS NOT NULL;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS platform_admin boolean NOT NULL DEFAULT false;

ALTER TABLE public.vans
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_initial_location_id_fkey;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_initial_location_id_fkey
  FOREIGN KEY (initial_location_id) REFERENCES public.vans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS usuarios_tenant_id_idx ON public.usuarios (tenant_id);
CREATE INDEX IF NOT EXISTS vans_tenant_id_idx ON public.vans (tenant_id);

-- Current admins predate tenant onboarding and remain platform operators.
UPDATE public.usuarios
SET platform_admin = true
WHERE rol = 'admin' AND tenant_id IS NULL;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE id = auth.uid()
      AND rol = 'admin'
      AND platform_admin = true
      AND activo IS DISTINCT FROM false
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- A tenant owner can read its own tenant. Platform admins can inspect all.
DROP POLICY IF EXISTS "tenant_read_own" ON public.tenants;
DROP POLICY IF EXISTS tenants_read_member_or_platform ON public.tenants;
CREATE POLICY tenants_read_member_or_platform
  ON public.tenants FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR id = (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid())
  );

-- Tenant provisioning is exclusively server-side through service_role.
DROP POLICY IF EXISTS tenants_service_role_full_access ON public.tenants;
CREATE POLICY tenants_service_role_full_access
  ON public.tenants FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Keep the app-facing location view tenant-aware. Platform admins see all;
-- tenant members see their tenant, and legacy users see legacy locations.
CREATE OR REPLACE VIEW public.v_vans_app
WITH (security_invoker = true)
AS
SELECT id, nombre_van AS nombre, placa, descripcion, activo, tipo, tenant_id
FROM public.vans;

GRANT SELECT ON public.v_vans_app TO authenticated;
