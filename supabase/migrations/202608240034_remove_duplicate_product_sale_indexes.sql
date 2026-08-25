-- Remove unowned indexes duplicated by primary/unique or more precise partial
-- indexes. Constraints and idempotency guarantees remain intact.
drop index if exists public.idx_productos_codigo;
drop index if exists public.idx_productos_id;
drop index if exists public.ventas_idem_key;
