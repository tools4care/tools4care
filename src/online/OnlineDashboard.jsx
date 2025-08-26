// src/online/OnlineDashboard.jsx
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function OnlineDashboard() {
  const [ventasHoy, setVentasHoy] = useState(0);
  const [ordenesTotales, setOrdenesTotales] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ---- helpers ----
  function startOfTodayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  function endOfTodayISO() {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }
  const updatedLabel = useMemo(() => {
    if (!lastUpdated) return "—";
    const d = new Date(lastUpdated);
    const hhmm = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    return `a las ${hhmm} · hace ${mins} min`;
  }, [lastUpdated]);

  async function cargar() {
    setLoading(true);
    try {
      // Ventas de HOY (suma de amount_total en 'orders' de hoy)
      const { data: hoyRows, error: e1 } = await supabase
        .from("orders")
        .select("amount_total")
        .gte("created_at", startOfTodayISO())
        .lt("created_at", endOfTodayISO());

      if (e1) throw e1;
      const totalHoy = (hoyRows || []).reduce((s, r) => s + Number(r.amount_total || 0), 0);
      setVentasHoy(totalHoy);

      // Conteo total de órdenes
      const { count, error: e2 } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true });
      if (e2) throw e2;
      setOrdenesTotales(count ?? 0);
    } finally {
      setLastUpdated(new Date());
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resumen Online</h1>
          <p className="text-sm text-gray-500 mt-1">
            Última actualización: <span className="font-medium">{updatedLabel}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={cargar}
            disabled={loading}
            className="inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
          <Link
            to="/online/orders"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Ir a Pedidos
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">Ventas de hoy</div>
          <div className="mt-1 text-3xl font-bold">
            {ventasHoy.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">Órdenes registradas</div>
          <div className="mt-1 text-3xl font-bold">{ordenesTotales}</div>
        </div>
      </div>

      {/* Placeholder para futuras gráficas */}
      <div className="mt-6 rounded-xl border bg-white p-6 text-gray-500">
        Próximamente: ventas últimos 14 días y top productos online.
      </div>
    </div>
  );
}
