-- Format-independent customer phone search.
-- Examples treated as equivalent:
--   +1 (978) 601-0824, 978-601-0824, 9786010824, 6010824

CREATE OR REPLACE FUNCTION public.buscar_clientes_por_telefono(
  p_busqueda text,
  p_limite integer DEFAULT 100
)
RETURNS TABLE(cliente_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT regexp_replace(COALESCE(p_busqueda, ''), '[^0-9]', '', 'g') AS digits
  ),
  normalized AS (
    SELECT
      digits,
      CASE
        WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN right(digits, 10)
        ELSE digits
      END AS local_digits
    FROM input
  )
  SELECT c.id
  FROM public.clientes AS c
  CROSS JOIN normalized AS n
  WHERE length(n.local_digits) >= 3
    AND (
      regexp_replace(COALESCE(c.telefono, ''), '[^0-9]', '', 'g') LIKE '%' || n.digits || '%'
      OR
      CASE
        WHEN length(regexp_replace(COALESCE(c.telefono, ''), '[^0-9]', '', 'g')) = 11
          AND left(regexp_replace(COALESCE(c.telefono, ''), '[^0-9]', '', 'g'), 1) = '1'
        THEN right(regexp_replace(COALESCE(c.telefono, ''), '[^0-9]', '', 'g'), 10)
        ELSE regexp_replace(COALESCE(c.telefono, ''), '[^0-9]', '', 'g')
      END LIKE '%' || n.local_digits || '%'
    )
  ORDER BY
    CASE
      WHEN right(regexp_replace(COALESCE(c.telefono, ''), '[^0-9]', '', 'g'), 10) = right(n.local_digits, 10)
      THEN 0 ELSE 1
    END,
    c.nombre
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 250);
$$;

REVOKE ALL ON FUNCTION public.buscar_clientes_por_telefono(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_clientes_por_telefono(text, integer) TO authenticated;

COMMENT ON FUNCTION public.buscar_clientes_por_telefono(text, integer)
IS 'Finds customer IDs by phone digits regardless of punctuation or optional US country code.';
