import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function AuthPanel({ open, onClose }) {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        onClose?.();
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pass });
        if (error) throw error;
        alert("Cuenta creada. Revisa tu correo si te piden confirmación.");
        onClose?.();
      }
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</h2>
          <button className="w-8 h-8 rounded-full hover:bg-gray-100" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {err && <div className="p-2 text-sm bg-red-50 text-red-700 rounded">{err}</div>}
          <input
            type="email"
            placeholder="Correo"
            className="w-full border rounded-lg px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            className="w-full border rounded-lg px-3 py-2"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white py-2 font-semibold disabled:opacity-60"
          >
            {loading ? "Procesando…" : (mode === "login" ? "Entrar" : "Registrarme")}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-600">
          {mode === "login" ? (
            <>
              ¿No tienes cuenta?{" "}
              <button className="text-blue-600 hover:underline" onClick={() => setMode("signup")}>
                Crear una
              </button>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{" "}
              <button className="text-blue-600 hover:underline" onClick={() => setMode("login")}>
                Inicia sesión
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
