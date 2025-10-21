// src/Ventas.jsx - PARTE 1 DE 3 (Imports, Constantes, Helpers)
import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import { useNavigate } from "react-router-dom";
import { BarcodeScanner } from "./BarcodeScanner";
import QRCode from "qrcode"; // npm install qrcode

/* ========================= Config & Constantes ========================= */
const PAYMENT_METHODS = [
  { key: "efectivo", label: "💵 Cash" },
  { key: "tarjeta", label: "💳 Card" },
  { key: "transferencia", label: "🏦 Transfer" },
  { key: "otro", label: "💰 Other" },
];

const STORAGE_KEY = "pending_sales";
const SECRET_CODE = "#ajuste2025";

const COMPANY_NAME = import.meta?.env?.VITE_COMPANY_NAME || "Tools4CareMovil";
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

async function createStripeCheckoutSession(amount, description = "Pago de venta") {
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
        description: String(description || "Pago de venta").slice(0, 120),
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

/* ========================= Helpers de negocio ========================= */
function policyLimit(score) {
  const s = Number(score ?? 600);
  if (s < 500) return 0;
  if (s < 550) return 30;
  if (s < 600) return 80;
  if (s < 650) return 150;
  if (s < 700) return 200;
  if (s < 750) return 350;
  if (s < 800) return 500;
  return 800;
}

function fmt(n) {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function r2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function unitPriceFromProduct({ base, pct, bulkMin, bulkPrice }, qty) {
  const q = Number(qty || 0);
  const hasBulk = bulkMin != null && bulkPrice != null && q >= Number(bulkMin);
  if (hasBulk) return r2(bulkPrice);
  const pctNum = Number(pct || 0);
  if (pctNum > 0) return r2(base * (1 - pctNum / 100));
  return r2(base);
}

const firstNumber = (arr, def = 0, acceptZero = false) => {
  for (const v of arr) {
    const n = Number(v);
    if (Number.isFinite(n) && (acceptZero ? n >= 0 : n > 0)) return n;
  }
  return def;
};

function extractPricingFromRow(row) {
  const p = row?.productos ?? row ?? {};
  const base = firstNumber(
    [
      p.precio, row?.precio,
      p.precio_unit, row?.precio_unit,
      p.price, row?.price,
      p.bulk_unit_price, row?.bulk_unit_price,
    ],
    0,
    false
  );

  const pct = firstNumber([p.descuento_pct, row?.descuento_pct], 0, true);

  const bulkMin =
    p?.bulk_min_qty != null
      ? Number(p.bulk_min_qty)
      : row?.bulk_min_qty != null
      ? Number(row.bulk_min_qty)
      : null;

  const bulkPrice = firstNumber([p.bulk_unit_price, row?.bulk_unit_price], null, false) ?? null;

  return { base, pct, bulkMin, bulkPrice };
}

function computeUnitPriceFromRow(row, qty = 1) {
  const pr = extractPricingFromRow(row);
  let base = Number(pr.base || 0);

  if ((!base || base <= 0) && pr.bulkPrice && (!pr.bulkMin || qty >= Number(pr.bulkMin))) {
    base = Number(pr.bulkPrice);
  }
  if (!base || !Number.isFinite(base)) return 0;

  return unitPriceFromProduct(
    { base, pct: pr.pct, bulkMin: pr.bulkMin, bulkPrice: pr.bulkPrice },
    qty
  );
}

function getClientBalance(c) {
  if (!c) return 0;
  return Number(c._saldo_real ?? c.balance ?? c.saldo_total ?? c.saldo ?? 0);
}

function getCreditNumber(c) {
  return c?.credito_id || c?.id || "—";
}

/* =================== localStorage / SMS / Email =================== */
function safeParseJSON(str, fallback) {
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function readPendingLS() {
  return safeParseJSON(localStorage.getItem(STORAGE_KEY) || "[]", []);
}

function writePendingLS(arr) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, 10)));
  } catch {}
}

function removePendingFromLSById(id) {
  const cur = readPendingLS();
  const filtered = id ? cur.filter((x) => x.id !== id) : cur;
  writePendingLS(filtered);
  return filtered;
}

function upsertPendingInLS(newPending) {
  const cur = readPendingLS();
  const filtered = cur.filter((x) => x.id !== newPending.id);
  const next = [newPending, ...filtered].slice(0, 10);
  writePendingLS(next);
  return next;
}

/* ===== CxC helpers ===== */
const makeUUID = () =>
  (crypto?.randomUUID?.()) ||
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

async function registrarPagoCxC({ cliente_id, monto, metodo, van_id }) {
  const idem = makeUUID();
  try {
    const { error } = await supabase.rpc("cxc_registrar_pago", {
      p_cliente_id: cliente_id,
      p_monto: Number(monto),
      p_metodo: metodo || "mix",
      p_van_id: van_id || null,
      p_idem: idem,
    });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    if (err?.code === "42883") {
      const { error: e2 } = await supabase.from("pagos").insert([{
        cliente_id,
        monto: Number(monto),
        metodo_pago: metodo || "mix",
        fecha_pago: new Date().toISOString(),
        van_id: van_id || null,
      }]);
      if (e2) throw e2;
      return { ok: true, fallback: true };
    }
    throw err;
  }
}

async function getCxcCliente(clienteId) {
  if (!clienteId) return null;

  let saldo = 0;
  let limitePolitica = 0;
  let limiteManual = null;

  try {
    const { data } = await supabase
      .from("v_cxc_cliente_detalle")
      .select("*")
      .eq("cliente_id", clienteId)
      .maybeSingle();

    if (data) {
      saldo = Number(data.saldo ?? data.balance ?? 0);
      limitePolitica = Number(
        data.limite_politica ?? data.limite ?? data.credit_limit ?? 0
      );
      limiteManual = data.limite_manual != null ? Number(data.limite_manual) : null;
    }
  } catch (e) {
    console.warn("Error loading CxC data:", e.message || e);
  }

  if (limiteManual == null) {
    try {
      const { data: cli } = await supabase
        .from("clientes")
        .select("limite_manual")
        .eq("id", clienteId)
        .maybeSingle();
      if (cli && cli.limite_manual != null) limiteManual = Number(cli.limite_manual);
    } catch {}
  }

  const limite =
    limiteManual != null && !Number.isNaN(limiteManual) && limiteManual > 0
      ? limiteManual
      : limitePolitica;

  const disponible = Math.max(0, limite - Math.max(0, saldo));

  return { saldo, limite, limitePolitica, limiteManual, disponible };
}

function subscribeClienteCxC(clienteId, onChange) {
  if (!clienteId) return { unsubscribe() {} };

  const tables = [
    { table: "clientes", event: "UPDATE" },
    { table: "cxc_movimientos", event: "*" },
    { table: "ventas", event: "*" },
    { table: "pagos", event: "*" },
  ];

  const channels = tables.map(({ table, event }) =>
    supabase.channel(`cxc-${table}-${clienteId}`).on(
      "postgres_changes",
      { event, schema: "public", table, filter: `cliente_id=eq.${clienteId}` },
      () => onChange?.()
    ).subscribe()
  );

  return {
    unsubscribe() {
      try {
        channels.forEach(ch => supabase.removeChannel(ch));
      } catch (err) {
        console.warn("Error unsubscribing:", err.message || err);
      }
    },
  };
}

/* ========================= SMS / Email helpers ========================= */
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
    a.href = href;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
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
  if (!hasPhone && hasEmail) return window.confirm("¿Enviar recibo por Email?") ? "email" : null;
  const ans = (window.prompt("¿Cómo quieres enviar el recibo? (sms / email)", "sms") || "").trim().toLowerCase();
  if (ans === "sms" && hasPhone) return "sms";
  if (ans === "email" && hasEmail) return "email";
  return null;
}

async function getStockMapForVan(vanId, ids = []) {
  const map = new Map();
  if (!vanId || !Array.isArray(ids) || ids.length === 0) return map;
  const { data, error } = await supabase
    .from("stock_van")
    .select("producto_id,cantidad")
    .eq("van_id", vanId)
    .in("producto_id", ids);
  if (error || !data) return map;
  data.forEach(r => map.set(r.producto_id, Number(r.cantidad || 0)));
  return map;
}

function composeReceiptMessageEN(payload) {
  const {
    clientName,
    creditNumber,
    dateStr,
    pointOfSaleName,
    items,
    saleTotal,
    paid,
    change,
    prevBalance,
    saleRemaining,
    newDue,
    creditLimit,
    availableBefore,
    availableAfter,
  } = payload;

  const remainingThisSale = Number.isFinite(Number(saleRemaining))
    ? Number(saleRemaining)
    : 0;

  const lines = [];
  lines.push(`${COMPANY_NAME} — Receipt`);
  lines.push(`Date: ${dateStr}`);
  if (pointOfSaleName) lines.push(`Point of sale: ${pointOfSaleName}`);
  if (clientName) lines.push(`Customer: ${clientName} (Credit #${creditNumber || "—"})`);
  lines.push("");
  lines.push("Items:");
  for (const it of items) lines.push(`• ${it.name} — ${it.qty} x ${fmt(it.unit)} = ${fmt(it.subtotal)}`);
  lines.push("");
  lines.push(`Sale total: ${fmt(saleTotal)}`);
  lines.push(`Paid now:   ${fmt(paid)}`);
  if (change > 0) lines.push(`Change:      ${fmt(change)}`);
  lines.push(`Previous balance: ${fmt(prevBalance)}`);
  if (remainingThisSale > 0) lines.push(`Remaining (this sale): ${fmt(remainingThisSale)}`);
  lines.push(`*** Balance due (new): ${fmt(Number(newDue || 0))} ***`);
  if (creditLimit > 0) {
    lines.push("");
    lines.push(`Credit limit:       ${fmt(creditLimit)}`);
    lines.push(`Available before:   ${fmt(availableBefore)}`);
    lines.push(`*** Available now:  ${fmt(availableAfter)} ***`);
  }
  lines.push("");
  lines.push(`Msg&data rates may apply. Reply STOP to opt out. HELP for help.`);
  return lines.join("\n");
}// src/Ventas.jsx - PARTE 2 DE 3 (Componente Principal, Estados y useEffects)

