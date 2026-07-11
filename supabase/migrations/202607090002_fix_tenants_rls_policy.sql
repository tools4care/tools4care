-- 20260330_tenants_table.sql created a policy with no `TO` clause:
--   CREATE POLICY "service_role_full_access" ON public.tenants USING (true) WITH CHECK (true);
-- A policy with no `TO` defaults to role PUBLIC, not just service_role as the
-- migration's own comment claimed — so any authenticated (and potentially
-- anon) caller could insert/update/delete any tenant row. Recreate it scoped
-- to service_role only; the existing "tenant_read_own" SELECT policy is
-- untouched.
DROP POLICY IF EXISTS "service_role_full_access" ON tenants;

CREATE POLICY "service_role_full_access" ON tenants
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
