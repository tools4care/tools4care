// src/Suplidores.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { useToast } from "./hooks/useToast";
import dayjs from "dayjs";

/* ---------- helpers ---------- */
function fmt$(n) {
  return `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  return dayjs(iso).format("MMM DD, YYYY");
}
function todayISO() {
  return dayjs().format("YYYY-MM-DD");
}

function maskPhone(raw) {
  const d = (raw || "").replace(/\D/g, "").slice(0, 15);
  if (d.length <= 3) return { view: `(${d}`, db: d };
  if (d.length <= 6) return { view: `(${d.slice(0, 3)}) ${d.slice(3)}`, db: d };
  return { view: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, db: d };
}

function parsePOFromNotes(notas) {
  const txt = (notas || "").trim();
  if (!txt) return { po: "", notes: "" };
  const m = /^PO:\s*([^—\-]+)\s*(?:[—-]\s*(.*))?$/i.exec(txt);
  if (m) return { po: (m[1] || "").trim(), notes: (m[2] || "").trim() };
  return { po: "", notes: txt };
}

function orderStatus(pendiente, total) {
  const t = Number(total || 0);
  const p = Number(pendiente || 0);
  if (t <= 0) return "pagada";
  if (p <= 0) return "pagada";
  if (p < t) return "parcial";
  return "abierta";
}

const STATUS_CFG = {
  abierta: { label: "Open",    bg: "bg-amber-100",  text: "text-amber-800",  ring: "ring-amber-300" },
  parcial: { label: "Partial", bg: "bg-blue-100",   text: "text-blue-800",   ring: "ring-blue-300"  },
  pagada:  { label: "Paid",    bg: "bg-green-100",  text: "text-green-800",  ring: "ring-green-300" },
};

const PAYMENT_METHODS = ["Cash", "Zelle", "Transfer", "Check", "Card", "Other"];

function StatusBadge({ pendiente, total }) {
  const s = orderStatus(pendiente, total);
  const cfg = STATUS_CFG[s] || STATUS_CFG.abierta;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      {cfg.label}
    </span>
  );
}

function MoneyInput({ value, onChange, ...rest }) {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      className="border rounded-lg p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      {...rest}
    />
  );
}

/* ---------- Modal base ---------- */
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">
      <div className={`bg-white w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl shadow-2xl p-5 relative`}>
        <button
          className="absolute right-4 top-3 text-2xl text-gray-400 hover:text-black leading-none"
          onClick={onClose}
        >×</button>
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ---------- Formulario edición de suplidor (reutilizable) ---------- */
function SupplierForm({ f, setF, onSave, saving, onCancel, saveLabel = "Save" }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name *</label>
          <input
            className="border rounded-lg p-2 w-full mt-1 uppercase focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Supplier name"
            value={f.nombre}
            onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))}
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</label>
          <input
            className="border rounded-lg p-2 w-full mt-1 uppercase focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Contact person"
            value={f.contacto}
            onChange={(e) => setF((p) => ({ ...p, contacto: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</label>
          <input
            className="border rounded-lg p-2 w-full mt-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="(000) 000-0000"
            value={f.telefonoView}
            onChange={(e) => {
              const { view, db } = maskPhone(e.target.value);
              setF((p) => ({ ...p, telefonoView: view, telefonoDb: db }));
            }}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
          <input
            className="border rounded-lg p-2 w-full mt-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="email@supplier.com"
            value={f.email}
            onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Website</label>
          <input
            className="border rounded-lg p-2 w-full mt-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="www.supplier.com"
            value={f.website}
            onChange={(e) => setF((p) => ({ ...p, website: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Address</label>
          <input
            className="border rounded-lg p-2 w-full mt-1 uppercase focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Street, City, State ZIP"
            value={f.direccion}
            onChange={(e) => setF((p) => ({ ...p, direccion: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment terms</label>
          <select
            className="border rounded-lg p-2 w-full mt-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={f.terminos}
            onChange={(e) => setF((p) => ({ ...p, terminos: e.target.value }))}
          >
            <option value="">— No terms —</option>
            <option value="COD">COD (Cash on Delivery)</option>
            <option value="Net-7">Net 7 days</option>
            <option value="Net-15">Net 15 days</option>
            <option value="Net-30">Net 30 days</option>
            <option value="Net-45">Net 45 days</option>
            <option value="Net-60">Net 60 days</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
          <input
            className="border rounded-lg p-2 w-full mt-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Internal notes"
            value={f.notes}
            onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {onCancel && (
          <button className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 font-medium" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="px-5 py-2 rounded-lg bg-green-700 text-white font-semibold disabled:opacity-50 hover:bg-green-800"
          disabled={saving || !(f.nombre || "").trim()}
          onClick={onSave}
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </>
  );
}

function emptySupplierForm() {
  return { nombre: "", contacto: "", telefonoView: "", telefonoDb: "", direccion: "", email: "", website: "", terminos: "", notes: "" };
}
function supplierToForm(s) {
  if (!s) return emptySupplierForm();
  const { view, db } = maskPhone(s.telefono || "");
  const { notes } = parsePOFromNotes(s.notas);
  return {
    nombre: s.nombre || "",
    contacto: s.contacto || "",
    telefonoView: view,
    telefonoDb: db,
    direccion: s.direccion || "",
    email: s.email || "",
    website: s.website || "",
    terminos: s.terminos || "",
    notes,
  };
}
function formToPayload(f) {
  const notas = (f.notes || "").trim() || null;
  return {
    nombre: (f.nombre || "").trim(),
    contacto: (f.contacto || "").trim() || null,
    telefono: f.telefonoDb || null,
    direccion: (f.direccion || "").trim() || null,
    email: (f.email || "").trim() || null,
    notas,
  };
}

/* ---------- Modal: Edit supplier ---------- */
function EditSupplierModal({ open, onClose, supplier, onSaved }) {
  const { toast } = useToast();
  const [f, setF] = useState(emptySupplierForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && supplier) setF(supplierToForm(supplier));
  }, [open, supplier]);

  async function save() {
    if (!supplier?.id) return;
    setSaving(true);
    const payload = formToPayload(f);
    const { data, error } = await supabase
      .from("suplidores")
      .update(payload)
      .eq("id", supplier.id)
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onSaved?.(data);
    onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Supplier" wide>
      <SupplierForm f={f} setF={setF} onSave={save} saving={saving} onCancel={onClose} saveLabel="Save changes" />
    </Modal>
  );
}

/* ---------- Inline: Create supplier ---------- */
function CrearSuplidorInline({ onCreated, onCancel }) {
  const { toast } = useToast();
  const [f, setF] = useState(emptySupplierForm());
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const payload = formToPayload(f);
    const { data, error } = await supabase.from("suplidores").insert([payload]).select().maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onCreated?.(data);
  }

  return (
    <div className="border-2 border-green-200 rounded-2xl p-4 bg-green-50">
      <h3 className="font-bold text-green-900 mb-3">New Supplier</h3>
      <SupplierForm f={f} setF={setF} onSave={save} saving={saving} onCancel={onCancel} saveLabel="Create supplier" />
    </div>
  );
}

/* ---------- Modal: Nueva orden de compra ---------- */
function NuevaOrdenModal({ open, onClose, suplidorId, onCreated }) {
  const { toast } = useToast();
  const [fecha, setFecha] = useState(todayISO());
  const [fechaVenc, setFechaVenc] = useState("");
  const [total, setTotal] = useState("");
  const [po, setPO] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFecha(todayISO());
      setFechaVenc("");
      setTotal("");
      setPO("");
      setNotas("");
    }
  }, [open]);

  async function save() {
    if (!total || Number(total) <= 0) { toast.error("Enter a valid total."); return; }
    setSaving(true);
    const composed = [po ? `PO: ${po.trim()}` : "", notas.trim()].filter(Boolean).join(" — ");
    const base = { suplidor_id: suplidorId, fecha, total: Number(total), estado: "abierta" };
    const withExtras = {
      ...base,
      ...(composed ? { notas: composed } : {}),
      ...(fechaVenc ? { fecha_vencimiento: fechaVenc } : {}),
    };

    let res = await supabase.from("ordenes_compra").insert([withExtras]).select().maybeSingle();
    if (res.error) {
      // fallback: try without fecha_vencimiento
      const msg = (res.error.message || "").toLowerCase();
      if (msg.includes("column") && msg.includes("fecha_vencimiento")) {
        const { fecha_vencimiento, ...withoutVenc } = withExtras;
        res = await supabase.from("ordenes_compra").insert([withoutVenc]).select().maybeSingle();
      }
    }
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    onCreated?.(res.data);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="New Purchase Order">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order date</label>
          <input type="date" className="border rounded-lg p-2 w-full mt-1" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Due date (optional)</label>
          <input type="date" className="border rounded-lg p-2 w-full mt-1" value={fechaVenc} onChange={(e) => setFechaVenc(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total *</label>
          <MoneyInput value={total} onChange={setTotal} placeholder="0.00" className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order # / PO</label>
          <input className="border rounded-lg p-2 w-full mt-1 uppercase" placeholder="e.g. PO-12345" value={po} onChange={(e) => setPO(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
          <textarea className="border rounded-lg p-2 w-full mt-1 min-h-[60px]" placeholder="Optional details" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={onClose}>Cancel</button>
        <button className="px-5 py-2 rounded-lg bg-blue-700 text-white font-semibold disabled:opacity-50 hover:bg-blue-800" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Create order"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Modal: Nuevo pago / abono ---------- */
function NuevoAbonoModal({ open, onClose, suplidorId, ordenes, preOrdenId, onCreated }) {
  const { toast } = useToast();
  const [fecha, setFecha] = useState(todayISO());
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Cash");
  const [notas, setNotas] = useState("");
  const [ordenId, setOrdenId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFecha(todayISO());
      setMonto("");
      setMetodo("Cash");
      setNotas("");
      setOrdenId(preOrdenId || "");
    }
  }, [open, preOrdenId]);

  // auto-fill with the order's pending amount
  useEffect(() => {
    if (!ordenId) return;
    const o = (ordenes || []).find((x) => String(x.id) === String(ordenId));
    if (o && o.pendiente > 0) setMonto(Number(o.pendiente).toFixed(2));
  }, [ordenId, ordenes]);

  async function save() {
    if (!monto || Number(monto) <= 0) { toast.error("Enter a valid amount."); return; }
    setSaving(true);
    const payload = {
      suplidor_id: suplidorId,
      orden_id: ordenId || null,
      fecha,
      monto: Number(monto),
      metodo: metodo || null,
      notas: notas.trim() || null,
    };
    const { data, error } = await supabase.from("abonos_compra").insert([payload]).select().maybeSingle();
    if (error) { toast.error(error.message); setSaving(false); return; }

    // auto-update order status if fully paid
    if (ordenId) {
      const o = (ordenes || []).find((x) => String(x.id) === String(ordenId));
      if (o) {
        const newPendiente = (o.pendiente || 0) - Number(monto);
        if (newPendiente <= 0.005) {
          await supabase.from("ordenes_compra").update({ estado: "pagada" }).eq("id", ordenId);
        } else if (o.estado === "abierta") {
          await supabase.from("ordenes_compra").update({ estado: "parcial" }).eq("id", ordenId);
        }
      }
    }

    setSaving(false);
    onCreated?.(data);
    onClose();
  }

  const abiertasConBalance = useMemo(
    () => (ordenes || []).filter((o) => (o.pendiente || 0) > 0.005),
    [ordenes]
  );

  return (
    <Modal open={open} onClose={onClose} title="Register Payment">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
          <input type="date" className="border rounded-lg p-2 w-full mt-1" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount *</label>
          <MoneyInput value={monto} onChange={setMonto} placeholder="0.00" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Method</label>
          <select className="border rounded-lg p-2 w-full mt-1" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Apply to order (optional)</label>
          <select className="border rounded-lg p-2 w-full mt-1" value={ordenId} onChange={(e) => setOrdenId(e.target.value)}>
            <option value="">— No specific order —</option>
            {abiertasConBalance.map((o) => {
              const { po } = parsePOFromNotes(o.notas);
              return (
                <option key={o.id} value={o.id}>
                  {fmtDate(o.fecha)}{po ? ` · ${po}` : ""} · Due {fmt$(o.pendiente)}
                </option>
              );
            })}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
          <textarea className="border rounded-lg p-2 w-full mt-1 min-h-[60px]" placeholder="Reference, check #, etc." value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={onClose}>Cancel</button>
        <button className="px-5 py-2 rounded-lg bg-green-700 text-white font-semibold disabled:opacity-50 hover:bg-green-800" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Register payment"}
        </button>
      </div>
    </Modal>
  );
}

/* ================================================================
   DETALLE DE SUPLIDOR
   ================================================================ */
function DetalleSuplidor({ suplidor, onBack, onSuplidorUpdated }) {
  const { toast } = useToast();
  const [sup, setSup] = useState(suplidor);
  useEffect(() => setSup(suplidor), [suplidor]);

  const [tab, setTab] = useState("resumen");
  const [ordenes, setOrdenes] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showEdit, setShowEdit] = useState(false);
  const [showNuevaOrden, setShowNuevaOrden] = useState(false);
  const [showNuevoAbono, setShowNuevoAbono] = useState(false);
  const [preOrdenId, setPreOrdenId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: oc }, { data: ab }] = await Promise.all([
      supabase.from("ordenes_compra").select("*").eq("suplidor_id", sup.id).order("fecha", { ascending: false }).order("id", { ascending: false }),
      supabase.from("abonos_compra").select("*").eq("suplidor_id", sup.id).order("fecha", { ascending: false }).order("id", { ascending: false }),
    ]);
    setOrdenes(oc || []);
    setAbonos(ab || []);
    setLoading(false);
  }, [sup.id]);

  useEffect(() => { load(); }, [load]);

  const abonosPorOrden = useMemo(() => {
    const map = new Map();
    (abonos || []).forEach((a) => {
      if (!a.orden_id) return;
      map.set(a.orden_id, (map.get(a.orden_id) || 0) + Number(a.monto || 0));
    });
    return map;
  }, [abonos]);

  const ordenesEnriquecidas = useMemo(() =>
    (ordenes || []).map((o) => {
      const pagado = abonosPorOrden.get(o.id) || 0;
      const pendiente = Math.max(0, Number(o.total || 0) - pagado);
      return { ...o, pagado, pendiente };
    }),
    [ordenes, abonosPorOrden]
  );

  const totalOrdenes = useMemo(() => (ordenes || []).reduce((t, o) => t + Number(o.total || 0), 0), [ordenes]);
  const totalAbonos = useMemo(() => (abonos || []).reduce((t, a) => t + Number(a.monto || 0), 0), [abonos]);
  const balance = totalOrdenes - totalAbonos;

  const ordenesAbiertas = ordenesEnriquecidas.filter((o) => o.pendiente > 0.005);
  const ordenesPagadas = ordenesEnriquecidas.filter((o) => o.pendiente <= 0.005);

  function openPago(ordenId) {
    setPreOrdenId(ordenId || "");
    setShowNuevoAbono(true);
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <button className="text-sm text-blue-700 hover:underline mb-1 flex items-center gap-1" onClick={onBack}>
            ← Suppliers
          </button>
          <h2 className="text-2xl font-bold">{sup.nombre}</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-1">
            {sup.contacto && <span>👤 {sup.contacto}</span>}
            {sup.telefono && <a href={`tel:${sup.telefono}`} className="hover:text-blue-700">📞 {sup.telefono}</a>}
            {sup.email && <a href={`mailto:${sup.email}`} className="hover:text-blue-700">✉️ {sup.email}</a>}
            {sup.direccion && <span>📍 {sup.direccion}</span>}
            {sup.terminos && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{sup.terminos}</span>}
          </div>
          {sup.notas && <p className="text-xs text-gray-500 mt-1 italic">{parsePOFromNotes(sup.notas).notes}</p>}
        </div>

        {/* Balance card */}
        <div className="flex-shrink-0 bg-white border-2 rounded-2xl p-4 text-right min-w-[180px] shadow-sm">
          <div className="text-xs uppercase text-gray-500 font-semibold mb-1">Balance owed</div>
          <div className={`text-3xl font-bold ${balance > 0.005 ? "text-amber-700" : "text-emerald-600"}`}>
            {fmt$(balance)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {fmt$(totalOrdenes)} orders · {fmt$(totalAbonos)} paid
          </div>
          <button className="mt-2 text-xs px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 font-medium" onClick={() => setShowEdit(true)}>
            Edit supplier
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mb-4">
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
          onClick={() => setShowNuevaOrden(true)}
        >
          + New order
        </button>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-40"
          disabled={balance <= 0.005}
          onClick={() => openPago("")}
        >
          Register payment
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-4">
        {[
          { key: "resumen", label: "Summary" },
          { key: "ordenes", label: `Orders (${ordenes.length})` },
          { key: "abonos", label: `Payments (${abonos.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === key ? "border-blue-700 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-blue-700 py-8"><span className="animate-spin">⟳</span> Loading…</div>
      ) : tab === "resumen" ? (
        <ResumenTab
          ordenesAbiertas={ordenesAbiertas}
          ordenesPagadas={ordenesPagadas}
          abonos={abonos}
          onNewOrder={() => setShowNuevaOrden(true)}
          onNewPayment={openPago}
          balance={balance}
        />
      ) : tab === "ordenes" ? (
        <OrdenesTab
          ordenes={ordenesEnriquecidas}
          onNewOrder={() => setShowNuevaOrden(true)}
          onPay={openPago}
        />
      ) : (
        <AbonosTab
          abonos={abonos}
          ordenes={ordenes}
          onNewPayment={() => openPago("")}
        />
      )}

      <EditSupplierModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        supplier={sup}
        onSaved={(upd) => { setSup(upd); onSuplidorUpdated?.(upd); }}
      />
      <NuevaOrdenModal
        open={showNuevaOrden}
        onClose={() => setShowNuevaOrden(false)}
        suplidorId={sup.id}
        onCreated={() => load()}
      />
      <NuevoAbonoModal
        open={showNuevoAbono}
        onClose={() => setShowNuevoAbono(false)}
        suplidorId={sup.id}
        ordenes={ordenesEnriquecidas}
        preOrdenId={preOrdenId}
        onCreated={() => load()}
      />
    </div>
  );
}

