-- The retained "authenticated app access" policy already grants the exact
-- same authenticated access. These public-role policies evaluate false for
-- anonymous users and only duplicate work for signed-in requests.

drop policy if exists "auth read alquileres" on public.alquileres;
drop policy if exists "auth write alquileres" on public.alquileres;

drop policy if exists "auth read alquiler_pagos" on public.alquiler_pagos;
drop policy if exists "auth write alquiler_pagos" on public.alquiler_pagos;

drop policy if exists "auth read planes" on public.subscription_planes;
drop policy if exists "auth write planes" on public.subscription_planes;

drop policy if exists "auth read subs" on public.subscription_clientes;
drop policy if exists "auth write subs" on public.subscription_clientes;

drop policy if exists "auth read entregas" on public.subscription_entregas;
drop policy if exists "auth write entregas" on public.subscription_entregas;
