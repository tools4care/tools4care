// supabase/functions/check_payment_status/index.ts
// Edge Function para consultar el estado de un PaymentIntent en Stripe

import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // ⚠️ En producción reemplaza por tu dominio
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ev-anon, x-anon-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  // ✅ Manejo CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const paymentIntentId = body?.paymentIntentId;

    if (!paymentIntentId) {
      return new Response(JSON.stringify({ error: "Missing paymentIntentId" }), {
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
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return new Response(
      JSON.stringify({
        id: intent.id,
        status: intent.status,
        amount: intent.amount,
        currency: intent.currency,
        created: intent.created,
        latest_charge: intent.latest_charge,
      }),
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (e) {
    console.error("check_payment_status error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
