import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import autoTable from "jspdf-autotable";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Search, Plus, Edit, DollarSign, FileText, User, Phone, Mail,
  MapPin, Building2, Calendar, TrendingUp, X, Check, ChevronsLeft,
  ChevronLeft, ChevronRight, ChevronsRight, BarChart3, RefreshCcw,
  ChevronDown, ChevronUp, Trash2, Download
} from "lucide-react";

/* === CxC centralizado === */
import { getCxcCliente, subscribeClienteLimiteManual } from "./lib/cxc";

/* === Leer desde la vista === */
const CLIENTS_VIEW = "clientes_balance_v2";

/* -------------------- Utilidades -------------------- */
const estadosUSA = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY"
];

// ZIPs más comunes de MA (puedes ampliar libremente)
const ZIP_MA_LOCAL = {
  // Boston y barrios/PO
  "02108": { ciudad: "Boston", estado: "MA" },
  "02109": { ciudad: "Boston", estado: "MA" },
  "02110": { ciudad: "Boston", estado: "MA" },
  "02111": { ciudad: "Boston", estado: "MA" },
  "02113": { ciudad: "Boston", estado: "MA" },
  "02114": { ciudad: "Boston", estado: "MA" },
  "02115": { ciudad: "Boston", estado: "MA" },
  "02116": { ciudad: "Boston", estado: "MA" },
  "02118": { ciudad: "Boston", estado: "MA" },
  "02119": { ciudad: "Roxbury", estado: "MA" },
  "02120": { ciudad: "Mission Hill", estado: "MA" },
  "02121": { ciudad: "Dorchester", estado: "MA" },
  "02122": { ciudad: "Dorchester", estado: "MA" },
  "02124": { ciudad: "Dorchester", estado: "MA" },
  "02125": { ciudad: "Dorchester", estado: "MA" },
  "02126": { ciudad: "Mattapan", estado: "MA" },
  "02127": { ciudad: "South Boston", estado: "MA" },
  "02128": { ciudad: "East Boston", estado: "MA" },
  "02129": { ciudad: "Charlestown", estado: "MA" },
  "02130": { ciudad: "Jamaica Plain", estado: "MA" },
  "02131": { ciudad: "Roslindale", estado: "MA" },
  "02132": { ciudad: "West Roxbury", estado: "MA" },
  "02134": { ciudad: "Allston", estado: "MA" },
  "02135": { ciudad: "Brighton", estado: "MA" },
  "02136": { ciudad: "Hyde Park", estado: "MA" },

  // Cambridge / Somerville / Brookline
  "02138": { ciudad: "Cambridge", estado: "MA" },
  "02139": { ciudad: "Cambridge", estado: "MA" },
  "02140": { ciudad: "Cambridge", estado: "MA" },
  "02141": { ciudad: "Cambridge", estado: "MA" },
  "02142": { ciudad: "Cambridge", estado: "MA" },
  "02143": { ciudad: "Somerville", estado: "MA" },
  "02144": { ciudad: "Somerville", estado: "MA" },
  "02145": { ciudad: "Somerville", estado: "MA" },
  "02445": { ciudad: "Brookline", estado: "MA" },
  "02446": { ciudad: "Brookline", estado: "MA" },

  // North Shore
  "01901": { ciudad: "Lynn", estado: "MA" },
  "01902": { ciudad: "Lynn", estado: "MA" },
  "01905": { ciudad: "Lynn", estado: "MA" },
  "01915": { ciudad: "Beverly", estado: "MA" },
  "01923": { ciudad: "Danvers", estado: "MA" },
  "01930": { ciudad: "Gloucester", estado: "MA" },
  "01940": { ciudad: "Lynnfield", estado: "MA" },
  "01945": { ciudad: "Marblehead", estado: "MA" },
  "01950": { ciudad: "Newburyport", estado: "MA" },
  "01960": { ciudad: "Peabody", estado: "MA" },
  "01970": { ciudad: "Salem", estado: "MA" },
  "01984": { ciudad: "Wenham", estado: "MA" },

  // MetroWest / Middlesex
  "01701": { ciudad: "Framingham", estado: "MA" },
  "01702": { ciudad: "Framingham", estado: "MA" },
  "01760": { ciudad: "Natick", estado: "MA" },
  "01801": { ciudad: "Woburn", estado: "MA" },
  "01810": { ciudad: "Andover", estado: "MA" },
  "01821": { ciudad: "Billerica", estado: "MA" },
  "01824": { ciudad: "Chelmsford", estado: "MA" },
  "01826": { ciudad: "Dracut", estado: "MA" },
  "01844": { ciudad: "Methuen", estado: "MA" },
  "01850": { ciudad: "Lowell", estado: "MA" },
  "01852": { ciudad: "Lowell", estado: "MA" },
  "01854": { ciudad: "Lowell", estado: "MA" },

  // Worcester y centro
  "01602": { ciudad: "Worcester", estado: "MA" },
  "01603": { ciudad: "Worcester", estado: "MA" },
  "01604": { ciudad: "Worcester", estado: "MA" },
  "01545": { ciudad: "Shrewsbury", estado: "MA" },
  "01581": { ciudad: "Westborough", estado: "MA" },

  // South Shore / South Coast
  "02301": { ciudad: "Brockton", estado: "MA" },
  "02302": { ciudad: "Brockton", estado: "MA" },
  "02368": { ciudad: "Randolph", estado: "MA" },
  "02370": { ciudad: "Rockland", estado: "MA" },
  "02375": { ciudad: "Easton", estado: "MA" },
  "02720": { ciudad: "Fall River", estado: "MA" },
  "02740": { ciudad: "New Bedford", estado: "MA" },
  "02780": { ciudad: "Taunton", estado: "MA" },

  // Cape & Islands
  "02601": { ciudad: "Hyannis", estado: "MA" },
  "02641": { ciudad: "Eastham", estado: "MA" },
  "02657": { ciudad: "Provincetown", estado: "MA" },
  "02664": { ciudad: "South Yarmouth", estado: "MA" },
  "02532": { ciudad: "Buzzards Bay", estado: "MA" },
  "02540": { ciudad: "Falmouth", estado: "MA" },
  "02554": { ciudad: "Nantucket", estado: "MA" },

  // Western MA
  "01002": { ciudad: "Amherst", estado: "MA" },
  "01020": { ciudad: "Chicopee", estado: "MA" },
  "01089": { ciudad: "West Springfield", estado: "MA" },
  "01103": { ciudad: "Springfield", estado: "MA" },
  "01201": { ciudad: "Pittsfield", estado: "MA" },
};

// Lookup rápido en el mapa local
function zipToCiudadEstado(zip) {
  return ZIP_MA_LOCAL[zip] || { ciudad: "", estado: "" };
}

// Detecta si un ZIP pertenece a MA (010–027 y 055xx)
function isMA(zip) {
  const s = String(zip || "").replace(/\D/g, "");
  if (s.length !== 5) return false;
  const p = Number(s.slice(0, 3));
  return (p >= 10 && p <= 27) || p === 55;
}

