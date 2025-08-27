// src/storefront/AuthModal.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function AuthModal({ open, mode = "login", onClose, onSignedIn }) {
  const [tab, setTab] = useState(mode); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState(""); // ✅ mensaje de confirmación enviada

  useEffect(() => setTab(mode), [mode]);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPass("");
      setName("");
      setPhone("");
      setErr("");
      setInfo("");
    }
  }, [open]);

  async function ensureCustomerRow(userId, profile = {}) {
    if (!userId) return;
    await supabase.from("store_customers").upsert(
      {
        id: userId,
        name: profile.name ?? null,
        phone: profile.phone ?? null,
        address_json: profile.address_json ?? null,
      },
      { onConflict: "id" }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setLoading(true);

    try {
      if (tab === "signup") {
        // ✅ Enviamos email con redirect a /auth/callback?next=/storefront
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            data: { name, role: "customer" }, // metadata útil
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/storefront`,
          },
        });
        if (error) throw error;

        // Si confirmación está desactivada en Supabase, llega session y entramos directo.
        const sessionUser = data?.session?.user || null;
        const userId = sessionUser?.id || null;

        if (userId) {
          await ensureCustomerRow(userId, { name, phone });
          onSignedIn?.(sessionUser);
          onClose?.();
          return;
        }

        // Si NO hay sesión (confirmación requerida), mostrar aviso y no cerrar.
        setInfo(
          "Te enviamos un enlace de confirmación a tu correo. Ábrelo y serás redirigido para completar el acceso."
        );
        return;
      }

      // === LOGIN (password) ===
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });
      if (error) throw error;

      const user = data?.user || data?.session?.user || null;
      await ensureCustomerRow(user?.id);
      onSignedIn?.(user);
      onClose?.();
    } catch (e) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("invalid login")) {
        setErr("Credenciales inválidas. Revisa tu correo y contraseña.");
      } else if (msg.includes("email") && msg.includes("not") && msg.includes("confirmed")) {
        setErr("Tu email aún no está confirmado. Revisa tu correo y completa la verificación.");
      } else if (msg.includes("already") && msg.includes("registered")) {
        setErr("Este email ya está registrado. Inicia sesión.");
      } else {
        setErr(e?.message || "Error de autenticación.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{tab === "signup" ? "Crear cuenta" : "Iniciar sesión"}</h2>
            <button type="button" onClick={onClose} className="text-gray-500 hover:text-black">✕</button>
          </div>

          <div className="inline-flex rounded-lg border bg-white overflow-hidden">
            <button
              type="button"
              className={`px-3 py-2 text-sm ${tab === "login" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
              onClick={() => { setTab("login"); setErr(""); setInfo(""); }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-sm ${tab === "signup" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
              onClick={() => { setTab("signup"); setErr(""); setInfo(""); }}
            >
              Crear cuenta
            </button>
          </div>

          {tab === "signup" && (
            <>
              <input
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Nombre completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <input
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Teléfono (opcional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </>
          )}

          <input
            type="email"
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Contraseña"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
            minLength={6}
          />

          {err && <div className="p-2 bg-red-50 text-red-700 rounded text-sm">{err}</div>}
          {info && (
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded text-sm">
              {info}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 text-white py-2 font-semibold hover:bg-black disabled:opacity-60"
          >
            {loading ? "Procesando…" : tab === "signup" ? "Crear cuenta" : "Entrar"}
          </button>

          <p className="text-xs text-gray-500 text-center">
            Al continuar aceptas nuestros términos y política de privacidad.
          </p>
        </form>
      </div>
    </div>
  );
}
