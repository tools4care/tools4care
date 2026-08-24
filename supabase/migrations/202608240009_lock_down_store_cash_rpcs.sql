-- Store register, closeout, inventory-receipt and A/R collection RPCs are
-- internal operations. Do not expose them to unauthenticated callers.

revoke all on function public.add_store_cash_movement(uuid,text,numeric,text) from public, anon;
revoke all on function public.attach_store_sale_to_session(uuid,uuid) from public, anon;
revoke all on function public.close_store_cash_session(uuid,numeric,text) from public, anon;
revoke all on function public.close_store_cash_session_v2(uuid,jsonb,text) from public, anon;
revoke all on function public.confirm_store_inventory(uuid,text) from public, anon;
revoke all on function public.get_pending_inventory_receipts(uuid,integer) from public, anon;
revoke all on function public.get_store_cash_closeout_preview(uuid) from public, anon;
revoke all on function public.get_store_cash_closeout_report(uuid,integer) from public, anon;
revoke all on function public.get_store_cash_session_history(uuid,integer) from public, anon;
revoke all on function public.get_store_cash_session_summary(uuid) from public, anon;
revoke all on function public.get_store_inventory_activity(uuid,integer) from public, anon;
revoke all on function public.mark_store_cash_closeout_printed(uuid) from public, anon;
revoke all on function public.open_store_cash_session(uuid,text,text,numeric,text) from public, anon;
revoke all on function public.record_split_ar_payment(uuid,uuid,uuid,jsonb,uuid,timestamp with time zone) from public, anon;
revoke all on function public.record_store_ar_payment(uuid,uuid,uuid,numeric,text,text,uuid,timestamp with time zone) from public, anon;
revoke all on function public.reopen_store_cash_session(uuid,text) from public, anon;
revoke all on function public.resume_store_cash_session(uuid,text,text) from public, anon;
revoke all on function public.store_cash_can_access_location(uuid) from public, anon;
revoke all on function public.store_cash_is_privileged() from public, anon;
revoke all on function public.void_store_cash_movement(uuid,text) from public, anon;

grant execute on function public.add_store_cash_movement(uuid,text,numeric,text) to authenticated, service_role;
grant execute on function public.attach_store_sale_to_session(uuid,uuid) to authenticated, service_role;
grant execute on function public.close_store_cash_session(uuid,numeric,text) to authenticated, service_role;
grant execute on function public.close_store_cash_session_v2(uuid,jsonb,text) to authenticated, service_role;
grant execute on function public.confirm_store_inventory(uuid,text) to authenticated, service_role;
grant execute on function public.get_pending_inventory_receipts(uuid,integer) to authenticated, service_role;
grant execute on function public.get_store_cash_closeout_preview(uuid) to authenticated, service_role;
grant execute on function public.get_store_cash_closeout_report(uuid,integer) to authenticated, service_role;
grant execute on function public.get_store_cash_session_history(uuid,integer) to authenticated, service_role;
grant execute on function public.get_store_cash_session_summary(uuid) to authenticated, service_role;
grant execute on function public.get_store_inventory_activity(uuid,integer) to authenticated, service_role;
grant execute on function public.mark_store_cash_closeout_printed(uuid) to authenticated, service_role;
grant execute on function public.open_store_cash_session(uuid,text,text,numeric,text) to authenticated, service_role;
grant execute on function public.record_split_ar_payment(uuid,uuid,uuid,jsonb,uuid,timestamp with time zone) to authenticated, service_role;
grant execute on function public.record_store_ar_payment(uuid,uuid,uuid,numeric,text,text,uuid,timestamp with time zone) to authenticated, service_role;
grant execute on function public.reopen_store_cash_session(uuid,text) to authenticated, service_role;
grant execute on function public.resume_store_cash_session(uuid,text,text) to authenticated, service_role;
grant execute on function public.store_cash_can_access_location(uuid) to authenticated, service_role;
grant execute on function public.store_cash_is_privileged() to authenticated, service_role;
grant execute on function public.void_store_cash_movement(uuid,text) to authenticated, service_role;
