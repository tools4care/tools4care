import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function receiptHtml(name: string, amount: number, balance: number, reference: string, score: number, limit: number, available: number) {
  const date = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
    <div style="background:#172554;border-radius:20px;padding:28px 24px;color:#fff">
      <p style="margin:0;font-size:12px;font-weight:800;color:#bfdbfe">TOOLS4CARE</p>
      <h1 style="margin:6px 0 0;font-size:22px">Payment received</h1>
      <p style="margin:18px 0 0;font-size:13px;color:#bfdbfe">Amount paid</p>
      <p style="margin:2px 0 0;font-size:34px;font-weight:800">${money(amount)}</p>
    </div>
    <div style="padding:20px 4px">
      <p>Hi ${name || "there"},</p>
      <p>Your card payment has been applied to your Tools4Care account.</p>
      <p><b>Date:</b> ${date} ET<br><b>Reference:</b> ${reference}<br><b>Remaining balance:</b> ${money(balance)}<br><b>Credit score:</b> ${score}<br><b>Credit limit:</b> ${money(limit)}<br><b>Available credit:</b> ${money(available)}</p>
      <p style="font-size:13px;color:#64748b">Questions? Call (978) 594-1624.</p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("PORTAL_STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return response({ error: "Webhook is not configured" }, 500);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return response({ error: "Missing Stripe signature" }, 400);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, webhookSecret);
  } catch (error) {
    console.error("portal-payment-webhook: invalid signature", error);
    return response({ error: "Invalid signature" }, 400);
  }

  if (event.type !== "payment_intent.succeeded") {
    return response({ received: true, ignored: event.type });
  }

  const intent = event.data.object as Stripe.PaymentIntent;
  if (intent.metadata?.source !== "portal") {
    return response({ received: true, ignored: "not a portal payment" });
  }

  const clienteId = String(intent.metadata?.cliente_id || "");
  const amount = Number(intent.amount_received || 0) / 100;
  if (!clienteId || amount <= 0) return response({ error: "Invalid portal payment metadata" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: application, error: applyError } = await admin.rpc("portal_apply_stripe_payment", {
    p_cliente_id: clienteId,
    p_monto: amount,
    p_payment_intent_id: intent.id,
  });
  if (applyError) {
    console.error("portal-payment-webhook: apply failed", { intent: intent.id, error: applyError });
    return response({ error: "Could not apply portal payment" }, 500);
  }

  const applied = application?.[0]?.applied ?? true;
  if (applied) {
    const [{ data: customer }, { data: summary }] = await Promise.all([
      admin.from("clientes").select("nombre,negocio,email").eq("id", clienteId).maybeSingle(),
      admin.from("v_cxc_cliente_detalle_ext").select("saldo,score_base,limite_politica,credito_disponible").eq("cliente_id", clienteId).maybeSingle(),
    ]);
    const email = String(customer?.email || "").trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const { data: emailResult, error: emailError } = await admin.functions.invoke("send-order-email", {
        body: {
          to: email,
          subject: `Payment received — ${money(amount)}`,
          html: receiptHtml(customer?.negocio || customer?.nombre || "", amount, Number(summary?.saldo || 0), intent.id, Number(summary?.score_base || 600), Number(summary?.limite_politica || 0), Number(summary?.credito_disponible || 0)),
        },
      });
      if (emailError || emailResult?.ok === false) {
        console.error("portal-payment-webhook: receipt failed", emailError || emailResult);
      }
    }
  }

  return response({ received: true, applied, reference: intent.id });
});
