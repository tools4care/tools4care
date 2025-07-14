import { useState } from "react";
import { useUsuario } from "./UsuarioContext";

import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { setUsuario } = useUsuario();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      setUsuario(data.user);
      navigate("/van");
    } else {
      alert("Error al iniciar sesión");
    }
  };

  return (
    <form onSubmit={handleLogin} className="flex flex-col gap-2 max-w-xs mx-auto mt-20">
      <h2 className="text-lg font-bold mb-2">Iniciar sesión</h2>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="border px-2 py-1" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" className="border px-2 py-1" />
      <button type="submit" className="bg-blue-600 text-white py-2 rounded">Iniciar sesión</button>
    </form>
  );
}
