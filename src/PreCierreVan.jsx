// src/PreCierreVan.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

/* ========================= Helpers ========================= */

/** Devuelve límites YYYY-MM-DDT00:00:00 → YYYY-MM-DDT23:59:59 */
function dayBounds(dia) {
  return {
    start: `${dia}T00:00:00`,
    end: `${dia}T23:59:59`,
  };
}

/** Formato visual MM-DD-YYYY para fechas tipo 'YYYY-MM-DD' (o con tiempo). */
function formatUS(d) {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  if (!y || !m || !day) return d;
  return `${m}-${day}-${y}`;
}

/** Cuenta ventas del día por van usando solo tablas (sin RPC).
 *  Intenta primero cierre_id IS NULL; si falla, usa cerrado = false.
 */
async function contarVentasDia(van_id, dia) {
  const { start, end } = dayBounds(dia);

  // Intento 1: cierre_id IS NULL
  {
    const { count, error } = await supabase
      .from("ventas")
      .select("id", { count: "exact", head: true })
      .eq("van_id", van_id)
      .gte("fecha", start)
      .lte("fecha", end)
      .is("cierre_id", null);

    if (!error) return count || 0;
  }

  // Intento 2: cerrado = false (por si no existe cierre_id)
  {
    const { count, error } = await supabase
      .from("ventas")
      .select("id", { count: "exact", head: true })
      .eq("van_id", van_id)
      .gte("fecha", start)
      .lte("fecha", end)
      .eq("cerrado", false);

    if (!error) return count || 0;
  }

  // Fallback defensivo
  return 0;
}

/** Cuenta pagos del día por van usando solo tablas (sin RPC).
 *  Igual estrategia que ventas.
 */
async function contarPagosDia(van_id, dia) {
  const { start, end } = dayBounds(dia);

  // Intento 1: cierre_id IS NULL
  {
    const { count, error } = await supabase
      .from("pagos")
      .select("id", { count: "exact", head: true })
      .eq("van_id", van_id)
      .gte("fecha_pago", start)
      .lte("fecha_pago", end)
      .is("cierre_id", null);

    if (!error) return count || 0;
  }

  // Intento 2: cerrado = false
  {
    const { count, error } = await supabase
      .from("pagos")
      .select("id", { count: "exact", head: true })
      .eq("van_id", van_id)
      .gte("fecha_pago", start)
      .lte("fecha_pago", end)
      .eq("cerrado", false);

    if (!error) return count || 0;
  }

  return 0;
}

/** Cuenta ventas/pagos del día (ligero) */
async function contarPorFecha(van_id, fecha) {
  try {
    const [ventas, pagos] = await Promise.all([
      contarVentasDia(van_id, fecha),
      contarPagosDia(van_id, fecha),
    ]);
    return { ventas, pagos, total: ventas + pagos };
  } catch {
    return { ventas: 0, pagos: 0, total: 0 };
  }
}

/** Devuelve set de días (YYYY-MM-DD) que ya tienen cierre registrado (start==end) */
async function diasYaCerrados(van_id, dias) {
  if (!van_id || dias.length === 0) return new Set();
  const { data, error } = await supabase
    .from("cierres_van")
    .select("fecha_inicio, fecha_fin")
    .eq("van_id", van_id)
    .in("fecha_inicio", dias)
    .in("fecha_fin", dias);

  if (error) return new Set();
  const set = new Set(
    (data || [])
      .map((c) => {
        const ini = (c.fecha_inicio || "").slice(0, 10);
        const fin = (c.fecha_fin || "").slice(0, 10);
        return ini === fin ? ini : null;
      })
      .filter(Boolean)
  );
  return set;
}

/** Lista de fechas con pendientes (solo tablas, sin RPC) */
function useFechasPendientes(van_id) {
  const [fechas, setFechas] = useState([]);

  useEffect(() => {
    if (!van_id) {
      setFechas([]);
      return;
    }

    (async () => {
      // Escaneamos últimos 21 días
      const pad = (n) => String(n).padStart(2, "0");
      const hoyDate = new Date();
      const dias = [];
      for (let i = 0; i < 21; i++) {
        const d = new Date(hoyDate);
        d.setDate(d.getDate() - i);
        dias.push(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        );
      }

      // Conteo real por día
      const encontrados = [];
      for (const dia of dias) {
        try {
          const { total } = await contarPorFecha(van_id, dia);
          if (total > 0) encontrados.push(dia);
        } catch {
          /* noop */
        }
      }

      let list = encontrados;

      // Preferencia: conservarla solo si realmente tiene pendientes
      try {
        const pref = localStorage.getItem("pre_cierre_fecha");
        if (pref && !list.includes(pref)) {
          const c = await contarPorFecha(van_id, pref);
          if ((c?.total || 0) > 0) list.unshift(pref);
        }
      } catch {
        /* noop */
      }

      // Quitar el último día cerrado (optimista, desde localStorage)
      try {
        const lastClosed = localStorage.getItem("pre_cierre_last_closed");
        if (lastClosed) {
          list = list.filter((f) => f !== lastClosed);
          localStorage.removeItem("pre_cierre_last_closed");
        }
      } catch {
        /* noop */
      }

      // Quitar días que YA tengan un cierre registrado (fuente de verdad)
      try {
        const setCerrados = await diasYaCerrados(van_id, list);
        if (setCerrados.size > 0) {
          list = list.filter((f) => !setCerrados.has(f));
        }
      } catch {
        /* noop */
      }

      setFechas(Array.from(new Set(list)));
    })();
  }, [van_id]);

  return fechas;
}

