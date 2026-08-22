-- `pagos` already has a production trigger that mirrors each direct payment
-- into `cxc_movimientos`. Stripe reconciliation must therefore insert only
-- into `pagos`; inserting into both tables reduces the A/R balance twice.

create or replace function public.portal_apply_stripe_payment(
  p_cliente_id uuid,
  p_monto numeric,
  p_payment_intent_id text
)
returns table(applied boolean, pago_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago_id uuid;
  v_reference text := nullif(trim(p_payment_intent_id), '');
begin
  if p_cliente_id is null then raise exception 'cliente_id is required'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'payment amount must be greater than zero'; end if;
  if v_reference is null or v_reference !~ '^pi_[A-Za-z0-9_]+$' then
    raise exception 'invalid Stripe PaymentIntent reference';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id) then
    raise exception 'customer not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_reference, 0));
  select id into v_pago_id
  from public.pagos
  where referencia = v_reference
  order by fecha_pago
  limit 1;
  if v_pago_id is not null then
    return query select false, v_pago_id;
    return;
  end if;

  insert into public.pagos (
    cliente_id, monto, metodo_pago, fecha_pago, van_id, referencia, notas
  ) values (
    p_cliente_id, round(p_monto, 2), 'stripe', now(), null,
    v_reference, 'Customer portal card payment'
  ) returning id into v_pago_id;

  return query select true, v_pago_id;
end;
$$;

revoke all on function public.portal_apply_stripe_payment(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.portal_apply_stripe_payment(uuid, numeric, text)
  to service_role;

create or replace function public.terminal_apply_ar_payment(
  p_session_id uuid,
  p_cliente_id uuid,
  p_van_id uuid,
  p_operator_id uuid,
  p_monto numeric,
  p_payment_intent_id text
)
returns table(applied boolean, pago_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago_id uuid;
  v_reference text := nullif(trim(p_payment_intent_id), '');
  v_balance numeric := 0;
begin
  if p_session_id is null or p_cliente_id is null or p_operator_id is null then
    raise exception 'session, customer and operator are required';
  end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'payment amount must be greater than zero'; end if;
  if v_reference is null or v_reference !~ '^pi_[A-Za-z0-9_]+$' then
    raise exception 'invalid Stripe PaymentIntent reference';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_reference, 0));
  select id into v_pago_id
  from public.pagos
  where referencia = v_reference
  order by fecha_pago
  limit 1;
  if v_pago_id is not null then
    return query select false, v_pago_id;
    return;
  end if;

  perform 1 from public.clientes where id = p_cliente_id for update;
  if not found then raise exception 'customer not found'; end if;
  select coalesce(saldo, 0) into v_balance
  from public.v_cxc_cliente_detalle_ext
  where cliente_id = p_cliente_id;
  if round(p_monto, 2) > round(coalesce(v_balance, 0), 2) + 0.005 then
    raise exception 'payment exceeds current balance';
  end if;

  insert into public.pagos (
    cliente_id, van_id, usuario_id, monto, metodo_pago, fecha_pago,
    referencia, notas
  ) values (
    p_cliente_id, p_van_id, p_operator_id, round(p_monto, 2),
    'stripe_terminal', now(), v_reference,
    'Tools4Care Android Tap to Pay session ' || p_session_id::text
  ) returning id into v_pago_id;

  return query select true, v_pago_id;
end;
$$;

revoke all on function public.terminal_apply_ar_payment(uuid,uuid,uuid,uuid,numeric,text)
  from public, anon, authenticated;
grant execute on function public.terminal_apply_ar_payment(uuid,uuid,uuid,uuid,numeric,text)
  to service_role;
