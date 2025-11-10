// src/PreCierreVan.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

/* ==================== Helpers de fecha / formato ==================== */

// Formato US MM/DD/YYYY a partir de 'YYYY-MM-DD'
function formatUS(isoDay) {
  if (!isoDay) return "—";
  const [y, m, d] = String(isoDay).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  const dt = new Date(y, m - 1, d); // local
  return dt.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// 'YYYY-MM-DD' del día local actual
function localTodayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Límites locales [start, end) como 'YYYY-MM-DD HH:MM:SS' para un ISO day
function localDayBounds(isoDay) {
  const [y, m, d] = String(isoDay).slice(0, 10).split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const S = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(
    start.getDate()
  )} ${pad(start.getHours())}:${pad(start.getMinutes())}:${pad(
    start.getSeconds()
  )}`;
  const E = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(
    end.getDate()
  )} ${pad(end.getHours())}:${pad(end.getMinutes())}:${pad(end.getSeconds())}`;
  return { start: S, end: E };
}

// Reemplaza tu countVentasDia por esta versión robusta
async function countVentasDia(van_id, diaISO /* 'YYYY-MM-DD' */) {
  if (!van_id || !diaISO) return 0;

  // Rango local del día (evita "T" para que PostgREST no lo pase a UTC)
  const start = `${diaISO} 00:00:00`;
  const end   = `${diaISO} 23:59:59`;

  // Probamos varias columnas de fecha, según tu esquema real
  const dateCols = ["fecha", "fecha_venta", "created_at"];

  for (const col of dateCols) {
    // Si la columna no existe, PostgREST devuelve 400; ignoramos y seguimos.
    const { count, error, status } = await supabase
      .from("ventas")
      .select("id", { count: "exact", head: true })
      .eq("van_id", van_id)
      .gte(col, start)
      .lte(col, end)
      .is("cierre_id", null);

    // status 200 y count numérico ⇒ lo tomamos como bueno
    if (!error && typeof count === "number") return count;

    // Si es 400 por columna inválida, intenta la siguiente sin loguear ruido
    if (status !== 400 && error) {
      console.warn(`countVentasDia(${col}) error:`, error.message || error);
    }
  }

  // Si todas fallan, devolvemos 0 para no romper UI
  return 0;
}


/* ==================== Hook: días pendientes por van ==================== */
/**
 * Devuelve filas del tipo:
 *  { dia: 'YYYY-MM-DD', cash_expected, card_expected, transfer_expected, mix_unallocated }
 * El RPC debe regresar solo días con actividad (sin días cerrados ni montos 0; hoy aparece si hay pendientes).
 */
function usePrecloseRows(vanId, diasAtras = 21) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!vanId) {
      setRows([]);
      return;
    }

    let alive = true;
    (async () => {
      const hoy = new Date();
      const desde = new Date(hoy);
      desde.setDate(hoy.getDate() - (diasAtras - 1));

      const p_from = desde.toISOString().slice(0, 10);
      const p_to = hoy.toISOString().slice(0, 10);

      const { data, error } = await supabase.rpc(
        "closeout_pre_resumen_filtrado",
        {
          p_van_id: vanId,
          p_from,
          p_to,
        }
      );

      if (!alive) return;

      if (error) {
        console.error("preclose rpc error", error);
        setRows([]);
        return;
      }

      const normalized = (data ?? [])
        .map((r) => {
          const iso =
            r.dia ?? r.fecha ?? r.day ?? r.f ?? null;
          return {
            dia: typeof iso === "string" ? iso.slice(0, 10) : null,
            cash_expected: Number(r.cash_expected ?? r.cash ?? 0),
            card_expected: Number(r.card_expected ?? r.card ?? 0),
            transfer_expected: Number(r.transfer_expected ?? r.transfer ?? 0),
            mix_unallocated: Number(r.mix_unallocated ?? r.mix ?? 0),
          };
        })
        .filter((r) => r.dia && /^\d{4}-\d{2}-\d{2}$/.test(r.dia));

      // Orden desc por fecha
      normalized.sort((a, b) => (a.dia < b.dia ? 1 : -1));
      setRows(normalized);
    })();

    return () => {
      alive = false;
    };
  }, [vanId, diasAtras]);

  return rows;
}

/* ============================== Componente ============================== */

