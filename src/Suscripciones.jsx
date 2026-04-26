import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Package, Users, Plus, X, ChevronDown, ChevronUp, ChevronRight, CheckCircle, Clock, AlertCircle, RefreshCw, Truck, CreditCard, DollarSign, Trash2, RotateCcw, PenTool, MapPin, Phone, Navigation2 } from "lucide-react";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};
// Advance a date string by plan cycle (mirrors calcNext in the edge function)
function addCycle(dateStr, ciclo) {
  const d = new Date((dateStr || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  switch (ciclo) {
    case "semana":     d.setDate(d.getDate() + 7);   break;
    case "quincena":   d.setDate(d.getDate() + 15);  break;
    case "bimestral":  d.setMonth(d.getMonth() + 2); break;
    case "trimestral": d.setMonth(d.getMonth() + 3); break;
    default:           d.setMonth(d.getMonth() + 1); // mensual
  }
  return d.toISOString().slice(0, 10);
}

const CICLO_LABEL = {
  semana:     "Weekly",
  quincena:   "Bi-weekly (15d)",
  mensual:    "Monthly",
  bimestral:  "Bi-monthly",
  trimestral: "Quarterly",
};

// Normalizes address whether stored as JSON obj, JSON string, or plain text
function fmtAddr(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof obj === "object" && obj !== null) {
      return [obj.calle, obj.ciudad, obj.estado, obj.zip].filter(Boolean).join(", ");
    }
  } catch {}
  return String(raw);
}

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

/* ─── Signature pad ─── */
function SignaturePad({ onSignature }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [hasContent, setHasContent] = useState(false);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }

  function startDraw(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const pos = getPos(e, canvas);
    drawing.current = true;
    lastPos.current = pos;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    setHasContent(true);
  }

  function drawMove(e) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    const dataUrl = canvas.toDataURL("image/png");
    onSignature(dataUrl);
    setHasContent(true);
  }

  function endDraw(e) { e.preventDefault(); drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onSignature(null);
  }

  return (
    <div>
      <div className="relative border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          className="w-full touch-none"
          style={{ cursor: "crosshair", display: "block" }}
          onMouseDown={startDraw}
          onMouseMove={drawMove}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={drawMove}
          onTouchEnd={endDraw}
        />
        {!hasContent && (
          <p className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none select-none">
            Sign here
          </p>
        )}
      </div>
      {hasContent && (
        <button type="button" onClick={clear}
          className="text-xs text-red-400 hover:text-red-600 mt-1 flex items-center gap-1">
          <RotateCcw size={10}/> Clear signature
        </button>
      )}
    </div>
  );
}

