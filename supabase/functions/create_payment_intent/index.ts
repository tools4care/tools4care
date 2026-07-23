// supabase/functions/create_payment_intent/index.ts
// Edge Function (Deno) para crear un PaymentIntent en Stripe.
//
// El monto NUNCA se toma del cliente: se recalcula aquí mismo a partir del
// cart_id (precios reales, stock, promo code y tax por estado), igual que
// lo hace Checkout.jsx en el navegador, para que nadie pueda manipular la
// petición y pagar menos de lo que su carrito realmente cuesta.

import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// =================== REGLAS DE PRECIO (deben calzar con Checkout.jsx) ===================
const SHIPPING_METHODS: Record<string, (sub: number) => number> = {
  pickup: () => 0,
  standard: (sub) => (sub >= 75 ? 0 : 6.99),
  express: () => 14.99,
};

const STATE_TAX: Record<string, number> = {
  FL: 0.06, NY: 0.08875, NJ: 0.06625, CA: 0.0725, TX: 0.0625, MA: 0.0625,
};

const LOCAL_CODES: Record<string, { type: "percent" | "amount" | "free_shipping"; value: number }> = {
  SAVE10: { type: "percent", value: 10 },
  WELCOME5: { type: "amount", value: 5 },
  FREESHIP: { type: "free_shipping", value: 0 },
};

const MIN_PAYMENT_CENTS = 50;

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

async function resolvePromoServer(admin: any, codeInput: string) {
  const code = String(codeInput || "").trim().toUpperCase();
  if (!code) return null;

  const { data, error } = await admin
    .from("discount_codes")
    .select("code, percent, active, expires_at, max_uses, times_used")
    .ilike("code", code)
    .maybeSingle();

  if (!error && data) {
    const now = new Date();
    const expired = data.expires_at ? new Date(data.expires_at) < now : false;
    const overUsed =
      typeof data.max_uses === "number" &&
      typeof data.times_used === "number" &&
      data.max_uses > 0 &&
      data.times_used >= data.max_uses;
    const pct = Number(data.percent || 0);
    if (data.active === false || expired || overUsed || pct <= 0) return null;
    return { code: String(data.code).toUpperCase(), type: "percent" as const, value: pct, freeShipping: false };
  }

  const local = LOCAL_CODES[code];
  if (!local) return null;
  return { code, type: local.type, value: Number(local.value || 0), freeShipping: local.type === "free_shipping" };
}

function computeDiscount(subtotal: number, promo: { type: string; value: number } | null) {
  const sub = Math.max(0, subtotal);
  if (!promo) return 0;
  if (promo.type === "percent") return Math.min(sub, (sub * Math.max(0, promo.value)) / 100);
  if (promo.type === "amount") return Math.min(sub, Math.max(0, promo.value));
  return 0;
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

    const metadataIn = typeof body?.metadata === "object" ? body.metadata : {};
    const cartId = String(body?.cart_id || metadataIn.cart_id || "").trim();
    if (!cartId) {
      return new Response(JSON.stringify({ error: "Missing cart_id" }), { status: 400, headers: CORS_HEADERS });
    }

    const shippingIn = sanitizeShipping(body?.shipping);
    const stateCode = String(shippingIn?.address?.state || "").toUpperCase();
    const shippingMethodKey = String(body?.shipping?.carrier || "standard");
    const promoCodeInput = String(metadataIn.promo_code || "");
    const freeShippingOverrideRequested = String(metadataIn.free_shipping_override || "") === "1";

    // ✅ 4. Validar clave de Stripe antes de tocar la base de datos
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    // ✅ 5. Cliente con service role: recalculamos con datos reales, sin fiarnos del navegador
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cartItems, error: ciErr } = await admin
      .from("cart_items")
      .select("producto_id, qty")
      .eq("cart_id", cartId);
    if (ciErr) throw ciErr;
    if (!cartItems || cartItems.length === 0) {
      return new Response(JSON.stringify({ error: "Cart is empty" }), { status: 400, headers: CORS_HEADERS });
    }

    const productIds = cartItems.map((i: any) => i.producto_id);
    const { data: products, error: pErr } = await admin
      .from("online_products_v")
      .select("id, price_base, price_online, stock")
      .in("id", productIds);
    if (pErr) throw pErr;
    const productMap = new Map((products || []).map((p: any) => [p.id, p]));

    let subtotal = 0;
    const stockIssues: string[] = [];
    for (const item of cartItems) {
      const p = productMap.get(item.producto_id);
      if (!p) continue;
      const qty = Number(item.qty || 0);
      const stock = Number(p.stock ?? 0);
      if (stock > 0 && qty > stock) stockIssues.push(String(item.producto_id));
      const unit = Number(p.price_online ?? p.price_base ?? 0);
      subtotal += qty * unit;
    }
    if (stockIssues.length > 0) {
      return new Response(
        JSON.stringify({ error: "Some items exceed available stock", stockIssues }),
        { status: 409, headers: CORS_HEADERS },
      );
    }

    const promo = promoCodeInput ? await resolvePromoServer(admin, promoCodeInput) : null;
    const discount = computeDiscount(subtotal, promo);
    const subAfterDiscount = Math.max(0, subtotal - discount);
    const freeShippingOverride = freeShippingOverrideRequested && promo?.freeShipping === true;

    const shippingCalc = SHIPPING_METHODS[shippingMethodKey] || SHIPPING_METHODS.standard;
    const shippingCost = freeShippingOverride ? 0 : Number(shippingCalc(subAfterDiscount) || 0);

    const taxRate = STATE_TAX[stateCode] || 0;
    const taxes = subAfterDiscount * taxRate;

    const total = Math.max(0, subAfterDiscount + shippingCost + taxes);
    const amount = Math.round(total * 100);

    if (!Number.isFinite(amount) || amount < MIN_PAYMENT_CENTS) {
      return new Response(JSON.stringify({ error: "Computed amount is too low" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const metadata = {
      cart_id: cartId,
      subtotal_cents: Math.round(subtotal * 100),
      discount_cents: Math.round(discount * 100),
      subtotal_after_discount_cents: Math.round(subAfterDiscount * 100),
      shipping_cents: Math.round(shippingCost * 100),
      taxes_cents: Math.round(taxes * 100),
      free_shipping_override: freeShippingOverride ? "1" : "0",
      promo_code: promo?.code || "",
    };

    const currency = (body?.currency ?? "usd").toLowerCase();

    // ✅ 6. Inicializar Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ✅ 7. Crear PaymentIntent con el monto calculado en el servidor
    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
      shipping: shippingIn,
    });

    // ✅ 8. Respuesta con headers CORS
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
