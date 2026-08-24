-- Preserve legacy addresses as-is, but guarantee one stable JSON text shape
-- for every newly inserted or explicitly changed client address.
CREATE OR REPLACE FUNCTION public.canonicalize_client_address_text(p_address text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_trimmed text := NULLIF(btrim(p_address), '');
  v_value jsonb;
BEGIN
  IF v_trimmed IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_value := v_trimmed::jsonb;
    IF jsonb_typeof(v_value) <> 'object' THEN
      v_value := jsonb_build_object('calle', v_trimmed);
    END IF;
  EXCEPTION WHEN others THEN
    v_value := jsonb_build_object('calle', v_trimmed);
  END;

  RETURN jsonb_build_object(
    'calle', regexp_replace(btrim(COALESCE(v_value->>'calle', '')), '\s+', ' ', 'g'),
    'ciudad', regexp_replace(btrim(COALESCE(v_value->>'ciudad', '')), '\s+', ' ', 'g'),
    'estado', upper(regexp_replace(btrim(COALESCE(v_value->>'estado', '')), '\s+', ' ', 'g')),
    'zip', regexp_replace(btrim(COALESCE(v_value->>'zip', '')), '\s+', ' ', 'g')
  )::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonicalize_changed_client_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.direccion IS DISTINCT FROM OLD.direccion THEN
    NEW.direccion := public.canonicalize_client_address_text(NEW.direccion);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_canonical_address ON public.clientes;
CREATE TRIGGER trg_clientes_canonical_address
BEFORE INSERT OR UPDATE OF direccion ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.canonicalize_changed_client_address();
