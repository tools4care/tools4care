import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

// Hook personalizado para obtener la sesión y el usuario actual de Supabase
export default function useUsuarioSesion() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let unsubscribe = null;

    // Carga inicial de la sesión
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUsuario(session?.user ?? null);
      setCargando(false);
    });

    // Listener para cambios de sesión (login/logout)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user ?? null);
      setCargando(false);
    });

    // Clean-up del listener
    unsubscribe = listener?.subscription?.unsubscribe;

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { usuario, cargando };
}