export default function PreCierreVan() {
  const { van } = useVan();
  const navigate = useNavigate();

  // Días pendientes (ya filtrados por el RPC)
  const rows = usePrecloseRows(van?.id, 21);

  // Conteo de facturas por día (para la columna "Invoices")
  const [invoices, setInvoices] = useState({}); // { 'YYYY-MM-DD': number }
  useEffect(() => {
    if (!van?.id || rows.length === 0) return;
    let alive = true;

    (async () => {
      const faltan = rows.filter((r) => invoices[r.dia] == null);
      if (faltan.length === 0) return;

      const out = {};
      await Promise.all(
        faltan.map(async (r) => {
          const c = await countVentasDia(van.id, r.dia);
          out[r.dia] = c;
        })
      );

      if (alive) setInvoices((prev) => ({ ...prev, ...out }));
    })();

    return () => {
      alive = false;
    };
  }, [van?.id, rows, invoices]);

  // Selección múltiple (checkboxes)
  const allDates = useMemo(() => rows.map((r) => r.dia), [rows]);
  const [selected, setSelected] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pre_cierre_fechas") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  // Asegura que si cambian las filas, limpiamos fechas no visibles
  useEffect(() => {
    if (selected.length === 0) return;
    const visible = new Set(allDates);
    const cleaned = selected.filter((d) => visible.has(d));
    if (cleaned.length !== selected.length) setSelected(cleaned);
  }, [allDates]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleOne = (day) => {
    setSelected((prev) => {
      const has = prev.includes(day);
      const next = has ? prev.filter((d) => d !== day) : [day, ...prev];
      try {
        localStorage.setItem("pre_cierre_fechas", JSON.stringify(next));
        if (next.length > 0) localStorage.setItem("pre_cierre_fecha", next[0]); // compat
      } catch {}
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
    } catch {}
  };

  // Sumas del panel (sobre fechas seleccionadas)
  const sum = selected.reduce(
    (acc, d) => {
      const r = rows.find((x) => x.dia === d);
      if (!r) return acc;
      acc.cash += Number(r.cash_expected || 0);
      acc.card += Number(r.card_expected || 0);
      acc.transfer += Number(r.transfer_expected || 0);
      acc.mix += Number(r.mix_unallocated || 0);
      acc.invoices += Number(invoices[d] || 0);
      return acc;
    },
    { cash: 0, card: 0, transfer: 0, mix: 0, invoices: 0 }
  );
  const totalExpected = sum.cash + sum.card + sum.transfer + sum.mix;

  const todayISO = useMemo(localTodayISO, []);
  const canProcess = selected.length > 0 && totalExpected > 0;

  const onProcess = () => {
    if (!canProcess) return;
    try {
      localStorage.setItem("pre_cierre_fechas", JSON.stringify(selected));
      localStorage.setItem("pre_cierre_fecha", selected[0] || "");
      localStorage.setItem("pre_cierre_refresh", String(Date.now()));
    } catch {}
    navigate("/cierres/van");
  };

  return (
    <div className="max-w-3xl mx-auto mt-10 bg-white rounded shadow p-6">
      <h2 className="font-bold text-xl mb-4 text-blue-900">
        End of Day Register Closeout – Pre
      </h2>

      <div className="bg-gray-50 rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-blue-800">By Date</div>
          <div className="text-xs text-gray-500">
            Start &amp; End Times Must be Between 0:00 &amp; 23:59:59
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tabla de días */}
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
                  <th className="p-2 text-right">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {allDates.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-3 text-center text-gray-400">
                      ✅ No pending days
                    </td>
                  </tr>
                ) : (
                  allDates.map((f) => {
                    const checked = selected.includes(f);
                    return (
                      <tr
                        key={f}
                        className={`hover:bg-blue-50 ${
                          checked ? "bg-blue-50" : ""
                        }`}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(f)}
                            aria-label={`Select ${f}`}
                          />
                        </td>
                        <td
                          className="p-2 cursor-pointer"
                          onClick={() => toggleOne(f)}
                          title="Toggle select"
                        >
                          {formatUS(f)}
                          {f === todayISO ? " (Today)" : ""}
                        </td>
                        <td className="p-2 text-right">
                          {invoices[f] ?? 0}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Panel lateral de totales */}
          <div className="border rounded-lg p-3 bg-white">
            <div className="text-sm mb-2">
              <b>Selected:</b>{" "}
              {selected.length === 0
                ? "—"
                : selected
                    .slice()
                    .sort((a, b) => (a < b ? 1 : -1))
                    .map((d) => formatUS(d))
                    .join(", ")}
            </div>

            <div className="text-sm space-y-1 mb-3">
              <div>
                <b>Cash expected:</b> ${sum.cash.toFixed(2)}
              </div>
              <div>
                <b>Card expected:</b> ${sum.card.toFixed(2)}
              </div>
              <div>
                <b>Transfer expected:</b> ${sum.transfer.toFixed(2)}
              </div>
              {sum.mix > 0 && (
                <div className="text-xs text-amber-700">
                  <b>Mix (unallocated):</b> ${sum.mix.toFixed(2)}
                </div>
              )}
              <div className="pt-2 border-t">
                <b>Total expected:</b> ${totalExpected.toFixed(2)}
              </div>
              <div className="text-xs text-gray-600">
                <b>Invoices total:</b> {sum.invoices}
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


