-- Add Stripe and card columns to subscription_clientes (safe, idempotent)
alter table subscription_clientes
  add column if not exists stripe_customer_id       text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists card_last4               text,
  add column if not exists card_brand               text;
