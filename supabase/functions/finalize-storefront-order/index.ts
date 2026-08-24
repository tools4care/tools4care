import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!stripeKey || !supabaseUrl || !serviceKey) return json({ error: "Server is not configured" }, 500);

    const body = await req.json();
    const paymentIntentId = String(body?.payment_intent_id || "").trim();
    const cartId = String(body?.cart_id || "").trim();
    if (!paymentIntentId || !cartId) return json({ error: "Payment and cart are required" }, 400);

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") return json({ error: "Payment is not approved" }, 409);
    if (String(intent.metadata?.cart_id || "") !== cartId) return json({ error: "Payment does not match this cart" }, 403);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: existing } = await admin.from("orders").select("id").eq("payment_intent_id", paymentIntentId).maybeSingle();
    if (existing?.id) return json({ ok: true, order_id: existing.id, already_finalized: true });

    const { data: cartItems, error: cartError } = await admin
      .from("cart_items").select("producto_id,qty").eq("cart_id", cartId);
    if (cartError) throw cartError;
    if (!cartItems?.length) return json({ error: "Cart is empty" }, 409);

    const productIds = cartItems.map((item: any) => item.producto_id);
    const [{ data: products, error: productError }, { data: prices, error: priceError }] = await Promise.all([
      admin.from("productos").select("id,nombre,marca,codigo").in("id", productIds),
      admin.from("online_products_v").select("id,price_base,price_online").in("id", productIds),
    ]);
    if (productError) throw productError;
    if (priceError) throw priceError;
    const productMap = new Map((products || []).map((product: any) => [product.id, product]));
    const priceMap = new Map((prices || []).map((price: any) => [price.id, price]));
    const items = cartItems.map((item: any) => {
      const product: any = productMap.get(item.producto_id);
      const price: any = priceMap.get(item.producto_id);
      if (!product) throw new Error(`Product ${item.producto_id} is unavailable`);
      return {
        producto_id: item.producto_id,
        nombre: product.nombre,
        qty: Number(item.qty || 0),
        precio_unit: Number(price?.price_online ?? price?.price_base ?? 0),
        marca: product.marca,
        codigo: product.codigo,
        taxable: true,
      };
    });

    const shipping = body?.shipping || {};
    const metadata = intent.metadata || {};
    const cents = (key: string) => Number(metadata[key] || 0) / 100;
    const order = {
      payment_intent_id: intent.id,
      amount_total: Number(intent.amount_received || intent.amount || 0) / 100,
      amount_subtotal: cents("subtotal_cents"),
      amount_shipping: cents("shipping_cents"),
      amount_taxes: cents("taxes_cents"),
      amount_discount: cents("discount_cents"),
      currency: intent.currency || "usd",
      email: String(shipping.email || intent.receipt_email || "").trim() || null,
      phone: String(shipping.phone || intent.shipping?.phone || "").replace(/\D/g, "") || null,
      name: String(shipping.name || intent.shipping?.name || "").trim() || null,
      address_json: shipping.address_json || intent.shipping?.address || null,
      promo_code: metadata.promo_code || null,
    };

    const { data: orderId, error: finalizeError } = await admin.rpc("finalize_storefront_order", {
      p_order: order,
      p_items: items,
    });
    if (finalizeError) throw finalizeError;

    await admin.from("cart_items").delete().eq("cart_id", cartId);
    return json({ ok: true, order_id: orderId });
  } catch (error: any) {
    console.error("finalize-storefront-order", error);
    return json({ error: error?.message || "Could not finalize order" }, 500);
  }
});
