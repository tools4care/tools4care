-- Retain the single standard authenticated policy on each table. The removed
-- policies are duplicates or narrower subsets of the same effective access.

drop policy if exists "Admins pueden ver comisiones"
  on public.comisiones_calculadas;
drop policy if exists "Vendedores pueden ver sus comisiones"
  on public.comisiones_calculadas;
drop policy if exists "Permitir todo a usuarios autenticados - comisiones"
  on public.comisiones_calculadas;

drop policy if exists "Admins pueden actualizar configuraciones"
  on public.configuraciones_comisiones;
drop policy if exists "Admins pueden insertar configuraciones"
  on public.configuraciones_comisiones;
drop policy if exists "Admins pueden ver configuraciones"
  on public.configuraciones_comisiones;
drop policy if exists "Permitir todo a usuarios autenticados - config"
  on public.configuraciones_comisiones;
drop policy if exists "Permitir todo para usuarios autenticados"
  on public.configuraciones_comisiones;

drop policy if exists "Usuarios autenticados pueden agregar movimientos de stock"
  on public.movimientos_stock;
drop policy if exists "Usuarios autenticados pueden leer movimientos de stock"
  on public.movimientos_stock;
drop policy if exists "auth manage movimientos_stock"
  on public.movimientos_stock;
