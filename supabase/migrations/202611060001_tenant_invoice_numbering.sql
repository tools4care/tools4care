-- Tenant pilot §5: each tenant's invoice numbering starts at 1 on its own,
-- instead of continuing Tools4Care's own global sequence
-- (ventas_factura_seq_seq, currently past 4380).
--
-- The platform owner's own business (ventas.tenant_id = null) is untouched:
-- factura_seq keeps coming from its existing column default
-- (nextval('ventas_factura_seq_seq')) exactly as before. A real tenant_id
-- instead gets its own row in tenant_invoice_counters, incremented
-- atomically via the UPSERT below (safe under concurrent sales — the
-- ON CONFLICT DO UPDATE takes a row lock, same guarantee nextval() gives
-- the legacy sequence).

CREATE TABLE IF NOT EXISTS public.tenant_invoice_counters (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  next_seq integer NOT NULL DEFAULT 1
);

ALTER TABLE public.tenant_invoice_counters ENABLE ROW LEVEL SECURITY;
-- Only the trigger function below (SECURITY DEFINER) ever touches this
-- table — no app-facing policy needed, so RLS alone (default deny) is
-- enough.

CREATE OR REPLACE FUNCTION public.generar_numero_factura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_seq integer;
BEGIN
  -- Resolved independently of trigger firing order against
  -- trg_ventas_stamp_tenant — same function it uses, so this never depends
  -- on NEW.tenant_id already being set by the time this trigger runs.
  v_tenant_id := public.current_user_tenant_id();

  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.tenant_invoice_counters (tenant_id, next_seq)
    VALUES (v_tenant_id, 2)
    ON CONFLICT (tenant_id) DO UPDATE SET next_seq = tenant_invoice_counters.next_seq + 1
    RETURNING next_seq - 1 INTO v_seq;
    NEW.factura_seq := v_seq;
  END IF;
  -- Platform staff (tenant_id null) keep whatever ventas.factura_seq's
  -- column default (the global sequence) already set.

  NEW.numero_factura :=
    'F-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(NEW.factura_seq::text, 6, '0');
  RETURN NEW;
END;
$function$;
