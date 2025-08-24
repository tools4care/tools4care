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

function fmt(n) {
  return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ----------------------------- Componente ------------------------------ */
export default function Checkout() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const cidFromNav = state?.cid ?? null;

  const [items, setItems] = useState([]);
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // CARGA CARRITO + CREA PAYMENT INTENT
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true); setError("");

        const cid = cidFromNav || (await ensureCart());
        const list = await fetchCartItems(cid);
        if (cancel) return;
        setItems(list);

        const subtotal = list.reduce((s, it) => s + Number(it.qty) * Number(it.producto?.precio || 0), 0);
        const shipping = 0; // tu lógica real si aplica
        const taxes = 0;
        const amountCents = Math.round((subtotal + shipping + taxes) * 100);

        // si no hay productos, no creamos intent
        if (amountCents <= 0 || list.length === 0) {
          setClientSecret("");
          return;
        }

        setCreating(true);
        const res = await fetch(
          "https://gvloygqbavibmpakzdma.functions.supabase.co/create_payment_intent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ amount: amountCents }),
          }
        );
        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();
        if (cancel) return;
        setClientSecret(data.clientSecret);
      } catch (e) {
        if (!cancel) setError(e.message || "No se pudo iniciar el pago.");
      } finally {
        if (!cancel) { setCreating(false); setLoading(false); }
      }
    })();
    return () => (cancel = true);
  }, [cidFromNav]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.qty) * Number(it.producto?.precio || 0), 0),
    [items]
  );
  const shipping = 0;
  const taxes = 0;
  const total = subtotal + shipping + taxes;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">Checkout</h1>
          <Link to="/storefront" className="text-sm text-blue-600 hover:underline">
            ← Seguir comprando
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded">{error}</div>}

        {/* Resumen */}
        <section className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <h2 className="font-semibold mb-2">Resumen</h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><b>${fmt(subtotal)}</b></div>
            <div className="flex justify-between"><span>Envío</span><b>${fmt(shipping)}</b></div>
            <div className="flex justify-between"><span>Impuestos</span><b>${fmt(taxes)}</b></div>
            <div className="flex justify-between border-t pt-2 text-base"><span>Total</span><b>${fmt(total)}</b></div>
          </div>
          {items.length === 0 && (
            <div className="mt-2 text-sm text-gray-500">Tu carrito está vacío.</div>
          )}
        </section>

        {/* Payment Element */}
        {clientSecret ? (
          <Elements options={{ clientSecret }} stripe={stripePromise}>
            <PaymentForm />
          </Elements>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            {loading || creating ? "Preparando el pago…" : "Agrega productos para pagar."}
          </div>
        )}
      </main>
    </div>
  );
}

function PaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError("");
    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + "/storefront/checkout/success",
      },
    });
    if (err) setError(err.message || "Error procesando el pago.");
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
