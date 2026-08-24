-- Internal reporting and A/R views must enforce the querying user's table
-- permissions and RLS policies instead of inheriting the view owner's rights.
-- Public catalog/order views are intentionally handled separately.

alter view public.clientes_con_balance set (security_invoker = true);
alter view public.pagos_local set (security_invoker = true);
alter view public.productos_base_v set (security_invoker = true);
alter view public.productos_mas_vendidos set (security_invoker = true);
alter view public.productos_vendidos_por_mes set (security_invoker = true);
alter view public.stock_van_qty_v set (security_invoker = true);
alter view public.v_acuerdos_cliente set (security_invoker = true);
alter view public.v_cxc_cargos_con_saldo set (security_invoker = true);
alter view public.v_cxc_resumen_cliente set (security_invoker = true);
alter view public.v_cxc_scores set (security_invoker = true);
alter view public.v_ar_trend_monthly set (security_invoker = true);
alter view public.v_barberia_resumen set (security_invoker = true);
alter view public.v_cxc_aging set (security_invoker = true);
alter view public.v_cxc_aging_by_client set (security_invoker = true);
alter view public.v_cxc_cliente_saldo set (security_invoker = true);
alter view public.v_cxc_leaderboard set (security_invoker = true);
alter view public.v_cxc_movimientos set (security_invoker = true);
alter view public.v_cxc_policy_limits set (security_invoker = true);
alter view public.v_cxc_saldos_por_cliente set (security_invoker = true);
alter view public.v_detalle_ventas_con_devoluciones set (security_invoker = true);
alter view public.v_score_distribution set (security_invoker = true);
alter view public.v_ventas_con_cliente set (security_invoker = true);
alter view public.ventas_local set (security_invoker = true);
alter view public.vw_expected_por_dia_van set (security_invoker = true);
alter view public.vw_pagos_breakdown set (security_invoker = true);
alter view public.vw_pagos_breakdown_v2 set (security_invoker = true);
alter view public.vw_ventas_breakdown_v2 set (security_invoker = true);
