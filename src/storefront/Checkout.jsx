// src/storefront/Checkout.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { supabase, getAnonId } from "../supabaseClient";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

/* ----------------- helpers carrito (idénticos a Storefront) ----------------- */
async function ensureCart() {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;
  const anon = getAnonId();

  const col = userId ? "user_id" : "anon_id";
  const val = userId ?? anon;

  const { data: found } = await supabase
    .from("carts")
    .select("id, created_at")
    .eq(col, val)
    .order("created_at", { ascending: false })
    .limit(1);

  if (found && found[0]?.id) return found[0].id;

  const { data: nuevo, error: insErr } = await supabase
    .from("carts")
    .insert(userId ? { user_id: userId } : { anon_id: anon })
    .select("id")
    .single();

  if (insErr) throw new Error(insErr.message);
  return nuevo.id;
}

async function fetchCartItems(cartId) {
  const { data: items } = await supabase
    .from("cart_items")
    .select("producto_id, qty")
    .eq("cart_id", cartId);

  const ids = (items || []).map((i) => i.producto_id);
  if (ids.length === 0) return [];

  const { data: productos } = await supabase
    .from("productos")
    .select("id, codigo, nombre, precio, marca") // si tienes 'taxable', añádelo aquí
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
  (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ----------------- envío & taxes ----------------- */
const SHIPPING_METHODS = [
  { key: "pickup",   label: "Pickup in store",     calc: () => 0 },
  { key: "standard", label: "Standard (3–7 days)", calc: (subtotal) => (subtotal >= 50 ? 0 : 6.99) },
  { key: "express",  label: "Express (1–2 days)",  calc: () => 14.99 },
];

// ejemplo simple de tasas por estado
const STATE_TAX = {
  FL: 0.06,
  NY: 0.08875,
  NJ: 0.06625,
  CA: 0.0725,
  TX: 0.0625,
};

function calcShipping(methodKey, subtotal) {
  const m = SHIPPING_METHODS.find((x) => x.key === methodKey) || SHIPPING_METHODS[1];
  return Number(m.calc(subtotal) || 0);
}
function calcTax(items, stateCode) {
  const rate = STATE_TAX[(stateCode || "").toUpperCase()] || 0;
  // si tus productos tienen 'taxable' false, úsalo aquí:
  const taxableSubtotal = items.reduce((s, it) => {
    const line = Number(it.qty) * Number(it.producto?.precio || 0);
    // const taxable = it.producto?.taxable !== false;
    const taxable = true; // por defecto: todos gravan
    return s + (taxable ? line : 0);
  }, 0);
  return taxableSubtotal * rate;
}

/* ----------------- registrar orden ----------------- */
async function createOrder({ payment, items, shipping, amounts, cartId }) {
  const { data: order, error: e1 } = await supabase
    .from("orders")
    .insert({
      payment_intent_id: payment.id,
      amount_total: amounts.total,
      amount_subtotal: amounts.subtotal,
      amount_shipping: amounts.shipping,
      amount_taxes: amounts.taxes,
      currency: payment.currency || "usd",
      email: shipping?.email || null,
      phone: shipping?.phone || null,
      name: shipping?.name || null,
      address_json: shipping?.address || null,
      status: "paid",
    })
    .select("id")
    .single();

  if (e1) throw new Error(e1.message);
  const orderId = order.id;

  const rows = items.map((it) => ({
    order_id: orderId,
    producto_id: it.producto_id,
    nombre: it.producto?.nombre,
    qty: it.qty,
    precio_unit: it.producto?.precio,
    marca: it.producto?.marca ?? null,
    codigo: it.producto?.codigo ?? null,
    taxable: true, // ajusta si usas campo real
  }));
  const { error: e2 } = await supabase.from("order_items").insert(rows);
  if (e2) throw new Error(e2.message);

  if (cartId) await supabase.from("cart_items").delete().eq("cart_id", cartId);

  return orderId;
}

/* ----------------------------- Componente ------------------------------ */
export default function Checkout() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const cidFromNav = state?.cid ?? null;

  const [phase, setPhase] = useState("checkout"); // checkout | success
  const [success, setSuccess] = useState(null);    // { paymentIntent, orderId, amounts }

  const [cartId, setCartId] = useState(null);
  const [items, setItems] = useState([]);

  const [shipping, setShipping] = useState({
    name: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "FL",
    zip: "",
    country: "US",
    method: "standard",
  });

  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // CARGA CARRITO
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
        if (!cancel) setError(e.message || "No se pudo cargar el carrito.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => (cancel = true);
  }, [cidFromNav]);

  // Totales
  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.qty) * Number(it.producto?.precio || 0), 0),
    [items]
  );
  const shippingCost = useMemo(() => calcShipping(shipping.method, subtotal), [shipping.method, subtotal]);
  const taxes = useMemo(() => calcTax(items, shipping.state), [items, shipping.state]);
  const total = useMemo(() => subtotal + shippingCost + taxes, [subtotal, shippingCost, taxes]);

  // Extrae id de PI desde el client_secret
  function extractPiId(secret) {
    if (!secret) return "";
    const m = String(secret).match(/^(pi_[^_]+)/);
    return m ? m[1] : "";
  }

  // CREA/ACTUALIZA PAYMENT INTENT usando supabase.functions.invoke (CORS-safe)
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
            shipping_cents: Math.round(shippingCost * 100),
            taxes_cents: Math.round(taxes * 100),
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
          payment_intent_id: paymentIntentId || undefined,
        };

        // 1) intenta upsert (update/create) para evitar crear múltiples PIs
        let { data, error } = await supabase.functions.invoke("upsert_payment_intent", {
          body: payload,
        });

        // 2) fallback a tu función existente
        if (error || !data?.clientSecret) {
          const alt = await supabase.functions.invoke("create_payment_intent", {
            body: {
              amount: payload.amount,
              metadata: payload.metadata,
              shipping: payload.shipping,
            },
          });
          data = alt.data;
          error = alt.error;
        }

        if (error) throw new Error(error.message || "No se pudo preparar el pago.");

        if (cancel) return;
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId || extractPiId(data.clientSecret));
      } catch (e) {
        if (!cancel) setError(e.message || "No se pudo preparar el pago.");
      } finally {
        if (!cancel) setCreating(false);
      }
    })();
    return () => (cancel = true);
  }, [items, subtotal, shippingCost, taxes, shipping, cartId]); // recalcular cuando cambie algo relevante

  async function handlePaid(paymentIntent) {
    try {
      const cid = cartId || (await ensureCart());
      const list = await fetchCartItems(cid);

      const meta = paymentIntent?.metadata || {};
      const amounts = {
        subtotal: Number(meta.subtotal_cents || 0) / 100 || subtotal,
        shipping: Number(meta.shipping_cents || 0) / 100 || shippingCost,
        taxes: Number(meta.taxes_cents || 0) / 100 || taxes,
        total:
          (Number(meta.subtotal_cents || 0) +
            Number(meta.shipping_cents || 0) +
            Number(meta.taxes_cents || 0)) /
            100 || total,
      };

      const orderId = await createOrder({
        payment: paymentIntent,
        items: list,
        shipping: {
          name: shipping.name || null,
          email: shipping.email || null,
          phone: shipping.phone || null,
          address: {
            line1: shipping.address1 || null,
            line2: shipping.address2 || null,
            city: shipping.city || null,
            state: shipping.state || null,
            postal_code: shipping.zip || null,
            country: shipping.country || "US",
          },
        },
        amounts,
        cartId: cid,
      });

      setSuccess({ paymentIntent, orderId, amounts });
      setPhase("success");
    } catch (e) {
      setError(e.message || "El pago fue aprobado, pero falló el registro de la orden.");
    }
  }

  /* ------------------ UI: éxito ------------------ */
  if (phase === "success") {
    const pi = success.paymentIntent;
    const amounts = success.amounts;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-2xl shadow-sm p-6 space-y-3">
          <h1 className="text-2xl font-bold text-emerald-700">¡Gracias por tu compra!</h1>
          <div className="text-gray-700">
            Hemos recibido tu pago por <b>${fmt(amounts.total)}</b>.
          </div>
          <div className="text-sm text-gray-600">
            Nº de pago: <code className="bg-gray-100 px-2 py-0.5 rounded">{pi?.id}</code>
          </div>
          {success.orderId && (
            <div className="text-sm text-gray-600">
              Nº de orden: <code className="bg-gray-100 px-2 py-0.5 rounded">{success.orderId}</code>
            </div>
          )}
          <div className="mt-4">
            <div className="border rounded-lg p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><b>${fmt(amounts.subtotal)}</b></div>
              <div className="flex justify-between"><span>Envío</span><b>${fmt(amounts.shipping)}</b></div>
              <div className="flex justify-between"><span>Impuestos</span><b>${fmt(amounts.taxes)}</b></div>
              <div className="flex justify-between border-t pt-2"><span>Total</span><b>${fmt(amounts.total)}</b></div>
            </div>
          </div>
          <div className="pt-2">
            <Link to="/storefront" className="text-blue-600 hover:underline">Volver a la tienda →</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------ UI: checkout ------------------ */
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">Checkout</h1>
          <Link to="/storefront" className="text-sm text-blue-600 hover:underline">
            ← Seguir comprando
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 grid lg:grid-cols-2 gap-4">
        {/* Envío */}
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="font-semibold">Envío</h2>
          <div className="grid grid-cols-1 gap-3">
            <input className="border rounded-lg px-3 py-2" placeholder="Nombre completo"
              value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })}/>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="border rounded-lg px-3 py-2" placeholder="Correo (opcional)"
                value={shipping.email} onChange={(e) => setShipping({ ...shipping, email: e.target.value })}/>
              <input className="border rounded-lg px-3 py-2" placeholder="Teléfono (opcional)"
                value={shipping.phone} onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}/>
            </div>
            <input className="border rounded-lg px-3 py-2" placeholder="Dirección (línea 1)"
              value={shipping.address1} onChange={(e) => setShipping({ ...shipping, address1: e.target.value })}/>
            <input className="border rounded-lg px-3 py-2" placeholder="Dirección (línea 2 — opcional)"
              value={shipping.address2} onChange={(e) => setShipping({ ...shipping, address2: e.target.value })}/>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input className="border rounded-lg px-3 py-2 col-span-2" placeholder="Ciudad"
                value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })}/>
              <select className="border rounded-lg px-3 py-2" value={shipping.state}
                onChange={(e) => setShipping({ ...shipping, state: e.target.value })}>
                {Object.keys(STATE_TAX).map((st) => (<option key={st} value={st}>{st}</option>))}
                <option value="OTHER">OTHER</option>
              </select>
              <input className="border rounded-lg px-3 py-2" placeholder="ZIP"
                value={shipping.zip} onChange={(e) => setShipping({ ...shipping, zip: e.target.value })}/>
            </div>

            <div className="space-y-2">
              <div className="font-medium text-sm">Método de envío</div>
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
                    </div>
                    <b>${fmt(m.calc(subtotal))}</b>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Resumen + Pago */}
        <section className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="font-semibold mb-2">Resumen</h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><b>${fmt(subtotal)}</b></div>
              <div className="flex justify-between"><span>Envío</span><b>${fmt(shippingCost)}</b></div>
              <div className="flex justify-between"><span>Impuestos</span><b>${fmt(taxes)}</b></div>
              <div className="flex justify-between border-t pt-2 text-base"><span>Total</span><b>${fmt(total)}</b></div>
            </div>
            {items.length === 0 && (
              <div className="mt-2 text-sm text-gray-500">Tu carrito está vacío.</div>
            )}
          </div>

          {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded">{error}</div>}

          {clientSecret ? (
            <Elements options={{ clientSecret }} stripe={stripePromise}>
              <PaymentForm onPaid={handlePaid} />
            </Elements>
          ) : (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              {loading || creating ? "Preparando el pago…" : "Agrega/actualiza los datos para pagar."}
            </div>
          )}
        </section>
      </main>
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

    setLoading(true);
    setError("");
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (err) {
      setError(err.message || "Error procesando el pago.");
      setLoading(false);
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      await onPaid(paymentIntent);
    } else {
      setError("El pago no se completó. Intenta con otro método.");
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
        {loading ? "Procesando…" : "Pagar ahora"}
      </button>
    </form>
  );
}
