// src/storefront/AuthCallback.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";


export default function AuthCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Procesando autenticación…");
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // El "code" puede venir en query (?code=) o, en algunos flujos, en el hash (#...).
        const url = new URL(window.location.href);
        const codeFromQuery = url.searchParams.get("code");
        const codeFromHash = new URLSearchParams(url.hash.replace(/^#/, "?")).get("code");
        const code = codeFromQuery || codeFromHash;

        // Soportar redirección opcional: /auth/callback?next=/checkout
        const next =
          url.searchParams.get("next") ||
          url.searchParams.get("redirect") ||
          "/storefront";

        if (!code) {
          setErr("Falta el código de verificación en la URL.");
          setMsg("");
          return;
        }

        setMsg("Intercambiando el código por una sesión…");
        const { error } = await supabase.auth.exchangeCodeForSession({ code });
        if (error) throw error;

        if (cancelled) return;
        setMsg("¡Listo! Redirigiendo…");
        // Pequeño delay para que supabase actualice el estado
        setTimeout(() => navigate(next, { replace: true }), 400);
      } catch (e) {
        if (cancelled) return;
        setErr(e?.message || "No se pudo completar la autenticación.");
        setMsg("");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white shadow-sm p-6 text-center">
        <h1 className="text-xl font-semibold">Autenticando…</h1>
        {msg && <p className="mt-2 text-gray-700">{msg}</p>}
        {err && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm">
            {err}
            <div className="mt-2">
              <a href="/storefront" className="text-blue-600 hover:underline">
                Volver a la tienda
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
