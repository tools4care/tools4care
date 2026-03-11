// src/PaymentSuccess.jsx
// Página de éxito para pagos completados vía redirect (3D Secure, Apple/Google Pay, etc.)
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("loading"); // loading | success | processing | unknown
  const [piId, setPiId] = useState("");
  const siteName = import.meta.env.VITE_COMPANY_NAME || "Tools4care";

  useEffect(() => {
    const cs = searchParams.get("payment_intent_client_secret");
    const pi = searchParams.get("payment_intent");
    if (pi) setPiId(pi);

    if (!cs) {
      setStatus("success"); // llegó sin secret → asumimos éxito (desde checkout inline)
      return;
    }

    (async () => {
      try {
        const stripe = await stripePromise;
        if (!stripe) { setStatus("unknown"); return; }
        const { paymentIntent } = await stripe.retrievePaymentIntent(cs);
        if (!paymentIntent) { setStatus("unknown"); return; }
        if (paymentIntent.status === "succeeded") setStatus("success");
        else if (paymentIntent.status === "processing") setStatus("processing");
        else setStatus("unknown");
        setPiId(paymentIntent.id || pi || "");
      } catch {
        setStatus("unknown");
      }
    })();
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">Verifying payment…</div>
      </div>
    );
  }

  if (status === "processing") {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-5">
            <svg className="w-9 h-9 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Processing</h1>
          <p className="text-gray-600 mb-4">
            Your payment is being processed. You'll receive a confirmation email once it's complete.
          </p>
          {piId && (
            <p className="text-xs text-gray-400 mb-6">
              Reference: <code className="bg-gray-100 px-2 py-0.5 rounded">{piId}</code>
            </p>
          )}
          <Link to="/storefront" className="inline-block rounded-lg bg-blue-600 text-white px-6 py-2.5 hover:bg-blue-700 text-sm font-medium">
            Back to store
          </Link>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          {/* Icono animado */}
          <div className="mx-auto w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
            <svg className="w-11 h-11 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Confirmed!</h1>
          <p className="text-gray-600 mb-5 text-sm leading-relaxed">
            Thank you for your purchase. A confirmation email with your order details is on its way.
          </p>

          {piId && (
            <div className="bg-gray-50 border rounded-xl p-3 mb-5 text-left">
              <div className="text-xs text-gray-400 mb-0.5">Payment reference</div>
              <code className="text-xs text-gray-700 break-all">{piId}</code>
            </div>
          )}

          <div className="space-y-2">
            <Link
              to="/storefront"
              className="block w-full rounded-xl bg-blue-600 text-white px-4 py-3 hover:bg-blue-700 font-medium text-sm"
            >
              Continue shopping
            </Link>
          </div>

          <p className="text-xs text-gray-400 mt-6">
            {siteName} — Powered by Stripe
          </p>
        </div>
      </div>
    );
  }

  // unknown / error
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-5">
          <svg className="w-9 h-9 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Payment Status Unknown</h1>
        <p className="text-gray-600 text-sm mb-5">
          We couldn't confirm your payment status. If you were charged, please contact support with your reference below.
        </p>
        {piId && (
          <p className="text-xs text-gray-400 mb-5">
            Reference: <code className="bg-gray-100 px-2 py-0.5 rounded">{piId}</code>
          </p>
        )}
        <Link to="/storefront" className="inline-block rounded-lg border px-5 py-2.5 hover:bg-gray-50 text-sm">
          Back to store
        </Link>
      </div>
    </div>
  );
}
