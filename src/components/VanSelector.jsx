import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVan } from "../hooks/VanContext";
import { supabase } from "../supabaseClient";

export default function VanSelector({ onSelect }) {
  const { setVan } = useVan();
  const navigate = useNavigate();
  const [vans, setVans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarVans() {
      setLoading(true);
      const { data, error } = await supabase.from("vans").select("*");
      setVans(data || []);
      setLoading(false);
    }
    cargarVans();
  }, []);

  function handleSeleccionar(van) {
    setVan(van);
    localStorage.setItem("van", JSON.stringify(van));
    if (onSelect) onSelect(van);
    else navigate("/"); // Por defecto, redirige al home solo si no hay onSelect
  }

  return (
    <div className="flex justify-center items-center h-screen bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow text-center min-w-[320px]">
        <h2 className="font-bold text-lg mb-6">Selecciona una VAN</h2>
        {loading ? (
          <div>
            <div className="animate-pulse h-8 bg-gray-200 rounded mb-2" />
            <div className="animate-pulse h-8 bg-gray-200 rounded mb-2" />
          </div>
        ) : vans.length === 0 ? (
          <div className="text-gray-500">No hay vans disponibles</div>
        ) : (
          <div className="flex flex-col gap-2">
            {vans.map((van) => (
              <button
                key={van.id}
                onClick={() => handleSeleccionar(van)}
                className="bg-blue-100 hover:bg-blue-400 hover:text-white transition rounded-lg p-3 font-semibold w-full"
              >
                {van.nombre_van}
                <div className="text-xs text-gray-500">{van.placa}</div>
                <div className="text-xs text-gray-400">{van.descripcion}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
