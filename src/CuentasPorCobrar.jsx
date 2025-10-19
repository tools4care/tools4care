// src/CuentasPorCobrar.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const PAGE_SIZE_DEFAULT = 25;
const CXC_SECRET = "#cxcadmin2025";

/* ====================== Helpers ====================== */
function currency(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));
}
function fmt(n) {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
const normalizePhone = (raw) => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
};
const openWhatsAppWith = (telefono, texto) => {
  const to = normalizePhone(telefono);
  if (!to) { alert("Este cliente no tiene teléfono válido."); return; }
  const url = `https://wa.me/${to.replace("+","")}?text=${encodeURIComponent(texto || "")}`;
  window.open(url, "_blank");
};

/* ========= Config ========= */
const COMPANY_NAME     = import.meta.env?.VITE_COMPANY_NAME     || "Care Beauty Supply";
const PAY_URL          = import.meta.env?.VITE_PAY_URL          || "https://carebeautysupply.carrd.co/";
const CONTACT_EMAIL    = import.meta.env?.VITE_CONTACT_EMAIL    || "tools4care@gmail.com";
const CONTACT_PHONE    = import.meta.env?.VITE_CONTACT_PHONE    || "+1 (781) 953-1475";

/* ========= Plantillas simplificadas ========= */
const DEFAULT_TEMPLATES = [
  {
    key: "en_pro",
    name: "🇺🇸 Professional",
    body: `Hello {cliente}, this is {company}.\nFriendly reminder: Balance {saldo}.\nPay here: {pay_url}\nQuestions? {email} or {phone}\nThank you!`
  },
  {
    key: "en_short",
    name: "🇺🇸 Short",
    body: `{company} — Balance {saldo}. Pay: {pay_url} · Help: {phone}`
  },
  {
    key: "es_pro",
    name: "🇪🇸 Profesional",
    body: `Hola {cliente}, le escribe {company}.\nRecordatorio: Saldo {saldo}.\nPagar: {pay_url}\nDudas? {email} o {phone}\n¡Gracias!`
  },
  {
    key: "es_short",
    name: "🇪🇸 Corto",
    body: `{company} — Saldo {saldo}. Pagar: {pay_url} · Ayuda: {phone}`
  }
];

