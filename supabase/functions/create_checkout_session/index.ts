import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  // ✅ Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }), 
      { status: 405, headers: CORS }
    );
  }

  try {
    // ✅ Parsear body
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    
    const { amount, currency, description, success_url, cancel_url } = body;

    // ✅ Validaciones
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount. Must be a positive number in cents." }), 
        { status: 400, headers: CORS }
      );
    }

    // ✅ Verificar API Key de Stripe
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      console.error("❌ STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Stripe configuration missing" }), 
        { status: 500, headers: CORS }
      );
    }

    // ✅ Inicializar Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    console.log("🔵 Creating Checkout Session:", { 
      amount, 
      currency: currency || "usd",
      description: description || "Pago de venta"
    });

    // ✅ Crear Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency || "usd",
            product_data: {
              name: description || "Pago de venta",
            },
            unit_amount: amount, // Ya viene en centavos desde el frontend
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: success_url || "https://example.com/success",
      cancel_url: cancel_url || "https://example.com/cancel",
      // ✅ Opcional: expira en 30 minutos
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
    });

    console.log("✅ Checkout Session created:", session.id);

    // ✅ Retornar URL y Session ID
    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
      }),
      { status: 200, headers: CORS }
    );

  } catch (error) {
    console.error("❌ create_checkout_session error:", error);
    
    // ✅ Manejo específico de errores de Stripe
    const errorMessage = error instanceof Error 
      ? error.message 
      : "Internal server error";

    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        type: error?.type || "unknown_error"
      }),
      { status: 500, headers: CORS }
    );
  }
});