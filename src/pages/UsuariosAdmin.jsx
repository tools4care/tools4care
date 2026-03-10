// src/pages/UsuariosAdmin.jsx
// Admin-only page for managing user roles and account status
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { useUsuario } from "../UsuarioContext";
import {
  Shield, Star, User, Check, X, RefreshCw, AlertCircle, ChevronDown, Copy,
} from "lucide-react";

/* ─── Role config (single source of truth for labels / colors) ─── */
const ROLES = [
  {
    value: "admin",
    label: "Admin",
    Icon: Shield,
    badge:  "bg-purple-100 text-purple-700 border-purple-200",
    focus:  "focus:ring-purple-400",
    chevron:"text-purple-500",
    desc:   "Full access — products, prices, clients, users, commissions, online store",
  },
  {
    value: "supervisor",
    label: "Supervisor",
    Icon: Star,
    badge:  "bg-amber-100 text-amber-700 border-amber-200",
    focus:  "focus:ring-amber-400",
    chevron:"text-amber-500",
    desc:   "Operational access — products, prices, clients, suppliers (no user mgmt)",
  },
  {
    value: "vendedor",
    label: "Vendedor",
    Icon: User,
    badge:  "bg-blue-100 text-blue-700 border-blue-200",
    focus:  "focus:ring-blue-400",
    chevron:"text-blue-500",
    desc:   "Sales only — max 10% discount, view-only products, no deletes",
  },
];

const getRol = (val) => ROLES.find((r) => r.value === val) ?? ROLES[2];

/* ─── Avatar initials ─── */
function Avatar({ nombre, email }) {
  const initials = (nombre || email || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {initials}
    </div>
  );
}

/* ─── SQL fix snippet ─── */
const FIX_SQL = `ALTER TABLE usuarios\n  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();`;

