// src/PreCierreVan.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

/* ==================== Helpers de fecha seguros (local) ==================== */
const pad2 = (n) => String(n).padStart(2, "0");

// Devuelve 'YYYY-MM-DD' del día local de un Date
function ymdFromDateLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Valida cadena 'YYYY-MM-DD'
function isYMD(str) {
  return typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

// Hoy local en 'YYYY-MM-DD'
function todayYMD() {
  return ymdFromDateLocal(new Date());
}

// Convierte 'YYYY-MM-DD' -> 'MM/DD/YYYY' (solo formateo de texto)
function toUSFromYMD(ymd) {
  if (!isYMD(ymd)) return "—";
  const [y, m, d] = ymd.split("-");
  return `${m}/${d}/${y}`;
}

// Itera días (local) entre dos YMD (inclusive) y devuelve array de YMD
function daysBetweenYMD(startYMD, endYMD) {
  const out = [];
  const a = new Date(startYMD);
  const b = new Date(endYMD);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  for (let cur = new Date(a); cur <= b; cur.setDate(cur.getDate() + 1)) {
    out.push(ymdFromDateLocal(cur));
  }
  return out;
}

/* ==================== Hook: días pendientes por van ==================== */
function usePrecloseRows(vanId, diasAtras = 21, refreshKey = 0) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!vanId) {
      setRows([]);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Rango visible: últimos N días (local)
        const hoy = new Date();
        const desde = new Date(hoy);
        desde.setDate(hoy.getDate() - (diasAtras - 1));

        const p_from = ymdFromDateLocal(desde);
        const p_to = ymdFromDateLocal(hoy);

        // 1) Resumen por día (RPC existente)
        const { data, error: rpcError } = await supabase.rpc(
          "closeout_resumen_completo",
          { p_van_id: vanId, p_from, p_to }
        );
        if (rpcError) throw rpcError;

        const normalized = (data ?? [])
          .map((r) => ({
            dia: typeof r.dia === "string" ? r.dia.slice(0, 10) : null,
            ventas_count: Number(r.ventas_count ?? 0),
            pagos_count: Number(r.pagos_count ?? 0),
            cash_expected: Number(r.cash_expected ?? 0),
            card_expected: Number(r.card_expected ?? 0),
            transfer_expected: Number(r.transfer_expected ?? 0),
            other_expected: Number(r.other_expected ?? 0),
            total_expected: Number(r.total_expected ?? 0),
            cxc_generadas: Number(r.cxc_generadas ?? 0),
          }))
          .filter((r) => r.dia && isYMD(r.dia));

        // 2) Traer cierres guardados (sin asumir nombres). Filtramos por van_id y
// 2) Traer cierres ya guardados (solo por van) y filtrar en JS
const { data: cierres, error: cierresError } = await supabase
  .from("cierres_van")
  .select("*")                 // Traemos todo para adaptarnos a cualquier esquema
  .eq("van_id", vanId);        // Solo por van; el rango lo haremos en JS
if (cierresError) throw cierresError;

// Helpers para detectar los nombres reales de columnas:
const getStart = (c) =>
  c.fecha_inicio ?? c.start_date ?? c.fecha_desde ?? c.fecha ?? c.dia ?? c.date ?? null;
const getEnd = (c) =>
  c.fecha_fin ?? c.end_date ?? c.fecha_hasta ?? c.fecha ?? c.dia ?? c.date ?? null;

// Nuestro rango visible en YMD
const rangeStart = p_from; // 'YYYY-MM-DD'
const rangeEnd   = p_to;   // 'YYYY-MM-DD'

// Logs de diagnóstico
console.debug("[PreCierre] cierres_van crudos:", cierres);

// 2.1) Solo cierres que solapan el rango visible
const cierresSolapados = (cierres || []).filter((c) => {
  const sRaw = getStart(c);
  const eRaw = getEnd(c);
  if (!sRaw || !eRaw) return false;
  const sY = typeof sRaw === "string" ? sRaw.slice(0, 10) : ymdFromDateLocal(sRaw);
  const eY = typeof eRaw === "string" ? eRaw.slice(0, 10) : ymdFromDateLocal(eRaw);
  // Solapa si [sY,eY] intersecta [rangeStart,rangeEnd]
  return !(eY < rangeStart || sY > rangeEnd);
});

// 3) Construir set de días cerrados
const closedDays = new Set();
for (const c of cierresSolapados) {
  const sRaw = getStart(c);
  const eRaw = getEnd(c);
  const sY = typeof sRaw === "string" ? sRaw.slice(0, 10) : ymdFromDateLocal(sRaw);
  const eY = typeof eRaw === "string" ? eRaw.slice(0, 10) : ymdFromDateLocal(eRaw);
  for (const ymd of daysBetweenYMD(sY, eY)) closedDays.add(ymd);
}

console.debug("[PreCierre] closedDays calculados:", Array.from(closedDays));

// 4) Excluir los días ya cerrados
const abiertos = normalized.filter((r) => !closedDays.has(r.dia.slice(0,10).trim()));

// 5) Orden desc
abiertos.sort((a, b) => (a.dia < b.dia ? 1 : -1));

if (!alive) return;
setRows(abiertos);



        if (!alive) return;
        setRows(abiertos);
      } catch (err) {
        console.error("Error en usePrecloseRows:", err);
        if (!alive) return;
        setError(err.message || "Error al cargar los datos");
        setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [vanId, diasAtras, refreshKey]);

  return { rows, loading, error };
}

