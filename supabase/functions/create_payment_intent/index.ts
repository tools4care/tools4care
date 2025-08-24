// supabase/functions/create_payment_intent/index.ts
// Edge Function (Deno) para crear un Payment Intent en Stripe
// Soporta CORS y funciona con Apple Pay / Google Pay (vía Stripe Payment Request / Elements)

import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // en prod restringe a tu dominio
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount ?? 0); // en CENTAVOS (p.ej. $12.34 => 1234)
    const currency = (body?.currency ?? "usd").toLowerCase();
    const meta = body?.meta ?? {};

    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      return new Response(JSON.stringify({ error: "Invalid amount (must be integer cents > 0)." }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Usamos Automatic Payment Methods para habilitar Apple Pay / Google Pay
    // (en el frontend usarás PaymentElement/PaymentRequestButton)
    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: meta,
    });

    return new Response(JSON.stringify({ clientSecret: intent.client_secret }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
