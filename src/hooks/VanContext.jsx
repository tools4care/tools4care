// src/hooks/VanContext.jsx
// =====================================================================
// Workspace location is explicitly confirmed per user and browser session.
// It is intentionally not synchronized between devices.
// =====================================================================
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { useUsuario } from "../UsuarioContext";
import {
  clearConfirmedLocation,
  loadConfirmedLocation,
  persistConfirmedLocation,
} from "../lib/locationSession";

const VanContext = createContext();

export function useVan() {
  return useContext(VanContext);
}

export default function VanProvider({ children }) {
  const { usuario } = useUsuario();
  const [validatedLocationKey, setValidatedLocationKey] = useState("");
  const [locationSessionCheckedFor, setLocationSessionCheckedFor] = useState("");
  const [van, setVanState] = useState(null);
  const previousUserIdRef = useRef(null);

  // A location is operational state, not an account preference. Restore it
  // only when this same user confirmed it in the current browser session.
  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (!usuario?.id) {
      if (previousUserId) {
        try { clearConfirmedLocation(previousUserId); } catch { /* optional storage */ }
      }
      previousUserIdRef.current = null;
      setVanState(null);
      setLocationSessionCheckedFor("");
      return;
    }

    if (previousUserId && previousUserId !== usuario.id) {
      try { clearConfirmedLocation(previousUserId); } catch { /* optional storage */ }
    }
    previousUserIdRef.current = usuario.id;
    let confirmed = null;
    try { confirmed = loadConfirmedLocation(usuario.id); } catch { /* optional storage */ }
    setVanState(confirmed);
    setLocationSessionCheckedFor(usuario.id);
  }, [usuario?.id]);

  // Keep the confirmed location on this device/session. Do not restore or
  // synchronize it across devices: each workstation must choose explicitly.
  const setVan = (newVan) => {
    setVanState(newVan);
    try {
      if (newVan) {
        persistConfirmedLocation(usuario?.id, newVan);
      } else {
        clearConfirmedLocation(usuario?.id);
      }
    } catch {
      // Storage is optional (for example in restricted private browsing).
    }
  };

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
            clearConfirmedLocation(usuario.id);
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
    usuario?.id && (
      locationSessionCheckedFor !== usuario.id
      || (usuario?.rol !== "admin" && van?.id && validatedLocationKey !== currentLocationKey)
    )
  );

  return (
    <VanContext.Provider value={{ van, setVan, locationAccessChecking }}>
      {children}
    </VanContext.Provider>
  );
}
