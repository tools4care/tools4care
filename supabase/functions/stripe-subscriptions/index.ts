import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    /* ── create_customer ───────────────────────────────
       Creates (or returns existing) Stripe customer.
       body: { action, name, email, phone, metadata }
       Returns: { customer_id }
    ─────────────────────────────────────────────────── */
    if (action === "create_customer") {
      const { name, email, phone, metadata } = body;
      const customer = await stripe.customers.create({
        name: name || undefined,
        email: email || undefined,
        phone: phone || undefined,
        metadata: metadata || {},
      });
      return json({ ok: true, customer_id: customer.id });
    }

    /* ── create_setup_intent ───────────────────────────
       Creates a SetupIntent so the client can securely
       save a card for future recurring charges.
       body: { action, customer_id }
       Returns: { client_secret }
    ─────────────────────────────────────────────────── */
    if (action === "create_setup_intent") {
      const { customer_id } = body;
      if (!customer_id) throw new Error("customer_id required");
      const si = await stripe.setupIntents.create({
        customer: customer_id,
        payment_method_types: ["card"],
        usage: "off_session",
      });
      return json({ ok: true, client_secret: si.client_secret });
    }

    /* ── list_payment_methods ──────────────────────────
       Lists saved cards for a customer.
       body: { action, customer_id }
       Returns: { payment_methods: [...] }
    ─────────────────────────────────────────────────── */
    if (action === "list_payment_methods") {
      const { customer_id } = body;
      if (!customer_id) throw new Error("customer_id required");
      const pms = await stripe.paymentMethods.list({
        customer: customer_id,
        type: "card",
      });
      return json({ ok: true, payment_methods: pms.data.map(pm => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        exp_month: pm.card?.exp_month,
        exp_year: pm.card?.exp_year,
      })) });
    }

    /* ── charge_subscription ───────────────────────────
       Charges a saved payment method off-session.
       body: { action, customer_id, payment_method_id, amount_cents, description }
       Returns: { ok, payment_intent_id, status }
    ─────────────────────────────────────────────────── */
    if (action === "charge_subscription") {
      const { customer_id, payment_method_id, amount_cents, description } = body;
      if (!customer_id || !payment_method_id || !amount_cents) throw new Error("customer_id, payment_method_id, amount_cents required");
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(amount_cents),
        currency: "usd",
        customer: customer_id,
        payment_method: payment_method_id,
        off_session: true,
        confirm: true,
        description: description || "Subscription charge",
      });
      return json({ ok: true, payment_intent_id: pi.id, status: pi.status });
    }

    /* ── detach_payment_method ─────────────────────────
       Removes a saved card.
       body: { action, payment_method_id }
    ─────────────────────────────────────────────────── */
    if (action === "detach_payment_method") {
      const { payment_method_id } = body;
      await stripe.paymentMethods.detach(payment_method_id);
      return json({ ok: true });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: { "content-type": "application/json", ...CORS },
    });
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json", ...CORS },
  });
}
