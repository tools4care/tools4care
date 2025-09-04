// src/online/OnlineDashboard.jsx
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

const fmtMoney = (n) =>
  (Number(n) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function OnlineDashboard() {
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const [todaySales, setTodaySales] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);

  async function loadStats() {
    setLoading(true);
    try {
      // inicio del día (UTC ISO)
      const now = new Date();
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0, 0, 0, 0
      );

      // Órdenes pagadas hoy
      const { data, error } = await supabase
        .from("orders")
        .select("amount_total, created_at, status")
        .gte("created_at", start.toISOString())
        .in("status", ["paid", "succeeded"]); // por si usas ambos estados

      if (error) throw error;

      const paid = (data || []).filter((o) =>
        ["paid", "succeeded"].includes(String(o.status || "").toLowerCase())
      );

      const total = paid.reduce((s, o) => s + Number(o.amount_total || 0), 0);
      setTodaySales(total);
      setOrdersCount(paid.length);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
      setTodaySales(0);
      setOrdersCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  const lastUpdateLabel = useMemo(
    () => (lastUpdate ? lastUpdate.toLocaleString() : "—"),
    [lastUpdate]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                🛒 Online Store
              </h1>
              <p className="text-xs text-gray-600 mt-1">
                Panel de administración · resumen de ventas y órdenes.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60"
                onClick={loadStats}
                disabled={loading}
              >
                {loading ? "Actualizando…" : "Actualizar"}
              </button>

              <Link
                to="/online/orders"
                className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
              >
                Ir a Pedidos
              </Link>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Última actualización: <b>{lastUpdateLabel}</b>
          </div>
        </div>

        {/* Stats cards (misma estética que Inventario) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-lg p-5">
            <div className="text-sm text-gray-500">Ventas de hoy</div>
            <div className="mt-2 text-3xl font-extrabold text-gray-900">
              {fmtMoney(todaySales)}
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Incluye órdenes con estado <code className="bg-gray-100 px-1 rounded">paid</code> /{" "}
              <code className="bg-gray-100 px-1 rounded">succeeded</code>.
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-5">
            <div className="text-sm text-gray-500">Órdenes registradas hoy</div>
            <div className="mt-2 text-3xl font-extrabold text-gray-900">{ordersCount}</div>
            <div className="mt-3 text-xs text-gray-500">
              Solo se cuentan órdenes pagadas de hoy.
            </div>
          </div>
        </div>

        {/* Placeholder para futuras tarjetas/gráficas */}
        <div className="mt-4 bg-white rounded-xl shadow-lg p-5">
          <div className="text-sm text-gray-600">
            Próximamente: ventas últimos 14 días y top productos online.
          </div>
        </div>
      </div>
    </div>
  );
}
