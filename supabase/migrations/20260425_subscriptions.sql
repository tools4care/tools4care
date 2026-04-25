-- Subscription box plans
create table if not exists subscription_planes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  precio      numeric(10,2) not null default 0,
  ciclo       text not null default 'mensual', -- mensual | bimestral | trimestral
  productos   jsonb default '[]',
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Client subscriptions
create table if not exists subscription_clientes (
  id                       uuid primary key default gen_random_uuid(),
  cliente_id               uuid references clientes(id) on delete cascade,
  plan_id                  uuid references subscription_planes(id) on delete restrict,
  van_id                   uuid references vans(id) on delete cascade,
  estado                   text not null default 'activa', -- activa | pausada | cancelada
  fecha_inicio             date not null default current_date,
  proxima_entrega          date,
  ultima_entrega           date,
  nota                     text,
  stripe_customer_id       text,
  stripe_payment_method_id text,
  card_last4               text,
  card_brand               text,
  created_at               timestamptz not null default now()
);

-- Delivery log
create table if not exists subscription_entregas (
  id               uuid primary key default gen_random_uuid(),
  suscripcion_id   uuid references subscription_clientes(id) on delete cascade,
  fecha            date not null default current_date,
  estado           text not null default 'entregado',
  notas            text,
  created_at       timestamptz not null default now()
);

-- RLS
alter table subscription_planes    enable row level security;
alter table subscription_clientes  enable row level security;
alter table subscription_entregas  enable row level security;

create policy "auth read planes"    on subscription_planes    for select using (auth.role() = 'authenticated');
create policy "auth write planes"   on subscription_planes    for all    using (auth.role() = 'authenticated');
create policy "auth read subs"      on subscription_clientes  for select using (auth.role() = 'authenticated');
create policy "auth write subs"     on subscription_clientes  for all    using (auth.role() = 'authenticated');
create policy "auth read entregas"  on subscription_entregas  for select using (auth.role() = 'authenticated');
create policy "auth write entregas" on subscription_entregas  for all    using (auth.role() = 'authenticated');