async function lookupZipOnline(zip) {
  // caché simple en localStorage
  try {
    const cacheKey = `zip:${zip}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const obj = JSON.parse(cached);
      if (obj?.ciudad || obj?.estado) return obj;
    }
  } catch {}

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) return null;
    const out = {
      ciudad: String(place["place name"] || "").trim(),
      estado: String(place["state abbreviation"] || "").trim().toUpperCase(),
    };
    try { localStorage.setItem(`zip:${zip}`, JSON.stringify(out)); } catch {}
    return out;
  } catch {
    return null;
  }
}

// === Helpers numéricos (evitan mostrar "-0.00")
const safe2 = (n) => {
  const x = Math.round(Number(n || 0) * 100) / 100;
  return Math.abs(x) < 0.005 ? 0 : x;
};
const fmtSafe = (n) =>
  `$${safe2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** ================== HELPERS DIRECCIÓN ================== */
/**
 * Acepta un string de dirección libre (ej: "11 Winthrop Ave, Beverly MA 01915")
 * y devuelve un objeto normalizado {calle, ciudad, estado, zip}.
 */
function parseDireccionString(raw) {
  if (!raw || typeof raw !== "string") {
    return { calle: "", ciudad: "", estado: "", zip: "" };
  }

  // normaliza espacios y comas "raras"
  let s = raw
    .replace(/\s+/g, " ")
    .replace(/\bNone\b/gi, "")
    .replace(/\s+,/g, ",")
    .trim();

  // ZIP (5 o 4 dígitos al final; si tiene 4, asumimos leading zero)
  let zip = "";
  const zipMatch = s.match(/(\d{5}|\d{4})\s*$/);
  if (zipMatch) {
    zip = zipMatch[1];
    if (zip.length === 4) zip = "0" + zip;
    s = s.replace(new RegExp(`[,\\s]*${zipMatch[1]}\\s*$`), "").trim();
  }

  // ESTADO (dos letras al final, con o sin coma)
  let estado = "";
  const stateMatch = s.match(/(?:,|\s)([A-Z]{2})\s*$/i);
  if (stateMatch) {
    estado = (stateMatch[1] || "").toUpperCase();
    s = s.replace(new RegExp(`[,\\s]*${estado}\\s*$`, "i"), "").trim();
  }

  // CALLE / CIUDAD
  let calle = "";
  let ciudad = "";
  if (s.includes(",")) {
    const parts = s.split(",").map(t => t.trim()).filter(Boolean);
    if (parts.length >= 2) {
      ciudad = parts.pop() || "";
      calle = parts.join(", ");
    } else {
      calle = parts[0] || "";
    }
  } else {
    const tokens = s.split(" ").filter(Boolean);
    if (tokens.length >= 2) {
      ciudad = tokens.slice(-1)[0];
      calle  = tokens.slice(0, -1).join(" ");
    } else {
      calle = s;
    }
  }

  // Si tenemos ZIP pero falta ciudad/estado, intenta inferir
  if (zip && (!estado || !ciudad)) {
    const z = zipToCiudadEstado(zip);
    if (!estado && z.estado) estado = z.estado;
    if (!ciudad && z.ciudad) ciudad = z.ciudad;
  }

  return {
    calle: calle.trim(),
    ciudad: ciudad.trim(),
    estado: (estado || "").toUpperCase(),
    zip
  };
}

/**
 * Normaliza cualquier forma de "direccion":
 *  - objeto {calle, ciudad, estado, zip}
 *  - string JSON con esas llaves
 *  - string libre (ej: "11 Winthrop Ave, Beverly MA 01915")
 */
function normalizeDireccion(raw) {
  if (!raw) return { calle: "", ciudad: "", estado: "", zip: "" };

  if (typeof raw === "string") {
    const s = raw.trim();

    // Si parece JSON, intenta parsear como objeto
    if (s.startsWith("{") && s.endsWith("}")) {
      try {
        const o = JSON.parse(s);
        return {
          calle:  o.calle  || "",
          ciudad: o.ciudad || "",
          estado: (o.estado || "").toUpperCase(),
          zip:    o.zip    || "",
        };
      } catch {
        // si falla, cae a parseo de texto libre
      }
    }

    // Texto libre
    return parseDireccionString(s);
  }

  if (typeof raw === "object") {
    return {
      calle:  raw.calle  || "",
      ciudad: raw.ciudad || "",
      estado: (raw.estado || "").toUpperCase(),
      zip:    raw.zip    || "",
    };
  }

  return { calle: "", ciudad: "", estado: "", zip: "" };
}

/**
 * Devuelve un string presentable para UI siempre en formato:
 * "calle, ciudad, estado, zip" o "No address" si no hay datos.
 */
function prettyAddress(raw) {
  const d = normalizeDireccion(raw);
  const parts = [d.calle, d.ciudad, d.estado, d.zip].filter(Boolean);
  return parts.length ? parts.join(", ") : "No address";
}

/** ✅ Formateo en tiempo real y para mostrar sin asteriscos: "(555) 123-4567" */
function formatPhoneForInput(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("1") && d.length > 10) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  const a = d.slice(0, 3);
  if (d.length < 7) return `(${a}) ${d.slice(3)}`;
  const b = d.slice(3, 6);
  const c = d.slice(6);
  return `(${a}) ${b}-${c}`;
}

// UUID para idempotencia
const makeUUID = () =>
  (globalThis.crypto?.randomUUID?.()) ||
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// ⚡ Wrapper OPTIMIZADO para obtener CxC (solo cuando se necesita)
async function safeGetCxc(clienteId) {
  try {
    const info = await getCxcCliente(clienteId);
    if (info) {
      return {
        saldo: Number(info.saldo ?? 0),
        limite: Number(info.limite ?? 0),
        disponible: Number(info.disponible ?? 0),
        limite_manual_aplicado: Boolean(info.limite_manual_aplicado ?? false),
      };
    }
  } catch (_) {
    if (!clienteId) return null;
    const { data, error } = await supabase
      .from("v_cxc_cliente_detalle")
      .select("saldo, limite_politica, credito_disponible")
      .eq("cliente_id", clienteId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      saldo: Number(data.saldo ?? 0),
      limite: Number(data.limite_politica ?? 0),
      disponible: Number(data.credito_disponible ?? 0),
      limite_manual_aplicado: false,
    };
  }
  return null;
}

/* ===================================================================
   ======  Mensajes / Recibos (SMS / Email)  =========================
   =================================================================== */

const COMPANY_NAME  = import.meta?.env?.VITE_COMPANY_NAME  || "Tools4CareMovil";
const COMPANY_EMAIL = import.meta?.env?.VITE_COMPANY_EMAIL || "Tools4care@gmail.com";
const EMAIL_MODE = (import.meta?.env?.VITE_EMAIL_MODE || "mailto").toLowerCase();

/* ========================= Stripe QR Payment Helpers ========================= */
const CHECKOUT_FN_URL =
  "https://gvloygqbavibmpakzdma.functions.supabase.co/create_checkout_session";
const CHECK_FN_URL =
  "https://gvloygqbavibmpakzdma.functions.supabase.co/check_checkout_session";

const extraHeaders = {};

async function withTimeout(run, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort("timeout"), ms);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

async function createStripeCheckoutSession(amount, description = "Pago de cliente") {
  const num = Number(amount);
  if (!Number.isFinite(num)) throw new Error("Amount inválido");

  const cents = Math.round(num * 100);
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new Error("Amount debe ser mayor a 0");
  }

  const success_url = `${window.location.origin}/payment-success`;
  const cancel_url = `${window.location.origin}/payment-cancelled`;

  const doFetch = (signal) =>
    fetch(CHECKOUT_FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify({
        amount: cents,
        currency: "usd",
        description: String(description || "Pago de cliente").slice(0, 120),
        success_url,
        cancel_url,
      }),
      signal,
    });

  let res, data;
  try {
    res = await withTimeout(doFetch);
  } catch (e) {
    throw new Error(`No se pudo conectar con la función (create_checkout_session): ${e?.message || e}`);
  }

  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status} creando Checkout Session`;
    throw new Error(msg);
  }
  if (!data?.url || !data?.sessionId) {
    throw new Error("Respuesta inválida de create_checkout_session (faltan url/sessionId)");
  }

  return { url: data.url, sessionId: data.sessionId };
}

async function checkStripeCheckoutStatus(sessionId) {
  if (!sessionId) return { ok: false, error: "sessionId requerido" };

  const doFetch = (signal) =>
    fetch(CHECK_FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify({ session_id: sessionId }),
      signal,
    });

  let res, data;
  try {
    res = await withTimeout(doFetch);
  } catch (e) {
    return { ok: false, error: `No se pudo conectar (check_checkout_session): ${e?.message || e}` };
  }

  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status} al verificar Checkout Session` };
  }

  return {
    ok: true,
    status: data.status,
    paid: !!data.paid,
    amount: data.amount,
    currency: data.currency,
    payment_status: data.payment_status,
    session_status: data.session_status,
  };
}

