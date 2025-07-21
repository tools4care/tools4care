import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const UsuarioContext = createContext();

export function useUsuario() {
  return useContext(UsuarioContext);
}

export function UsuarioProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Esta función busca el usuario en la base y lo guarda en el estado global
  async function cargarUsuarioActual(session) {
    if (!session?.user) {
      setUsuario(null);
      setCargando(false);
      return;
    }
    const userAuth = session.user;

    // 1. Busca por ID (Auth UUID)
    let { data: userRow, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", userAuth.id)
      .maybeSingle();

    // 2. Si NO existe, verifica si el email ya está en uso con otro ID
    if (!userRow) {
      let { data: usuarioConEmail } = await supabase
        .from("usuarios")
        .select("*")
        .eq("email", userAuth.email)
        .maybeSingle();

      if (usuarioConEmail && usuarioConEmail.id !== userAuth.id) {
        setUsuario(null);
        setCargando(false);
        alert("El correo ya existe con otro usuario. Haz logout y contacta al administrador.");
        await supabase.auth.signOut();
        return;
      }

      // 3. Si NO existe el email, crea el usuario con el ID del Auth
      const { data: nuevoUsuario, error: errorCrear } = await supabase
        .from("usuarios")
        .insert([
          {
            id: userAuth.id,
            email: userAuth.email,
            nombre: userAuth.user_metadata?.full_name || "",
            rol: "admin", // Personaliza según tu lógica
            activo: true, // Personaliza según tu lógica
          }
        ])
        .select()
        .maybeSingle();

      if (errorCrear || !nuevoUsuario) {
        setUsuario(null);
        setCargando(false);
        alert("Error creando el usuario en la base. Contacta soporte.");
        await supabase.auth.signOut();
        return;
      }
      setUsuario(nuevoUsuario);
    } else {
      setUsuario(userRow);
    }
    setCargando(false);
  }

  // Mantiene sesión entre recargas y responde a cambios de login/logout automáticamente
  useEffect(() => {
    let mounted = true;
    setCargando(true);

    // 1. Carga sesión inicial (esto funciona en recargas y auto-login)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      cargarUsuarioActual(session);
    });

    // 2. Escucha cambios de sesión (login, logout, refresh) y actualiza usuario automáticamente
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      cargarUsuarioActual(session);
    });

    // Limpieza del listener al desmontar
    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
    // No añadas dependencias aquí (solo en el primer montaje)
    // eslint-disable-next-line
  }, []);

  // Log de depuración para que veas el estado actual siempre que cambie usuario/cargando
  useEffect(() => {
    console.log("[UsuarioContext] usuario:", usuario, "cargando:", cargando);
  }, [usuario, cargando]);

  return (
    <UsuarioContext.Provider value={{ usuario, setUsuario, cargando }}>
      {children}
    </UsuarioContext.Provider>
  );
}
