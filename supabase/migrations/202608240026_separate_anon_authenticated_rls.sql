-- Separate anonymous compatibility policies from the standard authenticated
-- ALL policies. This preserves effective access while avoiding overlap.

alter policy "cuotas_all"
  on public.cuotas_acuerdo
  to anon;

alter policy "sr_all"
  on public.stock_reservations
  to anon;

alter policy "sesion_all"
  on public.usuario_sesion
  to anon;

alter policy "ventas_pendientes_delete"
  on public.ventas_pendientes
  to anon;
alter policy "ventas_pendientes_insert"
  on public.ventas_pendientes
  to anon;
alter policy "ventas_pendientes_select"
  on public.ventas_pendientes
  to anon;
alter policy "ventas_pendientes_update"
  on public.ventas_pendientes
  to anon;

drop policy if exists "tiers_modify_admin"
  on public.credit_policy_tiers;
alter policy "tiers_select"
  on public.credit_policy_tiers
  to anon;

drop policy if exists "ajustes_insert_admin"
  on public.cxc_ajustes_log;
alter policy "ajustes_select"
  on public.cxc_ajustes_log
  to anon;