export default function UsuariosAdmin() {
  const { usuario: yo } = useUsuario();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [saving, setSaving]     = useState(null); // "<id>_rol" | "<id>_activo"
  const [toast, setToast]       = useState(null); // { msg, type }
  const [triggerErr, setTriggerErr] = useState(false); // updated_at trigger bug
  const [copied, setCopied]     = useState(false);

  /* ─── Load ─── */
  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("usuarios")
      .select("id, email, nombre, rol, activo")
      .order("email", { ascending: true });

    if (err) setError("Error loading users: " + err.message);
    else     setUsuarios(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /* ─── Toast helper ─── */
  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  /* ─── Copy SQL to clipboard ─── */
  function copiarSQL() {
    navigator.clipboard.writeText(FIX_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  /* ─── Handle DB trigger error ─── */
  function handleDbError(err, fallbackMsg) {
    if (err.message.includes("updated_at") || err.message.includes("no field")) {
      setTriggerErr(true);
    } else {
      showToast(fallbackMsg + err.message, "error");
    }
  }

  /* ─── Change role via dropdown ─── */
  async function cambiarRol(u, nuevoRol) {
    if (u.id === yo?.id) { showToast("You cannot change your own role.", "error"); return; }
    if (nuevoRol === u.rol) return;

    setSaving(u.id + "_rol");
    const { error: err } = await supabase
      .from("usuarios")
      .update({ rol: nuevoRol })
      .eq("id", u.id);

    if (err) {
      handleDbError(err, "Error updating role: ");
    } else {
      setUsuarios((prev) =>
        prev.map((x) => x.id === u.id ? { ...x, rol: nuevoRol } : x)
      );
      showToast(`${u.nombre || u.email} → ${getRol(nuevoRol).label}`);
    }
    setSaving(null);
  }

  /* ─── Toggle active ─── */
  async function toggleActivo(u) {
    if (u.id === yo?.id) { showToast("You cannot deactivate your own account.", "error"); return; }
    const nuevoActivo = !u.activo;

    setSaving(u.id + "_activo");
    const { error: err } = await supabase
      .from("usuarios")
      .update({ activo: nuevoActivo })
      .eq("id", u.id);

    if (err) {
      handleDbError(err, "Error updating status: ");
    } else {
      setUsuarios((prev) =>
        prev.map((x) => x.id === u.id ? { ...x, activo: nuevoActivo } : x)
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

      {/* ── Legend / Role guide ── */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 mb-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Role permissions</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ROLES.map(({ value, label, Icon, badge, desc }) => (
            <div key={value} className="flex items-start gap-2">
              <span className={`inline-flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs font-bold shrink-0 ${badge}`}>
                <Icon size={10} /> {label}
              </span>
              <span className="text-slate-500 text-xs leading-snug">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Trigger-error fix banner ── */}
      {triggerErr && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 mb-5">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
            <AlertCircle size={16} /> Database fix required
          </div>
          <p className="text-xs text-amber-700 mb-3">
            Your <code className="bg-amber-100 px-1 rounded">usuarios</code> table is missing an{" "}
            <code className="bg-amber-100 px-1 rounded">updated_at</code> column that a trigger expects.
            Run this one-line SQL in your{" "}
            <strong>Supabase → SQL Editor</strong>:
          </p>
          <div className="relative">
            <pre className="bg-amber-100 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900 font-mono overflow-x-auto">
              {FIX_SQL}
            </pre>
            <button
              onClick={copiarSQL}
              className="absolute top-2 right-2 flex items-center gap-1 text-xs bg-amber-200 hover:bg-amber-300 text-amber-800 px-2 py-1 rounded-md transition-all"
            >
              <Copy size={11} />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => { setTriggerErr(false); cargar(); }}
            className="mt-3 text-xs text-amber-600 hover:text-amber-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Generic error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ── User list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
          <RefreshCw size={18} className="animate-spin" /> Loading users…
        </div>
      ) : usuarios.length === 0 ? (
        <div className="text-center text-slate-400 py-16">No users found.</div>
      ) : (
        <div className="space-y-3">
          {usuarios.map((u) => {
            const isMe          = u.id === yo?.id;
            const isSavingRol   = saving === u.id + "_rol";
            const isSavingActivo= saving === u.id + "_activo";
            const isSaving      = isSavingRol || isSavingActivo;
            const cfg           = getRol(u.rol);
            const RolIcon       = cfg.Icon;

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

                {/* ── Role dropdown ── */}
                <div className="relative shrink-0">
                  {isSavingRol ? (
                    /* spinning placeholder while saving */
                    <div className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs font-bold ${cfg.badge}`}>
                      <RefreshCw size={11} className="animate-spin" />
                      {cfg.label}
                    </div>
                  ) : (
                    <>
                      <select
                        value={u.rol}
                        onChange={(e) => cambiarRol(u, e.target.value)}
                        disabled={isMe || isSaving}
                        title={isMe ? "Cannot change your own role" : "Change role"}
                        className={`appearance-none pr-7 pl-3 py-1.5 rounded-full border text-xs font-bold cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                          isMe ? "opacity-40 cursor-not-allowed" : ""
                        } ${cfg.badge} ${cfg.focus}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <ChevronDown
                        size={11}
                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${cfg.chevron}`}
                      />
                    </>
                  )}
                </div>

                {/* ── Active / inactive toggle ── */}
                <button
                  onClick={() => toggleActivo(u)}
                  disabled={isSaving || isMe}
                  title={
                    isMe
                      ? "Cannot deactivate yourself"
                      : u.activo
                      ? "Deactivate account"
                      : "Activate account"
                  }
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all shrink-0 ${
                    isMe
                      ? "opacity-30 cursor-not-allowed border-slate-200 bg-slate-50"
                      : u.activo
                      ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                      : "bg-red-50 border-red-200 text-red-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
                  }`}
                >
                  {isSavingActivo ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : u.activo ? (
                    <Check size={14} />
                  ) : (
                    <X size={14} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Summary counts ── */}
      {!loading && usuarios.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-500 justify-end px-1">
          <span className="flex items-center gap-1">
            <Shield size={10} className="text-purple-500" />
            {usuarios.filter((u) => u.rol === "admin").length} admin(s)
          </span>
          <span className="flex items-center gap-1">
            <Star size={10} className="text-amber-500" />
            {usuarios.filter((u) => u.rol === "supervisor").length} supervisor(s)
          </span>
          <span className="flex items-center gap-1">
            <User size={10} className="text-blue-500" />
            {usuarios.filter((u) => u.rol === "vendedor").length} vendedor(s)
          </span>
          <span className="flex items-center gap-1">
            <X size={10} className="text-red-400" />
            {usuarios.filter((u) => !u.activo).length} inactive
          </span>
        </div>
      )}

      {/* ── Toast notification ── */}
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
