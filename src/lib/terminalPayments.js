import { supabase, supabaseAnonKey, supabaseUrl } from "../supabaseClient";

const DEVICE_STORAGE_KEY = "tools4care-terminal-device-id";
const PENDING_SALE_PAYMENT_KEY = "tools4care-pending-card-sale-v1";

export function getTerminalDeviceId() {
  let id = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `android-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_STORAGE_KEY, id);
  }
  return id;
}

export async function callTerminalPayments(action, payload = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error("Your Tools4Care session expired. Sign in again before starting Tap to Pay.");
  }

  // Use the same resolved configuration as the Supabase client. Production
  // builds may intentionally rely on its checked-in public fallback values;
  // reading import.meta.env directly here previously produced a relative
  // `/undefined/functions/...` request that Vercel rejected with HTTP 405.
  const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/terminal-payments`;
  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${sessionData.session.access_token}`,
    "Content-Type": "application/json",
  };
  let lastError;
  // Short network interruptions are common when Android returns from the
  // payment companion. Retry transport failures a few times; server
  // responses are still never replayed automatically.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ action, payload }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        const serverError = new Error(data?.error || `Tap to Pay server returned HTTP ${response.status}`);
        serverError.nonRetryable = true;
        throw serverError;
      }
      return data;
    } catch (error) {
      lastError = error;
      // A completed HTTP response must never be replayed automatically for a
      // payment mutation. Only transport failures/timeouts are safe to retry.
      if (error?.nonRetryable) throw error;
      if (error?.name === "AbortError") {
        lastError = new Error("Tap to Pay server timed out. Check the phone internet connection.");
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
    }
  }
  throw lastError || new Error("Could not contact the Tap to Pay server.");
}

export async function getTerminalFeatureStatus() {
  try {
    return await callTerminalPayments("feature_status");
  } catch (error) {
    console.warn("Tap to Pay availability check failed; keeping the feature hidden.", error);
    return { android_tap_to_pay_enabled: false, saved_cards_enabled: false };
  }
}

export async function getSavedPaymentMethods(clienteId) {
  if (!clienteId) return [];
  const result = await callTerminalPayments("list_saved_methods", { cliente_id: clienteId });
  return Array.isArray(result?.payment_methods) ? result.payment_methods : [];
}

export async function finalizeTerminalArPayment(sessionId) {
  return callTerminalPayments("finalize_ar_payment", { session_id: sessionId });
}

export function savePendingSaleCardPayment(value) {
  localStorage.setItem(PENDING_SALE_PAYMENT_KEY, JSON.stringify({ ...value, savedAt: new Date().toISOString() }));
}

export function getPendingSaleCardPayment() {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_SALE_PAYMENT_KEY) || "null");
    if (!value?.sessionId || Date.now() - new Date(value.savedAt || 0).getTime() > 24 * 60 * 60 * 1000) return null;
    return value;
  } catch { return null; }
}

export function clearPendingSaleCardPayment() {
  localStorage.removeItem(PENDING_SALE_PAYMENT_KEY);
}

export async function chargeSavedPaymentMethod({ clienteId, paymentMethodId, vanId, contextType, contextId, amountCents }) {
  return callTerminalPayments("charge_saved_method", {
    cliente_id: clienteId, payment_method_id: paymentMethodId, van_id: vanId || null,
    context_type: contextType, context_id: contextId || null, amount_cents: amountCents,
    idempotency_key: `t4c-saved-${contextType}-${contextId || "new"}-${crypto.randomUUID()}`,
  });
}

export async function createTerminalPaymentSession({
  clienteId,
  vanId,
  contextType,
  contextId,
  amountCents,
  offerSaveCard = true,
}) {
  return callTerminalPayments("create_session", {
    cliente_id: clienteId,
    van_id: vanId || null,
    device_id: getTerminalDeviceId(),
    context_type: contextType,
    context_id: contextId || null,
    amount_cents: amountCents,
    offer_save_card: offerSaveCard,
    idempotency_key: `t4c-${contextType}-${contextId || "new"}-${crypto.randomUUID()}`,
  });
}

export async function createManualCardCheckout({ clienteId, vanId, contextType, contextId, amountCents, sendEmail = false }) {
  return callTerminalPayments("create_manual_checkout", {
    cliente_id: clienteId, van_id: vanId || null, context_type: contextType,
    context_id: contextId || null, amount_cents: amountCents,
    send_email: sendEmail === true,
    idempotency_key: `t4c-manual-${contextType}-${contextId || "new"}-${crypto.randomUUID()}`,
  });
}

export async function waitForManualCardCheckout(checkoutSessionId, {
  timeoutMs = 24 * 60 * 60 * 1000, intervalMs = 2000, onStatus,
} = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await callTerminalPayments("manual_checkout_status", { checkout_session_id: checkoutSessionId });
    onStatus?.(result);
    if (["reconciliation_pending", "reconciled"].includes(result.status)) return result;
    if (["failed", "cancelled"].includes(result.status)) throw new Error(`Card payment ${result.status}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("The secure card link expired before payment confirmation.");
}

export function openManualCardCheckout(url) {
  if (!url?.startsWith("https://checkout.stripe.com/")) throw new Error("Invalid Stripe Checkout link");
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(url);
}

export async function shareManualCardCheckout(url, customerName = "customer", shortUrl = url, amount = null) {
  if (!url?.startsWith("https://checkout.stripe.com/")) throw new Error("Invalid Stripe Checkout link");
  const shareTarget = shortUrl || url;
  const amountText = Number.isFinite(Number(amount)) && Number(amount) > 0
    ? ` Amount: $${Number(amount).toFixed(2)}.`
    : "";
  const shareText = `Secure Tools4Care payment link for ${customerName}.${amountText}`;
  if (navigator.share) {
    await navigator.share({ title: "Tools4Care secure card payment", text: shareText, url: shareTarget });
    return "shared";
  }
  await navigator.clipboard.writeText(`${shareText}\n${shareTarget}`);
  return "copied";
}

export async function waitForTerminalPayment(sessionId, {
  // The Android companion may need a few seconds to return from the reader
  // and finish its sync_result call. Keep polling the same idempotent session
  // instead of asking the operator to start a second charge.
  timeoutMs = 90 * 1000,
  intervalMs = 1800,
  onStatus,
} = {}) {
  const started = Date.now();
  let lastTransportError = null;
  while (Date.now() - started < timeoutMs) {
    let result;
    try {
      result = await callTerminalPayments("session_status", { session_id: sessionId });
      lastTransportError = null;
    } catch (error) {
      // A payment may already be approved while the browser is briefly
      // offline during the return from Android. Keep checking the same
      // idempotent session instead of showing a failure or asking to retry.
      if (error?.nonRetryable) throw error;
      lastTransportError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }
    onStatus?.(result);
    if (["succeeded", "reconciliation_pending", "reconciled"].includes(result.status)) return result;
    if (["failed", "cancelled"].includes(result.status)) {
      throw new Error(result.failure_message || `Tap to Pay ${result.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const message = lastTransportError
    ? "Could not verify the approved Tap to Pay session because the phone connection was interrupted. Do not charge again; refresh Tools4Care and check the payment status."
    : "The Android payment companion did not respond within 90 seconds. Do not charge again; refresh Tools4Care and check the payment status.";
  throw new Error(message);
}

export function openTerminalCompanion(companionUrl) {
  if (!companionUrl?.startsWith("tools4care-pay://terminal/session?token=")) {
    throw new Error("Invalid Android payment link");
  }
  window.location.assign(companionUrl);
}
