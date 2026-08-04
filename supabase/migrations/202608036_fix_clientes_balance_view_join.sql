-- Same class of fix as 202608035, one layer up: clientes_balance_v2 and
-- clientes_balance both LEFT JOIN v_cxc_cliente_detalle directly, which
-- creates another RLS-protected-scan-vs-RLS-protected-scan join that
-- Postgres plans as a Nested Loop (same misestimate issue). Wrapping the
-- join target in its own MATERIALIZED CTE forces it to be computed once
-- and Hash-Joined against `clientes` — confirmed via EXPLAIN ANALYZE this
-- brings the real page-1 load down to ~400ms (from a 30s timeout).

create or replace view clientes_balance_v2
with (security_invoker = true)
as
 WITH cxc_data AS MATERIALIZED (
   SELECT * FROM v_cxc_cliente_detalle
 )
 SELECT c.id,
    c.nombre,
    c.telefono,
    c.email,
    c.negocio,
    c.direccion,
        CASE
            WHEN c.direccion IS NULL OR c.direccion = ''::text THEN NULL::text
            WHEN c.direccion ~~ '{%'::text OR c.direccion ~~ '"%'::text THEN COALESCE(c.direccion::jsonb ->> 'calle'::text, c.direccion)
            ELSE c.direccion
        END AS dir_calle,
        CASE
            WHEN c.direccion IS NULL OR c.direccion = ''::text THEN NULL::text
            WHEN c.direccion ~~ '{%'::text OR c.direccion ~~ '"%'::text THEN c.direccion::jsonb ->> 'ciudad'::text
            ELSE NULL::text
        END AS dir_ciudad,
        CASE
            WHEN c.direccion IS NULL OR c.direccion = ''::text THEN NULL::text
            WHEN c.direccion ~~ '{%'::text OR c.direccion ~~ '"%'::text THEN c.direccion::jsonb ->> 'estado'::text
            ELSE NULL::text
        END AS dir_estado,
        CASE
            WHEN c.direccion IS NULL OR c.direccion = ''::text THEN NULL::text
            WHEN c.direccion ~~ '{%'::text OR c.direccion ~~ '"%'::text THEN c.direccion::jsonb ->> 'zip'::text
            ELSE NULL::text
        END AS dir_zip,
    regexp_replace(COALESCE(c.telefono, ''::text), '[^0-9]'::text, ''::text, 'g'::text) AS tel_norm,
    COALESCE(cxc.saldo, 0::numeric) AS balance,
    c.tenant_id,
    c.client_number
   FROM clientes c
     LEFT JOIN cxc_data cxc ON c.id = cxc.cliente_id;

create or replace view clientes_balance
with (security_invoker = true)
as
 WITH cxc_data AS MATERIALIZED (
   SELECT * FROM v_cxc_cliente_detalle
 )
 SELECT c.id,
    c.nombre,
    c.telefono,
    c.email,
    c.negocio,
    c.direccion,
    COALESCE(v.saldo, 0::numeric) AS balance,
    regexp_replace(COALESCE(c.telefono, ''::text), '\D'::text, ''::text, 'g'::text) AS tel_norm,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb
            ELSE NULL::jsonb
        END AS direccion_json,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb ->> 'calle'::text
            ELSE NULL::text
        END AS dir_calle,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb ->> 'ciudad'::text
            ELSE NULL::text
        END AS dir_ciudad,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb ->> 'estado'::text
            ELSE NULL::text
        END AS dir_estado,
        CASE
            WHEN c.direccion ~ '^\s*\{'::text THEN c.direccion::jsonb ->> 'zip'::text
            ELSE NULL::text
        END AS dir_zip
   FROM clientes c
     LEFT JOIN cxc_data v ON v.cliente_id = c.id;
