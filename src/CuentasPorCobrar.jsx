// src/CuentasPorCobrar.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const PAGE_SIZE_DEFAULT = 25;

function fmt(n) {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function CuentasPorCobrar() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [scoreFilter, setScoreFilter] = useState("ALL"); // ALL | 0-399 | 400-549 | 550-649 | 650-749 | 750+
  const scoreRanges = {
    "0-399": [0, 399],
    "400-549": [400, 549],
    "550-649": [550, 649],
    "650-749": [650, 749],
    "750+": [750, 1000],
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        let query = supabase
          .from("v_cxc_cliente_detalle")
          .select("cliente_id, cliente_nombre, saldo, limite_politica, credito_disponible, score_base", { count: "exact" });

        if (q?.trim()) {
          query = query.ilike("cliente_nombre", `%${q.trim()}%`);
        }

        if (scoreFilter !== "ALL") {
          const [min, max] = scoreRanges[scoreFilter];
          query = query.gte("score_base", min).lte("score_base", max);
        }

        query = query.order("saldo", { ascending: false });

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, error, count } = await query.range(from, to);

        if (!ignore) {
          if (error) {
            console.warn("CxC view read failed", error?.message);
            setRows([]);
            setTotal(0);
          } else {
            setRows(data || []);
            setTotal(count || 0);
          }
        }
      } catch (e) {
        if (!ignore) {
          console.warn("CxC load error", e?.message);
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [q, page, pageSize, scoreFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const metrics = useMemo(() => {
    const saldoTotal = rows.reduce((s, r) => s + Number(r.saldo || 0), 0);
    const avgScore =
      rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + Number(r.score_base || 0), 0) / rows.length)
        : 0;
    return { saldoTotal, avgScore, clientes: total };
  }, [rows, total]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">Cuentas por Cobrar</h1>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-4">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Buscar cliente…"
          className="w-full sm:w-80 border rounded-lg px-3 py-2"
        />

        <div className="flex flex-wrap gap-2">
          {["ALL", "0-399", "400-549", "550-649", "650-749", "750+"].map((k) => (
            <button
              key={k}
              className={`px-3 py-2 rounded-lg text-sm border ${scoreFilter === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300"}`}
              onClick={() => { setScoreFilter(k); setPage(1); }}
            >
              {k === "ALL" ? "Todos los scores" : `Score ${k}`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-sm text-gray-600">Page size:</label>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="border rounded-lg px-2 py-1"
          >
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            onClick={() => { /* sólo recarga */ setPage((p) => p); }}
            className="border rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50"
          >
            Recargar
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-gray-500 text-xs uppercase font-semibold">Total CXC</div>
          <div className="text-2xl font-bold">{fmt(metrics.saldoTotal)}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-gray-500 text-xs uppercase font-semibold">Score promedio</div>
          <div className="text-2xl font-bold">{metrics.avgScore || 0}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-gray-500 text-xs uppercase font-semibold">Clientes</div>
          <div className="text-2xl font-bold">{metrics.clientes}</div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Cliente</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Saldo</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600">Score base</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Límite (política)</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Crédito disp.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Cargando…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin resultados</td>
              </tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.cliente_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{r.cliente_nombre}</div>
                  <div className="text-xs text-gray-500">#{r.cliente_id?.slice?.(0, 8)}…</div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(r.saldo)}</td>
                <td className="px-4 py-3 text-center">{Number(r.score_base ?? 0)}</td>
                <td className="px-4 py-3 text-right">{fmt(r.limite_politica)}</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-600">{fmt(r.credito_disponible)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between mt-4">
        <button
          className="px-3 py-2 border rounded-lg text-sm bg-white disabled:opacity-50"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          ← Anterior
        </button>
        <div className="text-sm text-gray-600">
          Página {page} de {totalPages}
        </div>
        <button
          className="px-3 py-2 border rounded-lg text-sm bg-white disabled:opacity-50"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
