-- Equipment rental (Alquileres) program
-- $45 deposit (= 1 week, refundable) + $45/week rental, rental-first model.
-- Missed payment -> estado = 'atrasado' -> repossess machine/equivalent ('retirado').

create table if not exists alquileres (
  id                       uuid primary key default gen_random_uuid(),
  cliente_id               uuid references clientes(id) on delete cascade,
  producto_id              uuid references productos(id) on delete set null,
  van_id                   uuid references vans(id) on delete cascade,
  serial                   text,
  estado                   text not null default 'en_renta', -- en_renta | atrasado | retirado | comprado | cancelado
  deposito                 numeric(10,2) not null default 45,
  renta_semanal            numeric(10,2) not null default 45,
  costo_maquina            numeric(10,2),
  fecha_inicio             date not null default current_date,
  proxima_renta            date,
  ultima_renta_pagada      date,
  semanas_pagadas          integer not null default 0,
  total_pagado             numeric(10,2) not null default 0,
  contrato_texto           text,
  contrato_firma           text, -- base64 PNG data URL
  contrato_firmado_at      timestamptz,
  stripe_customer_id       text,
  stripe_payment_method_id text,
  card_last4               text,
  card_brand               text,
  nota                     text,
  created_at               timestamptz not null default now()
);

create table if not exists alquiler_pagos (
  id           uuid primary key default gen_random_uuid(),
  alquiler_id  uuid references alquileres(id) on delete cascade,
  fecha        date not null default current_date,
  monto        numeric(10,2) not null default 0,
  tipo         text not null default 'renta', -- deposito | renta
  metodo       text not null default 'efectivo', -- efectivo | tarjeta
  estado       text not null default 'pagado', -- pagado | cobro_fallido
  notas        text,
  created_at   timestamptz not null default now()
);

alter table alquileres enable row level security;
alter table alquiler_pagos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'alquileres' and policyname = 'auth read alquileres') then
    create policy "auth read alquileres" on alquileres for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'alquileres' and policyname = 'auth write alquileres') then
    create policy "auth write alquileres" on alquileres for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'alquiler_pagos' and policyname = 'auth read alquiler_pagos') then
    create policy "auth read alquiler_pagos" on alquiler_pagos for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'alquiler_pagos' and policyname = 'auth write alquiler_pagos') then
    create policy "auth write alquiler_pagos" on alquiler_pagos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

create index if not exists idx_alquileres_estado on alquileres(estado);
create index if not exists idx_alquileres_proxima_renta on alquileres(proxima_renta);
create index if not exists idx_alquiler_pagos_alquiler_id on alquiler_pagos(alquiler_id);
