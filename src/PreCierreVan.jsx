import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

// ------- Helper: fallback robusto de días pendientes -------
function useFechasPendientes(van_id) {
  const [fechas, setFechas] = useState([]);

  useEffect(() => {
    if (!van_id) { setFechas([]); return; }

    (async () => {
      let list = [];

      // 1) Intento directo con RPC fechas_pendientes_cierre_van
      try {
        const { data, error } = await supabase.rpc(
          "fechas_pendientes_cierre_van",
          { van_id_param: van_id }
        );
        if (!error && Array.isArray(data)) {
          list = (data || []).map(d => String(d).slice(0,10));
        }
      } catch {
        // pasamos al fallback
      }

      // 2) Fallback: sondeo últimos 21 días con las RPC existentes
      if (list.length === 0) {
        const pad = (n) => String(n).padStart(2,"0");
        const hoy = new Date();
        const dias = [];
        for (let i = 0; i < 21; i++) {
          const d = new Date(hoy);
          d.setDate(d.getDate() - i);
          dias.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
        }

        const encontrados = [];
        for (const dia of dias) {
          try {
            const [{ data: v }, { data: p }] = await Promise.all([
              supabase.rpc("ventas_no_cerradas_por_van_by_id", {
                van_id_param: van_id, fecha_inicio: dia, fecha_fin: dia
              }),
              supabase.rpc("pagos_no_cerrados_por_van_by_id", {
                van_id_param: van_id, fecha_inicio: dia, fecha_fin: dia
              }),
            ]);
            if ((v?.length || 0) > 0 || (p?.length || 0) > 0) encontrados.push(dia);
          } catch { /* noop */ }
        }
        list = encontrados;
      }

      // 3) Inyecta preferencia si existe
      try {
        const pref = localStorage.getItem("pre_cierre_fecha");
        if (pref && !list.includes(pref)) list.unshift(pref);
      } catch {}

      setFechas(Array.from(new Set(list)));
    })();
  }, [van_id]);

  return fechas;
}

// ------- Cuenta de comprobantes por fecha (ligero) -------
async function contarPorFecha(van_id, fecha) {
  try {
    const [{ data: v }, { data: p }] = await Promise.all([
      supabase.rpc("ventas_no_cerradas_por_van_by_id", {
        van_id_param: van_id, fecha_inicio: fecha, fecha_fin: fecha
      }),
      supabase.rpc("pagos_no_cerrados_por_van_by_id", {
        van_id_param: van_id, fecha_inicio: fecha, fecha_fin: fecha
      }),
    ]);
    const ventas = Array.isArray(v) ? v.length : 0;
    const pagos  = Array.isArray(p) ? p.length : 0;
    return { ventas, pagos, total: ventas + pagos };
  } catch {
    return { ventas: 0, pagos: 0, total: 0 };
  }
}

export default function PreCierreVan() {
  const { van } = useVan();
  const navigate = useNavigate();
  const fechas = useFechasPendientes(van?.id);

  const [seleccion, setSeleccion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [conteos, setConteos] = useState({}); // { 'YYYY-MM-DD': {ventas, pagos, total} }

  // Inicializa selección respetando preferencia
  useEffect(() => {
    if (fechas.length === 0) { setSeleccion(""); return; }
    let pref = "";
    try { pref = localStorage.getItem("pre_cierre_fecha") || ""; } catch {}
    if (pref && fechas.includes(pref)) setSeleccion(pref);
    else setSeleccion(fechas[0]);
  }, [fechas]);

  // Prefetch de conteos para las fechas listadas
  useEffect(() => {
    if (!van?.id || fechas.length === 0) return;
    let cancel = false;
    (async () => {
      const pendientes = fechas.filter(f => !conteos[f]);
      if (pendientes.length === 0) return;
      const entradas = await Promise.all(
        pendientes.map(async (f) => [f, await contarPorFecha(van.id, f)])
      );
      if (!cancel) {
        const next = { ...conteos };
        for (const [f, val] of entradas) next[f] = val;
        setConteos(next);
      }
    })();
    return () => { cancel = true; };
  }, [van?.id, fechas, conteos]);

  const hoy = useMemo(() => new Date().toISOString().slice(0,10), []);
  const puedeProcesar = Boolean(seleccion);

  const onProcesar = async () => {
    if (!puedeProcesar) return;
    try { localStorage.setItem("pre_cierre_fecha", seleccion); } catch {}
    // navega al cierre real
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
            Start & End Times Must be Between 0:00 & 23:45
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-100 text-left">
                  <th className="p-2">Date</th>
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
                {fechas.map((f) => (
                  <tr
                    key={f}
                    className={`cursor-pointer hover:bg-blue-50 ${seleccion === f ? "bg-blue-50" : ""}`}
                    onClick={() => { setSeleccion(f); try { localStorage.setItem("pre_cierre_fecha", f); } catch {} }}
                  >
                    <td className="p-2">{f}{f === hoy ? " (Today)" : ""}</td>
                    <td className="p-2 text-right">
                      {conteos[f]?.ventas ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border rounded-lg p-3 bg-white">
            <div className="text-sm mb-2">
              <b>Selected:</b> {seleccion || "—"}
            </div>
            <div className="text-sm space-y-1 mb-3">
              <div><b>Sales pending:</b> {conteos[seleccion]?.ventas ?? 0}</div>
              <div><b>Payments pending:</b> {conteos[seleccion]?.pagos ?? 0}</div>
              <div><b>Total movements:</b> {conteos[seleccion]?.total ?? 0}</div>
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
                disabled={!puedeProcesar || cargando}
                onClick={onProcesar}
              >
                Process
              </button>
            </div>
            <p className="mt-3 text-xs text-blue-700">
              Select date(s) to close out and press <b>Process</b> to begin closeout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
