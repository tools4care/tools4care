// src/pages/UsuariosAdmin.jsx
// Admin-only page for managing user roles and account status
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { useUsuario } from "../UsuarioContext";
import { Shield, User, ChevronDown, Check, X, RefreshCw, AlertCircle } from "lucide-react";

/* ─── helpers ─── */
const rolLabel = (rol) => (rol === "admin" ? "Admin" : "Vendedor");
const rolColor = (rol) =>
  rol === "admin"
    ? "bg-purple-100 text-purple-700 border-purple-200"
    : "bg-blue-100 text-blue-700 border-blue-200";

function Avatar({ nombre, email }) {
  const initials = (nombre || email || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {initials}
    </div>
  );
}

export default function UsuariosAdmin() {
  const { usuario: yo } = useUsuario();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(null); // id of row being saved
  const [toast, setToast] = useState(null);   // { msg, type }

  /* ─── Load ─── */
  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("usuarios")
      .select("id, email, nombre, rol, activo")
      .order("email", { ascending: true });

    if (err) {
      setError("Error loading users: " + err.message);
    } else {
      setUsuarios(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  /* ─── Toggle role ─── */
  async function toggleRol(u) {
    if (u.id === yo?.id) {
      showToast("You cannot change your own role.", "error");
      return;
    }
    const nuevoRol = u.rol === "admin" ? "vendedor" : "admin";
    setSaving(u.id);
    const { error: err } = await supabase
      .from("usuarios")
      .update({ rol: nuevoRol })
      .eq("id", u.id);

    if (err) {
      showToast("Error updating role: " + err.message, "error");
    } else {
      setUsuarios((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, rol: nuevoRol } : x))
      );
      showToast(`${u.nombre || u.email} is now ${rolLabel(nuevoRol)}.`);
    }
    setSaving(null);
  }

  /* ─── Toggle active ─── */
  async function toggleActivo(u) {
    if (u.id === yo?.id) {
      showToast("You cannot deactivate your own account.", "error");
      return;
    }
    const nuevoActivo = !u.activo;
    setSaving(u.id);
    const { error: err } = await supabase
      .from("usuarios")
      .update({ activo: nuevoActivo })
      .eq("id", u.id);

    if (err) {
      showToast("Error updating status: " + err.message, "error");
    } else {
      setUsuarios((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, activo: nuevoActivo } : x))
      );
      showToast(
        nuevoActivo
          ? `${u.nombre || u.email} has been activated.`
          : `${u.nombre || u.email} has been deactivated.`
      );
    }
    setSaving(null);
  }

  /* ─── UI ─── */
  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-slate-800 to-purple-900 text-white rounded-2xl px-6 py-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">User Management</h1>
            <p className="text-purple-200 text-xs mt-0.5">
              Manage roles and account status for your team
            </p>
          </div>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all"
          title="Reload"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── Legend ── */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 mb-5 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 border-purple-200">
            <Shield size={10} /> Admin
          </span>
          <span className="text-slate-600">Full access — products, prices, clients, reports, settings</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 border-blue-200">
            <User size={10} /> Vendedor
          </span>
          <span className="text-slate-600">Sales only — no price changes, no delete, max 10% discount</span>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── User list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
          <RefreshCw size={18} className="animate-spin" />
          Loading users…
        </div>
      ) : usuarios.length === 0 ? (
        <div className="text-center text-slate-400 py-16">No users found.</div>
      ) : (
        <div className="space-y-3">
          {usuarios.map((u) => {
            const isMe = u.id === yo?.id;
            const isSaving = saving === u.id;
            return (
              <div
                key={u.id}
                className={`bg-white border rounded-2xl px-5 py-4 flex items-center gap-4 transition-all ${
                  !u.activo ? "opacity-60" : ""
                } ${isMe ? "border-purple-300 ring-1 ring-purple-200" : "border-slate-200"}`}
              >
                <Avatar nombre={u.nombre} email={u.email} />

                {/* ── Info ── */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">
                      {u.nombre || "(no name)"}
                    </span>
                    {isMe && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                    {!u.activo && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">{u.email}</div>
                </div>

                {/* ── Role badge ── */}
                <span
                  className={`inline-flex items-center gap-1 border rounded-full px-3 py-1 text-xs font-bold ${rolColor(u.rol)}`}
                >
                  {u.rol === "admin" ? <Shield size={10} /> : <User size={10} />}
                  {rolLabel(u.rol)}
                </span>

                {/* ── Controls ── */}
                <div className="flex items-center gap-2">
                  {/* Role toggle */}
                  <button
                    onClick={() => toggleRol(u)}
                    disabled={isSaving || isMe}
                    title={isMe ? "Cannot change your own role" : `Switch to ${u.rol === "admin" ? "Vendedor" : "Admin"}`}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                      isMe
                        ? "opacity-30 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
                        : u.rol === "admin"
                        ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                        : "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                    }`}
                  >
                    {isSaving ? (
                      <RefreshCw size={12} className="animate-spin inline" />
                    ) : u.rol === "admin" ? (
                      "→ Vendedor"
                    ) : (
                      "→ Admin"
                    )}
                  </button>

                  {/* Active toggle */}
                  <button
                    onClick={() => toggleActivo(u)}
                    disabled={isSaving || isMe}
                    title={isMe ? "Cannot deactivate yourself" : u.activo ? "Deactivate account" : "Activate account"}
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                      isMe
                        ? "opacity-30 cursor-not-allowed border-slate-200 bg-slate-50"
                        : u.activo
                        ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                        : "bg-red-50 border-red-200 text-red-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
                    }`}
                  >
                    {isSaving ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : u.activo ? (
                      <Check size={14} />
                    ) : (
                      <X size={14} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Summary ── */}
      {!loading && usuarios.length > 0 && (
        <div className="mt-5 flex gap-4 text-xs text-slate-500 justify-end px-1">
          <span>{usuarios.filter((u) => u.rol === "admin").length} admin(s)</span>
          <span>{usuarios.filter((u) => u.rol === "vendedor").length} vendedor(s)</span>
          <span>{usuarios.filter((u) => !u.activo).length} inactive</span>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white z-50 transition-all ${
            toast.type === "error" ? "bg-red-600" : "bg-slate-800"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
