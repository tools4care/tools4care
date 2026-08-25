-- Optimize the two customer-facing order lookups:
-- account history filters by email and sorts by newest first; order tracking
-- looks up an exact tracking number.
create index if not exists orders_email_created_at_idx
  on public.orders (email, created_at desc)
  where email is not null;

create index if not exists orders_tracking_number_idx
  on public.orders (tracking_number)
  where tracking_number is not null;
