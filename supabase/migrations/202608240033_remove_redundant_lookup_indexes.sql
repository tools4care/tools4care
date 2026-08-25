-- Redundant non-unique indexes fully covered by existing unique/composite
-- indexes. Removing them reduces write amplification without changing query
-- semantics or uniqueness guarantees.
drop index if exists public.idx_stock_van_van_producto;
drop index if exists public.idx_cxc_mov_cliente_id;
