// supabase/functions/create_checkout_session/index.ts
// Edge Function (Deno) para crear una Stripe Checkout Session “blindada”

import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";

/* ===================== CORS ===================== */
function buildCorsHeaders(req: Request) {
  // CSV de orígenes permitidos en env, por ejemplo:
  // CORS_ALLOW_ORIGINS=https://miapp.com,https://staging.miapp.com,http://localhost:5173
  const allowList = (Deno.env.get("CORS_ALLOW_ORIGINS") || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const origin = req.headers.get("Origin") || "*";
  const allowOrigin = allowList.includes("*") || allowList.includes(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

/* ===================== Utilidades ===================== */
const SUPPORTED_CURRENCIES = new Set([
  "usd","mxn","eur","cad","gbp","clp","cop","pen","ars","brl"
]);

function safeJson<T = unknown>(raw: string | null): T {
  try { return (raw ? JSON.parse(raw) : {}) as T; }
  catch { return {} as T; }
}

function clampDescription(v: unknown, fallback = "Pago de venta") {
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  return s.slice(0, 200); // corta a 200 chars para evitar valores enormes
}

/* ===================== Handler ===================== */
Deno.serve(async (req) => {
  const CORS = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: CORS,
    });
  }

  try {
    type Body = {
      amount?: number;              // en CENTAVOS (recomendado)
      amount_dollars?: number;      // opcional: en dólares, se multiplica por 100
      currency?: string;            // por defecto "usd"
      description?: string;
      success_url?: string;
      cancel_url?: string;
      customer_email?: string | null;
      customer_name?: string | null;
      metadata?: Record<string, string | number | boolean | null>;
    };

    const raw = await req.text();
    const body = safeJson<Body>(raw);

    // --- Normaliza moneda
    const currency = String(body.currency || "usd").toLowerCase();
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      return new Response(JSON.stringify({ ok: false, error: `Unsupported currency '${currency}'` }), {
        status: 400, headers: CORS,
      });
    }

    // --- Normaliza monto
    // Preferimos amount en CENTAVOS. Si te mandan amount_dollars, lo convertimos.
    let amount = Number.isFinite(body.amount) ? Number(body.amount) : NaN;
    if (!Number.isInteger(amount) || amount <= 0) {
      const dollars = Number(body.amount_dollars);
      if (Number.isFinite(dollars) && dollars > 0) {
        amount = Math.round(dollars * 100); // convierte a centavos
      }
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Invalid amount. Send integer 'amount' (cents > 0) or positive 'amount_dollars'."
      }), { status: 400, headers: CORS });
    }

    // --- URLs de éxito/cancel (pueden ser temporales en dev)
    const success_url = body.success_url || "https://checkout.stripe.com/success";
    const cancel_url  = body.cancel_url  || "https://checkout.stripe.com/cancel";

    // --- Descripción “segura”
    const description = clampDescription(body.description, "Pago de venta");

    // --- Stripe secret
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing STRIPE_SECRET_KEY" }), {
        status: 500, headers: CORS,
      });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // --- Construye metadatos opcionales y los sanea a string
    const md: Record<string, string> = {};
    if (body.metadata && typeof body.metadata === "object") {
      for (const [k, v] of Object.entries(body.metadata)) {
        // Stripe metadata exige strings
        md[k] = v === null || v === undefined ? "" : String(v);
      }
    }
    if (body.customer_email) md.customer_email = String(body.customer_email);
    if (body.customer_name)  md.customer_name  = String(body.customer_name);

    // --- Crea la Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url,
      cancel_url,
      line_items: [{
        price_data: {
          currency,
          unit_amount: amount, // CENTAVOS
          product_data: { name: description },
        },
        quantity: 1,
      }],
      automatic_tax: { enabled: false },
      metadata: md,
      // Opcional: limita métodos de pago si lo deseas
      // payment_method_types: ["card"],
    });

    return new Response(JSON.stringify({
      ok: true,
      url: session.url,      // URL para el QR
      sessionId: session.id, // para polling
      amount,
      currency,
    }), { status: 200, headers: CORS });

  } catch (e) {
    console.error("create_checkout_session error:", e);
    const message = (e && typeof e === "object" && "message" in e) ? (e as any).message : "Internal error";
    return new Response(JSON.stringify({ ok: false, error: String(message) }), {
      status: 500,
      headers: CORS,
    });
  }
});
