import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Package, Users, Plus, X, ChevronDown, ChevronUp, CheckCircle, Clock, AlertCircle, RefreshCw, Truck, CreditCard } from "lucide-react";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

/* ─── Status badge ─── */
function StatusBadge({ status }) {
  const map = {
    activa:    { color: "bg-green-100 text-green-800",  icon: CheckCircle, label: "Active" },
    pausada:   { color: "bg-amber-100 text-amber-800",  icon: Clock,       label: "Paused" },
    cancelada: { color: "bg-red-100 text-red-800",      icon: X,           label: "Cancelled" },
    pendiente: { color: "bg-blue-100 text-blue-800",    icon: Clock,       label: "Pending" },
  };
  const s = map[status] || map.pendiente;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>
      <Icon size={10} /> {s.label}
    </span>
  );
}

/* ─── Summary card ─── */
function Card({ label, value, sub, color = "blue" }) {
  const cls = {
    blue:   "from-blue-50 to-blue-100 border-blue-200 text-blue-800",
    green:  "from-green-50 to-green-100 border-green-200 text-green-800",
    amber:  "from-amber-50 to-amber-100 border-amber-200 text-amber-800",
    purple: "from-purple-50 to-purple-100 border-purple-200 text-purple-800",
  }[color];
  return (
    <div className={`bg-gradient-to-br ${cls} border rounded-xl p-4 shadow-sm`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 1 — PLANES (subscription boxes)
═══════════════════════════════════════════════ */
function PlanesTab({ van, usuario }) {
  const isAdmin = usuario?.rol === "admin";
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "", precio: "", ciclo: "mensual", productos_txt: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPlanes(); }, []);

  async function loadPlanes() {
    setLoading(true);
    const { data } = await supabase
      .from("subscription_planes")
      .select("*")
      .order("created_at", { ascending: false });
    setPlanes(data || []);
    setLoading(false);
  }

  async function savePlan(e) {
    e.preventDefault();
    setSaving(true);
    const productos = form.productos_txt
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        const [nombre, ...rest] = l.split("-");
        return { nombre: nombre.trim(), nota: rest.join("-").trim() };
      });
    const payload = {
      nombre: form.nombre,
      descripcion: form.descripcion,
      precio: parseFloat(form.precio) || 0,
      ciclo: form.ciclo,
      productos,
      activo: true,
    };
    if (form.id) {
      await supabase.from("subscription_planes").update(payload).eq("id", form.id);
    } else {
      await supabase.from("subscription_planes").insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    setForm({ nombre: "", descripcion: "", precio: "", ciclo: "mensual", productos_txt: "" });
    loadPlanes();
  }

  async function togglePlan(id, activo) {
    await supabase.from("subscription_planes").update({ activo: !activo }).eq("id", id);
    loadPlanes();
  }

  function editPlan(p) {
    setForm({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion || "",
      precio: p.precio,
      ciclo: p.ciclo || "mensual",
      productos_txt: (p.productos || []).map(x => x.nota ? `${x.nombre} - ${x.nota}` : x.nombre).join("\n"),
    });
    setShowForm(true);
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Loading plans…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">{planes.length} subscription box{planes.length !== 1 ? "es" : ""} configured</p>
        {isAdmin && (
          <button onClick={() => { setForm({ nombre:"",descripcion:"",precio:"",ciclo:"mensual",productos_txt:"" }); setShowForm(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
            <Plus size={15}/> New Box Plan
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && isAdmin && (
        <form onSubmit={savePlan} className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-6 space-y-4">
          <h3 className="font-bold text-blue-800">{form.id ? "Edit Plan" : "New Subscription Box"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Box Name *</label>
              <input required value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm" placeholder="e.g. Monthly Barber Box" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Price / Month *</label>
                <input required type="number" step="0.01" min="0" value={form.precio} onChange={e=>setForm(f=>({...f,precio:e.target.value}))}
                  className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm" placeholder="35.00" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Cycle</label>
                <select value={form.ciclo} onChange={e=>setForm(f=>({...f,ciclo:e.target.value}))}
                  className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white">
                  <option value="mensual">Monthly</option>
                  <option value="bimestral">Bi-monthly</option>
                  <option value="trimestral">Quarterly</option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Description</label>
            <input value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}
              className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm" placeholder="What's included in this box…" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              Products (one per line, format: <code>Product Name - optional note</code>)
            </label>
            <textarea rows={5} value={form.productos_txt} onChange={e=>setForm(f=>({...f,productos_txt:e.target.value}))}
              className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm font-mono"
              placeholder={"Cool Care Foam\nDorco Blades - 10 pack\nAfter Shave Lotion\nNeck Strip Roll"} />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
              {saving ? "Saving…" : form.id ? "Update Plan" : "Create Plan"}
            </button>
            <button type="button" onClick={()=>setShowForm(false)} className="px-5 py-2 rounded-xl text-sm font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      {/* Plan cards */}
      <div className="space-y-4">
        {planes.length === 0 && <p className="text-center py-12 text-gray-400">No subscription plans yet.</p>}
        {planes.map(p => (
          <div key={p.id} className={`bg-white border-2 rounded-2xl overflow-hidden transition-all ${p.activo ? "border-blue-200" : "border-gray-200 opacity-60"}`}>
            <div className="flex items-center justify-between p-4 cursor-pointer" onClick={()=>setExpanded(expanded===p.id?null:p.id)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                  <Package size={18} className="text-white"/>
                </div>
                <div>
                  <p className="font-bold text-gray-900">{p.nombre}</p>
                  <p className="text-xs text-gray-500">{p.descripcion || `${(p.productos||[]).length} products included`}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-bold text-blue-700 text-lg">{fmt(p.precio)}</p>
                  <p className="text-xs text-gray-400 capitalize">{p.ciclo}</p>
                </div>
                {expanded===p.id ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
              </div>
            </div>
            {expanded===p.id && (
              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Includes</p>
                <ul className="space-y-1 mb-4">
                  {(p.productos||[]).map((prod,i)=>(
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold">{i+1}</span>
                      {prod.nombre}{prod.nota && <span className="text-gray-400 text-xs">· {prod.nota}</span>}
                    </li>
                  ))}
                  {(p.productos||[]).length===0 && <li className="text-xs text-gray-400">No products listed</li>}
                </ul>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={()=>editPlan(p)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700">Edit</button>
                    <button onClick={()=>togglePlan(p.id,p.activo)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${p.activo?"border-red-300 text-red-600 hover:bg-red-50":"border-green-300 text-green-600 hover:bg-green-50"}`}>
                      {p.activo ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 2 — SUSCRIPTORES (enrolled clients)
═══════════════════════════════════════════════ */
/* ─── Stripe Enroll Form ─── */
function EnrollForm({ form, setForm, planes, filteredClients, clientSearch, setClientSearch, saving, onSave, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [stripeError, setStripeError] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [processingCard, setProcessingCard] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  // Derived: selected client object
  const selectedClient = filteredClients.find(c => c.id === form.cliente_id) || null;
  const selectedPlan   = planes.find(p => p.id === form.plan_id) || null;

  function pickClient(c) {
    setForm(f => ({ ...f, cliente_id: c.id }));
    setClientSearch(c.nombre);
    setShowDropdown(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.cliente_id || !form.plan_id) return;

    if (cardReady && stripe && elements) {
      setProcessingCard(true);
      setStripeError("");
      try {
        // 1. Fetch client info (already have it from filteredClients)
        const cliente = selectedClient;
        // 2. Create Stripe customer
        const { data: custData } = await supabase.functions.invoke("stripe-subscriptions", {
          body: { action: "create_customer", name: cliente?.nombre, email: cliente?.email, phone: cliente?.telefono,
            metadata: { supabase_cliente_id: form.cliente_id } },
        });
        if (!custData?.ok) throw new Error(custData?.error || "Could not create customer");
        const customerId = custData.customer_id;
        // 3. Create setup intent
        const { data: siData } = await supabase.functions.invoke("stripe-subscriptions", {
          body: { action: "create_setup_intent", customer_id: customerId },
        });
        if (!siData?.ok) throw new Error(siData?.error || "Could not create setup intent");
        // 4. Confirm card
        const cardElement = elements.getElement(CardElement);
        const { setupIntent, error } = await stripe.confirmCardSetup(siData.client_secret, {
          payment_method: { card: cardElement, billing_details: { name: cliente?.nombre || "" } },
        });
        if (error) throw new Error(error.message);
        const pm = setupIntent.payment_method;
        // 5. Get last4/brand
        const { data: pmList } = await supabase.functions.invoke("stripe-subscriptions", {
          body: { action: "list_payment_methods", customer_id: customerId },
        });
        const card = pmList?.payment_methods?.find(p => p.id === pm) || pmList?.payment_methods?.[0];
        setProcessingCard(false);
        onSave({ customerId, paymentMethodId: pm, last4: card?.last4, brand: card?.brand });
      } catch (err) {
        setStripeError(err.message);
        setProcessingCard(false);
      }
    } else {
      onSave(null);
    }
  }

  return (
    <div className="bg-white border-2 border-blue-200 rounded-2xl shadow-xl mb-6 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <Users size={18} className="text-white"/>
          </div>
          <div>
            <p className="text-white font-bold">Enroll Client in Subscription</p>
            <p className="text-blue-100 text-xs">Fill client info, plan and card details</p>
          </div>
        </div>
        <button type="button" onClick={onCancel} className="text-white/70 hover:text-white">
          <X size={20}/>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">

        {/* ── STEP 1: Client search ── */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">1. Select Client</label>
          <div className="relative" ref={searchRef}>
            <input
              value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setShowDropdown(true); setForm(f=>({...f,cliente_id:""})); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Type to search by name or phone…"
              className="w-full border-2 border-gray-200 focus:border-blue-400 rounded-xl px-4 py-3 text-sm outline-none transition-all"
            />
            {showDropdown && filteredClients.length > 0 && !form.cliente_id && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                {filteredClients.slice(0,30).map(c => (
                  <button key={c.id} type="button"
                    onMouseDown={() => pickClient(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm flex justify-between items-center border-b border-gray-50 last:border-0">
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="text-xs text-gray-400">{c.telefono || ""}</span>
                  </button>
                ))}
                {filteredClients.length === 0 && (
                  <p className="px-4 py-3 text-sm text-gray-400">No clients found</p>
                )}
              </div>
            )}
          </div>

          {/* Selected client info card */}
          {selectedClient && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {selectedClient.nombre?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-blue-900">{selectedClient.nombre}</p>
                {selectedClient.telefono && <p className="text-xs text-blue-600">📞 {selectedClient.telefono}</p>}
                {selectedClient.email   && <p className="text-xs text-blue-600">✉️ {selectedClient.email}</p>}
                {selectedClient.direccion && <p className="text-xs text-gray-500">📍 {selectedClient.direccion}</p>}
              </div>
              <button type="button" onClick={()=>{ setForm(f=>({...f,cliente_id:""})); setClientSearch(""); }}
                className="text-blue-400 hover:text-red-500 flex-shrink-0">
                <X size={14}/>
              </button>
            </div>
          )}
        </div>

        {/* ── STEP 2: Plan + Date ── */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">2. Subscription Plan</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select required value={form.plan_id} onChange={e=>setForm(f=>({...f,plan_id:e.target.value}))}
              className="border-2 border-gray-200 focus:border-blue-400 rounded-xl px-4 py-3 text-sm bg-white outline-none transition-all">
              <option value="">— select plan —</option>
              {planes.map(p=>(
                <option key={p.id} value={p.id}>{p.nombre} · {fmt(p.precio)}/{p.ciclo}</option>
              ))}
            </select>
            <input type="date" value={form.fecha_inicio} onChange={e=>setForm(f=>({...f,fecha_inicio:e.target.value}))}
              className="border-2 border-gray-200 focus:border-blue-400 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
          </div>

          {/* Plan preview */}
          {selectedPlan && (
            <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <Package size={20} className="text-indigo-600 flex-shrink-0"/>
              <div>
                <p className="font-bold text-indigo-900">{selectedPlan.nombre}</p>
                <p className="text-xs text-indigo-600 font-semibold">{fmt(selectedPlan.precio)} / {selectedPlan.ciclo} · charged monthly</p>
              </div>
            </div>
          )}
        </div>

        {/* ── STEP 3: Notes ── */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">3. Notes (optional)</label>
          <input value={form.nota} onChange={e=>setForm(f=>({...f,nota:e.target.value}))}
            className="w-full border-2 border-gray-200 focus:border-blue-400 rounded-xl px-4 py-3 text-sm outline-none transition-all"
            placeholder="Special notes, delivery preferences…" />
        </div>

        {/* ── STEP 4: Card ── */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">4. Payment Card (for recurring monthly charge)</label>
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 shadow-lg">
            {/* Card visual */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1">
                <div className="w-5 h-4 bg-yellow-400 rounded-sm opacity-90"/>
                <div className="w-5 h-4 bg-orange-500 rounded-sm opacity-60 -ml-2"/>
              </div>
              <CreditCard size={20} className="text-slate-400"/>
            </div>
            <div className="mb-4">
              <p className="text-slate-400 text-xs mb-1 font-medium">CARDHOLDER</p>
              <p className="text-white font-semibold text-sm">{selectedClient?.nombre || "— select client first —"}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-3">
              <CardElement
                onChange={e => setCardReady(e.complete)}
                options={{
                  style: {
                    base: {
                      fontSize: "15px",
                      color: "#ffffff",
                      fontFamily: "monospace",
                      letterSpacing: "0.05em",
                      "::placeholder": { color: "#94a3b8" },
                    },
                    invalid: { color: "#f87171" },
                  },
                  hidePostalCode: false,
                }}
              />
            </div>
            {stripeError && (
              <div className="mt-3 bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-2">
                <p className="text-red-300 text-xs">{stripeError}</p>
              </div>
            )}
            <p className="text-slate-400 text-xs mt-3 flex items-center gap-1.5">
              🔒 Secured by Stripe. Card data never touches our servers.
            </p>
          </div>
          <p className="text-xs text-gray-400 mt-2">Leave card blank if client will pay by cash — you can add a card later.</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving || processingCard || !form.cliente_id || !form.plan_id}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
            {(saving || processingCard) && <RefreshCw size={14} className="animate-spin"/>}
            {processingCard ? "Saving card to Stripe…" : saving ? "Enrolling…" : cardReady ? "Enroll & Save Card" : "Enroll Client"}
          </button>
          <button type="button" onClick={onCancel}
            className="px-6 py-3 rounded-xl text-sm font-semibold border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-all">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Charge button (off-session) ─── */
function ChargeButton({ sub, onDone }) {
  const [charging, setCharging] = useState(false);
  const [result, setResult] = useState(null);

  async function charge() {
    if (!confirm(`Charge ${fmt(sub.subscription_planes?.precio)} to card ···· ${sub.card_last4}?`)) return;
    setCharging(true);
    setResult(null);
    try {
      const { data } = await supabase.functions.invoke("stripe-subscriptions", {
        body: {
          action: "charge_subscription",
          customer_id: sub.stripe_customer_id,
          payment_method_id: sub.stripe_payment_method_id,
          amount_cents: Math.round(Number(sub.subscription_planes?.precio || 0) * 100),
          description: `${sub.subscription_planes?.nombre} — ${sub.clientes?.nombre}`,
        },
      });
      if (!data?.ok) throw new Error(data?.error || "Charge failed");
      setResult({ ok: true, msg: `Charged ${fmt(sub.subscription_planes?.precio)} ✓` });
      onDone();
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setCharging(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={charge} disabled={charging}
        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
        <CreditCard size={11}/> {charging ? "Charging…" : "Charge Now"}
      </button>
      {result && (
        <span className={`text-xs font-semibold ${result.ok ? "text-green-600" : "text-red-500"}`}>{result.msg}</span>
      )}
    </div>
  );
}

function SuscriptoresTab({ van, usuario }) {
  const isAdmin = usuario?.rol === "admin";
  const [subs, setSubs] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("activa");
  const [form, setForm] = useState({ cliente_id:"", plan_id:"", fecha_inicio:"", nota:"" });
  const [saving, setSaving] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  useEffect(() => {
    loadAll();
  }, [van?.id]);

  async function loadAll() {
    setLoading(true);
    setDbError(null);
    const isAdmin = usuario?.rol === "admin";
    let subsQ = supabase.from("subscription_clientes")
      .select("*, subscription_planes(nombre,precio,ciclo,productos), clientes(nombre,telefono,email)")
      .order("created_at", { ascending: false });
    if (!isAdmin && van?.id) subsQ = subsQ.eq("van_id", van.id);

    let clientesQ = supabase.from("clientes").select("id,nombre,telefono,email").order("nombre").limit(500);
    if (!isAdmin && van?.id) clientesQ = clientesQ.eq("van_id", van.id);

    const [{ data: s, error: sErr }, { data: p }, { data: c }] = await Promise.all([
      subsQ,
      supabase.from("subscription_planes").select("id,nombre,precio,ciclo").eq("activo", true),
      clientesQ,
    ]);

    if (sErr) {
      setDbError(sErr.message.includes("does not exist")
        ? "Tables not created yet. Run the SQL migration in your Supabase dashboard first."
        : sErr.message);
    }
    setSubs(s || []);
    setPlanes(p || []);
    setClientes(c || []);
    setLoading(false);
  }

  async function enroll(stripeInfo) {
    setSaving(true);
    const today = new Date();
    const nextBilling = new Date(today);
    nextBilling.setMonth(nextBilling.getMonth() + 1);
    const { error } = await supabase.from("subscription_clientes").insert({
      cliente_id: form.cliente_id,
      plan_id: form.plan_id,
      van_id: van?.id || null,
      estado: "activa",
      fecha_inicio: form.fecha_inicio || today.toISOString().slice(0,10),
      proxima_entrega: nextBilling.toISOString().slice(0,10),
      nota: form.nota || null,
      stripe_customer_id: stripeInfo?.customerId || null,
      stripe_payment_method_id: stripeInfo?.paymentMethodId || null,
      card_last4: stripeInfo?.last4 || null,
      card_brand: stripeInfo?.brand || null,
    });
    setSaving(false);
    if (error) {
      alert("Error enrolling: " + error.message);
      return;
    }
    setShowForm(false);
    setForm({ cliente_id:"", plan_id:"", fecha_inicio:"", nota:"" });
    loadAll();
  }

  async function changeStatus(id, estado) {
    await supabase.from("subscription_clientes").update({ estado }).eq("id", id);
    loadAll();
  }

  async function markDelivered(id) {
    const sub = subs.find(s => s.id === id);
    if (!sub) return;
    const next = new Date(sub.proxima_entrega || new Date());
    next.setMonth(next.getMonth() + 1);
    await supabase.from("subscription_clientes").update({
      ultima_entrega: new Date().toISOString().slice(0,10),
      proxima_entrega: next.toISOString().slice(0,10),
    }).eq("id", id);
    await supabase.from("subscription_entregas").insert({
      suscripcion_id: id,
      fecha: new Date().toISOString().slice(0,10),
      estado: "entregado",
    });
    loadAll();
  }

  const filtered = subs.filter(s => filterStatus === "all" || s.estado === filterStatus);
  const filteredClients = clientes.filter(c => c.nombre.toLowerCase().includes(clientSearch.toLowerCase()));

  const summary = {
    activas: subs.filter(s => s.estado === "activa").length,
    mrr: subs.filter(s => s.estado === "activa").reduce((t, s) => t + Number(s.subscription_planes?.precio || 0), 0),
    proximas: subs.filter(s => s.estado === "activa" && s.proxima_entrega <= new Date().toISOString().slice(0,10)).length,
  };

  if (loading) return <div className="py-16 text-center text-gray-400">Loading subscribers…</div>;

  if (dbError) return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
      <p className="font-bold text-red-700 mb-1">Database setup required</p>
      <p className="text-sm text-red-600 mb-4">{dbError}</p>
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer font-semibold mb-2">Show migration SQL</summary>
        <pre className="bg-gray-900 text-green-300 p-4 rounded-xl overflow-x-auto text-xs">{`create table if not exists subscription_planes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, descripcion text,
  precio numeric(10,2) not null default 0,
  ciclo text not null default 'mensual',
  productos jsonb default '[]', activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists subscription_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  plan_id uuid references subscription_planes(id) on delete restrict,
  van_id uuid references vans(id) on delete cascade,
  estado text not null default 'activa',
  fecha_inicio date not null default current_date,
  proxima_entrega date, ultima_entrega date, nota text,
  stripe_customer_id text, stripe_payment_method_id text,
  card_last4 text, card_brand text,
  created_at timestamptz not null default now()
);
create table if not exists subscription_entregas (
  id uuid primary key default gen_random_uuid(),
  suscripcion_id uuid references subscription_clientes(id) on delete cascade,
  fecha date not null default current_date,
  estado text not null default 'entregado', notas text,
  created_at timestamptz not null default now()
);
alter table subscription_planes enable row level security;
alter table subscription_clientes enable row level security;
alter table subscription_entregas enable row level security;
create policy "auth" on subscription_planes for all using (auth.role()='authenticated');
create policy "auth" on subscription_clientes for all using (auth.role()='authenticated');
create policy "auth" on subscription_entregas for all using (auth.role()='authenticated');`}</pre>
      </details>
    </div>
  );

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card label="Active Subscribers" value={summary.activas} color="green" />
        <Card label="Monthly Revenue (MRR)" value={fmt(summary.mrr)} color="blue" />
        <Card label="Deliveries Due Today" value={summary.proximas} color="amber" sub="based on next delivery date" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {[["activa","Active"],["pausada","Paused"],["cancelada","Cancelled"],["all","All"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilterStatus(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus===v?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={()=>setShowForm(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Plus size={15}/> Enroll Client
        </button>
      </div>

      {/* Enroll form */}
      {showForm && (
        <Elements stripe={stripePromise}>
          <EnrollForm
            form={form} setForm={setForm}
            planes={planes}
            filteredClients={filteredClients}
            clientSearch={clientSearch} setClientSearch={setClientSearch}
            saving={saving}
            onSave={enroll}
            onCancel={()=>setShowForm(false)}
          />
        </Elements>
      )}

      {/* Subscribers list */}
      <div className="space-y-3">
        {filtered.length===0 && <p className="text-center py-12 text-gray-400">No subscribers with status "{filterStatus}"</p>}
        {filtered.map(s => {
          const isOverdue = s.proxima_entrega && s.proxima_entrega <= new Date().toISOString().slice(0,10) && s.estado==="activa";
          return (
            <div key={s.id} className={`bg-white border-2 rounded-2xl p-4 ${isOverdue?"border-amber-300":"border-gray-100"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOverdue?"bg-amber-500":"bg-green-600"}`}>
                    <Users size={18} className="text-white"/>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{s.clientes?.nombre || "—"}</p>
                    <p className="text-xs text-gray-500">{s.clientes?.telefono || ""} {s.clientes?.email ? `· ${s.clientes.email}` : ""}</p>
                    <p className="text-sm text-blue-700 font-semibold mt-0.5">{s.subscription_planes?.nombre} · {fmt(s.subscription_planes?.precio)}/mo</p>
                    {s.nota && <p className="text-xs text-gray-400 mt-0.5">📝 {s.nota}</p>}
                    {s.card_last4 && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <CreditCard size={11}/> {s.card_brand || "Card"} ···· {s.card_last4}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={s.estado} />
                  <p className="text-xs text-gray-400">Next delivery: <span className={`font-semibold ${isOverdue?"text-amber-600":"text-gray-700"}`}>{fmtDate(s.proxima_entrega)}</span></p>
                  {s.ultima_entrega && <p className="text-xs text-gray-400">Last: {fmtDate(s.ultima_entrega)}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                {s.estado==="activa" && (
                  <>
                    <button onClick={()=>markDelivered(s.id)}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                      <Truck size={12}/> Mark Delivered
                    </button>
                    {s.stripe_customer_id && s.stripe_payment_method_id && (
                      <ChargeButton sub={s} onDone={loadAll} />
                    )}
                    <button onClick={()=>changeStatus(s.id,"pausada")}
                      className="border border-amber-300 text-amber-700 hover:bg-amber-50 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      Pause
                    </button>
                    <button onClick={()=>changeStatus(s.id,"cancelada")}
                      className="border border-red-300 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      Cancel
                    </button>
                  </>
                )}
                {s.estado==="pausada" && (
                  <button onClick={()=>changeStatus(s.id,"activa")}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                    Reactivate
                  </button>
                )}
                {s.estado==="cancelada" && (
                  <button onClick={()=>changeStatus(s.id,"activa")}
                    className="border border-green-300 text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg text-xs font-semibold">
                    Re-enroll
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 3 — ENTREGAS (delivery history)
═══════════════════════════════════════════════ */
function EntregasTab({ van }) {
  const [entregas, setEntregas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [van?.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("subscription_entregas")
      .select(`
        id, fecha, estado, created_at,
        suscripcion_id,
        subscription_clientes:suscripcion_id(
          cliente_id, clientes(nombre),
          plan_id, subscription_planes(nombre,precio)
        )
      `)
      .order("fecha", { ascending: false })
      .limit(100);
    setEntregas(data || []);
    setLoading(false);
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Loading delivery history…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{entregas.length} recent deliveries</p>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600">
          <RefreshCw size={13}/> Refresh
        </button>
      </div>
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-2xl">
        <table className="min-w-full text-sm divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {["Date","Client","Plan","Status"].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entregas.length===0 && (
              <tr><td colSpan={4} className="text-center py-10 text-gray-400">No deliveries recorded yet</td></tr>
            )}
            {entregas.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium">{fmtDate(e.fecha)}</td>
                <td className="px-4 py-2.5">{e.subscription_clientes?.clientes?.nombre || "—"}</td>
                <td className="px-4 py-2.5 text-blue-700">{e.subscription_clientes?.subscription_planes?.nombre || "—"}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                    {e.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
const TABS = [
  { id: "planes",       label: "Box Plans",    icon: Package },
  { id: "suscriptores", label: "Subscribers",  icon: Users },
  { id: "entregas",     label: "Deliveries",   icon: Truck },
];

export default function Suscripciones() {
  const { usuario } = useUsuario();
  const { van } = useVan();
  const [activeTab, setActiveTab] = useState("suscriptores");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Package size={22} className="text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
            <p className="text-sm text-gray-500">Monthly box plans & recurring clients</p>
          </div>
        </div>

        {!van?.id && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800 text-sm mb-6">
            ⚠️ Select a VAN first to manage subscriptions.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 mb-6 shadow-sm">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab===t.id?"bg-blue-600 text-white shadow":"text-gray-500 hover:text-gray-800"}`}>
                <Icon size={15}/> {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="bg-white rounded-3xl shadow-xl p-5">
          {activeTab==="planes"       && <PlanesTab       van={van} usuario={usuario}/>}
          {activeTab==="suscriptores" && van?.id && <SuscriptoresTab van={van} usuario={usuario}/>}
          {activeTab==="entregas"     && van?.id && <EntregasTab     van={van}/>}
        </div>
      </div>
    </div>
  );
}
