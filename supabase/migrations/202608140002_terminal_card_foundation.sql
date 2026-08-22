-- Isolated foundation for the optional Android Tap to Pay companion.
-- This migration intentionally enables no UI and performs no charges.

create table if not exists public.terminal_payment_settings (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  tenant_id uuid references public.tenants(id) on delete cascade,
  android_tap_to_pay_enabled boolean not null default false,
  saved_cards_enabled boolean not null default false,
  stripe_location_id text,
  pilot_device_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Upgrade the first draft safely when it was installed before legacy-mode
-- support was added. No tenant or customer records are changed.
alter table public.terminal_payment_settings
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists scope_key text;
update public.terminal_payment_settings
set id = coalesce(id, gen_random_uuid()),
    scope_key = coalesce(scope_key, 'tenant:' || tenant_id::text);
alter table public.terminal_payment_settings drop constraint if exists terminal_payment_settings_pkey;
alter table public.terminal_payment_settings alter column tenant_id drop not null;
alter table public.terminal_payment_settings alter column id set not null;
alter table public.terminal_payment_settings alter column scope_key set not null;
alter table public.terminal_payment_settings add primary key (id);
create unique index if not exists terminal_payment_settings_scope_uidx
  on public.terminal_payment_settings(scope_key);
create unique index if not exists terminal_payment_settings_tenant_uidx
  on public.terminal_payment_settings(tenant_id) where tenant_id is not null;

create table if not exists public.stripe_customer_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id)
);

create index if not exists stripe_customer_links_tenant_idx
  on public.stripe_customer_links(tenant_id, cliente_id);

create table if not exists public.payment_method_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  purpose text not null check (purpose in ('future_customer_approved_payments', 'off_session_balance_payments')),
  terms_version text not null,
  terms_text text not null,
  accepted boolean not null default false,
  accepted_at timestamptz,
  captured_by uuid,
  capture_channel text not null check (capture_channel in ('android_companion', 'customer_portal')),
  device_id text,
  evidence jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  check ((accepted and accepted_at is not null) or (not accepted))
);

create index if not exists payment_method_consents_client_idx
  on public.payment_method_consents(cliente_id, created_at desc);

create table if not exists public.customer_payment_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_payment_method_id text not null unique,
  consent_id uuid references public.payment_method_consents(id) on delete restrict,
  brand text,
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  exp_month integer check (exp_month between 1 and 12),
  exp_year integer,
  funding text,
  allow_redisplay text,
  source text not null default 'terminal_generated_card',
  status text not null default 'active' check (status in ('active', 'expired', 'detached', 'blocked')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  detached_at timestamptz
);

create index if not exists customer_payment_methods_client_idx
  on public.customer_payment_methods(cliente_id, status, created_at desc);

create unique index if not exists customer_payment_methods_one_default_idx
  on public.customer_payment_methods(cliente_id)
  where is_default and status = 'active';

create table if not exists public.terminal_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  van_id uuid,
  operator_id uuid not null,
  device_id text not null,
  context_type text not null check (context_type in ('sale', 'ar_payment', 'card_setup')),
  context_id uuid,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  idempotency_key text not null unique,
  companion_token_hash text not null unique,
  companion_token_expires_at timestamptz not null default (now() + interval '10 minutes'),
  status text not null default 'created' check (status in (
    'created', 'awaiting_consent', 'ready', 'collecting', 'processing',
    'succeeded', 'failed', 'cancelled', 'reconciliation_pending', 'reconciled'
  )),
  save_offered boolean not null default false,
  save_requested boolean not null default false,
  consent_id uuid references public.payment_method_consents(id) on delete restrict,
  stripe_payment_intent_id text unique,
  stripe_setup_intent_id text unique,
  saved_payment_method_id uuid references public.customer_payment_methods(id) on delete set null,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  reconciled_at timestamptz,
  check (context_type = 'card_setup' or amount_cents >= 50),
  check (not save_requested or consent_id is not null)
);

