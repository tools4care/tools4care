// supabase/functions/portal-payments/index.ts
// Edge Function (Deno) for the customer portal's "pay with card" flow.
//
// Two actions:
//   create_intent   — starts a Stripe PaymentIntent for the caller's own
//                      outstanding balance. The cliente_id is NEVER taken
//                      from the request — it's resolved server-side from
//                      cliente_usuarios, so a portal user can only ever pay
//                      against their own linked account.
//   confirm_payment — after Stripe confirms the card, re-verifies the
//                      PaymentIntent status directly with Stripe (never
//                      trusts the browser) and then applies it to the
//                      client's payment history and CxC ledger atomically via
//                      portal_apply_stripe_payment. Idempotent on the textual
//                      Stripe payment_intent_id.

import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPaymentReceiptEmail } from "../_shared/paymentReceiptEmail.ts";
import { formatCustomerDisplayName } from "../_shared/customerDisplay.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ev-anon, x-anon-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MIN_PAYMENT_CENTS = 50;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

async function resolveClienteId(admin: any, userId: string) {
  const { data: link } = await admin
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", userId)
    .maybeSingle();
  return link?.cliente_id || null;
}

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    const { action, payload } = await req.json();

    const clienteId = await resolveClienteId(admin, user.id);
    if (!clienteId) return json({ error: "This login isn't linked to a customer account" }, 403);

    if (action === "create_intent") {
      const { data: cliente, error: clienteError } = await admin
        .from("clientes")
        .select("id, nombre, negocio, tenant_id, email")
        .eq("id", clienteId)
        .maybeSingle();
      if (clienteError || !cliente) return json({ error: "Customer not found" }, 404);

      const { data: resumen, error: resumenError } = await admin
        .from("v_cxc_cliente_detalle_ext")
        .select("saldo, score_base, limite_politica, credito_disponible")
        .eq("cliente_id", clienteId)
        .maybeSingle();
      if (resumenError) return json({ error: "Could not read your balance" }, 400);

      const balanceCents = Math.round(Number(resumen?.saldo || 0) * 100);
      if (balanceCents < MIN_PAYMENT_CENTS) {
        return json({ error: "No outstanding balance to pay" }, 400);
      }

      const requestedCents = Math.round(Number(payload?.amount_cents || 0));
      const amount = Math.min(
        balanceCents,
        requestedCents > 0 ? requestedCents : balanceCents,
      );
      if (amount < MIN_PAYMENT_CENTS) return json({ error: "Amount is too low" }, 400);

      const intent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          source: "portal",
          cliente_id: clienteId,
          tenant_id: cliente.tenant_id || "",
          user_id: user.id,
        },
        description: `Tools4Care balance payment — ${formatCustomerDisplayName(cliente, clienteId)}`,
        // No receipt_email here on purpose — we send our own branded
        // "Payment received" email in confirm_payment below instead of
        // Stripe's generic receipt template.
      });

      return json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amount_cents: amount });
    }

    if (action === "confirm_payment") {
      const paymentIntentId = String(payload?.paymentIntentId || "").trim();
      if (!paymentIntentId) return json({ error: "Missing paymentIntentId" }, 400);

      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.metadata?.cliente_id !== clienteId) {
        return json({ error: "This payment does not belong to your account" }, 403);
      }
      if (intent.status !== "succeeded") {
        return json({ error: `Payment is not complete yet (status: ${intent.status})` }, 400);
      }

      const monto = intent.amount_received / 100;

      const { data: application, error: rpcError } = await admin.rpc("portal_apply_stripe_payment", {
        p_cliente_id: clienteId,
        p_monto: monto,
        p_payment_intent_id: paymentIntentId,
      });

      if (rpcError) {
        console.error("portal-payments: apply failed", {
          paymentIntentId, clienteId, code: rpcError.code, message: rpcError.message,
        });
        return json({
          error: "The card payment succeeded but account reconciliation is pending",
          reference: paymentIntentId,
          detail: rpcError.message,
        }, 503);
      }

      const { data: cliente } = await admin
        .from("clientes")
        .select("nombre, negocio, email")
        .eq("id", clienteId)
        .maybeSingle();

      const { data: resumenAfter } = await admin
        .from("v_cxc_cliente_detalle_ext")
        .select("saldo,score_base,limite_politica,credito_disponible")
        .eq("cliente_id", clienteId)
        .maybeSingle();
      const balanceAfter = Number(resumenAfter?.saldo || 0);

      const wasApplied = application?.[0]?.applied ?? true;
      const cleanEmail = String(cliente?.email || "").trim().toLowerCase();
      if (wasApplied && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        try {
          const { data: emailResult, error: emailError } = await admin.functions.invoke("send-order-email", {
            body: {
              to: cleanEmail,
              subject: `Payment received — ${money(monto)}`,
              html: buildPaymentReceiptEmail({
                customerName: formatCustomerDisplayName(cliente),
                amount: monto,
                balanceAfter,
                reference: paymentIntentId,
                paymentChannel: "Customer portal · Card",
                creditScore: Number(resumenAfter?.score_base || 600),
                creditLimit: Number(resumenAfter?.limite_politica || 0),
                availableCredit: Number(resumenAfter?.credito_disponible || 0),
              }),
            },
          });
          if (emailError || emailResult?.ok === false) {
            throw emailError || new Error(emailResult?.error || "Receipt service returned an error");
          }
        } catch (emailError) {
          // Non-fatal: the payment is already applied. A missed receipt
          // email shouldn't make the payment look like it failed.
          console.error("portal-payments: receipt email failed", emailError);
        }
      }

      return json({
        ok: true,
        amount: monto,
        balance_after: balanceAfter,
        applied: wasApplied,
        reference: paymentIntentId,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("❌ portal-payments error:", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
