-- Security hardening for Supabase advisor issue: rls_disabled_in_public.
-- Enables RLS on every public base table that does not have it yet and
-- keeps the authenticated app working through authenticated-only policies.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
  END LOOP;
END $$;

DO $$
DECLARE
  r RECORD;
  policy_name TEXT;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    policy_name := 'authenticated app access';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = r.table_name
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        policy_name,
        r.table_name
      );
    END IF;
  END LOOP;
END $$;

-- The old driver expense policy was effectively public. Replace it with an
-- authenticated-only policy while keeping the existing app behavior intact.
DROP POLICY IF EXISTS "gastos_conductor_all" ON public.gastos_conductor;
DROP POLICY IF EXISTS "authenticated manage gastos_conductor" ON public.gastos_conductor;

CREATE POLICY "authenticated manage gastos_conductor"
  ON public.gastos_conductor
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.gastos_conductor
  ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

UPDATE public.gastos_conductor AS g
SET usuario_id = c.usuario_id
FROM public.cierres_dia AS c
WHERE g.usuario_id IS NULL
  AND g.cierre_id = c.id
  AND c.usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gastos_conductor_usuario_id_idx
  ON public.gastos_conductor(usuario_id);

