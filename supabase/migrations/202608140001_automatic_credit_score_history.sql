-- Automatic, auditable customer credit scoring.
-- Uses the same six-month factors as the CxC UI, but centralizes them in
-- Postgres so every payment/sale channel updates the same stored score.

create table if not exists public.credit_score_history (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  calculated_at timestamptz not null default now(),
  previous_score integer not null,
  new_score integer not null,
  score_delta integer generated always as (new_score - previous_score) stored,
  previous_effective_limit numeric(12,2),
  effective_limit numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  source_table text,
  source_operation text,
  source_id uuid,
  reason text,
  factors jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb
);

create index if not exists credit_score_history_cliente_date_idx
  on public.credit_score_history(cliente_id, calculated_at desc);

alter table public.credit_score_history enable row level security;

drop policy if exists credit_score_history_staff_read on public.credit_score_history;
create policy credit_score_history_staff_read
  on public.credit_score_history for select to authenticated
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid()
        and lower(coalesce(u.rol, '')) in ('admin', 'supervisor')
    )
  );

grant select on public.credit_score_history to authenticated;

create or replace function public.credit_policy_limit(p_score integer)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_score, 600) < 500 then 0
    when p_score < 550 then 30
    when p_score < 600 then 80
    when p_score < 650 then 150
    when p_score < 700 then 200
    when p_score < 750 then 350
    when p_score < 800 then 500
    else 800
  end::numeric;
$$;