/* ─── Delivery confirm modal ─── */
function DeliveryConfirmModal({ sub, onConfirm, onCancel }) {
  const [note, setNote] = useState("");
  const [firma, setFirma] = useState(null);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck size={18} className="text-white"/>
            <div>
              <p className="text-white font-bold">Confirm Delivery</p>
              <p className="text-green-100 text-xs">{sub.clientes?.nombre}</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-white/70 hover:text-white"><X size={20}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <Package size={15} className="text-blue-600"/>
            <div>
              <p className="text-xs text-gray-500">Delivering</p>
              <p className="font-semibold text-gray-800 text-sm">{sub.subscription_planes?.nombre}</p>
            </div>
            <p className="ml-auto font-bold text-blue-700">{fmt(sub.subscription_planes?.precio)}</p>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Delivery Note</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-400"
              placeholder="e.g. Left at door, client was home…" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5 block">
              <PenTool size={11}/> Client Signature (optional)
            </label>
            <SignaturePad onSignature={setFirma} />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => onConfirm({ note: note || null, firma })}
              className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
              <CheckCircle size={15}/> Confirm Delivery
            </button>
            <button onClick={onCancel}
              className="px-5 py-3 rounded-xl text-sm font-semibold border-2 border-gray-200 text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
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
                  <option value="semana">Weekly</option>
                  <option value="quincena">Bi-weekly (15d)</option>
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
                  <p className="text-xs text-gray-400">{CICLO_LABEL[p.ciclo] || p.ciclo}</p>
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
/* ─── Subscriber Card ─── */
function SubscriberCard({ s, onMarkDelivered, onChargeDone, onChangeStatus, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [entregas, setEntregas] = useState([]);
  const [loadingEntregas, setLoadingEntregas] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isOverdue = s.proxima_entrega && s.proxima_entrega <= new Date().toISOString().slice(0,10) && s.estado === "activa";
  const hasCard = s.stripe_customer_id && s.stripe_payment_method_id;
  const productos = s.subscription_planes?.productos || [];

  async function loadEntregas() {
    setLoadingEntregas(true);
    const { data } = await supabase.from("subscription_entregas")
      .select("id, fecha, estado, notas, firma")
      .eq("suscripcion_id", s.id)
      .order("fecha", { ascending: false })
      .limit(10);
    setEntregas(data || []);
    setLoadingEntregas(false);
  }

  async function toggleExpand() {
    if (!expanded) await loadEntregas();
    setExpanded(e => !e);
  }

  async function deleteEntrega(entregaId) {
    if (!confirm("Delete this delivery record permanently?")) return;
    await supabase.from("subscription_entregas").delete().eq("id", entregaId);
    loadEntregas();
  }

  async function returnEntrega(entregaId) {
    if (!confirm("Mark this delivery as returned?")) return;
    await supabase.from("subscription_entregas").update({ estado: "devuelto" }).eq("id", entregaId);
    loadEntregas();
  }

  // Days until next delivery
  const today = new Date().toISOString().slice(0,10);
  const daysUntil = s.proxima_entrega
    ? Math.ceil((new Date(s.proxima_entrega) - new Date(today)) / 86400000)
    : null;

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border-2 transition-all ${isOverdue ? "border-amber-400" : hasCard ? "border-blue-200" : "border-gray-100"}`}>

      {/* ── Top banner: next delivery ── */}
      <div className={`px-5 py-3 flex items-center justify-between ${isOverdue ? "bg-amber-500" : "bg-gradient-to-r from-blue-600 to-indigo-600"}`}>
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-white"/>
          <div>
            <p className="text-white/70 text-xs font-medium">Next Delivery</p>
            <p className="text-white font-bold text-base leading-tight">{fmtDate(s.proxima_entrega)}</p>
          </div>
        </div>
        <div className="text-right">
          {daysUntil !== null && (
            <p className={`text-lg font-black ${isOverdue ? "text-white" : "text-white"}`}>
              {isOverdue ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? "Today!" : `in ${daysUntil}d`}
            </p>
          )}
          {s.ultima_entrega && <p className="text-white/60 text-xs">Last: {fmtDate(s.ultima_entrega)}</p>}
        </div>
      </div>

      {/* ── Client + plan info ── */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
              {(s.clientes?.nombre || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-base">{s.clientes?.nombre || "—"}</p>
              {s.clientes?.telefono && <p className="text-xs text-gray-500">📞 {s.clientes.telefono}</p>}
              {s.clientes?.email    && <p className="text-xs text-gray-500">✉️ {s.clientes.email}</p>}
              {s.nota && <p className="text-xs text-gray-400 mt-0.5">📝 {s.nota}</p>}
            </div>
          </div>
          <StatusBadge status={s.estado}/>
        </div>

        {/* Plan + price */}
        <div className="mt-3 bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-indigo-600"/>
            <div>
              <p className="text-xs text-indigo-500 font-medium">Subscription Plan</p>
              <p className="font-bold text-indigo-900 text-sm">{s.subscription_planes?.nombre || "—"}</p>
            </div>
          </div>
          <p className="text-xl font-black text-indigo-700">{fmt(s.subscription_planes?.precio)}<span className="text-xs font-normal text-indigo-400">/mo</span></p>
        </div>

        {/* Payment method */}
        <div className={`mt-2 rounded-xl px-4 py-2.5 flex items-center justify-between ${hasCard ? "bg-slate-800" : "bg-gray-100"}`}>
          {hasCard ? (
            <>
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-slate-300"/>
                <div>
                  <p className="text-slate-400 text-xs">Card on file</p>
                  <p className="text-white font-bold text-sm capitalize">{s.card_brand || "Card"} ···· {s.card_last4}</p>
                </div>
              </div>
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-semibold">Auto-charge</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-500"/>
                <p className="text-xs text-gray-600 font-medium">No card on file — cash payment</p>
              </div>
              <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-semibold">Manual</span>
            </>
          )}
        </div>
      </div>

      {/* ── Products included ── */}
      {productos.length > 0 && (
        <div className="px-5 pb-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Box Contents</p>
          <div className="flex flex-wrap gap-1.5">
            {productos.map((p, i) => (
              <span key={i} className="bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full border border-blue-100">
                {p.nombre}{p.nota ? ` · ${p.nota}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="px-5 pb-4 flex flex-wrap gap-2">
        {s.estado === "activa" && (
          <>
            <button onClick={() => setShowDeliverModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <Truck size={13}/> Mark Delivered
            </button>
            {hasCard && <ChargeButton sub={s} onDone={onChargeDone}/>}
            <button onClick={() => onChangeStatus(s.id, "pausada")}
              className="border-2 border-amber-300 text-amber-700 hover:bg-amber-50 px-3 py-2 rounded-xl text-xs font-bold">
              Pause
            </button>
            <button onClick={() => onChangeStatus(s.id, "cancelada")}
              className="border-2 border-red-200 text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl text-xs font-bold">
              Cancel
            </button>
          </>
        )}
        {s.estado === "pausada" && (
          <button onClick={() => onChangeStatus(s.id, "activa")}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-xs font-bold">
            Reactivate
          </button>
        )}
        {s.estado === "cancelada" && (
          <button onClick={() => onChangeStatus(s.id, "activa")}
            className="border-2 border-green-300 text-green-700 hover:bg-green-50 px-4 py-2 rounded-xl text-xs font-bold">
            Re-enroll
          </button>
        )}
        {/* Delete subscriber */}
        <button onClick={() => setShowDeleteConfirm(true)}
          className="border-2 border-red-100 text-red-400 hover:bg-red-50 hover:border-red-300 hover:text-red-600 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors">
          <Trash2 size={12}/> Delete
        </button>
        {/* Expand deliveries */}
        <button onClick={toggleExpand}
          className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 font-semibold">
          {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          Delivery history
        </button>
      </div>

      {/* ── Delivery history ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Recent Deliveries</p>
          {loadingEntregas && <p className="text-xs text-gray-400">Loading…</p>}
          {!loadingEntregas && entregas.length === 0 && (
            <p className="text-xs text-gray-400 italic">No deliveries recorded yet.</p>
          )}
          <div className="space-y-2">
            {entregas.map(e => {
              const isFailed  = e.estado === "cobro_fallido";
              const isCharged = e.estado === "cobrado";
              const isReturn  = e.estado === "devuelto";
              const rowBorder = isFailed ? "border-red-200 opacity-80" : isReturn ? "border-orange-200 opacity-70" : "border-gray-100";
              const badgeCls  = isFailed  ? "bg-red-100 text-red-700"
                              : isCharged ? "bg-blue-100 text-blue-700"
                              : isReturn  ? "bg-orange-100 text-orange-700"
                                          : "bg-green-100 text-green-700";
              const RowIcon   = isFailed ? AlertCircle : isReturn ? RotateCcw : isCharged ? CreditCard : CheckCircle;
              const iconCls   = isFailed ? "text-red-400" : isReturn ? "text-orange-400" : isCharged ? "text-blue-500" : "text-green-500";
              return (
              <div key={e.id} className={`bg-white rounded-xl px-3 py-2 border flex items-center gap-2 ${rowBorder}`}>
                <RowIcon size={13} className={`${iconCls} flex-shrink-0`}/>
                <p className="text-sm font-medium text-gray-700 w-24 flex-shrink-0">{fmtDate(e.fecha)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${badgeCls}`}>
                  {e.estado}
                </span>
                {e.notas && <p className="text-xs text-gray-400 flex-1 truncate">{e.notas}</p>}
                {e.firma && (
                  <span className="text-xs text-violet-500 font-semibold flex-shrink-0 flex items-center gap-0.5">
                    <PenTool size={10}/> Signed
                  </span>
                )}
                <div className="flex gap-1 ml-auto flex-shrink-0">
                  {e.estado !== "devuelto" && (
                    <button onClick={() => returnEntrega(e.id)} title="Mark as returned"
                      className="p-1 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
                      <RotateCcw size={13}/>
                    </button>
                  )}
                  <button onClick={() => deleteEntrega(e.id)} title="Delete record"
                    className="p-1 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showDeliverModal && (
        <DeliveryConfirmModal
          sub={s}
          onConfirm={(data) => { setShowDeliverModal(false); onMarkDelivered(s.id, data); }}
          onCancel={() => setShowDeliverModal(false)}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-red-500"/>
            </div>
            <h3 className="font-bold text-gray-900 text-lg mb-1">Delete Subscriber?</h3>
            <p className="text-gray-500 text-sm mb-1">{s.clientes?.nombre}</p>
            <p className="text-gray-400 text-xs mb-5">This will permanently delete the subscription and all delivery history.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 border-2 border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => { setShowDeleteConfirm(false); onDelete(s.id); }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-bold">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Stripe Enroll Form ─── */
function EnrollForm({ form, setForm, planes, van, isAdmin, saving, onSave, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [stripeError, setStripeError] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [processingCard, setProcessingCard] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pickedClient, setPickedClient] = useState(null);
  const searchRef = useRef(null);

  // Server-side debounced search — name OR phone, full DB, no limit issues
  useEffect(() => {
    if (form.cliente_id) return;
    const term = clientSearch.trim();
    if (!term) { setSearchResults([]); setShowDropdown(false); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      let q = supabase
        .from("clientes")
        .select("id, nombre, telefono, email, direccion")
        .or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`)
        .order("nombre")
        .limit(25);
      if (!isAdmin && van?.id) q = q.eq("van_id", van.id);
      const { data } = await q;
      setSearchResults(data || []);
      setShowDropdown(true);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [clientSearch, form.cliente_id]);

  const selectedClient = pickedClient?.id === form.cliente_id ? pickedClient : null;
  const selectedPlan   = planes.find(p => p.id === form.plan_id) || null;

  function pickClient(c) {
    setPickedClient(c);
    setForm(f => ({ ...f, cliente_id: c.id }));
    setClientSearch(c.nombre);
    setShowDropdown(false);
  }

  function clearClient() {
    setPickedClient(null);
    setForm(f => ({ ...f, cliente_id: "" }));
    setClientSearch("");
    setSearchResults([]);
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
            <div className="relative">
              <input
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setForm(f=>({...f,cliente_id:""})); setPickedClient(null); }}
                onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                placeholder="Type name or phone to search…"
                className="w-full border-2 border-gray-200 focus:border-blue-400 rounded-xl px-4 py-3 text-sm outline-none transition-all pr-10"
              />
              {searching && (
                <RefreshCw size={14} className="animate-spin text-blue-400 absolute right-3 top-1/2 -translate-y-1/2"/>
              )}
            </div>
            {showDropdown && searchResults.length > 0 && !form.cliente_id && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                {searchResults.map(c => (
                  <button key={c.id} type="button"
                    onMouseDown={() => pickClient(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm flex justify-between items-center border-b border-gray-50 last:border-0">
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="text-xs text-gray-400">{c.telefono || ""}</span>
                  </button>
                ))}
              </div>
            )}
            {showDropdown && !searching && clientSearch.trim().length >= 1 && searchResults.length === 0 && !form.cliente_id && (
              <p className="text-xs text-gray-400 mt-1 px-1">No clients found for "{clientSearch}"</p>
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
                {selectedClient.direccion && <p className="text-xs text-gray-500">📍 {fmtAddr(selectedClient.direccion)}</p>}
              </div>
              <button type="button" onClick={clearClient}
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
                <option key={p.id} value={p.id}>{p.nombre} · {fmt(p.precio)} / {CICLO_LABEL[p.ciclo] || p.ciclo}</option>
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
                <p className="text-xs text-indigo-600 font-semibold">{fmt(selectedPlan.precio)} / {CICLO_LABEL[selectedPlan.ciclo] || selectedPlan.ciclo} · auto-charged</p>
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
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("activa");
  const [form, setForm] = useState({ cliente_id:"", plan_id:"", fecha_inicio:"", nota:"" });
  const [saving, setSaving] = useState(false);

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

    const [{ data: s, error: sErr }, { data: p }] = await Promise.all([
      subsQ,
      supabase.from("subscription_planes").select("id,nombre,precio,ciclo").eq("activo", true),
    ]);

    if (sErr) {
      setDbError(sErr.message.includes("does not exist")
        ? "Tables not created yet. Run the SQL migration in your Supabase dashboard first."
        : sErr.message);
    }
    setSubs(s || []);
    setPlanes(p || []);
    setLoading(false);
  }

  async function enroll(stripeInfo) {
    setSaving(true);
    const todayStr = new Date().toISOString().slice(0, 10);
    const selectedPlan = planes.find(p => p.id === form.plan_id);
    const startDate = form.fecha_inicio || todayStr;
    const proxima = addCycle(startDate, selectedPlan?.ciclo || "mensual");
    const { error } = await supabase.from("subscription_clientes").insert({
      cliente_id: form.cliente_id,
      plan_id: form.plan_id,
      van_id: van?.id || null,
      estado: "activa",
      fecha_inicio: startDate,
      proxima_entrega: proxima,
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

  async function markDelivered(id, { note, firma } = {}) {
    const sub = subs.find(s => s.id === id);
    if (!sub) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const nextDate = addCycle(sub.proxima_entrega, sub.subscription_planes?.ciclo);
    await supabase.from("subscription_clientes").update({
      ultima_entrega:  todayStr,
      proxima_entrega: nextDate,
    }).eq("id", id);
    const entregaPayload = {
      suscripcion_id: id,
      fecha: new Date().toISOString().slice(0,10),
      estado: "entregado",
      notas: note || null,
    };
    // Try with firma column; silently fall back if migration not yet run
    const { error: e1 } = await supabase.from("subscription_entregas").insert({ ...entregaPayload, firma: firma || null });
    if (e1) await supabase.from("subscription_entregas").insert(entregaPayload);
    loadAll();
  }

  async function deleteSubscriber(id) {
    await supabase.from("subscription_clientes").delete().eq("id", id);
    loadAll();
  }

  const filtered = subs.filter(s => filterStatus === "all" || s.estado === filterStatus);

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
            van={van}
            isAdmin={isAdmin}
            saving={saving}
            onSave={enroll}
            onCancel={()=>setShowForm(false)}
          />
        </Elements>
      )}

      {/* Subscribers list */}
      <div className="space-y-4">
        {filtered.length===0 && <p className="text-center py-12 text-gray-400">No subscribers with status "{filterStatus}"</p>}
        {filtered.map(s => <SubscriberCard key={s.id} s={s} onMarkDelivered={markDelivered} onChargeDone={loadAll} onChangeStatus={changeStatus} onDelete={deleteSubscriber} />)}
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
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    e.estado === "cobrado"       ? "bg-blue-100 text-blue-700"
                  : e.estado === "cobro_fallido" ? "bg-red-100 text-red-700"
                  : e.estado === "devuelto"      ? "bg-orange-100 text-orange-700"
                  : "bg-green-100 text-green-700"}`}>
                    {e.estado === "cobrado" ? "charged" : e.estado === "cobro_fallido" ? "charge failed" : e.estado}
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

/* ── Cash Payment Modal ── */
function CashPaymentModal({ sub, onClose, onPaid }) {
  const precio     = Number(sub.subscription_planes?.precio ?? 0);
  const [received, setReceived] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  const receivedNum = parseFloat(received) || 0;
  const change      = receivedNum - precio;

  async function handleConfirm() {
    if (receivedNum < precio) { setErr(`Must receive at least ${fmt(precio)}`); return; }
    setSaving(true);
    try {
      const today    = new Date().toISOString().slice(0, 10);
      const nextDate = addCycle(sub.proxima_entrega, sub.subscription_planes?.ciclo);
      await supabase.from("subscription_clientes").update({
        ultima_entrega:  today,
        proxima_entrega: nextDate,
      }).eq("id", sub.id);
      await supabase.from("subscription_entregas").insert({
        suscripcion_id: sub.id,
        fecha:          today,
        estado:         "cobrado_cash",
        notas:          `Cash received $${receivedNum.toFixed(2)} · change $${Math.max(0, change).toFixed(2)} · next ${nextDate}`,
      });
      onPaid();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-75 mb-0.5">Cash Collection</p>
          <p className="font-black text-xl leading-tight">{sub.clientes?.nombre}</p>
          <p className="text-sm opacity-80 mt-0.5">{sub.subscription_planes?.nombre}</p>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Amount due */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3 flex items-center justify-between">
            <span className="text-amber-800 font-semibold text-sm">Amount due</span>
            <span className="text-amber-900 font-black text-2xl">{fmt(precio)}</span>
          </div>

          {/* Amount received */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Amount received ($)</label>
            <input
              type="number"
              min={precio}
              step="0.01"
              value={received}
              onChange={e => { setReceived(e.target.value); setErr(""); }}
              placeholder={precio.toFixed(2)}
              className="w-full border-2 border-gray-200 focus:border-amber-400 rounded-xl px-4 py-3 text-2xl font-bold text-gray-900 outline-none transition-colors"
              autoFocus
            />
          </div>

          {/* Change */}
          {receivedNum > 0 && (
            <div className={`rounded-xl px-4 py-2.5 flex items-center justify-between ${change >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <span className={`text-sm font-semibold ${change >= 0 ? "text-green-700" : "text-red-700"}`}>
                {change >= 0 ? "Change to return" : "Still owed"}
              </span>
              <span className={`font-black text-lg ${change >= 0 ? "text-green-700" : "text-red-700"}`}>
                {fmt(Math.abs(change))}
              </span>
            </div>
          )}

          {err && <p className="text-red-500 text-xs font-semibold">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm">
              Cancel
            </button>
            <button onClick={handleConfirm}
              disabled={saving || receivedNum < precio}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm disabled:opacity-50 transition-all">
              {saving ? "Saving…" : "Confirm Payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 4 — RUTA (Delivery Dashboard)
═══════════════════════════════════════════════ */

function DeliveryRouteCard({ d, onDeliver, onChargeDone, todayCharge }) {
  const [open,          setOpen]          = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = d.proxima_entrega
    ? Math.ceil((new Date(d.proxima_entrega) - new Date(today)) / 86400000)
    : null;
  const isOverdue  = daysUntil !== null && daysUntil < 0;
  const isToday    = daysUntil === 0;
  const hasCard    = !!(d.stripe_customer_id && d.stripe_payment_method_id);
  const productos  = d.subscription_planes?.productos || [];
  const chargeOk   = todayCharge?.estado === "cobrado";
  const chargeFail = todayCharge?.estado === "cobro_fallido";
  const cashPaid   = todayCharge?.estado === "cobrado_cash";

  const leftBorder = isOverdue ? "border-l-red-500"   : isToday ? "border-l-green-500" : daysUntil <= 7 ? "border-l-blue-400" : "border-l-gray-200";
  const dateBg     = isOverdue ? "bg-red-500"          : isToday ? "bg-green-500"        : "bg-blue-500";
  const dayLabel   = isOverdue ? `${Math.abs(daysUntil)}d late` : isToday ? "Today" : daysUntil !== null ? `in ${daysUntil}d` : "—";
  const dayColor   = isOverdue ? "text-red-500"        : isToday ? "text-green-600"      : "text-blue-500";

  const addrStr = fmtAddr(d.clientes?.direccion);
  const mapsUrl = addrStr
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrStr)}`
    : null;

  return (
    <div className={`bg-white rounded-2xl border-l-4 ${leftBorder} border border-gray-100 shadow-sm overflow-hidden`}>

      {/* ── Collapsed row ── */}
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 py-3 flex items-center gap-3">
        <div className={`${dateBg} rounded-xl px-2.5 py-1.5 text-center flex-shrink-0 min-w-[52px]`}>
          <p className="text-white/80 text-[10px] font-bold leading-none uppercase">
            {d.proxima_entrega ? new Date(d.proxima_entrega + "T00:00:00").toLocaleDateString("en-US", { month: "short" }) : "—"}
          </p>
          <p className="text-white text-xl font-black leading-none">
            {d.proxima_entrega ? d.proxima_entrega.slice(8) : ""}
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-bold text-gray-900 text-sm truncate">{d.clientes?.nombre || "—"}</p>
            {(chargeOk || cashPaid) && (
              <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-0.5">
                <CheckCircle size={9}/> Paid{cashPaid ? " (Cash)" : ""}
              </span>
            )}
            {chargeFail && (
              <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-0.5">
                <AlertCircle size={9}/> Failed
              </span>
            )}
            {!todayCharge && (hasCard
              ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">Card</span>
              : <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">Cash</span>
            )}
          </div>
          {addrStr
            ? <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5"><MapPin size={10}/> {addrStr}</p>
            : <p className="text-xs text-gray-300 italic mt-0.5">No address on file</p>
          }
        </div>

        <div className="flex-shrink-0 text-right">
          <p className={`text-xs font-black ${dayColor}`}>{dayLabel}</p>
          {open ? <ChevronUp size={14} className="text-gray-300 mt-1 ml-auto"/> : <ChevronDown size={14} className="text-gray-300 mt-1 ml-auto"/>}
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">

          {/* Quick contact actions */}
          <div className="flex flex-wrap gap-2">
            {d.clientes?.telefono && (
              <a href={`tel:${d.clientes.telefono}`}
                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors">
                <Phone size={13}/> {d.clientes.telefono}
              </a>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors">
                <Navigation2 size={13}/> Navigate
              </a>
            )}
            {d.clientes?.email && (
              <span className="flex items-center gap-1 text-xs text-gray-400 py-2">
                ✉️ {d.clientes.email}
              </span>
            )}
          </div>

          {/* Full address block */}
          {addrStr && (
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/>
              <p className="text-sm text-gray-700 leading-snug">{addrStr}</p>
            </div>
          )}

          {/* Plan + box contents */}
          <div className="bg-indigo-50 rounded-xl px-3 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                <Package size={12}/> {d.subscription_planes?.nombre || "—"}
              </p>
              <p className="font-bold text-indigo-700">{fmt(d.subscription_planes?.precio)}</p>
            </div>
            {productos.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {productos.map((p, i) => (
                  <span key={i} className="bg-white text-indigo-600 text-xs font-medium px-2 py-0.5 rounded-full border border-indigo-100">
                    {p.nombre}{p.nota ? ` · ${p.nota}` : ""}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-indigo-400 italic">No product list for this plan</p>
            )}
          </div>

          {/* Payment method */}
          {hasCard ? (
            <div className="rounded-xl px-3 py-2.5 flex items-center justify-between bg-slate-800">
              <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-slate-300"/>
                <div>
                  <p className="text-slate-400 text-[10px]">Card on file</p>
                  <p className="text-white font-bold text-sm capitalize">{d.card_brand || "Card"} ···· {d.card_last4}</p>
                </div>
              </div>
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-semibold">Auto-charge</span>
            </div>
          ) : cashPaid ? (
            <div className="bg-green-50 border-2 border-green-400 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle size={18} className="text-white"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-green-800 text-sm">Cash collected ✓</p>
                <p className="text-xs text-green-600 truncate">{todayCharge.notas}</p>
              </div>
              <span className="bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0">
                Ready to deliver
              </span>
            </div>
          ) : (
            <button
              onClick={() => setShowCashModal(true)}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-all">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <DollarSign size={18} className="text-white"/>
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-sm">Collect Cash Payment</p>
                <p className="text-amber-100 text-xs">Amount due: {fmt(d.subscription_planes?.precio)}</p>
              </div>
              <ChevronRight size={16} className="text-white/70 flex-shrink-0"/>
            </button>
          )}

          {/* Special delivery note */}
          {d.nota && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <span className="text-yellow-500 flex-shrink-0">📝</span>
              <p className="text-xs text-yellow-800 leading-snug">{d.nota}</p>
            </div>
          )}

          {/* Last delivery info */}
          {d.ultima_entrega && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <CheckCircle size={11}/> Last delivered: {fmtDate(d.ultima_entrega)}
            </p>
          )}

          {/* ── Today's charge status banner ── */}
          {chargeOk && (
            <div className="bg-green-50 border-2 border-green-400 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle size={18} className="text-white"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-green-800 text-sm">Payment charged ✓</p>
                <p className="text-xs text-green-600 truncate">{todayCharge.notas}</p>
              </div>
              <span className="bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0">
                Ready to deliver
              </span>
            </div>
          )}
          {chargeFail && (
            <div className="bg-red-50 border-2 border-red-400 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle size={18} className="text-white"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-red-800 text-sm">Payment failed</p>
                <p className="text-xs text-red-500 truncate">{todayCharge.notas}</p>
              </div>
              <span className="bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0">
                Collect cash
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button onClick={() => onDeliver(d)}
              className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all">
              <Truck size={14}/> Mark Delivered
            </button>
            {hasCard && <ChargeButton sub={d} onDone={onChargeDone}/>}
          </div>
        </div>
      )}

      {/* Cash payment modal */}
      {showCashModal && (
        <CashPaymentModal
          sub={d}
          onClose={() => setShowCashModal(false)}
          onPaid={() => { setShowCashModal(false); onChargeDone(); }}
        />
      )}
    </div>
  );
}

/* ── Group section header ── */
function RouteSection({ title, count, colorDot, colorBadge, children }) {
  if (count === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${colorDot}`}/>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ml-1 ${colorBadge}`}>{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RutaTab({ van, usuario }) {
  const isAdmin = usuario?.rol === "admin";
  const [deliveries, setDeliveries] = useState([]);
  const [chargeMap, setChargeMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [deliverTarget, setDeliverTarget] = useState(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const weekEndStr = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();

  useEffect(() => { load(); }, [van?.id]);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("subscription_clientes")
      .select("*, subscription_planes(nombre,precio,ciclo,productos), clientes(nombre,telefono,email,direccion)")
      .eq("estado", "activa")
      .order("proxima_entrega", { ascending: true });
    if (!isAdmin && van?.id) q = q.eq("van_id", van.id);

    // Also fetch today's charge results to show on each card
    const chargesQ = supabase
      .from("subscription_entregas")
      .select("suscripcion_id, estado, notas")
      .eq("fecha", todayStr)
      .in("estado", ["cobrado", "cobro_fallido", "cobrado_cash"]);

    const [{ data }, { data: charges }] = await Promise.all([q, chargesQ]);
    setDeliveries(data || []);
    const map = {};
    for (const c of (charges || [])) map[c.suscripcion_id] = c;
    setChargeMap(map);
    setLoading(false);
  }

  async function handleMarkDelivered(sub, { note, firma } = {}) {
    const nextDate = addCycle(sub.proxima_entrega, sub.subscription_planes?.ciclo);
    await supabase.from("subscription_clientes").update({
      ultima_entrega:  todayStr,
      proxima_entrega: nextDate,
    }).eq("id", sub.id);
    const payload = { suscripcion_id: sub.id, fecha: todayStr, estado: "entregado", notas: note || null };
    const { error: e1 } = await supabase.from("subscription_entregas").insert({ ...payload, firma: firma || null });
    if (e1) await supabase.from("subscription_entregas").insert(payload);
    setDeliverTarget(null);
    load();
  }

  const overdue  = deliveries.filter(d => d.proxima_entrega && d.proxima_entrega < todayStr);
  const today    = deliveries.filter(d => d.proxima_entrega === todayStr);
  const thisWeek = deliveries.filter(d => d.proxima_entrega && d.proxima_entrega > todayStr && d.proxima_entrega <= weekEndStr);
  const later    = deliveries.filter(d => !d.proxima_entrega || d.proxima_entrega > weekEndStr);

  const cashDueNow  = [...overdue, ...today]
    .filter(d => !d.stripe_payment_method_id)
    .reduce((t, d) => t + Number(d.subscription_planes?.precio || 0), 0);
  const chargedToday = Object.values(chargeMap).filter(c => c.estado === "cobrado").length;
  const failedToday  = Object.values(chargeMap).filter(c => c.estado === "cobro_fallido").length;

  if (loading) return <div className="py-16 text-center text-gray-400">Loading delivery route…</div>;

  return (
    <div>
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-red-600">{overdue.length}</p>
          <p className="text-xs text-red-500 font-semibold mt-0.5">Overdue</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-green-600">{today.length}</p>
          <p className="text-xs text-green-500 font-semibold mt-0.5">Today</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-blue-600">{thisWeek.length}</p>
          <p className="text-xs text-blue-500 font-semibold mt-0.5">This Week</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-amber-700">{fmt(cashDueNow)}</p>
          <p className="text-xs text-amber-600 font-semibold mt-0.5">Cash to Collect</p>
        </div>
      </div>

      {/* Today's payment status banner */}
      {(chargedToday > 0 || failedToday > 0) && (
        <div className="flex gap-3 mb-5">
          {chargedToday > 0 && (
            <div className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <CreditCard size={18} className="text-white"/>
              </div>
              <div>
                <p className="text-white font-black text-xl leading-none">{chargedToday}</p>
                <p className="text-green-100 text-xs font-semibold">Charged today — ready to deliver</p>
              </div>
            </div>
          )}
          {failedToday > 0 && (
            <div className="flex-1 bg-gradient-to-r from-red-600 to-rose-600 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle size={18} className="text-white"/>
              </div>
              <div>
                <p className="text-white font-black text-xl leading-none">{failedToday}</p>
                <p className="text-red-100 text-xs font-semibold">Payment failed — collect cash</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-400">{deliveries.length} active subscription{deliveries.length !== 1 ? "s" : ""}</p>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-600 font-medium transition-colors">
          <RefreshCw size={13}/> Refresh
        </button>
      </div>

      {deliveries.length === 0 && (
        <p className="text-center py-12 text-gray-400">No active subscriptions.</p>
      )}

      <RouteSection title="Overdue" count={overdue.length} colorDot="bg-red-500" colorBadge="bg-red-100 text-red-700">
        {overdue.map(d => <DeliveryRouteCard key={d.id} d={d} onDeliver={setDeliverTarget} onChargeDone={load} todayCharge={chargeMap[d.id]}/>)}
      </RouteSection>

      <RouteSection title="Today" count={today.length} colorDot="bg-green-500" colorBadge="bg-green-100 text-green-700">
        {today.map(d => <DeliveryRouteCard key={d.id} d={d} onDeliver={setDeliverTarget} onChargeDone={load} todayCharge={chargeMap[d.id]}/>)}
      </RouteSection>

      <RouteSection title="This Week" count={thisWeek.length} colorDot="bg-blue-500" colorBadge="bg-blue-100 text-blue-700">
        {thisWeek.map(d => <DeliveryRouteCard key={d.id} d={d} onDeliver={setDeliverTarget} onChargeDone={load} todayCharge={chargeMap[d.id]}/>)}
      </RouteSection>

      <RouteSection title="Later" count={later.length} colorDot="bg-gray-300" colorBadge="bg-gray-100 text-gray-500">
        {later.map(d => <DeliveryRouteCard key={d.id} d={d} onDeliver={setDeliverTarget} onChargeDone={load} todayCharge={chargeMap[d.id]}/>)}
      </RouteSection>

      {deliverTarget && (
        <DeliveryConfirmModal
          sub={deliverTarget}
          onConfirm={(data) => handleMarkDelivered(deliverTarget, data)}
          onCancel={() => setDeliverTarget(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
const TABS = [
  { id: "ruta",          label: "Route",        icon: Navigation2 },
  { id: "suscriptores",  label: "Subscribers",  icon: Users },
  { id: "entregas",      label: "Deliveries",   icon: Truck },
  { id: "planes",        label: "Box Plans",    icon: Package },
];

export default function Suscripciones() {
  const { usuario } = useUsuario();
  const { van } = useVan();
  const [activeTab, setActiveTab] = useState("ruta");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Navigation2 size={22} className="text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
            <p className="text-sm text-gray-500">Delivery route & recurring clients</p>
          </div>
        </div>

        {!van?.id && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800 text-sm mb-6">
            ⚠️ Select a VAN first to manage subscriptions.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 mb-6 shadow-sm overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${activeTab === t.id ? "bg-blue-600 text-white shadow" : "text-gray-500 hover:text-gray-800"}`}>
                <Icon size={14}/> {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="bg-white rounded-3xl shadow-xl p-5">
          {activeTab === "ruta"         && van?.id  && <RutaTab         van={van} usuario={usuario}/>}
          {activeTab === "planes"                   && <PlanesTab       van={van} usuario={usuario}/>}
          {activeTab === "suscriptores" && van?.id  && <SuscriptoresTab van={van} usuario={usuario}/>}
          {activeTab === "entregas"     && van?.id  && <EntregasTab     van={van}/>}
          {!van?.id && activeTab !== "planes" && (
            <p className="py-12 text-center text-gray-400">Select a VAN to view this tab.</p>
          )}
        </div>
      </div>
    </div>
  );
}