function ResumenTab({ ordenesAbiertas, ordenesPagadas, abonos, onNewOrder, onNewPayment, balance }) {
  const recentAbonos = (abonos || []).slice(0, 8);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Open orders */}
      <div className="border rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="px-4 py-3 bg-amber-50 border-b flex items-center justify-between">
          <span className="font-bold text-amber-900">Open orders ({ordenesAbiertas.length})</span>
          <button className="text-sm text-blue-700 hover:underline font-medium" onClick={onNewOrder}>+ New</button>
        </div>
        {ordenesAbiertas.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No open orders</div>
        ) : (
          <div className="divide-y max-h-72 overflow-auto">
            {ordenesAbiertas.map((o) => {
              const { po } = parsePOFromNotes(o.notas);
              const isOverdue = o.fecha_vencimiento && dayjs(o.fecha_vencimiento).isBefore(dayjs(), "day");
              return (
                <div key={o.id} className="px-4 py-3 flex items-center justify-between gap-2 hover:bg-amber-50/50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{fmtDate(o.fecha)}</span>
                      {po && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{po}</span>}
                      {isOverdue && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold">OVERDUE</span>}
                    </div>
                    {o.fecha_vencimiento && (
                      <div className="text-xs text-gray-400">Due {fmtDate(o.fecha_vencimiento)}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-0.5">
                      Paid {fmt$(o.pagado)} of {fmt$(o.total)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <StatusBadge pendiente={o.pendiente} total={o.total} />
                      <div className="text-sm font-bold text-amber-700 mt-1">{fmt$(o.pendiente)}</div>
                    </div>
                    <button
                      className="text-xs px-2 py-1 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 font-semibold"
                      onClick={() => onNewPayment(o.id)}
                    >
                      Pay
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent payments */}
      <div className="border rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="px-4 py-3 bg-green-50 border-b flex items-center justify-between">
          <span className="font-bold text-green-900">Recent payments</span>
          <button
            className="text-sm text-blue-700 hover:underline font-medium disabled:opacity-40"
            disabled={balance <= 0.005}
            onClick={() => onNewPayment("")}
          >
            + New
          </button>
        </div>
        {recentAbonos.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No payments recorded</div>
        ) : (
          <div className="divide-y max-h-72 overflow-auto">
            {recentAbonos.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{fmtDate(a.fecha)}</div>
                  <div className="text-xs text-gray-400">{a.metodo || "—"}{a.notas ? ` · ${a.notas}` : ""}</div>
                </div>
                <div className="text-sm font-bold text-green-700">{fmt$(a.monto)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paid orders summary */}
      {ordenesPagadas.length > 0 && (
        <div className="lg:col-span-2 border rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <span className="font-bold text-gray-700">Paid orders ({ordenesPagadas.length})</span>
          </div>
          <div className="divide-y max-h-48 overflow-auto">
            {ordenesPagadas.slice(0, 6).map((o) => {
              const { po } = parsePOFromNotes(o.notas);
              return (
                <div key={o.id} className="px-4 py-2 flex items-center justify-between text-sm text-gray-500">
                  <span>{fmtDate(o.fecha)}{po ? ` · ${po}` : ""}</span>
                  <span className="flex items-center gap-2">
                    <StatusBadge pendiente={0} total={o.total} />
                    <span className="font-semibold text-gray-700">{fmt$(o.total)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OrdenesTab({ ordenes, onNewOrder, onPay }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-gray-700">All orders</h3>
        <button className="text-sm text-blue-700 hover:underline font-medium" onClick={onNewOrder}>+ New order</button>
      </div>
      <div className="border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[60vh]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">PO #</th>
                <th className="px-3 py-2 text-left font-semibold">Due date</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-3 py-2 text-right font-semibold">Paid</th>
                <th className="px-3 py-2 text-right font-semibold">Due</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ordenes.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-gray-400">No orders</td></tr>
              ) : ordenes.map((o) => {
                const { po } = parsePOFromNotes(o.notas);
                const isOverdue = o.fecha_vencimiento && dayjs(o.fecha_vencimiento).isBefore(dayjs(), "day") && o.pendiente > 0.005;
                return (
                  <tr key={o.id} className={`hover:bg-gray-50 ${isOverdue ? "bg-red-50" : ""}`}>
                    <td className="px-3 py-2">{fmtDate(o.fecha)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{po || "—"}</td>
                    <td className="px-3 py-2">
                      {o.fecha_vencimiento ? (
                        <span className={isOverdue ? "text-red-600 font-semibold" : ""}>{fmtDate(o.fecha_vencimiento)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2"><StatusBadge pendiente={o.pendiente} total={o.total} /></td>
                    <td className="px-3 py-2 text-right">{fmt$(o.total)}</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt$(o.pagado)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${o.pendiente > 0.005 ? "text-amber-700" : "text-emerald-600"}`}>
                      {fmt$(o.pendiente)}
                    </td>
                    <td className="px-3 py-2">
                      {o.pendiente > 0.005 && (
                        <button className="text-xs px-2 py-1 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 font-semibold" onClick={() => onPay(o.id)}>
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AbonosTab({ abonos, ordenes, onNewPayment }) {
  const orderMap = useMemo(() => {
    const m = new Map();
    (ordenes || []).forEach((o) => m.set(o.id, o));
    return m;
  }, [ordenes]);

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-gray-700">All payments</h3>
        <button className="text-sm text-blue-700 hover:underline font-medium" onClick={onNewPayment}>+ New payment</button>
      </div>
      <div className="border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[60vh]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 text-left font-semibold">Method</th>
                <th className="px-3 py-2 text-left font-semibold">Applied to order</th>
                <th className="px-3 py-2 text-left font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {abonos.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-400">No payments</td></tr>
              ) : abonos.map((a) => {
                const o = a.orden_id ? orderMap.get(a.orden_id) : null;
                const { po } = parsePOFromNotes(o?.notas);
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{fmtDate(a.fecha)}</td>
                    <td className="px-3 py-2 text-right font-bold text-green-700">{fmt$(a.monto)}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">{a.metodo || "—"}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {o ? `${fmtDate(o.fecha)}${po ? ` · ${po}` : ""}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{a.notas || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   TARJETA DE SUPLIDOR EN LA LISTA
   ================================================================ */
function SupplierCard({ s, onClick }) {
  const balance = (s._totalOrdenes || 0) - (s._totalAbonos || 0);
  const hasBalance = balance > 0.005;
  const overdueCount = s._overdueCount || 0;

  return (
    <div
      className={`bg-white border-2 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow ${
        overdueCount > 0 ? "border-red-200" : hasBalance ? "border-amber-200" : "border-green-100"
      }`}
      onClick={onClick}
    >
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 ${
        overdueCount > 0 ? "bg-red-100 text-red-700" : hasBalance ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
      }`}>
        {(s.nombre || "?")[0]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-gray-900 truncate">{s.nombre}</div>
        <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
          {s.contacto && <span>{s.contacto}</span>}
          {s.telefono && <span>{s.telefono}</span>}
          {s._orderCount > 0 && (
            <span>{s._orderCount} order{s._orderCount !== 1 ? "s" : ""} · Last {fmtDate(s._lastOrderDate)}</span>
          )}
        </div>
      </div>

      {/* Balance */}
      <div className="text-right flex-shrink-0">
        {hasBalance ? (
          <>
            <div className="text-xs text-gray-400 font-medium">Owed</div>
            <div className={`text-lg font-bold ${overdueCount > 0 ? "text-red-700" : "text-amber-700"}`}>
              {fmt$(balance)}
            </div>
            {overdueCount > 0 && (
              <div className="text-xs text-red-600 font-semibold">{overdueCount} overdue</div>
            )}
          </>
        ) : (
          <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">Paid up</span>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   LISTADO PRINCIPAL
   ================================================================ */
export default function Suplidores() {
  const { toast } = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [suplidores, setSuplidores] = useState([]);
  const [balances, setBalances] = useState({}); // { id: { totalOrdenes, totalAbonos, orderCount, lastOrderDate, overdueCount } }
  const [loading, setLoading] = useState(true);
  const [showCrear, setShowCrear] = useState(false);
  const [sel, setSel] = useState(null);
  const [filtro, setFiltro] = useState("todos"); // todos | balance | alpedia
  const [sort, setSort] = useState("balance"); // balance | nombre

  const loadSuplidores = useCallback(async () => {
    setLoading(true);
    const { data: sups, error } = await supabase.from("suplidores").select("*").order("nombre", { ascending: true });
    if (error) { toast.error(error.message); setLoading(false); return; }

    const lista = sups || [];
    setSuplidores(lista);

    if (lista.length === 0) { setLoading(false); return; }

    // Load financial summary for all suppliers in parallel
    const [{ data: ordData, error: ordErr }, { data: aboData }] = await Promise.all([
      supabase.from("ordenes_compra").select("id, suplidor_id, total, fecha, estado"),
      supabase.from("abonos_compra").select("suplidor_id, orden_id, monto"),
    ]);

    if (ordErr) {
      // eslint-disable-next-line no-console
      console.warn("ordenes_compra fetch error:", ordErr.message);
    }

    const bals = {};
    lista.forEach((s) => {
      const ords = (ordData || []).filter((o) => o.suplidor_id === s.id);
      const abs = (aboData || []).filter((a) => a.suplidor_id === s.id);
      const totalOrdenes = ords.reduce((t, o) => t + Number(o.total || 0), 0);
      const totalAbonos = abs.reduce((t, a) => t + Number(a.monto || 0), 0);
      const lastOrderDate = ords.length > 0
        ? [...ords].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0].fecha
        : null;
      bals[s.id] = { totalOrdenes, totalAbonos, orderCount: ords.length, lastOrderDate, overdueCount: 0 };
    });
    setBalances(bals);
    setLoading(false);
  }, []);

  useEffect(() => { loadSuplidores(); }, [loadSuplidores]);

  const suplidoresConBalance = useMemo(() =>
    suplidores.map((s) => {
      const b = balances[s.id] || {};
      return {
        ...s,
        _totalOrdenes: b.totalOrdenes || 0,
        _totalAbonos: b.totalAbonos || 0,
        _orderCount: b.orderCount || 0,
        _lastOrderDate: b.lastOrderDate || null,
        _overdueCount: b.overdueCount || 0,
        _balance: (b.totalOrdenes || 0) - (b.totalAbonos || 0),
      };
    }),
    [suplidores, balances]
  );

  const filtrados = useMemo(() => {
    const q = (busqueda || "").trim().toLowerCase();
    let list = suplidoresConBalance;
    if (q) list = list.filter((s) =>
      (s.nombre || "").toLowerCase().includes(q) ||
      (s.contacto || "").toLowerCase().includes(q) ||
      (s.telefono || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q)
    );
    if (filtro === "balance") list = list.filter((s) => s._balance > 0.005);
    if (filtro === "alpedia") list = list.filter((s) => s._balance <= 0.005);
    if (sort === "balance") list = [...list].sort((a, b) => b._balance - a._balance);
    if (sort === "nombre") list = [...list].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    return list;
  }, [suplidoresConBalance, busqueda, filtro, sort]);

  // Global stats
  const stats = useMemo(() => {
    const totalOwed = suplidoresConBalance.reduce((t, s) => t + Math.max(0, s._balance), 0);
    const withBalance = suplidoresConBalance.filter((s) => s._balance > 0.005).length;
    const overdue = suplidoresConBalance.filter((s) => s._overdueCount > 0).length;
    return { totalOwed, withBalance, overdue, total: suplidores.length };
  }, [suplidoresConBalance, suplidores.length]);

  if (sel) {
    return (
      <DetalleSuplidor
        suplidor={sel}
        onBack={() => { setSel(null); loadSuplidores(); }}
        onSuplidorUpdated={(upd) => setSel(upd)}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Suppliers</h2>

      {/* Stats bar */}
      {!loading && suplidores.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white border rounded-2xl p-3 text-center shadow-sm">
            <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-0.5">Suppliers</div>
          </div>
          <div className="bg-white border rounded-2xl p-3 text-center shadow-sm">
            <div className="text-2xl font-bold text-amber-700">{fmt$(stats.totalOwed)}</div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-0.5">Total owed</div>
          </div>
          <div className="bg-white border rounded-2xl p-3 text-center shadow-sm">
            <div className="text-2xl font-bold text-blue-700">{stats.withBalance}</div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-0.5">With balance</div>
          </div>
          <div className={`border rounded-2xl p-3 text-center shadow-sm ${stats.overdue > 0 ? "bg-red-50 border-red-200" : "bg-white"}`}>
            <div className={`text-2xl font-bold ${stats.overdue > 0 ? "text-red-700" : "text-gray-400"}`}>{stats.overdue}</div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-0.5">Overdue</div>
          </div>
        </div>
      )}

      {/* Search + New */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          className="border rounded-xl p-2.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Search by name, contact, phone or email…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button
          className="bg-green-700 text-white rounded-xl px-5 py-2 font-semibold hover:bg-green-800 flex-shrink-0"
          onClick={() => setShowCrear((v) => !v)}
        >
          {showCrear ? "Cancel" : "+ New supplier"}
        </button>
      </div>

      {showCrear && (
        <div className="mb-4">
          <CrearSuplidorInline
            onCreated={(s) => { setShowCrear(false); loadSuplidores(); setSel(s); }}
            onCancel={() => setShowCrear(false)}
          />
        </div>
      )}

      {/* Filters + Sort */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { key: "todos", label: "All" },
            { key: "balance", label: "Has balance" },
            { key: "alpedia", label: "Paid up" },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                filtro === key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setFiltro(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Sort:</span>
          <button
            className={`px-2 py-1 rounded-lg ${sort === "balance" ? "bg-blue-100 text-blue-700 font-semibold" : "hover:bg-gray-100"}`}
            onClick={() => setSort("balance")}
          >
            Balance
          </button>
          <button
            className={`px-2 py-1 rounded-lg ${sort === "nombre" ? "bg-blue-100 text-blue-700 font-semibold" : "hover:bg-gray-100"}`}
            onClick={() => setSort("nombre")}
          >
            Name
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-blue-700 py-12 justify-center">
          <span className="animate-spin text-xl">⟳</span> Loading suppliers…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          {busqueda ? "No suppliers match your search." : "No suppliers found."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-gray-400 px-1">{filtrados.length} supplier{filtrados.length !== 1 ? "s" : ""}</div>
          {filtrados.map((s) => (
            <SupplierCard key={s.id} s={s} onClick={() => setSel(s)} />
          ))}
        </div>
      )}
    </div>
  );
}
