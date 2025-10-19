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
    const session_id = String(body?.session_id || "").trim();
    
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), { status: 400, headers: CORS });
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), { status: 500, headers: CORS });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ✅ SIN EXPAND - Esto evita el error
    const session = await stripe.checkout.sessions.retrieve(session_id);

    const paymentStatus = session.payment_status;
    const sessionStatus = session.status;
    
    const paid = paymentStatus === "paid" || sessionStatus === "complete";
    
    let status = "pending";
    if (paid) {
      status = "complete";
    } else if (sessionStatus === "expired") {
      status = "expired";
    } else if (sessionStatus === "open") {
      status = "open";
    }

    const amount = session.amount_total ?? 0;
    const currency = session.currency ?? "usd";

    return new Response(
      JSON.stringify({
        ok: true,
        status,
        paid,
        amount,
        currency,
        sessionId: session.id,
        payment_status: paymentStatus,
        session_status: sessionStatus,
      }),
      { status: 200, headers: CORS }
    );
  } catch (e) {
    console.error("check_checkout_session error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500,
      headers: CORS,
    });
  }
});