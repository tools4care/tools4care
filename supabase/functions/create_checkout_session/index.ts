import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return json({ ok: false, error: "Invalid amount. Send integer amount in cents." }, 400);
    }

    const secret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!secret) return json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, 500);

    const currency = String(body?.currency || "usd").toLowerCase();
    const description = String(body?.description || "Pago de venta").trim().slice(0, 200) || "Pago de venta";
    const success_url = String(body?.success_url || "https://checkout.stripe.com/success");
    const cancel_url = String(body?.cancel_url || "https://checkout.stripe.com/cancel");
    const stripe = new Stripe(secret, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url,
      cancel_url,
      line_items: [{
        price_data: {
          currency,
          unit_amount: amount,
          product_data: { name: description },
        },
        quantity: 1,
      }],
      automatic_tax: { enabled: false },
    });

    return json({
      ok: true,
      url: session.url,
      sessionId: session.id,
      session_id: session.id,
      amount,
      currency,
    });
  } catch (error) {
    console.error("create_checkout_session error:", error);
    return json({ ok: false, error: error?.message || "Internal error" }, 500);
  }
});
