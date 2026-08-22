-- Walk-in sales have no customer account. They can still use an in-person
-- Stripe Terminal payment, while CxC and saved-card flows remain customer-only.
alter table public.terminal_payment_sessions
  alter column cliente_id drop not null;