async function generateQRCode(text) {
  try {
    const qrDataUrl = await QRCode.toDataURL(text, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    return qrDataUrl;
  } catch (err) {
    console.error("Error generating QR:", err);
    return null;
  }
}
const fmtCurrency = (n) => fmtSafe(n);
function getCreditNumber(c) { return c?.credito_id || c?.id || "—"; }
function isIOS() {
  const ua = navigator.userAgent || navigator.vendor || "";
  return /iPad|iPhone|iPod|Macintosh/.test(ua);
}
function normalizePhoneE164ish(raw, defaultCountry = "1") {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const withCc = digits.length === 10 ? defaultCountry + digits : digits;
  return withCc.startsWith("+") ? withCc : `+${withCc}`;
}
function buildSmsUrl(phone, message) {
  const target = normalizePhoneE164ish(phone, "1");
  if (!target) return null;
  const body = encodeURIComponent(String(message || ""));
  const sep = isIOS() ? "&" : "?";
  return `sms:${target}${sep}body=${body}`;
}
async function sendSmsIfPossible({ phone, text }) {
  if (!phone || !text) return { ok: false, reason: "missing_phone_or_text" };
  const href = buildSmsUrl(phone, text);
  if (!href) return { ok: false, reason: "invalid_sms_url" };
  try {
    const a = document.createElement("a");
    a.href = href; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    return { ok: true, opened: true };
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      alert("SMS preparado. Abre tu app de Mensajes y pega el texto.");
      return { ok: true, copied: true };
    } catch {
      return { ok: false, reason: "popup_blocked_and_clipboard_failed" };
    }
  }
}
function buildMailtoUrl(to, subject, body) {
  if (!to) return null;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
async function sendEmailSmart({ to, subject, html, text }) {
  if (!to) return { ok: false, reason: "missing_email" };

  if (EMAIL_MODE === "edge") {
    try {
      const { data, error } = await supabase.functions.invoke("send-receipt", {
        body: { to, subject, html, text, from: COMPANY_EMAIL, company: COMPANY_NAME },
      });
      if (error) throw error;
      return { ok: true, via: "edge", data };
    } catch (e) {
      console.warn("Edge email failed, fallback a mailto:", e?.message || e);
    }
  }

  const mailto = buildMailtoUrl(to, subject, text);
  const w = mailto ? window.open(mailto, "_blank") : null;
  if (!w && text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Email copiado. Abre tu correo y pega el contenido.");
      return { ok: true, via: "mailto-copy" };
    } catch {
      return { ok: false, reason: "mailto_failed_and_clipboard_failed" };
    }
  }
  return { ok: true, via: "mailto" };
}
async function askChannel({ hasPhone, hasEmail }) {
  if (!hasPhone && !hasEmail) return null;
  if (hasPhone && !hasEmail) return window.confirm("¿Enviar recibo por SMS?") ? "sms" : null;
  if (!hasEmail && hasPhone === false) return null;
  if (!hasPhone && hasEmail) return window.confirm("¿Enviar recibo por Email?") ? "email" : null;
  const ans = (window.prompt("¿Cómo quieres enviar el recibo? (sms / email)", "sms") || "").trim().toLowerCase();
  if (ans === "sms" && hasPhone) return "sms";
  if (ans === "email" && hasEmail) return "email";
  return null;
}
function composePaymentMessageEN({ clientName, creditNumber, dateStr, amount, prevBalance, newBalance, pointOfSaleName }) {
  const lines = [];
  lines.push(`${COMPANY_NAME} — Payment Receipt`);
  lines.push(`Date: ${dateStr}`);
  if (pointOfSaleName) lines.push(`Point of sale: ${pointOfSaleName}`);
  if (clientName) lines.push(`Customer: ${clientName} (Credit #${creditNumber || "—"})`);
  lines.push("");
  lines.push(`Payment received: ${fmtCurrency(amount)}`);
  lines.push(`Previous balance: ${fmtCurrency(prevBalance)}`);
  lines.push(`*** New balance: ${fmtCurrency(newBalance)} ***`);
  lines.push("");
  lines.push(`Msg&data rates may apply. Reply STOP to opt out. HELP for help.`);
  return lines.join("\n");
}
async function requestAndSendPaymentReceipt({ client, payload }) {
  const hasPhone = !!client?.telefono;
  const hasEmail = !!client?.email;
  if (!hasPhone && !hasEmail) return;

  const wants = await askChannel({ hasPhone, hasEmail });
  if (!wants) return;

  const subject = `${COMPANY_NAME} — Payment ${new Date().toLocaleDateString()}`;
  const text = composePaymentMessageEN(payload);
  const html = text;

  if (wants === "sms") await sendSmsIfPossible({ phone: client.telefono, text });
  else if (wants === "email") await sendEmailSmart({ to: client.email, subject, html, text });
}

/* -------------------- COMPONENTE PRINCIPAL -------------------- */
export default function Clientes() {
  const location = useLocation();
  const navigate = useNavigate();

  // Tabla
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRows, setTotalRows] = useState(0);

  // Totales header (globales)
  const [totales, setTotales] = useState({ totalClients: 0, withDebt: 0, totalOutstanding: 0 });

  // Detalles / modales
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarStats, setMostrarStats] = useState(false);
  const [mostrarEdicion, setMostrarEdicion] = useState(false);
  const [mostrarAbono, setMostrarAbono] = useState(false);
  const [resumen, setResumen] = useState({ ventas: [], pagos: [], balance: 0, cxc: null });

  const [mensaje, setMensaje] = useState("");
  const [estadoInput, setEstadoInput] = useState("");
  const [estadoOpciones, setEstadoOpciones] = useState(estadosUSA);
  const [mesSeleccionado, setMesSeleccionado] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Auto-refresh crédito refs
  const focusHandlerRef = useRef(null);
  const intervalRef = useRef(null);
  const realtimeUnsubRef = useRef(null);

  // --- Formulario ---
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    negocio: "",
    direccion: { calle: "", ciudad: "", estado: "", zip: "" },
  });

  // Ref para buscar con atajo
  const searchRef = useRef(null);

  /* -------------------- Debounce búsqueda -------------------- */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(busqueda.trim()), 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  /* -------------------- Totales globales (cards) -------------------- */
  async function cargarTotales() {
    // Todo desde la vista
    const { count: totalClients } = await supabase
      .from(CLIENTS_VIEW)
      .select("*", { count: "exact", head: true });

    const { count: withDebt } = await supabase
      .from(CLIENTS_VIEW)
      .select("*", { count: "exact", head: true })
      .gt("balance", 0);

    const { data: saldosRows } = await supabase
      .from(CLIENTS_VIEW)
      .select("balance");

    const totalOutstanding = (saldosRows || []).reduce(
      (s, r) => s + Math.max(0, Number(r.balance || 0)),
      0
    );

    setTotales({
      totalClients: totalClients || 0,
      withDebt: withDebt || 0,
      totalOutstanding
    });
  }

