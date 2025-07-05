import { useState } from "react";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { setUsuario } = useUsuario();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setUsuario(data.user);
      navigate("/van");
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <form className="bg-white p-8 rounded shadow w-80" onSubmit={handleLogin}>
        <h2 className="mb-4 text-lg font-bold">Iniciar sesión</h2>
        {error && <div className="mb-2 text-red-500">{error}</div>}
        <input
          type="email"
          placeholder="Correo"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full p-2 mb-3 border rounded"
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full p-2 mb-3 border rounded"
          required
        />
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
          Iniciar sesión
        </button>
      </form>
    </div>
  );
}
