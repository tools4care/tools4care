import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

/* ============ Helpers ============ */

function formatUS(d) {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  if (!y || !m || !day) return d;
  return `${m}-${day}-${y}`;
}
const isIsoDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function countVentasDia(van_id, dia) {
  const start = `${dia}T00:00:00`, end = `${dia}T23:59:59`;
  const { count, error } = await supabase
    .from("ventas")
    .select("id", { count: "exact", head: true })
    .eq("van_id", van_id)
    .gte("fecha", start)
    .lte("fecha", end)
    .is("cierre_id", null);
  if (error) return 0;
  return count || 0;
}

/* ============ Datos desde la vista (expected por día/van) ============ */
function useExpectedPendientes(van_id, diasAtras = 21) {
  const [rows, setRows] = useState([]); // [{dia, cash_expected, card_expected, transfer_expected, mix_unallocated}]
  useEffect(() => {
    if (!van_id) { setRows([]); return; }
    (async () => {
      // Rango últimos N días
      const hoy = new Date();
      const desde = new Date(hoy);
      desde.setDate(hoy.getDate() - (diasAtras - 1));
      const toISO = (d) => d.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("vw_expected_por_dia_van")
        .select("*")
        .eq("van_id", van_id)
        .gte("dia", toISO(desde))
        .lte("dia", toISO(hoy))
        .order("dia", { ascending: false });

      if (error) { setRows([]); return; }

      const clean = (data || []).filter(r => {
        const tot = Number(r.cash_expected || 0) + Number(r.card_expected || 0) + Number(r.transfer_expected || 0) + Number(r.mix_unallocated || 0);
        return isIsoDate(r.dia) && tot > 0;
      });

      setRows(clean);
    })();
  }, [van_id, diasAtras]);
  return rows;
}

/* ============ Componente ============ */
export default function PreCierreVan() {
  const { van } = useVan();
  const navigate = useNavigate();

  // Lee expected por día/van (solo días con actividad, ya excluye lo cerrado)
  const expectedRows = useExpectedPendientes(van?.id, 21);

  // Prefetch: contar facturas por día (opcional, solo para columna “Invoices”)
  const [invoices, setInvoices] = useState({}); // { YYYY-MM-DD: number }
  useEffect(() => {
    if (!van?.id || expectedRows.length === 0) return;
    let alive = true;
    (async () => {
      const faltan = expectedRows.filter(r => invoices[r.dia] == null);
      if (faltan.length === 0) return;
      const out = {};
      await Promise.all(
        faltan.map(async (r) => {
          const c = await countVentasDia(van.id, r.dia);
          out[r.dia] = c;
        })
      );
      if (alive) setInvoices(prev => ({ ...prev, ...out }));
    })();
    return () => { alive = false; };
  }, [van?.id, expectedRows, invoices]);

  // Fechas visibles ordenadas (ya vienen ordenadas desc desde el hook)
  const fechas = useMemo(() => expectedRows.map(r => r.dia), [expectedRows]);
  const [seleccion, setSeleccion] = useState("");

  // selección inicial (recupera preferencia si aplica)
  useEffect(() => {
    if (!fechas.length) { setSeleccion(""); return; }
    let pref = "";
    try { pref = localStorage.getItem("pre_cierre_fecha") || ""; } catch {}
    if (pref && fechas.includes(pref)) setSeleccion(pref);
    else setSeleccion(fechas[0]);
  }, [fechas]);

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const filaSeleccion = expectedRows.find(r => r.dia === seleccion);
  const totalSeleccion = (filaSeleccion
    ? Number(filaSeleccion.cash_expected || 0) + Number(filaSeleccion.card_expected || 0) + Number(filaSeleccion.transfer_expected || 0) + Number(filaSeleccion.mix_unallocated || 0)
    : 0);

  const puedeProcesar = Boolean(seleccion) && totalSeleccion > 0;

  const onProcesar = () => {
    if (!puedeProcesar) return;
    try {
      localStorage.setItem("pre_cierre_fecha", seleccion);
      // hint para que la pantalla de cierre refresque
      localStorage.setItem("pre_cierre_refresh", String(Date.now()));
    } catch {}
    navigate("/cierres/van"); // tu ruta de cierre
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
            Start & End Times Must be Between 0:00 & 23:59:59
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Lista de fechas */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-100 text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2 text-right">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {fechas.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-3 text-center text-gray-400">
                      ✅ No pending days
                    </td>
                  </tr>
                ) : (
                  fechas.map((f) => (
                    <tr
                      key={f}
                      className={`cursor-pointer hover:bg-blue-50 ${seleccion === f ? "bg-blue-50" : ""}`}
                      onClick={() => {
                        setSeleccion(f);
                        try { localStorage.setItem("pre_cierre_fecha", f); } catch {}
                      }}
                    >
                      <td className="p-2">
                        {formatUS(f)}{f === hoy ? " (Today)" : ""}
                      </td>
                      <td className="p-2 text-right">
                        {invoices[f] ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Panel lateral */}
          <div className="border rounded-lg p-3 bg-white">
            <div className="text-sm mb-2">
              <b>Selected:</b> {seleccion ? formatUS(seleccion) : "—"}
            </div>

            <div className="text-sm space-y-1 mb-3">
              <div><b>Cash expected:</b> ${Number(filaSeleccion?.cash_expected || 0).toFixed(2)}</div>
              <div><b>Card expected:</b> ${Number(filaSeleccion?.card_expected || 0).toFixed(2)}</div>
              <div><b>Transfer expected:</b> ${Number(filaSeleccion?.transfer_expected || 0).toFixed(2)}</div>
              {Number(filaSeleccion?.mix_unallocated || 0) > 0 && (
                <div className="text-xs text-amber-700">
                  <b>Mix (unallocated):</b> ${Number(filaSeleccion?.mix_unallocated || 0).toFixed(2)}
                </div>
              )}
              <div className="pt-2 border-t">
                <b>Total expected:</b> ${totalSeleccion.toFixed(2)}
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
                disabled={!puedeProcesar}
                onClick={onProcesar}
              >
                Process
              </button>
            </div>

            <p className="mt-3 text-xs text-blue-700">
              Select date to close out and press <b>Process</b> to begin closeout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
