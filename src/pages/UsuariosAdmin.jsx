// src/pages/UsuariosAdmin.jsx
// Admin-only: manage users (add / change role / activate-deactivate / delete)
import { useState, useEffect, useCallback } from "react";
import { supabase }                        from "../supabaseClient";
import { supabaseAdmin, isAdminConfigured } from "../supabaseAdmin";
import { useUsuario }                      from "../UsuarioContext";
import {
  Shield, Star, User, Check, X, RefreshCw, AlertCircle,
  ChevronDown, Copy, UserPlus, Trash2, Eye, EyeOff, Key, Settings,
} from "lucide-react";

/* ─── Role config ─── */
const ROLES = [
  {
    value: "admin",     label: "Admin",
    Icon: Shield,
    badge:   "bg-purple-100 text-purple-700 border-purple-200",
    focus:   "focus:ring-purple-400",
    chevron: "text-purple-500",
    desc:    "Full access — products, prices, clients, users, commissions, online store",
  },
  {
    value: "supervisor", label: "Supervisor",
    Icon: Star,
    badge:   "bg-amber-100 text-amber-700 border-amber-200",
    focus:   "focus:ring-amber-400",
    chevron: "text-amber-500",
    desc:    "Operational access — products, prices, clients, suppliers (no user mgmt)",
  },
  {
    value: "vendedor",  label: "Vendedor",
    Icon: User,
    badge:   "bg-blue-100 text-blue-700 border-blue-200",
    focus:   "focus:ring-blue-400",
    chevron: "text-blue-500",
    desc:    "Sales only — max 10% discount, view-only products, no deletes",
  },
];
const getRol = (v) => ROLES.find((r) => r.value === v) ?? ROLES[2];

/* ─── Avatar ─── */
function Avatar({ nombre, email }) {
  const init = (nombre || email || "?")
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {init}
    </div>
  );
}

/* ─── SQL fix for missing updated_at ─── */
const FIX_SQL = `ALTER TABLE usuarios\n  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();`;

/* ─── SQL fix for missing permission columns ─── */
const PERMISSIONS_SQL = `ALTER TABLE usuarios\n  ADD COLUMN IF NOT EXISTS descuento_max NUMERIC,\n  ADD COLUMN IF NOT EXISTS modulos TEXT[];`;

/* ─── SQL: permanent cascade-delete fix (run once in Supabase SQL editor) ─── */
const CASCADE_SQL = `-- Permanent fix: cascade-delete user records automatically
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl,
           string_agg(a.attname, ', ') AS cols
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.confrelid = 'usuarios'::regclass AND c.contype = 'f'
    GROUP BY c.conname, c.conrelid
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I;
       ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES usuarios(id) ON DELETE CASCADE;',
      r.tbl, r.conname, r.tbl, r.conname, r.cols);
  END LOOP;
END $$;`;

/* ─── Configurable modules ─── */
const MODULES = [
  { key: "dashboard",  label: "Dashboard" },
  { key: "ventas",     label: "Sales / Ventas" },
  { key: "facturas",   label: "Invoices / Facturas" },
  { key: "clientes",   label: "Customers / Clientes" },
  { key: "productos",  label: "Products / Productos" },
  { key: "inventario", label: "Inventory / Inventario" },
  { key: "cierres",    label: "Van Closeout" },
  { key: "cxc",        label: "Accounts Receivable" },
  { key: "reportes",   label: "Reports / Reportes" },
  { key: "suplidores", label: "Suppliers / Suplidores" },
  { key: "comisiones", label: "Commissions / Comisiones" },
];

