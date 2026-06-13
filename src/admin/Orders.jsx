// src/admin/Orders.jsx
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  Package, RefreshCw, Search, Filter, Download, X, ChevronDown,
  ChevronRight, Copy, Check, ExternalLink, MessageSquare, Clock,
  User, MapPin, CreditCard, ShoppingBag, AlertCircle, Truck,
  CheckCircle2, XCircle, RotateCcw, Loader2, Tag,
} from "lucide-react";

/* ═══════════════════════════════════════════════════
   Constants / helpers
═══════════════════════════════════════════════════ */
const PAGE_SIZE = 12;

const STATUSES = [
  { key: "pending",    label: "Pending",    color: "bg-amber-100 text-amber-700 border-amber-200",    dot: "bg-amber-400",  Icon: Clock        },
  { key: "paid",       label: "Paid",       color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-400", Icon: CreditCard   },
  { key: "processing", label: "Processing", color: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-400", Icon: Loader2      },
  { key: "preparing",  label: "Preparing",  color: "bg-sky-100 text-sky-700 border-sky-200",          dot: "bg-sky-400",    Icon: Package      },
  { key: "ready",      label: "Ready",      color: "bg-indigo-100 text-indigo-700 border-indigo-200", dot: "bg-indigo-400", Icon: CheckCircle2 },
  { key: "shipped",    label: "Shipped",    color: "bg-blue-100 text-blue-700 border-blue-200",       dot: "bg-blue-400",   Icon: Truck        },
  { key: "delivered",  label: "Delivered",  color: "bg-teal-100 text-teal-700 border-teal-200",       dot: "bg-teal-400",   Icon: Check        },
  { key: "canceled",   label: "Canceled",   color: "bg-rose-100 text-rose-700 border-rose-200",       dot: "bg-rose-400",   Icon: XCircle      },
  { key: "refunded",   label: "Refunded",   color: "bg-slate-100 text-slate-600 border-slate-200",    dot: "bg-slate-400",  Icon: RotateCcw    },
];

const DATE_FILTERS = [
  { key: "today", label: "Today" },
  { key: "7d",    label: "7 days" },
  { key: "30d",   label: "30 days" },
  { key: "all",   label: "All" },
];

const getStatus = (key) => STATUSES.find((s) => s.key === String(key || "").toLowerCase()) ?? STATUSES[0];

function fmtMoney(n, currency = "USD") {
  return (Number(n) || 0).toLocaleString("en-US", {
    style: "currency", currency: (currency || "USD").toUpperCase(),
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateShort(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({ status, size = "sm" }) {
  const s = getStatus(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium ${
      size === "lg" ? "text-sm px-3 py-1" : "text-xs"
    } ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function applyDateFilter(qb, key) {
  if (key === "all") return qb;
  const now = new Date();
  if (key === "today") {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return qb.gte("created_at", start.toISOString());
  }
  if (key === "7d")  return qb.gte("created_at", new Date(now - 7  * 86400000).toISOString());
  if (key === "30d") return qb.gte("created_at", new Date(now - 30 * 86400000).toISOString());
  return qb;
}

function Initials({ name, email }) {
  const src = name || email || "?";
  const init = src.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
      {init}
    </div>
  );
}

function AddressBlock({ address }) {
  if (!address) return <span className="text-slate-400">No address</span>;
  const a = address;
  return (
    <div className="text-sm text-slate-600 space-y-0.5">
      {a.line1 && <div>{a.line1}</div>}
      {a.line2 && <div>{a.line2}</div>}
      <div>{[a.city, a.state, a.postal_code].filter(Boolean).join(", ")}</div>
      {a.country && a.country !== "US" && <div>{a.country}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Order Detail Drawer
═══════════════════════════════════════════════════ */
function OrderDetailDrawer({ open, onClose, orderId, onStatusChange }) {
  const [order,   setOrder]   = useState(null);
  const [items,   setItems]   = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [note,    setNote]    = useState("");
  const [saving,  setSaving]  = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [activeTab, setActiveTab] = useState("details"); // details | timeline

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const [{ data: o }, { data: its }, { data: hist }] = await Promise.all([
        supabase.from("orders")
          .select("id, created_at, status, name, email, phone, address_json, amount_subtotal, amount_shipping, amount_taxes, amount_total, currency, payment_intent_id, promo_code, shipping_method")
          .eq("id", orderId).maybeSingle(),
        supabase.from("order_items")
          .select("id, producto_id, nombre, marca, codigo, qty, precio_unit, taxable")
          .eq("order_id", orderId).order("id"),
        supabase.from("order_status_history")
          .select("id, old_status, new_status, note, changed_by, changed_at")
          .eq("order_id", orderId).order("changed_at"),
      ]);
      setOrder(o || null);
      setItems(its || []);
      setHistory(hist || []);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (open && orderId) { setActiveTab("details"); load(); }
  }, [open, orderId, load]);

  async function changeStatus(next) {
    if (!orderId || !order) return;
    const prev = order.status;
    setOrder((o) => ({ ...o, status: next }));
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", orderId).neq("status", next);
    if (error) { setOrder((o) => ({ ...o, status: prev })); alert(error.message); return; }
    const { data: hist } = await supabase.from("order_status_history")
      .select("id, old_status, new_status, note, changed_by, changed_at").eq("order_id", orderId).order("changed_at");
    setHistory(hist || []);
    onStatusChange?.(orderId, next);
  }

  async function addNote() {
    if (!note.trim() || !orderId) return;
    const text = note.trim();
    setNote("");
    setSaving(true);
    const userRes = await supabase.auth.getUser().catch(() => null);
    const { error } = await supabase.from("order_status_history").insert({
      order_id: orderId, old_status: null, new_status: order?.status ?? null,
      note: text, changed_by: userRes?.data?.user?.id ?? null,
    });
    if (error) { alert(error.message); setSaving(false); return; }
    const { data: hist } = await supabase.from("order_status_history")
      .select("id, old_status, new_status, note, changed_by, changed_at").eq("order_id", orderId).order("changed_at");
    setHistory(hist || []);
    setSaving(false);
  }

  function copyPI() {
    if (!order?.payment_intent_id) return;
    navigator.clipboard.writeText(order.payment_intent_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!open || !orderId) return null;

  const pi = order?.payment_intent_id || "";
  const stripeLink = pi ? `https://dashboard.stripe.com/payments/${pi}` : null;
  const s = order ? getStatus(order.status) : null;
  const itemsTotal = items.reduce((acc, it) => acc + (it.qty || 0) * (it.precio_unit || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">

        {/* ── Header ── */}
        <div className={`shrink-0 px-6 py-4 flex items-center justify-between ${
          s ? "" : "bg-slate-800"
        } bg-gradient-to-r from-slate-800 to-slate-700 text-white`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
              <ShoppingBag size={20} />
            </div>
            <div>
              <div className="text-xs text-slate-300">Order</div>
              <div className="font-bold text-lg">#{orderId}</div>
            </div>
            {order && <StatusBadge status={order.status} size="lg" />}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-all" title="Refresh">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={onClose} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-all">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="shrink-0 flex border-b bg-slate-50">
          {[
            { key: "details",  label: "Details",  Icon: Package     },
            { key: "timeline", label: "Timeline", Icon: Clock       },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === key
                  ? "border-blue-600 text-blue-600 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && !order ? (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
              <RefreshCw size={16} className="animate-spin" /> Loading…
            </div>
          ) : order ? (
            <>
              {/* ──────── DETAILS TAB ──────── */}
              {activeTab === "details" && (
                <div className="p-5 space-y-4">

                  {/* Customer + Shipping */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Customer */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                        <User size={12} /> Customer
                      </div>
                      <div className="flex items-center gap-3">
                        <Initials name={order.name} email={order.email} />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{order.name || "—"}</div>
                          <div className="text-xs text-slate-500 truncate">{order.email || "—"}</div>
                          {order.phone && <div className="text-xs text-slate-500">{order.phone}</div>}
                        </div>
                      </div>
                    </div>

                    {/* Shipping */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                        <MapPin size={12} /> Shipping address
                      </div>
                      <AddressBlock address={order.address_json} />
                      {order.shipping_method && (
                        <div className="mt-2 text-xs text-blue-600 font-medium flex items-center gap-1">
                          <Truck size={10} /> {order.shipping_method}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status + Financials */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        <CreditCard size={12} /> Payment & Status
                      </div>
                      <div className="text-xs text-slate-400">{fmtDate(order.created_at)}</div>
                    </div>

                    {/* Quick status change */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {STATUSES.map((st) => (
                        <button
                          key={st.key}
                          onClick={() => changeStatus(st.key)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                            order.status === st.key
                              ? st.color + " ring-2 ring-offset-1 ring-current"
                              : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                          }`}
                        >
                          {order.status === st.key && <Check size={10} />}
                          {st.label}
                        </button>
                      ))}
                    </div>

                    {/* Amounts grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Subtotal",  val: order.amount_subtotal },
                        { label: "Shipping",  val: order.amount_shipping },
                        { label: "Taxes",     val: order.amount_taxes    },
                        { label: "Total",     val: order.amount_total,  bold: true },
                      ].map(({ label, val, bold }) => (
                        <div key={label} className={`rounded-xl p-3 ${bold ? "bg-slate-800 text-white" : "bg-slate-50 border border-slate-100"}`}>
                          <div className={`text-xs mb-0.5 ${bold ? "text-slate-300" : "text-slate-500"}`}>{label}</div>
                          <div className={`font-semibold ${bold ? "text-white text-base" : "text-slate-800"}`}>{fmtMoney(val, order.currency)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Promo code */}
                    {order.promo_code && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <Tag size={12} /> Promo: <span className="font-mono font-semibold">{order.promo_code}</span>
                      </div>
                    )}

                    {/* Payment Intent */}
                    {pi && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg font-mono truncate max-w-[200px]">{pi}</code>
                        <button onClick={copyPI} className="flex items-center gap-1 text-xs border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 transition-all">
                          {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                          {copied ? "Copied!" : "Copy"}
                        </button>
                        {stripeLink && (
                          <a href={stripeLink} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 transition-all text-blue-600">
                            <ExternalLink size={11} /> Stripe
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Items */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
                      <ShoppingBag size={14} className="text-slate-400" />
                      <span className="font-semibold text-sm">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50/50 border-b">
                          <tr className="text-left">
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Product</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Code</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Qty</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Unit</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Line</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, i) => (
                            <tr key={it.id} className={i % 2 === 1 ? "bg-slate-50/50" : ""}>
                              <td className="px-4 py-2.5">
                                <div className="font-medium text-slate-800">{it.nombre || it.producto_id}</div>
                                {it.marca && <div className="text-xs text-slate-400">{it.marca}</div>}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-slate-500 font-mono">{it.codigo || "—"}</td>
                              <td className="px-3 py-2.5 text-right font-semibold">{it.qty}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{fmtMoney(it.precio_unit, order.currency)}</td>
                              <td className="px-3 py-2.5 text-right font-semibold">{fmtMoney((it.qty || 0) * (it.precio_unit || 0), order.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-800 text-white">
                          <tr>
                            <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-slate-300 text-right">Items total</td>
                            <td className="px-3 py-2.5 text-right font-bold">{fmtMoney(itemsTotal, order.currency)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Add note */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                      <MessageSquare size={12} /> Add note
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && addNote()}
                        placeholder="Write a note about this order…"
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <button
                        onClick={addNote}
                        disabled={saving || !note.trim()}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ──────── TIMELINE TAB ──────── */}
              {activeTab === "timeline" && (
                <div className="p-5">
                  {history.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Clock size={24} className="mx-auto mb-2 opacity-40" />
                      No events yet.
                    </div>
                  ) : (
                    <ol className="relative">
                      {history.map((h, i) => {
                        const st = h.new_status ? getStatus(h.new_status) : null;
                        const isLast = i === history.length - 1;
                        return (
                          <li key={h.id} className="flex gap-4 pb-6 relative">
                            {/* Vertical line */}
                            {!isLast && (
                              <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-100" />
                            )}
                            {/* Dot */}
                            <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              st ? `${st.color} border-current` : "bg-slate-100 border-slate-200"
                            }`}>
                              {st ? <st.Icon size={14} /> : <MessageSquare size={14} className="text-slate-400" />}
                            </div>
                            {/* Content */}
                            <div className="flex-1 pt-1.5">
                              <div className="text-xs text-slate-400 mb-1">{fmtDate(h.changed_at)}</div>
                              {(h.old_status || h.new_status) && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {h.old_status && <StatusBadge status={h.old_status} />}
                                  {h.old_status && h.new_status && (
                                    <ChevronRight size={12} className="text-slate-400" />
                                  )}
                                  {h.new_status && <StatusBadge status={h.new_status} />}
                                </div>
                              )}
                              {h.note && (
                                <div className="mt-1.5 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                                  {h.note}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  {/* Quick note from timeline tab */}
                  <div className="mt-4 flex gap-2">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && addNote()}
                      placeholder="Add a note…"
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <button onClick={addNote} disabled={saving || !note.trim()}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition-all disabled:opacity-50">
                      {saving ? "…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <AlertCircle size={24} className="mb-2 opacity-40" />
                Order not found.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Orders main page
═══════════════════════════════════════════════════ */
export default function Orders() {
  const location = useLocation();
  const [rows,        setRows]        = useState([]);
  const [page,        setPage]        = useState(1);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [q,           setQ]           = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter,  setDateFilter]  = useState("today");
  const [expanded,    setExpanded]    = useState({});
  const [detailOpen,  setDetailOpen]  = useState(false);
  const [detailId,    setDetailId]    = useState(null);

  const pageTotal = useMemo(() => rows.reduce((s, r) => s + Number(r.amount_total || 0), 0), [rows]);
  const pages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)), [total]);

  const SELECTS = "id, payment_intent_id, amount_subtotal, amount_shipping, amount_taxes, amount_total, currency, status, name, email, phone, address_json, created_at";

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
      if (q.trim()) {
        const term = q.trim();
        const mk = () => {
          let b = supabase.from("orders").select(SELECTS);
          if (statusFilter !== "all") b = b.eq("status", statusFilter);
          return applyDateFilter(b, dateFilter).order("created_at", { ascending: false }).limit(PAGE_SIZE);
        };
        const [r1, r2, r3] = await Promise.all([
          mk().ilike("email", `%${term}%`),
          mk().ilike("name",  `%${term}%`),
          mk().ilike("payment_intent_id", `%${term}%`),
        ]);
        const merge = new Map();
        [...(r1.data||[]), ...(r2.data||[]), ...(r3.data||[])].forEach((r) => merge.set(r.id, r));
        setRows(Array.from(merge.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, PAGE_SIZE));
        return;
      }
      const from = (page - 1) * PAGE_SIZE;
      let qb = supabase.from("orders").select(SELECTS).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (statusFilter !== "all") qb = qb.eq("status", statusFilter);
      qb = applyDateFilter(qb, dateFilter);
      const { data, error } = await qb;
      if (error) throw error;
      setRows(data || []);
    } finally {
      setLoading(false);
    }
  }, [page, q, statusFilter, dateFilter]);

  useEffect(() => { fetchCount(); }, [statusFilter, q, dateFilter, fetchCount]);
  useEffect(() => { fetchPage();  }, [page, q, statusFilter, dateFilter, fetchPage]);

  // Realtime
  useEffect(() => {
    const channel = supabase.channel("admin-orders-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        setTimeout(() => { fetchCount(); fetchPage(); }, 150);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchCount, fetchPage]);

  async function toggleExpand(orderId) {
    if (expanded[orderId]) {
      setExpanded((prev) => { const c = { ...prev }; delete c[orderId]; return c; });
      return;
    }
    const { data, error } = await supabase.from("order_items")
      .select("id, nombre, qty, precio_unit, marca, codigo").eq("order_id", orderId).order("id");
    setExpanded((prev) => ({ ...prev, [orderId]: error ? "error" : data || [] }));
  }

  async function updateStatus(orderId, next) {
    const prev = rows;
    setRows((list) => list.map((r) => (r.id === orderId ? { ...r, status: next } : r)));
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", orderId).neq("status", next);
    if (error) { setRows(prev); alert(error.message); }
  }

  function openDetail(id) {
    setDetailId(id);
    setDetailOpen(true);
  }

  useEffect(() => {
    const orderId = new URLSearchParams(location.search).get("order");
    if (orderId) openDetail(orderId);
  }, [location.search]);

  function exportCSV() {
    const header = ["id","created_at","name","email","phone","status","amount_total","currency","payment_intent_id"];
    const lines = [header.join(","), ...rows.map((r) => [
      r.id, r.created_at, JSON.stringify(r.name||""), r.email||"", r.phone||"",
      r.status||"", r.amount_total||0, (r.currency||"USD").toUpperCase(), r.payment_intent_id||"",
    ].join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "orders.csv" });
    a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mt-6 px-3 lg:px-6 pb-10 space-y-5">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-slate-800 to-blue-900 text-white rounded-2xl px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center">
            <ShoppingBag size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Orders</h1>
            <p className="text-blue-200 text-xs mt-0.5">
              {total} order{total !== 1 ? "s" : ""} · {fmtMoney(pageTotal)} this page
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { fetchCount(); fetchPage(); }}
            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all" title="Refresh">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl px-3 py-2 text-sm font-semibold transition-all">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
        <div className="flex flex-col sm:flex-row gap-3">

          {/* Date tabs */}
          <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden shrink-0">
            {DATE_FILTERS.map((d) => (
              <button key={d.key} onClick={() => { setDateFilter(d.key); setPage(1); }}
                className={`px-3 py-2 text-sm font-medium transition-all ${
                  dateFilter === d.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}>
                {d.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Search by email, name or payment ID…"
              value={q}
              onChange={(e) => { setPage(1); setQ(e.target.value); }}
            />
          </div>

          {/* Status filter */}
          <div className="relative shrink-0">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
              className="pl-8 pr-8 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none">
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Clear */}
          {(q || statusFilter !== "all" || dateFilter !== "today") && (
            <button onClick={() => { setQ(""); setStatusFilter("all"); setDateFilter("today"); setPage(1); }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-all whitespace-nowrap">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Order</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Date</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const isSelected = r.id === detailId && detailOpen;
                const items = expanded[r.id];

                return (
                  <Fragment key={r.id}>
                    <tr className={`hover:bg-slate-50/70 transition-all cursor-pointer ${
                      isSelected ? "bg-blue-50/50 ring-1 ring-inset ring-blue-200" : ""
                    }`}
                      onClick={() => openDetail(r.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-slate-400">#{r.id}</div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800">{r.name || "—"}</div>
                        <div className="text-xs text-slate-400">{r.email || "—"}</div>
                        {r.phone && <div className="text-xs text-slate-400">{r.phone}</div>}
                      </td>

                      <td className="px-3 py-3 hidden lg:table-cell">
                        <div className="text-xs text-slate-500">{fmtDateShort(r.created_at)}</div>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold text-slate-800">{fmtMoney(r.amount_total, r.currency)}</div>
                      </td>

                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-1.5">
                          <StatusBadge status={r.status} />
                          <select
                            value={r.status ?? "pending"}
                            onChange={(e) => updateStatus(r.id, e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                          >
                            {STATUSES.map((s) => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => toggleExpand(r.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-600 transition-all"
                          >
                            <ChevronDown size={12} className={`transition-transform ${items ? "rotate-180" : ""}`} />
                            Items
                          </button>
                          <button
                            onClick={() => openDetail(r.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-800 text-white hover:bg-slate-900 text-xs transition-all"
                          >
                            Detail
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline items expand */}
                    {items && items !== "error" && (
                      <tr className="bg-blue-50/30">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 border-b">
                                <tr className="text-left">
                                  <th className="px-3 py-2 text-slate-500 font-semibold">Product</th>
                                  <th className="px-3 py-2 text-slate-500 font-semibold">Code</th>
                                  <th className="px-3 py-2 text-slate-500 font-semibold text-right">Qty</th>
                                  <th className="px-3 py-2 text-slate-500 font-semibold text-right">Price</th>
                                  <th className="px-3 py-2 text-slate-500 font-semibold text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {items.map((it) => (
                                  <tr key={it.id}>
                                    <td className="px-3 py-2">
                                      <div className="font-medium">{it.nombre || it.producto_id}</div>
                                      {it.marca && <div className="text-slate-400">{it.marca}</div>}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-400">{it.codigo || "—"}</td>
                                    <td className="px-3 py-2 text-right font-semibold">{it.qty}</td>
                                    <td className="px-3 py-2 text-right">{fmtMoney(it.precio_unit, r.currency)}</td>
                                    <td className="px-3 py-2 text-right font-semibold">{fmtMoney((it.qty||0)*(it.precio_unit||0), r.currency)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600">
                            <span>Subtotal: <b>{fmtMoney(r.amount_subtotal, r.currency)}</b></span>
                            <span>Shipping: <b>{fmtMoney(r.amount_shipping, r.currency)}</b></span>
                            <span>Taxes: <b>{fmtMoney(r.amount_taxes, r.currency)}</b></span>
                            <span>Total: <b className="text-slate-900">{fmtMoney(r.amount_total, r.currency)}</b></span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {items === "error" && (
                      <tr className="bg-red-50">
                        <td colSpan={6} className="px-4 py-2 text-xs text-red-600">Could not load items for this order.</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {!rows.length && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                    <ShoppingBag size={24} className="mx-auto mb-2 opacity-30" />
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{pages}</span> · {total} total
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm hover:bg-white disabled:opacity-40 transition-all">
              ← Prev
            </button>
            <button onClick={() => setPage((p) => p + 1)} disabled={rows.length < PAGE_SIZE}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm hover:bg-white disabled:opacity-40 transition-all">
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Drawer */}
      <OrderDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        orderId={detailId}
        onStatusChange={(id, next) => setRows((list) => list.map((r) => r.id === id ? { ...r, status: next } : r))}
      />
    </div>
  );
}
