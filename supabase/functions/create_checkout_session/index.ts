import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
  }

  try {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};

    const amount = Number(body?.amount);
    const currency = String(body?.currency || "usd").toLowerCase();

    const success_url = body?.success_url || "https://checkout.stripe.com/success";
    const cancel_url  = body?.cancel_url  || "https://checkout.stripe.com/cancel";

    if (!Number.isInteger(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), { status: 400, headers: CORS });
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), { status: 500, headers: CORS });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url,
      cancel_url,
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amount,
            product_data: { name: body?.description || "Pago de venta" },
          },
          quantity: 1,
        },
      ],
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
      }),
      { status: 200, headers: CORS }
    );
  } catch (e) {
    console.error("create_checkout_session error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500,
      headers: CORS,
    });
  }
});
