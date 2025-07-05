import { useState, useEffect } from "react";

function useUsuarioSesion() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem("usuario");
    if (usuarioGuardado) {
      setUsuario(JSON.parse(usuarioGuardado));
    }
    setCargando(false);
  }, []); // <--- SOLO UNA VEZ

  return { usuario, cargando };
}

export default useUsuarioSesion;