/* ⚡ OPTIMIZADO: Cargar página CON búsqueda completa de dirección */
const fetchPage = async (opts = {}) => {
  const { p = page, ps = pageSize, q = debounced } = opts;
  setIsLoading(true);
  setMensaje("");
  const from = (p - 1) * ps;
  const to = from + ps - 1;

  let query = supabase
    .from(CLIENTS_VIEW)
    .select("*", { count: "exact" })
    .order("nombre", { ascending: true })
    .range(from, to);

  if (q) {
    const like = `%${q}%`;
    const qDigits = (q || "").replace(/\D/g, "");

    // 🔍 BÚSQUEDA COMPLETA: Nombre, Email, Negocio, Teléfono, Dirección
    const filtros = [
      `nombre.ilike.${like}`,
      `email.ilike.${like}`,
      `negocio.ilike.${like}`,
      `telefono.ilike.${like}`,
      `direccion.ilike.${like}`,     // ✅ Dirección completa
      `dir_calle.ilike.${like}`,     // ✅ Calle
      `dir_ciudad.ilike.${like}`,    // ✅ Ciudad
      `dir_estado.ilike.${like}`,    // ✅ Estado
      `dir_zip.ilike.${like}`,       // ✅ ZIP
    ];

    // 🔍 Búsqueda por dígitos de teléfono (si hay al menos 3 dígitos)
    if (qDigits.length >= 3) {
      const likeDigits = `%${qDigits}%`;
      filtros.push(
        `tel_norm.ilike.${likeDigits}`,
        `tel_norm.ilike.%1${qDigits}%`
      );
    }

    query = query.or(filtros.join(","));
  }

  const { data, error, count } = await query;
  if (error) {
    setMensaje("Error loading clients");
    setIsLoading(false);
    return;
  }
  
  setClientes(data || []);
  setTotalRows(count || 0);
  setIsLoading(false);
};

  useEffect(() => {
    fetchPage({ p: 1, ps: pageSize, q: debounced });
    setPage(1);
  }, [debounced, pageSize]);

  useEffect(() => {
    fetchPage({ p: page, ps: pageSize, q: debounced });
  }, [page]);

  useEffect(() => { cargarTotales(); }, []);

  useEffect(() => {
    if (location.pathname.endsWith("/clientes/nuevo")) {
      abrirNuevoCliente();
    } else {
      setMostrarEdicion(false);
    }
  }, [location.pathname]);

  function abrirNuevoCliente() {
    setForm({
      nombre: "",
      telefono: "",
      email: "",
      negocio: "",
      direccion: { calle: "", ciudad: "", estado: "", zip: "" },
    });
    setEstadoInput("");
    setEstadoOpciones(estadosUSA);
    setClienteSeleccionado(null);
    setMostrarEdicion(true);
    setMensaje("");
  }

  // Atajos: ⌘/Ctrl+N (nuevo), ⌘/Ctrl+K (buscar)
  useEffect(() => {
    const handler = (e) => {
      const key = (e.key || "").toLowerCase();
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (key === "n") {
        e.preventDefault();
        abrirNuevoCliente();
        navigate("/clientes/nuevo");
      } else if (key === "k") {
        e.preventDefault();
        try { searchRef.current?.focus(); } catch {}
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /** ================== EDITAR CLIENTE ================== */
  function handleEditCliente(cArg) {
    const c = cArg || clienteSeleccionado;
    if (!c) return;

    let direccion = { calle: "", ciudad: "", estado: "", zip: "" };
    const raw = c?.direccion;

    if (typeof raw === "string" && raw) {
      direccion = parseDireccionString(raw);
    } else if (raw && typeof raw === "object") {
      direccion = {
        calle: raw.calle || "",
        ciudad: raw.ciudad || "",
        estado: (raw.estado || "").toUpperCase(),
        zip: raw.zip || ""
      };
      if (direccion.zip && (!direccion.estado || !direccion.ciudad)) {
        const z = zipToCiudadEstado(direccion.zip);
        if (!direccion.estado && z.estado) direccion.estado = z.estado;
        if (!direccion.ciudad && z.ciudad) direccion.ciudad = z.ciudad;
      }
    } else if (typeof raw === "string") {
      direccion = { calle: raw || "", ciudad: "", estado: "", zip: "" };
    }

    const telFmt = formatPhoneForInput(c?.telefono ?? c?.phone ?? "");

    setForm({
      nombre:  c?.nombre  || "",
      telefono: telFmt     || "",
      email:   c?.email    || "",
      negocio: c?.negocio  || "",
      direccion
    });

    const estadoUpper = (direccion.estado || "").toUpperCase();
    setEstadoInput(estadoUpper);
    const filtradas = estadosUSA.filter(s => s.startsWith(estadoUpper));
    setEstadoOpciones(filtradas.length ? filtradas : estadosUSA);

    setClienteSeleccionado({ ...c, direccion });
    setMostrarEdicion(true);
    setMensaje("");
  }

  function handleChange(e) {
    const { name, value } = e.target;

    // Teléfono → formateo en vivo
    if (name === "telefono") {
      const pretty = formatPhoneForInput(value);
      setForm((f) => ({ ...f, telefono: pretty }));
      return;
    }

    // Campos de dirección
    if (["calle", "ciudad", "estado", "zip"].includes(name)) {
      setForm((f) => {
        const dir = { ...(f.direccion || { calle: "", ciudad: "", estado: "", zip: "" }) };
        const v = value ?? "";

        // STATE: siempre 2 letras mayúsculas + afinamos datalist
        if (name === "estado") {
          dir.estado = v.toUpperCase().slice(0, 2);
          setEstadoInput(dir.estado);
          setEstadoOpciones(estadosUSA.filter((s) => s.startsWith(dir.estado)));
          return { ...f, direccion: dir };
        }

        // ZIP: al tener 5 dígitos → fija estado/ciudad usando mapa local y lookup online
        if (name === "zip") {
          const zip = String(v).replace(/\D/g, "").slice(0, 5);
          dir.zip = zip;

          if (zip.length === 5) {
            // Si corresponde a Massachusetts, fija MA
            if (isMA(zip)) {
              dir.estado = "MA";
              setEstadoInput("MA");
              setEstadoOpciones(estadosUSA.filter((s) => s.startsWith("MA")));
            }

            // 1) Mapa local (siempre pisamos para reflejar el ZIP nuevo)
            const local = zipToCiudadEstado(zip);
            if (local.ciudad || local.estado) {
              dir.ciudad = local.ciudad || "";
              dir.estado = (local.estado || dir.estado || "").toUpperCase();
              setEstadoInput(dir.estado);
              setEstadoOpciones(estadosUSA.filter((s) => s.startsWith(dir.estado)));
            }

            // 2) Lookup online (también pisa, pero cuidamos carreras si el ZIP cambió)
            lookupZipOnline(zip).then((z) => {
              if (!z) return;
              setForm((f2) => {
                const cur = f2.direccion || {};
                if ((cur.zip || "") !== zip) return f2; // el usuario cambió el ZIP mientras llegaba la respuesta

                const next = {
                  ...cur,
                  ciudad: z.ciudad || cur.ciudad || "",
                  estado: (z.estado || cur.estado || "").toUpperCase(),
                };
                setEstadoInput(next.estado);
                setEstadoOpciones(estadosUSA.filter((s) => s.startsWith(next.estado)));
                return { ...f2, direccion: next };
              });
            });
          }
        }

        // Calle / Ciudad normales
        dir[name] = v;
        return { ...f, direccion: dir };
      });
      return;
    }

    // Resto de campos
    setForm((f) => ({ ...f, [name]: value ?? "" }));
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setIsLoading(true);
    if (!form.nombre) {
      setMensaje("Full name is required");
      setIsLoading(false);
      return;
    }

    // --- Normalización de teléfono y email (GUARDADO NO CAMBIA) ---
    const phoneDigits = String(form.telefono || "").replace(/\D/g, "");
    const telefonoFinal =
      phoneDigits.length === 0
        ? ""
        : phoneDigits.length === 10
        ? `+1${phoneDigits}`
        : `+${phoneDigits}`;
    const emailFinal = String(form.email || "").trim();

    let direccionFinal = form.direccion || { calle: "", ciudad: "", estado: "", zip: "" };

    const payload = {
      nombre: form.nombre,
      telefono: telefonoFinal,
      email: emailFinal,
      negocio: form.negocio,
      direccion: direccionFinal,
    };

    if (!clienteSeleccionado) {
      const { error } = await supabase.from("clientes").insert([payload]);
      if (error) setMensaje("Error saving: " + error.message);
      else {
        setMensaje("Client saved successfully");
        setMostrarEdicion(false);
        navigate("/clientes");
        await fetchPage({ p: 1, ps: pageSize, q: debounced });
        await cargarTotales();
      }
    } else {
      const { error } = await supabase.from("clientes").update(payload).eq("id", clienteSeleccionado.id);
      if (error) setMensaje("Error editing: " + error.message);
      else {
        setMensaje("Changes saved successfully");
        setMostrarEdicion(false);
        navigate("/clientes");
        await fetchPage({ p: page, ps: pageSize, q: debounced });
      }
    }
    setIsLoading(false);
  }

  async function handleEliminar(cliente) {
    if (!cliente || !window.confirm("Delete this client?")) return;
    setIsLoading(true);
    const { error } = await supabase.from("clientes").delete().eq("id", cliente.id);
    if (error) setMensaje("Error deleting: " + error.message);
    else {
      setMensaje("Client deleted");
      setMostrarStats(false);
      setClienteSeleccionado(null);
      const lastPage = Math.max(1, Math.ceil((totalRows - 1) / pageSize));
      const newPage = Math.min(page, lastPage);
      setPage(newPage);
      await fetchPage({ p: newPage, ps: pageSize, q: debounced });
      await cargarTotales();
    }
    setIsLoading(false);
  }

  // ---------- Auto-refresh de crédito ----------
  const refreshCreditoActivo = useMemo(() => {
    return async () => {
      if (!clienteSeleccionado?.id) return;
      const info = await safeGetCxc(clienteSeleccionado.id);
      if (info) {
        setResumen((r) => ({ ...r, balance: info.saldo, cxc: info }));
      }
    };
  }, [clienteSeleccionado?.id]);

  useEffect(() => {
    if (!clienteSeleccionado?.id) return;
    (async () => { await refreshCreditoActivo(); })();
  }, [clienteSeleccionado?.id, refreshCreditoActivo]);

  useEffect(() => {
    focusHandlerRef.current = async () => { await refreshCreditoActivo(); };
    const handler = () => focusHandlerRef.current && focusHandlerRef.current();
    window.addEventListener("focus", handler);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") handler();
    });
    return () => {
      window.removeEventListener("focus", handler);
    };
  }, [refreshCreditoActivo]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refreshCreditoActivo();
    }, 20000);
    return () => clearInterval(intervalRef.current);
  }, [refreshCreditoActivo]);

  useEffect(() => {
    if (realtimeUnsubRef.current) {
      realtimeUnsubRef.current.unsubscribe?.();
      realtimeUnsubRef.current = null;
    }
    if (!clienteSeleccionado?.id) return;

    try {
      const sub = subscribeClienteLimiteManual(clienteSeleccionado.id, async () => {
        await refreshCreditoActivo();
      });
      realtimeUnsubRef.current = sub;
    } catch {
      const channel = supabase
        .channel(`clientes-limite-manual-${clienteSeleccionado.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "clientes", filter: `id=eq.${clienteSeleccionado.id}` },
          async () => { await refreshCreditoActivo(); }
        )
        .subscribe();
      realtimeUnsubRef.current = channel;
    }

    return () => {
      if (realtimeUnsubRef.current) {
        realtimeUnsubRef.current.unsubscribe?.();
        try { supabase.removeChannel?.(realtimeUnsubRef.current); } catch {}
        realtimeUnsubRef.current = null;
      }
    };
  }, [clienteSeleccionado?.id, refreshCreditoActivo]);

  useEffect(() => {
    async function cargarResumen() {
      if (!clienteSeleccionado) {
        setResumen({ ventas: [], pagos: [], balance: 0, cxc: null });
        return;
      }
      const [ventasRes, pagosRes, cxcInfo] = await Promise.all([
        supabase.from("ventas").select("id, fecha, total_venta, total_pagado, estado_pago").eq("cliente_id", clienteSeleccionado.id),
        supabase.from("pagos").select("id, fecha_pago, monto, metodo_pago").eq("cliente_id", clienteSeleccionado.id),
        safeGetCxc(clienteSeleccionado.id),
      ]);
      const ventas = ventasRes.data || [];
      const pagos = pagosRes.data || [];
      const balanceCxC = cxcInfo ? cxcInfo.saldo : 0;
      setResumen({ ventas, pagos, balance: balanceCxC, cxc: cxcInfo });
      setMesSeleccionado(null);
    }
    if (clienteSeleccionado && (mostrarStats || mostrarEdicion || mostrarAbono)) cargarResumen();
  }, [clienteSeleccionado, mostrarStats, mostrarEdicion, mostrarAbono]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(totalRows / pageSize)), [totalRows, pageSize]);

  /* -------------------- PDF helper -------------------- */
  const comprasPorMes = useMemo(() => {
    const m = {};
    (resumen.ventas || []).forEach(v => {
      if (!v.fecha || !v.total_venta) return;
      const mes = v.fecha.slice(0, 7);
      m[mes] = (m[mes] || 0) + Number(v.total_venta || 0);
    });
    return m;
  }, [resumen.ventas]);

  const lifetimeTotal = Object.values(comprasPorMes).reduce((a, b) => a + b, 0);

  const dataChart = useMemo(() => {
    const meses = [];
    const hoy = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      meses.unshift(label);
    }
    return meses.map(mes => ({
      mes: mes.slice(5),
      fullMes: mes,
      compras: comprasPorMes[mes] || 0
    }));
  }, [comprasPorMes]);

  async function generatePDF() {
    if (!clienteSeleccionado) return;
    const doc = new jsPDF();
    const businessName = "Tools4Care";
    const businessAddress = "108 Lafayette St, Salem, MA 01970";
    const businessPhone = "(978) 594-1624";
    const reportTitle = "Sales Report";

    doc.setFontSize(18);
    doc.text(businessName, 14, 20);
    doc.setFontSize(11);
    doc.text(businessAddress, 14, 27);
    doc.text(`Phone: ${businessPhone}`, 14, 34);
    doc.setLineWidth(0.5);
    doc.line(14, 38, 196, 38);

    doc.setFontSize(14);
    doc.text("Client Information:", 14, 46);
    doc.setFontSize(12);
    doc.text(`Full Name: ${clienteSeleccionado.nombre || ""}`, 14, 53);
    doc.text(`Business Name: ${clienteSeleccionado.negocio || ""}`, 14, 60);
    const dirTxt = prettyAddress(clienteSeleccionado.direccion);
    doc.text(`Address: ${dirTxt}`, 14, 67);
    doc.text(`Phone: ${formatPhoneForInput(clienteSeleccionado.telefono) || ""}`, 14, 74);

    doc.setLineWidth(0.5);
    doc.line(14, 78, 196, 78);

    doc.setFontSize(16);
    doc.text(reportTitle, 14, 86);
    const todayStr = new Date().toLocaleDateString("en-US");
    doc.setFontSize(11);
    doc.text(`Date: ${todayStr}`, 14, 93);

    const ventasData = Object.entries(comprasPorMes)
      .map(([mes, total]) => [mes, fmtSafe(total)])
      .sort((a,b) => b[0].localeCompare(a[0]));

    autoTable(doc, {
      startY: 100,
      head: [["Month", "Total Sales"]],
      body: ventasData,
      theme: "grid",
      styles: { fontSize: 10 },
      headStyles: { fillColor: [25, 118, 210] },
    });

    const finalY = doc.lastAutoTable.finalY || 110;
    doc.setFontSize(12);
    doc.text(`Lifetime Total Sales: ${fmtSafe(lifetimeTotal)}`, 14, finalY + 10);

    doc.save(`SalesReport_${clienteSeleccionado.nombre || "Client"}.pdf`);
  }

  /* -------------------- UI -------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* Header Mejorado */}
        <div className="bg-white rounded-3xl shadow-xl p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                Client Management
              </h1>
              <p className="text-gray-600 text-sm">Manage your clients and track their payments</p>
            </div>
            <div className="flex items-center gap-3">
              {clienteSeleccionado?.id && (
                <button
                  onClick={() => safeGetCxc(clienteSeleccionado.id).then(info => {
                    if (info) {
                      setResumen(r => ({ ...r, balance: info.saldo, cxc: info }));
                      setMensaje("Credit refreshed");
                      setTimeout(() => setMensaje(""), 1200);
                    }
                  })}
                  className="bg-white text-blue-700 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 px-4 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-sm"
                  title="Refresh credit"
                >
                  <RefreshCcw size={18} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              )}
              <button
                onClick={() => { abrirNuevoCliente(); navigate("/clientes/nuevo"); }}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                title="New Client (⌘/Ctrl+N)"
              >
                <Plus size={20} />
                <span>New Client</span>
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border-2 border-blue-200 hover:border-blue-300 transition-all hover:shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600 text-sm font-semibold uppercase tracking-wide">Total Clients</p>
                  <p className="text-4xl font-bold text-blue-700 mt-1">{totales.totalClients}</p>
                </div>
                <div className="bg-blue-500 p-3 rounded-xl shadow-lg">
                  <User className="text-white" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border-2 border-amber-200 hover:border-amber-300 transition-all hover:shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-600 text-sm font-semibold uppercase tracking-wide">Clients with Debt</p>
                  <p className="text-4xl font-bold text-amber-700 mt-1">{totales.withDebt}</p>
                </div>
                <div className="bg-amber-500 p-3 rounded-xl shadow-lg">
                  <TrendingUp className="text-white" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-5 border-2 border-red-200 hover:border-red-300 transition-all hover:shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-600 text-sm font-semibold uppercase tracking-wide">Total Outstanding</p>
                  <p className="text-4xl font-bold text-red-700 mt-1">
                    {fmtSafe(totales.totalOutstanding)}
                  </p>
                </div>
                <div className="bg-red-500 p-3 rounded-xl shadow-lg">
                  <DollarSign className="text-white" size={24} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-3xl shadow-xl border-2 border-gray-200 overflow-hidden">
          {/* Search */}
          <div className="p-6 bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-gray-200">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                ref={searchRef}
                className="w-full pl-12 pr-4 py-3.5 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm text-base font-medium"
                placeholder="Search clients by name, phone, email, business or address..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value ?? "")}
                title="Focus Search (⌘/Ctrl+K)"
              />
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center items-center py-16">
              <div className="relative">
                <div className="w-16 h-16 border-8 border-blue-200 rounded-full"></div>
                <div className="w-16 h-16 border-8 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
              </div>
            </div>
          )}

          {/* --- PANEL STICKY DE BALANCES EN MÓVIL --- */}
          {busqueda.trim() !== "" && !isLoading && clientes.length > 0 && (
            <div className="md:hidden sticky top-0 z-20 bg-white border-b-2 border-gray-200 shadow-md">
              <div className="px-4 py-3">
                <div className="text-xs text-gray-500 mb-2 font-semibold">
                  📊 Results: {clientes.length} • Quick balances
                </div>

                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                  {clientes.slice(0, 10).map((c) => {
                    const saldo = Number(c.balance || 0);

                    return (
                      <div
                        key={c.id}
                        className={`shrink-0 min-w-[260px] max-w-[300px] p-4 rounded-xl border-2 shadow-md
                ${saldo > 0 ? "border-rose-300 bg-gradient-to-br from-rose-50 to-red-50" : "border-emerald-300 bg-gradient-to-br from-emerald-50 to-green-50"}`}
                      >
                        {/* Header: Nombre + botón Payment */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-gray-900 truncate">
                              {c.nombre || "—"}
                            </div>
                            {c.negocio && (
                              <div className="text-xs text-gray-600 truncate mt-0.5">
                                {c.negocio}
                              </div>
                            )}
                            {c.telefono && (
                              <div className="text-xs text-gray-500 truncate mt-0.5">
                                {formatPhoneForInput(c.telefono)}
                              </div>
                            )}
                          </div>

                          {/* Botón directo a Abono */}
                          <button
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold
                               bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white whitespace-nowrap shadow-md"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const info = await safeGetCxc(c.id);
                              setClienteSeleccionado(c);
                              setResumen((r) => ({
                                ...r,
                                balance: info ? info.saldo : saldo,
                                cxc: info ?? null,
                              }));
                              setMostrarAbono(true);
                            }}
                            title="Registrar pago"
                          >
                            <DollarSign size={14} />
                            Payment
                          </button>
                        </div>

                        {/* Balance y abrir Stats tocando el cuerpo */}
                        <button
                          className="mt-2 w-full text-left bg-white/60 rounded-lg p-3 hover:bg-white/80 transition-all"
                          onClick={() => {
                            setClienteSeleccionado(c);
                            setMostrarStats(true);
                          }}
                        >
                          <div
                            className={`text-2xl font-bold ${
                              saldo > 0 ? "text-rose-600" : "text-emerald-600"
                            }`}
                          >
                            {fmtSafe(saldo)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Tap for details</div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          {!isLoading && (
            <>
              {/* Mobile View - Cards */}
              <div className="md:hidden space-y-4 p-4">
                {clientes.map((c) => {
                  // Dirección: aceptar string u objeto
                  const dRaw = c.direccion;
                  let dObj = null;
                  if (typeof dRaw === "string" && dRaw) {
                    try { dObj = JSON.parse(dRaw); } catch { dObj = null; }
                  } else if (dRaw && typeof dRaw === "object") {
                    dObj = dRaw;
                  }
                  const d = dObj || { calle: "", ciudad: "", estado: "", zip: "" };

                  const saldo = Number(c.balance || 0);

                  return (
                    <div
                      key={c.id}
                      className="bg-gradient-to-br from-white to-blue-50 border-2 border-blue-100 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all cursor-pointer"
                      onClick={() => {
                        setClienteSeleccionado({ ...c, direccion: dObj ? d : dRaw });
                        setMostrarStats(true);
                      }}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl p-2.5 shadow-md">
                            <User className="text-white" size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-lg">{c.nombre}</h3>
                            {c.negocio && (
                              <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                                <Building2 size={14} />
                                {c.negocio}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const info = await safeGetCxc(c.id);
                            setClienteSeleccionado({ ...c, direccion: dObj ? d : dRaw });
                            setResumen((r) => ({ ...r, balance: info ? info.saldo : saldo, cxc: info || null }));
                            setMostrarAbono(true);
                          }}
                          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md"
                        >
                          <DollarSign size={16} />
                          Payment
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-white/70 rounded-lg p-3">
                          <p className="text-xs text-gray-500 font-semibold uppercase">Phone</p>
                          <p className="text-sm font-medium text-gray-900 mt-1">{formatPhoneForInput(c.telefono)}</p>
                        </div>
                        <div className="bg-white/70 rounded-lg p-3">
                          <p className="text-xs text-gray-500 font-semibold uppercase">Email</p>
                          <p className="text-sm font-medium text-gray-900 truncate mt-1">{c.email}</p>
                        </div>
                      </div>

                      <div className="mb-4 bg-white/70 rounded-lg p-3">
                        <p className="text-xs text-gray-500 font-semibold uppercase mb-1.5">Address</p>
                        <p className="text-sm text-gray-800 flex items-start gap-2">
                          <MapPin size={14} className="shrink-0 mt-0.5 text-gray-400" />
                          <span>{prettyAddress(c.direccion)}</span>
                        </p>
                      </div>

                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs text-gray-500 font-semibold uppercase">Balance</p>
                          <span
                            className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold mt-1 shadow-sm ${
                              safe2(saldo) > 0 ? "bg-red-500 text-white" : "bg-green-500 text-white"
                            }`}
                          >
                            {fmtSafe(saldo)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {clientes.length === 0 && (
                  <div className="text-center py-12">
                    <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center shadow-inner">
                      <Search className="text-gray-400" size={32} />
                    </div>
                    <p className="text-gray-700 font-bold text-lg mb-1">No clients found</p>
                    <p className="text-gray-500 text-sm">Try adjusting your search criteria</p>
                  </div>
                )}
              </div>

              {/* Desktop View - Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Client Info</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Address</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Balance</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clientes.map((c) => {
                      // Dirección: aceptar string u objeto
                      const dRaw = c.direccion;
                      let dObj = null;
                      if (typeof dRaw === "string" && dRaw) {
                        try { dObj = JSON.parse(dRaw); } catch { dObj = null; }
                      } else if (dRaw && typeof dRaw === "object") {
                        dObj = dRaw;
                      }
                      const d = dObj || { calle: "", ciudad: "", estado: "", zip: "" };

                      const saldo = Number(c.balance || 0);

                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 cursor-pointer transition-all duration-200"
                          onClick={() => {
                            setClienteSeleccionado({ ...c, direccion: dObj ? d : dRaw });
                            setMostrarStats(true);
                          }}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl p-2 mr-3 shadow-md">
                                <User size={18} className="text-white" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-gray-900">{c.nombre}</div>
                                {c.negocio && (
                                  <div className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                                    <Building2 size={12} />
                                    {c.negocio}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              {c.telefono && (
                                <div className="text-sm text-gray-900 flex items-center gap-2">
                                  <Phone size={14} className="text-gray-400" />
                                  {formatPhoneForInput(c.telefono)}
                                </div>
                              )}
                              {c.email && (
                                <div className="text-sm text-gray-600 flex items-center gap-2">
                                  <Mail size={14} className="text-gray-400" />
                                  {c.email}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900 flex items-start gap-2">
                              <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                              <div className="max-w-xs">{prettyAddress(c.direccion)}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold shadow-sm ${
                                safe2(saldo) > 0 ? "bg-red-500 text-white" : "bg-green-500 text-white"
                              }`}
                            >
                              {fmtSafe(saldo)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const info = await safeGetCxc(c.id);
                                setClienteSeleccionado({ ...c, direccion: dObj ? d : dRaw });
                                setResumen((r) => ({ ...r, balance: info ? info.saldo : saldo, cxc: info || null }));
                                setMostrarAbono(true);
                              }}
                            >
                              <DollarSign size={16} />
                              Payment
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {clientes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-full p-4 shadow-inner">
                              <Search className="text-gray-400" size={32} />
                            </div>
                            <p className="text-gray-700 font-bold text-lg">No clients found</p>
                            <p className="text-gray-500">Try adjusting your search criteria</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer: paginación */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-6 py-4 border-t-2 border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50">
                <div className="text-gray-700 font-medium">
                  Showing <span className="font-bold text-blue-600">{clientes.length}</span> of{" "}
                  <span className="font-bold text-blue-600">{totalRows}</span> • Page{" "}
                  <span className="font-bold text-blue-600">{page}</span> / {pageCount}
                </div>
                <div className="flex items-center gap-4">
                  <label className="text-gray-700 font-medium">Page size</label>
                  <select
                    className="px-4 py-2 border-2 border-gray-300 rounded-xl font-medium bg-white hover:border-blue-400 focus:ring-2 focus:ring-blue-500 transition-all"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>

                  <div className="flex items-center gap-2">
                    <button
                      className="p-2 rounded-xl border-2 border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-300 transition-all shadow-sm"
                      disabled={page <= 1}
                      onClick={() => setPage(1)}
                    >
                      <ChevronsLeft size={18} />
                    </button>
                    <button
                      className="p-2 rounded-xl border-2 border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-300 transition-all shadow-sm"
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      className="p-2 rounded-xl border-2 border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-300 transition-all shadow-sm"
                      disabled={page >= pageCount}
                      onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button
                      className="p-2 rounded-xl border-2 border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-300 transition-all shadow-sm"
                      disabled={page >= pageCount}
                      onClick={() => setPage(pageCount)}
                    >
                      <ChevronsRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Mensajes */}
        {mensaje && (
          <div
            className={`fixed top-6 right-6 px-6 py-4 rounded-xl shadow-2xl z-50 transition-all duration-300 border-2 ${
              mensaje.includes("Error") || mensaje.includes("invalid")
                ? "bg-gradient-to-r from-red-500 to-rose-500 text-white border-red-600"
                : "bg-gradient-to-r from-green-500 to-emerald-500 text-white border-green-600"
            }`}
          >
            <div className="flex items-center gap-3 font-semibold">
              {mensaje.includes("Error") ? <X size={20} /> : <Check size={20} />}
              {mensaje}
            </div>
          </div>
        )}
      </div>

      {/* Modal Stats */}
      {mostrarStats && clienteSeleccionado && (
        <ClienteStatsModal
          open={mostrarStats}
          cliente={clienteSeleccionado}
          resumen={resumen}
          mesSeleccionado={mesSeleccionado}
          setMesSeleccionado={setMesSeleccionado}
          onClose={() => setMostrarStats(false)}
          onEdit={() => { setMostrarStats(false); handleEditCliente(clienteSeleccionado); }}
          onDelete={handleEliminar}
          generatePDF={generatePDF}
          onRefreshCredito={async () => {
            const info = await safeGetCxc(clienteSeleccionado.id);
            if (info) setResumen(r => ({ ...r, balance: info.saldo, cxc: info }));
          }}
        />
      )}

      {/* Modal edición */}
      {mostrarEdicion && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleGuardar}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          >
            <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <h3 className="text-2xl font-bold flex items-center gap-2">
                {clienteSeleccionado ? <Edit size={24} /> : <Plus size={24} />}
                {clienteSeleccionado ? "Edit Client" : "New Client"}
              </h3>
              <p className="text-blue-100 mt-2 text-sm">
                {clienteSeleccionado ? "Update client information" : "Add a new client to your system"}
              </p>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-240px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 font-bold text-gray-700 mb-2">
                    <User size={18} />
                    Full Name *
                  </label>
                  <input
                    name="nombre"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                    value={form.nombre ?? ""}
                    onChange={handleChange}
                    required
                    placeholder="Enter full name"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 font-bold text-gray-700 mb-2">
                    <Phone size={18} />
                    Phone
                  </label>
                  <input
                    name="telefono"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                    value={form.telefono ?? ""}
                    onChange={handleChange}
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 font-bold text-gray-700 mb-2">
                    <Mail size={18} />
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                    value={form.email ?? ""}
                    onChange={handleChange}
                    placeholder="email@example.com"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 font-bold text-gray-700 mb-2">
                    <Building2 size={18} />
                    Business
                  </label>
                  <input
                    name="negocio"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                    value={form.negocio ?? ""}
                    onChange={handleChange}
                    placeholder="Business name"
                  />
                </div>

                {/* Address Information */}
                <div className="md:col-span-2">
                  <h4 className="flex items-center gap-2 font-bold text-gray-800 mb-4 text-lg">
                    <MapPin size={20} />
                    Address Information
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Street */}
                    <div className="md:col-span-2">
                      <label className="font-bold text-gray-700 mb-2 block">Street</label>
                      <input
                        name="calle"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        value={form.direccion?.calle ?? ""}
                        onChange={handleChange}
                        placeholder="123 Main St"
                      />
                    </div>

                    {/* ZIP (al escribir 5 dígitos autollenará ciudad/estado) */}
                    <div>
                      <label className="font-bold text-gray-700 mb-2 block">ZIP Code</label>
                      <input
                        name="zip"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        value={form.direccion?.zip ?? ""}
                        onChange={handleChange}
                        maxLength={5}
                        placeholder="02118"
                        inputMode="numeric"
                        pattern="\d{5}"
                      />
                    </div>

                    {/* City */}
                    <div>
                      <label className="font-bold text-gray-700 mb-2 block">City</label>
                      <input
                        name="ciudad"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        value={form.direccion?.ciudad ?? ""}
                        onChange={handleChange}
                        placeholder="Boston"
                      />
                    </div>

                    {/* State (con datalist) */}
                    <div>
                      <label className="font-bold text-gray-700 mb-2 block">State</label>
                      <input
                        name="estado"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all uppercase"
                        placeholder="MA"
                        value={estadoInput ?? ""}
                        onChange={handleChange}
                        list="estados-lista"
                        autoComplete="off"
                        maxLength={2}
                        style={{ textTransform: "uppercase" }}
                      />
                      <datalist id="estados-lista">
                        {estadoOpciones.map((e) => (
                          <option value={e} key={e}>
                            {e}
                          </option>
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t-2 border-gray-200 flex gap-4">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold px-6 py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={20} />
                    Save Client
                  </>
                )}
              </button>
              <button
                type="button"
                className="flex-1 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold px-6 py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
                onClick={() => {
                  setMostrarEdicion(false);
                  navigate("/clientes");
                }}
                disabled={isLoading}
              >
                <X size={20} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Abono */}
      {mostrarAbono && clienteSeleccionado && (
        <ModalAbonar
          cliente={clienteSeleccionado}
          resumen={resumen}
          onClose={() => setMostrarAbono(false)}
          refresh={async () => { await fetchPage({ p: page, ps: pageSize, q: debounced }); await cargarTotales(); }}
          setResumen={setResumen}
        />
      )}
    </div>
  );
}

/* -------------------- MODAL: ESTADÍSTICAS -------------------- */
// DENTRO DE Clientes.jsx - Reemplaza el componente ClienteStatsModal completo

function ClienteStatsModal({ cliente, onClose }) {
  const [ventasData, setVentasData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroMes, setFiltroMes] = useState("todos");
  const [mostrarTodas, setMostrarTodas] = useState(false);

  useEffect(() => {
    if (!cliente?.id) return;
    cargarVentas();
  }, [cliente]);

  async function cargarVentas() {
    try {
      const { data, error } = await supabase
        .from("detalle_ventas")
        .select(`
          id,
          cantidad,
          precio_unitario,
          subtotal,
          ventas!inner(
            id,
            fecha,
            total,
            metodo_pago
          ),
          productos(nombre, marca)
        `)
        .eq("ventas.cliente_id", cliente.id)
        .order("ventas(fecha)", { ascending: false });

      if (error) throw error;
      setVentasData(data || []);
    } catch (err) {
      console.error("Error cargando ventas:", err);
    } finally {
      setLoading(false);
    }
  }

  const ventasFiltradas = useMemo(() => {
    if (filtroMes === "todos") return ventasData;
    const now = new Date();
    const mesActual = now.getMonth();
    const añoActual = now.getFullYear();

    return ventasData.filter((v) => {
      const fecha = new Date(v.ventas.fecha);
      return fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual;
    });
  }, [ventasData, filtroMes]);

  const totalGastado = ventasFiltradas.reduce((sum, v) => sum + (v.subtotal || 0), 0);
  const totalProductos = ventasFiltradas.reduce((sum, v) => sum + (v.cantidad || 0), 0);

  const ventasMostrar = mostrarTodas ? ventasFiltradas : ventasFiltradas.slice(0, 10);

  // Chart data
  const chartData = useMemo(() => {
    const ventasPorMes = {};
    ventasData.forEach((v) => {
      const fecha = new Date(v.ventas.fecha);
      const mes = fecha.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      ventasPorMes[mes] = (ventasPorMes[mes] || 0) + (v.subtotal || 0);
    });

    return Object.entries(ventasPorMes)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .slice(-6)
      .map(([mes, total]) => ({ mes, total }));
  }, [ventasData]);

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      {/* 🆕 MODAL CON ALTURA OPTIMIZADA Y PADDING INFERIOR */}
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }} // 🆕 Altura máxima del 90% del viewport
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER FIJO */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                📊 Customer History
              </h2>
              <p className="text-purple-100 mt-1 text-lg font-semibold">
                {cliente.nombre}
              </p>
              <p className="text-purple-200 text-sm mt-1">
                {filtroMes === "todos" ? "Last 6 months analysis" : "Current month"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <X size={28} />
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="flex border-b bg-gray-50 flex-shrink-0">
          <button className="flex-1 py-3 px-4 font-semibold text-purple-600 border-b-2 border-purple-600 bg-white">
            💰 Balance History
          </button>
          <button className="flex-1 py-3 px-4 text-gray-500 hover:bg-gray-100">
            📊 Credit Score
          </button>
          <button className="flex-1 py-3 px-4 text-gray-500 hover:bg-gray-100">
            📋 Payment History
          </button>
        </div>

        {/* 🆕 CONTENIDO CON SCROLL Y PADDING INFERIOR */}
        <div className="flex-1 overflow-y-auto p-6 pb-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <>
              {/* RESUMEN */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
                  <div className="text-sm text-gray-600 mb-1">BALANCE</div>
                  <div className="text-3xl font-bold text-blue-600">
                    ${cliente.balance?.toFixed(2) || "0.00"}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200">
                  <div className="text-sm text-gray-600 mb-1">AVAILABLE</div>
                  <div className="text-3xl font-bold text-green-600">
                    ${(
                      (cliente.limite_credito || 0) - (cliente.balance || 0)
                    ).toFixed(2)}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-xl border border-purple-200">
                  <div className="text-sm text-gray-600 mb-1">TOTAL SPENT</div>
                  <div className="text-3xl font-bold text-purple-600">
                    ${totalGastado.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* FILTRO DE MES */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setFiltroMes("todos")}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    filtroMes === "todos"
                      ? "bg-purple-600 text-white shadow-lg"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  All Time
                </button>
                <button
                  onClick={() => setFiltroMes("actual")}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    filtroMes === "actual"
                      ? "bg-purple-600 text-white shadow-lg"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  This Month
                </button>
              </div>

              {/* GRÁFICO */}
              {chartData.length > 0 && (
                <div className="mb-6 bg-gradient-to-br from-gray-50 to-blue-50 p-6 rounded-2xl border border-gray-200">
                  <h3 className="font-bold text-lg mb-4 text-gray-700">
                    📈 Balance Evolution
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="mes"
                        tick={{ fontSize: 12 }}
                        stroke="#6b7280"
                      />
                      <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.95)",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          padding: "8px 12px",
                        }}
                        formatter={(value) => [`$${value.toFixed(2)}`, "Total"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorTotal)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* TRANSACCIONES */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-blue-50">
                  <h3 className="font-bold text-lg text-gray-700">
                    🛍️ Recent Transactions
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {totalProductos} products • {ventasFiltradas.length} transactions
                  </p>
                </div>

                {ventasMostrar.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    No transactions found
                  </div>
                ) : (
                  <>
                    <div className="divide-y">
                      {ventasMostrar.map((venta) => (
                        <div key={venta.id} className="p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-semibold text-gray-800">
                                {venta.productos?.nombre || "Unknown Product"}
                              </div>
                              {venta.productos?.marca && (
                                <div className="text-sm text-gray-500">
                                  {venta.productos.marca}
                                </div>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                {new Date(venta.ventas.fecha).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="font-bold text-gray-800">
                                ${venta.subtotal.toFixed(2)}
                              </div>
                              <div className="text-sm text-gray-500">
                                Qty: {venta.cantidad} × ${venta.precio_unitario.toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-400 capitalize mt-1">
                                {venta.ventas.metodo_pago}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* BOTÓN VER MÁS/MENOS */}
                    {ventasFiltradas.length > 10 && (
                      <div className="p-4 border-t bg-gray-50">
                        <button
                          onClick={() => setMostrarTodas(!mostrarTodas)}
                          className="w-full py-2 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md font-medium"
                        >
                          {mostrarTodas
                            ? "Show Less"
                            : `View All (${ventasFiltradas.length})`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* 🆕 FOOTER FIJO CON BOTÓN DE CERRAR MÁS VISIBLE */}
        <div className="flex-shrink-0 p-4 border-t bg-gradient-to-r from-gray-50 to-blue-50">
          <button
            onClick={onClose}
            className="w-full py-3 px-6 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all shadow-lg font-semibold text-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}