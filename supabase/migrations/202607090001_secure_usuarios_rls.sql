-- Closes the self-privilege-escalation hole found in the 2026-07 security audit:
-- `usuarios` had the blanket `USING (true) WITH CHECK (true)` policy from
-- 202606250002_secure_public_tables_and_driver_expenses.sql, PLUS (found only
-- by inspecting the live production table directly — these were never in any
-- tracked migration, created by hand in Supabase Studio) three more named
-- policies that independently allow the same self-escalation:
--   * "Usuarios pueden actualizar su propio perfil" — FOR UPDATE, USING
--     (auth.uid() = id) with NO explicit WITH CHECK, so Postgres reuses the
--     USING clause as the check — which never blocks changing rol/activo.
--   * "Admins pueden actualizar cualquier perfil" — same missing-WITH-CHECK
--     shape, scoped to admins (harmless on its own, but redundant/replaced).
--   * "Usuarios pueden ver todos los perfiles" — FOR SELECT USING (true).
-- All four must be dropped together — Postgres OWNS policies together as OR,
-- so leaving any one of them active fully defeats the new restrictive ones
-- below. Before this fix, any authenticated user (e.g. role "vendedor") could
-- call
--   supabase.from('usuarios').update({ rol: 'admin' }).eq('id', myId)
-- directly and self-promote, bypassing the UI's AdminRoute entirely.
--
-- Design notes:
--   * A user must always be able to SELECT/UPDATE their OWN row (the app
--     auto-provisions a `usuarios` row on first login via the regular client
--     — see src/UsuarioContext.jsx — and the account page lets a user edit
--     their own name/etc).
--   * A user must NEVER be able to change their own (or anyone else's) `rol`,
--     `activo`, `descuento_max`, or `modulos` unless they are already admin.
--     The WITH CHECK subqueries below compare the proposed new row against the
--     row's current value at the start of the statement, which is how you
--     express "this column must not change" in Postgres RLS without a trigger.
--   * Self-provisioning INSERT (first login) is only allowed to create a
--     baseline vendedor account — it cannot insert itself as admin/inactive.

CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rol = 'admin' FROM usuarios WHERE id = auth.uid()), false);
$$;

DROP POLICY IF EXISTS "authenticated app access" ON usuarios;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON usuarios;
DROP POLICY IF EXISTS "Admins pueden actualizar cualquier perfil" ON usuarios;
DROP POLICY IF EXISTS "Usuarios pueden ver todos los perfiles" ON usuarios;

CREATE POLICY "select own or admin" ON usuarios
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "self-provision baseline vendedor account" ON usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR (id = auth.uid() AND rol = 'vendedor' AND activo = true)
  );

CREATE POLICY "update own profile without escalating, or admin" ON usuarios
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (
    is_admin()
    OR (
      id = auth.uid()
      AND rol = (SELECT u.rol FROM usuarios u WHERE u.id = auth.uid())
      AND activo = (SELECT u.activo FROM usuarios u WHERE u.id = auth.uid())
      AND descuento_max IS NOT DISTINCT FROM (SELECT u.descuento_max FROM usuarios u WHERE u.id = auth.uid())
      AND modulos IS NOT DISTINCT FROM (SELECT u.modulos FROM usuarios u WHERE u.id = auth.uid())
    )
  );

CREATE POLICY "admin deletes users" ON usuarios
  FOR DELETE TO authenticated
  USING (is_admin());
