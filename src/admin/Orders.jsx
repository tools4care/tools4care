// src/admin/Orders.jsx
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

/* =========================
   Configuración / helpers
   ========================= */

const PAGE_SIZE = 10;

const STATUS_FILTERS = [
  "all",
  "pending",
  "paid",
  "processing",
  "preparing",
  "ready",
  "shipped",
  "delivered",
  "canceled",
  "cancelled",
  "refunded",
];

const STATUS_UPDATE_OPTS = [
  "pending",
  "paid",
  "processing",
  "preparing",
  "ready",
  "shipped",
  "delivered",
  "canceled",
  "refunded",
];

const DATE_FILTERS = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "all", label: "Todo" },
];

function fmtMoney(n, currency = "USD") {
  const val = Number(n || 0);
  return val.toLocaleString("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function badgeClasses(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return "bg-amber-50 text-amber-700 border border-amber-200";
  if (s === "paid") return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (s === "processing") return "bg-yellow-50 text-yellow-700 border border-yellow-200";
  if (s === "preparing") return "bg-sky-50 text-sky-700 border border-sky-200";
  if (s === "ready") return "bg-indigo-50 text-indigo-700 border border-indigo-200";
  if (s === "shipped") return "bg-blue-50 text-blue-700 border border-blue-200";
  if (s === "delivered") return "bg-teal-50 text-teal-700 border border-teal-200";
  if (s === "canceled" || s === "cancelled")
    return "bg-rose-50 text-rose-700 border border-rose-200";
  if (s === "refunded") return "bg-slate-50 text-slate-700 border border-slate-200";
  return "bg-gray-50 text-gray-700 border border-gray-200";
}

function AddressBlock({ address }) {
  if (!address) return null;
  const a = address || {};
  return (
    <div className="text-sm text-gray-700">
      <div>{a.line1}</div>
      {a.line2 ? <div>{a.line2}</div> : null}
      <div>
        {a.city}, {a.state} {a.postal_code}
      </div>
      <div>{a.country}</div>
    </div>
  );
}

function applyDateFilter(qb, key) {
  if (key === "all") return qb;
  const now = new Date();
  if (key === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return qb.gte("created_at", start.toISOString());
  }
  if (key === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return qb.gte("created_at", start.toISOString());
  }
  if (key === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return qb.gte("created_at", start.toISOString());
  }
  return qb;
}

/* =========================
   Panel lateral de Detalle
   ========================= */

function Skeleton() {
  return (
    <div className="p-5 space-y-3">
      <div className="h-5 bg-gray-100 rounded animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 bg-gray-100 rounded animate-pulse" />
        <div className="h-24 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="h-40 bg-gray-100 rounded animate-pulse" />
    </div>
  );
}

function OrderDetailDrawer({ open, onClose, orderId, onStatusChange }) {
  // ─── ALL HOOKS BEFORE ANY CONDITIONAL RETURN ───
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [trackingInput, setTrackingInput] = useState("");
  const [savingTracking, setSavingTracking] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadDetail = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setEmailMsg("");
    try {
      const { data: o } = await supabase
        .from("orders")
        .select(
          "id, created_at, status, name, email, phone, address_json, amount_subtotal, amount_shipping, amount_taxes, amount_total, currency, payment_intent_id, tracking_number"
        )
        .eq("id", orderId)
        .maybeSingle();

      const { data: its } = await supabase
        .from("order_items")
        .select("id, producto_id, nombre, marca, codigo, qty, precio_unit, taxable")
        .eq("order_id", orderId)
        .order("id", { ascending: true });

      const { data: hist } = await supabase
        .from("order_status_history")
        .select("id, old_status, new_status, note, changed_by, changed_at")
        .eq("order_id", orderId)
        .order("changed_at", { ascending: true });

      setOrder(o || null);
      setItems(its || []);
      setHistory(hist || []);
      setTrackingInput(o?.tracking_number || "");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!open || !orderId) return;
    let cancel = false;
    (async () => {
      if (!cancel) await loadDetail();
    })();
    return () => {
      cancel = true;
    };
  }, [loadDetail, open, orderId]);

  // ─── Safe to conditionally return AFTER all hooks ───
  if (!open || !orderId) return null;

  const pi = order?.payment_intent_id || "";
  const stripeLink = pi ? `https://dashboard.stripe.com/test/payments/${pi}` : null;

  async function addNote() {
    if (!note.trim() || !orderId) return;
    const text = note.trim();
    setNote("");
    const userRes = await supabase.auth.getUser().catch(() => null);
    const userId = userRes?.data?.user?.id ?? null;
    const { error } = await supabase.from("order_status_history").insert({
      order_id: orderId,
      old_status: null,
      new_status: order?.status ?? null,
      note: text,
      changed_by: userId,
    });
    if (error) {
      alert(error.message || "No se pudo guardar la nota.");
      return;
    }
    const { data: hist } = await supabase
      .from("order_status_history")
      .select("id, old_status, new_status, note, changed_by, changed_at")
      .eq("order_id", orderId)
      .order("changed_at", { ascending: true });
    setHistory(hist || []);
  }

  async function changeStatus(next) {
    if (!orderId) return;
    const prev = order?.status ?? null;
    setOrder((o) => (o ? { ...o, status: next } : o));
    const { error } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", orderId)
      .neq("status", next);
    if (error) {
      setOrder((o) => (o ? { ...o, status: prev } : o));
      alert(error.message || "No se pudo actualizar el estado.");
      return;
    }
    const { data: hist } = await supabase
      .from("order_status_history")
      .select("id, old_status, new_status, note, changed_by, changed_at")
      .eq("order_id", orderId)
      .order("changed_at", { ascending: true });
    setHistory(hist || []);
    onStatusChange?.(orderId, next);
  }

  async function saveTracking() {
    if (!orderId) return;
    setSavingTracking(true);
    try {
      await supabase
        .from("orders")
        .update({ tracking_number: trackingInput.trim() || null })
        .eq("id", orderId);
      setOrder((o) => (o ? { ...o, tracking_number: trackingInput.trim() || null } : o));
    } catch (e) {
      alert(e?.message || "Error al guardar el tracking.");
    } finally {
      setSavingTracking(false);
    }
  }

  async function resendEmail() {
    if (!order?.email) {
      alert("Este pedido no tiene email registrado.");
      return;
    }
    setSendingEmail(true);
    setEmailMsg("");
    try {
      const n = (v) => (Number(v) || 0).toFixed(2);
      const addr = order.address_json
        ? [
            order.address_json.line1,
            order.address_json.line2,
            [order.address_json.city, order.address_json.state, order.address_json.postal_code]
              .filter(Boolean)
              .join(", "),
            order.address_json.country,
          ]
            .filter(Boolean)
            .join("<br>")
        : "—";
      const itemRows = items
        .map((it, idx) => {
          const line = (it.qty || 0) * (it.precio_unit || 0);
          const z = idx % 2 === 1 ? "background:#fafafa;" : "";
          return `<tr style="${z}">
            <td style="padding:10px 8px;vertical-align:top">
              <div style="font-weight:600">${it.nombre || it.producto_id}</div>
              ${it.marca ? `<div style="color:#6b7280;font-size:12px">${it.marca}${it.codigo ? " · " + it.codigo : ""}</div>` : ""}
            </td>
            <td align="right" style="padding:10px 8px;white-space:nowrap">${it.qty}</td>
            <td align="right" style="padding:10px 8px;white-space:nowrap">$${n(it.precio_unit)}</td>
            <td align="right" style="padding:10px 8px;white-space:nowrap"><b>$${n(line)}</b></td>
          </tr>`;
        })
        .join("");
      const html = `<!doctype html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;background:#f6f7f9;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px;">
<tr><td align="center">
<table width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr><td style="padding:20px 24px;background:#111827;color:#fff;font-size:18px;font-weight:700;">Tools4care</td></tr>
  <tr><td style="padding:24px;color:#111827;">
    <h1 style="margin:0 0 8px;font-size:22px;">Pedido #${orderId} confirmado 🎉</h1>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;">Hola <b>${order.name || "Cliente"}</b>, aquí está el resumen de tu pedido.</p>
    <table width="100%" style="border-collapse:collapse;font-size:14px;border:1px solid #e5e7eb;border-radius:8px;">
      <thead><tr style="background:#f3f4f6">
        <th align="left" style="padding:10px 8px;color:#6b7280;">Producto</th>
        <th align="right" style="padding:10px 8px;color:#6b7280;">Qty</th>
        <th align="right" style="padding:10px 8px;color:#6b7280;">Precio</th>
        <th align="right" style="padding:10px 8px;color:#6b7280;">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <table width="100%" style="font-size:14px;margin-top:12px;">
      <tr><td>Subtotal</td><td align="right">$${n(order.amount_subtotal)}</td></tr>
      <tr><td>Envío</td><td align="right">$${n(order.amount_shipping)}</td></tr>
      <tr><td>Impuestos</td><td align="right">$${n(order.amount_taxes)}</td></tr>
      <tr><td style="border-top:1px solid #e5e7eb;padding-top:8px;"><b>Total</b></td><td align="right" style="border-top:1px solid #e5e7eb;padding-top:8px;"><b>$${n(order.amount_total)}</b></td></tr>
    </table>
    ${order.tracking_number ? `<div style="margin-top:16px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:14px;"><b>Número de seguimiento:</b> ${order.tracking_number}</div>` : ""}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
    <div style="color:#6b7280;font-size:13px;"><b>Dirección de envío:</b><br>${addr}</div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-order-email`;
      const isTracking = !!order.tracking_number;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: order.email,
          subject: isTracking
            ? `Tu pedido #${orderId} ha sido enviado`
            : `Confirmación pedido #${orderId}`,
          html,
        }),
      });
      setEmailMsg(res.ok ? "✓ Email enviado" : "⚠ Error al enviar");
    } catch (e) {
      setEmailMsg("⚠ " + (e?.message || "Error"));
    } finally {
      setSendingEmail(false);
      setTimeout(() => setEmailMsg(""), 5000);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Pedido</div>
            <div className="text-xl font-bold">#{orderId}</div>
          </div>
          <button
            className="rounded-lg border px-3 py-1.5 hover:bg-gray-50 text-sm"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading && <Skeleton />}

          {order && (
            <div className="p-5 space-y-4">
              {/* Fila 1: Cliente + Estado/Finanzas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cliente */}
                <div className="bg-white rounded-xl border p-4 space-y-1">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Cliente
                  </div>
                  <div className="font-semibold text-base">{order.name || "—"}</div>
                  <div className="text-sm text-blue-600 break-all">{order.email || "—"}</div>
                  <div className="text-sm text-gray-600">{order.phone || "—"}</div>
                  <div className="text-sm text-gray-500 mt-2 pt-2 border-t">
                    <AddressBlock address={order.address_json} />
                  </div>
                  {/* Reenviar email */}
                  <div className="pt-3 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={resendEmail}
                      disabled={sendingEmail || !order.email}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50 flex items-center gap-1"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                      </svg>
                      {sendingEmail ? "Enviando…" : "Reenviar email"}
                    </button>
                    {emailMsg && (
                      <span
                        className={`text-xs font-medium ${
                          emailMsg.startsWith("✓") ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {emailMsg}
                      </span>
                    )}
                  </div>
                </div>

                {/* Estado + Tracking + Finanzas */}
                <div className="bg-white rounded-xl border p-4 space-y-3">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Estado
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs border font-medium ${badgeClasses(
                        order.status
                      )}`}
                    >
                      {order.status ?? "pending"}
                    </span>
                    <select
                      className="text-xs border rounded-lg px-2 py-1.5 bg-white"
                      value={order.status ?? "pending"}
                      onChange={(e) => changeStatus(e.target.value)}
                    >
                      {STATUS_UPDATE_OPTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tracking */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Número de seguimiento</div>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                        placeholder="Ej: 1Z999AA10123456784"
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveTracking()}
                      />
                      <button
                        onClick={saveTracking}
                        disabled={savingTracking}
                        className="px-3 py-1.5 text-xs rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                      >
                        {savingTracking ? "…" : "Guardar"}
                      </button>
                    </div>
                    {order.tracking_number && (
                      <div className="mt-1 text-xs text-emerald-700">
                        Activo: {order.tracking_number}
                      </div>
                    )}
                  </div>

                  {/* Montos */}
                  <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
                    <div>
                      <div className="text-xs text-gray-400">Subtotal</div>
                      <div className="font-medium">{fmtMoney(order.amount_subtotal, order.currency)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Envío</div>
                      <div className="font-medium">{fmtMoney(order.amount_shipping, order.currency)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Impuestos</div>
                      <div className="font-medium">{fmtMoney(order.amount_taxes, order.currency)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Total</div>
                      <div className="font-bold text-base">{fmtMoney(order.amount_total, order.currency)}</div>
                    </div>
                  </div>

                  {/* Payment Intent */}
                  {pi && (
                    <div className="pt-2 border-t text-sm">
                      <div className="text-xs text-gray-400 mb-1">Payment Intent</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="px-2 py-0.5 rounded bg-gray-100 text-xs break-all">{pi}</code>
                        <button
                          className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                          onClick={() => navigator.clipboard.writeText(pi)}
                          title="Copiar"
                        >
                          Copiar
                        </button>
                        {stripeLink && (
                          <a
                            className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                            href={stripeLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Stripe ↗
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Productos */}
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b font-medium text-sm">
                  Productos ({items.length})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="px-4 py-2 font-medium text-gray-600">Producto</th>
                        <th className="px-4 py-2 font-medium text-gray-600 text-right">Qty</th>
                        <th className="px-4 py-2 font-medium text-gray-600 text-right">Precio</th>
                        <th className="px-4 py-2 font-medium text-gray-600 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} className="border-t hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <div className="font-medium">{it.nombre || it.producto_id}</div>
                            {(it.marca || it.codigo) && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {[it.marca, it.codigo].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">{it.qty}</td>
                          <td className="px-4 py-3 text-right">
                            {fmtMoney(it.precio_unit, order.currency)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {fmtMoney((it.qty || 0) * (it.precio_unit || 0), order.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Historial */}
              <div className="bg-white rounded-xl border">
                <div className="px-4 py-3 border-b font-medium text-sm">Historial</div>
                <div className="p-4">
                  {history.length === 0 ? (
                    <div className="text-sm text-gray-400">Sin eventos registrados.</div>
                  ) : (
                    <ol className="relative border-s border-gray-200 ms-3 space-y-4">
                      {history.map((h) => (
                        <li key={h.id} className="ms-4">
                          <div className="absolute w-2.5 h-2.5 bg-white border-2 border-gray-400 rounded-full -start-1.5 mt-1.5" />
                          <time className="text-xs text-gray-400">
                            {new Date(h.changed_at).toLocaleString()}
                          </time>
                          {(h.old_status || h.new_status) && (
                            <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                              {h.old_status && (
                                <span
                                  className={`inline-block rounded-full px-2 py-0.5 text-xs border ${badgeClasses(
                                    h.old_status
                                  )}`}
                                >
                                  {h.old_status}
                                </span>
                              )}
                              {h.old_status && (
                                <span className="text-gray-400 text-xs">→</span>
                              )}
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-xs border ${badgeClasses(
                                  h.new_status
                                )}`}
                              >
                                {h.new_status}
                              </span>
                            </div>
                          )}
                          {h.note && (
                            <div className="mt-1 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                              {h.note}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="mt-4 flex gap-2">
                    <input
                      className="flex-1 border rounded-lg px-3 py-2 text-sm"
                      placeholder="Agregar nota interna…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addNote()}
                    />
                    <button
                      onClick={addNote}
                      className="px-3 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-black"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
   Lista de pedidos (principal)
   ========================= */

export default function Orders() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [expanded, setExpanded] = useState({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const pageTotal = useMemo(
    () => rows.reduce((s, r) => s + Number(r.amount_total || 0), 0),
    [rows]
  );

  const fetchCount = useCallback(async () => {
    let qb = supabase.from("orders").select("id");
    if (statusFilter !== "all") qb = qb.eq("status", statusFilter);
    qb = applyDateFilter(qb, dateFilter);
    const { data } = await qb.limit(10000);
    setTotal((data || []).length);
  }, [statusFilter, dateFilter]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const selects =
        "id, payment_intent_id, amount_subtotal, amount_shipping, amount_taxes, amount_total, currency, status, name, email, phone, address_json, created_at";

      if (q.trim()) {
        const term = q.trim();
        const mk = () => {
          let b = supabase.from("orders").select(selects);
          if (statusFilter !== "all") b = b.eq("status", statusFilter);
          b = applyDateFilter(b, dateFilter);
          return b.order("created_at", { ascending: false }).limit(PAGE_SIZE);
        };
        const numericId = !isNaN(Number(term)) && Number(term) > 0 ? Number(term) : null;
        const [byEmail, byName, byPi, byId] = await Promise.all([
          mk().ilike("email", `%${term}%`),
          mk().ilike("name", `%${term}%`),
          mk().ilike("payment_intent_id", `%${term}%`),
          numericId
            ? supabase.from("orders").select(selects).eq("id", numericId).limit(1)
            : Promise.resolve({ data: [] }),
        ]);
        const merge = new Map();
        (byId.data || []).forEach((r) => merge.set(r.id, r));
        (byEmail.data || []).forEach((r) => merge.set(r.id, r));
        (byName.data || []).forEach((r) => merge.set(r.id, r));
        (byPi.data || []).forEach((r) => merge.set(r.id, r));
        const merged = Array.from(merge.values()).sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        setRows(merged.slice(0, PAGE_SIZE));
        return;
      }

      let query = supabase
        .from("orders")
        .select(selects)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      query = applyDateFilter(query, dateFilter);

      const { data, error } = await query;
      if (error) throw error;
      setRows(data || []);
    } finally {
      setLoading(false);
    }
  }, [page, q, statusFilter, dateFilter]);

  useEffect(() => {
    fetchCount();
  }, [statusFilter, q, dateFilter, fetchCount]);

  useEffect(() => {
    fetchPage();
  }, [page, q, statusFilter, dateFilter, fetchPage]);

  // 🔁 Realtime: refrescar la tabla cuando cambie cualquier orden
  useEffect(() => {
    const channel = supabase
      .channel("admin-orders-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          // Pequeño debounce para agrupar cambios consecutivos
          setTimeout(() => {
            fetchCount();
            fetchPage();
          }, 150);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCount, fetchPage]);

  async function toggleExpand(orderId) {
    if (expanded[orderId]) {
      setExpanded((prev) => {
        const copy = { ...prev };
        delete copy[orderId];
        return copy;
      });
      return;
    }
    const { data, error } = await supabase
      .from("order_items")
      .select("id, producto_id, nombre, qty, precio_unit, marca, codigo, taxable")
      .eq("order_id", orderId)
      .order("id", { ascending: true });

    setExpanded((prev) => ({ ...prev, [orderId]: error ? "error" : data || [] }));
  }

  // ⚠️ Solo cambia el estado. El inventario lo maneja el trigger en la BD.
  async function updateStatus(orderId, next) {
    const before = rows;
    setRows((list) =>
      list.map((r) => (r.id === orderId ? { ...r, status: next } : r))
    );
    const { error } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", orderId)
      .neq("status", next); // evita no-op y re-disparos inútiles
    if (error) {
      setRows(before);
      alert(error.message || "No se pudo actualizar el estado.");
    }
  }

  function exportCSV() {
    const header = [
      "id",
      "created_at",
      "name",
      "email",
      "phone",
      "status",
      "amount_total",
      "currency",
      "payment_intent_id",
    ];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      lines.push(
        [
          r.id,
          r.created_at,
          JSON.stringify(r.name || ""),
          r.email || "",
          r.phone || "",
          r.status || "",
          r.amount_total || 0,
          (r.currency || "USD").toUpperCase(),
          r.payment_intent_id || "",
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const pages = useMemo(
    () => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)),
    [total]
  );

  return (
    <div className="mt-6 px-3 lg:px-6 space-y-6">
      {/* CARD principal */}
      <div className="bg-white rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden">
        {/* Cabecera + acciones */}
        <div className="px-5 lg:px-6 pt-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Pedidos</h2>
              <p className="text-sm text-gray-600">
                Mostrando <b>{rows.length}</b> de <b>{total}</b> — Total página:{" "}
                <b>{fmtMoney(pageTotal)}</b>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  fetchCount();
                  fetchPage();
                }}
                className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
              >
                Actualizar
              </button>
              <button
                onClick={exportCSV}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Exportar CSV
              </button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="px-5 lg:px-6 py-4 border-t bg-white/60">
          <div className="grid grid-cols-12 gap-3">
            {/* Fecha */}
            <div className="col-span-12 md:col-span-4">
              <div className="inline-flex rounded-lg border bg-white overflow-hidden">
                {DATE_FILTERS.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => {
                      setDateFilter(d.key);
                      setPage(1);
                    }}
                    className={`px-3 py-2 text-sm ${
                      dateFilter === d.key
                        ? "bg-gray-900 text-white"
                        : "hover:bg-gray-50 text-gray-800"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Búsqueda */}
            <div className="col-span-12 md:col-span-5">
              <input
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Buscar por #ID, email, nombre o payment_intent_id…"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
              />
            </div>

            {/* Estado */}
            <div className="col-span-6 md:col-span-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setPage(1);
                  setStatusFilter(e.target.value);
                }}
                className="w-full border rounded-lg px-3 py-2 bg-white"
                title="Filtrar estado"
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All" : s}
                  </option>
                ))}
              </select>
            </div>

            {/* Limpiar */}
            <div className="col-span-6 md:col-span-1">
              <button
                onClick={() => {
                  setQ("");
                  setStatusFilter("all");
                  setDateFilter("today");
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
                title="Limpiar filtros"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="px-3 lg:px-4 pb-4">
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Email / Tel</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-gray-50/60">
                {rows.map((r) => {
                  const addr = r.address_json || null;
                  const items = expanded[r.id];
                  const isSelected = r.id === detailId && detailOpen;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={`border-t hover:bg-gray-50/70 ${
                          isSelected ? "ring-2 ring-blue-200" : ""
                        }`}
                      >
                        <td className="px-3 py-4">{r.id}</td>
                        <td className="px-3 py-4">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-4 align-top">
                          <div className="font-medium">{r.name || "—"}</div>
                          {addr ? <AddressBlock address={addr} /> : null}
                        </td>
                        <td className="px-3 py-4">
                          <div>{r.email || "—"}</div>
                          <div className="text-gray-600">{r.phone || "—"}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            <span className="font-mono">
                              {r.payment_intent_id}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-4 font-semibold">
                          {fmtMoney(r.amount_total, r.currency)}
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs border ${badgeClasses(
                              r.status
                            )}`}
                          >
                            {r.status ?? "pending"}
                          </span>
                          <div className="mt-2">
                            <select
                              value={r.status ?? "pending"}
                              onChange={(e) => updateStatus(r.id, e.target.value)}
                              className="text-xs border rounded px-2 py-1 bg-white"
                              title="Cambiar estado"
                            >
                              {STATUS_UPDATE_OPTS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-right space-x-2">
                          <button
                            onClick={() => toggleExpand(r.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border hover:bg-gray-50 text-sm"
                          >
                            {items ? "Ocultar" : "Ver ítems"}
                          </button>
                          <button
                            onClick={() => {
                              setDetailId(r.id);
                              setDetailOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border hover:bg-gray-50 text-sm"
                          >
                            Detalle
                          </button>
                        </td>
                      </tr>

                      {items && items !== "error" && (
                        <tr className="bg-gray-50">
                          <td className="px-3 py-3" colSpan={7}>
                            <div className="text-sm">
                              <div className="font-medium mb-2">Ítems</div>
                              <div className="overflow-x-auto">
                                <table className="w-full border bg-white rounded">
                                  <thead>
                                    <tr className="text-left bg-gray-50">
                                      <th className="px-3 py-2">Producto</th>
                                      <th className="px-3 py-2">Marca</th>
                                      <th className="px-3 py-2">Código</th>
                                      <th className="px-3 py-2">Qty</th>
                                      <th className="px-3 py-2">Precio</th>
                                      <th className="px-3 py-2">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((it) => (
                                      <tr key={it.id} className="border-t">
                                        <td className="px-3 py-2">
                                          {it.nombre || it.producto_id}
                                        </td>
                                        <td className="px-3 py-2">
                                          {it.marca || "—"}
                                        </td>
                                        <td className="px-3 py-2">
                                          {it.codigo || "—"}
                                        </td>
                                        <td className="px-3 py-2">{it.qty}</td>
                                        <td className="px-3 py-2">
                                          {fmtMoney(it.precio_unit, r.currency)}
                                        </td>
                                        <td className="px-3 py-2">
                                          {fmtMoney(
                                            (it.qty || 0) * (it.precio_unit || 0),
                                            r.currency
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                                <div>
                                  <span className="text-gray-600">Subtotal: </span>
                                  <b>{fmtMoney(r.amount_subtotal, r.currency)}</b>
                                </div>
                                <div>
                                  <span className="text-gray-600">Envío: </span>
                                  <b>{fmtMoney(r.amount_shipping, r.currency)}</b>
                                </div>
                                <div>
                                  <span className="text-gray-600">Impuestos: </span>
                                  <b>{fmtMoney(r.amount_taxes, r.currency)}</b>
                                </div>
                                <div>
                                  <span className="text-gray-600">Total: </span>
                                  <b>{fmtMoney(r.amount_total, r.currency)}</b>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {items === "error" && (
                        <tr className="bg-red-50">
                          <td className="px-3 py-2 text-red-700" colSpan={7}>
                            No se pudieron cargar los ítems de esta orden.
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {!rows.length && !loading && (
                  <tr>
                    <td className="px-3 py-12 text-center text-gray-500" colSpan={7}>
                      No hay órdenes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pie: paginación */}
        <div className="px-5 lg:px-6 py-4 border-t bg-white flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Página {page} de {Math.max(1, pages)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-2 rounded-lg border disabled:opacity-50 bg-white hover:bg-gray-50"
              disabled={page <= 1}
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-2 rounded-lg border disabled:opacity-50 bg-white hover:bg-gray-50"
              disabled={rows.length < PAGE_SIZE}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Cargando…</div>}

      {/* Drawer de Detalle */}
      <OrderDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        orderId={detailId}
        onStatusChange={(id, next) =>
          setRows((list) =>
            list.map((r) => (r.id === id ? { ...r, status: next } : r))
          )
        }
      />
    </div>
  );
}
