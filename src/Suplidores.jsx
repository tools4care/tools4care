// src/Suplidores.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

/* ---------- helpers ---------- */
function MoneyInput({ value, onChange, ...rest }) {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      className="border rounded p-2 w-full"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      {...rest}
    />
  );
}

// máscara visual de teléfono pero devolviendo solo dígitos para DB
function maskPhone(raw) {
  const d = (raw || "").replace(/\D/g, "").slice(0, 15);
  if (d.length <= 3) return { view: `(${d}`, db: d };
  if (d.length <= 6) return { view: `(${d.slice(0, 3)}) ${d.slice(3)}`, db: d };
  return { view: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, db: d };
}

// extrae PO y resto de notas desde una cadena tipo "PO: XXX — Resto"
function parsePOFromNotes(notas) {
  const txt = (notas || "").trim();
  if (!txt) return { po: "", notes: "" };
  const m = /^PO:\s*([^\u2014\-]+)\s*(?:[\u2014-]\s*(.*))?$/i.exec(txt);
  if (m) {
    return { po: (m[1] || "").trim(), notes: (m[2] || "").trim() };
  }
  return { po: "", notes: txt };
}

/* ---------- Crear/editar Suplidor (inline, sin <form>) ---------- */
function CrearSuplidorInline({ onCreated }) {
  const [f, setF] = useState({
    nombre: "",
    contacto: "",
    telefonoView: "",
    telefonoDb: "",
    direccion: "",
    email: "",
    orderNumber: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const canSave = (f.nombre || "").trim().length > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);

    const basePayload = {
      nombre: (f.nombre || "").trim(),
      contacto: (f.contacto || "").trim(),
      telefono: f.telefonoDb || null,
      direccion: (f.direccion || "").trim(),
      email: (f.email || "").trim(),
    };

    const composedNote = [
      f.orderNumber ? `PO: ${(f.orderNumber || "").trim()}` : "",
      (f.notes || "").trim(),
    ]
      .filter(Boolean)
      .join(" — ");

    // 1º intento con "notas"; si la columna no existe, reintentamos sin ella
    let res = await supabase
      .from("suplidores")
      .insert([composedNote ? { ...basePayload, notas: composedNote } : basePayload])
      .select()
      .maybeSingle();

    if (res.error) {
      const msg = (res.error?.message || "").toLowerCase();
      if (msg.includes("column") && msg.includes("notas")) {
        res = await supabase.from("suplidores").insert([basePayload]).select().maybeSingle();
      }
    }

    setSaving(false);

    if (res.error) {
      alert(res.error.message || "Error saving supplier.");
      return;
    }
    onCreated?.(res.data);
    setF({
      nombre: "",
      contacto: "",
      telefonoView: "",
      telefonoDb: "",
      direccion: "",
      email: "",
      orderNumber: "",
      notes: "",
    });
  }

  return (
    <div className="border rounded p-3 bg-gray-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          className="border rounded p-2 w-full uppercase"
          placeholder="NAME*"
          value={f.nombre}
          onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))}
        />
        <input
          className="border rounded p-2 w-full uppercase"
          placeholder="CONTACT"
          value={f.contacto}
          onChange={(e) => setF((p) => ({ ...p, contacto: e.target.value }))}
        />
        <input
          className="border rounded p-2 w-full"
          placeholder="PHONE"
          value={f.telefonoView}
          onChange={(e) => {
            const { view, db } = maskPhone(e.target.value);
            setF((p) => ({ ...p, telefonoView: view, telefonoDb: db }));
          }}
        />
        <input
          className="border rounded p-2 w-full"
          placeholder="EMAIL"
          value={f.email}
          onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))}
        />
        <div className="sm:col-span-2">
          <input
            className="border rounded p-2 w-full uppercase"
            placeholder="ADDRESS"
            value={f.direccion}
            onChange={(e) => setF((p) => ({ ...p, direccion: e.target.value }))}
          />
        </div>

        {/* Opcionales para registrar el PO dentro de notas */}
        <input
          className="border rounded p-2 w-full uppercase"
          placeholder="ORDER # (optional)"
          value={f.orderNumber}
          onChange={(e) => setF((p) => ({ ...p, orderNumber: e.target.value }))}
        />
        <input
          className="border rounded p-2 w-full uppercase"
          placeholder="NOTES (optional)"
          value={f.notes}
          onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))}
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving || !canSave}
        className="mt-3 bg-green-700 text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save supplier"}
      </button>
    </div>
  );
}