/* ========================= Componente ========================= */

export default function PreCierreVan() {
  const { van } = useVan();
  const navigate = useNavigate();
  const fechas = useFechasPendientes(van?.id);

  const [seleccion, setSeleccion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [conteos, setConteos] = useState({}); // { 'YYYY-MM-DD': {ventas, pagos, total} }

  // Prefetch de conteos para las fechas listadas
  useEffect(() => {
    if (!van?.id || fechas.length === 0) return;
    let cancel = false;

    (async () => {
      const pendientes = fechas.filter((f) => !conteos[f]);
      if (pendientes.length === 0) return;

      const entradas = await Promise.all(
        pendientes.map(async (f) => [f, await contarPorFecha(van.id, f)])
      );
      if (!cancel) {
        setConteos((prev) => {
          const next = { ...prev };
          for (const [f, val] of entradas) next[f] = val;
          return next;
        });
      }
    })();

    return () => {
      cancel = true;
    };
  }, [van?.id, fechas, conteos]);

  // Filtrar definitivamente las fechas con total > 0 (si aún no hay conteo, la dejamos)
  const fechasVisibles = useMemo(() => {
    if (!fechas?.length) return [];
    return fechas.filter((f) => (conteos[f]?.total ?? 1) > 0);
  }, [fechas, conteos]);

  // Selección inicial (respeta preferencia, cae al primer visible)
  useEffect(() => {
    if (fechasVisibles.length === 0) {
      setSeleccion("");
      return;
    }
    let pref = "";
    try {
      pref = localStorage.getItem("pre_cierre_fecha") || "";
    } catch {}
    if (pref && fechasVisibles.includes(pref)) setSeleccion(pref);
    else setSeleccion(fechasVisibles[0]);
  }, [fechasVisibles]);

  // Si el seleccionado deja de estar visible (porque total quedó 0), mover la selección
  useEffect(() => {
    if (seleccion && !fechasVisibles.includes(seleccion)) {
      setSeleccion(fechasVisibles[0] || "");
    }
  }, [fechasVisibles, seleccion]);

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const puedeProcesar = Boolean(seleccion) && (conteos[seleccion]?.total ?? 0) > 0;

  const onProcesar = async () => {
    if (!puedeProcesar || cargando) return;
    try {
      localStorage.setItem("pre_cierre_fecha", seleccion);
      // Optimista: marcamos como “último cerrado” para que desaparezca al volver
      localStorage.setItem("pre_cierre_last_closed", seleccion);
    } catch {}
    navigate("/cierres/van"); // Ruta del cierre real
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
                {fechasVisibles.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-3 text-center text-gray-400">
                      ✅ No pending days
                    </td>
                  </tr>
                ) : (
                  fechasVisibles.map((f) => (
                    <tr
                      key={f}
                      className={`cursor-pointer hover:bg-blue-50 ${
                        seleccion === f ? "bg-blue-50" : ""
                      }`}
                      onClick={() => {
                        setSeleccion(f);
                        try {
                          localStorage.setItem("pre_cierre_fecha", f);
                        } catch {}
                      }}
                    >
                      <td className="p-2">
                        {formatUS(f)}
                        {f === hoy ? " (Today)" : ""}
                      </td>
                      <td className="p-2 text-right">
                        {conteos[f]?.ventas ?? 0}
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
              <div>
                <b>Sales pending:</b> {conteos[seleccion]?.ventas ?? 0}
              </div>
              <div>
                <b>Payments pending:</b> {conteos[seleccion]?.pagos ?? 0}
              </div>
              <div>
                <b>Total movements:</b> {conteos[seleccion]?.total ?? 0}
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
                disabled={!puedeProcesar || cargando}
                onClick={onProcesar}
              >
                Process
              </button>
            </div>
            <p className="mt-3 text-xs text-blue-700">
              Select date(s) to close out and press <b>Process</b> to begin
              closeout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