/* ══════════════════════════════════════════════════════════════════
   MODAL — New User
══════════════════════════════════════════════════════════════════ */
function NuevoUsuarioModal({ onClose, onCreado, onTriggerError }) {
  const [email,    setEmail]    = useState("");
  const [nombre,   setNombre]   = useState("");
  const [rol,      setRol]      = useState("vendedor");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError("Email and password are required."); return; }
    if (password.length < 6)               { setError("Password must be at least 6 characters."); return; }
    if (!isAdminConfigured)                { setError("Service key not configured. See setup instructions."); return; }

    setSaving(true);
    setError("");

    // 1. Create auth user (email_confirm: true → no email required)
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email:         email.trim(),
      password:      password,
      email_confirm: true,
      user_metadata: { full_name: nombre.trim() },
    });

    if (authErr) {
      if (authErr.message.toLowerCase().includes("database error")) {
        onTriggerError?.();
        setError("DB trigger error — run the SQL migration fix shown on the Users page, then retry.");
      } else {
        setError("Auth error: " + authErr.message);
      }
      setSaving(false);
      return;
    }

    // 2. Insert into usuarios table
    const { error: dbErr } = await supabase.from("usuarios").insert([{
      id:     authData.user.id,
      email:  email.trim(),
      nombre: nombre.trim(),
      rol,
      activo: true,
    }]);

    if (dbErr) {
      // Auth user was created but DB insert failed — still show a partial warning
      setError("User created in auth but DB insert failed: " + dbErr.message + ". Check Supabase dashboard.");
      setSaving(false);
      return;
    }

    onCreado({ id: authData.user.id, email: email.trim(), nombre: nombre.trim(), rol, activo: true });
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="bg-gradient-to-br from-slate-800 to-blue-900 text-white rounded-t-2xl px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">New User</h2>
              <p className="text-blue-200 text-xs">Create a team member account</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4" autoComplete="off">

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              required
              autoComplete="off"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Full name</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="First Last"
              autoComplete="off"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
            <div className="relative">
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                className="w-full appearance-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent pr-8"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label} — {r.desc.split("—")[0].trim()}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Temporary password *</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Key size={10} /> Share this password securely — user can change it after first login.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-xs flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {saving ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MODAL — Delete confirmation
══════════════════════════════════════════════════════════════════ */
function EliminarModal({ usuario: u, onClose, onEliminado, onCascadeError }) {
  const [confirmText, setConfirmText] = useState("");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  const match = confirmText.trim().toLowerCase() === u.email.toLowerCase();

  async function handleDelete() {
    if (!match) return;
    if (!isAdminConfigured) { setError("Service key not configured."); return; }

    setSaving(true);
    setError("");

    // 1. Delete from Supabase auth first (ignore 404 – user may not exist in auth)
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
    if (authErr && authErr.status !== 404) {
      setError("Auth error: " + authErr.message);
      setSaving(false);
      return;
    }

    // 2. Delete / nullify all FK-dependent records before deleting the user
    await Promise.all([
      // Config / session tables — delete entirely
      supabaseAdmin.from("usuarios_vans").delete().eq("usuario_id", u.id),
      supabaseAdmin.from("usuario_sesion").delete().eq("usuario_id", u.id),
      supabaseAdmin.from("cierres_van").delete().eq("usuario_id", u.id),
      supabaseAdmin.from("ventas_pendientes").delete().eq("usuario_id", u.id),
      supabaseAdmin.from("configuraciones_comisiones").delete().eq("vendedor_id", u.id),
      supabaseAdmin.from("comisiones_calculadas").delete().eq("vendedor_id", u.id),
      // Business data — preserve records but nullify the user reference
      supabaseAdmin.from("ventas").update({ usuario_id: null }).eq("usuario_id", u.id),
      supabaseAdmin.from("cierres_dia").update({ usuario_id: null }).eq("usuario_id", u.id),
      supabaseAdmin.from("acuerdos_pago").update({ usuario_id: null }).eq("usuario_id", u.id),
      supabaseAdmin.from("cxc_movimientos").update({ usuario_id: null }).eq("usuario_id", u.id),
    ]);

    // 3. Delete from usuarios table (use admin client to bypass RLS)
    const { error: dbErr } = await supabaseAdmin.from("usuarios").delete().eq("id", u.id);
    if (dbErr) {
      if (dbErr.message.includes("foreign key constraint")) {
        onCascadeError?.();
        setError("FK constraint — run the SQL cascade fix shown on the Users page, then retry.");
      } else {
        setError("DB error: " + dbErr.message);
      }
      setSaving(false);
      return;
    }

    onEliminado(u.id);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="bg-gradient-to-br from-red-600 to-rose-700 text-white rounded-t-2xl px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
              <Trash2 size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">Delete User</h2>
              <p className="text-red-200 text-xs">This action cannot be undone</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600">
            You are about to permanently delete{" "}
            <span className="font-semibold text-slate-800">{u.nombre || u.email}</span>{" "}
            and all their data from authentication and the database.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Type their email to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={u.email}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-xs flex items-start gap-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={!match || saving}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {saving ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MODAL — Permissions
══════════════════════════════════════════════════════════════════ */
function PermisosModal({ usuario: u, onClose, onGuardado, onTriggerError }) {
  const isAdmin      = u.rol === "admin";
  const isSupervisor = u.rol === "supervisor";
  const isPrivileged = isAdmin || isSupervisor;

  function roleDefaultModulos() {
    return MODULES
      .filter(m => {
        if (m.key === "comisiones") return isAdmin;
        if (m.key === "suplidores") return isPrivileged;
        return true;
      })
      .map(m => m.key);
  }

  const [sinLimite,      setSinLimite]      = useState(u.descuento_max == null);
  const [descuentoMax,   setDescuentoMax]   = useState(u.descuento_max != null ? String(u.descuento_max) : "");
  const [useRoleDefault, setUseRoleDefault] = useState(u.modulos == null);
  const [selectedMods,   setSelectedMods]   = useState(u.modulos != null ? u.modulos : roleDefaultModulos());
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  function toggleMod(key) {
    setSelectedMods(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function handleSave() {
    if (!isAdminConfigured) { setError("Service key not configured."); return; }
    setSaving(true);
    setError("");
    const descuento_max = sinLimite ? null : (descuentoMax === "" ? null : parseFloat(descuentoMax));
    const modulos       = useRoleDefault ? null : selectedMods;
    const { error: err } = await supabaseAdmin.from("usuarios").update({ descuento_max, modulos }).eq("id", u.id);
    if (err) {
      if (err.message.includes("updated_at") || err.message.includes("no field")) {
        onTriggerError?.();
        setError("DB migration required — run the SQL fix shown on the Users page.");
      } else {
        setError("Error: " + err.message);
      }
      setSaving(false);
      return;
    }
    onGuardado({ ...u, descuento_max, modulos });
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-t-2xl px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">Permissions</h2>
              <p className="text-indigo-200 text-xs truncate max-w-[180px]">{u.nombre || u.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">

          {/* Discount */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Max discount %</p>
            <label className="flex items-center gap-2 text-xs text-slate-600 mb-2 cursor-pointer">
              <input type="checkbox" checked={sinLimite} onChange={(e) => setSinLimite(e.target.checked)} className="rounded" />
              No limit (use role default)
            </label>
            {!sinLimite && (
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" max="100"
                  value={descuentoMax}
                  onChange={(e) => setDescuentoMax(e.target.value)}
                  placeholder="e.g. 25"
                  className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
            )}
          </div>

          {/* Modules */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Visible modules</p>
            <label className="flex items-center gap-2 text-xs text-slate-600 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useRoleDefault}
                onChange={(e) => { setUseRoleDefault(e.target.checked); if (e.target.checked) setSelectedMods(roleDefaultModulos()); }}
                className="rounded"
              />
              Use role defaults
            </label>
            <div className="space-y-1.5">
              {MODULES.map(m => (
                <label
                  key={m.key}
                  className={`flex items-center gap-2.5 text-xs px-3 py-2 rounded-xl border transition-all ${
                    useRoleDefault
                      ? "opacity-50 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-500"
                      : selectedMods.includes(m.key)
                      ? "bg-indigo-50 border-indigo-200 text-indigo-700 cursor-pointer"
                      : "bg-slate-50 border-slate-200 text-slate-600 cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedMods.includes(m.key)}
                    onChange={() => !useRoleDefault && toggleMod(m.key)}
                    disabled={useRoleDefault}
                    className="rounded"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-xs flex items-start gap-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3 pb-1">
            <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-50 transition-all">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════ */
export default function UsuariosAdmin() {
  const { usuario: yo } = useUsuario();
  const [usuarios,     setUsuarios]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [saving,       setSaving]       = useState(null);  // "<id>_rol" | "<id>_activo"
  const [toast,        setToast]        = useState(null);  // { msg, type }
  const [triggerErr,       setTriggerErr]       = useState(false);
  const [permisosColErr,   setPermisosColErr]   = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [copiedPermisos,   setCopiedPermisos]   = useState(false);
  const [copiedCascade,    setCopiedCascade]    = useState(false);
  const [cascadeErr,       setCascadeErr]       = useState(false);
  const [showNuevo,        setShowNuevo]        = useState(false);
  const [eliminarUser,     setEliminarUser]     = useState(null);
  const [permisosUser,     setPermisosUser]     = useState(null);

  /* ── Load ── */
  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("usuarios")
      .select("id, email, nombre, rol, activo, descuento_max, modulos")
      .order("email", { ascending: true });
    if (err) {
      if (err.message.includes("descuento_max") || err.message.includes("modulos")) {
        setPermisosColErr(true);
        // Fall back to basic columns
        const { data: data2, error: err2 } = await supabase
          .from("usuarios")
          .select("id, email, nombre, rol, activo")
          .order("email", { ascending: true });
        if (err2) setError("Error loading users: " + err2.message);
        else      setUsuarios(data2 || []);
      } else {
        setError("Error loading users: " + err.message);
      }
    } else {
      setUsuarios(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /* ── Toast ── */
  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  /* ── Copy SQL ── */
  function copiarSQL() {
    navigator.clipboard.writeText(FIX_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  /* ── Copy permissions SQL ── */
  function copiarPermisosSQL() {
    navigator.clipboard.writeText(PERMISSIONS_SQL).then(() => {
      setCopiedPermisos(true);
      setTimeout(() => setCopiedPermisos(false), 2000);
    });
  }

  /* ── Copy cascade SQL ── */
  function copiarCascadeSQL() {
    navigator.clipboard.writeText(CASCADE_SQL).then(() => {
      setCopiedCascade(true);
      setTimeout(() => setCopiedCascade(false), 2000);
    });
  }

  /* ── DB trigger error handler ── */
  function handleDbError(err, fallback) {
    if (err.message.includes("updated_at") || err.message.includes("no field")) {
      setTriggerErr(true);
    } else {
      showToast(fallback + err.message, "error");
    }
  }

  /* ── Change role ── */
  async function cambiarRol(u, nuevoRol) {
    if (u.id === yo?.id) { showToast("You cannot change your own role.", "error"); return; }
    if (nuevoRol === u.rol) return;
    setSaving(u.id + "_rol");
    const { error: err } = await supabase.from("usuarios").update({ rol: nuevoRol }).eq("id", u.id);
    if (err) handleDbError(err, "Error updating role: ");
    else {
      setUsuarios((p) => p.map((x) => x.id === u.id ? { ...x, rol: nuevoRol } : x));
      showToast(`${u.nombre || u.email} → ${getRol(nuevoRol).label}`);
    }
    setSaving(null);
  }

  /* ── Toggle active ── */
  async function toggleActivo(u) {
    if (u.id === yo?.id) { showToast("You cannot deactivate your own account.", "error"); return; }
    const nuevo = !u.activo;
    setSaving(u.id + "_activo");
    const { error: err } = await supabase.from("usuarios").update({ activo: nuevo }).eq("id", u.id);
    if (err) handleDbError(err, "Error updating status: ");
    else {
      setUsuarios((p) => p.map((x) => x.id === u.id ? { ...x, activo: nuevo } : x));
      showToast(nuevo ? `${u.nombre || u.email} activated.` : `${u.nombre || u.email} deactivated.`);
    }
    setSaving(null);
  }

  /* ── After new user created ── */
  function handleCreado(nuevoUsuario) {
    setUsuarios((p) => [...p, nuevoUsuario].sort((a, b) => a.email.localeCompare(b.email)));
    setShowNuevo(false);
    showToast(`✓ ${nuevoUsuario.nombre || nuevoUsuario.email} added successfully.`);
  }

  /* ── After permissions saved ── */
  function handlePermisosGuardados(updated) {
    setUsuarios((p) => p.map((x) => x.id === updated.id ? updated : x));
    setPermisosUser(null);
    showToast(`Permissions updated for ${updated.nombre || updated.email}.`);
  }

  /* ── After user deleted ── */
  function handleEliminado(id) {
    setUsuarios((p) => p.filter((x) => x.id !== id));
    setEliminarUser(null);
    showToast("User deleted.", "error");
  }

  /* ══ RENDER ══ */
  return (
    <div className="max-w-4xl mx-auto">

      {/* ─── Header ─── */}
      <div className="bg-gradient-to-br from-slate-800 to-purple-900 text-white rounded-2xl px-6 py-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">User Management</h1>
            <p className="text-purple-200 text-xs mt-0.5">Add, restrict, or remove team members</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Add user button */}
          <button
            onClick={() => setShowNuevo(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl px-3 py-2 text-sm font-semibold transition-all"
            title="Add new user"
          >
            <UserPlus size={16} /> New User
          </button>
          {/* Reload */}
          <button
            onClick={cargar}
            disabled={loading}
            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all"
            title="Reload"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ─── Service key setup banner ─── */}
      {!isAdminConfigured && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-5 py-4 mb-5">
          <div className="flex items-center gap-2 text-sky-800 font-semibold text-sm mb-1">
            <Key size={15} /> Service Key required for Add / Delete
          </div>
          <p className="text-xs text-sky-700 mb-2">
            To create or delete users you need the <strong>service_role</strong> key from your Supabase project.
          </p>
          <ol className="text-xs text-sky-700 space-y-0.5 list-decimal list-inside mb-3">
            <li>Supabase Dashboard → Project Settings → API</li>
            <li>Copy the <strong>service_role</strong> secret</li>
            <li>Add to <code className="bg-sky-100 px-1 rounded">.env</code>: <code className="bg-sky-100 px-1 rounded">VITE_SUPABASE_SERVICE_KEY=eyJ…</code></li>
            <li>Add the same key in <strong>Vercel → Settings → Environment Variables</strong></li>
            <li>Redeploy — role/status changes work without this key</li>
          </ol>
          <p className="text-xs text-sky-500 italic">
            ⚠ Role changes and active/inactive toggles work without this key.
          </p>
        </div>
      )}

      {/* ─── DB trigger error banner ─── */}
      {triggerErr && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 mb-5">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
            <AlertCircle size={16} /> Database fix required
          </div>
          <p className="text-xs text-amber-700 mb-3">
            Your <code className="bg-amber-100 px-1 rounded">usuarios</code> table is missing an{" "}
            <code className="bg-amber-100 px-1 rounded">updated_at</code> column. Run this in{" "}
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
              <Copy size={11} /> {copied ? "Copied!" : "Copy"}
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

      {/* ─── Permissions columns SQL banner ─── */}
      {permisosColErr && (
        <div className="bg-violet-50 border border-violet-300 rounded-xl px-5 py-4 mb-5">
          <div className="flex items-center gap-2 text-violet-800 font-semibold text-sm mb-1">
            <Settings size={16} /> Database migration required for Permissions
          </div>
          <p className="text-xs text-violet-700 mb-3">
            Run this in <strong>Supabase → SQL Editor</strong> to enable per-user discount limits and module control:
          </p>
          <div className="relative">
            <pre className="bg-violet-100 border border-violet-200 rounded-lg px-4 py-3 text-xs text-violet-900 font-mono overflow-x-auto">
              {PERMISSIONS_SQL}
            </pre>
            <button
              onClick={copiarPermisosSQL}
              className="absolute top-2 right-2 flex items-center gap-1 text-xs bg-violet-200 hover:bg-violet-300 text-violet-800 px-2 py-1 rounded-md transition-all"
            >
              <Copy size={11} /> {copiedPermisos ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => { setPermisosColErr(false); cargar(); }}
            className="mt-3 text-xs text-violet-600 hover:text-violet-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── Cascade FK SQL banner ─── */}
      {cascadeErr && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl px-5 py-4 mb-5">
          <div className="flex items-center gap-2 text-orange-800 font-semibold text-sm mb-1">
            <AlertCircle size={16} /> Foreign Key fix required for Delete
          </div>
          <p className="text-xs text-orange-700 mb-3">
            Run this <strong>once</strong> in <strong>Supabase → SQL Editor</strong> to enable automatic cascade deletion. After that, users can be deleted without errors:
          </p>
          <div className="relative">
            <pre className="bg-orange-100 border border-orange-200 rounded-lg px-4 py-3 text-xs text-orange-900 font-mono overflow-x-auto whitespace-pre-wrap">
              {CASCADE_SQL}
            </pre>
            <button
              onClick={copiarCascadeSQL}
              className="absolute top-2 right-2 flex items-center gap-1 text-xs bg-orange-200 hover:bg-orange-300 text-orange-800 px-2 py-1 rounded-md transition-all"
            >
              <Copy size={11} /> {copiedCascade ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setCascadeErr(false)}
            className="mt-3 text-xs text-orange-600 hover:text-orange-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── Legend ─── */}
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

      {/* ─── Generic error ─── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ─── User list ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
          <RefreshCw size={18} className="animate-spin" /> Loading users…
        </div>
      ) : usuarios.length === 0 ? (
        <div className="text-center text-slate-400 py-16">No users found.</div>
      ) : (
        <div className="space-y-3">
          {usuarios.map((u) => {
            const isMe           = u.id === yo?.id;
            const isSavingRol    = saving === u.id + "_rol";
            const isSavingActivo = saving === u.id + "_activo";
            const isSaving       = isSavingRol || isSavingActivo;
            const cfg            = getRol(u.rol);

            return (
              <div
                key={u.id}
                className={`bg-white border rounded-2xl px-5 py-4 flex items-center gap-4 transition-all ${
                  !u.activo ? "opacity-55" : ""
                } ${isMe ? "border-purple-300 ring-1 ring-purple-200" : "border-slate-200"}`}
              >
                <Avatar nombre={u.nombre} email={u.email} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">{u.nombre || "(no name)"}</span>
                    {isMe && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">You</span>
                    )}
                    {!u.activo && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">{u.email}</div>
                </div>

                {/* Role dropdown */}
                <div className="relative shrink-0">
                  {isSavingRol ? (
                    <div className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs font-bold ${cfg.badge}`}>
                      <RefreshCw size={11} className="animate-spin" /> {cfg.label}
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

                {/* Active toggle */}
                <button
                  onClick={() => toggleActivo(u)}
                  disabled={isSaving || isMe}
                  title={isMe ? "Cannot deactivate yourself" : u.activo ? "Deactivate (restricts login)" : "Activate"}
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

                {/* Permissions button */}
                <button
                  onClick={() => setPermisosUser(u)}
                  disabled={isSaving}
                  title="Edit permissions"
                  className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 flex items-center justify-center transition-all shrink-0"
                >
                  <Settings size={14} />
                </button>

                {/* Delete button */}
                {!isMe && (
                  <button
                    onClick={() => setEliminarUser(u)}
                    disabled={isSaving}
                    title="Delete user permanently"
                    className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-600 flex items-center justify-center transition-all shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {/* Spacer when it's "me" so layout stays aligned */}
                {isMe && <div className="w-9 shrink-0" />}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Summary ─── */}
      {!loading && usuarios.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-500 justify-end px-1">
          <span className="flex items-center gap-1"><Shield size={10} className="text-purple-500" />{usuarios.filter((u) => u.rol === "admin").length} admin(s)</span>
          <span className="flex items-center gap-1"><Star size={10} className="text-amber-500" />{usuarios.filter((u) => u.rol === "supervisor").length} supervisor(s)</span>
          <span className="flex items-center gap-1"><User size={10} className="text-blue-500" />{usuarios.filter((u) => u.rol === "vendedor").length} vendedor(s)</span>
          <span className="flex items-center gap-1"><X size={10} className="text-red-400" />{usuarios.filter((u) => !u.activo).length} inactive</span>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white z-50 ${
          toast.type === "error" ? "bg-red-600" : "bg-slate-800"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ─── Modals ─── */}
      {showNuevo && (
        <NuevoUsuarioModal
          onClose={() => setShowNuevo(false)}
          onCreado={handleCreado}
          onTriggerError={() => setTriggerErr(true)}
        />
      )}
      {eliminarUser && (
        <EliminarModal
          usuario={eliminarUser}
          onClose={() => setEliminarUser(null)}
          onEliminado={handleEliminado}
          onCascadeError={() => setCascadeErr(true)}
        />
      )}
      {permisosUser && (
        <PermisosModal
          usuario={permisosUser}
          onClose={() => setPermisosUser(null)}
          onGuardado={handlePermisosGuardados}
          onTriggerError={() => setTriggerErr(true)}
        />
      )}
    </div>
  );
}
