// src/storefront/AccountPanel.jsx
// Panel de cuenta del usuario: mis pedidos, rastreo, perfil, logout
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/* ─── helpers ─── */
function fmtDate(s) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}
function fmtMoney(n) {
  return Number(n || 0).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  });
}

/* ─── Status badge ─── */
function StatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "delivered"
      ? "bg-teal-50 text-teal-700 border-teal-200"
      : s === "shipped"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : s === "paid" || s === "processing" || s === "preparing" || s === "ready"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "canceled" || s === "cancelled" || s === "refunded"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls} capitalize`}
    >
      {status || "pending"}
    </span>
  );
}

/* ─── Order status timeline icons ─── */
const STATUS_STEPS = ["pending", "paid", "processing", "preparing", "shipped", "delivered"];
function OrderTimeline({ status }) {
  const s = String(status || "").toLowerCase();
  const idx = STATUS_STEPS.indexOf(s);
  if (idx < 0) return null;
  return (
    <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
      {STATUS_STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-1 flex-shrink-0">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
              i < idx
                ? "bg-emerald-500 border-emerald-500 text-white"
                : i === idx
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-gray-100 border-gray-300 text-gray-400"
            }`}
          >
            {i < idx ? "✓" : i + 1}
          </div>
          {i < STATUS_STEPS.length - 1 && (
            <div className={`w-4 h-0.5 ${i < idx ? "bg-emerald-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ─── */
export default function AccountPanel({ open, onClose, user }) {
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState({});
  const [trackInput, setTrackInput] = useState("");
  const [trackResult, setTrackResult] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackErr, setTrackErr] = useState("");
  const [copied, setCopied] = useState(false);

  /* close on Esc */
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* load orders when panel opens */
  useEffect(() => {
    if (open && user) {
      loadOrders();
      setTrackResult(null);
      setTrackErr("");
      setTrackInput("");
    }
  }, [open, user]);

  async function loadOrders() {
    if (!user) return;
    setLoadingOrders(true);
    try {
      // Try by user_id first, fallback by email
      let q = supabase
        .from("orders")
        .select("id, created_at, status, amount_total, currency, tracking_number, name, email")
        .order("created_at", { ascending: false })
        .limit(30);

      if (user.id) q = q.eq("user_id", user.id);
      else if (user.email) q = q.eq("email", user.email);

      const { data, error } = await q;
      if (error && user.email) {
        // fallback by email
        const { data: d2 } = await supabase
          .from("orders")
          .select("id, created_at, status, amount_total, currency, tracking_number, name, email")
          .eq("email", user.email)
          .order("created_at", { ascending: false })
          .limit(30);
        setOrders(d2 || []);
      } else {
        setOrders(data || []);
      }
    } catch {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }

  async function loadOrderItems(orderId) {
    if (orderItems[orderId] !== undefined) return;
    setOrderItems((prev) => ({ ...prev, [orderId]: null })); // null = loading
    const { data } = await supabase
      .from("order_items")
      .select("nombre, marca, qty, precio_unit")
      .eq("order_id", orderId);
    setOrderItems((prev) => ({ ...prev, [orderId]: data || [] }));
  }

  function toggleOrder(id) {
    if (expandedOrder === id) {
      setExpandedOrder(null);
    } else {
      setExpandedOrder(id);
      loadOrderItems(id);
    }
  }

  async function handleTrack() {
    const raw = trackInput.trim();
    if (!raw) return;
    setTrackLoading(true);
    setTrackErr("");
    setTrackResult(null);
    try {
      const numId = Number(raw);
      let found = null;
      // Try order ID
      if (Number.isFinite(numId) && numId > 0) {
        const { data } = await supabase
          .from("orders")
          .select("id, status, tracking_number, amount_total, created_at, name")
          .eq("id", numId)
          .maybeSingle();
        found = data;
      }
      // Try tracking number
      if (!found) {
        const { data } = await supabase
          .from("orders")
          .select("id, status, tracking_number, amount_total, created_at, name")
          .eq("tracking_number", raw)
          .maybeSingle();
        found = data;
      }
      if (!found) {
        setTrackErr("Order not found. Check the order number or tracking number and try again.");
      } else {
        setTrackResult(found);
      }
    } catch {
      setTrackErr("Could not look up the order. Please try again.");
    } finally {
      setTrackLoading(false);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!open) return null;

  const displayName =
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Customer";
  const initial = displayName.charAt(0).toUpperCase();

  /* ─── TABS config ─── */
  const TABS = [
    {
      key: "orders",
      label: "Orders",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 3a2 2 0 110 4 2 2 0 010-4zm4 12H8v-1c0-2.67 2.67-4 4-4s4 1.33 4 4v1z"/>
        </svg>
      ),
    },
    {
      key: "track",
      label: "Track",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="currentColor" d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zm-.5 1.5l1.96 2.5H17V9.5h2.5zM6 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2.22-3c-.55-.61-1.33-1-2.22-1s-1.67.39-2.22 1H3V6h12v9H8.22zm9.78 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
        </svg>
      ),
    },
    {
      key: "profile",
      label: "Profile",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col">

        {/* ─── Header ─── */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 pt-5 pb-4 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-bold border border-white/30">
                {initial}
              </div>
              <div>
                <div className="font-semibold leading-tight">{displayName}</div>
                <div className="text-xs text-white/70 mt-0.5 truncate max-w-[180px]">{user?.email}</div>
              </div>
            </div>
            <button
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors mt-0.5"
              onClick={onClose}
            >
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>

          {/* quick stats */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-xl px-3 py-2 border border-white/20">
              <div className="text-lg font-bold">{orders.length}</div>
              <div className="text-[11px] text-white/70">Total orders</div>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 border border-white/20">
              <div className="text-lg font-bold">
                {orders.filter((o) => ["shipped", "processing", "preparing", "paid", "ready"].includes(String(o.status).toLowerCase())).length}
              </div>
              <div className="text-[11px] text-white/70">In progress</div>
            </div>
          </div>
        </div>

        {/* ─── Tabs ─── */}
        <div className="flex border-b bg-white">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[11px] font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── Content ─── */}
        <div className="flex-1 overflow-y-auto">

          {/* MY ORDERS */}
          {tab === "orders" && (
            <div className="p-3 space-y-2">
              {loadingOrders ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <div className="text-sm text-gray-400">Loading orders…</div>
                </div>
              ) : orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                    <svg width="32" height="32" viewBox="0 0 24 24" className="text-gray-400">
                      <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                    </svg>
                  </div>
                  <div className="font-medium text-gray-700">No orders yet</div>
                  <div className="text-xs text-gray-400 mt-1">Your purchases will appear here.</div>
                </div>
              ) : (
                orders.map((o) => {
                  const isExpanded = expandedOrder === o.id;
                  const items = orderItems[o.id];
                  return (
                    <div key={o.id} className="border rounded-xl overflow-hidden shadow-sm">
                      <button
                        className="w-full p-3 text-left hover:bg-gray-50 transition-colors"
                        onClick={() => toggleOrder(o.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs text-gray-500 font-medium">#{o.id}</span>
                              <StatusBadge status={o.status} />
                              {o.tracking_number && (
                                <span className="text-[10px] bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded-md border border-sky-200 font-medium">
                                  Tracked
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">{fmtDate(o.created_at)}</div>
                          </div>
                          <div className="text-right flex-shrink-0 flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-800">{fmtMoney(o.amount_total)}</span>
                            <svg
                              width="16" height="16" viewBox="0 0 24 24"
                              className={`text-gray-300 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                            >
                              <path fill="currentColor" d="M7 10l5 5 5-5z" />
                            </svg>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t bg-gray-50 p-3 space-y-3">
                          {/* items */}
                          {items === null ? (
                            <div className="text-xs text-gray-400 text-center py-2">Loading…</div>
                          ) : items.length === 0 ? (
                            <div className="text-xs text-gray-400 text-center py-2">No items found.</div>
                          ) : (
                            <div className="space-y-1.5">
                              {items.map((it, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                  <div className="min-w-0 flex-1">
                                    <span className="text-gray-700 font-medium">{it.nombre}</span>
                                    {it.marca && <span className="text-gray-400 ml-1">· {it.marca}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                    <span className="text-gray-500">×{it.qty}</span>
                                    <span className="font-semibold text-gray-700">{fmtMoney(it.precio_unit * it.qty)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* timeline */}
                          <OrderTimeline status={o.status} />

                          {/* tracking number */}
                          {o.tracking_number ? (
                            <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                              <div className="text-[10px] text-blue-500 font-semibold mb-1 uppercase tracking-wide">
                                Tracking Number
                              </div>
                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono text-gray-700 flex-1 break-all">
                                  {o.tracking_number}
                                </code>
                                <button
                                  className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                                  onClick={() => copyToClipboard(o.tracking_number)}
                                >
                                  {copied ? "✓" : "Copy"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 flex items-center gap-1.5">
                              <svg width="12" height="12" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                              </svg>
                              No tracking number yet — check back soon.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TRACK ORDER */}
          {tab === "track" && (
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Track your order</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Enter your order number or the carrier tracking number to check its current status.
                </p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    placeholder="Order # or tracking number…"
                    value={trackInput}
                    onChange={(e) => setTrackInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleTrack()}
                  />
                  <button
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    onClick={handleTrack}
                    disabled={trackLoading || !trackInput.trim()}
                  >
                    {trackLoading ? (
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : "Track"}
                  </button>
                </div>
              </div>

              {trackErr && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-start gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" className="flex-shrink-0 mt-0.5">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  {trackErr}
                </div>
              )}

              {trackResult && (
                <div className="border rounded-xl overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm font-semibold text-gray-700">Order #{trackResult.id}</span>
                      {trackResult.name && (
                        <div className="text-xs text-gray-400 mt-0.5">{trackResult.name}</div>
                      )}
                    </div>
                    <StatusBadge status={trackResult.status} />
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Order date</div>
                        <div className="font-medium">{fmtDate(trackResult.created_at)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Total</div>
                        <div className="font-semibold text-gray-800">{fmtMoney(trackResult.amount_total)}</div>
                      </div>
                    </div>

                    <OrderTimeline status={trackResult.status} />

                    {trackResult.tracking_number ? (
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <div className="text-[10px] text-blue-500 font-semibold mb-1 uppercase tracking-wide">
                          Carrier Tracking
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-gray-800 flex-1 break-all">
                            {trackResult.tracking_number}
                          </code>
                          <button
                            className="text-xs text-blue-600 font-semibold hover:text-blue-800 border border-blue-200 rounded-lg px-2 py-1"
                            onClick={() => copyToClipboard(trackResult.tracking_number)}
                          >
                            {copied ? "✓ Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-700">
                        No tracking number assigned yet. Your order is being processed — you'll receive an email with tracking info.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROFILE */}
          {tab === "profile" && (
            <div className="p-4 space-y-5">
              {/* Avatar + name */}
              <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                  {initial}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{displayName}</div>
                  <div className="text-sm text-gray-500 mt-0.5 break-all">{user?.email}</div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Orders", value: orders.length },
                  {
                    label: "Delivered",
                    value: orders.filter((o) => String(o.status).toLowerCase() === "delivered").length,
                  },
                  {
                    label: "Pending",
                    value: orders.filter((o) =>
                      ["pending", "paid", "processing", "preparing", "ready", "shipped"].includes(
                        String(o.status).toLowerCase()
                      )
                    ).length,
                  },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center border">
                    <div className="text-xl font-bold text-gray-800">{s.value}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Account info */}
              <div className="space-y-0 border rounded-xl overflow-hidden">
                {[
                  { label: "Email", value: user?.email },
                  { label: "Member since", value: fmtDate(user?.created_at) },
                  {
                    label: "Account ID",
                    value: user?.id ? user.id.slice(0, 8) + "…" : "—",
                  },
                ].map((row, i) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between px-4 py-3 text-sm ${
                      i > 0 ? "border-t" : ""
                    }`}
                  >
                    <span className="text-gray-500">{row.label}</span>
                    <span className="text-gray-800 font-medium text-right max-w-[180px] truncate">
                      {row.value || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer: sign out ─── */}
        <div className="border-t p-3 bg-white">
          <button
            className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            onClick={async () => {
              await supabase.auth.signOut();
              onClose?.();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}