/* ============================== Componente ============================== */
export default function PreCierreVan() {
  const { van } = useVan();
  const navigate = useNavigate();

  // Bandera de invalidación para refrescar tras guardar un cierre
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (localStorage.getItem("pre_cierre_invalidate") === "1") {
      localStorage.removeItem("pre_cierre_invalidate");
      setRefreshKey((k) => k + 1);
    }
  }, []);

  if (!van || !van.id) {
    return (
      <div className="max-w-3xl mx-auto mt-10 p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <h2 className="text-lg font-bold mb-2">No se encontró una van asignada</h2>
          <p>Por favor, seleccione una van antes de continuar con el pre-cierre.</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const { rows, loading, error } = usePrecloseRows(van.id, 21, refreshKey);

  const allDates = useMemo(() => rows.map((r) => r.dia), [rows]);
  const [selected, setSelected] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pre_cierre_fechas") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  // Limpia selección contra fechas visibles
  useEffect(() => {
    if (selected.length === 0) return;
    const visible = new Set(allDates);
    const cleaned = selected.filter((d) => visible.has(d));
    if (cleaned.length !== selected.length) {
      setSelected(cleaned);
      try {
        localStorage.setItem("pre_cierre_fechas", JSON.stringify(cleaned));
        if (cleaned.length > 0) localStorage.setItem("pre_cierre_fecha", cleaned[0]);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDates]);

  const toggleOne = (day) => {
    setSelected((prev) => {
      const has = prev.includes(day);
      const next = has ? prev.filter((d) => d !== day) : [day, ...prev];
      try {
        localStorage.setItem("pre_cierre_fechas", JSON.stringify(next));
        if (next.length > 0) localStorage.setItem("pre_cierre_fecha", next[0]);
      } catch (err) {
        console.error("Error guardando en localStorage:", err);
      }
      return next;
    });
  };

  const allSelected = selected.length > 0 && selected.length === allDates.length;
  const onToggleAll = () => {
    const next = allSelected ? [] : [...allDates];
    setSelected(next);
    try {
      localStorage.setItem("pre_cierre_fechas", JSON.stringify(next));
      if (next.length > 0) localStorage.setItem("pre_cierre_fecha", next[0]);
    } catch (err) {
      console.error("Error guardando en localStorage:", err);
    }
  };

  const sum = selected.reduce(
    (acc, d) => {
      const r = rows.find((x) => x.dia === d);
      if (!r) return acc;
      acc.cash += Number(r.cash_expected || 0);
      acc.card += Number(r.card_expected || 0);
      acc.transfer += Number(r.transfer_expected || 0);
      acc.other += Number(r.other_expected || 0);
      acc.total += Number(r.total_expected || 0);
      acc.cxc += Number(r.cxc_generadas || 0);
      acc.ventas += Number(r.ventas_count || 0);
      acc.pagos += Number(r.pagos_count || 0);
      return acc;
    },
    { cash: 0, card: 0, transfer: 0, other: 0, total: 0, cxc: 0, ventas: 0, pagos: 0 }
  );

  const todayIso = useMemo(todayYMD, []);
  const canProcess = selected.length > 0 && sum.total > 0;

  const onProcess = () => {
    if (!canProcess) return;
    try {
      localStorage.setItem("pre_cierre_fechas", JSON.stringify(selected));
      localStorage.setItem("pre_cierre_fecha", selected[0] || "");
      localStorage.setItem("pre_cierre_refresh", String(Date.now()));
      navigate("/cierres/van");
    } catch (err) {
      console.error("Error guardando datos para cierre:", err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto mt-10 p-6">
        <div className="text-center text-blue-600">Loading pending days...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto mt-10 p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <h2 className="text-lg font-bold mb-2">Error</h2>
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mt-10 bg-white rounded shadow p-6">
      <h2 className="font-bold text-xl mb-4 text-blue-900">
        End of Day Register Closeout – Pre
      </h2>

      <div className="bg-gray-50 rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-blue-800">By Date</div>
          <div className="text-xs text-gray-500">Includes Sales + Customer Payments</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tabla fechas */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-100 text-left">
                  <th className="p-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={onToggleAll}
                      aria-label="Select all days"
                    />
                  </th>
                  <th className="p-2">Date</th>
                  <th className="p-2 text-right">Transactions</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-gray-400">
                      ✅ No pending days
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const f = row.dia;
                    const checked = selected.includes(f);
                    const disabled = (row.total_expected || 0) <= 0; // opcional
                    return (
                      <tr key={f} className={`hover:bg-blue-50 ${checked ? "bg-blue-50" : ""}`}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={checked}
                            onChange={() => toggleOne(f)}
                            aria-label={`Select ${f}`}
                          />
                        </td>
                        <td
                          className={`p-2 ${disabled ? "text-gray-400" : "cursor-pointer"}`}
                          onClick={() => !disabled && toggleOne(f)}
                          title={disabled ? "No amounts expected this day" : "Toggle select"}
                        >
                          {toUSFromYMD(f)}
                          {f === todayIso ? " (Today)" : ""}
                        </td>
                        <td className="p-2 text-right text-xs">
                          <div>{row.ventas_count || 0} sales</div>
                          <div className="text-green-600">{row.pagos_count || 0} payments</div>
                        </td>
                        <td className="p-2 text-right font-semibold">
                          ${(row.total_expected || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Panel resumen selección */}
          <div className="border rounded-lg p-3 bg-white">
            <div className="text-sm mb-2">
              <b>Selected:</b>{" "}
              {selected.length === 0
                ? "—"
                : selected
                    .slice()
                    .sort((a, b) => (a < b ? 1 : -1))
                    .map((d) => toUSFromYMD(d))
                    .join(", ")}
            </div>

            <div className="text-sm space-y-1 mb-3">
              <div className="bg-green-50 border border-green-200 rounded p-2">
                <b>💰 Cash expected:</b> ${sum.cash.toFixed(2)}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded p-2">
                <b>💳 Card expected:</b> ${sum.card.toFixed(2)}
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded p-2">
                <b>🏦 Transfer expected:</b> ${sum.transfer.toFixed(2)}
              </div>
              {sum.other > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded p-2">
                  <b>💵 Other:</b> ${sum.other.toFixed(2)}
                </div>
              )}

              {sum.cxc > 0 && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded p-2">
                  <b>📋 A/R Generated:</b> ${sum.cxc.toFixed(2)}
                  <div className="text-xs text-amber-700 mt-1">(Sales not paid in full)</div>
                </div>
              )}

              <div className="pt-2 border-t-2 border-blue-300">
                <b>Total expected:</b> ${sum.total.toFixed(2)}
              </div>

              <div className="text-xs text-gray-600 pt-2 border-t">
                <div>
                  <b>{sum.ventas}</b> sales
                </div>
                <div className="text-green-600">
                  <b>{sum.pagos}</b> customer payments
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="bg-gray-200 px-3 py-2 rounded"
                onClick={() => window.history.back()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bg-blue-700 text-white px-4 py-2 rounded font-bold disabled:opacity-50"
                disabled={!canProcess}
                onClick={onProcess}
              >
                Process
              </button>
            </div>

            <p className="mt-3 text-xs text-blue-700">
              Select one or more dates and press <b>Process</b> to begin closeout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