-- Upgrade installations where this table was created by an earlier draft.
alter table public.terminal_payment_sessions
  add column if not exists save_offered boolean not null default false,
  add column if not exists stripe_setup_intent_id text;
create unique index if not exists terminal_payment_sessions_setup_intent_uidx
  on public.terminal_payment_sessions(stripe_setup_intent_id)
  where stripe_setup_intent_id is not null;

create index if not exists terminal_payment_sessions_client_idx
  on public.terminal_payment_sessions(cliente_id, created_at desc);
create index if not exists terminal_payment_sessions_status_idx
  on public.terminal_payment_sessions(status, created_at);
create index if not exists terminal_payment_sessions_token_idx
  on public.terminal_payment_sessions(companion_token_hash, companion_token_expires_at);

-- Payment data is server-mediated. Authenticated clients receive no direct
-- table grants; Edge Functions use the service role after validating the user,
-- tenant, device, amount, and session state.
alter table public.terminal_payment_settings enable row level security;
alter table public.stripe_customer_links enable row level security;
alter table public.payment_method_consents enable row level security;
alter table public.customer_payment_methods enable row level security;
alter table public.terminal_payment_sessions enable row level security;

revoke all on public.terminal_payment_settings from anon, authenticated;
revoke all on public.stripe_customer_links from anon, authenticated;
revoke all on public.payment_method_consents from anon, authenticated;
revoke all on public.customer_payment_methods from anon, authenticated;
revoke all on public.terminal_payment_sessions from anon, authenticated;

comment on table public.terminal_payment_settings is
  'Feature flags for the optional Android payment companion; disabled by default.';
comment on table public.customer_payment_methods is
  'Stripe token references and non-sensitive display data only. Never store PAN or CVC.';
comment on table public.terminal_payment_sessions is
  'Immutable, idempotent audit envelope for Android Terminal and saved-card payments.';

-- Apply a successful direct A/R Terminal payment atomically. Sale-context
-- payments continue through the existing sale transaction and are linked to
-- their terminal session after the sale succeeds.
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
  if v_reference is null or v_reference !~ '^pi_[A-Za-z0-9_]+$' then raise exception 'invalid Stripe PaymentIntent reference'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_reference, 0));
  select id into v_pago_id from public.pagos where referencia = v_reference order by fecha_pago limit 1;
  if v_pago_id is not null then
    return query select false, v_pago_id;
    return;
  end if;

  perform 1 from public.clientes where id = p_cliente_id for update;
  if not found then raise exception 'customer not found'; end if;
  select coalesce(saldo, 0) into v_balance
  from public.v_cxc_cliente_detalle_ext where cliente_id = p_cliente_id;
  if round(p_monto, 2) > round(coalesce(v_balance, 0), 2) + 0.005 then
    raise exception 'payment exceeds current balance';
  end if;

  insert into public.pagos(
    cliente_id, van_id, usuario_id, monto, metodo_pago, fecha_pago,
    referencia, notas
  ) values (
    p_cliente_id, p_van_id, p_operator_id, round(p_monto, 2),
    'stripe_terminal', now(), v_reference,
    'Tools4Care Android Tap to Pay session ' || p_session_id::text
  ) returning id into v_pago_id;

  insert into public.cxc_movimientos(cliente_id, tipo, monto, fecha, van_id, nota)
  values (
    p_cliente_id, 'pago', round(p_monto, 2), now(), p_van_id,
    'Stripe Terminal payment ' || v_reference
  );

  return query select true, v_pago_id;
end;
$$;

revoke all on function public.terminal_apply_ar_payment(uuid,uuid,uuid,uuid,numeric,text)
  from public, anon, authenticated;
grant execute on function public.terminal_apply_ar_payment(uuid,uuid,uuid,uuid,numeric,text)
  to service_role;
