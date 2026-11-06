// supabase/functions/tenant-billing-webhook/index.ts
// Stripe webhook for the tenant's own $39.99/mo Basic subscription — this is
// Tools4Care billing the tenant (platform revenue), on Tools4Care's own
// Stripe account. Unrelated to terminal-payments/portal-payments, which are
// the tenant's customers paying the tenant (currently platform-owner only).
//
// Only ever suspends a tenant once Stripe has exhausted its own retries —
// a subscription landing on "past_due" after one missed payment keeps the
// tenant active (grace period); "unpaid" or "canceled" is what suspends.
// Configure retry/dunning behavior in the Stripe Dashboard under
// Settings -> Billing -> Subscriptions and invoicing.

import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SUSPENDING_STATUSES = new Set(["unpaid", "canceled", "incomplete_expired"]);

async function syncSubscription(admin: any, subscription: Stripe.Subscription) {
  const tenantId = String(subscription.metadata?.tools4care_tenant_id || "");
  let query = admin.from("tenants");
  const lookup = tenantId
    ? await query.select("id,status").eq("id", tenantId).maybeSingle()
    : await query.select("id,status").eq("stripe_subscription_id", subscription.id).maybeSingle();
  const { data: tenant, error: lookupError } = lookup;
  if (lookupError || !tenant) {
    console.error("tenant-billing-webhook: tenant not found for subscription", subscription.id);
    return;
  }

  const update: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (SUSPENDING_STATUSES.has(subscription.status)) {
    update.status = "suspended";
  } else if (tenant.status === "suspended" && (subscription.status === "active" || subscription.status === "trialing")) {
    // Reactivated after a successful payment resolved the suspension.
    update.status = "active";
  }

  const { error: updateError } = await admin.from("tenants").update(update).eq("id", tenant.id);
  if (updateError) console.error("tenant-billing-webhook: update failed", { tenantId: tenant.id, updateError });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("TENANT_BILLING_STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return json({ error: "Webhook is not configured" }, 500);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing Stripe signature" }, 400);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, webhookSecret);
  } catch (error) {
    console.error("tenant-billing-webhook: invalid signature", error);
    return json({ error: "Invalid signature" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(admin, event.data.object as Stripe.Subscription);
      break;
    }
    case "invoice.payment_failed": {
      // Informational only — the subscription's own status (handled above,
      // via customer.subscription.updated) is what actually gates access.
      const invoice = event.data.object as Stripe.Invoice;
      console.warn("tenant-billing-webhook: payment failed", {
        subscription: invoice.subscription,
        attempt: invoice.attempt_count,
      });
      break;
    }
    default:
      return json({ received: true, ignored: event.type });
  }

  return json({ received: true });
});
