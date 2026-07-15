-- Backward-compatible location assignments.
-- No rows for a user means access to every active location. Once at least one
-- row exists, the application limits that user to active assigned locations.

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_vans_usuario_van_uidx
  ON public.usuarios_vans (usuario_id, van_id);

ALTER TABLE public.usuarios_vans ENABLE ROW LEVEL SECURITY;

-- Remove the legacy blanket policy; leaving it in place would make every
-- authenticated user pass all of the more specific policies below.
DROP POLICY IF EXISTS "authenticated app access" ON public.usuarios_vans;

CREATE OR REPLACE FUNCTION public.is_current_admin()
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
      AND activo IS DISTINCT FROM false
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_admin() TO authenticated;

DROP POLICY IF EXISTS usuarios_vans_read_own_or_admin ON public.usuarios_vans;
CREATE POLICY usuarios_vans_read_own_or_admin
  ON public.usuarios_vans
  FOR SELECT
  TO authenticated
  USING (usuario_id = auth.uid() OR public.is_current_admin());

DROP POLICY IF EXISTS usuarios_vans_admin_insert ON public.usuarios_vans;
CREATE POLICY usuarios_vans_admin_insert
  ON public.usuarios_vans
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS usuarios_vans_admin_update ON public.usuarios_vans;
CREATE POLICY usuarios_vans_admin_update
  ON public.usuarios_vans
  FOR UPDATE
  TO authenticated
  USING (public.is_current_admin())
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS usuarios_vans_admin_delete ON public.usuarios_vans;
CREATE POLICY usuarios_vans_admin_delete
  ON public.usuarios_vans
  FOR DELETE
  TO authenticated
  USING (public.is_current_admin());
