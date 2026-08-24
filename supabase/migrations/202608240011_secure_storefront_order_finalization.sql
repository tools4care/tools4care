-- Make storefront finalization idempotent and transactional. Stripe is
-- verified by the Edge Function; this RPC is callable only by service_role.

create unique index if not exists orders_payment_intent_id_unique
  on public.orders (payment_intent_id);

create or replace function public.finalize_storefront_order(
  p_order jsonb,
  p_items jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_payment_intent_id text := nullif(btrim(p_order->>'payment_intent_id'), '');
  v_stock_applied boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if v_payment_intent_id is null then
    raise exception 'payment_intent_id is required';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required';
  end if;

  select id into v_order_id
  from public.orders
  where payment_intent_id = v_payment_intent_id;
  if v_order_id is not null then
    return v_order_id;
  end if;

  insert into public.orders (
    payment_intent_id, amount_total, amount_subtotal, amount_shipping,
    amount_taxes, amount_discount, currency, email, phone, name,
    address_json, status, promo_code
  ) values (
    v_payment_intent_id,
    coalesce((p_order->>'amount_total')::numeric, 0),
    coalesce((p_order->>'amount_subtotal')::numeric, 0),
    coalesce((p_order->>'amount_shipping')::numeric, 0),
    coalesce((p_order->>'amount_taxes')::numeric, 0),
    coalesce((p_order->>'amount_discount')::numeric, 0),
    coalesce(nullif(p_order->>'currency', ''), 'usd'),
    nullif(p_order->>'email', ''),
    nullif(p_order->>'phone', ''),
    nullif(p_order->>'name', ''),
    p_order->'address_json',
    'paid',
    nullif(p_order->>'promo_code', '')
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, producto_id, nombre, qty, precio_unit, marca, codigo, taxable
  )
  select
    v_order_id, item.producto_id, item.nombre, item.qty, item.precio_unit,
    item.marca, item.codigo, coalesce(item.taxable, true)
  from jsonb_to_recordset(p_items) as item(
    producto_id uuid, nombre text, qty integer, precio_unit numeric,
    marca text, codigo text, taxable boolean
  )
  where item.producto_id is not null and item.qty > 0;

  if not exists (select 1 from public.order_items where order_id = v_order_id) then
    raise exception 'No valid order items were supplied';
  end if;

  v_stock_applied := public.apply_online_stock_for_order(v_order_id);
  if exists (
    select 1 from public.order_stock_audit
    where order_id = v_order_id and before_qty < qty
  ) then
    raise exception 'Insufficient inventory to finalize order';
  end if;
  if v_stock_applied then
    update public.orders set stock_applied_at = now() where id = v_order_id;
  end if;

  return v_order_id;
exception
  when unique_violation then
    select id into v_order_id from public.orders where payment_intent_id = v_payment_intent_id;
    if v_order_id is not null then return v_order_id; end if;
    raise;
end;
$$;

revoke all on function public.finalize_storefront_order(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.finalize_storefront_order(jsonb,jsonb) to service_role;

-- The browser no longer needs direct inventory mutation.
revoke all on function public.decrement_stock_van(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.decrement_stock_van(uuid,uuid,integer) to service_role;
