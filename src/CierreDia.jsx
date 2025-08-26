// src/CierreDia.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

/* ======================= MODO PRE-CIERRE ======================= */
function useFechasPendientes(van_id) {
  const [fechas, setFechas] = useState([]);
  useEffect(() => {
    if (!van_id) return setFechas([]);
    (async () => {
      const { data } = await supabase.rpc("fechas_pendientes_cierre_van", {
        van_id_param: van_id,
      });
      setFechas(data || []);
    })();
  }, [van_id]);
  return fechas;
}

function PreCierre({ onCerrar, onCancelar }) {
  const { van } = useVan();
  const fechas = useFechasPendientes(van?.id);
  const [selFecha, setSelFecha] = useState("");
  const [cuentas, setCuentas] = useState({}); // { "YYYY-MM-DD": { ventas, pagos } }
  const [loading, setLoading] = useState(false);

  // Preselección (hoy si está, si no el primero)
  const hoy = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    if (!fechas.length) return;
    setSelFecha((prev) => (prev && fechas.includes(prev) ? prev : (fechas.includes(hoy) ? hoy : fechas[0])));
  }, [fechas]);

  // Cargar conteos por fecha
  useEffect(() => {
    if (!van?.id || !fechas?.length) { setCuentas({}); return; }
    setLoading(true);
    (async () => {
      const entries = await Promise.all(
        fechas.map(async (f) => {
          const [{ data: vs }, { data: ps }] = await Promise.all([
            supabase.rpc("ventas_no_cerradas_por_van_by_id", {
              van_id_param: van.id, fecha_inicio: f, fecha_fin: f,
            }),
            supabase.rpc("pagos_no_cerrados_por_van_by_id", {
              van_id_param: van.id, fecha_inicio: f, fecha_fin: f,
            }),
          ]);
          return [f, { ventas: (vs || []).length, pagos: (ps || []).length }];
        })
      );
      setCuentas(Object.fromEntries(entries));
      setLoading(false);
    })();
  }, [van?.id, fechas]);

  const totFacturas = useMemo(
    () => Object.values(cuentas).reduce((t, x) => t + (x?.ventas || 0), 0),
    [cuentas]
  );

  function procesar() {
    if (!selFecha) return;
    // Dejo la fecha para que CierreVan la tome por defecto
    localStorage.setItem("pre_cierre_fecha", selFecha);
    // Entrego la fecha al padre si lo desea (por ej. para navegar)
    onCerrar?.({ fecha: selFecha });
  }

  return (
    <div className="max-w-3xl mx-auto mt-8 bg-white border rounded-xl shadow p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-blue-900">
          End of Day Register Closeout — Pre-Close
        </h2>
        <div className="text-xs sm:text-sm text-gray-600">
          Van: <b>{van?.nombre || `#${van?.id || "-"}`}</b>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* By Register */}
        <div className="rounded-lg border p-3">
          <div className="font-semibold text-gray-800 mb-2">By Register</div>
          <div className="flex items-center justify-between bg-gray-50 border rounded p-3">
            <div>
              <div className="text-xs text-gray-500">Register #</div>
              <div className="font-bold">{van?.id ?? "-"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Invoices</div>
              <div className="font-bold">{loading ? "…" : totFacturas}</div>
            </div>
          </div>
        </div>

        {/* By Date */}
        <div className="rounded-lg border p-3">
          <div className="font-semibold text-gray-800 mb-2">By Date</div>
          <div className="max-h-64 overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-blue-900">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-right">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {fechas.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-3 text-center text-gray-400">
                      No pending days
                    </td>
                  </tr>
                )}
                {fechas.map((f) => {
                  const isSel = selFecha === f;
                  const row = cuentas[f] || { ventas: 0, pagos: 0 };
                  return (
                    <tr
                      key={f}
                      className={`cursor-pointer ${isSel ? "bg-blue-100" : "hover:bg-gray-50"}`}
                      onClick={() => setSelFecha(f)}
                    >
                      <td className="p-2">{f}</td>
                      <td className="p-2 text-right">{loading ? "…" : row.ventas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Day / Process */}
        <div className="rounded-lg border p-3">
          <div className="font-semibold text-gray-800 mb-2">By Day</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-16 text-gray-600">Start</span>
              <input className="border rounded p-1 w-24" type="time" value="00:00" disabled />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-gray-600">End</span>
              <input className="border rounded p-1 w-24" type="time" value="23:45" disabled />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => onCancelar?.()}
              type="button"
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
              onClick={procesar}
              disabled={!selFecha}
              type="button"
            >
              Process
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Start & End Times must be between 00:00 and 23:45 (day-based closeout).
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================= MODO CONFIRMACIÓN (TU ORIGINAL) ======================= */
function ConfirmModal({ resumen, onCerrar, onCancelar }) {
  const [observaciones, setObservaciones] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onCerrar({ observaciones });
  };

  if (!resumen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
      <div className="bg-white p-6 rounded-lg min-w-[320px] shadow-lg">
        <h2 className="text-lg font-bold mb-4">Cierre de Día</h2>
        <div className="mb-4">
          <strong>Ventas totales:</strong> {resumen.ventas} <br />
          <strong>Efectivo entregado:</strong> {resumen.efectivo} <br />
        </div>
        <form onSubmit={handleSubmit}>
          <label className="block mb-2">
            Observaciones:
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="border w-full p-2 mt-1"
              rows={3}
              placeholder="Opcional"
            />
          </label>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              className="bg-gray-200 px-4 py-2 rounded"
              onClick={onCancelar}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Confirmar Cierre
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ======================= EXPORT PÚBLICO ======================= */
// Si pasas mode="pre" o no pasas `resumen`, se muestra el módulo PreCierre.
// Si pasas `resumen`, se muestra el modal original.
export default function CierreDia(props) {
  const { mode, resumen, onCerrar, onCancelar } = props || {};
  if (mode === "pre" || !resumen) {
    return <PreCierre onCerrar={onCerrar} onCancelar={onCancelar} />;
  }
  return <ConfirmModal resumen={resumen} onCerrar={onCerrar} onCancelar={onCancelar} />;
}
