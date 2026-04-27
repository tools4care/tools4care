import { createContext, useContext, useState, useEffect, useRef } from "react";
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

  // 🆕 Ref para evitar llamadas duplicadas (getSession + onAuthStateChange)
  const loadingRef = useRef(false);
  const lastSessionIdRef = useRef(null);

  async function cargarUsuarioActual(session, source = "unknown") {
    if (!session?.user) {
      // no session → logout
      setUsuario(null);
      guardarUsuarioCache(null);
      setCargando(false);
      return;
    }

    const userAuth = session.user;

    // 🆕 Evitar llamadas duplicadas con la misma sesión
    const sessionFingerprint = `${userAuth.id}-${session.access_token?.slice(-10)}`;
    if (loadingRef.current && lastSessionIdRef.current === sessionFingerprint) {
      // already loading this session, skip
      return;
    }
    loadingRef.current = true;
    lastSessionIdRef.current = sessionFingerprint;

    // 🆕 PRIMERO: intentar usar caché para mostrar UI rápido
    const cachedUser = obtenerUsuarioCache();
    if (cachedUser && cachedUser.id === userAuth.id) {
      // Mostrar usuario cacheado inmediatamente (sin esperar red)
      setUsuario(cachedUser);
      setCargando(false);
      // loaded from cache
    }

    // 🆕 Si no hay conexión, quedarse con el caché
    if (!navigator.onLine) {
      // offline — using cache
      if (!cachedUser || cachedUser.id !== userAuth.id) {
        // Sin caché válido y sin red → no podemos hacer nada
        setUsuario(null);
        guardarUsuarioCache(null);
      }
      setCargando(false);
      loadingRef.current = false;
      return;
    }

    // 🆕 Con conexión: consultar DB para datos frescos
    try {
      const { data: userRow, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("id", userAuth.id)
        .maybeSingle();

      // ─── 🔒 FIX PRINCIPAL: Si hay error de RED, NO asumir que el usuario no existe ───
      if (error) {
        const msg = (error.message || "").toLowerCase();
        const isNetworkError =
          error.code === "PGRST000" ||
          msg.includes("fetch") ||
          msg.includes("network") ||
          msg.includes("timeout") ||
          msg.includes("failed") ||
          msg.includes("abort") ||
          msg.includes("load") ||
          msg.includes("cors") ||
          !navigator.onLine;

        if (isNetworkError) {
          console.warn(`[UsuarioContext] (${source}) ⚠️ Error de red consultando usuario:`, error.message);
          // Usar caché como fallback — NO hacer signOut
          if (cachedUser && cachedUser.id === userAuth.id) {
            setUsuario(cachedUser);
            // network error — falling back to cache
          }
          setCargando(false);
          loadingRef.current = false;
          return;
        }

        // Si es un error de DB real (no de red), loguear pero no hacer signOut
        console.error(`[UsuarioContext] (${source}) Error DB:`, error);
        if (cachedUser && cachedUser.id === userAuth.id) {
          setUsuario(cachedUser);
          setCargando(false);
          loadingRef.current = false;
          return;
        }
      }

      // ─── Usuario encontrado en DB ───
      if (userRow) {
        // 🔒 Block inactive users — they cannot log in
        if (userRow.activo === false) {
          console.warn(`[UsuarioContext] (${source}) 🚫 Usuario inactivo:`, userRow.email);
          setUsuario(null);
          guardarUsuarioCache(null);
          setCargando(false);
          loadingRef.current = false;
          alert("Tu cuenta ha sido desactivada. Contacta a tu administrador.");
          await supabase.auth.signOut();
          return;
        }

        setUsuario(userRow);
        guardarUsuarioCache(userRow);
        // user loaded from DB
        setCargando(false);
        loadingRef.current = false;
        return;
      }

      // ─── Usuario NO encontrado (userRow === null, sin error) ───
      // Solo aquí es legítimo crear usuario nuevo

      // 2. Verificar si el email ya existe con otro ID
      const { data: usuarioConEmail, error: errEmail } = await supabase
        .from("usuarios")
        .select("*")
        .eq("email", userAuth.email)
        .maybeSingle();

      if (errEmail) {
        console.warn(`[UsuarioContext] (${source}) Error buscando por email:`, errEmail.message);
        // Error de red buscando email → usar caché, no hacer signOut
        if (cachedUser && cachedUser.id === userAuth.id) {
          setUsuario(cachedUser);
        }
        setCargando(false);
        loadingRef.current = false;
        return;
      }

      if (usuarioConEmail && usuarioConEmail.id !== userAuth.id) {
        setUsuario(null);
        guardarUsuarioCache(null);
        setCargando(false);
        loadingRef.current = false;
        alert("El correo ya existe con otro usuario. Haz logout y contacta al administrador.");
        await supabase.auth.signOut();
        return;
      }

      // 3. Crear usuario nuevo
      const { data: nuevoUsuario, error: errorCrear } = await supabase
        .from("usuarios")
        .insert([
          {
            id: userAuth.id,
            email: userAuth.email,
            nombre: userAuth.user_metadata?.full_name || "",
            rol: "vendedor", // new users start with minimum access (admin can promote via /usuarios)
            activo: true,
          }
        ])
        .select()
        .maybeSingle();

      if (errorCrear || !nuevoUsuario) {
        console.error(`[UsuarioContext] (${source}) Error creando usuario:`, errorCrear?.message);

        // 🆕 FIX: Si falla el insert, tal vez ya existe (race condition)
        // Intentar una vez más buscarlo
        const { data: retry } = await supabase
          .from("usuarios")
          .select("*")
          .eq("id", userAuth.id)
          .maybeSingle();

        if (retry) {
          setUsuario(retry);
          guardarUsuarioCache(retry);
          // found on retry
          setCargando(false);
          loadingRef.current = false;
          return;
        }

        // Solo hacer signOut si realmente no se puede resolver
        setUsuario(null);
        guardarUsuarioCache(null);
        setCargando(false);
        loadingRef.current = false;
        alert("Error creando el usuario en la base. Contacta soporte.");
        await supabase.auth.signOut();
        return;
      }

      setUsuario(nuevoUsuario);
      guardarUsuarioCache(nuevoUsuario);
      // new user created

    } catch (err) {
      // 🆕 Catch general — NUNCA hacer signOut por errores inesperados
      console.error(`[UsuarioContext] (${source}) Error inesperado:`, err);
      if (cachedUser && cachedUser.id === userAuth.id) {
        setUsuario(cachedUser);
        // unexpected error — falling back to cache
      }
    } finally {
      setCargando(false);
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    let mounted = true;

    // 🆕 Mostrar caché inmediatamente mientras carga
    const cachedUser = obtenerUsuarioCache();
    if (cachedUser) {
      setUsuario(cachedUser);
      // showing cached user while session verifies
    }

    // 1. Cargar sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      cargarUsuarioActual(session, "getSession");
    });

    // 2. Escuchar cambios de sesión
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // auth event: ${event}

      // SIGNED_OUT → limpiar todo
      if (event === "SIGNED_OUT") {
        setUsuario(null);
        guardarUsuarioCache(null);
        setCargando(false);
        return;
      }

      // 🆕 Para TOKEN_REFRESHED, solo actualizar si ya tenemos usuario
      // No re-consultar la DB innecesariamente
      if (event === "TOKEN_REFRESHED") {
        // token refreshed — session still active
        // Si ya tenemos usuario en state, no hacer nada
        // El token se refrescó automáticamente, la sesión sigue válida
        return;
      }

      // SIGNED_IN o INITIAL_SESSION → cargar usuario
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        cargarUsuarioActual(session, `onAuthStateChange:${event}`);
      }
    });

    // 🆕 Listener para cuando la app vuelve del background
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // app resumed — checking session
        // Solo refrescar la sesión, no recargar usuario completo
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!mounted) return;
          if (!session) {
            // La sesión realmente expiró
            setUsuario(null);
            guardarUsuarioCache(null);
            setCargando(false);
          }
          // Si hay sesión, no hacer nada — el usuario ya está en state/caché
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // (debug log removed from production)

  return (
    <UsuarioContext.Provider value={{ usuario, setUsuario, cargando }}>
      {children}
    </UsuarioContext.Provider>
  );
}