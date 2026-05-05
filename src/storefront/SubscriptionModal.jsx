// src/storefront/SubscriptionModal.jsx
import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { supabase } from "../supabaseClient";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create_payment_intent`;

const CICLO_LABEL = {
  semana:     "per week",
  quincena:   "every 2 weeks",
  mensual:    "per month",
  bimestral:  "every 2 months",
  trimestral: "every 3 months",
};

function addCycle(dateStr, ciclo) {
  const d = new Date(dateStr + "T00:00:00");
  switch (ciclo) {
    case "semana":     d.setDate(d.getDate() + 7);   break;
    case "quincena":   d.setDate(d.getDate() + 15);  break;
    case "bimestral":  d.setMonth(d.getMonth() + 2); break;
    case "trimestral": d.setMonth(d.getMonth() + 3); break;
    default:           d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function fmt$(n) {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ─── Backdrop modal base ─── */
function Backdrop({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4">
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-4 top-3 text-2xl text-gray-400 hover:text-black leading-none z-10"
          onClick={onClose}
        >×</button>
        {children}
      </div>
    </div>
  );
}

/* ─── Plan summary block (reutilizable en todas las fases) ─── */
function PlanSummary({ plan }) {
  const productos = Array.isArray(plan.productos) ? plan.productos : [];
  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-bold text-indigo-900 text-base">{plan.nombre}</h4>
          {plan.descripcion && <p className="text-sm text-indigo-700 mt-0.5">{plan.descripcion}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-black text-indigo-700">{fmt$(plan.precio)}</div>
          <div className="text-xs text-indigo-500">{CICLO_LABEL[plan.ciclo] || plan.ciclo}</div>
        </div>
      </div>
      {productos.length > 0 && (
        <div className="mt-3 border-t border-indigo-200 pt-3">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">What's included</p>
          <ul className="space-y-1">
            {productos.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-indigo-800">
                <span className="text-indigo-400 mt-0.5">✓</span>
                <span>
                  {item.nombre}
                  {item.nota && <span className="text-indigo-500 ml-1">— {item.nota}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── Phase 1: Collect info ─── */
function InfoPhase({ plan, user, onNext, onClose }) {
  const [f, setF] = useState({
    nombre: user?.user_metadata?.full_name || "",
    email: user?.email || "",
    telefono: "",
    address1: "",
    city: "",
    state: "",
    zip: "",
  });

  const canContinue = f.nombre.trim() && f.email.trim() && f.address1.trim() && f.city.trim() && f.zip.trim();

  return (
    <div className="p-5">
      <h3 className="text-xl font-bold mb-1">Subscribe</h3>
      <p className="text-sm text-gray-500 mb-4">Enter your delivery details to continue.</p>

      <PlanSummary plan={plan} />

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Full name *</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={f.nombre}
              onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))}
              placeholder="Jane Doe"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email *</label>
            <input
              type="email"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={f.email}
              onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))}
              placeholder="you@email.com"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</label>
            <input
              type="tel"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={f.telefono}
              onChange={(e) => setF((p) => ({ ...p, telefono: e.target.value }))}
              placeholder="(000) 000-0000"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivery address *</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={f.address1}
              onChange={(e) => setF((p) => ({ ...p, address1: e.target.value }))}
              placeholder="123 Main St"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">City *</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={f.city}
              onChange={(e) => setF((p) => ({ ...p, city: e.target.value }))}
              placeholder="Boston"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">State</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={f.state}
                onChange={(e) => setF((p) => ({ ...p, state: e.target.value }))}
                placeholder="MA"
                maxLength={2}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ZIP *</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={f.zip}
                onChange={(e) => setF((p) => ({ ...p, zip: e.target.value }))}
                placeholder="02101"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button className="flex-1 px-4 py-2.5 rounded-xl border hover:bg-gray-50 text-sm font-medium" onClick={onClose}>
          Cancel
        </button>
        <button
          className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
          disabled={!canContinue}
          onClick={() => onNext(f)}
        >
          Continue to payment →
        </button>
      </div>
    </div>
  );
}

/* ─── Phase 2: Stripe payment form ─── */
function PaymentForm({ plan, info, clientSecret, onPaid, onBack, error: outerErr }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState("");

  async function handlePay(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setErr("");
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });
      if (error) { setErr(error.message || "Payment failed."); return; }
      if (paymentIntent?.status === "succeeded") onPaid(paymentIntent);
      else setErr(`Unexpected payment status: ${paymentIntent?.status}`);
    } catch (ex) {
      setErr(ex.message || "Unexpected error.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="p-5">
      <h3 className="text-xl font-bold mb-1">Payment</h3>
      <p className="text-sm text-gray-500 mb-4">
        Subscribing as <strong>{info.nombre}</strong> · {info.email}
      </p>

      <PlanSummary plan={plan} />

      <div className="mt-4 border rounded-xl p-4 bg-gray-50">
        <PaymentElement />
      </div>

      {(err || outerErr) && (
        <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {err || outerErr}
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button className="px-4 py-2.5 rounded-xl border hover:bg-gray-50 text-sm font-medium" onClick={onBack}>
          ← Back
        </button>
        <button
          className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
          disabled={paying || !stripe}
          onClick={handlePay}
        >
          {paying ? (
            <span className="inline-flex items-center gap-2 justify-center">
              <span className="animate-spin">⟳</span> Processing…
            </span>
          ) : (
            `Pay ${fmt$(plan.precio)}`
          )}
        </button>
      </div>

      <p className="mt-3 text-[11px] text-gray-400 text-center">
        🔒 Secured by Stripe. Your card info is never stored on our servers.
      </p>
    </div>
  );
}

/* ─── Phase 3: Success ─── */
function SuccessPhase({ plan, info, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const nextDelivery = addCycle(today, plan.ciclo);
  return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-3xl mx-auto mb-4">
        ✓
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-1">You're subscribed!</h3>
      <p className="text-gray-500 text-sm mb-4">
        Welcome to <strong>{plan.nombre}</strong>. We've received your payment and will prepare your first delivery soon.
      </p>
      <div className="bg-gray-50 rounded-xl p-4 text-left text-sm space-y-2 mb-5">
        <div className="flex justify-between">
          <span className="text-gray-500">Plan</span>
          <span className="font-semibold">{plan.nombre}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Amount</span>
          <span className="font-semibold">{fmt$(plan.precio)} {CICLO_LABEL[plan.ciclo] || ""}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Deliver to</span>
          <span className="font-semibold text-right max-w-[60%]">{info.address1}, {info.city}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Next delivery</span>
          <span className="font-semibold text-indigo-700">{fmtDate(nextDelivery)}</span>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        A confirmation has been sent to <strong>{info.email}</strong>. Our team will contact you to confirm your first delivery.
      </p>
      <button
        className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
        onClick={onClose}
      >
        Back to store
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN EXPORT — SubscriptionModal
═══════════════════════════════════════════════ */
export default function SubscriptionModal({ plan, user, onClose }) {
  const [phase, setPhase] = useState("info"); // info | payment | success
  const [info, setInfo] = useState(null);
  const [clientSecret, setClientSecret] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  async function handleInfoNext(formData) {
    setInfo(formData);
    setCreateErr("");
    setCreating(true);
    try {
      // Guard: re-check spot availability before charging
      if (plan.cupo_maximo > 0) {
        const { count } = await supabase
          .from("subscription_clientes")
          .select("id", { count: "exact", head: true })
          .in("estado", ["activa", "pendiente"])
          .eq("plan_id", plan.id);
        if ((count || 0) >= plan.cupo_maximo) {
          throw new Error("Sorry, this plan just sold out. Please choose another.");
        }
      }

      const amountCents = Math.round(Number(plan.precio) * 100);
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          amount: amountCents,
          currency: "usd",
          metadata: {
            type: "subscription",
            plan_id: plan.id,
            plan_nombre: plan.nombre,
            ciclo: plan.ciclo,
          },
          shipping: {
            name: formData.nombre,
            phone: formData.telefono || undefined,
            address: {
              line1: formData.address1,
              city: formData.city,
              state: formData.state || undefined,
              postal_code: formData.zip,
              country: "US",
            },
          },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Error ${res.status}`);
      }
      const data = await res.json();
      if (!data?.clientSecret) throw new Error("Could not prepare payment.");
      setClientSecret(data.clientSecret);
      setPhase("payment");
    } catch (e) {
      setCreateErr(e.message || "Could not start payment.");
    } finally {
      setCreating(false);
    }
  }

  async function handlePaid(paymentIntent) {
    // 1. Find or create cliente
    let clienteId = null;
    try {
      const email = (info.email || "").trim().toLowerCase();

      // Try to find existing cliente by email
      const { data: existing } = await supabase
        .from("clientes")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existing?.id) {
        clienteId = existing.id;
      } else {
        // Create new cliente
        const direccion = [info.address1, info.city, info.state, info.zip].filter(Boolean).join(", ");
        const { data: created, error: cErr } = await supabase
          .from("clientes")
          .insert({
            nombre: (info.nombre || "").trim(),
            email,
            telefono: (info.telefono || "").replace(/\D/g, "") || null,
            direccion,
          })
          .select("id")
          .maybeSingle();
        if (cErr) throw cErr;
        clienteId = created?.id;
      }
    } catch (e) {
      console.warn("Could not find/create cliente:", e.message);
      // Continue anyway — admin can link manually
    }

    // 2. Create subscription record
    const today = new Date().toISOString().slice(0, 10);
    const direccion = [info.address1, info.city, info.state, info.zip].filter(Boolean).join(", ");
    try {
      await supabase.from("subscription_clientes").insert({
        cliente_id: clienteId || null,
        plan_id: plan.id,
        van_id: null,
        estado: "pendiente",
        fecha_inicio: today,
        proxima_entrega: addCycle(today, plan.ciclo),
        nota: [
          `Online — ${info.nombre}`,
          info.email,
          info.telefono ? `📞 ${info.telefono}` : null,
          `📍 ${direccion}`,
          `Stripe PI: ${paymentIntent.id}`,
        ].filter(Boolean).join(" · "),
      });
    } catch (e) {
      console.warn("Could not create subscription record:", e.message);
      // Still show success — payment went through
    }

    // 3. Notify admin
    try {
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
      if (adminEmail) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-order-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            to: adminEmail,
            subject: `Nueva suscripción online — ${plan.nombre}`,
            html: `
              <h2 style="color:#4f46e5">Nueva suscripción recibida</h2>
              <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
                <tr><td style="padding:6px 12px;color:#6b7280;width:140px">Plan</td><td style="padding:6px 12px;font-weight:600">${plan.nombre}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:6px 12px;color:#6b7280">Precio</td><td style="padding:6px 12px;font-weight:600">${fmt$(plan.precio)} / ${plan.ciclo}</td></tr>
                <tr><td style="padding:6px 12px;color:#6b7280">Cliente</td><td style="padding:6px 12px">${info.nombre}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:6px 12px;color:#6b7280">Email</td><td style="padding:6px 12px">${info.email}</td></tr>
                <tr><td style="padding:6px 12px;color:#6b7280">Teléfono</td><td style="padding:6px 12px">${info.telefono || "—"}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:6px 12px;color:#6b7280">Dirección</td><td style="padding:6px 12px">${direccion}</td></tr>
                <tr><td style="padding:6px 12px;color:#6b7280">Stripe PI</td><td style="padding:6px 12px;font-family:monospace;font-size:12px">${paymentIntent.id}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:6px 12px;color:#6b7280">Fecha</td><td style="padding:6px 12px">${today}</td></tr>
              </table>
              <p style="margin-top:16px;font-size:13px;color:#6b7280">Revisa el panel de Suscripciones para asignar van y confirmar.</p>
            `,
          }),
        });
      }
    } catch (e) {
      console.warn("Admin email failed:", e.message);
    }

    setPhase("success");
  }

  return (
    <Backdrop onClose={onClose}>
      {phase === "info" && (
        <>
          <InfoPhase plan={plan} user={user} onNext={handleInfoNext} onClose={onClose} />
          {creating && (
            <div className="px-5 pb-4 -mt-2 text-sm text-indigo-600 flex items-center gap-2">
              <span className="animate-spin">⟳</span> Preparing payment…
            </div>
          )}
          {createErr && (
            <div className="px-5 pb-4 -mt-2 text-sm text-rose-600">{createErr}</div>
          )}
        </>
      )}

      {phase === "payment" && clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: "stripe",
              variables: { colorPrimary: "#4f46e5", borderRadius: "10px" },
            },
          }}
        >
          <PaymentForm
            plan={plan}
            info={info}
            clientSecret={clientSecret}
            onPaid={handlePaid}
            onBack={() => setPhase("info")}
          />
        </Elements>
      )}

      {phase === "success" && (
        <SuccessPhase plan={plan} info={info} onClose={onClose} />
      )}
    </Backdrop>
  );
}