function loadUserTemplates() {
  try {
    const raw = localStorage.getItem("cxcTemplatesV2");
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveUserTemplates(list) {
  try { localStorage.setItem("cxcTemplatesV2", JSON.stringify(list)); } catch {}
}

function renderTemplate(tplBody, ctx) {
  const replace = (s, k, v) => s.replaceAll(`{${k}}`, v ?? "");
  let out = tplBody;
  const map = {
    cliente: ctx.cliente,
    saldo: currency(ctx.saldo),
    total: currency(ctx.total_cxc ?? 0),
    company: ctx.company,
    pay_url: ctx.pay_url,
    email: ctx.email,
    phone: ctx.phone,
  };
  Object.entries(map).forEach(([k, v]) => { out = replace(out, k, String(v ?? "")); });
  return out.trim();
}

/* ====================== Modal Detalle + Recordatorio ====================== */
function DetalleClienteModal({ cliente, onClose }) {
  const [mensaje, setMensaje] = useState("");
  const [tel, setTel] = useState("");
  const [clienteInfo, setClienteInfo] = useState(null);
  const [templates, setTemplates] = useState([...DEFAULT_TEMPLATES, ...loadUserTemplates()]);
  const [tplKey, setTplKey] = useState("es_pro"); // Cambiado a español por defecto
  const [generated, setGenerated] = useState(false);

  // Cargar info adicional del cliente
  useEffect(() => {
    // Usar los datos que ya vienen del cliente
    setClienteInfo({
      telefono: cliente?.telefono || "",
      direccion: cliente?.direccion || "",
      nombre_negocio: cliente?.nombre_negocio || ""
    });
    setTel(cliente?.telefono || "");
  }, [cliente?.cliente_id, cliente?.telefono, cliente?.direccion, cliente?.nombre_negocio]);

  const currentContext = () => {
    const nombre = cliente?.cliente_nombre || cliente?.cliente || "Cliente";
    const saldoRow = Number(cliente?.saldo || 0);

    return {
      cliente: nombre,
      saldo: saldoRow,
      total_cxc: saldoRow,
      company: COMPANY_NAME,
      pay_url: PAY_URL,
      email: CONTACT_EMAIL,
      phone: CONTACT_PHONE,
    };
  };

  const generarSugerencia = () => {
    const ctx = currentContext();
    const tpl = templates.find(t => t.key === tplKey) || DEFAULT_TEMPLATES[0];
    const msg = renderTemplate(tpl.body, { ...ctx });
    setMensaje(msg);
    setGenerated(true);
  };

  const applyTemplateAndGenerate = (templateKey) => {
    setTplKey(templateKey);
    const ctx = currentContext();
    const tpl = templates.find(t => t.key === templateKey);
    if (!tpl) return;
    const msg = renderTemplate(tpl.body, { ...ctx });
    setMensaje(msg);
    setGenerated(true);
  };

  const saveCurrentAsTemplate = () => {
    const name = prompt("Nombre para la plantilla:", "Mi plantilla");
    if (!name) return;
    const item = { key: `user_${Date.now()}`, name, body: mensaje || "" };
    const user = loadUserTemplates();
    user.push(item);
    saveUserTemplates(user);
    setTemplates([...DEFAULT_TEMPLATES, ...user]);
    setTplKey(item.key);
    alert("Plantilla guardada ✅");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full h-[100vh] sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between shadow-md z-10">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg truncate">{cliente?.cliente_nombre || cliente?.cliente}</div>
            {tel && (
              <div className="text-sm text-blue-100 truncate">📞 {tel}</div>
            )}
            {clienteInfo?.direccion && (
              <div className="text-sm text-blue-100 truncate">📍 {clienteInfo.direccion}</div>
            )}
            {clienteInfo?.nombre_negocio && (
              <div className="text-sm text-blue-100 truncate">🏪 {clienteInfo.nombre_negocio}</div>
            )}
            {!tel && !clienteInfo?.direccion && !clienteInfo?.nombre_negocio && (
              <div className="text-xs text-blue-200 mt-1">⚠️ Sin información de contacto</div>
            )}
          </div>
          <button onClick={onClose} className="ml-3 text-white hover:text-blue-200 text-2xl font-bold">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Recordatorio */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-gray-900 flex items-center gap-2">
                💬 Mensaje de recordatorio
              </div>
            </div>

            {/* Selector de plantilla */}
            {!generated && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Selecciona plantilla e idioma:</label>
                <div className="grid grid-cols-2 gap-2">
                  {templates.map(t => (
                    <button
                      key={t.key}
                      onClick={() => applyTemplateAndGenerate(t.key)}
                      className="px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {generated && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-700">
                    Plantilla: <span className="text-blue-600">{templates.find(t => t.key === tplKey)?.name}</span>
                  </div>
                  <button
                    onClick={() => setGenerated(false)}
                    className="text-xs px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold"
                  >
                    Cambiar plantilla
                  </button>
                </div>

                <textarea
                  className="w-full border-2 border-gray-300 rounded-lg p-3 text-sm min-h-[120px] focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                  value={mensaje}
                  onChange={e => setMensaje(e.target.value)}
                  placeholder="Edita el mensaje aquí..."
                />
                
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={async () => {
                      try { 
                        await navigator.clipboard.writeText(mensaje || ""); 
                        alert("✅ Mensaje copiado"); 
                      } catch { 
                        alert("No se pudo copiar"); 
                      }
                    }}
                    className="flex-1 bg-gray-800 hover:bg-gray-900 text-white px-4 py-3 rounded-lg font-semibold shadow-md"
                  >
                    📋 Copiar
                  </button>
                  <button 
                    onClick={() => openWhatsAppWith(tel, mensaje)}
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 py-3 rounded-lg font-semibold shadow-md"
                    disabled={!tel}
                  >
                    💬 WhatsApp
                  </button>
                </div>

                <div className="bg-white border border-green-200 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-gray-500 text-xs">Saldo</div>
                      <div className="font-bold text-red-600">{currency(cliente?.saldo || 0)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Teléfono</div>
                      <div className="font-mono text-xs">{tel || "⚠️ Sin teléfono"}</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={saveCurrentAsTemplate}
                  className="w-full border-2 border-green-600 text-green-700 hover:bg-green-50 px-4 py-2 rounded-lg text-sm font-semibold"
                >
                  💾 Guardar como plantilla
                </button>
              </div>
            )}

            {!generated && (
              <div className="text-xs text-gray-600 bg-white border border-green-200 rounded-lg p-3">
                💡 Haz clic en una plantilla para generar el mensaje automáticamente
              </div>
            )}
          </div>

          <div className="flex gap-2 sticky bottom-0 bg-white pt-3 pb-2 border-t-2">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-3 rounded-lg font-semibold"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====================== Página principal ====================== */
export default function CuentasPorCobrar() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [scoreFilter, setScoreFilter] = useState("ALL");
  const scoreRanges = {
    "0-399": [0, 399],
    "400-549": [400, 549],
    "550-649": [550, 649],
    "650-749": [650, 749],
    "750+": [750, 1000],
  };

  const [adminMode, setAdminMode] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [edit, setEdit] = useState({
    open: false,
    id: null,
    nombre: "",
    actual: 0,
    manual: null,
    input: "",
  });

  const [selected, setSelected] = useState(null);
  const [openReminder, setOpenReminder] = useState(false);

  function tryUnlockBySecret(value) {
    const typed = (value || "").trim();
    if (typed === CXC_SECRET) {
      setAdminMode((v) => !v);
      alert(`Modo admin ${!adminMode ? "activado" : "desactivado"}`);
      setQ("");
    }
  }

  function openEditor(row) {
    setEdit({
      open: true,
      id: row.cliente_id,
      nombre: row.cliente_nombre,
      actual: Number(row.limite_politica || 0),
      manual: row.limite_manual,
      input: row.limite_manual != null ? String(row.limite_manual) : "",
    });
  }

  async function saveLimit() {
    if (!edit.id) return;
    const trimmed = (edit.input || "").trim();
    const value = trimmed === "" ? null : Number(trimmed);

    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      alert("Monto inválido");
      return;
    }

    const { error } = await supabase
      .from("clientes")
      .update({ limite_manual: value })
      .eq("id", edit.id);

    if (error) {
      alert("Error guardando: " + error.message);
      return;
    }

    setEdit((e) => ({ ...e, open: false }));
    setReloadTick((t) => t + 1);
  }

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        // Cargar datos de CXC con información del cliente incluida
        let query = supabase
          .from("v_cxc_cliente_detalle_ext")
          .select("cliente_id, cliente_nombre, saldo, limite_politica, credito_disponible, score_base, limite_manual, telefono, direccion, nombre_negocio", 
            { count: "exact" });

        if (q?.trim()) {
          query = query.ilike("cliente_nombre", `%${q.trim()}%`);
        }

        if (scoreFilter !== "ALL") {
          const [min, max] = scoreRanges[scoreFilter];
          query = query.gte("score_base", min).lte("score_base", max);
        }

        query = query.order("saldo", { ascending: false });

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const result = await query.range(from, to);

        if (!ignore) {
          if (result.error) {
            console.error("Error cargando CxC:", result.error);
            alert("Error al cargar datos: " + result.error.message);
            setRows([]);
            setTotal(0);
          } else {
            console.log("✅ Datos cargados completos:", result.data?.length, "registros de", result.count);
            setRows(result.data || []);
            setTotal(result.count || 0);
          }
        }
      } catch (e) {
        if (!ignore) {
          console.error("Error en load:", e);
          alert("Error inesperado: " + e.message);
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [q, page, pageSize, scoreFilter, reloadTick]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const metrics = useMemo(() => {
    const saldoTotal = rows.reduce((s, r) => s + Number(r.saldo || 0), 0);
    const avgScore =
      rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + Number(r.score_base || 0), 0) / rows.length)
        : 0;
    return { saldoTotal, avgScore, clientes: total };
  }, [rows, total]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 pb-20">
      <div className="max-w-6xl mx-auto p-3 sm:p-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">💰 Accounts Receivable</h1>

          {/* Buscador */}
          <div className="space-y-3">
            <div className="relative">
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    tryUnlockBySecret(e.currentTarget.value);
                    if (e.currentTarget.value.trim() === CXC_SECRET) {
                      e.currentTarget.value = "";
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }
                }}
                placeholder="🔍 Buscar cliente..."
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 pr-10 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              />
              {adminMode && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-300 text-xs font-bold">
                    🔒 Admin
                  </span>
                </div>
              )}
            </div>

            {/* Filtros de score */}
            <div className="overflow-x-auto pb-2 -mx-2 px-2">
              <div className="flex gap-2 min-w-max">
                {["ALL", "0-399", "400-549", "550-649", "650-749", "750+"].map((k) => (
                  <button
                    key={k}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                      scoreFilter === k
                        ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md"
                        : "bg-white text-gray-700 border-2 border-gray-300 hover:border-blue-400"
                    }`}
                    onClick={() => {
                      setScoreFilter(k);
                      setPage(1);
                    }}
                  >
                    {k === "ALL" ? "📊 Todos" : `${k}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Controles */}
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="border-2 border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n} por página</option>
                ))}
              </select>
              <button
                onClick={() => setReloadTick((t) => t + 1)}
                className="border-2 border-gray-300 rounded-lg px-4 py-2 text-sm bg-white hover:bg-gray-50 font-semibold"
              >
                🔄 Recargar
              </button>
            </div>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
          <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200 rounded-xl p-4 shadow-md">
            <div className="text-red-600 text-xs uppercase font-bold mb-1">💸 Total CXC</div>
            <div className="text-2xl sm:text-3xl font-bold text-red-700">{fmt(metrics.saldoTotal)}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 shadow-md">
            <div className="text-blue-600 text-xs uppercase font-bold mb-1">📊 Score Promedio</div>
            <div className="text-2xl sm:text-3xl font-bold text-blue-700">{metrics.avgScore || 0}</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 shadow-md">
            <div className="text-green-600 text-xs uppercase font-bold mb-1">👥 Clientes</div>
            <div className="text-2xl sm:text-3xl font-bold text-green-700">{metrics.clientes}</div>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-3">
          {loading && (
            <div className="bg-white rounded-xl p-8 text-center border-2 border-gray-200">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4"></div>
              <div className="text-gray-500 font-semibold">Cargando clientes...</div>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center border-2 border-gray-200">
              <div className="text-6xl mb-4">🔍</div>
              <div className="text-gray-500 font-semibold">Sin resultados</div>
              <div className="text-sm text-gray-400 mt-2">Verifica tu conexión a la base de datos</div>
            </div>
          )}

          {/* MÓVIL: Cards */}
          <div className="block lg:hidden space-y-3">
            {!loading && rows.map((r) => (
              <div key={r.cliente_id} className="bg-white border-2 border-gray-200 rounded-xl shadow-md overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-3">
                  <div className="font-bold text-lg">{r.cliente_nombre}</div>
                  <div className="text-sm text-blue-100">#{r.cliente_id?.slice?.(0, 8)}...</div>
                  {r.nombre_negocio && (
                    <div className="text-sm text-blue-100 mt-1">🏪 {r.nombre_negocio}</div>
                  )}
                  {r.direccion && (
                    <div className="text-xs text-blue-200 mt-0.5">📍 {r.direccion}</div>
                  )}
                  {r.telefono && (
                    <div className="text-xs text-blue-200 mt-0.5">📞 {r.telefono}</div>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  {/* Métricas */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-gray-500">Saldo</div>
                      <div className="font-bold text-red-600">{fmt(r.saldo)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Score</div>
                      <div className="font-bold text-gray-900">{Number(r.score_base ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Límite</div>
                      <div className="font-bold text-gray-900">{fmt(r.limite_politica)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Disponible</div>
                      <div className="font-bold text-green-600">{fmt(r.credito_disponible)}</div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-2 pt-2">
                    {adminMode && (
                      <button
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-semibold"
                        onClick={() => openEditor(r)}
                      >
                        ✏️ Editar
                      </button>
                    )}
                    <button
                      className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-semibold shadow-md"
                      onClick={() => { setSelected(r); setOpenReminder(true); }}
                    >
                      💬 Recordatorio
                    </button>
                  </div>

                  {r.limite_manual != null && (
                    <div className="flex items-center gap-1 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                        ⚠️ Override manual
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP: Tabla */}
          <div className="hidden lg:block bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 uppercase">Cliente</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-700 uppercase">Saldo</th>
                    <th className="text-center px-4 py-3 text-xs font-bold text-gray-700 uppercase">Score</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-700 uppercase">Límite</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-700 uppercase">Disponible</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {!loading && rows.map((r) => (
                    <tr key={r.cliente_id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{r.cliente_nombre}</div>
                        <div className="text-xs text-gray-500">#{r.cliente_id?.slice?.(0, 8)}...</div>
                        {r.nombre_negocio && (
                          <div className="text-xs text-gray-600 mt-0.5">🏪 {r.nombre_negocio}</div>
                        )}
                        {r.direccion && (
                          <div className="text-xs text-gray-500 mt-0.5">📍 {r.direccion}</div>
                        )}
                        {r.telefono && (
                          <div className="text-xs text-gray-500 mt-0.5">📞 {r.telefono}</div>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          {adminMode && (
                            <button
                              className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold"
                              onClick={() => openEditor(r)}
                            >
                              ✏️ Editar
                            </button>
                          )}
                          {r.limite_manual != null && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                              override
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(r.saldo)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-800">
                          {Number(r.score_base ?? 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{fmt(r.limite_politica)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">{fmt(r.credito_disponible)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm font-semibold shadow-md"
                          onClick={() => { setSelected(r); setOpenReminder(true); }}
                        >
                          💬 Recordatorio
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Paginación */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 bg-white border-2 border-gray-200 rounded-xl p-4">
          <button
            className="w-full sm:w-auto px-6 py-3 border-2 border-gray-300 rounded-lg text-sm font-semibold bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Anterior
          </button>
          <div className="text-sm text-gray-700 font-semibold">
            Página <span className="text-blue-600">{page}</span> de <span className="text-blue-600">{totalPages}</span>
          </div>
          <button
            className="w-full sm:w-auto px-6 py-3 border-2 border-gray-300 rounded-lg text-sm font-semibold bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Siguiente →
          </button>
        </div>
      </div>

      {/* Modal de edición de límite */}
      {edit.open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full h-auto sm:max-w-md sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center justify-between">
              <div className="font-bold text-lg">✏️ Editar límite</div>
              <button
                onClick={() => setEdit((e) => ({ ...e, open: false }))}
                className="text-white hover:text-blue-200 text-2xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-sm text-gray-600">
                Cliente: <b className="text-gray-900">{edit.nombre}</b>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase font-semibold">Límite actual</div>
                <div className="text-xl font-bold text-gray-900 font-mono">
                  {fmt(Number(edit.actual || 0))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Nuevo límite manual
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={edit.input}
                  onChange={(e) => setEdit((x) => ({ ...x, input: e.target.value }))}
                  placeholder="Dejar vacío para usar política por score"
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Deja vacío para volver a la política automática
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white rounded-lg px-6 py-3 font-semibold"
                  onClick={() => setEdit((e) => ({ ...e, open: false }))}
                >
                  Cancelar
                </button>
                <button
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg px-6 py-3 font-semibold shadow-md"
                  onClick={saveLimit}
                >
                  💾 Guardar
                </button>
              </div>

              {edit.manual != null && (
                <button
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-lg px-6 py-3 font-semibold shadow-md"
                  onClick={() => setEdit((e) => ({ ...e, input: "" }))}
                >
                  🔄 Restaurar política automática
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de recordatorio */}
      {openReminder && selected && (
        <DetalleClienteModal
          cliente={selected}
          onClose={() => { setOpenReminder(false); setSelected(null); }}
        />
      )}
    </div>
  );
}