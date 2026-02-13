// src/hooks/VanContext.jsx
// =====================================================================
// VanContext MEJORADO: Persiste la selección de van en Supabase
// para que ambos dispositivos (PC + Phone) compartan la misma van
// =====================================================================

import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useUsuario } from "../UsuarioContext";

const VanContext = createContext();

export function useVan() {
  return useContext(VanContext);
}

// Key para localStorage (backup local)
const VAN_STORAGE_KEY = "tools4care_selected_van";

export default function VanProvider({ children }) {
  const { usuario } = useUsuario();
  const [van, setVanState] = useState(() => {
    // Inicializar desde localStorage
    try {
      const saved = localStorage.getItem(VAN_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Wrapper de setVan que también guarda en localStorage y en Supabase
  const setVan = async (newVan) => {
    setVanState(newVan);

    // Guardar en localStorage (siempre funciona, incluso offline)
    try {
      if (newVan) {
        localStorage.setItem(VAN_STORAGE_KEY, JSON.stringify(newVan));
      } else {
        localStorage.removeItem(VAN_STORAGE_KEY);
      }
    } catch {}

    // Guardar en Supabase (para sync entre dispositivos)
    if (usuario?.id && newVan?.id) {
      try {
        await supabase
          .from("usuario_sesion")
          .upsert(
            {
              usuario_id: usuario.id,
              van_id: newVan.id,
              van_data: newVan,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "usuario_id" }
          );
      } catch (err) {
        // Si la tabla no existe, no pasa nada
        console.warn("Could not sync van selection:", err?.message);
      }
    }
  };

  // Al iniciar, intentar cargar la van desde Supabase
  // (por si el otro dispositivo ya seleccionó una)
  useEffect(() => {
    async function syncVanFromCloud() {
      if (!usuario?.id || van?.id) return; // Ya tiene van, no sobrescribir

      try {
        const { data } = await supabase
          .from("usuario_sesion")
          .select("van_id, van_data")
          .eq("usuario_id", usuario.id)
          .maybeSingle();

        if (data?.van_data && data.van_data.id) {
          console.log("🔄 Van loaded from cloud session:", data.van_data.nombre);
          setVanState(data.van_data);
          localStorage.setItem(VAN_STORAGE_KEY, JSON.stringify(data.van_data));
        }
      } catch {
        // Si la tabla no existe, usar localStorage
      }
    }

    syncVanFromCloud();
  }, [usuario?.id]);

  return (
    <VanContext.Provider value={{ van, setVan }}>
      {children}
    </VanContext.Provider>
  );
}