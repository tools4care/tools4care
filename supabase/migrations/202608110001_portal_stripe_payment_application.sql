-- Apply a successful Stripe portal payment to both the payment history and
-- the CxC ledger in one transaction. Stripe PaymentIntent IDs are text
-- (pi_...), so they must not be passed to cxc_registrar_pago.p_idem (uuid).

create index if not exists pagos_referencia_lookup_idx
  on public.pagos (referencia)
  where referencia is not null;

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
  if p_cliente_id is null then
    raise exception 'cliente_id is required';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'payment amount must be greater than zero';
  end if;
  if v_reference is null or v_reference !~ '^pi_[A-Za-z0-9_]+$' then
    raise exception 'invalid Stripe PaymentIntent reference';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id) then
    raise exception 'customer not found';
  end if;

  -- Serialize retries of the same PaymentIntent without requiring a UUID cast.
  perform pg_advisory_xact_lock(hashtextextended(v_reference, 0));

  select id into v_pago_id
  from public.pagos
  where referencia = v_reference
  order by fecha_pago
  limit 1;

  if v_pago_id is not null then
    -- Repair payments written by the old non-atomic fallback, which inserted
    -- pagos but failed to add the balance-reducing CxC movement.
    if not exists (
      select 1 from public.cxc_movimientos
      where cliente_id = p_cliente_id
        and tipo = 'pago'
        and nota = 'Stripe portal payment ' || v_reference
    ) then
      insert into public.cxc_movimientos (
        cliente_id, tipo, monto, fecha, van_id, nota
      ) values (
        p_cliente_id, 'pago', round(p_monto, 2), now(), null,
        'Stripe portal payment ' || v_reference
      );
      return query select true, v_pago_id;
      return;
    end if;
    return query select false, v_pago_id;
    return;
  end if;

  insert into public.pagos (
    cliente_id, monto, metodo_pago, fecha_pago, van_id, referencia, notas
  ) values (
    p_cliente_id, round(p_monto, 2), 'stripe', now(), null,
    v_reference, 'Customer portal card payment'
  )
  returning id into v_pago_id;

  insert into public.cxc_movimientos (
    cliente_id, tipo, monto, fecha, van_id, nota
  ) values (
    p_cliente_id, 'pago', round(p_monto, 2), now(), null,
    'Stripe portal payment ' || v_reference
  );

  return query select true, v_pago_id;
end;
$$;

revoke all on function public.portal_apply_stripe_payment(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.portal_apply_stripe_payment(uuid, numeric, text)
  to service_role;
