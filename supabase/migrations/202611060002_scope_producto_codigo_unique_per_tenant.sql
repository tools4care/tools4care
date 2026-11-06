-- productos.codigo had a global UNIQUE(codigo) constraint — RLS already
-- scopes the client-side duplicate check to the caller's own tenant, but
-- constraints are enforced against the whole physical table regardless of
-- RLS, so a tenant adding a product with a code that happened to match ANY
-- other tenant's (including Tools4Care's own ~8500-product catalog) was
-- rejected with "code/UPC already in use" even though, from their own
-- view, nothing was a duplicate.
--
-- Replaced with a per-tenant unique constraint. NULLS NOT DISTINCT keeps
-- Tools4Care's own business (tenant_id = null) exactly as strict as
-- before — without it, Postgres treats every NULL as distinct, which
-- would silently stop enforcing uniqueness among Tools4Care's own codes.

alter table public.productos
  drop constraint if exists productos_codigo_key;

alter table public.productos
  add constraint productos_tenant_codigo_key
  unique nulls not distinct (tenant_id, codigo);
