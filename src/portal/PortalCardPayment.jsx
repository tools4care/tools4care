import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { supabase } from "../supabaseClient";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

async function callPortalPayments(action, payload) {
  const { data, error } = await supabase.functions.invoke("portal-payments", { body: { action, payload } });
  if (error) {
    let serverMessage = error.context?.body?.error;
    if (!serverMessage && typeof error.context?.clone === "function") {
      try { serverMessage = (await error.context.clone().json())?.error; } catch { /* non-JSON gateway error */ }
    }
    throw new Error(serverMessage || error.message || "Payment request failed");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function CardForm({ onSuccess, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError("");
    const { error: confirmErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (confirmErr) {
      setError(confirmErr.message || "Payment failed. Please try another card.");
      setLoading(false);
      return;
    }
    if (paymentIntent?.status !== "succeeded") {
      setError("The payment did not complete. Please try again.");
      setLoading(false);
      return;
    }
    try {
      await callPortalPayments("confirm_payment", { paymentIntentId: paymentIntent.id });
      onSuccess();
    } catch {
      setError(
        `Your card was charged, but we couldn't update your balance automatically. ` +
        `Contact support with reference ${paymentIntent.id} and we'll fix it right away.`,
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!ready && <div className="py-8 text-center text-sm text-slate-500">Loading secure payment form…</div>}
      <div className={ready ? "" : "hidden"}>
        <PaymentElement onReady={() => setReady(true)} />
      </div>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {ready && (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} disabled={loading} className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-black text-slate-700 disabled:opacity-60">
            Back
          </button>
          <button disabled={!stripe || loading} className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-60">
            {loading ? "Processing…" : "Pay now"}
          </button>
        </div>
      )}
    </form>
  );
}

export function PortalCardPayment({ amount, onSuccess, onCancel }) {
  const [clientSecret, setClientSecret] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await callPortalPayments("create_intent", { amount_cents: Math.round(amount * 100) });
        if (!cancelled) setClientSecret(data.clientSecret);
      } catch (startError) {
        if (!cancelled) setError(startError.message || "Could not start payment.");
      }
    })();
    return () => { cancelled = true; };
  }, [amount]);

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
        <button onClick={onCancel} className="w-full rounded-xl border border-slate-300 py-3 text-sm font-black text-slate-700">Back</button>
      </div>
    );
  }

  if (!clientSecret) return <div className="py-8 text-center text-sm text-slate-500">Preparing secure payment…</div>;

  return (
    <Elements key={clientSecret} options={{ clientSecret, appearance: { theme: "stripe" } }} stripe={stripePromise}>
      <CardForm onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}
