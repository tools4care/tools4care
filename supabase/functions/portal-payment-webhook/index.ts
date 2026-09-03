import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPaymentReceiptEmail } from "../_shared/paymentReceiptEmail.ts";
import { formatCustomerDisplayName } from "../_shared/customerDisplay.ts";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
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
          html: buildPaymentReceiptEmail({
            customerName: formatCustomerDisplayName(customer),
            amount,
            balanceAfter: Number(summary?.saldo || 0),
            reference: intent.id,
            paymentChannel: "Customer portal · Card",
            creditScore: Number(summary?.score_base || 600),
            creditLimit: Number(summary?.limite_politica || 0),
            availableCredit: Number(summary?.credito_disponible || 0),
          }),
        },
      });
      if (emailError || emailResult?.ok === false) {
        console.error("portal-payment-webhook: receipt failed", emailError || emailResult);
      }
    }
  }

  return response({ received: true, applied, reference: intent.id });
});
