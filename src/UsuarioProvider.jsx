import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const UsuarioContext = createContext();

export function useUsuario() {
  return useContext(UsuarioContext);
}

export function UsuarioProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setCargando(true);

    async function initUser(session) {
      if (!session?.user) {
        if (isMounted) setUsuario(null);
        return;
      }
      // Siempre usa ID de Auth para buscar/crear usuario
      let { data: userRow } = await supabase
        .from("usuarios")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!userRow) {
        // Crea usuario si no existe
        let { data: nuevoUsuario, error } = await supabase
          .from("usuarios")
          .insert([{
            id: session.user.id,
            email: session.user.email,
            nombre: session.user.user_metadata?.full_name || "",
            rol: "admin",
            activo: true,
          }])
          .select()
          .maybeSingle();

        if (isMounted) setUsuario(nuevoUsuario ?? null);
      } else {
        if (isMounted) setUsuario(userRow);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      initUser(session);
      setCargando(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setCargando(true);
        initUser(session).then(() => setCargando(false));
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return (
    <UsuarioContext.Provider value={{ usuario, setUsuario, cargando }}>
      {children}
    </UsuarioContext.Provider>
  );
}
