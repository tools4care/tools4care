// src/online/OnlineDashboard.jsx
import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

const fmtMoney = (n) =>
  (Number(n) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "all", label: "Todo" },
];

const STATUS_COLORS = {
  pending: "bg-amber-400",
  paid: "bg-emerald-500",
  processing: "bg-yellow-400",
  preparing: "bg-sky-400",
  ready: "bg-indigo-400",
  shipped: "bg-blue-500",
  delivered: "bg-teal-500",
  canceled: "bg-rose-400",
  cancelled: "bg-rose-400",
  refunded: "bg-slate-400",
};

const STATUS_BADGE = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  processing: "bg-yellow-50 text-yellow-700 border-yellow-200",
  preparing: "bg-sky-50 text-sky-700 border-sky-200",
  ready: "bg-indigo-50 text-indigo-700 border-indigo-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-teal-50 text-teal-700 border-teal-200",
  canceled: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  refunded: "bg-slate-50 text-slate-700 border-slate-200",
};

function StatCard({ label, value, sub, icon, color = "blue" }) {
  const colors = {
    blue: "from-blue-500 to-indigo-600",
    green: "from-emerald-500 to-teal-600",
    amber: "from-amber-400 to-orange-500",
    purple: "from-purple-500 to-pink-500",
  };
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center text-white shadow-sm`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-extrabold text-gray-900 tracking-tight">{value}</div>
      <div className="text-sm font-medium text-gray-600 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-8 bg-gray-100 rounded-xl w-1/3" />
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function getPeriodStart(key) {
  if (key === "all") return null;
  const now = new Date();
  if (key === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (key === "7d") return new Date(now.getTime() - 7 * 86400000);
  if (key === "30d") return new Date(now.getTime() - 30 * 86400000);
  return null;
}

export default function OnlineDashboard() {
  const [period, setPeriod] = useState("today");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [recent, setRecent] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadStats = useCallback(async (p = period) => {
    setLoading(true);
    try {
      const start = getPeriodStart(p);

      let qb = supabase
        .from("orders")
        .select("id, created_at, status, amount_total, name, email, currency");
      if (start) qb = qb.gte("created_at", start.toISOString());

      const { data, error } = await qb.order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;

      setOrders(data || []);
      setRecent((data || []).slice(0, 8));
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadStats(period);
  }, [loadStats]);

  const paidOrders = useMemo(
    () =>
      orders.filter((o) =>
        ["paid", "succeeded", "delivered", "shipped", "processing", "preparing", "ready"].includes(
          String(o.status || "").toLowerCase()
        )
      ),
    [orders]
  );

  const revenue = useMemo(
    () => paidOrders.reduce((s, o) => s + Number(o.amount_total || 0), 0),
    [paidOrders]
  );

  const avgOrder = useMemo(
    () => (paidOrders.length ? revenue / paidOrders.length : 0),
    [revenue, paidOrders]
  );

  const statusBreakdown = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const s = String(o.status || "pending").toLowerCase();
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [orders]);

  const lastUpdateLabel = useMemo(
    () => (lastUpdate ? lastUpdate.toLocaleTimeString() : "—"),
    [lastUpdate]
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Resumen</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Actualizado a las <b>{lastUpdateLabel}</b>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border bg-white shadow-sm overflow-hidden">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    period === p.key
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => loadStats(period)}
              disabled={loading}
              className="px-3 py-2 rounded-xl border bg-white shadow-sm text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".3"/>
                  <path d="M21 12a9 9 0 00-9-9"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {loading && !orders.length ? (
          <Skeleton />
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Ingresos"
                value={fmtMoney(revenue)}
                sub="Pedidos confirmados"
                color="green"
                icon={
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  </svg>
                }
              />
              <StatCard
                label="Pedidos"
                value={orders.length}
                sub={`${paidOrders.length} confirmados`}
                color="blue"
                icon={
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                    <rect x="9" y="3" width="6" height="4" rx="1" />
                    <path d="M9 12h6M9 16h4" />
                  </svg>
                }
              />
              <StatCard
                label="Ticket promedio"
                value={fmtMoney(avgOrder)}
                sub="Por pedido confirmado"
                color="purple"
                icon={
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                }
              />
            </div>

            {/* Status breakdown + Recent orders */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Status breakdown */}
              <div className="lg:col-span-2 bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="font-semibold text-gray-900">Por estado</div>
                  <div className="text-xs text-gray-400">{orders.length} total</div>
                </div>
                {statusBreakdown.length === 0 ? (
                  <div className="text-sm text-gray-400">Sin datos</div>
                ) : (
                  <div className="space-y-3">
                    {statusBreakdown.map(([status, count]) => {
                      const pct = orders.length ? Math.round((count / orders.length) * 100) : 0;
                      const barColor = STATUS_COLORS[status] || "bg-gray-300";
                      const badge = STATUS_BADGE[status] || "bg-gray-50 text-gray-700 border-gray-200";
                      return (
                        <div key={status}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs border font-medium ${badge}`}>
                              {status}
                            </span>
                            <span className="text-sm font-semibold text-gray-700">
                              {count}
                              <span className="text-xs text-gray-400 font-normal ml-1">({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${barColor} transition-all duration-500`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent orders */}
              <div className="lg:col-span-3 bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <div className="font-semibold text-gray-900">Pedidos recientes</div>
                  <Link
                    to="/online/orders"
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Ver todos →
                  </Link>
                </div>
                {recent.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-gray-400 text-center">
                    Sin pedidos en este período
                  </div>
                ) : (
                  <div className="divide-y">
                    {recent.map((o) => {
                      const badge =
                        STATUS_BADGE[String(o.status || "pending").toLowerCase()] ||
                        "bg-gray-50 text-gray-700 border-gray-200";
                      return (
                        <div
                          key={o.id}
                          className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-gray-900">
                              #{o.id}{" "}
                              <span className="text-gray-500 font-normal">
                                {o.name || o.email || "—"}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {new Date(o.created_at).toLocaleDateString("es-MX", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs border font-medium ${badge}`}
                            >
                              {o.status ?? "pending"}
                            </span>
                            <span className="text-sm font-semibold text-gray-900">
                              {fmtMoney(o.amount_total)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="px-5 py-3 border-t bg-gray-50/50">
                  <Link
                    to="/online/orders"
                    className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                      <rect x="9" y="3" width="6" height="4" rx="1" />
                    </svg>
                    Gestionar pedidos
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
