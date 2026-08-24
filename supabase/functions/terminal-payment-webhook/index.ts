import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPaymentReceiptEmail } from "../_shared/paymentReceiptEmail.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const stripeKey = Deno.env.get("STRIPE_TERMINAL_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("TERMINAL_STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return json({ error: "Webhook is not configured" }, 500);

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      req.headers.get("stripe-signature") || "",
      webhookSecret,
    );
  } catch (error) {
    console.error("terminal-payment-webhook: invalid signature", error);
    return json({ error: "Invalid signature" }, 400);
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return json({ received: true, ignored: event.type });
  }

  const checkout = event.data.object as Stripe.Checkout.Session;
  if (checkout.metadata?.source !== "tools4care_manual_card" || checkout.payment_status !== "paid") {
    return json({ received: true, ignored: "not a paid Tools4Care link" });
  }

  const sessionId = String(checkout.metadata?.terminal_session_id || "");
  const intentId = typeof checkout.payment_intent === "string" ? checkout.payment_intent : checkout.payment_intent?.id;
  if (!sessionId || !intentId) return json({ error: "Missing payment metadata" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: session, error: sessionError } = await admin.from("terminal_payment_sessions")
    .select("*").eq("id", sessionId).maybeSingle();
  if (sessionError || !session) return json({ error: "Payment session not found" }, 404);

  let finalStatus = session.status;
  let applied = false;
  if (session.context_type === "ar_payment") {
    const { data, error } = await admin.rpc("terminal_apply_ar_payment", {
      p_session_id: session.id,
      p_cliente_id: session.cliente_id,
      p_van_id: session.van_id,
      p_operator_id: session.operator_id,
      p_monto: Number(session.amount_cents) / 100,
      p_payment_intent_id: intentId,
    });
    if (error) {
      await admin.from("terminal_payment_sessions").update({
        status: "reconciliation_pending", stripe_payment_intent_id: intentId,
        failure_code: error.code, failure_message: error.message, updated_at: new Date().toISOString(),
      }).eq("id", session.id);
      console.error("terminal-payment-webhook: reconciliation pending", { sessionId, error });
      return json({ error: "Reconciliation pending" }, 500);
    }
    applied = data?.[0]?.applied ?? true;
    finalStatus = "reconciled";
    if (applied) {
      const { error: allocationError } = await admin.rpc("aplicar_pago_a_cuotas", {
        p_cliente_id: session.cliente_id, p_monto: Number(session.amount_cents) / 100,
      });
      if (allocationError) console.error("terminal-payment-webhook: installment allocation", allocationError);
    }
  } else {
    // A sale payment is locked for the originating sale screen, but must not
    // reduce old CxC before that sale is saved.
    finalStatus = "succeeded";
  }

  await admin.from("terminal_payment_sessions").update({
    status: finalStatus, stripe_payment_intent_id: intentId, completed_at: new Date().toISOString(),
    reconciled_at: finalStatus === "reconciled" ? new Date().toISOString() : null,
    failure_code: null, failure_message: null, updated_at: new Date().toISOString(),
  }).eq("id", session.id);

  if (applied) {
    const [{ data: customer }, operatorAuth, { data: balance }] = await Promise.all([
      admin.from("clientes").select("nombre,negocio,email").eq("id", session.cliente_id).maybeSingle(),
      admin.auth.admin.getUserById(session.operator_id),
      admin.from("v_cxc_cliente_detalle_ext").select("saldo,score_base,limite_politica,credito_disponible").eq("cliente_id", session.cliente_id).maybeSingle(),
    ]);
    const customerName = customer?.negocio || customer?.nombre || "Customer";
    const subject = `Tools4Care payment received — ${customerName} — ${money(session.amount_cents)}`;
    const html = buildPaymentReceiptEmail({
      customerName,
      amount: Number(session.amount_cents) / 100,
      balanceAfter: Number(balance?.saldo || 0),
      reference: intentId,
      paymentChannel: "Secure payment link · Card",
      creditScore: Number(balance?.score_base || 600),
      creditLimit: Number(balance?.limite_politica || 0),
      availableCredit: Number(balance?.credito_disponible || 0),
    });
    const recipients = [...new Set([
      customer?.email,
      checkout.customer_details?.email,
      operatorAuth.data?.user?.email,
    ].map((v) => String(v || "").trim().toLowerCase()).filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))];
    for (const to of recipients) {
      const { error } = await admin.functions.invoke("send-order-email", { body: { to, subject, html } });
      if (error) console.error("terminal-payment-webhook: notification failed", { to, error });
    }
  }

  return json({ received: true, session_id: session.id, status: finalStatus, applied });
});
