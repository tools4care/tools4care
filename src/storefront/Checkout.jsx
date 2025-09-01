// src/storefront/Checkout.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { supabase } from "../supabaseClient";
import { getAnonId } from "../utils/anon";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Edge Function URL that creates a PaymentIntent
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create_payment_intent`;

/* ----------------- helpers: cart ----------------- */
async function ensureCart() {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;
  const col = userId ? "user_id" : "anon_id";
  const val = userId ?? getAnonId();

  const { data: found, error: selErr } = await supabase
    .from("carts")
    .select("id")
    .eq(col, val)
    .maybeSingle();

  if (selErr && selErr.code !== "PGRST116") throw selErr;
  if (found?.id) return found.id;

  const { data: inserted, error: insErr } = await supabase
    .from("carts")
    .insert({ [col]: val })
    .select("id")
    .single();

  if (insErr && String(insErr.code) === "23505") {
    const { data: again } = await supabase
      .from("carts")
      .select("id")
      .eq(col, val)
      .maybeSingle();
    if (again?.id) return again.id;
  }
  if (insErr) throw insErr;

  return inserted.id;
}

async function fetchCartItems(cartId) {
  const { data: items } = await supabase
    .from("cart_items")
    .select("producto_id, qty")
    .eq("cart_id", cartId);

  const ids = (items || []).map((i) => i.producto_id);
  if (!ids.length) return [];

  const { data: productos } = await supabase
    .from("productos")
    .select("id, codigo, nombre, precio, marca")
    .in("id", ids);

  const idx = new Map((productos || []).map((p) => [p.id, p]));
  return (items || [])
    .map((i) => ({
      producto_id: i.producto_id,
      qty: Number(i.qty || 0),
      producto: idx.get(i.producto_id),
    }))
    .filter(Boolean);
}

const fmt = (n) =>
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* -------------------- shipping & taxes -------------------- */
const SHIPPING_METHODS = [
  { key: "pickup",   label: "Pickup in store",        calc: () => 0, note: "Free" },
  { key: "standard", label: "Standard (3–7 days)",    calc: (sub) => (sub >= 75 ? 0 : 6.99), note: "Free over $75" },
  { key: "express",  label: "Express (1–2 days)",     calc: () => 14.99, note: null },
];

// Basic state tax map (edit as needed)
const STATE_TAX = {
  FL: 0.06, NY: 0.08875, NJ: 0.06625, CA: 0.0725, TX: 0.0625, MA: 0.0625,
};

function calcShipping(methodKey, subtotal, freeShippingOverride = false) {
  if (freeShippingOverride) return 0;
  const m = SHIPPING_METHODS.find((x) => x.key === methodKey) || SHIPPING_METHODS[1];
  return Number(m.calc(subtotal) || 0);
}
function calcTax(taxableSubtotal, stateCode) {
  const rate = STATE_TAX[(stateCode || "").toUpperCase()] || 0;
  return taxableSubtotal * rate;
}

/* -------------------- promo codes -------------------- */
// Client tries Supabase table "discount_codes". If not found, falls back to local list.
const LOCAL_CODES = [
  // type: 'percent' (value = 10 → 10%), 'amount' (value = 5 → $5), 'free_shipping'
  { code: "SAVE10", type: "percent", value: 10, active: true },
  { code: "WELCOME5", type: "amount", value: 5, active: true },
  { code: "FREESHIP", type: "free_shipping", value: 0, active: true },
];

async function resolvePromo(codeInput) {
  const code = String(codeInput || "").trim().toUpperCase();
  if (!code) return null;

  // Try Supabase first (optional table)
  try {
    const { data, error } = await supabase
      .from("discount_codes")
      .select("code, type, value, active, expires_at, max_uses, times_used")
      .ilike("code", code)
      .maybeSingle();

    if (!error && data) {
      const now = new Date();
      const expired =
        data.expires_at ? new Date(data.expires_at).getTime() < now.getTime() : false;
      const overUsed =
        typeof data.max_uses === "number" &&
        typeof data.times_used === "number" &&
        data.max_uses > 0 &&
        data.times_used >= data.max_uses;

      if (!data.active) throw new Error("This code is not active.");
      if (expired) throw new Error("This code is expired.");
      if (overUsed) throw new Error("This code has reached its limit.");

      return {
        code: data.code.toUpperCase(),
        type: data.type,
        value: Number(data.value || 0),
        freeShipping: data.type === "free_shipping",
      };
    }
  } catch (_) {
    // ignore and fallback
  }

  // Fallback to local list
  const local = LOCAL_CODES.find((c) => c.code === code && c.active);
  if (!local) throw new Error("Invalid or inactive promo code.");
  return {
    code: local.code,
    type: local.type,
    value: Number(local.value || 0),
    freeShipping: local.type === "free_shipping",
  };
}

function computeDiscount(subtotal, promo) {
  if (!promo) return 0;
  if (promo.type === "percent") return Math.max(0, (subtotal * promo.value) / 100);
  if (promo.type === "amount") return Math.min(subtotal, promo.value);
  return 0;
}

/* ----------------------------- Main Component ------------------------------ */
export default function Checkout() {
  const { state } = useLocation();
  const cidFromNav = state?.cid ?? null;

  const [phase, setPhase] = useState("checkout"); // 'checkout' | 'success'
  const [success, setSuccess] = useState(null);

  const [cartId, setCartId] = useState(null);
  const [items, setItems] = useState([]);

  const [shipping, setShipping] = useState({
    name: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "MA",
    zip: "",
    country: "US",
    method: "standard",
  });

  // Promo code UI state
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState(null);
  const [promoError, setPromoError] = useState("");

  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // CART LOAD
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const cid = cidFromNav || (await ensureCart());
        if (cancel) return;
        setCartId(cid);
        const list = await fetchCartItems(cid);
        if (cancel) return;
        setItems(list);
      } catch (e) {
        if (!cancel) setError(e.message || "Failed to load the cart.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => (cancel = true);
  }, [cidFromNav]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.qty) * Number(it.producto?.precio || 0), 0),
    [items]
  );
  const discount = useMemo(() => computeDiscount(subtotal, promo), [subtotal, promo]);
  const subAfterDiscount = useMemo(
    () => Math.max(0, subtotal - discount),
    [subtotal, discount]
  );

  const freeShippingOverride = promo?.freeShipping === true;
  const shippingCost = useMemo(
    () => calcShipping(shipping.method, subAfterDiscount, freeShippingOverride),
    [shipping.method, subAfterDiscount, freeShippingOverride]
  );
  const taxes = useMemo(
    () => calcTax(subAfterDiscount, shipping.state),
    [subAfterDiscount, shipping.state]
  );
  const total = useMemo(
    () => Math.max(0, subAfterDiscount + shippingCost + taxes),
    [subAfterDiscount, shippingCost, taxes]
  );

  function extractPiId(secret) {
    if (!secret) return "";
    const m = String(secret).match(/^(pi_[^_]+)/);
    return m ? m[1] : "";
  }

  // PREPARE PAYMENT (Edge Function)
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (!items.length) {
          setClientSecret(""); setPaymentIntentId("");
          return;
        }
        setCreating(true); setError("");

        const payload = {
          amount: Math.round(total * 100),
          metadata: {
            subtotal_cents: Math.round(subtotal * 100),
            discount_cents: Math.round(discount * 100),
            subtotal_after_discount_cents: Math.round(subAfterDiscount * 100),
            shipping_cents: Math.round(shippingCost * 100),
            taxes_cents: Math.round(taxes * 100),
            free_shipping_override: freeShippingOverride ? "1" : "0",
            promo_code: promo?.code || "",
            cart_id: cartId || "",
          },
          shipping: {
            name: shipping.name || "Guest",
            phone: shipping.phone || undefined,
            address: {
              line1: shipping.address1 || "N/A",
              line2: shipping.address2 || undefined,
              city: shipping.city || "N/A",
              state: shipping.state || "N/A",
              postal_code: shipping.zip || "00000",
              country: shipping.country || "US",
            },
            carrier: shipping.method,
          },
        };

        const res = await fetch(FN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            amount: payload.amount,
            currency: "usd",
            metadata: payload.metadata,
            shipping: payload.shipping,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(errText || `Edge Function error (${res.status})`);
        }
        const data = await res.json();

        if (cancel) return;
        if (!data?.clientSecret) throw new Error("Could not create the payment.");
        setClientSecret(data.clientSecret);
        setPaymentIntentId(extractPiId(data.clientSecret));
      } catch (e) {
        if (!cancel) setError(e.message || "Failed to prepare the payment.");
      } finally {
        if (!cancel) setCreating(false);
      }
    })();
    return () => (cancel = true);
  }, [
    items,
    subtotal,
    discount,
    subAfterDiscount,
    shippingCost,
    taxes,
    total,
    cartId,
    shipping.name,
    shipping.phone,
    shipping.address1,
    shipping.address2,
    shipping.city,
    shipping.state,
    shipping.zip,
    shipping.country,
    shipping.method,
    freeShippingOverride,
    promo?.code,
  ]);

  // SUCCESS: create order + clear cart
  async function handlePaid(paymentIntent) {
    try {
      const cid = cartId || (await ensureCart());
      const list = await fetchCartItems(cid);

      const meta = paymentIntent?.metadata || {};
      const amounts = {
        subtotal: Number(meta.subtotal_cents || 0) / 100 || subtotal,
        discount: Number(meta.discount_cents || 0) / 100 || discount,
        sub_after_discount: Number(meta.subtotal_after_discount_cents || 0) / 100 || subAfterDiscount,
        shipping: Number(meta.shipping_cents || 0) / 100 || shippingCost,
        taxes: Number(meta.taxes_cents || 0) / 100 || taxes,
        total:
          (Number(meta.subtotal_after_discount_cents || 0) +
            Number(meta.shipping_cents || 0) +
            Number(meta.taxes_cents || 0)) /
            100 || total,
      };

      // Preferred: RPC that creates order + discounts stock in one transaction
      const itemsPayload = list.map((it) => ({
        producto_id: it.producto_id,
        qty: Number(it.qty || 0),
        precio_unit: Number(it.producto?.precio || 0),
        nombre: it.producto?.nombre || "",
        marca: it.producto?.marca || null,
        codigo: it.producto?.codigo || null,
      }));
      const addressJson = {
        line1: shipping.address1 || null,
        line2: shipping.address2 || null,
        city: shipping.city || null,
        state: shipping.state || null,
        postal_code: shipping.zip || null,
        country: shipping.country || "US",
      };

      let orderIdFromRpc = null;
      try {
        const { data: newOrderId, error: rpcErr } = await supabase.rpc(
          "sp_create_order_and_discount",
          {
            p_payment_intent_id: paymentIntent.id,
            p_currency: paymentIntent.currency || "usd",
            p_name: shipping.name || null,
            p_email: shipping.email || null,
            p_phone: shipping.phone || null,
            p_address: addressJson,
            p_amount_subtotal: amounts.subtotal,
            p_amount_shipping: amounts.shipping,
            p_amount_taxes: amounts.taxes,
            p_amount_total: amounts.total,
            p_items: itemsPayload,
            p_discount_amount: amounts.discount || 0,
            p_promo_code: promo?.code || null,
          }
        );
        if (!rpcErr) orderIdFromRpc = newOrderId || null;
      } catch {
        // ignore
      }

      if (orderIdFromRpc) {
        await supabase.from("cart_items").delete().eq("cart_id", cid).catch(() => {});
        setSuccess({ paymentIntent, orderId: orderIdFromRpc, amounts });
        setPhase("success");
        return;
      }

      // Fallback: legacy flow (insert order, then mark paid)
      const { data: order, error: e1 } = await supabase
        .from("orders")
        .insert({
          payment_intent_id: paymentIntent.id,
          amount_total: amounts.total,
          amount_subtotal: amounts.subtotal,
          amount_shipping: amounts.shipping,
          amount_taxes: amounts.taxes,
          amount_discount: amounts.discount || 0,
          currency: paymentIntent.currency || "usd",
          email: shipping?.email || null,
          phone: shipping?.phone || null,
          name: shipping?.name || null,
          address_json: addressJson,
          status: "pending",
          promo_code: promo?.code || null,
        })
        .select("id")
        .single();
      if (e1) throw new Error(e1.message);

      const orderId = order.id;
      const rows = list.map((it) => ({
        order_id: orderId,
        producto_id: it.producto_id,
        nombre: it.producto?.nombre,
        qty: it.qty,
        precio_unit: it.producto?.precio,
        marca: it.producto?.marca ?? null,
        codigo: it.producto?.codigo ?? null,
        taxable: true,
      }));
      await supabase.from("order_items").insert(rows);
      await supabase.from("cart_items").delete().eq("cart_id", cid).catch(() => {});
      await supabase.from("orders").update({ status: "paid" }).eq("id", orderId).neq("status", "paid");

      setSuccess({ paymentIntent, orderId, amounts });
      setPhase("success");
    } catch (e) {
      setError(e.message || "Payment was approved, but we couldn't finalize the order.");
    }
  }

  async function applyPromo() {
    setPromoError("");
    try {
      const details = await resolvePromo(promoInput);
      setPromo(details);
    } catch (e) {
      setPromo(null);
      setPromoError(e.message || "Invalid promo code.");
    }
  }
  function clearPromo() {
    setPromo(null);
    setPromoInput("");
    setPromoError("");
  }

  if (phase === "success") {
    const { paymentIntent: pi, amounts } = success;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-2xl shadow-sm p-6 space-y-3">
          <h1 className="text-2xl font-bold text-emerald-700">Thanks for your purchase!</h1>
          <div className="text-gray-700">
            We received your payment for <b>${fmt(amounts.total)}</b>.
          </div>
          <div className="text-sm text-gray-600">
            Payment ID: <code className="bg-gray-100 px-2 py-0.5 rounded">{pi?.id}</code>
          </div>
          {success.orderId && (
            <div className="text-sm text-gray-600">
              Order #: <code className="bg-gray-100 px-2 py-0.5 rounded">{success.orderId}</code>
            </div>
          )}
          <div className="mt-4">
            <div className="border rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><b>${fmt(amounts.subtotal)}</b></div>
              {amounts.discount ? (
                <div className="flex justify-between text-rose-700">
                  <span>Discount{promo?.code ? ` (${promo.code})` : ""}</span>
                  <b>- ${fmt(amounts.discount)}</b>
                </div>
              ) : null}
              <div className="flex justify-between"><span>Shipping</span><b>${fmt(amounts.shipping)}</b></div>
              <div className="flex justify-between"><span>Taxes</span><b>${fmt(amounts.taxes)}</b></div>
              <div className="flex justify-between border-t pt-2">
                <span>Total</span><b>${fmt(amounts.total)}</b>
              </div>
            </div>
          </div>
          <div className="pt-2">
            <Link to="/storefront" className="text-blue-600 hover:underline">Back to store →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">Checkout</h1>
          <Link to="/storefront" className="text-sm text-blue-600 hover:underline">
            ← Keep shopping
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 grid lg:grid-cols-2 gap-4">
        {/* Shipping form */}
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="font-semibold">Shipping</h2>
          <div className="grid grid-cols-1 gap-3">
            <input className="border rounded-lg px-3 py-2" placeholder="Full name"
              value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })}/>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="border rounded-lg px-3 py-2" placeholder="Email (optional)"
                value={shipping.email} onChange={(e) => setShipping({ ...shipping, email: e.target.value })}/>
              <input className="border rounded-lg px-3 py-2" placeholder="Phone (optional)"
                value={shipping.phone} onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}/>
            </div>
            <input className="border rounded-lg px-3 py-2" placeholder="Address line 1"
              value={shipping.address1} onChange={(e) => setShipping({ ...shipping, address1: e.target.value })}/>
            <input className="border rounded-lg px-3 py-2" placeholder="Address line 2 (optional)"
              value={shipping.address2} onChange={(e) => setShipping({ ...shipping, address2: e.target.value })}/>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input className="border rounded-lg px-3 py-2 col-span-2" placeholder="City"
                value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })}/>
              <select className="border rounded-lg px-3 py-2" value={shipping.state}
                onChange={(e) => setShipping({ ...shipping, state: e.target.value })}>
                {Object.keys(STATE_TAX).map((st) => (<option key={st} value={st}>{st}</option>))}
                <option value="OTHER">OTHER</option>
              </select>
              <input className="border rounded-lg px-3 py-2" placeholder="ZIP"
                value={shipping.zip} onChange={(e) => setShipping({ ...shipping, zip: e.target.value })}/>
            </div>

            {/* Shipping method */}
            <div className="space-y-2">
              <div className="font-medium text-sm">Shipping method</div>
              <div className="grid gap-2">
                {SHIPPING_METHODS.map((m) => (
                  <label key={m.key}
                    className={`flex items-center justify-between border rounded-lg px-3 py-2 cursor-pointer ${
                      shipping.method === m.key ? "ring-2 ring-blue-500 border-blue-300" : ""}`}>
                    <div className="flex items-center gap-2">
                      <input type="radio" name="shipmethod"
                        checked={shipping.method === m.key}
                        onChange={() => setShipping({ ...shipping, method: m.key })}/>
                      <span>{m.label}</span>
                      {m.note && <span className="text-xs text-emerald-700">({m.note})</span>}
                    </div>
                    <b>${fmt(m.calc(subAfterDiscount))}</b>
                  </label>
                ))}
              </div>
            </div>

            {/* Promo code */}
            <div className="mt-2">
              <div className="font-medium text-sm mb-1">Promo code</div>
              <div className="flex gap-2">
                <input
                  className="border rounded-lg px-3 py-2 flex-1"
                  placeholder="Enter code (e.g. SAVE10)"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                />
                {!promo ? (
                  <button
                    onClick={applyPromo}
                    className="rounded-lg bg-gray-900 text-white px-4 py-2 hover:bg-black/80"
                  >
                    Apply
                  </button>
                ) : (
                  <button
                    onClick={clearPromo}
                    className="rounded-lg border px-4 py-2 hover:bg-gray-50"
                  >
                    Remove
                  </button>
                )}
              </div>
              {promoError && (
                <div className="text-sm text-rose-700 mt-1">{promoError}</div>
              )}
              {promo && (
                <div className="text-sm text-emerald-700 mt-1">
                  Applied <b>{promo.code}</b>
                  {promo.type === "percent" && ` (${promo.value}% off)`}
                  {promo.type === "amount" && ` ($${fmt(promo.value)} off)`}
                  {promo.type === "free_shipping" && ` (Free shipping)`}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Summary + Payment */}
        <section className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="font-semibold mb-2">Order summary</h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><b>${fmt(subtotal)}</b></div>
              {discount > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>Discount{promo?.code ? ` (${promo.code})` : ""}</span>
                  <b>- ${fmt(discount)}</b>
                </div>
              )}
              <div className="flex justify-between">
                <span>Shipping{freeShippingOverride ? " (overridden by promo)" : ""}</span>
                <b>${fmt(shippingCost)}</b>
              </div>
              <div className="flex justify-between"><span>Taxes</span><b>${fmt(taxes)}</b></div>
              <div className="flex justify-between border-t pt-2 text-base"><span>Total</span><b>${fmt(total)}</b></div>
            </div>
            {items.length === 0 && (
              <div className="mt-2 text-sm text-gray-500">Your cart is empty.</div>
            )}
          </div>

          {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded">{error}</div>}

          {clientSecret ? (
            <Elements
              key={clientSecret}
              options={{
                clientSecret,
                locale: "en",
                // You can also pass appearance if you want to theme the UI
              }}
              stripe={stripePromise}
            >
              <PaymentBlock onPaid={handlePaid} total={total} />
            </Elements>
          ) : (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              {loading || creating ? "Preparing payment…" : "Update shipping/details to pay."}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/* ---------------- Payment UI (Apple Pay / Google Pay + Payment Element) ---------------- */
function PaymentBlock({ onPaid, total }) {
  return (
    <div className="space-y-3">
      {/* Apple Pay / Google Pay (shows only when available) */}
      <AppleGooglePayButton total={total} />

      {/* Card & other methods */}
      <PaymentForm onPaid={onPaid} />
    </div>
  );
}

function AppleGooglePayButton({ total }) {
  const stripe = useStripe();
  const [pr, setPr] = useState(null);

  useEffect(() => {
    if (!stripe || !Number.isFinite(total)) return;

    const paymentRequest = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: "Tools4Care", amount: Math.round(Number(total) * 100) },
      requestPayerName: true,
      requestPayerEmail: true,
      requestShipping: false,
    });

    paymentRequest.canMakePayment().then((result) => {
      if (result) setPr(paymentRequest);
    });
  }, [stripe, total]);

  if (!pr) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <PaymentRequestButtonElement
        options={{
          paymentRequest: pr,
          style: {
            paymentRequestButton: {
              type: "buy",
              theme: "dark",
              height: "44px",
            },
          },
        }}
      />
      <div className="mt-2 text-xs text-gray-500">
        Apple Pay / Google Pay will appear if supported by the device and browser.
      </div>
    </div>
  );
}

function PaymentForm({ onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    const pe = elements.getElement(PaymentElement);
    if (!pe) {
      setError(
        "Payment form not available. Verify your Stripe keys (pk/sk) belong to the same account & mode."
      );
      return;
    }

    setLoading(true);
    setError("");
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (err) {
      setError(err.message || "Payment failed. Please try another method.");
      setLoading(false);
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      await onPaid(paymentIntent);
    } else {
      setError("The payment did not complete. Please try again.");
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <PaymentElement />
      {error && <div className="p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
      <button
        disabled={!stripe || loading}
        className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-2 font-semibold"
      >
        {loading ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}