/* ========================= Componente Principal ========================= */
export default function Sales() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const navigate = useNavigate();

  /* ---- Estado base ---- */
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");
  const [clientLoading, setClientLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);

  const [productSearch, setProductSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [products, setProducts] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [allProductsLoading, setAllProductsLoading] = useState(false);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productError, setProductError] = useState("");
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState("");
  const [noProductFound, setNoProductFound] = useState("");

  const [payments, setPayments] = useState([{ forma: "efectivo", monto: 0 }]);
  const [paymentError, setPaymentError] = useState("");
  const [saving, setSaving] = useState(false);

  const [pendingSales, setPendingSales] = useState([]);
  const [modalPendingSales, setModalPendingSales] = useState(false);

  const [step, setStep] = useState(1);

  const [clientHistory, setClientHistory] = useState({
    has: false,
    ventas: 0,
    pagos: 0,
    loading: false,
  });

  const [addrSpec, setAddrSpec] = useState({ type: "unknown", fields: [] });

  // ---- CxC de cliente actual
  const [cxcLimit, setCxcLimit] = useState(null);
  const [cxcAvailable, setCxcAvailable] = useState(null);
  const [cxcBalance, setCxcBalance] = useState(null);

  // ---- Modo Migración
  const [migrationMode, setMigrationMode] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("Saldo viejo importado");

  // ---- UI
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [invTick, setInvTick] = useState(0);
  const reloadInventory = () => setInvTick(n => n + 1);

  // ---- STRIPE QR Estados
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQRCodeData] = useState(null);
  const [qrPaymentIntent, setQRPaymentIntent] = useState(null);
  const [qrAmount, setQRAmount] = useState(0);
  const [qrPaymentIndex, setQRPaymentIndex] = useState(null);
  const [qrPollingActive, setQRPollingActive] = useState(false);
  const qrPollingIntervalRef = useRef(null);

  // 🆕 ESTADOS PARA FEE DE TARJETA
  const [applyCardFee, setApplyCardFee] = useState({});
  const [cardFeePercentage, setCardFeePercentage] = useState(3);

  // ---- DASHBOARD Y CLIENTES RECIENTES
  const [recentClients, setRecentClients] = useState([]);
  const [todayStats, setTodayStats] = useState({
    sales: 0,
    clients: 0,
    total: 0
  });

  // ---- CACHE DE BÚSQUEDA DE CLIENTES
  const [clientCache, setClientCache] = useState(new Map());

  // ---- AUTO-FILL PAYMENT
  const [paymentAutoFilled, setPaymentAutoFilled] = useState(false);

  /* ---------- Debounce del buscador de cliente ---------- */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedClientSearch(clientSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [clientSearch]);

  /* ---------- Cargar pendientes ---------- */
  useEffect(() => {
    setPendingSales(readPendingLS());
  }, []);

  /* ---------- CARGAR CLIENTES RECIENTES ---------- */
  useEffect(() => {
    async function loadRecentClients() {
      if (!van?.id) return;
      
      const { data } = await supabase
        .from('ventas')
        .select(`
          cliente_id,
          created_at,
          clientes:cliente_id (
            id, nombre, apellido, telefono, negocio, email, direccion
          )
        `)
        .eq('van_id', van.id)
        .not('cliente_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!data) return;

      const uniqueClients = [];
      const seen = new Set();
      
      for (const sale of data) {
        if (!seen.has(sale.cliente_id) && sale.clientes) {
          seen.add(sale.cliente_id);
          uniqueClients.push(sale.clientes);
          if (uniqueClients.length >= 5) break;
        }
      }
      
      setRecentClients(uniqueClients);
    }
    
    loadRecentClients();
  }, [van?.id]);

  /* ---------- CARGAR ESTADÍSTICAS DEL DÍA ---------- */
  useEffect(() => {
    async function loadTodayStats() {
      if (!van?.id) return;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data } = await supabase
        .from('ventas')
        .select('total, cliente_id')
        .eq('van_id', van.id)
        .gte('created_at', today.toISOString());
      
      if (data) {
        const uniqueClients = new Set(data.map(v => v.cliente_id));
        setTodayStats({
          sales: data.length,
          clients: uniqueClients.size,
          total: data.reduce((sum, v) => sum + Number(v.total || 0), 0)
        });
      }
    }
    
    loadTodayStats();
  }, [van?.id]);

  useEffect(() => {
    async function probeAddressShape() {
      try {
        const { data } = await supabase
          .from("clientes_balance")
          .select("direccion")
          .limit(5);

        if (!data || data.length === 0) return;

        let jsonCount = 0;
        let textCount = 0;
        const keys = new Set();

        for (const row of data) {
          const v = row?.direccion;
          if (v == null) continue;

          if (typeof v === "object") {
            jsonCount++;
            ["calle", "ciudad", "estado", "zip"].forEach(k => {
              if (v[k] != null) keys.add(k);
            });
            continue;
          }

          if (typeof v === "string") {
            const s = v.trim();
            if (s.startsWith("{") && s.endsWith("}")) {
              try {
                const obj = JSON.parse(s);
                if (obj && typeof obj === "object") {
                  jsonCount++;
                  ["calle", "ciudad", "estado", "zip"].forEach(k => {
                    if (obj[k] != null) keys.add(k);
                  });
                  continue;
                }
              } catch {}
            }
            textCount++;
          }
        }

        if (jsonCount > textCount) {
          setAddrSpec({ type: "json", fields: Array.from(keys) });
        } else if (textCount > 0) {
          setAddrSpec({ type: "text", fields: [] });
        } else {
          setAddrSpec({ type: "unknown", fields: [] });
        }
      } catch (e) {
        console.warn("No se pudo sondear `direccion`:", e?.message || e);
        setAddrSpec({ type: "unknown", fields: [] });
      }
    }

    probeAddressShape();
  }, []);

  /* ---------- CLIENTES (búsqueda OPTIMIZADA con CACHE) ---------- */
  useEffect(() => {
    async function loadClients() {
      const term = String(debouncedClientSearch || "").trim();

      if (term.length < 2) {
        setClients([]);
        return;
      }

      if (clientCache.has(term)) {
        setClients(clientCache.get(term));
        return;
      }

      setClientLoading(true);
      try {
        const safe = term.replace(/[(),%]/g, "").slice(0, 80);

        let primaryFields = ["nombre", "apellido", "negocio", "telefono", "email"];
        let primaryCols = "id,nombre,apellido,negocio,telefono,email,direccion,balance";
        
        if (addrSpec.type === "text") {
          primaryFields.push("direccion");
        }
        
        const primaryOr = primaryFields.map(f => `${f}.ilike.%${safe}%`).join(",");

        let baseData = [];
        let needFallbackNoApellido = false;

        let { data: d1, error: e1 } = await supabase
          .from("clientes_balance")
          .select(primaryCols)
          .or(primaryOr)
          .limit(20);

        if (e1) {
          if (e1.code === "42703") {
            needFallbackNoApellido = true;
          } else {
            console.warn("OR principal falló:", e1);
          }
        } else {
          baseData = d1 || [];
        }

        if (needFallbackNoApellido || baseData.length === 0) {
          let fbFields = ["nombre", "negocio", "telefono", "email"];
          if (addrSpec.type === "text") {
            fbFields.push("direccion");
          }
          
          const fbCols = "id,nombre,negocio,telefono,email,direccion,balance";
          const fbOr = fbFields.map(f => `${f}.ilike.%${safe}%`).join(",");

          const { data: d2, error: e2 } = await supabase
            .from("clientes_balance")
            .select(fbCols)
            .or(fbOr)
            .limit(20);

          if (e2) {
            console.warn("Fallback OR sin apellido también falló:", e2);
          } else {
            baseData = d2 || baseData;
          }
        }

        let jsonAddressData = [];
        if (addrSpec.type === "json" && addrSpec.fields.length > 0) {
          try {
            const { data: allData, error: eAll } = await supabase
              .from("clientes_balance")
              .select("id,nombre,apellido,negocio,telefono,email,direccion,balance")
              .not("direccion", "is", null)
              .limit(100);

            if (!eAll && allData) {
              jsonAddressData = allData.filter(client => {
                if (!client.direccion) return false;
                
                let addr = client.direccion;
                
                if (typeof addr === "string") {
                  try {
                    addr = JSON.parse(addr);
                  } catch {
                    return false;
                  }
                }
                
                if (typeof addr !== "object") return false;
                
                const searchLower = safe.toLowerCase();
                return addrSpec.fields.some(field => {
                  const value = String(addr[field] || "").toLowerCase();
                  return value.includes(searchLower);
                });
              });
            }
          } catch (e) {
            console.warn("Búsqueda en dirección JSON falló:", e);
          }
        }

        let andData = [];
        const tokens = safe.split(/\s+/).filter(Boolean);
        if (tokens.length >= 2) {
          const first = tokens[0];
          const rest = tokens.slice(1).join(" ");

          try {
            const { data: dAnd, error: eAnd } = await supabase
              .from("clientes_balance")
              .select("id,nombre,apellido,negocio,telefono,email,direccion,balance")
              .ilike("nombre", `%${first}%`)
              .ilike("apellido", `%${rest}%`)
              .limit(10);

            if (eAnd) {
              if (eAnd.code !== "42703") console.warn("AND nombre+apellido falló:", eAnd);
            } else {
              andData = dAnd || [];
            }
          } catch (e) {
            // ignora
          }
        }

        const byId = new Map();
        for (const row of [...(baseData || []), ...andData, ...jsonAddressData]) {
          if (row && row.id != null) byId.set(row.id, row);
        }
        const merged = Array.from(byId.values());

        const ids = merged.map((c) => c.id).filter(Boolean);
        let enriched = merged;

        if (ids.length > 0 && ids.length <= 10) {
          const { data: cxcRows, error: eCx } = await supabase
            .from("v_cxc_cliente_detalle")
            .select("cliente_id,saldo")
            .in("cliente_id", ids);

          if (eCx) console.warn("Enriquecimiento saldo falló:", eCx);

          const saldoMap = new Map(
            (cxcRows || []).map((r) => [r.cliente_id, Number(r.saldo || 0)])
          );

          enriched = merged.map((c) => ({
            ...c,
            _saldo_real: saldoMap.has(c.id)
              ? saldoMap.get(c.id)
              : Number(c.balance || 0),
          }));
        } else {
          enriched = merged.map((c) => ({
            ...c,
            _saldo_real: Number(c.balance || 0),
          }));
        }

        setClientCache((prev) => {
          const next = new Map(prev);
          next.set(term, enriched);
          if (next.size > 12) next.delete(next.keys().next().value);
          return next;
        });

        setClients(enriched);
      } catch (err) {
        console.error("Error searching clients:", err);
        setClients([]);
      } finally {
        setClientLoading(false);
      }
    }

    loadClients();
  }, [debouncedClientSearch, addrSpec.type, addrSpec.fields?.length]);

  /* ---------- Historial al seleccionar cliente ---------- */
  useEffect(() => {
    async function fetchHistory() {
      const id = selectedClient?.id;
      if (!id) {
        setClientHistory({ has: false, ventas: 0, pagos: 0, loading: false });
        return;
      }
      setClientHistory((h) => ({ ...h, loading: true }));
      const [{ count: vCount }, { count: pCount }] = await Promise.all([
        supabase.from("ventas").select("id", { count: "exact", head: true }).eq("cliente_id", id),
        supabase.from("pagos").select("id", { count: "exact", head: true }).eq("cliente_id", id),
      ]);
      const has = (vCount || 0) > 0 || (pCount || 0) > 0;
      setClientHistory({ has, ventas: vCount || 0, pagos: pCount || 0, loading: false });
    }
    fetchHistory();
  }, [selectedClient?.id]);

  /* ---------- Traer límite/disponible/saldo ---------- */
  useEffect(() => {
    let disposed = false;
    let sub = null;
    let timer = null;

    async function refreshCxC() {
      const id = selectedClient?.id;
      if (!id) {
        setCxcLimit(null);
        setCxcAvailable(null);
        setCxcBalance(null);
        return;
      }
      const info = await getCxcCliente(id);
      if (disposed || !info) return;
      setCxcLimit(info.limite);
      setCxcAvailable(info.disponible);
      setCxcBalance(info.saldo);
    }

    function onFocus() { refreshCxC(); }
    function onVisible() { if (!document.hidden) refreshCxC(); }

    refreshCxC();

    if (selectedClient?.id) {
      sub = subscribeClienteCxC(selectedClient.id, refreshCxC);
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisible);
      timer = setInterval(refreshCxC, 20000);
    }

    return () => {
      disposed = true;
      sub?.unsubscribe?.();
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedClient?.id]);

  /* ========== TOP productos ========== */
  function normalizeFromRpc(arr = []) {
    return arr.slice(0, 10).map((p) => {
      const producto_id = p.producto_id ?? p.id ?? p.prod_id ?? null;
      const nombre =
        p.nombre ?? p.producto_nombre ?? p.nombre_producto ?? p.producto ?? "";
      const precio = Number(p.precio ?? p.precio_unit ?? p.price ?? p.unit_price) || 0;
      const codigo = p.codigo ?? p.sku ?? p.codigobarra ?? p.barcode ?? null;
      const marca = p.marca ?? p.brand ?? null;
      const cantidad = Number(p.cantidad_disponible ?? p.cantidad ?? p.stock) || 0;
      return {
        producto_id,
        cantidad,
        productos: {
          id: producto_id,
          nombre,
          precio,
          codigo,
          marca,
          descuento_pct: p.descuento_pct ?? p.discount_pct ?? null,
          bulk_min_qty: p.bulk_min_qty ?? p.bulk_min ?? null,
          bulk_unit_price: p.bulk_unit_price ?? p.bulk_price ?? null,
        },
        nombre,
        precio,
        codigo,
        marca,
      };
    });
  }

  async function enrichTopWithCatalog(rows) {
    const ids = rows.map((r) => r.producto_id).filter(Boolean);
    if (ids.length === 0) return rows;

    const { data: prods, error } = await supabase
      .from("productos")
      .select("id,nombre,precio,codigo,marca,descuento_pct,bulk_min_qty,bulk_unit_price")
      .in("id", ids);
    if (error || !prods) return rows;

    const map = new Map(prods.map((p) => [p.id, p]));

    return rows.map((row) => {
      const p = map.get(row.producto_id);
      if (!p) return row;

      const merged = {
        producto_id: row.producto_id,
        cantidad: row.cantidad,
        productos: {
          id: row.producto_id,
          nombre: row.productos?.nombre ?? p.nombre,
          precio:
            Number.isFinite(Number(row.productos?.precio)) && Number(row.productos?.precio) > 0
              ? Number(row.productos?.precio)
              : Number(p.precio) || 0,
          codigo: row.productos?.codigo ?? p.codigo ?? null,
          marca: row.productos?.marca ?? p.marca ?? null,
          descuento_pct: row.productos?.descuento_pct ?? p.descuento_pct ?? null,
          bulk_min_qty: row.productos?.bulk_min_qty ?? p.bulk_min_qty ?? null,
          bulk_unit_price: row.productos?.bulk_unit_price ?? p.bulk_unit_price ?? null,
        },
      };

      merged.nombre = merged.productos.nombre;
      merged.precio = merged.productos.precio;
      merged.codigo = merged.productos.codigo;
      merged.marca = merged.productos.marca;

      return merged;
    });
  }

  useEffect(() => {
    async function loadTopProducts() {
      setProductError("");
      setTopProducts([]);
      if (!van?.id) return;

      try {
        const { data, error } = await supabase.rpc("productos_mas_vendidos_por_van", {
          van_id_param: van.id,
          dias: 30,
          limite: 10,
        });
        if (error) throw error;

        if (Array.isArray(data) && data.length > 0) {
          let rows = normalizeFromRpc(data);
          rows = await enrichTopWithCatalog(rows);

          const ids = rows.map(r => r.producto_id).filter(Boolean);
          const stockMap = await getStockMapForVan(van.id, ids);
          rows = rows.map(r => ({ ...r, cantidad: stockMap.get(r.producto_id) ?? 0 }));
          rows = rows.filter(r => Number(r.cantidad) > 0);

          setTopProducts(rows);
          return;
        }
        console.warn("RPC productos_mas_vendidos_por_van devolvió vacío.");
      } catch (err) {
        console.warn("RPC productos_mas_vendidos_por_van falló. Fallback a join.", err?.message || err);
      }

      try {
        const { data, error } = await supabase
          .from("stock_van")
          .select(
            "producto_id,cantidad, productos:productos!inner(id,nombre,precio,codigo,marca,descuento_pct,bulk_min_qty,bulk_unit_price)"
          )
          .eq("van_id", van.id)
          .gt("cantidad", 0)
          .order("cantidad", { ascending: false })
          .limit(10);

        if (error) throw error;

        if (Array.isArray(data) && data.length > 0) {
          const rows = data.map(row => {
            const p = row.productos || {};
            const producto_id = row.producto_id ?? p.id ?? null;
            return {
              producto_id,
              cantidad: Number(row.cantidad || 0),
              productos: {
                id: producto_id,
                nombre: p.nombre ?? "",
                precio: Number(p.precio || 0),
                codigo: p.codigo ?? null,
                marca: p.marca ?? null,
                descuento_pct: p.descuento_pct ?? null,
                bulk_min_qty: p.bulk_min_qty ?? null,
                bulk_unit_price: p.bulk_unit_price ?? null,
              },
              nombre: p.nombre ?? "",
              precio: Number(p.precio || 0),
              codigo: p.codigo ?? null,
              marca: p.marca ?? null,
            };
          });
          setTopProducts(rows);
          return;
        }
        console.warn("Join stock_van→productos devolvió vacío. Fallback a 2 pasos.");
      } catch (err) {
        console.warn("Join stock_van→productos falló. Fallback a 2 pasos.", err?.message || err);
      }

      try {
        const { data: stock, error: e1 } = await supabase
          .from("stock_van")
          .select("producto_id,cantidad")
          .eq("van_id", van.id)
          .gt("cantidad", 0)
          .order("cantidad", { ascending: false })
          .limit(10);
        if (e1) throw e1;

        const ids = (stock || []).map((r) => r.producto_id);
        if (ids.length === 0) {
          setTopProducts([]);
          setProductError("No hay stock para esta van.");
          return;
        }

        const { data: prods, error: e2 } = await supabase
          .from("productos")
          .select("id,nombre,precio,codigo,marca,descuento_pct,bulk_min_qty,bulk_unit_price")
          .in("id", ids);
        if (e2) throw e2;

        const m = new Map((prods || []).map((p) => [p.id, p]));
        const rows = (stock || []).map((s) => {
          const p = m.get(s.producto_id) || {};
          const producto_id = s.producto_id ?? p.id ?? null;
          return {
            producto_id,
            cantidad: Number(s.cantidad || 0),
            productos: {
              id: producto_id,
              nombre: p.nombre ?? "",
              precio: Number(p.precio || 0),
              codigo: p.codigo ?? null,
              marca: p.marca ?? null,
              descuento_pct: p.descuento_pct ?? null,
              bulk_min_qty: p.bulk_min_qty ?? null,
              bulk_unit_price: p.bulk_unit_price ?? null,
            },
            nombre: p.nombre ?? "",
            precio: Number(p.precio || 0),
            codigo: p.codigo ?? null,
            marca: p.marca ?? null,
          };
        });

        setTopProducts(rows);
      } catch (err) {
        console.error("Todos los fallbacks de TOP fallaron:", err?.message || err);
        setTopProducts([]);
        setProductError("No se pudieron cargar los productos (TOP).");
      }
    }

    loadTopProducts();
  }, [van?.id, invTick]);

  /* ---------- INVENTARIO COMPLETO - LAZY LOADING ---------- */
  useEffect(() => {
    if (productSearch.trim().length === 0) {
      setAllProductsLoading(false);
      setProductsLoaded(false);
      return;
    }

    if (productsLoaded && allProducts.length > 0) {
      return;
    }

    async function loadAllProducts() {
      setAllProducts([]);
      setAllProductsLoading(true);
      if (!van?.id) return setAllProductsLoading(false);

      try {
        const { data, error } = await supabase
          .from("stock_van")
          .select("producto_id,cantidad, productos:productos!inner(id,nombre,precio,codigo,marca)")
          .eq("van_id", van.id)
          .gt("cantidad", 0)
          .order("nombre", { ascending: true, foreignTable: "productos" })
          .limit(100);

        if (error) throw error;

        const rows = (data || []).map((row) => ({
          producto_id: row.producto_id,
          cantidad: Number(row.cantidad) || 0,
          productos: {
            id: row.productos?.id,
            nombre: row.productos?.nombre,
            precio: Number(row.productos?.precio) || 0,
            codigo: row.productos?.codigo,
            marca: row.productos?.marca ?? "",
          },
        }));
        
        setAllProducts(rows);
        setProductsLoaded(true);
        setAllProductsLoading(false);
        return;
      } catch (err) {
        console.warn("Inventario completo falló:", err?.message || err);
        setAllProducts([]);
        setProductsLoaded(false);
      } finally {
        setAllProductsLoading(false);
      }
    }

    const timer = setTimeout(() => {
      loadAllProducts();
    }, 300);

    return () => clearTimeout(timer);
  }, [van?.id, productSearch, invTick, productsLoaded, allProducts.length]);

  useEffect(() => {
    if (step === 2) reloadInventory();
  }, [step]);

  /* ---------- Filtro del buscador ---------- */
  useEffect(() => {
    const filter = productSearch.trim().toLowerCase();
    const searchActive = filter.length > 0;
    const base = searchActive ? allProducts : topProducts;

    let filtered = !searchActive
      ? base
      : base.filter((row) => {
          const n = (row.productos?.nombre || row.nombre || "").toLowerCase();
          const c = (row.productos?.codigo || row.codigo || "").toLowerCase();
          const m = (row.productos?.marca || row.marca || "").toLowerCase();
          return n.includes(filter) || c.includes(filter) || m.includes(filter);
        });

    filtered = filtered.filter(r => Number(r.cantidad ?? r.stock ?? 0) > 0);

    setProducts(filtered);
    setNoProductFound(searchActive && filtered.length === 0 ? productSearch.trim() : "");
  }, [productSearch, topProducts, allProducts]);

  /* ---------- Totales & crédito ---------- */
  const cartSafe = Array.isArray(cart) ? cart : [];

  const saleTotal = cartSafe.reduce((t, p) => t + p.cantidad * p.precio_unitario, 0);
  const paid = payments.reduce((s, p) => s + Number(p.monto || 0), 0);

  const balanceBeforeRaw =
    cxcBalance != null && !Number.isNaN(Number(cxcBalance))
      ? Number(cxcBalance)
      : Number(getClientBalance(selectedClient));
  
  const balanceBefore = Math.max(0, Number.isFinite(balanceBeforeRaw) ? balanceBeforeRaw : 0);

  const oldDebt = balanceBefore;
  const totalAPagar = oldDebt + saleTotal;

  const paidForSale = Math.min(paid, saleTotal);
  const paidToOldDebt = Math.min(oldDebt, Math.max(0, paid - paidForSale));
  const paidApplied = paidForSale + paidToOldDebt;

  const change = Math.max(0, paid - totalAPagar);
  const mostrarAdvertencia = paid > totalAPagar;

  const balanceAfter = Math.max(0, balanceBefore + saleTotal - paidApplied);
  const amountToCredit = Math.max(0, balanceAfter - balanceBefore);

  const clientScore = Number(selectedClient?.score_credito ?? 600);
  const showCreditPanel = !!selectedClient && (clientHistory.has || balanceBefore !== 0);

  const computedLimit = policyLimit(clientScore);
  const creditLimit = showCreditPanel ? Number(cxcLimit ?? computedLimit) : 0;

  const creditAvailable = showCreditPanel
    ? Number(
        cxcAvailable != null && !Number.isNaN(Number(cxcAvailable))
          ? cxcAvailable
          : Math.max(0, creditLimit - balanceBefore)
      )
    : 0;

  const creditAvailableAfter = Math.max(0, creditLimit - balanceAfter);
  const excesoCredito = amountToCredit > creditAvailable ? amountToCredit - creditAvailable : 0;

  /* ---------- Guardar venta pendiente local ---------- */
  useEffect(() => {
    const hasMeaning =
      cartSafe.length > 0 ||
      payments.some((p) => Number(p.monto) > 0) ||
      (notes && notes.trim().length > 0);

    if (selectedClient && hasMeaning && step < 4) {
      const id =
        window.pendingSaleId ||
        (window.pendingSaleId = `${selectedClient?.id ?? "quick"}-${Date.now()}`);

      const newPending = {
        id,
        client: selectedClient,
        cart: cartSafe,
        payments,
        notes,
        step,
        date: new Date().toISOString(),
      };

      const updated = upsertPendingInLS(newPending);
      setPendingSales(updated);
    }
  }, [selectedClient, cartSafe, payments, notes, step]);

  /* ---------- AUTO-FILL del monto de pago ---------- */
  useEffect(() => {
    if (
      step === 3 && 
      totalAPagar > 0 && 
      !paymentAutoFilled && 
      payments.length === 1 && 
      Number(payments[0].monto) === 0
    ) {
      setPayments([{ ...payments[0], monto: totalAPagar }]);
      setPaymentAutoFilled(true);
    }

    if (step !== 3 && paymentAutoFilled) {
      setPaymentAutoFilled(false);
    }

    if (step === 3 && paymentAutoFilled && payments.length > 1) {
      setPaymentAutoFilled(false);
    }
  }, [step, totalAPagar, payments, paymentAutoFilled]);

  /* ========== LIMPIAR POLLING AL DESMONTAR ========== */
  useEffect(() => {
    return () => {
      if (qrPollingIntervalRef.current) {
        clearInterval(qrPollingIntervalRef.current);
      }
    };
  }, []);

  /* ========== STRIPE QR FUNCTIONS (🆕 CON FEE) ========== */

  // 📱 Genera QR para pago con Stripe
  async function handleGenerateQR(paymentIndex) {
    const payment = payments[paymentIndex];
    let amount = Number(payment.monto);

    if (!amount || amount <= 0) {
      alert("⚠️ Ingresa un monto válido antes de generar el QR");
      return;
    }

    // 🆕 APLICAR FEE DE TARJETA SI ESTÁ ACTIVADO
    const shouldApplyFee = applyCardFee[paymentIndex] || false;
    const feeAmount = shouldApplyFee ? amount * (cardFeePercentage / 100) : 0;
    const totalAmount = amount + feeAmount;

    setQRPaymentIndex(paymentIndex);
    setQRAmount(totalAmount);

    // Mostrar confirmación si hay fee
    if (shouldApplyFee) {
      const confirmed = window.confirm(
        `💳 Card Fee Applied:\n\n` +
        `Base amount: ${fmt(amount)}\n` +
        `Card fee (${cardFeePercentage}%): ${fmt(feeAmount)}\n` +
        `Total to charge: ${fmt(totalAmount)}\n\n` +
        `Continue?`
      );
      if (!confirmed) return;
    }

    // 1️⃣ Crear sesión de pago
    let checkoutUrl, sessionId;
    try {
      const created = await createStripeCheckoutSession(
        totalAmount,
        `Pago ${selectedClient?.nombre || "venta rápida"} - ${van?.nombre || "Van"}` +
        (shouldApplyFee ? ` (incluye ${cardFeePercentage}% fee)` : "")
      );

      checkoutUrl = created.url;
      sessionId = created.sessionId;
    } catch (e) {
      alert(`❌ Error generando checkout: ${e.message || e}`);
      return;
    }

    // 2️⃣ Generar el código QR
    const qrData = await generateQRCode(checkoutUrl);
    if (!qrData) {
      alert("❌ Error generando código QR");
      return;
    }

    // 3️⃣ Mostrar el modal
    setQRCodeData(qrData);
    setShowQRModal(true);
    setQRPollingActive(true);

    // 4️⃣ Iniciar verificación
    startCheckoutPolling(sessionId, paymentIndex, shouldApplyFee, amount, feeAmount);
  }

  // ⏱️ Polling de la Checkout Session (🆕 CON FEE)
  function startCheckoutPolling(sessionId, paymentIndex, hasFee, baseAmount, feeAmount) {
    if (qrPollingIntervalRef.current) {
      clearInterval(qrPollingIntervalRef.current);
    }

    console.log("🌀 Iniciando polling para session:", sessionId);

    let errorCount = 0;
    const MAX_ERRORS = 3;

    const timeoutId = setTimeout(() => {
      if (qrPollingIntervalRef.current) {
        clearInterval(qrPollingIntervalRef.current);
        qrPollingIntervalRef.current = null;
        setQRPollingActive(false);
        setShowQRModal(false);
        alert("⏰ Payment timeout. Please verify manually.");
      }
    }, 5 * 60 * 1000);

    qrPollingIntervalRef.current = setInterval(async () => {
      try {
        const res = await checkStripeCheckoutStatus(sessionId);
        
        if (!res.ok) {
          console.warn("⚠️ Error temporal en checkStripeCheckoutStatus:", res.error);
          errorCount++;
          if (errorCount >= MAX_ERRORS) {
            clearInterval(qrPollingIntervalRef.current);
            clearTimeout(timeoutId);
            qrPollingIntervalRef.current = null;
            setQRPollingActive(false);
            setShowQRModal(false);
            alert("❌ Connection error with Stripe. Please verify your configuration.");
          }
          return;
        }

        errorCount = 0;

        console.log("📊 Estado Stripe:", {
          status: res.status,
          paid: res.paid,
          payment_status: res.payment_status,
          session_status: res.session_status
        });

        if (res.paid === true || res.status === "complete") {
          clearInterval(qrPollingIntervalRef.current);
          clearTimeout(timeoutId);
          qrPollingIntervalRef.current = null;
          setQRPollingActive(false);

          const paidAmount = Number(res.amount || 0) / 100;
          
          // 🆕 SI HAY FEE, ACTUALIZAR EL MONTO BASE (SIN FEE)
          const amountToSet = hasFee ? baseAmount : paidAmount;
          
          if (Number.isFinite(amountToSet) && amountToSet > 0) {
            handleChangePayment(paymentIndex, "monto", amountToSet);
          }

          setShowQRModal(false);

          alert(
            "✅ Payment confirmed with Stripe!\n\n" +
            `💰 Amount charged: ${fmt(paidAmount)}\n` +
            (hasFee ? `📊 Base amount: ${fmt(baseAmount)}\n💳 Card fee (${cardFeePercentage}%): ${fmt(feeAmount)}\n\n` : "") +
            "👉 Review the details and click 'Save Sale' to complete."
          );

          setTimeout(() => {
            const saveButton = document.querySelector('button[type="button"]')?.closest('button:has-text("Save Sale")') 
              || Array.from(document.querySelectorAll('button')).find(btn => 
                btn.textContent.includes('Save Sale') || btn.textContent.includes('💾')
              );
            saveButton?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 500);

          return;
        }

        if (res.status === "expired") {
          clearInterval(qrPollingIntervalRef.current);
          clearTimeout(timeoutId);
          qrPollingIntervalRef.current = null;
          setQRPollingActive(false);
          alert("❌ Payment session expired.");
          setShowQRModal(false);
          return;
        }
      } catch (err) {
        console.error("❌ Error durante el polling Stripe:", err);
        errorCount++;
        
        if (errorCount >= MAX_ERRORS) {
          clearInterval(qrPollingIntervalRef.current);
          clearTimeout(timeoutId);
          qrPollingIntervalRef.current = null;
          setQRPollingActive(false);
          setShowQRModal(false);
          alert("❌ Critical error. Please verify your connection and Stripe configuration.");
        }
      }
    }, 3000);
  }

  function handleCloseQRModal() {
    if (qrPollingIntervalRef.current) {
      clearInterval(qrPollingIntervalRef.current);
      qrPollingIntervalRef.current = null;
    }
    setQRPollingActive(false);
    setShowQRModal(false);
    setQRCodeData(null);
    setQRPaymentIntent(null);
  }

  /* ========== HANDLERS ========== */

  function clearSale() {
    setClientSearch("");
    setClients([]);
    setSelectedClient(null);
    setProductSearch("");
    setProducts([]);
    setTopProducts([]);
    setAllProducts([]);
    setNotes("");
    setPayments([{ forma: "efectivo", monto: 0 }]);
    setPaymentError("");
    setSaving(false);
    setStep(1);
    window.pendingSaleId = null;
    // 🆕 Limpiar fees
    setApplyCardFee({});
  }

  async function requestAndSendNotifications({ client, payload }) {
    if (!client) return;

    const hasPhone = !!client.telefono;
    const hasEmail = !!client.email;

    const subject = `${COMPANY_NAME} — Receipt ${new Date().toLocaleDateString()}`;
    const text = composeReceiptMessageEN(payload);
    const html = text;

    const wants = await askChannel({ hasPhone, hasEmail });
    if (!wants) return;

    try {
      if (wants === "sms" && hasPhone) {
        await sendSmsIfPossible({ phone: client.telefono, text });
      } else if (wants === "email" && hasEmail) {
        await sendEmailSmart({ to: client.email, subject, html, text });
      }
    } catch (e) {
      console.warn("Receipt send error:", e?.message || e);
    }
  }

  function handleAddProduct(p) {
    const stockNow = Number(p.cantidad ?? p.stock ?? 0);
    if (!Number.isFinite(stockNow) || stockNow <= 0) {
      setProductError("Sin stock disponible para este producto.");
      return;
    }

    const exists = cartSafe.find((x) => x.producto_id === p.producto_id);
    const qty = 1;

    const meta = extractPricingFromRow(p);
    const unit = computeUnitPriceFromRow(p, qty);

    const safeName = p.productos?.nombre ?? p.nombre ?? "—";

    if (!exists) {
      setCart((prev) => [
        ...prev,
        {
          producto_id: p.producto_id,
          nombre: safeName,
          _pricing: { ...meta, base: meta.base || unit || 0 },
          precio_unitario: unit,
          cantidad: qty,
        },
      ]);
    }
    setProductSearch("");
  }

  function handleEditQuantity(producto_id, cantidad) {
    setCart((cart) =>
      cart.map((item) => {
        if (item.producto_id !== producto_id) return item;
        const qty = Math.max(1, Number(cantidad));

        const meta = item._pricing ?? extractPricingFromRow(item);
        const unit =
          unitPriceFromProduct(
            {
              base: Number(meta.base || 0),
              pct: Number(meta.pct || 0),
              bulkMin: meta.bulkMin != null ? Number(meta.bulkMin) : null,
              bulkPrice: meta.bulkPrice != null ? Number(meta.bulkPrice) : null,
            },
            qty
          ) || computeUnitPriceFromRow(item, qty);

        return { ...item, cantidad: qty, precio_unitario: unit };
      })
    );
  }

  function handleRemoveProduct(producto_id) {
    setCart((cart) => cart.filter((p) => p.producto_id !== producto_id));
  }

  function handleChangePayment(index, field, value) {
    setPayments((arr) => arr.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function handleAddPayment() {
    setPayments([...payments, { forma: "efectivo", monto: 0 }]);
  }

  function handleRemovePayment(index) {
    setPayments((ps) => (ps.length === 1 ? ps : ps.filter((_, i) => i !== index)));
  }

  function handleBarcodeScanned(code) {
    let cleanedCode = code.replace(/^0+/, '');
    if (cleanedCode === '') cleanedCode = '0';
    setProductSearch(cleanedCode);
    setShowScanner(false);
  }

  function handleSelectPendingSale(sale) {
    setSelectedClient(sale.client);
    setCart(sale.cart);
    setPayments(sale.payments);
    setNotes(sale.notes);
    setStep(sale.step);
    window.pendingSaleId = sale.id;
    setModalPendingSales(false);
  }

  function handleDeletePendingSale(id) {
    const updated = removePendingFromLSById(id);
    setPendingSales(updated);
    if (window.pendingSaleId === id) window.pendingSaleId = null;
  }

  function renderAddress(address) {
    if (!address) return "No address";
    if (typeof address === "string") {
      try {
        address = JSON.parse(address);
      } catch {}
    }
    if (typeof address === "object") {
      return [address.calle, address.ciudad, address.estado, address.zip].filter(Boolean).join(", ");
    }
    return address;
  }

  /* ===================== Guardar venta ===================== */
  async function saveSale() {
    setSaving(true);
    setPaymentError("");

    const currentPendingId = window.pendingSaleId;

    try {
      if (!usuario?.id) throw new Error("User not synced, please re-login.");
      if (!van?.id) throw new Error("Select a VAN first.");
      if (!selectedClient) throw new Error("Select a client or choose Quick sale.");
      if (cartSafe.length === 0) throw new Error("Add at least one product.");

      if (amountToCredit > 0 && amountToCredit > creditAvailable + 0.0001) {
        setPaymentError(
          `❌ Credit exceeded: you need ${fmt(amountToCredit)}, but only ${fmt(creditAvailable)} is available.`
        );
        return;
      }

      if (amountToCredit > 0) {
        const ok = window.confirm(
          `This sale will leave ${fmt(amountToCredit)} on the customer's account (credit).\n` +
            (selectedClient
              ? `Credit limit: ${fmt(creditLimit)}\nAvailable before: ${fmt(
                  creditAvailable
                )}\nAvailable after: ${fmt(creditAvailableAfter)}\n\n`
              : `\n(No credit history yet)\n\n`) +
            `Do you want to continue?`
        );
        if (!ok) return;
      }

      const existingCreditNow = Math.max(0, -balanceBefore);
      const oldDebtNow = Math.max(0, balanceBefore);
      const saleAfterCreditNow = Math.max(0, saleTotal - existingCreditNow);
      const totalAPagarNow = oldDebtNow + saleAfterCreditNow;

      const paidForSaleNow = Math.min(paid, saleAfterCreditNow);
      const payOldDebtNow = Math.min(oldDebtNow, Math.max(0, paid - paidForSaleNow));
      const changeNow = Math.max(0, paid - totalAPagarNow);

      const pendingFromThisSale = Math.max(0, saleAfterCreditNow - paidForSaleNow);

      const estadoPago =
        pendingFromThisSale === 0 ? "pagado" : paidForSaleNow > 0 ? "parcial" : "pendiente";

      const nonZeroPayments = payments.filter((p) => Number(p.monto) > 0);
      const paidApplied = Number((paidForSaleNow + payOldDebtNow).toFixed(2));

      let remainingToApply = paidApplied;
      const metodosAplicados = [];
      for (const p of nonZeroPayments) {
        if (remainingToApply <= 0) break;
        const original = Number(p.monto || 0);
        const usar = Math.min(original, remainingToApply);
        if (usar > 0) {
          metodosAplicados.push({ ...p, monto: Number(usar.toFixed(2)) });
          remainingToApply = Number((remainingToApply - usar).toFixed(2));
        }
      }

      const metodoPrincipal =
        metodosAplicados.length === 1 ? (metodosAplicados[0].forma || "mix") : "mix";

      const paymentMap = { efectivo: 0, tarjeta: 0, transferencia: 0, otro: 0 };
      for (const p of metodosAplicados) {
        if (paymentMap[p.forma] !== undefined) {
          paymentMap[p.forma] += Number(p.monto || 0);
        }
      }

      const pagoEfectivo = Number((paymentMap.efectivo || 0).toFixed(2));
      const pagoTarjeta = Number((paymentMap.tarjeta || 0).toFixed(2));
      const pagoTransf = Number((paymentMap.transferencia || 0).toFixed(2));
      const pagoOtro = Number((paymentMap.otro || 0).toFixed(2));

      const itemsForDb = cartSafe.map((p) => {
        const meta = p._pricing || { base: p.precio_unitario, pct: 0, bulkMin: null, bulkPrice: null };
        const qty = Number(p.cantidad);
        let base = Number(meta.base || p.precio_unitario) || 0;
        let descuento_pct = 0;

        const hasBulk = meta.bulkMin != null && meta.bulkPrice != null && qty >= Number(meta.bulkMin);
        if (hasBulk && base > 0 && Number(meta.bulkPrice) > 0) {
          descuento_pct = Math.max(0, (1 - Number(meta.bulkPrice) / base) * 100);
        } else if (Number(meta.pct) > 0) {
          descuento_pct = Number(meta.pct);
        }

        if (!base || !Number.isFinite(base)) {
          base = Number(p.precio_unitario) || 0;
          descuento_pct = 0;
        }

        return {
          producto_id: p.producto_id,
          cantidad: qty,
          precio_unit: Number(base.toFixed(2)),
          descuento_pct: Number(descuento_pct.toFixed(4)),
        };
      });

      const pagoJson = {
        metodos: metodosAplicados,
        map: paymentMap,
        total_ingresado: Number(paid.toFixed(2)),
        aplicado_venta: Number(paidForSaleNow.toFixed(2)),
        aplicado_deuda: Number(payOldDebtNow.toFixed(2)),
        cambio: Number(changeNow.toFixed(2)),
        ajuste_por_venta: Number(pendingFromThisSale.toFixed(2)),
      };

      const { data: ventaRow, error: insErr } = await supabase
        .from('ventas')
        .insert([{
          cliente_id: selectedClient?.id ?? null,
          van_id: van.id ?? null,
          usuario_id: usuario.id,
          total: Number(saleTotal.toFixed(2)),
          total_pagado: Number(paidForSaleNow.toFixed(2)),
          estado_pago: estadoPago,
          pago: pagoJson,
          pago_efectivo: pagoEfectivo,
          pago_tarjeta: pagoTarjeta,
          pago_transferencia: pagoTransf,
          pago_otro: pagoOtro,
          metodo_pago: metodoPrincipal,
          notas: notes || null,
        }])
        .select('id')
        .single();

      if (insErr) throw insErr;
      const ventaId = ventaRow.id;

      for (const item of cartSafe) {
        try {
          const { data: stockActual } = await supabase
            .from('stock_van')
            .select('cantidad')
            .eq('van_id', van.id)
            .eq('producto_id', item.producto_id)
            .single();

          if (stockActual && stockActual.cantidad >= item.cantidad) {
            const nuevaCantidad = stockActual.cantidad - item.cantidad;
            
            const { error: updateErr } = await supabase
              .from('stock_van')
              .update({ cantidad: nuevaCantidad })
              .eq('van_id', van.id)
              .eq('producto_id', item.producto_id);

            if (updateErr) {
              console.error(`Error descontando stock del producto ${item.producto_id}:`, updateErr);
            }
          } else {
            console.warn(`Stock insuficiente para producto ${item.producto_id}`);
          }
        } catch (err) {
          console.error(`Error descontando stock:`, err);
        }
      }

      if (ventaId && itemsForDb.length > 0) {
        const { error: detalleErr } = await supabase
          .from('detalle_ventas')
          .insert(
            itemsForDb.map((it) => ({
              venta_id: ventaId,
              producto_id: it.producto_id,
              cantidad: it.cantidad,
              precio_unitario: it.precio_unit,
              descuento: it.descuento_pct || 0,
            }))
          );

        if (detalleErr) {
          console.error('Error insertando detalle de venta:', detalleErr);
          throw new Error(`Error guardando productos: ${detalleErr.message}`);
        }
      }

      if (pendingFromThisSale > 0 && selectedClient?.id && ventaId) {
        try {
          await supabase.rpc("cxc_crear_ajuste_por_venta", {
            p_cliente_id: selectedClient.id,
            p_venta_id: ventaId,
            p_monto: Number(pendingFromThisSale.toFixed(2)),
            p_van_id: van.id,
            p_usuario_id: usuario.id,
            p_nota: "Saldo de venta no pagado",
          });
        } catch (e) {
          console.warn("RPC cxc_crear_ajuste_por_venta no disponible, uso fallback directo:", e?.message || e);
          const { error: e2 } = await supabase
            .from("cxc_movimientos")
            .upsert(
              [{
                cliente_id: selectedClient.id,
                tipo: "venta",
                monto: Number(pendingFromThisSale.toFixed(2)),
                usuario_id: usuario.id ?? null,
                fecha: new Date().toISOString(),
                venta_id: ventaId,
              }],
              { onConflict: "venta_id" }
            );
          if (e2) console.error("Fallback CxC upsert error:", e2.message || e2);
        }
      }

      const montoParaCxC = Number(payOldDebtNow.toFixed(2));
      if (montoParaCxC > 0 && selectedClient?.id) {
        await registrarPagoCxC({
          cliente_id: selectedClient.id,
          monto: montoParaCxC,
          metodo: metodoPrincipal,
          van_id: van.id,
        });
      }

      const prevDue = Math.max(0, balanceBefore);
      const balancePost = balanceBefore + saleTotal - (paidForSaleNow + payOldDebtNow);
      const newDue = Math.max(0, balancePost);

      const payload = {
        clientName: selectedClient?.nombre || "",
        creditNumber: getCreditNumber(selectedClient),
        dateStr: new Date().toLocaleString(),
        pointOfSaleName: van?.nombre || van?.alias || `Van ${van?.id || ""}`,
        items: cartSafe.map((p) => ({
          name: p.nombre,
          qty: p.cantidad,
          unit: p.precio_unitario,
          subtotal: p.cantidad * p.precio_unitario,
        })),
        saleTotal,
        paid: paidForSaleNow + payOldDebtNow,
        change: changeNow,
        prevBalance: prevDue,
        saleRemaining: pendingFromThisSale,
        newDue,
        creditLimit,
        availableBefore: creditAvailable,
        availableAfter: Math.max(0, creditLimit - Math.max(0, balancePost)),
      };

      removePendingFromLSById(currentPendingId);
      await requestAndSendNotifications({ client: selectedClient, payload });

      alert(
        `✅ Sale saved successfully` +
          (pendingFromThisSale > 0 ? `\n📌 Unpaid (to credit): ${fmt(pendingFromThisSale)}` : "") +
          (changeNow > 0 ? `\n💰 Change to give: ${fmt(changeNow)}` : "")
      );

      reloadInventory();
      clearSale();

    } catch (err) {
      setPaymentError("❌ Error saving sale: " + (err?.message || ""));
      console.error(err);
    } finally {
      setSaving(false);
    }
  }// src/Ventas.jsx - PARTE 3 DE 3 (Modales y Renderizado de UI)

  /* ======================== MODALES ======================== */

  // 🆕 MODAL QR CON FEE MEJORADO
  function renderQRModal() {
    if (!showQRModal) return null;

    const paymentIdx = qrPaymentIndex;
    const hasFee = paymentIdx !== null && applyCardFee[paymentIdx];
    const baseAmount = paymentIdx !== null ? Number(payments[paymentIdx]?.monto || 0) : 0;
    const feeAmount = hasFee ? baseAmount * (cardFeePercentage / 100) : 0;

    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center gap-2">
              💳 Pago con Tarjeta - Stripe
            </h3>
            <button
              className="text-white hover:bg-white/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center"
              onClick={handleCloseQRModal}
            >
              ✖️
            </button>
          </div>

          <div className="p-6 text-center space-y-4">
            {/* 🆕 MOSTRAR DESGLOSE SI HAY FEE */}
            {hasFee ? (
              <div className="space-y-2">
                <div className="text-sm text-gray-600">Base Amount</div>
                <div className="text-xl font-semibold text-gray-900">{fmt(baseAmount)}</div>
                
                <div className="text-sm text-purple-600">+ Card Fee ({cardFeePercentage}%)</div>
                <div className="text-lg font-semibold text-purple-600">{fmt(feeAmount)}</div>
                
                <div className="border-t-2 border-gray-300 pt-2 mt-2">
                  <div className="text-sm text-gray-600">Total to Charge</div>
                  <div className="text-3xl font-bold text-gray-900">{fmt(qrAmount)}</div>
                </div>
              </div>
            ) : (
              <div className="text-2xl font-bold text-gray-900">
                Monto a Pagar: {fmt(qrAmount)}
              </div>
            )}

            {qrCodeData && (
              <div className="bg-white p-4 rounded-xl border-4 border-purple-200 inline-block">
                <img 
                  src={qrCodeData} 
                  alt="QR Code de pago" 
                  className="w-64 h-64"
                />
              </div>
            )}

            <div className="space-y-2">
              <p className="text-gray-700 font-semibold">
                📱 Escanea el código QR con tu teléfono
              </p>
              <p className="text-sm text-gray-600">
                El cliente puede pagar de forma segura con su tarjeta
              </p>
              {hasFee && (
                <p className="text-xs text-purple-600 font-semibold">
                  ⚠️ El monto incluye el {cardFeePercentage}% de cargo por procesamiento
                </p>
              )}
            </div>

            {qrPollingActive && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-center gap-2 text-blue-700">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-700"></div>
                  <span className="font-semibold">Esperando confirmación del pago...</span>
                </div>
              </div>
            )}

            <div className="pt-4">
              <button
                onClick={handleCloseQRModal}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderPendingSalesModal() {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center gap-2">📂 Pending Sales</h3>
            <button
              className="text-white hover:bg-white/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center"
              onClick={() => setModalPendingSales(false)}
            >
              ✖️
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[60vh]">
            {pendingSales.length === 0 ? (
              <div className="text-gray-400 text-center py-8">📭 No pending sales</div>
            ) : (
              <div className="space-y-3">
                {pendingSales.map((v) => (
                  <div key={v.id} className="bg-gray-50 rounded-lg p-4 border">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1">
                        <div className="font-bold text-gray-900">👤 {v.client?.nombre || "Quick sale"}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          📦 {v.cart.length} products · 📅 {new Date(v.date).toLocaleDateString()}{" "}
                          {new Date(v.date).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                          onClick={() => handleSelectPendingSale(v)}
                        >
                          ▶️ Resume
                        </button>
                        <button
                          className="bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                          onClick={() => handleDeletePendingSale(v.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ======================== Paso 1: Cliente ======================== */
  function renderStepClient() {
    const clientsSafe = Array.isArray(clients) ? clients : [];
    const creditNum = getCreditNumber(selectedClient);

    if (selectedClient) {
      return (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-800 flex items-center">
                👤 Select Client
              </h2>
              {migrationMode && (
                <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded">
                  🔒 Migration mode
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                onClick={() => setModalPendingSales(true)}
                type="button"
              >
                📂 Pending ({pendingSales.length})
              </button>
              <button
                onClick={() => navigate("/clientes/nuevo", { replace: false })}
                className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg px-4 py-2 font-semibold shadow-md hover:shadow-lg transition-all duration-200"
              >
                ✨ Quick Create
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="font-bold text-blue-900 text-lg">
                    {selectedClient.nombre} {selectedClient.apellido || ""}
                  </div>
                  {selectedClient.negocio && (
                    <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full">
                      {selectedClient.negocio}
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-sm text-gray-700">
                  {selectedClient.direccion && (
                    <div className="flex items-start gap-2">
                      <span>📍</span>
                      <span>{renderAddress(selectedClient.direccion)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span>📞</span>
                    <span className="font-mono">{selectedClient.telefono}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📧</span>
                    <span className="font-mono">{selectedClient.email || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>💳</span>
                    <span className="text-xs">
                      Credit #: <span className="font-mono font-semibold">{creditNum}</span>
                    </span>
                  </div>
                </div>

                {migrationMode && selectedClient?.id && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const info = await getCxcCliente(selectedClient.id);
                        if (info) {
                          setCxcLimit(info.limite);
                          setCxcAvailable(info.disponible);
                          setCxcBalance(info.saldo);
                        }
                      }}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
                    >
                      🔄 Refresh credit
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAdjustAmount("");
                        setShowAdjustModal(true);
                      }}
                      className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded"
                    >
                      🛠️ Set Opening Balance
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg border shadow-sm p-4 min-w-0 lg:min-w-[280px]">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-semibold">
                      Credit Limit
                    </div>
                    <div className="text-xl font-bold text-gray-900">
                      {fmt(Number(cxcLimit ?? policyLimit(clientScore)))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase font-semibold">
                      Available
                    </div>
                    <div className="text-xl font-bold text-emerald-600">
                      {fmt(creditAvailable)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase font-semibold">
                      After Sale
                    </div>
                    <div
                      className={`text-xl font-bold ${
                        creditAvailableAfter >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {fmt(creditAvailableAfter)}
                    </div>
                  </div>

                  {balanceBefore > 0 && (
                    <div className="rounded-lg p-2 border bg-red-50 border-red-200">
                      <div className="text-xs font-semibold text-red-700">
                        Outstanding Balance
                      </div>
                      <div className="text-lg font-bold text-red-700">
                        {fmt(balanceBefore)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-between">
              <button
                type="button"
                className="text-sm text-blue-700 underline"
                onClick={async () => {
                  const info = await getCxcCliente(selectedClient?.id);
                  if (info) {
                    setCxcLimit(info.limite);
                    setCxcAvailable(info.disponible);
                    setCxcBalance(info.saldo);
                  }
                }}
              >
                🔄 Refresh credit
              </button>
              <button
                className="text-sm text-red-600 underline hover:text-red-800 transition-colors"
                onClick={() => {
                  window.pendingSaleId = null;
                  setCart([]);
                  setPayments([{ forma: "efectivo", monto: 0 }]);
                  setSelectedClient(null);
                }}
              >
                🔄 Change client
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200"
              disabled={!selectedClient}
              onClick={() => setStep(2)}
            >
              Next Step →
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-800 flex items-center">
              👤 Select Client
            </h2>
            {migrationMode && (
              <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded">
                🔒 Migration mode
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
              onClick={() => setModalPendingSales(true)}
              type="button"
            >
              📂 Pending ({pendingSales.length})
            </button>
            <button
              onClick={() => navigate("/clientes/nuevo", { replace: false })}
              className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg px-4 py-2 font-semibold shadow-md hover:shadow-lg transition-all duration-200"
            >
              ✨ Quick Create
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border-2 border-blue-200">
            <div className="text-[10px] sm:text-xs text-blue-600 font-semibold uppercase">Today</div>
            <div className="text-lg sm:text-2xl font-bold text-blue-800">{todayStats.sales}</div>
            <div className="text-[10px] text-blue-600">Sales</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-3 border-2 border-emerald-200">
            <div className="text-[10px] sm:text-xs text-emerald-600 font-semibold uppercase">Clients</div>
            <div className="text-lg sm:text-2xl font-bold text-emerald-800">{todayStats.clients}</div>
            <div className="text-[10px] text-emerald-600">Served</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-3 border-2 border-amber-200">
            <div className="text-[10px] sm:text-xs text-amber-600 font-semibold uppercase">Total</div>
            <div className="text-base sm:text-xl font-bold text-amber-800">{fmt(todayStats.total)}</div>
            <div className="text-[10px] text-amber-600">Revenue</div>
          </div>
        </div>

        {recentClients.length > 0 && (
          <div className="bg-white rounded-lg border-2 border-gray-200 p-3">
            <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-2">
              <span>⚡ Recent Clients</span>
              <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded">Quick access</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    window.pendingSaleId = null;
                    setCart([]);
                    setPayments([{ forma: "efectivo", monto: 0 }]);
                    setSelectedClient(c);
                  }}
                  className="flex-shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-2 border-blue-200 rounded-lg px-3 py-2 transition-all duration-200 min-w-[140px]"
                >
                  <div className="text-left">
                    <div className="font-semibold text-sm text-gray-900 truncate">
                      {c.nombre} {c.apellido || ""}
                    </div>
                    <div className="text-xs text-gray-600 font-mono truncate">
                      {c.telefono}
                    </div>
                    {c.negocio && (
                      <div className="text-[10px] text-blue-600 truncate mt-0.5">
                        🏢 {c.negocio}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <input
            type="text"
            placeholder="🔍 Name · Phone · Email · Address · Business..."
            className="w-full border-2 border-gray-300 rounded-lg p-4 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && clientSearch.trim() === SECRET_CODE) {
                setMigrationMode((v) => !v);
                setClientSearch("");
                alert(`Migration mode ${!migrationMode ? "ON" : "OFF"}`);
              }
              if (e.key === "Enter" && clientsSafe.length > 0) setSelectedClient(clientsSafe[0]);
            }}
            autoFocus
          />
          {clientLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              Buscando…
            </div>
          )}
        </div>

        {debouncedClientSearch.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <span>🔍 Searching in:</span>
            <div className="flex flex-wrap gap-1">
              {['Name', 'Phone', 'Email', 'Address', 'Business'].map(field => (
                <span key={field} className="bg-white px-2 py-0.5 rounded border border-blue-200">
                  {field}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="max-h-64 overflow-auto space-y-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
          {clientsSafe.length === 0 && debouncedClientSearch.length < 3 && (
            <div className="text-gray-400 text-center py-8">
              ✍️ Type at least <b>3</b> letters to search
            </div>
          )}

          {clientsSafe.length === 0 &&
            debouncedClientSearch.length >= 3 &&
            !clientLoading && (
              <div className="text-gray-400 text-center py-8">🔍 No results found</div>
            )}

          {clientsSafe.map((c) => {
            const balance = getClientBalance(c);
            const hasDebt = balance > 0;
            
            return (
              <div
                key={c.id}
                className="bg-white p-3 sm:p-4 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-200 border-2 border-transparent transition-all duration-200 shadow-sm"
                onClick={() => {
                  window.pendingSaleId = null;
                  setCart([]);
                  setPayments([{ forma: "efectivo", monto: 0 }]);
                  setSelectedClient(c);
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                        <span className="truncate">
                          👤 {c.nombre} {c.apellido || ""}
                        </span>
                        {c.negocio && (
                          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full whitespace-nowrap">
                            🏢 {c.negocio}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {hasDebt && (
                      <div className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap">
                        💰 {fmt(balance)}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded px-2 py-1.5">
                      <span className="text-green-600">📞</span>
                      <span className="font-mono font-semibold text-gray-900 truncate">
                        {c.telefono || "—"}
                      </span>
                    </div>

                    {c.email && (
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                        <span className="text-blue-600">📧</span>
                        <span className="font-mono text-xs text-gray-700 truncate">
                          {c.email}
                        </span>
                      </div>
                    )}
                  </div>

                  {c.direccion && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      <span className="text-amber-600 text-sm mt-0.5">📍</span>
                      <span className="text-sm text-gray-700 leading-tight">
                        {renderAddress(c.direccion)}
                      </span>
                    </div>
                  )}

                  {(clientHistory.has || balance !== 0) && (
                    <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <span>💳 #{getCreditNumber(c)}</span>
                        {clientHistory.ventas > 0 && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            🛒 {clientHistory.ventas}
                          </span>
                        )}
                      </div>
                      {balance > 0 && (
                        <span className="text-xs text-red-600 font-semibold">
                          Due: {fmt(balance)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              window.pendingSaleId = null;
              setCart([]);
              setPayments([{ forma: "efectivo", monto: 0 }]);
              setSelectedClient({ id: null, nombre: "Quick sale", balance: 0 });
            }}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all duration-200"
          >
            ⚡ Quick Sale (No Client)
          </button>
        </div>

        <div className="flex justify-end pt-4">
          <button
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200"
            disabled={!selectedClient}
            onClick={() => setStep(2)}
          >
            Next Step →
          </button>
        </div>
      </div>
    );
  }

  /* ======================== Paso 2: Productos ======================== */
  function renderStepProducts() {
    const searchActive = productSearch.trim().length > 0;

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">🛒 Add Products</h2>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="🔍 Search in the van inventory…"
            className="flex-1 border-2 border-gray-300 rounded-lg p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
          <button
            onClick={() => setShowScanner(true)}
            className="bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2"
          >
            📷 Scan
          </button>
        </div>

        {noProductFound && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-500 p-4 rounded-lg flex items-start justify-between gap-3">
            <span className="text-yellow-800">
              ❌ No product found for "<b>{noProductFound}</b>" in van inventory
            </span>
            <button
              className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-lg px-4 py-2 font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap"
              onClick={() => navigate(`/productos/nuevo?codigo=${encodeURIComponent(noProductFound)}`)}
            >
              ✨ Create Product
            </button>
          </div>
        )}

        <div className="max-h-64 overflow-auto space-y-2 bg-gray-50 rounded-lg p-2">
          {productError && !searchActive && (
            <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">🚫 {productError}</div>
          )}

          {products.length === 0 && !noProductFound && (
            <div className="text-gray-400 text-center py-8">
              {searchActive ? (allProductsLoading ? "⏳ Searching…" : "🔍 No products match your search") : "📦 No top sellers available for this van"}
            </div>
          )}

          {products.map((p) => {
            const inCart = cartSafe.find((x) => x.producto_id === p.producto_id);

            const name = p.productos?.nombre ?? p.nombre ?? "—";
            const code = p.productos?.codigo ?? p.codigo ?? "N/A";
            const brand = p.productos?.marca ?? p.marca ?? "—";
            const price = Number(p.productos?.precio ?? p.precio ?? 0);
            const stock = p.cantidad ?? p.stock ?? 0;

            return (
              <div
                key={p.producto_id ?? p.id}
                className={`bg-white p-4 rounded-lg border-2 transition-all duration-200 shadow-sm ${
                  inCart ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                <div onClick={() => handleAddProduct(p)} className="flex-1 cursor-pointer">
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    📦 <span className="truncate" title={name}>{name}</span>
                    {brand && brand !== "—" && (
                      <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                        Brand: {brand}
                      </span>
                    )}
                    {inCart && <span className="text-green-600">✅</span>}
                  </div>

                  <div className="text-sm text-gray-600 mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <span>🔢 Code: {code}</span>
                    <span>📊 Stock: {stock}</span>
                    <span>🏷️ Brand: {brand}</span>
                    <span className="font-semibold text-blue-600 sm:text-right">💰 {fmt(price)}</span>
                  </div>
                </div>

                {inCart && (
                  <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-green-200">
                    <button
                      className="bg-red-500 text-white w-10 h-10 rounded-full font-bold hover:bg-red-600 transition-colors shadow-md"
                      onClick={() => handleEditQuantity(p.producto_id, Math.max(1, inCart.cantidad - 1))}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={stock}
                      value={inCart.cantidad}
                      onChange={(e) =>
                        handleEditQuantity(
                          p.producto_id,
                          Math.max(1, Math.min(Number(e.target.value), stock))
                        )
                      }
                      className="w-16 h-10 border-2 border-gray-300 rounded-lg text-center font-bold text-lg focus:border-blue-500 outline-none"
                    />
                    <button
                      className="bg-green-500 text-white w-10 h-10 rounded-full font-bold hover:bg-green-600 transition-colors shadow-md"
                      onClick={() => handleEditQuantity(p.producto_id, Math.min(stock, inCart.cantidad + 1))}
                    >
                      +
                    </button>
                    <button
                      className="bg-gray-500 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-gray-600 transition-colors shadow-md"
                      onClick={() => handleRemoveProduct(p.producto_id)}
                    >
                      🗑️ Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {cartSafe.length > 0 && (
          <div className="rounded-xl p-4 shadow-lg ring-2 ring-blue-300 bg-white border border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900 flex items-center gap-2">
                <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 px-3 py-1 rounded-full border border-blue-200">
                  🛒 Shopping Cart
                </span>
                <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full">
                  {cartSafe.length} items
                </span>
              </div>
              <div className="text-2xl font-bold text-blue-800">{fmt(saleTotal)}</div>
            </div>

            <div className="space-y-3">
              {cartSafe.map((p) => {
                const unitSafe =
                  p.precio_unitario > 0
                    ? p.precio_unitario
                    : unitPriceFromProduct(
                        p._pricing || { base: 0, pct: 0, bulkMin: null, bulkPrice: null },
                        p.cantidad
                      );

                return (
                  <div key={p.producto_id} className="bg-gray-50 p-4 rounded-lg border">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sm text-gray-600">
                          {fmt(unitSafe)} each
                          {p._pricing?.bulkMin &&
                            p._pricing?.bulkPrice &&
                            p.cantidad >= p._pricing.bulkMin && (
                              <span className="ml-2 text-emerald-700 font-semibold">• bulk</span>
                            )}
                        </div>
                        <div className="font-semibold text-gray-900">{p.nombre}</div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="bg-red-500 text-white w-8 h-8 rounded-full font-bold hover:bg-red-600 transition-colors"
                            onClick={() => handleEditQuantity(p.producto_id, Math.max(1, p.cantidad - 1))}
                          >
                            −
                          </button>
                          <span className="w-8 text-center font-bold text-lg">{p.cantidad}</span>
                          <button
                            className="bg-green-500 text-white w-8 h-8 rounded-full font-bold hover:bg-green-600 transition-colors"
                            onClick={() => handleEditQuantity(p.producto_id, p.cantidad + 1)}
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-lg text-blue-800">{fmt(p.cantidad * unitSafe)}</div>
                          <button
                            className="text-xs text-red-600 hover:text-red-800 transition-colors"
                            onClick={() => handleRemoveProduct(p.producto_id)}
                          >
                            🗑️ Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <textarea
            className="w-full border-2 border-gray-300 rounded-lg p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all resize-none"
            placeholder="📝 Notes for the invoice..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {selectedClient && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {balanceBefore > 0 && (
              <div className="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-lg p-4 text-center">
                <div className="text-xs text-red-600 uppercase font-semibold">Outstanding Balance</div>
                <div className="text-xl font-bold text-red-700">{fmt(balanceBefore)}</div>
              </div>
            )}

            <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-200 rounded-lg p-4 text-center">
              <div className="text-xs text-orange-600 uppercase font-semibold">Will Go to Credit</div>
              <div className={`text-xl font-bold ${amountToCredit > 0 ? "text-orange-700" : "text-emerald-700"}`}>
                {fmt(amountToCredit)}
              </div>
            </div>

            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4 text-center">
              <div className="text-xs text-green-600 uppercase font-semibold">Available After</div>
              <div className={`text-xl font-bold ${creditAvailableAfter >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {fmt(creditAvailableAfter)}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors shadow-md order-2 sm:order-1" onClick={() => setStep(1)}>
            ← Back
          </button>
          <button
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200 flex-1 sm:flex-none order-1 sm:order-2"
            disabled={cartSafe.length === 0}
            onClick={() => setStep(3)}
          >
            Next Step →
          </button>
        </div>

        {showScanner && (
          <BarcodeScanner 
            onScan={handleBarcodeScanned}
            onClose={() => setShowScanner(false)}
            isActive={showScanner}
          />
        )}
      </div>
    );
  }

  /* ======================== Paso 3: Pago (🆕 CON FEE) ======================== */
  function renderStepPayment() {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">💳 Payment</h2>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3 text-center">
            <div className="text-[10px] uppercase text-blue-700 font-semibold tracking-wide">Total</div>
            <div className="text-2xl font-extrabold text-blue-800">{fmt(saleTotal)}</div>
          </div>
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-[10px] uppercase text-amber-700 font-semibold tracking-wide">To Credit (A/R)</div>
            <div className="text-2xl font-extrabold text-amber-700">{fmt(amountToCredit)}</div>
          </div>
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-center">
            <div className="text-[10px] uppercase text-emerald-700 font-semibold tracking-wide">Change</div>
            <div className="text-2xl font-extrabold text-emerald-700">{fmt(change)}</div>
          </div>
        </div>

        {excesoCredito > 0 && (
          <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-3 text-center">
            <div className="text-rose-700 font-semibold">❌ Credit Limit Exceeded</div>
            <div className="text-rose-600 text-sm">
              Required: <b>{fmt(amountToCredit)}</b> · Available: <b>{fmt(creditAvailable)}</b> · Excess: <b>{fmt(excesoCredito)}</b>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-gray-900">Payment Methods</div>
            <button
              className="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200"
              onClick={handleAddPayment}
            >
              ➕ Add
            </button>
          </div>

          <div className="space-y-3">
            {payments.map((p, i) => (
              <div className="bg-gray-50 rounded-lg p-3 border" key={i}>
                <div className="flex items-center gap-2">
                  <select
                    value={p.forma}
                    onChange={(e) => handleChangePayment(i, "forma", e.target.value)}
                    className="flex-1 border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 outline-none transition-all"
                  >
                    {PAYMENT_METHODS.map((fp) => (
                      <option key={fp.key} value={fp.key}>
                        {fp.label}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={p.monto}
                      onChange={(e) => handleChangePayment(i, "monto", e.target.value)}
                      className="w-28 border-2 border-gray-300 rounded-lg px-3 py-2 text-right font-bold focus:border-blue-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>

                  {p.forma === "tarjeta" && (
                    <button
                      onClick={() => handleGenerateQR(i)}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-semibold shadow-md transition-colors flex items-center gap-1"
                      title="Generar QR para pago con Stripe"
                    >
                      📱 QR
                    </button>
                  )}

                  {payments.length > 1 && (
                    <button
                      className="bg-red-500 text-white w-10 h-10 rounded-full hover:bg-red-600 transition-colors shadow-md"
                      onClick={() => handleRemovePayment(i)}
                    >
                      ✖️
                    </button>
                  )}
                </div>
                
                {/* 🆕 CHECKBOX PARA FEE DE TARJETA */}
                {p.forma === "tarjeta" && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyCardFee[i] || false}
                        onChange={(e) => {
                          setApplyCardFee(prev => ({
                            ...prev,
                            [i]: e.target.checked
                          }));
                        }}
                        className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-700">
                        💳 Apply card fee ({cardFeePercentage}%)
                        {applyCardFee[i] && Number(p.monto) > 0 && (
                          <span className="ml-2 font-semibold text-purple-600">
                            → Total: {fmt(Number(p.monto) * (1 + cardFeePercentage / 100))}
                          </span>
                        )}
                      </span>
                    </label>
                    
                    {/* 🆕 INPUT PARA PERSONALIZAR EL PORCENTAJE */}
                    {applyCardFee[i] && (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs text-gray-600">Fee %:</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.1"
                          value={cardFeePercentage}
                          onChange={(e) => setCardFeePercentage(Math.max(0, Math.min(10, Number(e.target.value))))}
                          className="w-16 border rounded px-2 py-1 text-sm"
                        />
                        <span className="text-xs text-gray-500">
                          (Fee: {fmt(Number(p.monto) * (cardFeePercentage / 100))})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            className="mt-3 text-sm text-blue-700 underline"
            onClick={() => setShowPaymentDetails((v) => !v)}
          >
            {showPaymentDetails ? "Hide details" : "Show details"}
          </button>

          {showPaymentDetails && (
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 border">
                <div className="text-[10px] uppercase text-gray-500 font-semibold">Client</div>
                <div className="font-semibold text-gray-900 text-sm mt-1">{selectedClient?.nombre || "Quick sale"}</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">#{getCreditNumber(selectedClient)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border">
                <div className="text-[10px] uppercase text-gray-500 font-semibold">Sale Total</div>
                <div className="text-lg font-bold">{fmt(saleTotal)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border">
                <div className="text-[10px] uppercase text-gray-500 font-semibold">Paid</div>
                <div className="text-lg font-bold">{fmt(paid)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border">
                <div className="text-[10px] uppercase text-gray-500 font-semibold">Applied to Old Debt</div>
                <div className="text-lg font-bold">{fmt(paidToOldDebt)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border">
                <div className="text-[10px] uppercase text-gray-500 font-semibold">New Balance</div>
                <div className={`text-lg font-bold ${balanceAfter > 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {fmt(Math.abs(balanceAfter))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-xs text-blue-600 uppercase font-semibold">Total to Pay</div>
              <div className="text-2xl font-bold text-blue-800">{fmt(totalAPagar)}</div>
            </div>
            <div>
              <div className="text-xs text-green-600 uppercase font-semibold">Total Paid</div>
              <div className="text-2xl font-bold text-green-700">{fmt(paid)}</div>
            </div>
          </div>

          {change > 0 && (
            <div className="mt-4 bg-green-100 border border-green-300 rounded-lg p-3 text-center">
              <div className="text-sm text-green-700 font-semibold">💰 Change to Give</div>
              <div className="text-xl font-bold text-green-800">{fmt(change)}</div>
            </div>
          )}

          {mostrarAdvertencia && (
            <div className="mt-4 bg-orange-100 border border-orange-300 rounded-lg p-3 text-center">
              <div className="text-orange-700 font-semibold">
                ⚠️ Paid amount exceeds total debt. Please check payments.
              </div>
            </div>
          )}
        </div>

        {showCreditPanel && amountToCredit > creditAvailable && (
          <div className="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-300 rounded-lg p-4">
            <div className="text-red-700 font-semibold text-center">❌ Credit Limit Exceeded</div>
            <div className="text-red-600 text-sm mt-2 text-center">
              Required: <b>{fmt(amountToCredit)}</b> · Available: <b>{fmt(creditAvailable)}</b>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors shadow-md order-2 sm:order-1"
            onClick={() => setStep(2)}
            disabled={saving}
          >
            ← Back
          </button>
          <button
            className="bg-gradient-to-r from-green-600 to-green-700 text-white px-8 py-4 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-200 flex-1 sm:flex-none order-1 sm:order-2 text-lg"
            disabled={saving || (showCreditPanel && amountToCredit > 0 && amountToCredit > creditAvailable)}
            onClick={saveSale}
          >
            {saving ? "💾 Saving..." : "💾 Save Sale"}
          </button>
        </div>

        {paymentError && (
          <div className="bg-red-100 border border-red-300 rounded-lg p-4 text-red-700 font-semibold text-center">
            {paymentError}
          </div>
        )}
      </div>
    );
  }

  /* ======================== Render raíz ======================== */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          {modalPendingSales && renderPendingSalesModal()}
          {showQRModal && renderQRModal()}
          {step === 1 && renderStepClient()}
          {step === 2 && renderStepProducts()}
          {step === 3 && renderStepPayment()}
        </div>

        {cartSafe.length > 0 && step === 2 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4 shadow-lg sm:hidden">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">🛒 {cartSafe.length} items</div>
              <div className="text-xl font-bold text-blue-800">{fmt(saleTotal)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Ajuste inicial */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-purple-600 text-white px-4 py-3 flex items-center justify-between">
              <div className="font-semibold">Set Opening Balance</div>
              <button onClick={() => setShowAdjustModal(false)} className="opacity-80 hover:opacity-100">
                ✖️
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm text-gray-600">
                Cliente: <b>{selectedClient?.nombre}</b>
              </div>

              <label className="block text-sm font-medium text-gray-700">Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border rounded-lg px-3 py-2"
                autoFocus
              />

              <label className="block text-sm font-medium text-gray-700">Note (optional)</label>
              <input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />

              <div className="flex gap-2 pt-2">
                <button className="flex-1 bg-gray-500 hover:bg-gray-600 text-white rounded-lg px-4 py-2" onClick={() => setShowAdjustModal(false)}>
                  Cancel
                </button>
                <button
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2"
                  onClick={async () => {
                    const amt = Number(adjustAmount);
                    const { id: uid } = usuario || {};
                    if (!selectedClient?.id) return;
                    if (!amt || isNaN(amt) || amt <= 0) {
                      alert("Monto inválido");
                      return;
                    }
                    const { error } = await supabase.rpc("cxc_crear_ajuste_inicial", {
                      p_cliente_id: selectedClient.id,
                      p_monto: amt,
                      p_usuario_id: uid,
                      p_nota: adjustNote || null,
                    });
                    if (error) {
                      alert("Error: " + error.message);
                      return;
                    }
                    try {
                      const info = await getCxcCliente(selectedClient.id);
                      if (info) {
                        setCxcLimit(info.limite);
                        setCxcAvailable(info.disponible);
                        setCxcBalance(info.saldo);
                      }
                    } catch {}
                    setShowAdjustModal(false);
                    alert("✅ Opening balance saved");
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}