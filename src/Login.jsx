// src/Login.jsx
import { useState, useEffect } from "react";
import { useUsuario } from "./UsuarioContext";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { usuario, cargando } = useUsuario();
  const navigate = useNavigate();

  // Redirige automáticamente si ya está logueado
  useEffect(() => {
    if (!cargando && usuario) {
      navigate("/van", { replace: true }); // Dashboard o inicio
    }
  }, [usuario, cargando, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErrorMsg("Email o contraseña incorrectos. Intenta de nuevo.");
    } // Si no hay error, el contexto redirigirá automáticamente
  };

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-blue-700">
        <svg className="animate-spin h-12 w-12 mb-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <div className="text-lg font-medium">Cargando tu sesión...</div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleLogin}
      className="flex flex-col gap-3 max-w-xs mx-auto mt-32 bg-white rounded-xl shadow p-8 border"
      autoComplete="on"
    >
      <h2 className="text-2xl font-bold mb-4 text-center text-blue-900">Iniciar sesión</h2>
      {errorMsg && (
        <div className="bg-red-100 text-red-700 border border-red-300 rounded px-3 py-2 text-sm text-center">
          {errorMsg}
        </div>
      )}
      <input
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
        className="border rounded px-3 py-2 focus:outline-blue-400"
        type="email"
        required
        autoFocus
        autoComplete="username"
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Contraseña"
        className="border rounded px-3 py-2 focus:outline-blue-400"
        required
        autoComplete="current-password"
      />
      <button
        type="submit"
        className="bg-blue-700 hover:bg-blue-800 text-white py-2 rounded-xl font-semibold shadow mt-2 transition"
      >
        Iniciar sesión
      </button>
      <div className="text-xs text-center text-gray-400 mt-2">
        © {new Date().getFullYear()} TOOLS4CARE
      </div>
    </form>
  );
}
