// src/CuentasPorCobrar.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const PAGE_SIZE_DEFAULT = 25;
const CXC_SECRET = "#cxcadmin2025"; // cambia el código si quieres

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
function useFetch(initialUrl = null, initialData = null) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async (url, options) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (initialUrl) run(initialUrl); }, [initialUrl]);
  return { data, loading, error, run, setData };
}
const normalizePhone = (raw) => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`; // US con 1
  if (digits.length === 10) return `+1${digits}`; // asume US si 10 dígitos
  return digits.startsWith("+") ? digits : `+${digits}`;
};
const openWhatsAppWith = (telefono, texto) => {
  const to = normalizePhone(telefono);
  if (!to) { alert("Este cliente no tiene teléfono válido."); return; }
  const url = `https://wa.me/${to.replace("+","")}?text=${encodeURIComponent(texto || "")}`;
  window.open(url, "_blank");
};

/* ========= Config FRONT (API y marca) ========= */
const CXC_API_BASE     = import.meta.env?.VITE_CXC_API_BASE     || "https://cxc-api.onrender.com";
const COMPANY_NAME     = import.meta.env?.VITE_COMPANY_NAME     || "Care Beauty Supply";
const PAY_URL          = import.meta.env?.VITE_PAY_URL          || "https://carebeautysupply.carrd.co/";
const CONTACT_EMAIL    = import.meta.env?.VITE_CONTACT_EMAIL    || "tools4care@gmail.com";
const CONTACT_PHONE    = import.meta.env?.VITE_CONTACT_PHONE    || "+1 (781) 953-1475 & +1 (857) 856-0030";

