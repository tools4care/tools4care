-- Editable content for the public "/info" business-card landing page (QR
-- code on printed cards). Single row, JSONB so new fields don't need a
-- migration each time. Publicly readable (the landing page has no auth);
-- only admins can write, enforced by RLS.

CREATE TABLE IF NOT EXISTS public.business_info (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);

ALTER TABLE public.business_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read business info" ON public.business_info;
CREATE POLICY "Anyone can read business info" ON public.business_info
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can write business info" ON public.business_info;
CREATE POLICY "Admins can write business info" ON public.business_info
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));
