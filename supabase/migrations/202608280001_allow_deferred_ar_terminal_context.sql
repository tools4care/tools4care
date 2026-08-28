-- CxC Tap to Pay can now defer reconciliation until the operator records
-- the payment. Keep it as a distinct context while preserving UUID context_id.
alter table public.terminal_payment_sessions
  drop constraint if exists terminal_payment_sessions_context_type_check;

alter table public.terminal_payment_sessions
  add constraint terminal_payment_sessions_context_type_check
  check (context_type in ('sale', 'ar_payment', 'ar_payment_deferred', 'card_setup'));
