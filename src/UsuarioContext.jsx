async function cargarUsuarioActual(session) {
  if (!session?.user) {
    setUsuario(null);
    setCargando(false);
    return;
  }
  const userAuth = session.user;

  // 1. Busca por ID (Auth UUID)
  let userRow, error;
  try {
    const result = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", userAuth.id)
      .maybeSingle();
    userRow = result.data;
    error = result.error;
  } catch (err) {
    setCargando(false);
    alert("Error de red o conexión. Intenta de nuevo.");
    return; // No forces logout todavía.
  }

  if (error) {
    setCargando(false);
    alert("Error consultando usuario. Intenta de nuevo.");
    return;
  }

  // 2. Si NO existe, verifica si el email ya está en uso con otro ID
  if (!userRow) {
    try {
      const { data: usuarioConEmail } = await supabase
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
            rol: "admin",
            activo: true,
          }
        ])
        .select()
        .maybeSingle();

      if (errorCrear || !nuevoUsuario) {
        setCargando(false);
        alert("Error creando el usuario en la base. Intenta más tarde.");
        return; // No cerrar sesión de inmediato
      }
      setUsuario(nuevoUsuario);
    } catch (err) {
      setCargando(false);
      alert("Error de red. Intenta de nuevo.");
      return;
    }
  } else {
    setUsuario(userRow);
  }
  setCargando(false);
}
