// src/components/VanSelector.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
// ⚠️ Mantengo tu import tal cual; si tu hook está en otra ruta, ajústalo.
import { useVan } from "../hooks/VanContext";
import { supabase } from "../supabaseClient";

export default function VanSelector({ onSelect }) {
  const { setVan } = useVan();
  const navigate = useNavigate();
  const [vans, setVans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ignore = false;
    async function cargarVans() {
      setLoading(true);
      setErr("");
      try {
        const { data, error } = await supabase
          .from("v_vans_app") // ← usamos la vista con columnas: id, nombre, placa, activo
          .select("id, nombre, placa, activo")
          .eq("activo", true)
          .order("nombre", { ascending: true });

        if (error) throw error;
        if (!ignore) setVans(data || []);
      } catch (e) {
        if (!ignore) setErr(e.message || "Error cargando vans");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    cargarVans();
    return () => { ignore = true; };
  }, []);

  function handleSeleccionar(v) {
    // Alias para compatibilidad con código viejo que usa `nombre_van`
    const compatible = { ...v, nombre_van: v.nombre };
    setVan(compatible);
    localStorage.setItem("van", JSON.stringify(compatible));
    if (onSelect) onSelect(compatible);
    else navigate("/");
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow text-center min-w-[320px]">
        <h2 className="font-bold text-lg mb-6">Selecciona una VAN</h2>

        {loading ? (
          <div>
            <div className="animate-pulse h-8 bg-gray-200 rounded mb-2" />
            <div className="animate-pulse h-8 bg-gray-200 rounded mb-2" />
          </div>
        ) : err ? (
          <div className="text-red-600 text-sm">{err}</div>
        ) : vans.length === 0 ? (
          <div className="text-gray-500">No hay vans disponibles</div>
        ) : (
          <div className="flex flex-col gap-2">
            {vans.map((van) => (
              <button
                key={van.id}
                onClick={() => handleSeleccionar(van)}
                className="bg-blue-100 hover:bg-blue-400 hover:text-white transition rounded-lg p-3 font-semibold w-full text-left"
              >
                <div className="text-base">{van.nombre}</div>
                {van.placa && (
                  <div className="text-xs opacity-70">{van.placa}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
