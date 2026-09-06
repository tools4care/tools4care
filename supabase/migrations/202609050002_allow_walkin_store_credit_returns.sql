-- A walk-in sale has no original cliente_id. Allow a staff member to attach
-- that return to a same-tenant temporary/customer account only for store
-- credit exchanges; registered-customer returns still require an exact match.
begin;

do $$
declare
  fn text;
  patched text;
begin
  select pg_get_functiondef(
    'public.procesar_devolucion_transaccional(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into fn;

  if fn is null then
    raise exception 'Return function definition not found';
  end if;

  patched := replace(
    fn,
    '  IF v_is_credit AND p_cliente_id IS NULL THEN RAISE EXCEPTION ''Store credit requires a customer''; END IF;',
    '  IF v_is_credit AND p_cliente_id IS NULL THEN RAISE EXCEPTION ''Store credit requires a customer''; END IF;
  IF p_cliente_id IS NOT NULL AND NOT public.staff_can_access_cliente(p_cliente_id) THEN
    RAISE EXCEPTION ''Customer not found or access denied'';
  END IF;'
  );

  patched := replace(
    patched,
    '  IF v_origin.cliente_id IS DISTINCT FROM p_cliente_id THEN
    RAISE EXCEPTION ''Customer does not match the original sale'';
  END IF;',
    '  IF v_origin.cliente_id IS NOT NULL AND v_origin.cliente_id IS DISTINCT FROM p_cliente_id THEN
    RAISE EXCEPTION ''Customer does not match the original sale'';
  END IF;'
  );

  if patched = fn then
    raise exception 'Return function patch anchors not found';
  end if;
  execute patched;
end $$;

commit;
