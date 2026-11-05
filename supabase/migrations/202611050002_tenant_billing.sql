-- Tenant pilot §3: Stripe Billing for the tenant's own $39.99/mo Basic
-- subscription (platform revenue, billed on Tools4Care's own Stripe
-- account — unrelated to §2's per-tenant customer card-payment gate).
--
-- subscription_status tracks Stripe's own view of the subscription
-- (trialing/active/past_due/unpaid/canceled) independently of `status`
-- (pending/active/suspended), which is what the app actually gates on.
-- The webhook only ever suspends a tenant once Stripe has exhausted its
-- retries (subscription -> unpaid/canceled), never on a single missed
-- payment (past_due keeps `status` = 'active' with a warning banner).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_subscription_id_uidx
  ON public.tenants (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Single enforcement point: every tenant-scoped RLS policy already calls
-- this function, so a suspended tenant loses access everywhere (clientes,
-- productos, ventas, …) the moment this changes, with no per-table policy
-- edits. Platform staff (tenant_id null) are never affected — the join
-- below only matches when a real tenant_id is found.
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_tenant_status text;
BEGIN
  SELECT u.tenant_id INTO v_tenant_id FROM usuarios u WHERE u.id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT t.status INTO v_tenant_status FROM tenants t WHERE t.id = v_tenant_id;
  IF v_tenant_status = 'suspended' THEN
    RAISE EXCEPTION 'This account is suspended. Contact support to reactivate it.'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant_id;
END;
$$;