/* ---------- Modal simple ---------- */
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-center items-center p-4">
      <div className="bg-white w-full max-w-xl rounded-xl shadow-xl p-4 relative">
        <button
          className="absolute right-3 top-2 text-2xl text-gray-400 hover:text-black"
          onClick={onClose}
          title="Close"
        >
          ×
        </button>
        <h3 className="text-lg font-bold mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ---------- Modal de edición de suplidor ---------- */
function EditSupplierModal({ open, onClose, supplier, onSaved }) {
  const [f, setF] = useState({
    nombre: "",
    contacto: "",
    telefonoView: "",
    telefonoDb: "",
    direccion: "",
    email: "",
    orderNumber: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const canSave = (f.nombre || "").trim().length > 0;

  useEffect(() => {
    if (!open || !supplier) return;
    const { po, notes } = parsePOFromNotes(supplier.notas);
    const { view, db } = maskPhone(supplier.telefono || "");
    setF({
      nombre: supplier.nombre || "",
      contacto: supplier.contacto || "",
      telefonoView: view,
      telefonoDb: db,
      direccion: supplier.direccion || "",
      email: supplier.email || "",
      orderNumber: po,
      notes,
    });
  }, [open, supplier]);

  async function save() {
    if (!canSave || !supplier?.id) return;
    setSaving(true);

    const basePayload = {
      nombre: (f.nombre || "").trim(),
      contacto: (f.contacto || "").trim(),
      telefono: f.telefonoDb || null,
      direccion: (f.direccion || "").trim(),
      email: (f.email || "").trim(),
    };

    const composedNote = [
      f.orderNumber ? `PO: ${(f.orderNumber || "").trim()}` : "",
      (f.notes || "").trim(),
    ]
      .filter(Boolean)
      .join(" — ");

    // Intentar actualizar con 'notas'; si no existe, actualizar sin esa columna
    let res = await supabase
      .from("suplidores")
      .update(composedNote ? { ...basePayload, notas: composedNote } : basePayload)
      .eq("id", supplier.id)
      .select()
      .maybeSingle();

    if (res.error) {
      const msg = (res.error?.message || "").toLowerCase();
      if (msg.includes("column") && msg.includes("notas")) {
        res = await supabase
          .from("suplidores")
          .update(basePayload)
          .eq("id", supplier.id)
          .select()
          .maybeSingle();
      }
    }

    setSaving(false);

    if (res.error) {
      alert(res.error.message || "Error updating supplier.");
      return;
    }

    onSaved?.(res.data);
    onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit supplier">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          className="border rounded p-2 w-full uppercase"
          placeholder="NAME*"
          value={f.nombre}
          onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))}
        />
        <input
          className="border rounded p-2 w-full uppercase"
          placeholder="CONTACT"
          value={f.contacto}
          onChange={(e) => setF((p) => ({ ...p, contacto: e.target.value }))}
        />
        <input
          className="border rounded p-2 w-full"
          placeholder="PHONE"
          value={f.telefonoView}
          onChange={(e) => {
            const { view, db } = maskPhone(e.target.value);
            setF((p) => ({ ...p, telefonoView: view, telefonoDb: db }));
          }}
        />
        <input
          className="border rounded p-2 w-full"
          placeholder="EMAIL"
          value={f.email}
          onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))}
        />
        <div className="sm:col-span-2">
          <input
            className="border rounded p-2 w-full uppercase"
            placeholder="ADDRESS"
            value={f.direccion}
            onChange={(e) => setF((p) => ({ ...p, direccion: e.target.value }))}
          />
        </div>

        <input
          className="border rounded p-2 w-full uppercase"
          placeholder="ORDER # (optional)"
          value={f.orderNumber}
          onChange={(e) => setF((p) => ({ ...p, orderNumber: e.target.value }))}
        />
        <input
          className="border rounded p-2 w-full uppercase"
          placeholder="NOTES (optional)"
          value={f.notes}
          onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))}
        />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button className="px-4 py-2 rounded bg-gray-200" onClick={onClose}>
          Cancel
        </button>
        <button
          className="px-4 py-2 rounded bg-blue-700 text-white disabled:opacity-50"
          disabled={!canSave || saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Vista de detalle (órdenes/abonos) ---------- */
function DetalleSuplidor({ suplidor, onBack }) {
  // mantenemos copia local editable para reflejar cambios sin tocar el padre
  const [sup, setSup] = useState(suplidor);
  useEffect(() => setSup(suplidor), [suplidor]);

  const [tab, setTab] = useState("resumen"); // resumen | ordenes | abonos
  const [ordenes, setOrdenes] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showEdit, setShowEdit] = useState(false);
  const [showNuevaOrden, setShowNuevaOrden] = useState(false);
  const [showNuevoAbono, setShowNuevoAbono] = useState(false);

  // Order modal fields (EN)
  const [oFecha, setOFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [oTotal, setOTotal] = useState("");
  const [oPO, setOPO] = useState(""); // Order #
  const [oNotas, setONotas] = useState("");

  // Payment modal fields (EN)
  const [aFecha, setAFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [aMonto, setAMonto] = useState("");
  const [aMetodo, setAMetodo] = useState("cash");
  const [aNotas, setANotas] = useState("");
  const [aOrdenId, setAOrdenId] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [{ data: oc }, { data: ab }] = await Promise.all([
        supabase
          .from("ordenes_compra")
          .select("*")
          .eq("suplidor_id", sup.id)
          .order("fecha", { ascending: false })
          .order("id", { ascending: false }),
        supabase
          .from("abonos_compra")
          .select("*")
          .eq("suplidor_id", sup.id)
          .order("fecha", { ascending: false })
          .order("id", { ascending: false }),
      ]);
      if (!mounted) return;
      setOrdenes(oc || []);
      setAbonos(ab || []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [sup.id]);

  const abonosPorOrden = useMemo(() => {
    const map = new Map();
    (abonos || []).forEach((a) => {
      if (!a.orden_id) return;
      map.set(a.orden_id, (map.get(a.orden_id) || 0) + Number(a.monto || 0));
    });
    return map;
  }, [abonos]);

  const totalOrdenes = useMemo(
    () => (ordenes || []).reduce((t, o) => t + Number(o.total || 0), 0),
    [ordenes]
  );
  const totalAbonos = useMemo(
    () => (abonos || []).reduce((t, a) => t + Number(a.monto || 0), 0),
    [abonos]
  );
  const balance = useMemo(() => totalOrdenes - totalAbonos, [totalOrdenes, totalAbonos]);

  const ordenesAbiertas = useMemo(
    () =>
      (ordenes || []).map((o) => {
        const pagado = abonosPorOrden.get(o.id) || 0;
        const pendiente = Number(o.total || 0) - pagado;
        return { ...o, pagado, pendiente };
      }),
    [ordenes, abonosPorOrden]
  );

  async function crearOrden() {
    if (!oTotal || Number(oTotal) <= 0) return;
    const payloadBase = {
      suplidor_id: sup.id,
      fecha: oFecha,
      total: Number(oTotal),
      estado: "abierta",
    };
    const composed = [oPO ? `PO: ${(oPO || "").trim()}` : "", (oNotas || "").trim()]
      .filter(Boolean)
      .join(" — ");

    let res = await supabase
      .from("ordenes_compra")
      .insert([composed ? { ...payloadBase, notas: composed } : payloadBase])
      .select()
      .maybeSingle();

    if (res.error) {
      const msg = (res.error?.message || "").toLowerCase();
      if (msg.includes("column") && msg.includes("notas")) {
        res = await supabase.from("ordenes_compra").insert([payloadBase]).select().maybeSingle();
      }
    }

    if (res.error) return alert(res.error.message);
    setOrdenes((prev) => [res.data, ...(prev || [])]);
    setShowNuevaOrden(false);
    setOTotal("");
    setOPO("");
    setONotas("");
  }

  async function crearAbono() {
    if (!aMonto || Number(aMonto) <= 0) return;
    const payload = {
      suplidor_id: sup.id,
      orden_id: aOrdenId || null,
      fecha: aFecha,
      monto: Number(aMonto),
      metodo: aMetodo || null,
      notas: aNotas || null,
    };
    const { data, error } = await supabase
      .from("abonos_compra")
      .insert([payload])
      .select()
      .maybeSingle();
    if (error) return alert(error.message);
    setAbonos((prev) => [data, ...(prev || [])]);
    setShowNuevoAbono(false);
    setAMonto("");
    setANotas("");
    setAOrdenId("");
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <button className="text-sm text-blue-700 mr-2" onClick={onBack}>
            ← Back
          </button>
          <h2 className="text-2xl font-bold">{sup.nombre}</h2>
          <div className="text-sm text-gray-600">
            {sup.contacto && <span className="mr-3">Contact: {sup.contacto}</span>}
            {sup.telefono && <span className="mr-3">Phone: {sup.telefono}</span>}
            {sup.email && <span>Email: {sup.email}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-gray-500">Balance</div>
          <div className={`text-2xl font-bold ${balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
            ${Number(balance).toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">
            Orders: ${totalOrdenes.toFixed(2)} · Payments: ${totalAbonos.toFixed(2)}
          </div>
          <div className="mt-2">
            <button
              className="text-sm px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
              onClick={() => setShowEdit(true)}
            >
              Edit supplier
            </button>
          </div>
        </div>
      </div>

      <div className="flex border-b mb-3">
        {["resumen", "ordenes", "abonos"].map((t) => (
          <button
            key={t}
            className={`px-4 py-2 font-semibold ${
              tab === t ? "border-b-2 border-blue-700 text-blue-700" : "text-gray-500"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "resumen" ? "Summary" : t === "ordenes" ? "Orders" : "Payments"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-blue-700">Loading…</div>
      ) : tab === "resumen" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border rounded-lg">
            <div className="px-3 py-2 font-bold bg-gray-50 border-b flex items-center justify-between">
              <span>Recent orders</span>
              <button className="text-sm text-blue-700" onClick={() => setShowNuevaOrden(true)}>
                + New order
              </button>
            </div>
            <div className="max-h-[360px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-2 py-1 text-left">Date</th>
                    <th className="border px-2 py-1 text-right">Total</th>
                    <th className="border px-2 py-1 text-right">Paid</th>
                    <th className="border px-2 py-1 text-right">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenesAbiertas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-3 text-center text-gray-500">
                        No orders.
                      </td>
                    </tr>
                  ) : (
                    ordenesAbiertas.slice(0, 10).map((o) => (
                      <tr key={o.id} className="border-b">
                        <td className="border px-2 py-1">{o.fecha}</td>
                        <td className="border px-2 py-1 text-right">
                          ${Number(o.total || 0).toFixed(2)}
                        </td>
                        <td className="border px-2 py-1 text-right">
                          ${Number(o.pagado || 0).toFixed(2)}
                        </td>
                        <td className="border px-2 py-1 text-right font-semibold">
                          ${Number(o.pendiente || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border rounded-lg">
            <div className="px-3 py-2 font-bold bg-gray-50 border-b flex items-center justify-between">
              <span>Recent payments</span>
              <button className="text-sm text-blue-700" onClick={() => setShowNuevoAbono(true)}>
                + New payment
              </button>
            </div>
            <div className="max-h-[360px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-2 py-1 text-left">Date</th>
                    <th className="border px-2 py-1 text-right">Amount</th>
                    <th className="border px-2 py-1 text-left">Method</th>
                    <th className="border px-2 py-1 text-left">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {abonos.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-3 text-center text-gray-500">
                        No payments.
                      </td>
                    </tr>
                  ) : (
                    abonos.slice(0, 10).map((a) => (
                      <tr key={a.id} className="border-b">
                        <td className="border px-2 py-1">{a.fecha}</td>
                        <td className="border px-2 py-1 text-right">
                          ${Number(a.monto || 0).toFixed(2)}
                        </td>
                        <td className="border px-2 py-1">{a.metodo || ""}</td>
                        <td className="border px-2 py-1">{a.orden_id || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : tab === "ordenes" ? (
        <div>
          <div className="flex justify-between mb-2">
            <h3 className="font-bold">All orders</h3>
            <button className="text-sm text-blue-700" onClick={() => setShowNuevaOrden(true)}>
              + New order
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">ID</th>
                  <th className="border px-2 py-1 text-left">Date</th>
                  <th className="border px-2 py-1 text-left">Status</th>
                  <th className="border px-2 py-1 text-right">Total</th>
                  <th className="border px-2 py-1 text-right">Paid</th>
                  <th className="border px-2 py-1 text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {ordenesAbiertas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-3 text-center text-gray-500">
                      No orders.
                    </td>
                  </tr>
                ) : (
                  ordenesAbiertas.map((o) => (
                    <tr key={o.id} className="border-b">
                      <td className="border px-2 py-1">{o.id}</td>
                      <td className="border px-2 py-1">{o.fecha}</td>
                      <td className="border px-2 py-1">{o.estado}</td>
                      <td className="border px-2 py-1 text-right">
                        ${Number(o.total || 0).toFixed(2)}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        ${Number(o.pagado || 0).toFixed(2)}
                      </td>
                      <td
                        className={`border px-2 py-1 text-right font-semibold ${
                          o.pendiente > 0 ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        ${Number(o.pendiente || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex justify-between mb-2">
            <h3 className="font-bold">All payments</h3>
            <button className="text-sm text-blue-700" onClick={() => setShowNuevoAbono(true)}>
              + New payment
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">ID</th>
                  <th className="border px-2 py-1 text-left">Date</th>
                  <th className="border px-2 py-1 text-left">Order</th>
                  <th className="border px-2 py-1 text-right">Amount</th>
                  <th className="border px-2 py-1 text-left">Method</th>
                  <th className="border px-2 py-1 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {abonos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-3 text-center text-gray-500">
                      No payments.
                    </td>
                  </tr>
                ) : (
                  abonos.map((a) => (
                    <tr key={a.id} className="border-b">
                      <td className="border px-2 py-1">{a.id}</td>
                      <td className="border px-2 py-1">{a.fecha}</td>
                      <td className="border px-2 py-1">{a.orden_id || "—"}</td>
                      <td className="border px-2 py-1 text-right">
                        ${Number(a.monto || 0).toFixed(2)}
                      </td>
                      <td className="border px-2 py-1">{a.metodo || ""}</td>
                      <td className="border px-2 py-1">{a.notas || ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modales */}
      <EditSupplierModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        supplier={sup}
        onSaved={(upd) => setSup(upd)}
      />

      {/* Modal: New purchase order (EN) */}
      <Modal open={showNuevaOrden} onClose={() => setShowNuevaOrden(false)} title="New purchase order">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="font-bold">Date</label>
            <input
              type="date"
              className="border rounded p-2 w-full"
              value={oFecha}
              onChange={(e) => setOFecha(e.target.value)}
            />
          </div>
          <div>
            <label className="font-bold">Total</label>
            <MoneyInput value={oTotal} onChange={setOTotal} placeholder="0.00" />
          </div>
          <div>
            <label className="font-bold">Order # (optional)</label>
            <input
              className="border rounded p-2 w-full uppercase"
              value={oPO}
              onChange={(e) => setOPO(e.target.value)}
              placeholder="e.g. PO-12345"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="font-bold">Notes</label>
            <textarea
              className="border rounded p-2 w-full min-h-[70px] uppercase"
              value={oNotas}
              onChange={(e) => setONotas(e.target.value)}
              placeholder="Optional details"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-200" onClick={() => setShowNuevaOrden(false)}>
            Cancel
          </button>
          <button className="px-4 py-2 rounded bg-blue-700 text-white" onClick={crearOrden}>
            Save
          </button>
        </div>
      </Modal>

      {/* Modal: New payment (EN) */}
      <Modal open={showNuevoAbono} onClose={() => setShowNuevoAbono(false)} title="New payment">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="font-bold">Date</label>
            <input
              type="date"
              className="border rounded p-2 w-full"
              value={aFecha}
              onChange={(e) => setAFecha(e.target.value)}
            />
          </div>
          <div>
            <label className="font-bold">Amount</label>
            <MoneyInput value={aMonto} onChange={setAMonto} placeholder="0.00" />
          </div>
          <div>
            <label className="font-bold">Method</label>
            <input
              className="border rounded p-2 w-full uppercase"
              value={aMetodo}
              onChange={(e) => setAMetodo(e.target.value)}
              placeholder="cash / transfer / check"
            />
          </div>
          <div>
            <label className="font-bold">Apply to order (optional)</label>
            <select
              className="border rounded p-2 w-full"
              value={aOrdenId}
              onChange={(e) => setAOrdenId(e.target.value)}
            >
              <option value="">— No order —</option>
              {ordenesAbiertas.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id} · {o.fecha} · Due ${o.pendiente.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="font-bold">Notes</label>
            <textarea
              className="border rounded p-2 w-full min-h-[70px] uppercase"
              value={aNotas}
              onChange={(e) => setANotas(e.target.value)}
              placeholder="Optional details"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-200" onClick={() => setShowNuevoAbono(false)}>
            Cancel
          </button>
          <button className="px-4 py-2 rounded bg-blue-700 text-white" onClick={crearAbono}>
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- Listado y buscador ---------- */
export default function Suplidores() {
  const [busqueda, setBusqueda] = useState("");
  const [suplidores, setSuplidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCrear, setShowCrear] = useState(false);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      let query = supabase.from("suplidores").select("*").order("nombre", { ascending: true });
      if ((busqueda || "").trim()) {
        query = query.or(
          `nombre.ilike.%${busqueda}%,contacto.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%,email.ilike.%${busqueda}%`
        );
      }
      const { data, error } = await query;
      if (!mounted) return;
      if (error) {
        alert(error.message);
        setSuplidores([]);
      } else {
        setSuplidores(data || []);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [busqueda]);

  if (sel) {
    return <DetalleSuplidor suplidor={sel} onBack={() => setSel(null)} />;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mb-3">Suppliers</h2>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          className="border rounded p-2 w-full"
          placeholder="Search by name, contact, phone or email…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button
          className="bg-green-700 text-white rounded px-4 py-2"
          onClick={() => setShowCrear((v) => !v)}
        >
          {showCrear ? "Cancel" : "+ New supplier"}
        </button>
      </div>

      {showCrear && (
        <div className="mb-4">
          <CrearSuplidorInline
            onCreated={(s) => {
              setShowCrear(false);
              setSel(s); // Abrimos el detalle inmediatamente
            }}
          />
        </div>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <div className="px-3 py-2 font-bold bg-gray-50 border-b flex justify-between">
          <span>List</span>
          <span className="text-sm text-gray-500">{suplidores.length} supplier(s)</span>
        </div>
        {loading ? (
          <div className="p-3 text-blue-700">Loading…</div>
        ) : suplidores.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No suppliers.</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">Name</th>
                  <th className="border px-2 py-1 text-left">Contact</th>
                  <th className="border px-2 py-1 text-left">Phone</th>
                  <th className="border px-2 py-1 text-left">Email</th>
                  <th className="border px-2 py-1 text-left">Address</th>
                </tr>
              </thead>
              <tbody>
                {suplidores.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b hover:bg-blue-50 cursor-pointer"
                    onClick={() => setSel(s)}
                  >
                    <td className="border px-2 py-1">{s.nombre}</td>
                    <td className="border px-2 py-1">{s.contacto || ""}</td>
                    <td className="border px-2 py-1">{s.telefono || ""}</td>
                    <td className="border px-2 py-1">{s.email || ""}</td>
                    <td className="border px-2 py-1">{s.direccion || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
