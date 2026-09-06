-- Legacy detail rows may store subtotal before discount. Return pricing must
-- use the charged unit price in that shape, matching the client quote.
begin;

do $$
declare
  fn text;
  patched text;
begin
  select pg_get_functiondef(
    'public.procesar_devolucion_transaccional(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into fn;
  if fn is null then raise exception 'Return function definition not found'; end if;

  patched := replace(
    fn,
    'THEN v_detail.subtotal / v_detail.cantidad',
    'THEN CASE WHEN COALESCE(v_detail.precio_unitario, 0) > 0 AND COALESCE(v_detail.descuento, 0) > 0 AND abs((v_detail.subtotal / v_detail.cantidad) - v_detail.precio_unitario) <= 0.01 THEN v_detail.precio_unitario * (1 - LEAST(100, GREATEST(0, COALESCE(v_detail.descuento, 0))) / 100) ELSE v_detail.subtotal / v_detail.cantidad END'
  );
  if patched = fn then raise exception 'Return discount anchor not found'; end if;
  execute patched;
end $$;

commit;
