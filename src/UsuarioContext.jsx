import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const UsuarioContext = createContext();

export function useUsuario() {
  return useContext(UsuarioContext);
}

// 🆕 HELPERS PARA CACHE LOCAL
const USUARIO_CACHE_KEY = 'usuario_cache';

function guardarUsuarioCache(usuario) {
  try {
    if (usuario) {
      localStorage.setItem(USUARIO_CACHE_KEY, JSON.stringify(usuario));
    } else {
      localStorage.removeItem(USUARIO_CACHE_KEY);
    }
  } catch (error) {
    console.error('Error guardando usuario en cache:', error);
  }
}

function obtenerUsuarioCache() {
  try {
    const cached = localStorage.getItem(USUARIO_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('Error obteniendo usuario de cache:', error);
    return null;
  }
}

export function UsuarioProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Esta función busca el usuario en la base y lo guarda en el estado global
  async function cargarUsuarioActual(session) {
    if (!session?.user) {
      setUsuario(null);
      guardarUsuarioCache(null); // 🆕 Limpiar cache
      setCargando(false);
      return;
    }
    const userAuth = session.user;

    // 🆕 MODO OFFLINE: Si no hay conexión, usar caché
    if (!navigator.onLine) {
      console.log('📵 Offline: Cargando usuario desde caché...');
      const cachedUser = obtenerUsuarioCache();
      if (cachedUser && cachedUser.id === userAuth.id) {
        setUsuario(cachedUser);
        setCargando(false);
        console.log('✅ Usuario cargado desde caché');
        return;
      } else {
        console.warn('⚠️ Sin usuario en caché o ID no coincide');
        setUsuario(null);
        setCargando(false);
        return;
      }
    }

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
        guardarUsuarioCache(null); // 🆕 Limpiar cache
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
            rol: "admin",
            activo: true,
          }
        ])
        .select()
        .maybeSingle();

      if (errorCrear || !nuevoUsuario) {
        setUsuario(null);
        guardarUsuarioCache(null); // 🆕 Limpiar cache
        setCargando(false);
        alert("Error creando el usuario en la base. Contacta soporte.");
        await supabase.auth.signOut();
        return;
      }
      setUsuario(nuevoUsuario);
      guardarUsuarioCache(nuevoUsuario); // 🆕 Guardar en cache
    } else {
      setUsuario(userRow);
      guardarUsuarioCache(userRow); // 🆕 Guardar en cache
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
      
      // 🆕 Limpiar cache al hacer logout
      if (event === 'SIGNED_OUT') {
        guardarUsuarioCache(null);
      }
      
      cargarUsuarioActual(session);
    });

    // Limpieza del listener al desmontar
    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // Log de depuración
  useEffect(() => {
    console.log("[UsuarioContext] usuario:", usuario, "cargando:", cargando);
  }, [usuario, cargando]);

  return (
    <UsuarioContext.Provider value={{ usuario, setUsuario, cargando }}>
      {children}
    </UsuarioContext.Provider>
  );
}