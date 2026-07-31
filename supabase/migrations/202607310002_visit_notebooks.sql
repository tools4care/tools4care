-- Lightweight mobile order pad used while visiting a barbershop.
-- A notebook belongs to one location, barbershop and calendar day. Entries
-- are intentionally simple and may optionally reference a known client or
-- catalog product without requiring either one during fast field capture.

CREATE TABLE IF NOT EXISTS public.visit_notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,
  barberia_id uuid NOT NULL REFERENCES public.barberias(id) ON DELETE CASCADE,
  van_id uuid NOT NULL REFERENCES public.vans(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  visit_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/New_York')::date,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'ready', 'completed', 'archived')),
  general_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barberia_id, van_id, visit_date)
);

CREATE TABLE IF NOT EXISTS public.visit_notebook_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES public.visit_notebooks(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  barber_name text NOT NULL,
  producto_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  product_text text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  item_notes text,
  picked boolean NOT NULL DEFAULT false,
  sold boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visit_notebooks_lookup_idx
  ON public.visit_notebooks (van_id, visit_date DESC, barberia_id);
CREATE INDEX IF NOT EXISTS visit_notebook_items_notebook_idx
  ON public.visit_notebook_items (notebook_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS visit_notebook_items_client_idx
  ON public.visit_notebook_items (cliente_id)
  WHERE cliente_id IS NOT NULL;

ALTER TABLE public.visit_notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_notebook_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_notebooks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_notebook_items TO authenticated;

DROP POLICY IF EXISTS visit_notebooks_member_access ON public.visit_notebooks;
CREATE POLICY visit_notebooks_member_access
ON public.visit_notebooks
FOR ALL TO authenticated
USING (
  public.is_platform_admin()
  OR tenant_id IS NOT DISTINCT FROM (
    SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR tenant_id IS NOT DISTINCT FROM (
    SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS visit_notebook_items_member_access ON public.visit_notebook_items;
CREATE POLICY visit_notebook_items_member_access
ON public.visit_notebook_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.visit_notebooks notebook
    WHERE notebook.id = notebook_id
      AND (
        public.is_platform_admin()
        OR notebook.tenant_id IS NOT DISTINCT FROM (
          SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.visit_notebooks notebook
    WHERE notebook.id = notebook_id
      AND (
        public.is_platform_admin()
        OR notebook.tenant_id IS NOT DISTINCT FROM (
          SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()
        )
      )
  )
);
