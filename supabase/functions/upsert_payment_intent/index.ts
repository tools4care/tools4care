// supabase/functions/upsert_payment_intent/index.ts
// Crea o ACTUALIZA un PaymentIntent (idempotencia de checkout)
// Body JSON esperado:
// {
//   "amount": 1999,                        // centavos
//   "currency": "usd",                     // opcional (default "usd")
//   "metadata": { "foo": "bar" },          // opcional
//   "shipping": {                          // opcional
//     "name": "Test",
//     "phone": "5551234567",
//     "address": {
//       "line1": "123 Main",
//       "line2": "Apt 1",
//       "city": "Miami",
//       "state": "FL",
//       "postal_code": "33101",
//       "country": "US"
//     },
//     "carrier": "standard"                // opcional
//   },
//   "payment_intent_id": "pi_..."          // opcional (para actualizar)
// }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@13.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // o cámbialo a tu dominio si quieres restringir
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

function sanitizeAmount(a: unknown) {
  const n = Number(a);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function sanitizeShipping(s: any) {
  if (!s || typeof s !== "object") return undefined;
  const address = s.address ?? {};
  return {
    name: s.name || undefined,
    phone: s.phone || undefined,
    carrier: s.carrier || undefined,
    address: {
      line1: address.line1 || undefined,
      line2: address.line2 || undefined,
      city: address.city || undefined,
      state: address.state || undefined,
      postal_code: address.postal_code || undefined,
      country: address.country || undefined,
    },
  };
}

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ code: 405, message: "Method not allowed" }, 405);
    }

    const body = await req.json().catch(() => ({}));
    const amount = sanitizeAmount(body?.amount);
    const currency = (body?.currency || "usd").toLowerCase();
    const metadata = (body?.metadata && typeof body.metadata === "object") ? body.metadata : {};
    const shipping = sanitizeShipping(body?.shipping);
    const payment_intent_id: string | undefined = body?.payment_intent_id || undefined;

    if (!amount) {
      return jsonResponse({ code: 400, message: "Invalid amount (must be integer cents > 0)" }, 400);
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      console.error("Missing STRIPE_SECRET_KEY secret");
      return jsonResponse({ code: 500, message: "Server misconfigured: missing STRIPE_SECRET_KEY" }, 500);
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    // Si nos pasan un payment_intent_id, intentamos actualizar
    if (payment_intent_id) {
      try {
        const existing = await stripe.paymentIntents.retrieve(payment_intent_id);

        // Si ya está 'succeeded' devolvemos tal cual (no hay client_secret nuevo).
        if (existing.status === "succeeded" || existing.status === "canceled") {
          return jsonResponse({
            clientSecret: existing.client_secret, // puede venir null si está succeeded; el front debe manejarlo
            paymentIntentId: existing.id,
            status: existing.status,
          });
        }

        // Actualizamos monto / metadata / shipping; activamos APM si no estaba
        const updated = await stripe.paymentIntents.update(existing.id, {
          amount,
          currency: currency || existing.currency,
          metadata,
          shipping,
          automatic_payment_methods: { enabled: true },
        });

        return jsonResponse({
          clientSecret: updated.client_secret,
          paymentIntentId: updated.id,
          status: updated.status,
        });
      } catch (e) {
        console.warn("PI update failed, will create new one:", e?.message || e);
        // (seguimos a crear uno nuevo abajo)
      }
    }

    // Crear uno nuevo
    const created = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
      shipping,
      automatic_payment_methods: { enabled: true },
    });

    return jsonResponse({
      clientSecret: created.client_secret,
      paymentIntentId: created.id,
      status: created.status,
    });
  } catch (err) {
    console.error("upsert_payment_intent error:", err);
    const message = err?.message || "Unexpected error";
    return jsonResponse({ code: 500, message }, 500);
  }
});
