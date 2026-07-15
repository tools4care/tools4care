-- Treat VANs, physical stores and the online store as explicit inventory
-- locations. Existing VAN behavior remains the default.

ALTER TABLE public.vans
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'van';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vans_tipo_check'
      AND conrelid = 'public.vans'::regclass
  ) THEN
    ALTER TABLE public.vans
      ADD CONSTRAINT vans_tipo_check CHECK (tipo IN ('van', 'store', 'online'));
  END IF;
END $$;

UPDATE public.vans
SET tipo = 'online'
WHERE lower(coalesce(nombre_van, '')) LIKE '%online%';

INSERT INTO public.vans (nombre_van, placa, descripcion, activo, tipo)
SELECT 'Physical Store', 'STORE', 'Main physical retail store', true, 'store'
WHERE NOT EXISTS (
  SELECT 1 FROM public.vans WHERE tipo = 'store'
);

CREATE OR REPLACE VIEW public.v_vans_app
WITH (security_invoker = true)
AS
SELECT id, nombre_van AS nombre, placa, descripcion, activo, tipo
FROM public.vans;

GRANT SELECT ON public.v_vans_app TO authenticated;

CREATE TABLE IF NOT EXISTS public.location_settings (
  location_id uuid PRIMARY KEY REFERENCES public.vans(id) ON DELETE CASCADE,
  tax_enabled boolean NOT NULL DEFAULT false,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_name text NOT NULL DEFAULT 'Sales Tax',
  tax_included boolean NOT NULL DEFAULT false,
  customer_display_enabled boolean NOT NULL DEFAULT false,
  receipt_printing_enabled boolean NOT NULL DEFAULT true,
  cash_drawer_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.location_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.location_settings TO authenticated;

DROP POLICY IF EXISTS location_settings_authenticated_select ON public.location_settings;
CREATE POLICY location_settings_authenticated_select
ON public.location_settings FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS location_settings_authenticated_insert ON public.location_settings;
CREATE POLICY location_settings_authenticated_insert
ON public.location_settings FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS location_settings_authenticated_update ON public.location_settings;
CREATE POLICY location_settings_authenticated_update
ON public.location_settings FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

INSERT INTO public.location_settings (location_id)
SELECT id FROM public.vans WHERE tipo = 'store'
ON CONFLICT (location_id) DO NOTHING;
