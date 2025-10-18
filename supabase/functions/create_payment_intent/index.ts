// supabase/functions/create_payment_intent/index.ts
// Edge Function (Deno) para crear un PaymentIntent en Stripe

import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";

// =================== CONFIGURACIÓN CORS ===================
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // ⚠️ En producción limita a tu dominio
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ev-anon, x-anon-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

// =================== TIPADO OPCIONAL ===================
type ShippingInput = {
  name?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
};

// =================== HELPERS ===================
function sanitizeShipping(s: any): ShippingInput | undefined {
  if (!s || typeof s !== "object") return undefined;
  const a = s.address || {};
  return {
    name: s.name || undefined,
    phone: s.phone || undefined,
    address: {
      line1: a.line1 || undefined,
      line2: a.line2 || undefined,
      city: a.city || undefined,
      state: a.state || undefined,
      postal_code: a.postal_code || undefined,
      country: a.country || undefined,
    },
  };
}

// =================== MAIN HANDLER ===================
Deno.serve(async (req) => {
  // ✅ 1. Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  // ✅ 2. Solo acepta POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    // ✅ 3. Leer body seguro
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};

    const amount = Number(body?.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount (must be integer cents > 0)" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const currency = (body?.currency ?? "usd").toLowerCase();
    const metadata =
      typeof body?.metadata === "object"
        ? body.metadata
        : typeof body?.meta === "object"
        ? body.meta
        : {};
    const shipping = sanitizeShipping(body?.shipping);

    // ✅ 4. Validar clave
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    // ✅ 5. Inicializar Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ✅ 6. Crear PaymentIntent
    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
      shipping,
    });

    // ✅ 7. Respuesta con headers CORS
    return new Response(
      JSON.stringify({
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        status: intent.status,
      }),
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (e) {
    console.error("❌ create_payment_intent error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
