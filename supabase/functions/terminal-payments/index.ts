import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const TERMS_VERSION = "card-on-file-v1-2026-08-14";
const TERMS_TEXT = "I authorize Tools4Care to securely save this payment method with Stripe for future payments that I approve.";
const SESSION_TTL_MS = 10 * 60 * 1000;
const ALLOWED_ROLES = new Set(["admin", "supervisor", "vendedor"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function cleanText(value: unknown, max = 200) {
  return String(value || "").trim().slice(0, max);
}

async function requireStaff(req: Request, admin: any) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw Object.assign(new Error("Missing authorization"), { status: 401 });

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const { data: staff, error } = await admin
    .from("usuarios")
    .select("id,rol,activo,tenant_id,nombre")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !staff || staff.activo === false || !ALLOWED_ROLES.has(String(staff.rol || "").toLowerCase())) {
    throw Object.assign(new Error("Staff payment access required"), { status: 403 });
  }
  return staff;
}

async function getTerminalSettings(admin: any, tenantId: string | null) {
  let query = admin.from("terminal_payment_settings").select("*");
  query = tenantId ? query.eq("tenant_id", tenantId) : query.eq("scope_key", "legacy");
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function requireCompanionSession(admin: any, token: string) {
  if (!token || token.length < 40) throw Object.assign(new Error("Invalid companion token"), { status: 401 });
  const tokenHash = await sha256(token);
  const { data: session, error } = await admin
    .from("terminal_payment_sessions")
    .select("*")
    .eq("companion_token_hash", tokenHash)
    .maybeSingle();
  if (error || !session) throw Object.assign(new Error("Payment session not found"), { status: 404 });
  if (new Date(session.companion_token_expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error("Payment session expired"), { status: 410 });
  }
  if (["cancelled", "failed", "reconciled"].includes(session.status)) {
    throw Object.assign(new Error(`Payment session is ${session.status}`), { status: 409 });
  }
  return session;
}

Deno.serve(async (req) => {
  // Branded short-link redirect for customer-facing manual card payments.
  // The Checkout Session ID is an opaque, single-payment reference; Stripe
  // still hosts and collects all card data.
  if (req.method === "GET") {
    try {
      const checkoutId = cleanText(new URL(req.url).searchParams.get("redirect_session"), 180);
      if (!checkoutId.startsWith("cs_")) return new Response("Invalid payment link", { status: 400 });
      const redirectKey = Deno.env.get("STRIPE_TERMINAL_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY");
      if (!redirectKey) return new Response("Payment link unavailable", { status: 503 });
      const redirectStripe = new Stripe(redirectKey, { apiVersion: "2024-06-20" });
      const checkout: any = await redirectStripe.checkout.sessions.retrieve(checkoutId);
      if (checkout.status === "expired") return new Response("This payment link has expired", { status: 410 });
      if (!checkout.url) return new Response("Payment link unavailable", { status: 404 });
      return Response.redirect(checkout.url, 302);
    } catch (error) {
      console.error("terminal-payments short link", error);
      return new Response("Payment link unavailable", { status: 404 });
    }
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Terminal has its own environment credentials so a simulated pilot can
    // run in Stripe Test without changing portal or production card payments.
    const stripeKey = Deno.env.get("STRIPE_TERMINAL_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Missing Stripe Terminal secret key" }, 500);
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    const terminalTestMode = stripeKey.includes("_test_");
    const configuredTerminalLocation = Deno.env.get("STRIPE_TERMINAL_LOCATION_ID") || "";
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 50);
    const payload = body?.payload || {};

    if (action === "feature_status") {
      const staff = await requireStaff(req, admin);
      const settings = await getTerminalSettings(admin, staff.tenant_id);
      const savedCardsEnabled = Deno.env.get("TERMINAL_SAVED_CARDS_ENABLED") === "true"
        || settings?.saved_cards_enabled === true;
      return json({
        ok: true,
        android_tap_to_pay_enabled: settings?.android_tap_to_pay_enabled === true,
        saved_cards_enabled: savedCardsEnabled,
      });
    }

    if (action === "list_saved_methods") {
      const staff = await requireStaff(req, admin);
      const clienteId = cleanText(payload.cliente_id, 40) || null;
      const { data: cliente } = await admin.from("clientes")
        .select("id,tenant_id").eq("id", clienteId).maybeSingle();
      // Customers created before multi-tenant rollout have tenant_id NULL.
      // They remain scoped to the legacy Tools4Care installation.
      if (!cliente || (cliente.tenant_id !== staff.tenant_id && cliente.tenant_id !== null)) {
        return json({ error: "Customer not found" }, 404);
      }
      const { data, error } = await admin.from("customer_payment_methods")
        .select("id,brand,last4,exp_month,exp_year,funding,is_default,created_at")
        .eq("cliente_id", clienteId).eq("status", "active")
        .order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ ok: true, payment_methods: data || [] });
    }

    if (action === "session_status") {
      const staff = await requireStaff(req, admin);
      const sessionId = cleanText(payload.session_id, 40);
      const { data: session, error } = await admin.from("terminal_payment_sessions")
        .select("id,status,operator_id,tenant_id,cliente_id,van_id,context_type,amount_cents,stripe_payment_intent_id,saved_payment_method_id,companion_token_expires_at,failure_message,completed_at")
        .eq("id", sessionId).maybeSingle();
      if (error || !session) return json({ error: "Payment session not found" }, 404);
      if (session.tenant_id !== staff.tenant_id) return json({ error: "Payment session access denied" }, 403);
      if (session.operator_id !== staff.id && !["admin", "supervisor"].includes(String(staff.rol || "").toLowerCase())) {
        return json({ error: "Payment session access denied" }, 403);
      }
      let currentStatus = session.status;
      let currentFailure = session.failure_message;
      if (["ready", "awaiting_consent", "created", "collecting", "processing"].includes(currentStatus)
        && session.companion_token_expires_at && new Date(session.companion_token_expires_at).getTime() < Date.now()) {
        currentStatus = "cancelled";
        currentFailure = "Payment session expired before the Android companion completed it";
        await admin.from("terminal_payment_sessions").update({
          status: "cancelled", failure_code: "session_expired", failure_message: currentFailure,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", session.id);
      }
      if (currentStatus === "reconciliation_pending" && session.context_type === "ar_payment" && session.stripe_payment_intent_id) {
        const { error: retryError } = await admin.rpc("terminal_apply_ar_payment", {
          p_session_id: session.id, p_cliente_id: session.cliente_id, p_van_id: session.van_id,
          p_operator_id: session.operator_id, p_monto: session.amount_cents / 100,
          p_payment_intent_id: session.stripe_payment_intent_id,
        });
        if (!retryError) {
          currentStatus = "reconciled"; currentFailure = null;
          await admin.from("terminal_payment_sessions").update({
            status: "reconciled", failure_code: null, failure_message: null,
            reconciled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("id", session.id);
        } else {
          currentFailure = retryError.message;
          await admin.from("terminal_payment_sessions").update({
            failure_code: retryError.code, failure_message: retryError.message, updated_at: new Date().toISOString(),
          }).eq("id", session.id);
        }
      }

      // Recovery path: Stripe can approve the card before the Android
      // companion finishes its sync_result callback. Never ask the operator
      // to charge again in that window. Read the same PaymentIntent and move
      // the existing session forward idempotently.
      if (["ready", "awaiting_consent", "created", "collecting", "processing"].includes(currentStatus)
        && session.stripe_payment_intent_id) {
        const intent: any = await stripe.paymentIntents.retrieve(session.stripe_payment_intent_id);
        if (intent.status === "succeeded") {
          let recoveredStatus = "reconciled";
          if (session.context_type === "ar_payment") {
            const { error: applyError } = await admin.rpc("terminal_apply_ar_payment", {
              p_session_id: session.id,
              p_cliente_id: session.cliente_id,
              p_van_id: session.van_id,
              p_operator_id: session.operator_id,
              p_monto: session.amount_cents / 100,
              p_payment_intent_id: intent.id,
            });
            recoveredStatus = applyError ? "reconciliation_pending" : "reconciled";
            if (applyError) currentFailure = applyError.message;
          }
          currentStatus = recoveredStatus;
          await admin.from("terminal_payment_sessions").update({
            status: recoveredStatus,
            stripe_payment_intent_id: intent.id,
            failure_message: currentFailure,
            completed_at: new Date().toISOString(),
            reconciled_at: recoveredStatus === "reconciled" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }).eq("id", session.id);
        }
      }
      return json({
        ok: true, session_id: session.id, status: currentStatus,
        context_type: session.context_type, amount_cents: session.amount_cents,
        card_saved: Boolean(session.saved_payment_method_id),
        failure_message: currentFailure, completed_at: session.completed_at,
      });
    }

    if (action === "create_manual_checkout") {
      const staff = await requireStaff(req, admin);
      const clienteId = cleanText(payload.cliente_id, 40) || null;
      const contextType = cleanText(payload.context_type, 30);
      const contextId = cleanText(payload.context_id, 40) || null;
      const amountCents = Math.round(Number(payload.amount_cents || 0));
      const sendEmail = payload.send_email === true;
      const idempotencyKey = cleanText(payload.idempotency_key, 180);
      if (!clienteId || !idempotencyKey || !["sale", "ar_payment"].includes(contextType)) {
        return json({ error: "Missing or invalid manual payment fields" }, 400);
      }
      if (amountCents < 50) return json({ error: "Payment amount is too low" }, 400);

      const [settings, { data: cliente, error: clienteError }] = await Promise.all([
        getTerminalSettings(admin, staff.tenant_id),
        admin.from("clientes").select("id,nombre,negocio,email,telefono,tenant_id").eq("id", clienteId).maybeSingle(),
      ]);
      if (clienteError || !cliente || cliente.tenant_id !== staff.tenant_id) return json({ error: "Customer not found" }, 404);
      if (contextType === "ar_payment") {
        const { data: balanceRow, error: balanceError } = await admin.from("v_cxc_cliente_detalle_ext")
          .select("saldo").eq("cliente_id", clienteId).maybeSingle();
        if (balanceError) throw balanceError;
        const balanceCents = Math.round(Number(balanceRow?.saldo || 0) * 100);
        if (balanceCents < 50) return json({ error: "Customer has no outstanding balance" }, 409);
        if (amountCents > balanceCents) return json({ error: "Payment exceeds current customer balance" }, 409);
      }

      let { data: link } = await admin.from("stripe_customer_links")
        .select("stripe_customer_id").eq("cliente_id", clienteId).maybeSingle();
      if (!link) {
        const customer = await stripe.customers.create({
          name: cliente.negocio || cliente.nombre || undefined,
          email: cliente.email || undefined,
          phone: cliente.telefono || undefined,
          metadata: { tools4care_cliente_id: clienteId, tools4care_tenant_id: staff.tenant_id || "legacy" },
        }, { idempotencyKey: `t4c-customer-${clienteId}` });
        const created = await admin.from("stripe_customer_links").insert({
          tenant_id: staff.tenant_id, cliente_id: clienteId, stripe_customer_id: customer.id,
        }).select("stripe_customer_id").single();
        if (created.error) throw created.error;
        link = created.data;
      }

      const auditToken = randomToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data: audit, error: auditError } = await admin.from("terminal_payment_sessions").insert({
        tenant_id: staff.tenant_id, cliente_id: clienteId, van_id: payload.van_id || null,
        operator_id: staff.id, device_id: "stripe-hosted-checkout", context_type: contextType,
        context_id: contextId, amount_cents: amountCents, idempotency_key: idempotencyKey,
        companion_token_hash: await sha256(auditToken), companion_token_expires_at: expiresAt,
        status: "processing", save_offered: true, save_requested: false,
      }).select("id").single();
      if (auditError) throw auditError;

      const metadata = {
        source: "tools4care_manual_card", terminal_session_id: audit.id, cliente_id: clienteId,
        tenant_id: staff.tenant_id || "legacy", operator_id: staff.id,
        context_type: contextType, context_id: contextId || "",
      };
      const appUrl = (Deno.env.get("PUBLIC_APP_URL") || "https://tools4care.vercel.app").replace(/\/$/, "");
      const savedCardsEnabled = Deno.env.get("TERMINAL_SAVED_CARDS_ENABLED") === "true"
        || settings?.saved_cards_enabled === true;
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment", customer: link.stripe_customer_id, payment_method_types: ["card"],
        line_items: [{ quantity: 1, price_data: {
          currency: "usd", unit_amount: amountCents,
          product_data: { name: `Tools4Care payment — ${cliente.negocio || cliente.nombre || "Customer"}` },
        } }],
        success_url: `${appUrl}/payment-success?manual_checkout={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/payment-cancelled`,
        saved_payment_method_options: savedCardsEnabled ? { payment_method_save: "enabled" } : undefined,
        payment_intent_data: { metadata }, metadata,
      }, { idempotencyKey });
      await admin.from("terminal_payment_sessions").update({
        stripe_payment_intent_id: typeof checkout.payment_intent === "string" ? checkout.payment_intent : null,
        updated_at: new Date().toISOString(),
      }).eq("id", audit.id);

      const cleanEmail = String(cliente.email || "").trim().toLowerCase();
      let emailQueued = false;
      if (sendEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        const shortUrl = `${appUrl}/pay/${checkout.id}`;
        const customerName = cliente.negocio || cliente.nombre || "Customer";
        const safeName = String(customerName).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
        const emailPromise = admin.functions.invoke("send-order-email", { body: {
          to: cleanEmail,
          subject: `Secure Tools4Care payment link — $${(amountCents / 100).toFixed(2)}`,
          html: `<p>Hello ${safeName},</p><p>Tools4Care sent you a secure payment link for <strong>$${(amountCents / 100).toFixed(2)}</strong>.</p><p><a href="${shortUrl}">Pay securely with Stripe</a></p><p>This link is for this payment only.</p>`,
        }}).then(({ data, error }) => {
          if (error || data?.ok === false) console.error("terminal-payments: payment-link email failed", error || data?.error);
        }).catch((error) => console.error("terminal-payments: payment-link email failed", error));
        const edgeRuntime = (globalThis as any).EdgeRuntime;
        if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(emailPromise);
        else await emailPromise;
        emailQueued = true;
      }
      return json({ ok: true, checkout_session_id: checkout.id, terminal_session_id: audit.id,
        url: checkout.url, short_url: `${appUrl}/pay/${checkout.id}`, email_queued: emailQueued });
    }

    if (action === "manual_checkout_status") {
      const staff = await requireStaff(req, admin);
      const checkoutId = cleanText(payload.checkout_session_id, 180);
      if (!checkoutId.startsWith("cs_")) return json({ error: "Invalid Checkout session" }, 400);
      const checkout: any = await stripe.checkout.sessions.retrieve(checkoutId, { expand: ["payment_intent.payment_method"] });
      const terminalSessionId = cleanText(checkout.metadata?.terminal_session_id, 40);
      const { data: session, error: sessionError } = await admin.from("terminal_payment_sessions")
        .select("*").eq("id", terminalSessionId).maybeSingle();
      if (sessionError || !session) return json({ error: "Payment audit session not found" }, 404);
      if (session.tenant_id !== staff.tenant_id) return json({ error: "Payment session access denied" }, 403);
      if (checkout.payment_status !== "paid") return json({ ok: true, status: checkout.status === "expired" ? "cancelled" : "processing" });

      const intent: any = checkout.payment_intent;
      if (!intent?.id || intent.status !== "succeeded") return json({ ok: true, status: "processing" });
      let savedMethodId = session.saved_payment_method_id || null;
      const method: any = intent.payment_method;
      const optedToSave = method?.customer === checkout.customer && method?.allow_redisplay === "always";
      if (optedToSave && !savedMethodId) {
        const { data: consent, error: consentError } = await admin.from("payment_method_consents").insert({
          tenant_id: session.tenant_id, cliente_id: session.cliente_id,
          purpose: "future_customer_approved_payments", terms_version: TERMS_VERSION,
          terms_text: TERMS_TEXT, accepted: true, accepted_at: new Date().toISOString(),
          captured_by: session.operator_id, capture_channel: "customer_portal",
          device_id: "stripe-hosted-checkout", evidence: { stripe_checkout_session_id: checkout.id, stripe_hosted_consent: true },
        }).select("id").single();
        if (consentError) throw consentError;
        const { data: saved, error: savedError } = await admin.from("customer_payment_methods").upsert({
          tenant_id: session.tenant_id, cliente_id: session.cliente_id,
          stripe_customer_id: checkout.customer, stripe_payment_method_id: method.id,
          consent_id: consent.id, brand: method.card?.brand || null, last4: method.card?.last4 || null,
          exp_month: method.card?.exp_month || null, exp_year: method.card?.exp_year || null,
          funding: method.card?.funding || null, allow_redisplay: method.allow_redisplay,
          status: "active", updated_at: new Date().toISOString(),
        }, { onConflict: "stripe_payment_method_id" }).select("id").single();
        if (savedError) throw savedError;
        savedMethodId = saved.id;
      }

      let finalStatus = "reconciliation_pending";
      if (session.context_type === "ar_payment") {
        const { error: applyError } = await admin.rpc("terminal_apply_ar_payment", {
          p_session_id: session.id, p_cliente_id: session.cliente_id, p_van_id: session.van_id,
          p_operator_id: session.operator_id, p_monto: session.amount_cents / 100,
          p_payment_intent_id: intent.id,
        });
        if (!applyError) finalStatus = "reconciled";
        else console.error("manual checkout reconciliation pending", { session: session.id, error: applyError.message });
      }
      await admin.from("terminal_payment_sessions").update({
        status: finalStatus, stripe_payment_intent_id: intent.id, saved_payment_method_id: savedMethodId,
        completed_at: new Date().toISOString(), reconciled_at: finalStatus === "reconciled" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);
      return json({ ok: true, status: finalStatus, terminal_session_id: session.id, card_saved: Boolean(savedMethodId) });
    }

    if (action === "charge_saved_method") {
      const staff = await requireStaff(req, admin);
      const clienteId = cleanText(payload.cliente_id, 40);
      const savedMethodId = cleanText(payload.payment_method_id, 40);
      const contextType = cleanText(payload.context_type, 30);
      const contextId = cleanText(payload.context_id, 40) || null;
      const amountCents = Math.round(Number(payload.amount_cents || 0));
      const idempotencyKey = cleanText(payload.idempotency_key, 180);
      if (!clienteId || !savedMethodId || !idempotencyKey || !["sale", "ar_payment"].includes(contextType) || amountCents < 50) {
        return json({ error: "Missing or invalid saved-card payment fields" }, 400);
      }
      const { data: priorSavedCharge } = await admin.from("terminal_payment_sessions")
        .select("id,status,failure_message,stripe_payment_intent_id")
        .eq("idempotency_key", idempotencyKey).maybeSingle();
      if (priorSavedCharge) {
        if (["succeeded", "reconciliation_pending", "reconciled"].includes(priorSavedCharge.status)) {
          return json({ ok: true, status: priorSavedCharge.status, terminal_session_id: priorSavedCharge.id, reused: true });
        }
        return json({
          error: priorSavedCharge.failure_message
            || (priorSavedCharge.status === "processing"
              ? "This saved-card payment is already processing. Check the payment history before trying again."
              : `This saved-card payment is ${priorSavedCharge.status}.`),
        }, 409);
      }
      const { data: method, error: methodError } = await admin.from("customer_payment_methods")
        .select("id,cliente_id,tenant_id,stripe_customer_id,stripe_payment_method_id,status,brand,last4")
        .eq("id", savedMethodId).maybeSingle();
      if (methodError || !method || method.status !== "active" || method.cliente_id !== clienteId
        || (method.tenant_id !== staff.tenant_id && method.tenant_id !== null)) {
        return json({ error: "Saved card not found for this customer" }, 404);
      }
      if (contextType === "ar_payment") {
        const { data: balanceRow, error: balanceError } = await admin.from("v_cxc_cliente_detalle_ext")
          .select("saldo").eq("cliente_id", clienteId).maybeSingle();
        if (balanceError) throw balanceError;
        if (amountCents > Math.round(Number(balanceRow?.saldo || 0) * 100)) return json({ error: "Payment exceeds current customer balance" }, 409);
      }
      const auditToken = randomToken();
      const savedCardDeviceId = `saved-card-${crypto.randomUUID()}`;
      const { data: audit, error: auditError } = await admin.from("terminal_payment_sessions").insert({
        tenant_id: staff.tenant_id, cliente_id: clienteId, van_id: payload.van_id || null,
        // A legacy pilot schema treated device_id as unique. Give each
        // customer-authorized saved-card charge its own audit device key.
        operator_id: staff.id, device_id: savedCardDeviceId, context_type: contextType, context_id: contextId,
        amount_cents: amountCents, idempotency_key: idempotencyKey,
        companion_token_hash: await sha256(auditToken), companion_token_expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        // Do not copy saved_payment_method_id into every charge session. Some
        // early pilot databases made that column unique, which prevented the
        // same authorized card from being reused for a second payment.
        status: "processing", save_offered: false, save_requested: false,
      }).select("id").single();
      if (auditError) throw Object.assign(new Error(`Could not start saved-card payment: ${auditError.message}`), { status: 409 });
      let intent: any;
      try {
        intent = await stripe.paymentIntents.create({
          amount: amountCents, currency: "usd", customer: method.stripe_customer_id,
          payment_method: method.stripe_payment_method_id, confirm: true, off_session: true,
          description: `Tools4Care customer-approved saved card ${method.brand || "card"} •••• ${method.last4 || ""}`,
          metadata: { source: "tools4care_saved_card", terminal_session_id: audit.id, cliente_id: clienteId,
            tenant_id: staff.tenant_id || "legacy", operator_id: staff.id, context_type: contextType, context_id: contextId || "" },
        }, { idempotencyKey });
      } catch (stripeError) {
        await admin.from("terminal_payment_sessions").update({
          status: "failed", failure_code: stripeError?.code || "saved_card_failed",
          failure_message: stripeError?.message || "Saved card requires customer authentication",
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", audit.id);
        return json({ error: "This card could not be charged automatically. Use Enter card securely so the customer can authenticate." }, 409);
      }
      if (intent.status !== "succeeded") {
        await admin.from("terminal_payment_sessions").update({
          status: "failed", failure_code: intent.status,
          failure_message: intent.status === "requires_action"
            ? "This card requires customer authentication. Use Enter card securely."
            : `Saved card payment is ${intent.status}`,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", audit.id);
        return json({ error: intent.status === "requires_action"
          ? "This card requires customer authentication. Use Enter card securely."
          : `Saved card payment is ${intent.status}` }, 409);
      }
      let finalStatus = "reconciliation_pending";
      if (contextType === "ar_payment") {
        const { error: applyError } = await admin.rpc("terminal_apply_ar_payment", {
          p_session_id: audit.id, p_cliente_id: clienteId, p_van_id: payload.van_id || null,
          p_operator_id: staff.id, p_monto: amountCents / 100, p_payment_intent_id: intent.id,
        });
        if (!applyError) finalStatus = "reconciled";
        else await admin.from("terminal_payment_sessions").update({ failure_code: applyError.code, failure_message: applyError.message }).eq("id", audit.id);
      }
      await admin.from("terminal_payment_sessions").update({
        status: finalStatus, stripe_payment_intent_id: intent.id, completed_at: new Date().toISOString(),
        reconciled_at: finalStatus === "reconciled" ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
      }).eq("id", audit.id);
      return json({ ok: true, status: finalStatus, terminal_session_id: audit.id,
        card: { brand: method.brand, last4: method.last4 } });
    }

    if (action === "create_session") {
      const staff = await requireStaff(req, admin);
      const clienteId = cleanText(payload.cliente_id, 40) || null;
      const deviceId = cleanText(payload.device_id, 120);
      const contextType = cleanText(payload.context_type, 30);
      const contextId = cleanText(payload.context_id, 40) || null;
      const amountCents = Math.round(Number(payload.amount_cents || 0));
      const saveRequestedByClient = payload.offer_save_card === true || contextType === "card_setup";
      const idempotencyKey = cleanText(payload.idempotency_key, 180);

      if (!deviceId || !idempotencyKey) return json({ error: "Missing required payment session fields" }, 400);
      if (!["sale", "ar_payment", "card_setup"].includes(contextType)) return json({ error: "Invalid payment context" }, 400);
      if (!clienteId && contextType !== "sale") return json({ error: "A customer is required for this payment type" }, 400);
      if (contextType !== "card_setup" && amountCents < 50) return json({ error: "Payment amount is too low" }, 400);

      const [settings, customerResult] = await Promise.all([
        getTerminalSettings(admin, staff.tenant_id),
        clienteId
          ? admin.from("clientes").select("id,nombre,negocio,email,telefono,tenant_id").eq("id", clienteId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const cliente = customerResult.data;
      const clienteError = customerResult.error;
      const savedCardsEnabled = Deno.env.get("TERMINAL_SAVED_CARDS_ENABLED") === "true"
        || settings?.saved_cards_enabled === true;
      const saveOffered = Boolean(clienteId && saveRequestedByClient && savedCardsEnabled);
      if (clienteId && (clienteError || !cliente || cliente.tenant_id !== staff.tenant_id)) return json({ error: "Customer not found" }, 404);
      if (contextType === "card_setup" && !savedCardsEnabled) return json({ error: "Saved cards are disabled" }, 403);
      if (contextType === "ar_payment") {
        const { data: balanceRow, error: balanceError } = await admin.from("v_cxc_cliente_detalle_ext")
          .select("saldo").eq("cliente_id", clienteId).maybeSingle();
        if (balanceError) throw balanceError;
        const balanceCents = Math.round(Number(balanceRow?.saldo || 0) * 100);
        if (balanceCents < 50) return json({ error: "Customer has no outstanding balance" }, 409);
        if (amountCents > balanceCents) return json({ error: "Payment exceeds current customer balance" }, 409);
      }
      if (!settings?.android_tap_to_pay_enabled) return json({ error: "Android Tap to Pay pilot is disabled" }, 403);
      const terminalLocationId = configuredTerminalLocation || settings.stripe_location_id;
      if (!terminalLocationId) return json({ error: "Stripe Terminal location is not configured" }, 409);
      if (settings.pilot_device_ids?.length && !settings.pilot_device_ids.includes(deviceId)) {
        return json({ error: "This Android device is not approved for the pilot" }, 403);
      }

      const { data: prior } = await admin
        .from("terminal_payment_sessions")
        .select("id,status,companion_token_expires_at")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (prior) return json({ error: "This payment session already exists", session_id: prior.id, status: prior.status }, 409);

      let link: { stripe_customer_id: string } | null = null;
      if (terminalTestMode && clienteId) {
        const testCustomer = await stripe.customers.create({
          name: cliente?.negocio || cliente?.nombre || undefined,
          email: cliente.email || undefined,
          phone: cliente.telefono || undefined,
          metadata: { tools4care_cliente_id: clienteId, tools4care_environment: "terminal_test" },
        }, { idempotencyKey: `t4c-terminal-test-customer-${clienteId}` });
        link = { stripe_customer_id: testCustomer.id };
      } else if (clienteId) {
        const { data: storedLink } = await admin
          .from("stripe_customer_links")
          .select("stripe_customer_id")
          .eq("cliente_id", clienteId)
          .maybeSingle();
        link = storedLink;
      }
      if (!link && clienteId) {
        const stripeCustomer = await stripe.customers.create({
          name: cliente?.negocio || cliente?.nombre || undefined,
          email: cliente.email || undefined,
          phone: cliente.telefono || undefined,
          metadata: { tools4care_cliente_id: clienteId, tools4care_tenant_id: staff.tenant_id || "legacy" },
        }, { idempotencyKey: `t4c-customer-${clienteId}` });
        const { data: createdLink, error: linkError } = await admin.from("stripe_customer_links").insert({
          tenant_id: staff.tenant_id,
          cliente_id: clienteId,
          stripe_customer_id: stripeCustomer.id,
        }).select("stripe_customer_id").single();
        if (linkError) throw linkError;
        link = createdLink;
      }

      const companionToken = randomToken();
      const companionTokenHash = await sha256(companionToken);
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      const stripeMetadata = {
          source: "tools4care_android_terminal",
          cliente_id: clienteId || "",
          tenant_id: staff.tenant_id || "legacy",
          operator_id: staff.id,
          context_type: contextType,
          context_id: contextId || "",
      };
      const paymentIntent = contextType === "card_setup" ? null : await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        ...(link?.stripe_customer_id ? { customer: link.stripe_customer_id } : {}),
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        description: `Tools4Care ${contextType} — ${cliente?.negocio || cliente?.nombre || "Walk-in Customer"}`,
        metadata: stripeMetadata,
      }, { idempotencyKey });
      const setupIntent = contextType === "card_setup" ? await stripe.setupIntents.create({
        customer: link.stripe_customer_id,
        payment_method_types: ["card_present"],
        usage: "off_session",
        metadata: stripeMetadata,
      }, { idempotencyKey }) : null;

      const { data: session, error: sessionError } = await admin.from("terminal_payment_sessions").insert({
        tenant_id: staff.tenant_id,
        cliente_id: clienteId,
        van_id: payload.van_id || null,
        operator_id: staff.id,
        device_id: deviceId,
        context_type: contextType,
        context_id: contextId,
        amount_cents: amountCents,
        idempotency_key: idempotencyKey,
        companion_token_hash: companionTokenHash,
        companion_token_expires_at: expiresAt,
        status: saveOffered ? "awaiting_consent" : "ready",
        save_offered: saveOffered,
        save_requested: false,
        consent_id: null,
        stripe_payment_intent_id: paymentIntent?.id || null,
        stripe_setup_intent_id: setupIntent?.id || null,
      }).select("id,status").single();
      if (sessionError) throw sessionError;

      return json({
        ok: true,
        session_id: session.id,
        expires_at: expiresAt,
        companion_url: `tools4care-pay://terminal/session?token=${encodeURIComponent(companionToken)}`,
      });
    }

    if (["companion_bootstrap", "set_save_preference", "connection_token", "sync_result", "cancel_session"].includes(action)) {
      const companionToken = cleanText(payload.companion_token, 200);
      const session = await requireCompanionSession(admin, companionToken);

      if (action === "companion_bootstrap") {
        const [customerResult, settings] = await Promise.all([
          session.cliente_id
            ? admin.from("clientes").select("nombre,negocio").eq("id", session.cliente_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          getTerminalSettings(admin, session.tenant_id),
        ]);
        const cliente = customerResult.data;
        const terminalLocationId = configuredTerminalLocation || settings?.stripe_location_id;
        if (!terminalLocationId) return json({ error: "Stripe Terminal location is not configured" }, 409);
        const stripeIntent = session.context_type === "card_setup"
          ? await stripe.setupIntents.retrieve(session.stripe_setup_intent_id)
          : await stripe.paymentIntents.retrieve(session.stripe_payment_intent_id);
        return json({
          ok: true,
          session: {
            id: session.id,
            customer_name: cliente?.negocio || cliente?.nombre || "Customer",
            amount_cents: session.amount_cents,
            currency: session.currency,
            save_requested: session.save_requested,
            save_offered: session.save_offered,
            status: session.status,
            intent_client_secret: stripeIntent.client_secret,
            intent_type: session.context_type === "card_setup" ? "setup" : "payment",
            stripe_location_id: terminalLocationId,
            // Return to the screen that initiated the payment so Sales can
            // recover the approved amount and keep it locked for saving.
            return_url: `${(Deno.env.get("PUBLIC_APP_URL") || "https://tools4care.vercel.app").replace(/\/$/, "")}/ventas?terminal_return=${session.id}`,
            expires_at: session.companion_token_expires_at,
          },
        });
      }

      if (action === "set_save_preference") {
        if (!["awaiting_consent", "ready"].includes(session.status)) return json({ error: "Payment collection already started" }, 409);
        const accepted = payload.accepted === true;
        if (session.context_type === "card_setup" && !accepted) return json({ error: "Customer authorization is required to save a card" }, 400);
        let consentId: string | null = null;
        if (accepted) {
          const { data: consent, error: consentError } = await admin.from("payment_method_consents").insert({
            tenant_id: session.tenant_id, cliente_id: session.cliente_id,
            purpose: "future_customer_approved_payments", terms_version: TERMS_VERSION,
            terms_text: TERMS_TEXT, accepted: true, accepted_at: new Date().toISOString(),
            captured_by: session.operator_id, capture_channel: "android_companion",
            device_id: session.device_id, evidence: { customer_checked_box_on_device: true },
          }).select("id").single();
          if (consentError) throw consentError;
          consentId = consent.id;
          if (session.stripe_payment_intent_id) {
            await stripe.paymentIntents.update(session.stripe_payment_intent_id, { setup_future_usage: "off_session" });
          }
        }
        await admin.from("terminal_payment_sessions").update({
          save_requested: accepted, consent_id: consentId, status: "ready", updated_at: new Date().toISOString(),
        }).eq("id", session.id);
        return json({ ok: true, save_requested: accepted });
      }

      if (action === "connection_token") {
        const settings = await getTerminalSettings(admin, session.tenant_id);
        const terminalLocationId = configuredTerminalLocation || settings?.stripe_location_id;
        if (!terminalLocationId) return json({ error: "Stripe Terminal location is not configured" }, 409);
        const connectionToken = await stripe.terminal.connectionTokens.create({ location: terminalLocationId });
        return json({ ok: true, secret: connectionToken.secret });
      }

      if (action === "cancel_session") {
        await admin.from("terminal_payment_sessions").update({
          status: "cancelled", updated_at: new Date().toISOString(), completed_at: new Date().toISOString(),
        }).eq("id", session.id);
        if (session.stripe_payment_intent_id) {
          const intent = await stripe.paymentIntents.retrieve(session.stripe_payment_intent_id);
          if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
            await stripe.paymentIntents.cancel(intent.id);
          }
        }
        if (session.stripe_setup_intent_id) {
          const setup = await stripe.setupIntents.retrieve(session.stripe_setup_intent_id);
          if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(setup.status)) {
            await stripe.setupIntents.cancel(setup.id);
          }
        }
        return json({ ok: true });
      }

      if (session.context_type === "card_setup") {
        const setup: any = await stripe.setupIntents.retrieve(session.stripe_setup_intent_id, { expand: ["latest_attempt"] });
        if (setup.status !== "succeeded") return json({ ok: false, status: setup.status }, 409);
        const generatedCard = setup.latest_attempt?.payment_method_details?.card_present?.generated_card;
        let savedMethodId: string | null = null;
        if (generatedCard && session.consent_id) {
          const method: any = await stripe.paymentMethods.retrieve(generatedCard);
          const { data: saved, error: savedError } = await admin.from("customer_payment_methods").upsert({
            tenant_id: session.tenant_id, cliente_id: session.cliente_id,
            stripe_customer_id: setup.customer, stripe_payment_method_id: method.id,
            consent_id: session.consent_id, brand: method.card?.brand || null,
            last4: method.card?.last4 || null, exp_month: method.card?.exp_month || null,
            exp_year: method.card?.exp_year || null, funding: method.card?.funding || null,
            allow_redisplay: method.allow_redisplay || "always", status: "active",
            updated_at: new Date().toISOString(),
          }, { onConflict: "stripe_payment_method_id" }).select("id").single();
          if (savedError) throw savedError;
          savedMethodId = saved.id;
        }
        await admin.from("terminal_payment_sessions").update({
          status: "reconciled", saved_payment_method_id: savedMethodId,
          completed_at: new Date().toISOString(), reconciled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", session.id);
        return json({ ok: true, status: "reconciled", card_saved: Boolean(savedMethodId), reusable_card_unavailable: !savedMethodId });
      }

      const intent: any = await stripe.paymentIntents.retrieve(session.stripe_payment_intent_id, {
        expand: ["latest_charge"],
      });
      if (intent.status !== "succeeded") {
        await admin.from("terminal_payment_sessions").update({
          status: intent.status === "canceled" ? "cancelled" : "processing",
          updated_at: new Date().toISOString(),
        }).eq("id", session.id);
        return json({ ok: false, status: intent.status }, 409);
      }

      let savedMethodId: string | null = null;
      const generatedCard = intent.latest_charge?.payment_method_details?.card_present?.generated_card;
      if (session.save_requested && generatedCard && session.consent_id) {
        const method: any = await stripe.paymentMethods.retrieve(generatedCard);
        const { data: saved, error: savedError } = await admin.from("customer_payment_methods").upsert({
          tenant_id: session.tenant_id,
          cliente_id: session.cliente_id,
          stripe_customer_id: intent.customer,
          stripe_payment_method_id: method.id,
          consent_id: session.consent_id,
          brand: method.card?.brand || null,
          last4: method.card?.last4 || null,
          exp_month: method.card?.exp_month || null,
          exp_year: method.card?.exp_year || null,
          funding: method.card?.funding || null,
          allow_redisplay: method.allow_redisplay || "limited",
          status: "active",
          updated_at: new Date().toISOString(),
        }, { onConflict: "stripe_payment_method_id" }).select("id").single();
        if (savedError) throw savedError;
        savedMethodId = saved.id;
      }

      let finalStatus = "reconciliation_pending";
      if (session.context_type === "ar_payment") {
        const { error: applyError } = await admin.rpc("terminal_apply_ar_payment", {
          p_session_id: session.id,
          p_cliente_id: session.cliente_id,
          p_van_id: session.van_id,
          p_operator_id: session.operator_id,
          p_monto: session.amount_cents / 100,
          p_payment_intent_id: intent.id,
        });
        if (applyError) {
          console.error("terminal-payments reconciliation pending", { session: session.id, error: applyError.message });
          await admin.from("terminal_payment_sessions").update({
            failure_code: applyError.code, failure_message: applyError.message, updated_at: new Date().toISOString(),
          }).eq("id", session.id);
        } else finalStatus = "reconciled";
      } else if (session.context_type === "card_setup") {
        finalStatus = "reconciled";
      }

      await admin.from("terminal_payment_sessions").update({
        status: finalStatus,
        saved_payment_method_id: savedMethodId,
        completed_at: new Date().toISOString(),
        reconciled_at: finalStatus === "reconciled" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);
      return json({
        ok: true,
        status: finalStatus,
        payment_intent_id: intent.id,
        card_saved: Boolean(savedMethodId),
        reusable_card_unavailable: Boolean(session.save_requested && !savedMethodId),
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("terminal-payments", error);
    return json({ error: error?.message || "Internal error" }, Number(error?.status || 500));
  }
});