create or replace function public.refresh_customer_credit_score(
  p_cliente_id uuid,
  p_source_table text default 'manual',
  p_source_operation text default 'RECALCULATE',
  p_source_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clientes%rowtype;
  v_previous_score integer;
  v_new_score integer := 500;
  v_previous_limit numeric := 0;
  v_effective_limit numeric := 0;
  v_balance numeric := 0;
  v_purchases numeric := 0;
  v_sale_payments numeric := 0;
  v_direct_payments numeric := 0;
  v_total_payments numeric := 0;
  v_ppr numeric := 0;
  v_invoice_count integer := 0;
  v_paid_invoice_count integer := 0;
  v_paid_invoice_ratio numeric := 0;
  v_utilization numeric := 0;
  v_payment_months integer := 0;
  v_recent_inactive integer := 0;
  v_last_payment timestamptz;
  v_days_since_payment integer := 999;
  v_ppr_points integer := 0;
  v_history_points integer := 0;
  v_utilization_points integer := 0;
  v_consistency_points integer := 0;
  v_recency_points integer := 0;
  v_inactivity_points integer := 0;
begin
  if p_cliente_id is null then return null; end if;

  select * into v_client
  from public.clientes
  where id = p_cliente_id
  for update;
  if not found then return null; end if;

  v_previous_score := greatest(300, least(850, coalesce(v_client.score_credito, 600)));
  v_previous_limit := coalesce(v_client.limite_manual, public.credit_policy_limit(v_previous_score));

  select coalesce(sum(case
           when cm.tipo in ('venta', 'ajuste_inicial', 'cargo') then cm.monto
           when cm.tipo in ('pago', 'abono', 'nota_credito', 'devolucion') then -cm.monto
           else 0 end), 0)
    into v_balance
  from public.cxc_movimientos cm
  where cm.cliente_id = p_cliente_id;
  v_balance := greatest(v_balance, 0);

  select
    coalesce(sum(coalesce(v.total_venta, v.total, 0)), 0),
    coalesce(sum(coalesce(v.total_pagado, 0)), 0),
    count(*)::integer,
    count(*) filter (where v.estado_pago = 'pagado')::integer,
    max(coalesce(v.fecha, v.created_at)) filter (where coalesce(v.total_pagado, 0) > 0)
  into v_purchases, v_sale_payments, v_invoice_count, v_paid_invoice_count, v_last_payment
  from public.ventas v
  where v.cliente_id = p_cliente_id
    and v.tipo is distinct from 'devolucion'
    and coalesce(v.fecha, v.created_at) >= now() - interval '6 months';

  select
    coalesce(sum(p.monto), 0),
    greatest(v_last_payment, max(p.fecha_pago))
  into v_direct_payments, v_last_payment
  from public.pagos p
  where p.cliente_id = p_cliente_id
    and p.fecha_pago >= now() - interval '6 months';

  v_total_payments := v_sale_payments + v_direct_payments;
  v_ppr := case
    when v_purchases > 0 then v_total_payments / v_purchases
    when v_total_payments > 0 then 1.5
    else 0 end;
  v_paid_invoice_ratio := case when v_invoice_count > 0
    then v_paid_invoice_count::numeric / v_invoice_count else 0 end;
  v_utilization := case when v_previous_limit > 0
    then least(1, v_balance / v_previous_limit) else 0 end;
  if v_last_payment is not null then
    v_days_since_payment := greatest(0, floor(extract(epoch from (now() - v_last_payment)) / 86400)::integer);
  end if;

  select count(distinct date_trunc('month', paid_at))::integer
  into v_payment_months
  from (
    select coalesce(v.fecha, v.created_at) as paid_at
    from public.ventas v
    where v.cliente_id = p_cliente_id
      and coalesce(v.total_pagado, 0) > 0
      and coalesce(v.fecha, v.created_at) >= date_trunc('month', now()) - interval '5 months'
    union all
    select p.fecha_pago
    from public.pagos p
    where p.cliente_id = p_cliente_id
      and p.fecha_pago >= date_trunc('month', now()) - interval '5 months'
  ) paid_months;

  select count(*)::integer into v_recent_inactive
  from generate_series(0, 1) month_offset
  where not exists (
    select 1
    from (
      select coalesce(v.fecha, v.created_at) as paid_at
      from public.ventas v
      where v.cliente_id = p_cliente_id and coalesce(v.total_pagado, 0) > 0
      union all
      select p.fecha_pago from public.pagos p where p.cliente_id = p_cliente_id
    ) recent_payments
    where date_trunc('month', recent_payments.paid_at)
      = date_trunc('month', now()) - make_interval(months => month_offset)
  );

  v_ppr_points := case
    when v_ppr >= 1.4 then 140 when v_ppr >= 1.2 then 110
    when v_ppr >= 1.0 then 80 when v_ppr >= 0.8 then 40
    when v_ppr >= 0.5 then 10 when v_ppr > 0 then -40 else -120 end;
  v_history_points := round(v_paid_invoice_ratio * 125)::integer - 62;
  v_utilization_points := case
    when v_utilization >= 1 then -80 when v_utilization >= .9 then -60
    when v_utilization >= .75 then -30 when v_utilization >= .5 then -10
    when v_utilization <= .3 then 40 else 10 end;
  v_consistency_points := round((v_payment_months::numeric / 6) * 90)::integer - 15;

  if v_balance > 0 then
    v_recency_points := case
      when v_days_since_payment > 90 then -120 when v_days_since_payment > 60 then -80
      when v_days_since_payment > 30 then -45 when v_days_since_payment > 14 then -20 else 0 end;
    v_inactivity_points := case when v_recent_inactive >= 2 then -60 when v_recent_inactive >= 1 then -25 else 0 end;
  end if;

  v_new_score := greatest(300, least(850,
    500 + v_ppr_points + v_history_points + v_utilization_points
      + v_consistency_points + v_recency_points + v_inactivity_points));
  v_effective_limit := coalesce(v_client.limite_manual, public.credit_policy_limit(v_new_score));

  update public.clientes set score_credito = v_new_score where id = p_cliente_id;

  insert into public.credit_score_history (
    cliente_id, previous_score, new_score, previous_effective_limit,
    effective_limit, balance, source_table, source_operation, source_id,
    reason, factors, metrics
  ) values (
    p_cliente_id, v_previous_score, v_new_score, v_previous_limit,
    v_effective_limit, v_balance, p_source_table, p_source_operation, p_source_id,
    coalesce(p_reason, 'Automatic credit score refresh'),
    jsonb_build_object(
      'ppr', v_ppr_points, 'payment_history', v_history_points,
      'utilization', v_utilization_points, 'consistency', v_consistency_points,
      'recency', v_recency_points, 'recent_inactivity', v_inactivity_points
    ),
    jsonb_build_object(
      'purchases_6m', round(v_purchases, 2), 'payments_6m', round(v_total_payments, 2),
      'ppr', round(v_ppr, 4), 'invoice_count', v_invoice_count,
      'paid_invoice_count', v_paid_invoice_count, 'utilization_pct', round(v_utilization * 100, 1),
      'payment_months_6m', v_payment_months, 'days_since_payment',
        case when v_days_since_payment = 999 then null else v_days_since_payment end,
      'manual_limit_applied', v_client.limite_manual is not null
    )
  );

  return jsonb_build_object(
    'cliente_id', p_cliente_id, 'previous_score', v_previous_score,
    'score', v_new_score, 'score_delta', v_new_score - v_previous_score,
    'credit_limit', v_effective_limit, 'balance', round(v_balance, 2),
    'available_credit', greatest(v_effective_limit - v_balance, 0)
  );
end;
$$;

revoke all on function public.refresh_customer_credit_score(uuid,text,text,uuid,text) from public;
grant execute on function public.refresh_customer_credit_score(uuid,text,text,uuid,text) to service_role;

create or replace function public.trigger_refresh_customer_credit_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_source_id uuid;
begin
  v_cliente_id := case when tg_op = 'DELETE' then old.cliente_id else new.cliente_id end;
  v_source_id := case when tg_op = 'DELETE' then old.id else new.id end;
  begin
    perform public.refresh_customer_credit_score(
      v_cliente_id, tg_table_name, tg_op, v_source_id,
      'Automatic refresh after ' || lower(tg_op) || ' on ' || tg_table_name
    );
  exception when others then
    raise warning 'Credit score refresh failed for customer % after %.%: %', v_cliente_id, tg_table_name, tg_op, sqlerrm;
  end;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists zz_refresh_credit_score_after_sale on public.ventas;
create trigger zz_refresh_credit_score_after_sale
after insert or delete or update of cliente_id, total, total_venta, total_pagado, estado_pago, tipo
on public.ventas for each row execute function public.trigger_refresh_customer_credit_score();

drop trigger if exists zz_refresh_credit_score_after_payment on public.pagos;
create trigger zz_refresh_credit_score_after_payment
after insert or delete or update of cliente_id, monto, fecha_pago
on public.pagos for each row execute function public.trigger_refresh_customer_credit_score();

drop trigger if exists zz_refresh_credit_score_after_ar_movement on public.cxc_movimientos;
create trigger zz_refresh_credit_score_after_ar_movement
after insert or delete or update of cliente_id, monto, tipo, fecha
on public.cxc_movimientos for each row execute function public.trigger_refresh_customer_credit_score();

create or replace function public.trigger_refresh_credit_score_after_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.limite_manual is distinct from new.limite_manual then
    begin
      perform public.refresh_customer_credit_score(
        new.id, 'clientes', 'LIMIT_CHANGE', new.id,
        'Manual credit limit changed from ' || coalesce(old.limite_manual::text, 'automatic')
          || ' to ' || coalesce(new.limite_manual::text, 'automatic')
      );
    exception when others then
      raise warning 'Credit score refresh failed after limit change for customer %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_refresh_credit_score_after_limit on public.clientes;
create trigger zz_refresh_credit_score_after_limit
after update of limite_manual on public.clientes
for each row execute function public.trigger_refresh_credit_score_after_limit();

-- Establish a trustworthy baseline for customers with activity in the scoring window.
do $$
declare v_id uuid;
begin
  for v_id in
    select distinct cliente_id from (
      select cliente_id from public.ventas
      where cliente_id is not null and coalesce(fecha, created_at) >= now() - interval '6 months'
      union
      select cliente_id from public.pagos
      where cliente_id is not null and fecha_pago >= now() - interval '6 months'
      union
      select cliente_id from public.cxc_movimientos
      where cliente_id is not null
    ) active_clients
  loop
    perform public.refresh_customer_credit_score(v_id, 'migration', 'BASELINE', null, 'Initial automatic scoring baseline');
  end loop;
end $$;
