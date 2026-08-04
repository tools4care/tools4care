-- The tenant-isolation policies added in 202608031/202608033 called
-- current_user_tenant_id() directly in the USING/WITH CHECK clause. That
-- makes Postgres re-invoke it as a per-row filter with a poor cardinality
-- estimate, which made the planner choose a nested-loop plan without index
-- usage for clientes_balance_v2 (1137 x 1137 row comparisons, ~15s,
-- timing out in production for real Tools4Care staff — confirmed via
-- EXPLAIN ANALYZE this conversation).
--
-- Wrapping the call in `(select ...)` lets Postgres evaluate it once per
-- statement as an InitPlan instead of once per row (the standard fix for
-- this class of RLS performance issue) — confirmed via EXPLAIN ANALYZE
-- this drops the same query from ~15400ms to ~29ms with identical results.

drop policy if exists "clientes_tenant_isolation" on clientes;
create policy "clientes_tenant_isolation" on clientes for all
  using (auth.role() = 'authenticated' and tenant_id is not distinct from (select current_user_tenant_id()))
  with check (auth.role() = 'authenticated' and tenant_id is not distinct from (select current_user_tenant_id()));

drop policy if exists "productos_tenant_isolation" on productos;
create policy "productos_tenant_isolation" on productos for all
  using (auth.role() = 'authenticated' and tenant_id is not distinct from (select current_user_tenant_id()))
  with check (auth.role() = 'authenticated' and tenant_id is not distinct from (select current_user_tenant_id()));

drop policy if exists "ventas_tenant_isolation" on ventas;
create policy "ventas_tenant_isolation" on ventas for all
  using (auth.role() = 'authenticated' and tenant_id is not distinct from (select current_user_tenant_id()))
  with check (auth.role() = 'authenticated' and tenant_id is not distinct from (select current_user_tenant_id()));