/* ========= helper para llamar /reminder ========= */
async function makeReminderAPI({ base = CXC_API_BASE, payload, signal }) {
  const res = await fetch(`${base}/reminder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || "API error");
  return json.message; // backend devuelve { ok, message }
}

/* ========= Plantillas rápidas y utilidades ========= */
const DEFAULT_TEMPLATES = [
  {
    key: "en_professional",
    name: "English · Professional",
    lang: "en",
    body:
`Hello {cliente}, this is {company}.
This is a friendly reminder about your account.
Outstanding balance: {saldo}.
{total_line}
You can choose a payment option here: {pay_url}
If you have any questions, reply here or contact us at {email} or {phone}.
Thank you for your business!
— {company}`.trim()
  },
  {
    key: "en_friendly",
    name: "English · Friendly",
    lang: "en",
    body:
`Hi {cliente}! {company} here 👋
Your balance is {saldo}.
{total_line}
Pay here: {pay_url}
Questions? {email} or {phone}. Thanks!`.trim()
  },
  {
    key: "en_short",
    name: "English · Short (SMS)",
    lang: "en",
    body: `{company} — Balance {saldo}. Pay: {pay_url} • Help: {phone} / {email}`
  },
  {
    key: "es_profesional",
    name: "Español · Profesional",
    lang: "es",
    body:
`Hola {cliente}, le escribe {company}.
Este es un recordatorio sobre su cuenta.
Saldo pendiente: {saldo}.
{total_line}
Opciones de pago: {pay_url}
Consultas: {email} | {phone}
Gracias por su preferencia.
— {company}`.trim()
  },
  {
    key: "es_amigable",
    name: "Español · Amigable",
    lang: "es",
    body:
`¡Hola {cliente}! {company} por aquí 👋
Su saldo pendiente es {saldo}.
{total_line}
Puede pagar aquí: {pay_url}
¿Dudas? {email} o {phone}. ¡Gracias!`.trim()
  },
  {
    key: "es_corto",
    name: "Español · Corto (SMS)",
    lang: "es",
    body: `{company} — Saldo {saldo}. Pagar: {pay_url} • Ayuda: {phone} / {email}`
  }
];

function loadUserTemplates() {
  try {
    const raw = localStorage.getItem("cxcTemplatesV1");
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveUserTemplates(list) {
  try { localStorage.setItem("cxcTemplatesV1", JSON.stringify(list)); } catch {}
}

function renderTemplate(tplBody, ctx) {
  const replace = (s, k, v) => s.replaceAll(`{${k}}`, v ?? "");
  let out = tplBody;
  const map = {
    cliente: ctx.cliente,
    saldo: currency(ctx.saldo),
    total: currency(ctx.total_cxc ?? 0),
    total_line: ctx.total_cxc != null && isFinite(ctx.total_cxc) ? `${ctx.lang === "es" ? "Total por cobrar" : "Total A/R"}: ${currency(ctx.total_cxc)}.` : "",
    company: ctx.company,
    pay_url: ctx.pay_url,
    email: ctx.email,
    phone: ctx.phone,
  };
  Object.entries(map).forEach(([k, v]) => { out = replace(out, k, String(v ?? "")); });
  return out.trim();
}

/* ====================== Modal Detalle + Recordatorio (API) ====================== */
function DetalleClienteModal({ api, cliente, onClose }) {
  const { data: detalle, loading, error, run } = useFetch();
  const { data: recData, setData: setRecData } = useFetch();
  const [mensaje, setMensaje] = useState("");

  // idioma, tono, teléfono
  const [lang, setLang] = useState("en");                  // "en" | "es"
  const [tone, setTone] = useState("professional");        // "professional" | "friendly" | "short"
  const [tel, setTel]   = useState("");

  // plantillas
  const [templates, setTemplates] = useState([...DEFAULT_TEMPLATES, ...loadUserTemplates()]);
  const [tplKey, setTplKey] = useState("en_professional");

  useEffect(() => {
    if (cliente?.cliente_id) {
      if (api && api.includes("/cxc")) {
        run(`${api}/cxc/clientes/${cliente.cliente_id}/pendientes`);
      }
      setMensaje("");
    }
  }, [cliente?.cliente_id, api]);

  // traer teléfono desde Supabase (con fallback)
  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!cliente?.cliente_id) { setTel(cliente?.telefono || ""); return; }
      try {
        const { data } = await supabase
          .from("clientes")
          .select("telefono")
          .eq("id", cliente.cliente_id)
          .maybeSingle();
        if (!ignore) setTel(data?.telefono || cliente?.telefono || "");
      } catch {
        if (!ignore) setTel(cliente?.telefono || "");
      }
    })();
    return () => { ignore = true; };
  }, [cliente?.cliente_id]);

  const currentContext = () => {
    // datos que usamos para renderizar plantilla
    const nombre =
      cliente?.cliente_nombre ||
      cliente?.cliente ||
      "Cliente";
    const saldoRow = Number(cliente?.saldo || 0);

    const totalCxc =
      Array.isArray(detalle) && detalle.length > 0
        ? detalle.reduce((t, d) => t + Number(d?.pendiente || 0), 0)
        : saldoRow;

    // limite/disponible no se muestran, pero igual los calculamos para la API
    const limite = Number(
      cliente?.limite_manual != null
        ? cliente?.limite_manual
        : cliente?.limite_politica || 0
    );
    const disponible = Number(
      cliente?.credito_disponible != null
        ? cliente?.credito_disponible
        : Math.max(0, limite - Math.max(0, saldoRow))
    );

    return {
      cliente: nombre,
      saldo: saldoRow,
      total_cxc: Number(totalCxc),
      limite,
      disponible,
      lang,
      tone,
      company: COMPANY_NAME,
      pay_url: PAY_URL,
      email: CONTACT_EMAIL,
      phone: CONTACT_PHONE,
    };
  };

  const generarSugerencia = async () => {
    const ctx = currentContext();
    try {
      // 1) Intento por API
      const msg = await makeReminderAPI({ base: CXC_API_BASE, payload: ctx });
      setMensaje(msg);
      setRecData({
        message: msg,
        mensaje_sugerido: msg,
        telefono: tel || cliente?.telefono || null,
        saldo_total: ctx.total_cxc,
      });
    } catch (_e) {
      // 2) Fallback local con plantilla
      const choice =
        (lang === "es" && tone === "professional") ? "es_profesional" :
        (lang === "es" && tone === "friendly")     ? "es_amigable"   :
        (lang === "es" && tone === "short")        ? "es_corto"      :
        (lang === "en" && tone === "friendly")     ? "en_friendly"   :
        (lang === "en" && tone === "short")        ? "en_short"      :
                                                     "en_professional";
      const tpl = templates.find(t => t.key === choice) || DEFAULT_TEMPLATES[0];
      const msg = renderTemplate(tpl.body, { ...ctx });
      setMensaje(msg);
      setRecData({
        message: msg,
        mensaje_sugerido: msg,
        telefono: tel || cliente?.telefono || null,
        saldo_total: ctx.total_cxc,
      });
    }
  };

  const applyTemplate = () => {
    const ctx = currentContext();
    const tpl = templates.find(t => t.key === tplKey);
    if (!tpl) return;
    const msg = renderTemplate(tpl.body, { ...ctx });
    setMensaje(msg);
    setRecData({
      message: msg,
      mensaje_sugerido: msg,
      telefono: tel || cliente?.telefono || null,
      saldo_total: ctx.total_cxc,
    });
  };

  const saveCurrentAsTemplate = () => {
    const name = prompt("Nombre para la plantilla:", "Mi plantilla");
    if (!name) return;
    const item = { key: `user_${Date.now()}`, name, lang, body: mensaje || "" };
    const user = loadUserTemplates();
    user.push(item);
    saveUserTemplates(user);
    setTemplates([...DEFAULT_TEMPLATES, ...user]);
    setTplKey(item.key);
    alert("Plantilla guardada ✅");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-3">
      <div className="bg-white w-full md:max-w-3xl rounded-2xl shadow-lg">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="font-bold text-lg">{cliente?.cliente_nombre || cliente?.cliente}</div>
            {(tel || recData?.telefono) && (
              <div className="text-sm text-slate-500">{tel || recData?.telefono}</div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Detalle de facturas */}
          <div>
            {loading && <div className="text-sm text-slate-500">Cargando detalle…</div>}
            {error && <div className="text-sm text-red-600">Error: {error}</div>}
            {!loading && !error && api && api.includes("/cxc") && (
              <div className="overflow-auto rounded border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-2">Factura</th>
                      <th className="text-left p-2">Fecha</th>
                      <th className="text-right p-2">Pendiente</th>
                      <th className="text-right p-2">Días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle?.map((d) => (
                      <tr key={d.numero_factura} className="border-t">
                        <td className="p-2">{d.numero_factura}</td>
                        <td className="p-2">{d.fecha?.slice?.(0,10)}</td>
                        <td className="p-2 text-right">{currency(d.pendiente)}</td>
                        <td className="p-2 text-right">{d.dias}</td>
                      </tr>
                    ))}
                    {(!detalle || detalle.length === 0) && (
                      <tr><td colSpan="4" className="p-3 text-center text-slate-500">Sin pendientes</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Zona de recordatorio */}
          <div className="border rounded-xl p-3 bg-slate-50">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="font-semibold">Mensaje de recordatorio</div>

                {/* idioma y tono */}
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                  title="Language"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>

                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                  title="Tone"
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="short">Short (SMS)</option>
                </select>

                {/* plantillas */}
                <select
                  value={tplKey}
                  onChange={(e) => setTplKey(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                  title="Templates"
                >
                  {templates
                    .filter(t => t.lang === lang || !t.lang)
                    .map(t => (
                      <option key={t.key} value={t.key}>{t.name}</option>
                    ))}
                </select>

                <button
                  onClick={applyTemplate}
                  className="border rounded px-2 py-1 text-sm bg-white hover:bg-gray-50"
                >
                  Aplicar
                </button>

                <button
                  onClick={saveCurrentAsTemplate}
                  className="border rounded px-2 py-1 text-sm bg-white hover:bg-gray-50"
                  title="Guardar el texto actual como una plantilla mía"
                >
                  Guardar como plantilla
                </button>
              </div>

              {!recData && (
                <button
                  onClick={generarSugerencia}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm"
                >
                  Generar sugerencia
                </button>
              )}
            </div>

            {recData && (
              <>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm h-28"
                  value={mensaje}
                  onChange={e=>setMensaje(e.target.value)}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={async () => {
                    try { await navigator.clipboard.writeText(mensaje || ""); alert("Message copied ✅"); }
                    catch { alert("No se pudo copiar automáticamente."); }
                  }}
                    className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm">
                    Copiar
                  </button>
                  <button onClick={() => openWhatsAppWith(tel || recData?.telefono, mensaje)}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    WhatsApp
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Total: {currency(recData?.saldo_total || 0)} • Tel: {tel || recData?.telefono || "—"}
                </div>
              </>
            )}

            {!recData && (
              <div className="text-xs text-slate-500">
                Haz clic en “Generar sugerencia” para crear el mensaje (intenta API y tiene fallback local).
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            {!recData && (
              <button
                onClick={generarSugerencia}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg"
              >
                Generar recordatorio
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====================== Página principal (tu código + integración) ====================== */
export default function CuentasPorCobrar() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [scoreFilter, setScoreFilter] = useState("ALL"); // ALL | 0-399 | 400-549 | 550-649 | 650-749 | 750+
  const scoreRanges = {
    "0-399": [0, 399],
    "400-549": [400, 549],
    "550-649": [550, 649],
    "650-749": [650, 749],
    "750+": [750, 1000],
  };

  // ------- NUEVO: modo admin y editor de límite -------
  const [adminMode, setAdminMode] = useState(false);
  const [reloadTick, setReloadTick] = useState(0); // para forzar recarga
  const [edit, setEdit] = useState({
    open: false,
    id: null,
    nombre: "",
    actual: 0,
    manual: null,
    input: "",
  });

  // ------- NUEVO: modal de detalle/recordatorio (API) -------
  // Si usas otro backend para /cxc/clientes/... deja esto vacío.
  // La API de recordatorios usa CXC_API_BASE directamente dentro del modal.
  const apiBase = ""; 

  const [selected, setSelected] = useState(null); // {cliente_id, cliente_nombre, ...}
  const [openReminder, setOpenReminder] = useState(false);

  function tryUnlockBySecret(value) {
    const typed = (value || "").trim();
    if (typed === CXC_SECRET) {
      setAdminMode((v) => !v);
      alert(`Modo admin ${!adminMode ? "activado" : "desactivado"}`);
      setQ(""); // limpiamos el buscador
    }
  }

  function openEditor(row) {
    setEdit({
      open: true,
      id: row.cliente_id,
      nombre: row.cliente_nombre,
      actual: Number(row.limite_politica || 0),
      manual: row.limite_manual, // puede ser null
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
    setReloadTick((t) => t + 1); // recarga la tabla
  }
  // ------- FIN NUEVO -------

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        let query = supabase
          .from("v_cxc_cliente_detalle_ext")
          .select(
            "cliente_id, cliente_nombre, saldo, limite_politica, credito_disponible, score_base, limite_manual",
            { count: "exact" }
          );

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
        const { data, error, count } = await query.range(from, to);

        if (!ignore) {
          if (error) {
            console.warn("CxC view read failed", error?.message);
            setRows([]);
            setTotal(0);
          } else {
            setRows(data || []);
            setTotal(count || 0);
          }
        }
      } catch (e) {
        if (!ignore) {
          console.warn("CxC load error", e?.message);
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
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">Cuentas por Cobrar</h1>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-4">
        <div className="w-full sm:w-80">
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
            placeholder="Buscar cliente…"
            className="w-full border rounded-lg px-3 py-2"
          />
          {adminMode && (
            <div className="mt-1 text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-100 text-purple-700 border border-purple-200">
              🔒 Admin
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {["ALL", "0-399", "400-549", "550-649", "650-749", "750+"].map((k) => (
            <button
              key={k}
              className={`px-3 py-2 rounded-lg text-sm border ${
                scoreFilter === k
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
              onClick={() => {
                setScoreFilter(k);
                setPage(1);
              }}
            >
              {k === "ALL" ? "Todos los scores" : `Score ${k}`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-sm text-gray-600">Page size:</label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="border rounded-lg px-2 py-1"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            onClick={() => setReloadTick((t) => t + 1)}
            className="border rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50"
          >
            Recargar
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-gray-500 text-xs uppercase font-semibold">Total CXC</div>
          <div className="text-2xl font-bold">{fmt(metrics.saldoTotal)}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-gray-500 text-xs uppercase font-semibold">Score promedio</div>
          <div className="text-2xl font-bold">{metrics.avgScore || 0}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-gray-500 text-xs uppercase font-semibold">Clientes</div>
          <div className="text-2xl font-bold">{metrics.clientes}</div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Cliente</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Saldo</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600">Score base</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Límite (política)</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Crédito disp.</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Sin resultados
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.cliente_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-gray-900">{r.cliente_nombre}</div>
                    <div className="text-xs text-gray-500">#{r.cliente_id?.slice?.(0, 8)}…</div>

                    {/* controles admin */}
                    <div className="mt-1 flex items-center gap-2">
                      {adminMode && (
                        <button
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() => openEditor(r)}
                        >
                          ✏️ Editar límite
                        </button>
                      )}
                      {r.limite_manual != null && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                          override
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(r.saldo)}</td>
                  <td className="px-4 py-3 text-center">{Number(r.score_base ?? 0)}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.limite_politica)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                    {fmt(r.credito_disponible)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => { setSelected(r); setOpenReminder(true); }}
                      title="Detalle y recordatorio (API)"
                    >
                      Recordatorio
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between mt-4">
        <button
          className="px-3 py-2 border rounded-lg text-sm bg-white disabled:opacity-50"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          ← Anterior
        </button>
        <div className="text-sm text-gray-600">
          Página {page} de {totalPages}
        </div>
        <button
          className="px-3 py-2 border rounded-lg text-sm bg-white disabled:opacity-50"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Siguiente →
        </button>
      </div>

      {/* Modal de edición de límite */}
      {edit.open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-4 py-3 bg-blue-600 text-white flex items-center justify-between">
              <div className="font-semibold">Editar límite de crédito</div>
              <button
                onClick={() => setEdit((e) => ({ ...e, open: false }))}
                className="opacity-80 hover:opacity-100"
              >
                ✖️
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm text-gray-600">
                Cliente: <b>{edit.nombre}</b>
              </div>

              <div className="text-sm">
                <div className="text-gray-500">Límite actual usado</div>
                <div className="font-mono font-semibold">
                  {fmt(Number(edit.actual || 0))}
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Nuevo límite (deja vacío para volver a la política por score)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={edit.input}
                onChange={(e) => setEdit((x) => ({ ...x, input: e.target.value }))}
                placeholder={edit.manual != null ? String(edit.manual) : ""}
                className="w-full border rounded-lg px-3 py-2"
                autoFocus
              />

              <div className="flex gap-2 pt-2">
                <button
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white rounded-lg px-4 py-2"
                  onClick={() => setEdit((e) => ({ ...e, open: false }))}
                >
                  Cancelar
                </button>
                <button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2"
                  onClick={saveLimit}
                >
                  Guardar
                </button>
              </div>

              {edit.manual != null && (
                <button
                  className="w-full mt-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2"
                  onClick={() => setEdit((e) => ({ ...e, input: "" }))}
                >
                  Restaurar a política (limpiar override)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle + recordatorio (API) */}
      {openReminder && selected && (
        <DetalleClienteModal
          api={apiBase}
          cliente={selected}
          onClose={() => { setOpenReminder(false); setSelected(null); }}
        />
      )}
    </div>
  );
}
