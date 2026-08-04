-- Same view-owned-by-postgres RLS bypass as the other views fixed in
-- 202608033: the location-selector screen reads `v_vans_app`, not `vans`
-- directly, so the vans_tenant_isolation policy from 202608037 never took
-- effect for it — confirmed live (Tools4Care staff still saw the Test
-- tenant's "Test" location after that migration ran).

create or replace view v_vans_app
with (security_invoker = true)
as
 SELECT vans.id,
    vans.nombre_van AS nombre,
    vans.placa,
    vans.descripcion,
    vans.activo,
    vans.tipo,
    vans.tenant_id
   FROM vans;
