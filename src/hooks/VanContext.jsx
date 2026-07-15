// src/hooks/VanContext.jsx
// =====================================================================
// VanContext MEJORADO: Persiste la selección de van en Supabase
// para que ambos dispositivos (PC + Phone) compartan la misma van
// =====================================================================
/* eslint-disable react-refresh/only-export-components */

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
  const [validatedLocationKey, setValidatedLocationKey] = useState("");
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
    } catch {
      // localStorage is optional (for example in restricted private browsing).
    }

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

  // Invalidate a location saved on this device when an administrator later
  // restricts the user to a different set of locations. No assignment rows
  // remains the backward-compatible "all locations" rule.
  useEffect(() => {
    let active = true;

    async function validateSelectedLocation() {
      if (!usuario?.id || usuario?.rol === "admin" || !van?.id) {
        return;
      }

      const validationKey = `${usuario.id}:${van.id}`;
      const { data, error } = await supabase
        .from("usuarios_vans")
        .select("van_id, activo")
        .eq("usuario_id", usuario.id);

      if (!active) return;
      if (!error && Array.isArray(data) && data.length > 0) {
        const allowed = data.some((assignment) => assignment.activo !== false && assignment.van_id === van.id);
        if (!allowed) {
          setVanState(null);
          try {
            localStorage.removeItem(VAN_STORAGE_KEY);
            localStorage.removeItem("van");
          } catch {
            // Storage may be unavailable in private browsing; state is enough.
          }
        }
      }
      if (error) console.warn("Could not validate location access:", error.message);
      setValidatedLocationKey(validationKey);
    }

    validateSelectedLocation();
    return () => { active = false; };
  }, [usuario?.id, usuario?.rol, van?.id]);

  const currentLocationKey = usuario?.id && van?.id ? `${usuario.id}:${van.id}` : "";
  const locationAccessChecking = Boolean(
    usuario?.id && usuario?.rol !== "admin" && van?.id && validatedLocationKey !== currentLocationKey
  );

  return (
    <VanContext.Provider value={{ van, setVan, locationAccessChecking }}>
      {children}
    </VanContext.Provider>
  );
}
