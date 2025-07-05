// src/UsuarioContext.jsx
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
    async function cargarUsuario() {
      setCargando(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userAuth = session?.user;

      if (userAuth) {
        // 1. Busca el usuario en tu tabla usuarios por ID (UUID de Auth)
        let { data: userRow, error } = await supabase
          .from("usuarios")
          .select("*")
          .eq("id", userAuth.id)
          .maybeSingle();

        // 2. Si NO existe, verifica si el email ya está en uso con otro ID
        if (!userRow) {
          let { data: usuarioConEmail, error: errorEmail } = await supabase
            .from("usuarios")
            .select("*")
            .eq("email", userAuth.email)
            .maybeSingle();

          if (usuarioConEmail && usuarioConEmail.id !== userAuth.id) {
            // El email ya existe pero con otro ID: error crítico
            setUsuario(null);
            setCargando(false);
            alert(
              "El correo ya existe con otro usuario. Haz logout y contacta al administrador."
            );
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
                rol: "admin", // Quita o personaliza según tu lógica
                activo: true, // Quita o personaliza según tu lógica
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
          // 4. Usuario existe correctamente
          setUsuario(userRow);
        }
      } else {
        setUsuario(null);
      }
      setCargando(false);
    }
    cargarUsuario();
  }, []);

  return (
    <UsuarioContext.Provider value={{ usuario, setUsuario, cargando }}>
      {children}
    </UsuarioContext.Provider>
  );
}
