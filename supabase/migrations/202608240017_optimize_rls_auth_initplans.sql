-- Evaluate request identity once per statement instead of once per row.
-- Policy commands, roles, USING rules, and WITH CHECK rules stay unchanged.

do $$
declare
  policy_row record;
  using_expr text;
  check_expr text;
  statement text;
begin
  for policy_row in
    with targets(table_name, policy_name) as (
      values
        ('credit_score_history', 'credit_score_history_staff_read'),
        ('movimientos_stock', 'Usuarios autenticados pueden leer movimientos de stock'),
        ('movimientos_stock', 'Usuarios autenticados pueden agregar movimientos de stock'),
        ('carts', 'carts_insert_own'),
        ('carts', 'carts_select_own'),
        ('carts', 'carts_update_own'),
        ('carts', 'carts_delete_own'),
        ('cart_items', 'cart_items_rw_by_cart'),
        ('carts', 'carts_access'),
        ('cart_items', 'cart_items_access'),
        ('online_product_meta', 'meta_select'),
        ('cart_items', 'cart_items_auth_all'),
        ('store_customers', 'own customer read'),
        ('store_customers', 'own customer upsert'),
        ('store_customers', 'own customer update'),
        ('discount_codes', 'discounts-write-admin'),
        ('stock_van', 'stock_van_sel'),
        ('stock_van', 'stock_van_ins'),
        ('stock_van', 'stock_van_upd'),
        ('stock_van', 'stock_van_del'),
        ('stock_van', 'stock_van_select_by_member'),
        ('stock_van', 'stock_van_insert_by_member'),
        ('configuraciones_comisiones', 'Admins pueden ver configuraciones'),
        ('configuraciones_comisiones', 'Admins pueden insertar configuraciones'),
        ('configuraciones_comisiones', 'Admins pueden actualizar configuraciones'),
        ('comisiones_calculadas', 'Admins pueden ver comisiones'),
        ('comisiones_calculadas', 'Vendedores pueden ver sus comisiones'),
        ('subscription_planes', 'auth read planes'),
        ('subscription_planes', 'auth write planes'),
        ('subscription_clientes', 'auth read subs'),
        ('subscription_clientes', 'auth write subs'),
        ('subscription_entregas', 'auth read entregas'),
        ('subscription_entregas', 'auth write entregas'),
        ('alquileres', 'auth read alquileres'),
        ('alquileres', 'auth write alquileres'),
        ('alquiler_pagos', 'auth read alquiler_pagos'),
        ('alquiler_pagos', 'auth write alquiler_pagos'),
        ('location_settings', 'location_settings_authenticated_insert'),
        ('location_settings', 'location_settings_authenticated_update'),
        ('usuarios_vans', 'usuarios_vans_read_own_or_admin'),
        ('ar_payment_batches', 'ar_payment_batches_read_own'),
        ('user_active_sessions', 'Users manage their own active session'),
        ('business_info', 'Admins can write business info'),
        ('tenants', 'tenants_read_member_or_platform'),
        ('visit_notebooks', 'visit_notebooks_member_access'),
        ('visit_notebook_items', 'visit_notebook_items_member_access'),
        ('productos', 'productos_tenant_isolation'),
        ('vans', 'vans_tenant_isolation'),
        ('vans', 'vans_tenant_write')
    )
    select
      c.oid as table_oid,
      c.relname as table_name,
      p.polname as policy_name,
      pg_get_expr(p.polqual, p.polrelid) as using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from targets target
    join pg_class c on c.relname = target.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_policy p on p.polrelid = c.oid and p.polname = target.policy_name
  loop
    using_expr := policy_row.using_expr;
    check_expr := policy_row.check_expr;

    if using_expr is not null then
      using_expr := replace(using_expr, 'auth.uid()', '(select auth.uid())');
      using_expr := replace(using_expr, 'auth.role()', '(select auth.role())');
      using_expr := replace(using_expr, 'auth.jwt()', '(select auth.jwt())');
      using_expr := replace(
        using_expr,
        'current_setting(''request.headers''::text, true)',
        '(select current_setting(''request.headers''::text, true))'
      );
    end if;

    if check_expr is not null then
      check_expr := replace(check_expr, 'auth.uid()', '(select auth.uid())');
      check_expr := replace(check_expr, 'auth.role()', '(select auth.role())');
      check_expr := replace(check_expr, 'auth.jwt()', '(select auth.jwt())');
      check_expr := replace(
        check_expr,
        'current_setting(''request.headers''::text, true)',
        '(select current_setting(''request.headers''::text, true))'
      );
    end if;

    statement := format(
      'alter policy %I on public.%I',
      policy_row.policy_name,
      policy_row.table_name
    );
    if using_expr is not null then
      statement := statement || format(' using (%s)', using_expr);
    end if;
    if check_expr is not null then
      statement := statement || format(' with check (%s)', check_expr);
    end if;

    execute statement;
  end loop;
end;
$$;
