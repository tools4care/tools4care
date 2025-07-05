import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const UsuarioContext = createContext();

export function useUsuario() {
  return useContext(UsuarioContext);
}

export default function UsuarioProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // LOGIN
  async function login(email, password) {
    setCargando(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data?.user) {
      setCargando(false);
      return error?.message || "No se pudo iniciar sesión";
    }

    // Buscar el usuario en tu tabla usuarios
    const { data: usuarioDB, error: errorDB } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (errorDB || !usuarioDB) {
      setCargando(false);
      return "Usuario no encontrado en la base de datos";
    }

    setUsuario(usuarioDB);
    setCargando(false);
    return null; // éxito
  }

  // LOGOUT
  async function logout() {
    setCargando(true);
    await supabase.auth.signOut();
    setUsuario(null);
    setCargando(false);
  }

  // AUTOLOGIN por sesión activa
  useEffect(() => {
    async function fetchUsuario() {
      setCargando(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUsuario(null);
        setCargando(false);
        return;
      }
      // Buscar el usuario en tu tabla usuarios
      const { data: usuarioDB, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("email", user.email)
        .maybeSingle();

      setUsuario(usuarioDB || null);
      setCargando(false);
    }
    fetchUsuario();

    // Subscripción a cambios de sesión (opcional pero recomendado)
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        fetchUsuario();
      }
    );
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <UsuarioContext.Provider value={{ usuario, setUsuario, login, logout, cargando }}>
      {children}
    </UsuarioContext.Provider>
  );
}
