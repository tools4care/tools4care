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
  const [cardSaved, setCardSaved] = useState(null); // { customerId, paymentMethodId, last4, brand }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.cliente_id || !form.plan_id) return;

    // If card element has input, capture it
    if (cardReady && stripe && elements && !cardSaved) {
      setProcessingCard(true);
      setStripeError("");
      try {
        // 1. Get client info
        const { data: cliente } = await supabase.from("clientes").select("nombre,email,telefono").eq("id", form.cliente_id).single();
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
        // 4. Confirm card setup
        const cardElement = elements.getElement(CardElement);
        const { setupIntent, error } = await stripe.confirmCardSetup(siData.client_secret, {
          payment_method: { card: cardElement, billing_details: { name: cliente?.nombre || "" } },
        });
        if (error) throw new Error(error.message);
        const pm = setupIntent.payment_method;
        // 5. Get card details
        const { data: pmList } = await supabase.functions.invoke("stripe-subscriptions", {
          body: { action: "list_payment_methods", customer_id: customerId },
        });
        const card = pmList?.payment_methods?.find(p => p.id === pm) || pmList?.payment_methods?.[0];
        setCardSaved({ customerId, paymentMethodId: pm, last4: card?.last4, brand: card?.brand });
        setProcessingCard(false);
        onSave({ customerId, paymentMethodId: pm, last4: card?.last4, brand: card?.brand });
      } catch (err) {
        setStripeError(err.message);
        setProcessingCard(false);
      }
    } else {
      onSave(cardSaved || null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-5 space-y-4">
      <h3 className="font-bold text-green-800">Enroll Client in Subscription</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1 block">Client *</label>
          <input placeholder="Search client…" value={clientSearch} onChange={e=>setClientSearch(e.target.value)}
            className="w-full border border-green-200 rounded-xl px-3 py-2 text-sm mb-1" />
          <select required value={form.cliente_id} onChange={e=>setForm(f=>({...f,cliente_id:e.target.value}))}
            className="w-full border border-green-200 rounded-xl px-3 py-2 text-sm bg-white" size={4}>
            <option value="">— select client —</option>
            {filteredClients.slice(0,50).map(c=>(
              <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ""}</option>
            ))}
          </select>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Subscription Plan *</label>
            <select required value={form.plan_id} onChange={e=>setForm(f=>({...f,plan_id:e.target.value}))}
              className="w-full border border-green-200 rounded-xl px-3 py-2 text-sm bg-white">
              <option value="">— select plan —</option>
              {planes.map(p=>(
                <option key={p.id} value={p.id}>{p.nombre} · {fmt(p.precio)}/{p.ciclo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Start Date</label>
            <input type="date" value={form.fecha_inicio} onChange={e=>setForm(f=>({...f,fecha_inicio:e.target.value}))}
              className="w-full border border-green-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Notes</label>
        <input value={form.nota} onChange={e=>setForm(f=>({...f,nota:e.target.value}))}
          className="w-full border border-green-200 rounded-xl px-3 py-2 text-sm"
          placeholder="e.g. Priority access, special notes…" />
      </div>

      {/* Stripe card input */}
      <div className="bg-white border border-green-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard size={16} className="text-blue-600"/>
          <p className="text-sm font-semibold text-gray-700">Card for recurring charges <span className="text-gray-400 font-normal">(optional)</span></p>
        </div>
        <div className="border border-gray-200 rounded-lg px-3 py-3 bg-gray-50">
          <CardElement onChange={e=>setCardReady(e.complete)}
            options={{ style: { base: { fontSize:"15px", color:"#374151", "::placeholder":{ color:"#9ca3af" } } } }} />
        </div>
        {stripeError && <p className="text-xs text-red-600 mt-2">{stripeError}</p>}
        <p className="text-xs text-gray-400 mt-2">Card will be securely saved in Stripe for monthly charges. Skip if client pays cash.</p>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving || processingCard}
          className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
          {(saving || processingCard) && <RefreshCw size={13} className="animate-spin"/>}
          {processingCard ? "Saving card…" : saving ? "Enrolling…" : "Enroll Client"}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 rounded-xl text-sm font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </form>
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
    const isAdmin = usuario?.rol === "admin";
    let subsQ = supabase.from("subscription_clientes")
      .select("*, subscription_planes(nombre,precio,ciclo,productos), clientes(nombre,telefono,email)")
      .order("created_at", { ascending: false });
    if (!isAdmin && van?.id) subsQ = subsQ.eq("van_id", van.id);

    let clientesQ = supabase.from("clientes").select("id,nombre,telefono").order("nombre").limit(500);
    if (!isAdmin && van?.id) clientesQ = clientesQ.eq("van_id", van.id);

    const [{ data: s }, { data: p }, { data: c }] = await Promise.all([
      subsQ,
      supabase.from("subscription_planes").select("id,nombre,precio,ciclo").eq("activo", true),
      clientesQ,
    ]);
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
    await supabase.from("subscription_clientes").insert({
      cliente_id: form.cliente_id,
      plan_id: form.plan_id,
      van_id: van?.id,
      estado: "activa",
      fecha_inicio: form.fecha_inicio || today.toISOString().slice(0,10),
      proxima_entrega: nextBilling.toISOString().slice(0,10),
      nota: form.nota,
      stripe_customer_id: stripeInfo?.customerId || null,
      stripe_payment_method_id: stripeInfo?.paymentMethodId || null,
      card_last4: stripeInfo?.last4 || null,
      card_brand: stripeInfo?.brand || null,
    });
    setSaving(false);
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
