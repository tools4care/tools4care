// src/Ventas.jsx - PARTE 1 DE 3 (Imports, Constantes, Helpers)
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useToast } from "./hooks/useToast";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import { usePermisos } from "./hooks/usePermisos";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BarcodeScanner } from "./BarcodeScanner";
import QRCode from "qrcode"; // npm install qrcode
import { getClientHistory, evaluateCredit } from "./agents/creditAgent";
import { evaluarReglasCredito, generarPlanPago, buildPaymentAgreementSMS } from "./lib/creditRulesEngine";
import { getAcuerdosResumen, crearAcuerdo, aplicarPagoAAcuerdos, actualizarVencidas, getDiasDeudaMasVieja, isAgreementSystemAvailable } from "./lib/paymentAgreements";
import { getCxcCliente, subscribeClienteLimiteManual } from "./lib/cxc";
import { v4 as uuidv4 } from 'uuid';

import { usePendingSalesCloud } from "./hooks/usePendingSalesCloud";
import AgreementModal from "./components/AgreementModal";

import PaymentAgreementsPanel from "./components/PaymentAgreementsPanel";
import CreditRiskPanel from "./components/CreditRiskPanel";

import ClientPaymentView from "./components/ClientPaymentView";


// MODO OFFLINE
import { useOffline } from "./hooks/useOffline";
import { useSync } from "./hooks/useSync";
import { useSyncGlobal } from "./hooks/SyncContext";
import { NetworkIndicator } from "./components/NetworkIndicator";
import {
  guardarVentaOffline,
  guardarInventarioVan,
  obtenerInventarioVan,
  guardarTopProductos,
  obtenerTopProductos,
  obtenerClientesCache,
} from "./utils/offlineDB";

/* ========================= Config & Constantes ========================= */
const PAYMENT_METHODS = [
  { key: "efectivo",      label: "💵 Cash" },
  { key: "tarjeta",       label: "💳 Card" },
  { key: "transferencia", label: "🏦 Transfer" },
  { key: "otro",          label: "💰 Other" },
];

// Sub-methods shown when Transfer is selected (for cierre breakdown)
const TRANSFER_SUBS = [
  { key: "zelle",    label: "Zelle",     color: "bg-purple-600" },
  { key: "cashapp",  label: "Cash App",  color: "bg-green-600"  },
  { key: "venmo",    label: "Venmo",     color: "bg-blue-600"   },
  { key: "applepay", label: "Apple Pay", color: "bg-gray-800"   },
];

const STORAGE_KEY = "pending_sales";
const SECRET_CODE = "#ajuste2025";

// ============ CRÉDITO ROTATIVO — PAGO MÍNIMO ============
const PAGO_MINIMO_PCT   = 0.20;   // 20% del balance anterior
const PAGO_MINIMO_FIJO  = 30.00;  // o $30, lo que sea MAYOR
const PAGO_MINIMO_SKIP_SI_BALANCE_MENOR_A = 10; // si debe menos de $10, no exigir mínimo

function calcularPagoMinimo(balanceAnterior) {
  if (!balanceAnterior || balanceAnterior < PAGO_MINIMO_SKIP_SI_BALANCE_MENOR_A) return 0;
  // El mínimo nunca puede exceder lo que el cliente debe
  const minCalc = Math.max(balanceAnterior * PAGO_MINIMO_PCT, PAGO_MINIMO_FIJO);
  return Number(Math.min(balanceAnterior, minCalc).toFixed(2));
}

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
  console.log(`🗑️ Intentando eliminar venta pendiente: ${id}`);
  console.log(`📋 Ventas pendientes actuales:`, cur.map(v => v.id));
  
  const filtered = id ? cur.filter((x) => x.id !== id) : cur;
  writePendingLS(filtered);
  
  console.log(`✅ Ventas pendientes después de eliminar:`, filtered.map(v => v.id));
  
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

  // Use same anchor-click trick as SMS — avoids popup-blocker on iOS/Android
  const mailto = buildMailtoUrl(to, subject, text);
  if (mailto) {
    try {
      const a = document.createElement("a");
      a.href = mailto;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return { ok: true, via: "mailto" };
    } catch {
      // fall through to clipboard fallback
    }
  }
  if (text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Email copiado. Abre tu correo y pega el contenido.");
      return { ok: true, via: "mailto-copy" };
    } catch {
      return { ok: false, reason: "mailto_failed_and_clipboard_failed" };
    }
  }
  return { ok: false, reason: "mailto_failed" };
}

// Legacy — replaced by openChannelModal inside the component
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

/* ── Sale Block / Override Modal ── */
function SaleBlockModal({ type, message, onOverride, onCancel }) {
  const [note, setNote] = useState("");
  const isHard = type === "high_risk" || type === "credit_limit";
  const icon = type === "high_risk" ? "⛔" : type === "credit_limit" ? "🚫" : "⚠️";
  const color = isHard ? "red" : "amber";
  const headerBg = isHard ? "bg-red-700" : "bg-amber-600";
  const btnColor = isHard
    ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
    : "bg-amber-500 hover:bg-amber-600 focus:ring-amber-400";

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className={`${headerBg} text-white px-6 py-4`}>
          <div className="text-2xl mb-1">{icon} Sale Blocked</div>
          <div className="text-sm opacity-90 whitespace-pre-line">{message}</div>
        </div>
        <div className="p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Override reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Enter reason for approving this exception..."
            rows={3}
            autoFocus
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-400 focus:border-transparent outline-none resize-none"
          />
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => note.trim() && onOverride(note.trim())}
              disabled={!note.trim()}
              className={`flex-1 ${btnColor} text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-40 focus:outline-none focus:ring-2`}
            >
              Approve Exception
            </button>
            <button
              onClick={onCancel}
              className="px-5 py-3 border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Guest Contact Modal ── */
function GuestContactModal({ onConfirm, onSkip }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const canSend = phone.trim().length >= 7 || email.trim().includes("@");

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs mx-4">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Send Receipt</h3>
        <p className="text-sm text-gray-500 mb-5">
          No client on file. Enter the customer's contact to send them the receipt.
        </p>
        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone (SMS)</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(978) 000-0000"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="customer@email.com"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              onKeyDown={e => e.key === "Enter" && canSend && onConfirm({ telefono: phone.trim() || null, email: email.trim() || null })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm({ telefono: phone.trim() || null, email: email.trim() || null })}
            disabled={!canSend}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            Continue
          </button>
          <button
            onClick={onSkip}
            className="text-gray-500 hover:text-gray-700 font-semibold py-2 rounded-xl transition-colors border border-gray-200 hover:border-gray-300 text-sm"
          >
            Skip — don&apos;t send
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================= Componente Principal ========================= */
export default function Sales() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const { maxDescuentoPct, puedeCancelarVentas } = usePermisos();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, confirm: confirmDialog } = useToast();

  // ====================== AGENTE DE CRÉDITO ======================
  const [clientRisk, setClientRisk] = useState(null);
  const [clientBehavior, setClientBehavior] = useState(null);
  const [creditProfile, setCreditProfile] = useState(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [creditAvailableAfter, setCreditAvailableAfter] = useState(0);


// ===========================================================
//  FUNCIÓN PRINCIPAL DEL AGENTE DE CRÉDITO (CORREGIDA COMPLETA)
// ===========================================================
async function runCreditAgent(clienteId, montoVenta = 0) {
  try {
    if (!clienteId) return;
    setAgentLoading(true);

    // 1) Historial
    const history = await getClientHistory(clienteId);

    // 2) Perfil CxC
    const profile = await getCxcCliente(clienteId);

    setClientBehavior(history);
    setCreditProfile(profile);

    if (!profile) {
      setClientRisk(null);
      setCreditAvailableAfter(0);
      setAcuerdosResumen(null);
      setReglasCredito(null);
      setAgentLoading(false);
      return;
    }

    const limite = Number(String(profile.limite).replace(/[^0-9.-]+/g, ""));
    const saldo  = Number(String(profile.saldo).replace(/[^0-9.-]+/g, ""));
    const disponible = Math.max(0, limite - saldo);
    setCreditAvailableAfter(disponible);

    // 3) 🆕 Acuerdos de pago
    let acuerdos = null;
    let reglas = null;

    if (agreementSystemReady) {
      await actualizarVencidas(clienteId);
      acuerdos = await getAcuerdosResumen(clienteId);

      // 🔄 Auto-reconcile: si deuda en acuerdos > saldo CxC real,
      // significa que pagos fueron aplicados a CxC pero no a las cuotas
      const deudaAcuerdos = acuerdos ? Math.round(Number(acuerdos.deuda_en_acuerdos || 0) * 100) / 100 : 0;
      if (deudaAcuerdos > saldo + 0.01 && saldo >= 0) {
        const discrepancia = Math.round((deudaAcuerdos - saldo) * 100) / 100;
        console.log(`🔄 Reconciliando cuotas en venta: deuda=${deudaAcuerdos} cxc=${saldo} diff=${discrepancia}`);
        try {
          await aplicarPagoAAcuerdos(clienteId, discrepancia);
          acuerdos = await getAcuerdosResumen(clienteId); // recargar tras reconciliar
        } catch (recErr) {
          console.warn('⚠️ Error reconciliando cuotas:', recErr.message);
        }
      }

      setAcuerdosResumen(acuerdos);

      const diasDeuda = await getDiasDeudaMasVieja(clienteId);
      const montoPagando = payments.reduce((s, p) => s + Number(p.monto || 0), 0);

      reglas = evaluarReglasCredito({
        montoVenta: montoVenta || saleTotal,
        saldoActual: saldo,
        limiteBase: limite,
        diasDeuda,
        acuerdos,
        montoPagadoAhora: montoPagando,
      });
      setReglasCredito(reglas);
    }

    // 4) Scoring
    const risk = evaluateCredit({
      saldo,
      limite,
      diasRetraso: profile.diasRetraso || 0,
      montoVenta: montoVenta || saleTotal,
      historialVentas: history.ventasDetalles || [],
      historialPagos: history.pagosDetalles || [],
      lastSaleDate: profile.lastSaleDate || history.lastSaleDate || null,
      acuerdosResumen: acuerdos,
      reglasCredito: reglas,
    });

    setClientRisk(risk);
  } catch (err) {
    console.error("Error en runCreditAgent:", err);
  } finally {
    setAgentLoading(false);
  }
}

  // HOOKS MODO OFFLINE
  const { isOffline } = useOffline();
  const { sincronizar, ventasPendientes: ventasPendientesLocal } = useSync();

  // Usar el sync global (ya activo en LayoutPrivado — no crear instancia duplicada)
  const {
    syncing: syncingData,
    lastSync,
    ventasPendientes: ventasPendientesSync,
    syncError,
    sincronizarAhora,
  } = useSyncGlobal();

  const ventasPendientes = ventasPendientesSync || ventasPendientesLocal;
// 🆕 PENDING SALES EN LA NUBE (reemplaza localStorage)  // <--- AGREGA //
  const {
    pendingSales: cloudPendingSales,
    loading: cloudPendingLoading,
    stats: pendingStats,
    deviceInfo,
    createPendingSale,
    updatePendingSale,
    upsertPendingSale,
    takePendingSale,
    releasePendingSale,
    completePendingSale,
    cancelPendingSale,
    deletePendingSale,
    refresh: refreshPendingSales,
    forceTakePendingSale,
  } = usePendingSalesCloud();
  /* ---- Estado base ---- */
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");
  const [clientLoading, setClientLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [focusedClientIdx, setFocusedClientIdx] = useState(-1);  // keyboard nav – client list
  const clientListRef = useRef(null);                            // scroll target – client list
  const [focusedProductIdx, setFocusedProductIdx] = useState(-1); // keyboard nav – product list
  const productListRef = useRef(null);                             // scroll target – product list

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
  const [productExistsNotInVan, setProductExistsNotInVan] = useState("");
  const [pendingStockIssues, setPendingStockIssues] = useState([]); // items del pendiente con stock insuficiente
  const [discountTarget, setDiscountTarget] = useState(null); // producto_id with open discount input
  const [discountInputVal, setDiscountInputVal] = useState("");

  const [payments, setPayments] = useState([{ forma: "efectivo", monto: 0 }]);
  const [paymentError, setPaymentError] = useState("");
  const [saving, setSaving] = useState(false);

  // Tax toggle per sale (Option A)
  const [taxEnabled, setTaxEnabled] = useState(false);


  // pendingSales ahora viene del hook cloudPendingSales
  const pendingSales = cloudPendingSales;
  const [modalPendingSales, setModalPendingSales] = useState(false);
  
  // ID de la venta pendiente actual en la nube
  const [currentCloudPendingId, setCurrentCloudPendingId] = useState(null);


  // 🆕 DEVOLUCIONES: Estados nuevos
const [appMode, setAppMode] = useState('venta'); // 'venta' | 'devolucion'
const [clientSalesHistory, setClientSalesHistory] = useState([]); // Lista de facturas
const [selectedInvoice, setSelectedInvoice] = useState(null); // Factura seleccionada
const [returnQuantities, setReturnQuantities] = useState({}); // { detalle_id: cantidad }
const [returnReason, setReturnReason] = useState("");
const [processingReturn, setProcessingReturn] = useState(false);


  const [step, setStep] = useState(1);

 const [clientHistory, setClientHistory] = useState({
  has: false,
  ventas: 0,
  pagos: 0,
  loading: false,
  lastSaleDate: null, // 🆕 NUEVO
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
  const [savingAdjust, setSavingAdjust] = useState(false);
  // ---- UI
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [invTick, setInvTick] = useState(0);
  const reloadInventory = () => setInvTick(n => n + 1);

  const [searchingInDB, setSearchingInDB] = useState(false);


  // ---- STRIPE QR Estados
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQRCodeData] = useState(null);
  const [qrPaymentIntent, setQRPaymentIntent] = useState(null);
  const [qrAmount, setQRAmount] = useState(0);
  const [qrPaymentIndex, setQRPaymentIndex] = useState(null);
  const [qrPollingActive, setQRPollingActive] = useState(false);
  const qrPollingIntervalRef = useRef(null);
 // 🆕 AGREGAR ESTO: Referencia para el timer del auto-save
  const autoSaveTimerRef = useRef(null);
  // Ref para el input de búsqueda de productos (focus management)
  const productSearchRef = useRef(null);
  // Ref para nota de excepción (override de bloqueo de venta)
  const saleOverrideRef = useRef(null);
  // 🆕 ESTADOS PARA FEE DE TARJETA
  const [applyCardFee, setApplyCardFee] = useState({});
  const [cardFeePercentage, setCardFeePercentage] = useState(3);

  // ---- ACUERDOS DE PAGO
const [acuerdosResumen, setAcuerdosResumen] = useState(null);
const [reglasCredito, setReglasCredito] = useState(null);
const [showAgreementModal, setShowAgreementModal] = useState(false);
const [agreementPlan, setAgreementPlan] = useState(null);
const [showBalanceSummary, setShowBalanceSummary] = useState(false);
const [showFifo, setShowFifo] = useState(false);
const [agreementException, setAgreementException] = useState(false);
const [agreementExceptionNote, setAgreementExceptionNote] = useState("");
const [agreementSystemReady, setAgreementSystemReady] = useState(false);
const [pendingAgreementData, setPendingAgreementData] = useState(null);

  // ---- CHANNEL SELECTION MODAL (receipt send)
  const [channelModal, setChannelModal] = useState(null); // { hasPhone, hasEmail, resolve }

  // ---- GUEST CONTACT MODAL (venta sin cliente)
  const [guestContactModal, setGuestContactModal] = useState(null); // { resolve }

  // ---- SALE BLOCK / OVERRIDE MODAL
  const [saleBlockModal, setSaleBlockModal] = useState(null); // { type, message, resolve }

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

  /* ---------- Handle ?new=1 — start a fresh sale ---------- */
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      clearSale();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* ---------- Debounce del buscador de cliente ---------- */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedClientSearch(clientSearch.trim()), 150);
    return () => clearTimeout(t);
  }, [clientSearch]);

  /* ---------- Reset keyboard focus when search query changes ---------- */
  useEffect(() => { setFocusedClientIdx(-1); }, [debouncedClientSearch]);

  /* ---------- Scroll focused client item into view ---------- */
  useEffect(() => {
    if (focusedClientIdx >= 0 && clientListRef.current) {
      const el = clientListRef.current.querySelector(`[data-client-idx="${focusedClientIdx}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedClientIdx]);

  /* ---------- Reset product keyboard focus when product search changes ---------- */
  useEffect(() => { setFocusedProductIdx(-1); }, [productSearch]);

  /* ---------- Scroll + focus the product item so ↑↓ keep working ---------- */
  useEffect(() => {
    if (focusedProductIdx >= 0 && productListRef.current) {
      const el = productListRef.current.querySelector(`[data-product-idx="${focusedProductIdx}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el?.focus(); // give it real DOM focus so onKeyDown fires on subsequent arrows
    }
  }, [focusedProductIdx]);


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
// Verificar si el sistema de acuerdos está disponible
useEffect(() => {
  isAgreementSystemAvailable().then(setAgreementSystemReady);
}, []);

// Verificar si el sistema de acuerdos está disponible
  useEffect(() => {
    isAgreementSystemAvailable().then(setAgreementSystemReady);
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

      // ✅ OFFLINE: buscar en cache local si no hay conexión
      if (isOffline) {
        try {
          const cachedClientes = await obtenerClientesCache();
          if (cachedClientes.length > 0) {
            const termLower = term.toLowerCase();
            const resultados = cachedClientes.filter(c =>
              (c.nombre || '').toLowerCase().includes(termLower) ||
              (c.negocio || '').toLowerCase().includes(termLower) ||
              (c.telefono || '').toLowerCase().includes(termLower)
            ).slice(0, 20);
            setClients(resultados);
            console.log(`📵 Búsqueda offline: ${resultados.length} clientes encontrados`);
          } else {
            setClients([]);
            console.warn('📵 No hay cache de clientes disponible');
          }
        } catch (e) {
          console.error('Error buscando en cache offline:', e);
          setClients([]);
        }
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

        setClients(Array.isArray(enriched) ? enriched : []);

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
      setClientHistory({ has: false, ventas: 0, pagos: 0, loading: false, lastSaleDate: null });
      return;
    }
    
// 🆕 DEVOLUCIONES: Si estamos en modo devolución, cargar facturas con tracking de devoluciones
if (appMode === 'devolucion') {
  try {
    // Paso 1: Obtener ventas del cliente (SOLO tipo 'venta', no devoluciones)
    const { data: ventasData, error: ventasError } = await supabase
      .from('ventas')
      .select('id, created_at, total, estado_pago')
      .eq('cliente_id', id)
      .eq('van_id', van.id)
      .eq('tipo', 'venta')  // 🔴 FIX: Solo ventas originales
      .order('created_at', { ascending: false })
      .limit(10);

    if (ventasError) throw ventasError;

    if (!ventasData || ventasData.length === 0) {
      setClientSalesHistory([]);
      return;
    }

    const ventaIds = ventasData.map(v => v.id);

    // Paso 2: Obtener detalles de las ventas
    const { data: detallesData, error: detallesError } = await supabase
      .from('detalle_ventas')
      .select('id, venta_id, cantidad, precio_unitario, producto_id')
      .in('venta_id', ventaIds);

    if (detallesError) throw detallesError;

    // Paso 3: Obtener información de productos
    const productoIds = [...new Set(detallesData?.map(d => d.producto_id).filter(Boolean))];
    const { data: productosData } = await supabase
      .from('productos')
      .select('id, nombre')
      .in('id', productoIds);

    const productosMap = new Map(productosData?.map(p => [p.id, p]) || []);

    // 🆕 Paso 4: Obtener cantidades ya devueltas de cada item
    let devolucionesMap = new Map(); // detalle_venta_id -> cantidad_devuelta
    try {
      const { data: devData } = await supabase
        .from('devoluciones_detalle')
        .select('detalle_venta_id, cantidad_devuelta')
        .in('venta_origen_id', ventaIds);

      if (devData) {
        for (const row of devData) {
          const prev = devolucionesMap.get(row.detalle_venta_id) || 0;
          devolucionesMap.set(row.detalle_venta_id, prev + row.cantidad_devuelta);
        }
      }
    } catch {
      // Tabla devoluciones_detalle no existe aún — ignorar silenciosamente
      console.warn('Tabla devoluciones_detalle no disponible aún');
    }

    // 🆕 Paso 5: Obtener total ya devuelto por cada venta
    let devolucionesPorVenta = new Map();
    try {
      const { data: devVentasData } = await supabase
        .from('ventas')
        .select('venta_origen_id, total')
        .eq('tipo', 'devolucion')
        .in('venta_origen_id', ventaIds);

      if (devVentasData) {
        for (const row of devVentasData) {
          const prev = devolucionesPorVenta.get(row.venta_origen_id) || 0;
          devolucionesPorVenta.set(row.venta_origen_id, prev + Number(row.total));
        }
      }
    } catch {
      console.warn('No se pudieron obtener devoluciones previas');
    }

    // Paso 6: Construir objeto final con tracking de devoluciones
    const ventasConDetalles = ventasData.map(venta => {
      const detalles = (detallesData || [])
        .filter(d => d.venta_id === venta.id)
        .map(d => {
          const cantidadDevuelta = devolucionesMap.get(d.id) || 0;
          return {
            id: d.id,
            cantidad: d.cantidad,
            cantidad_devuelta: cantidadDevuelta,
            cantidad_disponible: d.cantidad - cantidadDevuelta,
            precio_unitario: d.precio_unitario,
            producto_id: d.producto_id,
            productos: {
              id: d.producto_id,
              nombre: productosMap.get(d.producto_id)?.nombre || 'Producto eliminado',
            },
          };
        });

      const totalDevuelto = devolucionesPorVenta.get(venta.id) || 0;

      return {
        ...venta,
        detalle_ventas: detalles,
        total_devuelto: totalDevuelto,
        tiene_devoluciones: totalDevuelto > 0,
      };
    });

    setClientSalesHistory(ventasConDetalles);
  } catch (err) {
    console.error("Error fetch history (returns):", err);
    setClientSalesHistory([]);
  }
  return; // Detener flujo normal
}

    // === FLUJO NORMAL DE VENTA (Tu código existente) ===
    setClientHistory((h) => ({ ...h, loading: true }));
    
    const [{ count: vCount }, { count: pCount }, { data: lastSale }] = await Promise.all([
      supabase.from("ventas").select("id", { count: "exact", head: true }).eq("cliente_id", id),
      supabase.from("pagos").select("id", { count: "exact", head: true }).eq("cliente_id", id),
      supabase.from("ventas").select("created_at").eq("cliente_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    ]);
    
    const has = (vCount || 0) > 0 || (pCount || 0) > 0;
    const lastSaleDate = lastSale?.created_at || null;
    
    setClientHistory({ has, ventas: vCount || 0, pagos: pCount || 0, loading: false, lastSaleDate });
  }
  fetchHistory();
}, [selectedClient?.id, appMode, van?.id]); // 🆕 AGREGAR 'appMode' Y 'van?.id' a las dependencias

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
sub = subscribeClienteLimiteManual(selectedClient.id, refreshCxC);
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

    // 🆕 Si está offline, intentar cargar desde caché
    if (isOffline) {
      console.log('📵 Offline: Cargando productos desde caché...');
      // Cargar inventario completo de la van (para búsquedas offline)
      const cachedInventory = await obtenerInventarioVan(van.id);
      if (cachedInventory.length > 0) {
        setAllProducts(cachedInventory);
        setProductsLoaded(true);
        setTopProducts(cachedInventory.slice(0, 50)); // mostrar primeros 50 como "top"
        console.log(`✅ ${cachedInventory.length} productos cargados desde caché (inventario completo)`);
        return;
      }
      // Fallback a top productos si no hay inventario completo
      const cachedProducts = await obtenerTopProductos(van.id);
      if (cachedProducts.length > 0) {
        setTopProducts(cachedProducts);
        setAllProducts(cachedProducts);
        setProductsLoaded(true);
        console.log(`✅ ${cachedProducts.length} top productos cargados desde caché`);
        return;
      }
      setProductError("📵 Sin conexión y no hay productos en caché. Conecta internet para cargar productos.");
      return;
    }

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

        setTopProducts(Array.isArray(rows) ? rows : []);

        // 🆕 Guardar en caché para uso offline
        await guardarTopProductos(van.id, rows);
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
        // 🆕 Guardar en caché para uso offline
        await guardarTopProductos(van.id, rows);
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
      // 🆕 Guardar en caché para uso offline
      await guardarTopProductos(van.id, rows);
    } catch (err) {
      console.error("Todos los fallbacks de TOP fallaron:", err?.message || err);
      setTopProducts([]);
      setProductError("No se pudieron cargar los productos (TOP).");
    }
  }

  loadTopProducts();
}, [van?.id, invTick, isOffline]);

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

    // 🆕 Si está offline, cargar desde caché
    if (isOffline) {
      console.log('📵 Offline: Cargando inventario completo desde caché...');
      const cachedInventory = await obtenerInventarioVan(van.id);
      if (cachedInventory.length > 0) {
        setAllProducts(cachedInventory);
        setProductsLoaded(true);
        setAllProductsLoading(false);
        console.log(`✅ ${cachedInventory.length} productos cargados desde caché (inventario completo)`);
        return;
      } else {
        console.warn('⚠️ No hay inventario completo en caché');
        setAllProducts([]);
        setProductsLoaded(false);
        setAllProductsLoading(false);
        return;
      }
    }

    try {
      const { data, error } = await supabase
        .from("stock_van")
        .select("producto_id,cantidad, productos:productos!inner(id,nombre,precio,codigo,marca,descuento_pct,bulk_min_qty,bulk_unit_price)")
        .eq("van_id", van.id)
        .gt("cantidad", 0)
        .order("nombre", { ascending: true, foreignTable: "productos" })
        .limit(500);

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
          descuento_pct: row.productos?.descuento_pct ?? null,
          bulk_min_qty: row.productos?.bulk_min_qty ?? null,
          bulk_unit_price: row.productos?.bulk_unit_price ?? null,
        },
      }));
      
      setAllProducts(Array.isArray(rows) ? rows : []);

      setProductsLoaded(true);
      setAllProductsLoading(false);
      
      // 🆕 Guardar inventario completo en caché
      await guardarInventarioVan(van.id, rows);
      console.log(`✅ ${rows.length} productos guardados en caché (inventario completo)`);
      
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
}, [van?.id, productSearch, invTick, productsLoaded, allProducts.length, isOffline]);

  useEffect(() => {
    if (step === 2) reloadInventory();
  }, [step]);

  /* ---------- Filtro del buscador ---------- */
 useEffect(() => {
  const filter = productSearch.trim().toLowerCase();
  const searchActive = filter.length > 0;

  if (!searchActive) {
    setProducts(topProducts.filter(r => Number(r.cantidad ?? r.stock ?? 0) > 0));
    setNoProductFound("");
    setProductExistsNotInVan("");
    return;
  }

  // ── MODO OFFLINE: buscar solo en caché (allProducts ya cargado) ──
  if (isOffline) {
    const source = allProducts.length > 0 ? allProducts : topProducts;
    const filterVariants = [filter];
    const withoutZeros = filter.replace(/^0+/, '');
    if (withoutZeros && withoutZeros !== filter) filterVariants.push(withoutZeros);
    if (!filter.startsWith('0')) filterVariants.push('0' + filter);

    const results = source.filter(r => {
      const p = r.productos || r;
      const nombre = (p.nombre || r.nombre || "").toLowerCase();
      const codigo = (p.codigo || r.codigo || "").toLowerCase();
      const marca  = (p.marca  || r.marca  || "").toLowerCase();
      return filterVariants.some(v =>
        nombre.includes(v) || codigo.includes(v) || marca.includes(v)
      );
    }).filter(r => Number(r.cantidad ?? r.stock ?? 0) > 0);

    setProducts(results);
    setNoProductFound(results.length === 0 ? filter : "");
    setProductExistsNotInVan("");
    return;
  }

  async function searchInDatabase() {
    if (!van?.id) return;

    setSearchingInDB(true);
    try {
      // Generar variantes del código para búsqueda flexible
      const filterVariants = [];
      filterVariants.push(filter);
      
      const withoutZeros = filter.replace(/^0+/, '');
      if (withoutZeros && withoutZeros !== filter) {
        filterVariants.push(withoutZeros);
      }
      
      if (!filter.startsWith('0')) {
        filterVariants.push('0' + filter);
      }
      
      if (!filter.startsWith('00')) {
        filterVariants.push('00' + filter);
      }

      const codigoConditions = filterVariants
        .map(v => `codigo.ilike.%${v}%`)
        .join(',');

      const { data, error } = await supabase
        .from("stock_van")
        .select(`
          producto_id,
          cantidad,
          productos:productos!inner(
            id,
            nombre,
            precio,
            codigo,
            marca,
            descuento_pct,
            bulk_min_qty,
            bulk_unit_price
          )
        `)
        .eq("van_id", van.id)
        .gt("cantidad", 0)
        .or(
          `nombre.ilike.%${filter}%,${codigoConditions},marca.ilike.%${filter}%`,
          { foreignTable: 'productos' }
        )
        .limit(50);

      if (error) {
        console.error("Error buscando productos:", error);
        
        const { data: stockData } = await supabase
          .from("stock_van")
          .select("producto_id, cantidad")
          .eq("van_id", van.id)
          .gt("cantidad", 0);

        if (stockData) {
          const productIds = stockData.map(s => s.producto_id);
          
          const { data: productsData } = await supabase
            .from("productos")
            .select("id, nombre, precio, codigo, marca, descuento_pct, bulk_min_qty, bulk_unit_price")
            .in("id", productIds)
            .or(`nombre.ilike.%${filter}%,${codigoConditions},marca.ilike.%${filter}%`);

          if (productsData) {
            const stockMap = new Map(stockData.map(s => [s.producto_id, s.cantidad]));
            
            const results = productsData.map(p => ({
              producto_id: p.id,
              cantidad: stockMap.get(p.id) || 0,
              productos: p,
              nombre: p.nombre,
              precio: p.precio,
              codigo: p.codigo,
              marca: p.marca
            }));

            setProducts(results);
            setNoProductFound(results.length === 0 ? filter : "");
            setProductExistsNotInVan("");
            return;
          }
        }

        setProducts([]);
        setNoProductFound(filter);
        setProductExistsNotInVan("");
        return;
      }

      if (data && data.length > 0) {
        const results = data.map(row => ({
          producto_id: row.producto_id,
          cantidad: Number(row.cantidad || 0),
          productos: row.productos,
          nombre: row.productos?.nombre || "",
          precio: Number(row.productos?.precio || 0),
          codigo: row.productos?.codigo || "",
          marca: row.productos?.marca || ""
        }));

        setProducts(results);
        setNoProductFound("");
        setProductExistsNotInVan("");
      } else {
        // No está en el inventario de la van — verificar si el producto existe en BD
        setProducts([]);
        const codigoConditionsCheck = filterVariants.map(v => `codigo.ilike.%${v}%`).join(',');
        const { data: prodCheck } = await supabase
          .from("productos")
          .select("id")
          .or(`nombre.ilike.%${filter}%,${codigoConditionsCheck},marca.ilike.%${filter}%`)
          .limit(1);

        if (prodCheck && prodCheck.length > 0) {
          // Existe en BD pero no en esta van (o sin stock)
          setProductExistsNotInVan(filter);
          setNoProductFound("");
        } else {
          // Realmente no existe
          setNoProductFound(filter);
          setProductExistsNotInVan("");
        }
      }
    } catch (err) {
      console.error("Error en búsqueda:", err);
      setProducts([]);
      setNoProductFound(filter);
      setProductExistsNotInVan("");
    } finally {
      setSearchingInDB(false);
    }
  }

 const timer = setTimeout(() => {
  searchInDatabase();
}, 200);

  return () => clearTimeout(timer);
}, [productSearch, van?.id, topProducts, isOffline, allProducts]);

  /* ---------- Totales & crédito ---------- */
  // useMemo: referencia estable — evita recalcular cuando cambia estado no relacionado
  const cartSafe = useMemo(() => Array.isArray(cart) ? cart : [], [cart]);

  // 🆕 AUTO-SAVE: PEGAR EL BLOQUE AQUÍ
  useEffect(() => {
    // Limpiar timer anterior
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    const hasMeaning =
      cartSafe.length > 0 ||
      payments.some((p) => Number(p.monto) > 0) ||
      (notes && notes.trim().length > 0);

    // No guardar si no hay cliente, no hay datos significativos, o ya terminamos
    if (!selectedClient || !hasMeaning || step >= 4) return;

    // Debounce de 2 segundos para no bombardear la DB
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const saleData = {
          client: selectedClient,
          cart: cartSafe,
          payments,
          notes,
          step,
        };

        const saved = await upsertPendingSale(currentCloudPendingId, saleData);

        if (saved?.id && saved.id !== currentCloudPendingId) {
          setCurrentCloudPendingId(saved.id);
        }
      } catch (err) {
        console.warn('Auto-save to cloud failed:', err.message);
        // No mostrar error al usuario, es background save
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [selectedClient?.id, cartSafe.length, payments, notes, step]);

  // useMemo: solo recalcula cuando el carrito o pagos cambian
  const saleTotal = useMemo(
    () => cartSafe.reduce((t, p) => t + p.cantidad * p.precio_unitario, 0),
    [cartSafe]
  );
  const paid = useMemo(
    () => payments.reduce((s, p) => s + Number(p.monto || 0), 0),
    [payments]
  );

  // Tax calculation — reads config from TaxConfig localStorage key
  const taxConfig = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("tools4care_tax_config") || "{}"); }
    catch { return {}; }
  }, []);
  const taxRate     = Number(taxConfig.rate ?? 0);
  const taxName     = taxConfig.name || "Tax";
  const taxIncluded = taxConfig.taxIncluded ?? false;
  const taxAmount   = useMemo(() => {
    if (!taxEnabled || taxRate === 0) return 0;
    if (taxIncluded) {
      // tax is already baked into the price — extract it
      return Number((saleTotal - saleTotal / (1 + taxRate / 100)).toFixed(2));
    }
    return Number((saleTotal * (taxRate / 100)).toFixed(2));
  }, [taxEnabled, saleTotal, taxRate, taxIncluded]);
  // Grand total visible to the customer (only changes when not tax-included)
  const saleTotalWithTax = useMemo(() => {
    if (!taxEnabled || taxIncluded) return saleTotal;
    return Number((saleTotal + taxAmount).toFixed(2));
  }, [taxEnabled, saleTotal, taxAmount, taxIncluded]);

  // useMemo: 20 valores financieros derivados en un solo bloque.
  // Solo recalcula cuando cambian: carrito, pagos, balance CxC, o cliente.
  // Antes recalculaban en CADA render (al abrir QR, escribir nota, etc.)
  const {
    balanceBefore, oldDebt, totalAPagar,
    paidToOldDebt, paidForSale, paidApplied,
    pagoMinimo, cubrioMinimo, faltaParaMinimo,
    change, mostrarAdvertencia, balanceAfter, amountToCredit,
    clientScore, showCreditPanel, computedLimit,
    creditLimit, creditAvailable, excesoCredito,
  } = useMemo(() => {
    const balanceBeforeRaw =
      cxcBalance != null && !Number.isNaN(Number(cxcBalance))
        ? Number(cxcBalance)
        : Number(getClientBalance(selectedClient));
    const balanceBefore = Math.max(0, Number.isFinite(balanceBeforeRaw) ? balanceBeforeRaw : 0);
    const oldDebt       = balanceBefore;
    const totalAPagar   = oldDebt + saleTotalWithTax;

    // FIFO: primero se paga la deuda vieja, luego la venta nueva
    const paidToOldDebt = Math.min(paid, oldDebt);
    const paidForSale   = Math.min(saleTotalWithTax, Math.max(0, paid - paidToOldDebt));
    const paidApplied   = paidToOldDebt + paidForSale;

    // Pago mínimo requerido esta visita
    const pagoMinimo      = calcularPagoMinimo(oldDebt);
    const cubrioMinimo    = pagoMinimo === 0 || paid >= pagoMinimo;
    const faltaParaMinimo = Math.max(0, pagoMinimo - paid);

    const change             = Math.max(0, paid - totalAPagar);
    const mostrarAdvertencia = paid > totalAPagar;

    const balanceAfter   = Math.max(0, balanceBefore + saleTotalWithTax - paidApplied);
    const amountToCredit = Math.max(0, balanceAfter - balanceBefore);

    const clientScore    = Number(selectedClient?.score_credito ?? 600);
    const showCreditPanel = !!selectedClient && !!selectedClient.id &&
                            (clientHistory.has || balanceBefore !== 0);
    const computedLimit  = policyLimit(clientScore);
    const creditLimit    = showCreditPanel ? Number(cxcLimit ?? computedLimit) : 0;
    const creditAvailable = showCreditPanel
      ? Number(
          cxcAvailable != null && !Number.isNaN(Number(cxcAvailable))
            ? cxcAvailable
            : Math.max(0, creditLimit - balanceBefore)
        )
      : 0;
    const excesoCredito = amountToCredit > creditAvailable ? amountToCredit - creditAvailable : 0;

    return {
      balanceBefore, oldDebt, totalAPagar,
      paidToOldDebt, paidForSale, paidApplied,
      pagoMinimo, cubrioMinimo, faltaParaMinimo,
      change, mostrarAdvertencia, balanceAfter, amountToCredit,
      clientScore, showCreditPanel, computedLimit,
      creditLimit, creditAvailable, excesoCredito,
    };
  }, [saleTotalWithTax, paid, cxcBalance, selectedClient, cxcLimit, cxcAvailable, clientHistory.has]);


  /* ---------- 🔧 AUTO-FILL del monto de pago (MEJORADO) ---------- */
useEffect(() => {
  // Resetear auto-fill cuando cambia el total de la venta
  if (step === 3 && totalAPagar > 0 && payments.length === 1) {
    const currentPayment = Number(payments[0].monto);
    
    // Si el pago actual es diferente al total a pagar, resetear auto-fill
    if (paymentAutoFilled && Math.abs(currentPayment - saleTotal) > 0.01) {
      setPaymentAutoFilled(false);
    }
  }

  // 🆕 MEJORADO: Auto-fill solo si NO se ha tocado el campo manualmente
  if (
    step === 3 && 
    totalAPagar > 0 && 
    !paymentAutoFilled && 
    payments.length === 1 && 
    Number(payments[0].monto) === 0
  ) {
    // ⚠️ VERIFICAR: Solo auto-fill si acabamos de entrar al paso 3
    // y el campo nunca ha sido tocado manualmente
    const roundedTotal = Number(saleTotalWithTax.toFixed(2));
    setPayments([{ ...payments[0], monto: roundedTotal }]);
    setPaymentAutoFilled(true);
  }

  // Resetear auto-fill al salir del paso 3
  if (step !== 3 && paymentAutoFilled) {
    setPaymentAutoFilled(false);
  }

  // Resetear auto-fill cuando se agrega un segundo método de pago
  if (step === 3 && paymentAutoFilled && payments.length > 1) {
    setPaymentAutoFilled(false);
  }
}, [step, totalAPagar, payments.length, paymentAutoFilled, saleTotalWithTax]);
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
  // Limpiar búsquedas y listas
  setClientSearch("");
  setClients([]);
  setSelectedClient(null);
  setProductSearch("");
  setProducts([]);
  setTopProducts([]);
  setAllProducts([]);
  setNotes("");
  
  // Limpiar pagos
  setPayments([{ forma: "efectivo", monto: 0 }]);
  setPaymentError("");
  
  // Limpiar estados de guardado
  setSaving(false);
  
  // Volver al paso 1
  setStep(1);
  
 setCurrentCloudPendingId(null);
  
  // Limpiar fees
  setApplyCardFee({});
  
  // Resetear auto-fill
  setPaymentAutoFilled(false);

  // Limpiar acuerdos
  setAcuerdosResumen(null);
  setReglasCredito(null);
  setAgreementPlan(null);
  setAgreementException(false);
  setAgreementExceptionNote("");
  setPendingAgreementData(null);

  // Limpiar override de excepción
  saleOverrideRef.current = null;
  
  // Limpiar cart
  setCart([]);
  setPendingStockIssues([]);
    // 🆕 DEVOLUCIONES: Resetear modo
  setAppMode('venta');
  setClientSalesHistory([]);
  setSelectedInvoice(null);
  setReturnQuantities({});
  setReturnReason("");
}

  function openChannelModal({ hasPhone, hasEmail }) {
    return new Promise((resolve) => {
      if (!hasPhone && !hasEmail) return resolve(null);
      setChannelModal({ hasPhone, hasEmail, resolve });
    });
  }

  function openGuestContactModal() {
    return new Promise((resolve) => {
      setGuestContactModal({ resolve });
    });
  }

  function openSaleBlockModal(type, message) {
    return new Promise((resolve) => {
      setSaleBlockModal({ type, message, resolve });
    });
  }

  async function requestAndSendNotifications({ client, payload }) {
    let effectiveClient = client;

    // Quick Sale sets client to { id: null, nombre: "Quick sale" } — treat as no-client
    if (!effectiveClient?.id) {
      const guestContact = await openGuestContactModal();
      if (!guestContact) return; // user skipped
      effectiveClient = { telefono: guestContact.telefono || null, email: guestContact.email || null };
    }

    const hasPhone = !!effectiveClient.telefono;
    const hasEmail = !!effectiveClient.email;

    const subject = `${COMPANY_NAME} — Receipt ${new Date().toLocaleDateString()}`;
    const text = composeReceiptMessageEN(payload);
    const html = text;

    const wants = await openChannelModal({ hasPhone, hasEmail });
    if (!wants) return;

    try {
      if (wants === "sms" && hasPhone) {
        await sendSmsIfPossible({ phone: effectiveClient.telefono, text });
      } else if (wants === "email" && hasEmail) {
        await sendEmailSmart({ to: effectiveClient.email, subject, html, text });
      }
    } catch (e) {
      console.warn("Receipt send error:", e?.message || e);
    }
  }

  // useCallback: referencia estable — evita que botones del carrito re-renderizen
  // sin necesidad cuando cambia estado no relacionado (QR modal, notas, etc.)
  const handleAddProduct = useCallback((p) => {
    const stockNow = Number(p.cantidad ?? p.stock ?? 0);
    if (!Number.isFinite(stockNow) || stockNow <= 0) {
      setProductError("Sin stock disponible para este producto.");
      return;
    }
    const meta = extractPricingFromRow(p);
    const unit = computeUnitPriceFromRow(p, 1);
    const safeName = p.productos?.nombre ?? p.nombre ?? "—";
    // Functional updater: evita capturar cartSafe stale
    setCart((prevCart) => {
      const safe = Array.isArray(prevCart) ? prevCart : [];
      if (safe.find((x) => x.producto_id === p.producto_id)) return prevCart;
      return [...safe, {
        producto_id: p.producto_id,
        nombre: safeName,
        _pricing: { ...meta, base: meta.base || unit || 0 },
        precio_unitario: unit,
        cantidad: 1,
      }];
    });
    setProductSearch("");
    setTimeout(() => productSearchRef.current?.focus(), 50);
  }, []); // setCart/setProductError/setProductSearch son estables (useState)

  const handleEditQuantity = useCallback((producto_id, cantidad) => {
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
  }, []); // functional updater — no captura estado externo

  const handleRemoveProduct = useCallback((producto_id) => {
    setCart((cart) => cart.filter((p) => p.producto_id !== producto_id));
  }, []); // functional updater — no captura estado externo

  const handleSetDescuento = useCallback((producto_id, pct) => {
    const rawPct = Number(pct) || 0;
    if (rawPct > maxDescuentoPct) {
      alert(`Max discount allowed: ${maxDescuentoPct}%. Contact an admin for larger discounts.`);
      setDiscountInputVal(String(maxDescuentoPct));
      return;
    }
    const pctNum = Math.max(0, Math.min(100, rawPct));
    setCart((cart) =>
      cart.map((item) => {
        if (item.producto_id !== producto_id) return item;
        const base = Number(item._pricing?.base || item.precio_unitario) || 0;
        const newPrice = pctNum > 0 ? Number((base * (1 - pctNum / 100)).toFixed(2)) : base;
        return { ...item, precio_unitario: newPrice, _manualDescuento: pctNum };
      })
    );
    setDiscountTarget(null);
    setDiscountInputVal("");
  }, [maxDescuentoPct]); // recrea solo cuando cambia el permiso de descuento

  const handleChangePayment = useCallback((index, field, value) => {
    setPayments((arr) => arr.map((p, i) => {
      if (i !== index) return p;
      if (field === "monto") {
        if (value === '' || value === '.' || value === '0' || value === 0) {
          return { ...p, [field]: 0 };
        }
        const numValue = Number(value);
        if (Number.isFinite(numValue) && numValue >= 0) {
          return { ...p, [field]: numValue };
        }
        return p;
      }
      return { ...p, [field]: value };
    }));
  }, []); // functional updater — no captura estado externo

  const handleAddPayment = useCallback(() => {
    setPayments((prevPayments) => {
      const alreadyPaid = prevPayments.reduce((sum, p) => sum + Number(p.monto || 0), 0);
      const remaining = Math.max(0, totalAPagar - alreadyPaid);
      const initialAmount = prevPayments.length === 0 ? saleTotal : remaining;
      const roundedAmount = Number(initialAmount.toFixed(2));
      return [...prevPayments, { forma: "efectivo", monto: roundedAmount }];
    });
  }, [saleTotal, totalAPagar]); // saleTotal ya es memoized; totalAPagar depende de él

  const handleRemovePayment = useCallback((index) => {
    setPayments((ps) => (ps.length === 1 ? ps : ps.filter((_, i) => i !== index)));
  }, []); // functional updater — no captura estado externo

  const handleBarcodeScanned = useCallback((code) => {
    setProductSearch(code.trim());
    setShowScanner(false);
    setTimeout(() => productSearchRef.current?.focus(), 150);
  }, []); // productSearchRef es estable (useRef)

 // Verifica si los productos del pendiente tienen stock suficiente en la van
  async function checkPendingCartStock(cartItems, vanId) {
    if (!cartItems?.length || !vanId) return;
    const ids = cartItems.map(i => i.producto_id).filter(Boolean);
    if (!ids.length) return;

    const { data, error } = await supabase
      .from("stock_van")
      .select("producto_id, cantidad")
      .eq("van_id", vanId)
      .in("producto_id", ids);

    if (error || !data) return;

    const stockMap = new Map(data.map(r => [r.producto_id, Number(r.cantidad || 0)]));

    const issues = cartItems
      .filter(item => Number(item.cantidad || 1) > (stockMap.get(item.producto_id) ?? 0))
      .map(item => ({
        producto_id: item.producto_id,
        nombre: item.nombre,
        requested: Number(item.cantidad || 1),
        available: stockMap.get(item.producto_id) ?? 0,
      }));

    if (issues.length > 0) setPendingStockIssues(issues);
  }

  // Ajusta automáticamente el carrito al stock disponible
  function autoAdjustCart() {
    setCart(prev =>
      (Array.isArray(prev) ? prev : [])
        .filter(item => {
          const issue = pendingStockIssues.find(i => i.producto_id === item.producto_id);
          return !issue || issue.available > 0; // eliminar items sin stock
        })
        .map(item => {
          const issue = pendingStockIssues.find(i => i.producto_id === item.producto_id);
          if (!issue) return item;
          return { ...item, cantidad: issue.available }; // reducir al disponible
        })
    );
    setPendingStockIssues([]);
  }

 async function handleSelectPendingSale(sale) {
    // Si es una pending sale de la nube
    if (sale.id && sale.cliente_data) {
      try {
        // Intentar "tomar" la venta (lock)
        await takePendingSale(sale.id);
      } catch (err) {
        alert('⚠️ ' + (err.message || 'Could not take this sale. It may be in use by another device.'));
        return;
      }
      
      // Restaurar datos del cliente
      const clientData = sale.cliente_data || {};
      setSelectedClient({
        ...clientData,
        id: sale.cliente_id || clientData.id,
      });
      
      const restoredCart = Array.isArray(sale.cart) ? sale.cart : [];
      setCart(restoredCart);
      setPendingStockIssues([]); // limpiar advertencias anteriores
      setPayments(
        Array.isArray(sale.payments) && sale.payments.length > 0
          ? sale.payments
          : [{ forma: 'efectivo', monto: 0 }]
      );
      setNotes(sale.notes || '');
      setStep(sale.step || 1);
      setCurrentCloudPendingId(sale.id);

      // Verificar stock en tiempo real (no bloquea la UI)
      if (van?.id) checkPendingCartStock(restoredCart, van.id);

      // Ejecutar agente de crédito si tiene cliente
      if (sale.cliente_id) {
        runCreditAgent(sale.cliente_id);
      }
    } else {
      // Legacy: pending sale de localStorage
      setSelectedClient(sale.client);
      setCart(sale.cart);
      setPayments(sale.payments);
      setNotes(sale.notes);
      setStep(sale.step);
      window.pendingSaleId = sale.id;
    }
    
    setModalPendingSales(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

    async function handleForceUnlockAndTake(sale) {
    const confirmed = window.confirm(
      `⚠️ Esta venta está bloqueada en otro dispositivo.\n\n` +
      `¿Deseas DESBLOQUEARLA y continuar en este equipo?\n\n` +
      `El otro dispositivo podría perder el control si sigue abierto.`
    );
    
    if (!confirmed) return;

    try {
      // 1. Forzar el desbloqueo en la nube
      const updatedSale = await forceTakePendingSale(sale.id);

      // 2. Cargar los datos en el formulario (similar a handleSelectPendingSale pero saltando el check de bloqueo)
      const clientData = updatedSale.cliente_data || {};
      setSelectedClient({
        ...clientData,
        id: updatedSale.cliente_id || clientData.id,
      });
      
      const restoredCart2 = Array.isArray(updatedSale.cart) ? updatedSale.cart : [];
      setCart(restoredCart2);
      setPendingStockIssues([]);
      setPayments(
        Array.isArray(updatedSale.payments) && updatedSale.payments.length > 0
          ? updatedSale.payments
          : [{ forma: 'efectivo', monto: 0 }]
      );
      setNotes(updatedSale.notes || '');
      setStep(updatedSale.step || 1);
      setCurrentCloudPendingId(updatedSale.id);

      // Verificar stock en tiempo real
      if (van?.id) checkPendingCartStock(restoredCart2, van.id);

      // Ejecutar agente de crédito si tiene cliente
      if (updatedSale.cliente_id) {
        runCreditAgent(updatedSale.cliente_id);
      }

      setModalPendingSales(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      alert('❌ Error al intentar desbloquear: ' + err.message);
    }
  }

// 🆕 DEVOLUCIONES: Handler CORREGIDO para procesar devoluciones
async function handleProcessReturn() {
  setProcessingReturn(true);
  try {
    // 1. Construir lista de items a devolver
    const itemsToReturn = [];
    let totalRefund = 0;

    for (const item of selectedInvoice.detalle_ventas) {
      const qty = Number(returnQuantities[item.id] || 0);
      if (qty <= 0) continue;

      // 🔴 FIX: Validar contra cantidad DISPONIBLE (original - ya devuelta)
      const maxAvailable = item.cantidad_disponible ?? item.cantidad;
      if (qty > maxAvailable) {
        throw new Error(
          `No puedes devolver ${qty} de "${item.productos.nombre}". ` +
          `Disponible para devolver: ${maxAvailable}`
        );
      }

      itemsToReturn.push({
        detalle_venta_id: item.id,
        producto_id: item.productos?.id || item.producto_id,
        cantidad: qty,
        precio_unitario: item.precio_unitario,
        nombre: item.productos?.nombre || 'Producto',
      });
      totalRefund += qty * item.precio_unitario;
    }

    if (itemsToReturn.length === 0) {
      toast.warning("Selecciona al menos un producto para devolver");
      setProcessingReturn(false);
      return;
    }

    // Confirmación con desglose
    const itemsSummary = itemsToReturn
      .map(it => `• ${it.nombre} x${it.cantidad} = ${fmt(it.cantidad * it.precio_unitario)}`)
      .join('\n');

    const confirmed = await confirmDialog(
      `🔄 Confirmar Devolución\n\n` +
      `${itemsSummary}\n\n` +
      `Total a devolver: ${fmt(totalRefund)}\n` +
      (selectedInvoice.estado_pago === 'pagado'
        ? `💵 Se entregará ${fmt(totalRefund)} en efectivo al cliente`
        : `📋 Se reducirá la deuda del cliente en ${fmt(totalRefund)}`)
    );
    if (!confirmed) {
      setProcessingReturn(false);
      return;
    }

    // 2. ✅ INTENTAR USAR RPC TRANSACCIONAL (más seguro)
    try {
      const itemsJson = itemsToReturn.map(it => ({
        detalle_venta_id: it.detalle_venta_id,
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
      }));

      const { data: rpcResult, error: rpcErr } = await supabase.rpc('procesar_devolucion', {
        p_venta_origen_id: selectedInvoice.id,
        p_cliente_id: selectedClient.id,  // 🔴 FIX: usar selectedClient.id, NO selectedInvoice.cliente_id
        p_van_id: van.id,
        p_usuario_id: usuario.id,
        p_motivo: returnReason || "Devolución en tienda",
        p_items: itemsJson,
      });

      if (rpcErr) throw rpcErr;

      if (!rpcResult?.ok) {
        throw new Error(rpcResult?.error || 'Error desconocido en RPC');
      }

     // 3. Mostrar resultado con desglose
if (rpcResult.requiere_reembolso_efectivo) {
  const cashBack    = Number(rpcResult.cash_refund     || 0);
  const debtReduced = Number(rpcResult.cxc_adjustment  || 0);
  const parts = [`Devolución procesada — total ${fmt(totalRefund)}`];
  if (cashBack    > 0) parts.push(`💵 Entregar en efectivo: ${fmt(cashBack)}`);
  if (debtReduced > 0) parts.push(`📋 Deuda reducida: ${fmt(debtReduced)}`);
  toast.return(parts.join(" · "), 7000);
} else {
  toast.return(
    `Devolución procesada — deuda reducida ${fmt(Number(rpcResult.cxc_adjustment || 0))}`,
    6000
  );
}

      // Resetear UI
      setSelectedInvoice(null);
      setReturnQuantities({});
      setReturnReason("");
      
      // Recargar inventario
      reloadInventory();
      
      // Recargar historial del cliente
      if (selectedClient?.id) {
        runCreditAgent(selectedClient.id);
      }

      return; // Éxito con RPC

    } catch (rpcFallbackErr) {
      // Si el RPC no existe, usar fallback manual
      if (rpcFallbackErr?.code === '42883') {
        console.warn('RPC procesar_devolucion no disponible, usando fallback manual');
        // Continúa abajo con el fallback
      } else {
        throw rpcFallbackErr;
      }
    }

    // ===== FALLBACK MANUAL (si el RPC no existe) =====
    
    // 2b. Crear registro de devolución en 'ventas'
    const { data: returnSale, error: insertErr } = await supabase
      .from('ventas')
      .insert([{
        cliente_id: selectedClient.id,  // 🔴 FIX: selectedClient.id
        van_id: van.id,
        usuario_id: usuario.id,
        total: totalRefund,
        total_venta: totalRefund,   // ✅ FIX: necesario para vistas de saldo
        total_pagado: totalRefund,  // ✅ FIX: necesario para vistas de saldo
        tipo: 'devolucion',
        venta_origen_id: selectedInvoice.id,
        motivo_devolucion: returnReason || "Devolución en tienda",
        estado_pago: 'reembolsado',
        notas: `Devolución de factura #${selectedInvoice.id.slice(0, 8)}...`,
      }])
      .select()
      .single();

    if (insertErr) throw insertErr;

    // 3b. Crear detalles de la devolución
    const detallesReturn = itemsToReturn.map(item => ({
      venta_id: returnSale.id,
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      descuento: 0,
    }));

    const { error: detErr } = await supabase.from('detalle_ventas').insert(detallesReturn);
    if (detErr) console.error("Error insertando detalles devolución:", detErr);

    // 3c. 🆕 Registrar en tracking de devoluciones
    const trackingRecords = itemsToReturn.map(item => ({
      venta_origen_id: selectedInvoice.id,
      venta_devolucion_id: returnSale.id,
      detalle_venta_id: item.detalle_venta_id,
      producto_id: item.producto_id,
      cantidad_devuelta: item.cantidad,
      precio_unitario: item.precio_unitario,
      motivo: returnReason || "Devolución en tienda",
      usuario_id: usuario.id,
      van_id: van.id,
    }));

    await supabase.from('devoluciones_detalle').insert(trackingRecords).catch(e => {
      console.warn('Tracking devoluciones no disponible:', e.message);
    });

    // 4b. Actualizar Inventario (Devolver stock)
    for (const item of itemsToReturn) {
      try {
        await supabase.rpc('incrementar_stock_van', {
          p_van_id: van.id,
          p_producto_id: item.producto_id,
          p_cantidad: item.cantidad,
        });
      } catch {
        // Fallback manual
        const { data: currentStock } = await supabase
          .from('stock_van')
          .select('cantidad')
          .eq('van_id', van.id)
          .eq('producto_id', item.producto_id)
          .single();

        if (currentStock) {
          await supabase
            .from('stock_van')
            .update({ cantidad: currentStock.cantidad + item.cantidad })
            .eq('van_id', van.id)
            .eq('producto_id', item.producto_id);
        } else {
          // Si no existía, crearlo
          await supabase
            .from('stock_van')
            .insert({ van_id: van.id, producto_id: item.producto_id, cantidad: item.cantidad });
        }
      }
    }

    // 5b. Ajustar CxC si la venta original fue a crédito
    if (['pendiente', 'parcial'].includes(selectedInvoice.estado_pago)) {
      // 🔴 FIX: Usar monto POSITIVO con tipo 'devolucion' 
      // (el sistema CxC interpreta por tipo, no por signo)
      const { error: cxcErr } = await supabase.from('cxc_movimientos').insert([{
        cliente_id: selectedClient.id,  // 🔴 FIX: selectedClient.id
        tipo: 'devolucion',
        monto: totalRefund,  // 🔴 FIX: Positivo, el tipo 'devolucion' indica que reduce
        venta_id: returnSale.id,
        usuario_id: usuario.id,
        fecha: new Date().toISOString(),
        van_id: van.id,
        nota: `Devolución de mercancía (Ref: Venta #${selectedInvoice.id.slice(0, 6)})`,
      }]);

      if (cxcErr) {
        console.error("Error en CxC:", cxcErr);
        // No bloquear — la devolución ya se procesó
      }

      alert(
        `✅ Devolución procesada.\n` +
        `📋 Deuda reducida en ${fmt(totalRefund)}.`
      );
    } else {
      // Si fue pagado al contado
      alert(
        `✅ Devolución procesada.\n` +
        `💵 Entregar ${fmt(totalRefund)} al cliente en efectivo.`
      );
    }

    // Resetear UI
    setSelectedInvoice(null);
    setReturnQuantities({});
    setReturnReason("");
    reloadInventory();
    
    if (selectedClient?.id) {
      runCreditAgent(selectedClient.id);
    }

  } catch (err) {
    console.error("Error en devolución:", err);
    alert("❌ Error procesando devolución:\n\n" + err.message);
  } finally {
    setProcessingReturn(false);
  }
}
async function handleDeletePendingSale(id) {
    const confirmed = window.confirm(
      "¿Estás seguro de eliminar esta venta pendiente?\n\nEsta acción no se puede deshacer."
    );
    if (!confirmed) return;
    
    try {
      await cancelPendingSale(id);
    } catch (err) {
      removePendingFromLSById(id);
    }
    
    if (currentCloudPendingId === id) {
      setCurrentCloudPendingId(null);
    }
    if (window.pendingSaleId === id) {
      window.pendingSaleId = null;
    }
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
     // Si hay crédito y el modal de acuerdo no se ha confirmado aún, mostrarlo
    const amountToCreditCheck = saleTotal - payments.reduce((s, p) => s + Number(p.monto || 0), 0);
    
   // Solo mostrar modal de acuerdo si:
// 1. Hay crédito significativo (> $20)
// 2. El sistema está disponible
// 3. No se ha respondido ya
const esCreditoSignificativo = amountToCreditCheck > 20;

if (esCreditoSignificativo && agreementSystemReady && !pendingAgreementData) {
  setPendingAgreementData({
    montoCredito: Number(amountToCreditCheck.toFixed(2)),
    saldoActual: creditProfile?.saldo || 0,
    clientName: selectedClient?.nombre || '',
    waiting: true,
  });
  setSaving(false);
  return;
}
   

     // 🆕 Generar transaction_id único para esta transacción física
  const transactionId = uuidv4();
  console.log('💳 Transaction ID generado:', transactionId);
/* ========== AGENTE DE CRÉDITO: VALIDACIÓN PREVIA A GUARDAR ========== */
// Si la venta actual se paga completa (no se extiende crédito nuevo), omitir alertas de riesgo
if (selectedClient?.id && amountToCreditCheck > 0.0001) {
  // Ejecutar agente contra el total actual
  await runCreditAgent(selectedClient.id, saleTotal);

  // Esperar carga
  if (clientRisk) {
    // 🔴 Riesgo ALTO → override modal
    if (clientRisk.nivel === "alto") {
      setSaving(false);
      const note = await openSaleBlockModal(
        "high_risk",
        `Credit Agent detected HIGH RISK for this client.\n\nRecommendation: request partial payment, reduce amount, or clear old debt first.`
      );
      if (!note) return;
      saleOverrideRef.current = `[EXCEPTION: HIGH RISK OVERRIDE] ${note}`;
      setSaving(true);
    }

    // 🟡 Riesgo MEDIO → override modal (soft)
    if (clientRisk.nivel === "medio") {
      setSaving(false);
      const note = await openSaleBlockModal(
        "medium_risk",
        `Credit Agent detected MEDIUM RISK for this client.\n\nYou can still approve the sale with a reason.`
      );
      if (!note) return;
      saleOverrideRef.current = `[OVERRIDE: MEDIUM RISK] ${note}`;
      setSaving(true);
    }
  }
}

    const currentPendingId = window.pendingSaleId;

    try {
      if (!usuario?.id) throw new Error("User not synced, please re-login.");
      if (!van?.id) throw new Error("Select a VAN first.");
      if (!selectedClient) throw new Error("Select a client or choose Quick sale.");
      if (cartSafe.length === 0) throw new Error("Add at least one product.");

      if (amountToCredit > 0 && amountToCredit > creditAvailable + 0.0001) {
        setSaving(false);
        const note = await openSaleBlockModal(
          "credit_limit",
          `Credit limit exceeded by ${fmt(amountToCredit - creditAvailable)}.\n\nNeeded: ${fmt(amountToCredit)}  ·  Available: ${fmt(creditAvailable)}`
        );
        if (!note) return;
        saleOverrideRef.current = `[EXCEPTION: CREDIT LIMIT +${fmt(amountToCredit - creditAvailable)}] ${note}`;
        setSaving(true);
      }

      // ============== MODO OFFLINE ==============
      if (isOffline) {
        try {
          // Calcular pagos y estado igual que en modo online
          const paid_offline = payments.reduce((s, p) => s + Number(p.monto || 0), 0);
          const oldDebt_offline = Math.max(0, balanceBefore);
          const payOldDebt_offline = Math.min(paid_offline, oldDebt_offline);
          const paidForSale_offline = Math.min(saleTotal, Math.max(0, paid_offline - payOldDebt_offline));
          const pendingFromSale_offline = Math.max(0, saleTotal - paidForSale_offline);
          const estadoPago_offline = pendingFromSale_offline === 0 ? "pagado" : paidForSale_offline > 0 ? "parcial" : "pendiente";

          const nonZeroPays_offline = payments.filter((p) => Number(p.monto) > 0);
          const payMap_offline = { efectivo: 0, tarjeta: 0, transferencia: 0, otro: 0 };
          for (const p of nonZeroPays_offline) {
            if (payMap_offline[p.forma] !== undefined) payMap_offline[p.forma] += Number(p.monto || 0);
          }
          const metodoPrincipal_offline = nonZeroPays_offline.length === 1 ? (nonZeroPays_offline[0].forma || "mix") : "mix";

          // Preparar venta para guardar localmente — mismos campos que el insert online
          const ventaOffline = {
            // Identificación
            cliente_id: selectedClient?.id ?? null,
            van_id: van.id,
            usuario_id: usuario.id,
            // Totales (todos los campos que usa Supabase)
            total_venta: Number(saleTotalWithTax.toFixed(2)),
            total: Number(saleTotalWithTax.toFixed(2)),
            total_pagado: Number(paidForSale_offline.toFixed(2)),
            // Estado y método
            estado_pago: estadoPago_offline,
            metodo_pago: metodoPrincipal_offline,
            // Desglose por forma de pago
            pago_efectivo: Number((payMap_offline.efectivo || 0).toFixed(2)),
            pago_tarjeta: Number((payMap_offline.tarjeta || 0).toFixed(2)),
            pago_transferencia: Number((payMap_offline.transferencia || 0).toFixed(2)),
            pago_otro: Number((payMap_offline.otro || 0).toFixed(2)),
            // JSON de pago completo
            pago: {
              metodos: nonZeroPays_offline,
              map: payMap_offline,
              total_ingresado: Number(paid_offline.toFixed(2)),
              aplicado_venta: Number(paidForSale_offline.toFixed(2)),
              aplicado_deuda: Number(payOldDebt_offline.toFixed(2)),
            },
            notas: [notes, saleOverrideRef.current, "[OFFLINE]"].filter(Boolean).join(" ").trim(),
            // Items con campos de descuento compatibles con detalle_ventas
            items: cartSafe.map((p) => {
              const meta = p._pricing || { base: p.precio_unitario, pct: 0 };
              return {
                producto_id: p.producto_id,
                nombre: p.nombre,
                cantidad: Number(p.cantidad),
                precio_unitario: Number(meta.base || p.precio_unitario || 0),
                precio_unit: Number(meta.base || p.precio_unitario || 0),
                descuento_pct: Number(meta.pct || 0),
              };
            }),
            // Pagos originales para referencia
            payments: payments.filter((p) => Number(p.monto) > 0),
            // Fecha real de la transacción (sin campo fecha_venta — no existe en BD)
            created_at: new Date().toISOString(),
          };

          await guardarVentaOffline(ventaOffline);

          for (const item of cartSafe) {
            console.log(`📦 Producto ${item.nombre} descontado localmente`);
          }

          alert(
            `📵 VENTA GUARDADA OFFLINE\n\n` +
            `Total: ${fmt(saleTotal)}\n` +
            `Cliente: ${selectedClient?.nombre || 'Venta rápida'}\n\n` +
            `✅ Se sincronizará automáticamente cuando vuelva la conexión.`
          );

          if (currentPendingId) {
  const updated = removePendingFromLSById(currentPendingId);
  setPendingSales(updated); // 🆕 ACTUALIZAR ESTADO
  window.pendingSaleId = null; // 🆕 LIMPIAR ID GLOBAL
}
          clearSale();
          return;
        } catch (offlineError) {
          setPaymentError("❌ Error guardando offline: " + offlineError.message);
          console.error("Error offline:", offlineError);
          return;
        }
      }
      // ============== FIN MODO OFFLINE ==============

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

      // ✅ FIFO dentro de saveSale
const oldDebtNow         = Math.max(0, balanceBefore);
const payOldDebtNow      = Math.min(paid, oldDebtNow);          // viejo primero
const paidForSaleNow     = Math.min(saleTotal, Math.max(0, paid - payOldDebtNow)); // luego nuevo
const totalAPagarNow     = oldDebtNow + saleTotal;
const changeNow          = Math.max(0, paid - totalAPagarNow);

// ✅ Validar pago mínimo antes de guardar
const pagoMinimoReq = calcularPagoMinimo(oldDebtNow);
if (pagoMinimoReq > 0 && paid < pagoMinimoReq) {
  const ok = window.confirm(
    `⚠️ Pago Mínimo Requerido\n\n` +
    `Balance anterior: ${fmt(oldDebtNow)}\n` +
    `Pago mínimo (20%): ${fmt(pagoMinimoReq)}\n` +
    `Cliente paga hoy: ${fmt(paid)}\n` +
    `Faltan: ${fmt(pagoMinimoReq - paid)}\n\n` +
    `¿Autorizar excepción y continuar?`
  );
  if (!ok) { setSaving(false); return; }
}

      const pendingFromThisSale = Math.max(0, saleTotal - paidForSaleNow);

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
        if (p._manualDescuento > 0) {
          descuento_pct = Number(p._manualDescuento);
        } else if (hasBulk && base > 0 && Number(meta.bulkPrice) > 0) {
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

      // Build transfer sub-method breakdown (Zelle, CashApp, Venmo, Apple Pay)
      const transferSubMap = { zelle: 0, cashapp: 0, venmo: 0, applepay: 0, other: 0 };
      for (const pm of metodosAplicados) {
        if (pm.forma === "transferencia") {
          const sub = pm.subMetodo && transferSubMap[pm.subMetodo] !== undefined ? pm.subMetodo : "other";
          transferSubMap[sub] = Number((transferSubMap[sub] + Number(pm.monto || 0)).toFixed(2));
        }
      }

      const pagoJson = {
  metodos: metodosAplicados,
  map: paymentMap,
  transferencia_detalle: transferSubMap,
  total_ingresado: Number(paid.toFixed(2)),
  aplicado_venta: Number(paidForSaleNow.toFixed(2)),
  aplicado_deuda: Number(payOldDebtNow.toFixed(2)),
  cambio: Number(changeNow.toFixed(2)),
  ajuste_por_venta: Number(pendingFromThisSale.toFixed(2)),
  transaction_id: transactionId, // 🆕 UUID para deduplicación
};

      const { data: ventaRow, error: insErr } = await supabase
  .from('ventas')
  .insert([{
    cliente_id: selectedClient?.id ?? null,
    van_id: van.id ?? null,
    usuario_id: usuario.id,
    total_venta: Number(saleTotalWithTax.toFixed(2)),  // ✅ includes tax when enabled
    total: Number(saleTotalWithTax.toFixed(2)),        // ✅ MANTENER POR COMPATIBILIDAD
    total_pagado: Number(paidForSaleNow.toFixed(2)),
          estado_pago: estadoPago,
          pago: { ...pagoJson, tax_rate: taxEnabled ? taxRate : 0, tax_amount: taxEnabled ? taxAmount : 0, subtotal: Number(saleTotal.toFixed(2)) },
          pago_efectivo: pagoEfectivo,
          pago_tarjeta: pagoTarjeta,
          pago_transferencia: pagoTransf,
          pago_otro: pagoOtro,
          metodo_pago: metodoPrincipal,
          notas: [notes, saleOverrideRef.current].filter(Boolean).join("\n") || null,
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
        // 🔐 Id de idempotencia para no duplicar pagos si algo reintenta
        let idemKey = null;
        try {
          // Navegadores modernos
          if (typeof crypto !== "undefined" && crypto.randomUUID) {
            idemKey = crypto.randomUUID();
          }
        } catch (e) {
          console.warn("No se pudo generar randomUUID, idem_key queda null:", e);
        }

        // 💰 1) Registrar el pago REAL en tabla `pagos`
     const { error: pagoCxCErr } = await supabase
  .from("pagos")
  .insert([
    {
      venta_id: null,
      cliente_id: selectedClient.id,
      van_id: van.id ?? null,
      usuario_id: usuario.id ?? null,
      fecha_pago: new Date().toISOString(),
      monto: montoParaCxC,
      metodo_pago: metodoPrincipal,
      referencia: `Pago CxC dentro de venta ${ventaId}`,
      notas: "Pago a cuenta por cobrar aplicado desde pantalla de ventas",
      idem_key: idemKey,
      transaction_id: transactionId, // 🆕 Mismo UUID que la venta
    },
  ]);

        if (pagoCxCErr) {
          console.error("❌ Error insertando pago CxC en tabla pagos:", pagoCxCErr);

          // 🔁 Fallback: si por alguna razón falla, usamos tu flujo viejo
          // para no romper la app (pero idealmente esto no debería ejecutarse casi nunca)
          try {
            await registrarPagoCxC({
              cliente_id: selectedClient.id,
              monto: montoParaCxC,
              metodo: metodoPrincipal,
              van_id: van.id,
            });
          } catch (fallbackErr) {
            console.error("❌ Error también en registrarPagoCxC fallback:", fallbackErr);
          }
        }
      }

      // APLICAR PAGO A CUOTAS — directo, sin el caché RPC que puede silenciar el error
      if (montoParaCxC > 0) {
        try {
          try {
            const rpcCache = JSON.parse(localStorage.getItem('rpc-availability-v1') || '{}');
            if (rpcCache['aplicar_pago_a_cuotas'] === false) {
              delete rpcCache['aplicar_pago_a_cuotas'];
              localStorage.setItem('rpc-availability-v1', JSON.stringify(rpcCache));
            }
          } catch (_) {}
          const sbUrl = import.meta?.env?.VITE_SUPABASE_URL || 'https://gvloygqbavibmpakzdma.supabase.co';
          const sbKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bG95Z3FiYXZpYm1wYWt6ZG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NTY3MTAsImV4cCI6MjA2NjUzMjcxMH0.YgDh6Gi-6jDYHP3fkOavIs6aJ9zlb_LEjEg5sLsdb7o';
          const session = supabase.auth.session ? supabase.auth.session() : (await supabase.auth.getSession())?.data?.session;
          const authHeader = session?.access_token ? `Bearer ${session.access_token}` : `Bearer ${sbKey}`;
          await fetch(`${sbUrl}/rest/v1/rpc/aplicar_pago_a_cuotas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': authHeader },
            body: JSON.stringify({ p_cliente_id: selectedClient.id, p_monto: montoParaCxC }),
          });
        } catch (e) {
          console.warn('⚠️ Error cuotas desde venta:', e.message);
        }
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
// 🆕 CREAR ACUERDO DE PAGO si hay crédito
     if (pendingFromThisSale > 0 && selectedClient?.id && agreementSystemReady && !pendingAgreementData?.skipped) {
        try {
          // Usar el plan que el vendedor seleccionó en el modal
          const cuotasSeleccionadas = pendingAgreementData?.plan?.num_cuotas || null;
          
          const resultAcuerdo = await crearAcuerdo({
            clienteId: selectedClient.id,
            ventaId: ventaId,
            vanId: van.id,
            usuarioId: usuario.id,
            montoCredito: Number(pendingFromThisSale.toFixed(2)),
            numCuotas: cuotasSeleccionadas,
            excepcionVendedor: pendingAgreementData?.isException || false,
            excepcionNota: pendingAgreementData?.exceptionNote || null,
          });

          if (resultAcuerdo.ok) {
            console.log('✅ Acuerdo de pago creado:', resultAcuerdo.acuerdo.id);
            setAgreementPlan(resultAcuerdo.acuerdo.plan);
          }
        } catch (e) {
          console.warn('⚠️ Error creando acuerdo (no bloquea la venta):', e.message);
        }
      }

// ========== 🆕 PEGAR AQUÍ — SMS CON CALENDARIO ==========
      const agreementPlanForSMS = agreementPlan || (
        pendingFromThisSale > 0
          ? generarPlanPago(pendingFromThisSale, { numCuotas: pendingAgreementData?.numCuotas })
          : null
      );

      if (agreementPlanForSMS && agreementPlanForSMS.cuotas?.length > 0) {
        const scheduleLines = agreementPlanForSMS.cuotas
          .map(c => `#${c.numero_cuota}: $${c.monto.toFixed(2)} due ${c.fecha_display}`)
          .join('\n');
        
        const payloadWithSchedule = {
          ...payload,
          notas: (payload.notas || '') + '\n---\nPAYMENT SCHEDULE:\n' + scheduleLines,
        };

        try {
          await requestAndSendNotifications({
            client: selectedClient,
            payload: payloadWithSchedule,
          });
        } catch (smsErr) {
          console.warn('SMS error (non-blocking):', smsErr.message);
          try {
            await requestAndSendNotifications({ client: selectedClient, payload });
          } catch { /* silenciar */ }
        }
      } else {
        await requestAndSendNotifications({ client: selectedClient, payload });
      }

           // ✅ Limpiar venta pendiente de la NUBE si existía
      if (currentCloudPendingId) {
        try {
          await completePendingSale(currentCloudPendingId, ventaId);
          console.log(`✅ Venta pendiente cloud ${currentCloudPendingId} → completada`);
        } catch (e) {
          console.warn('⚠️ Error completando pending sale en cloud:', e.message);
        }
      }

      // ✅ Limpiar venta pendiente de localStorage (legacy)
      if (currentPendingId) {
        const updated = removePendingFromLSById(currentPendingId);
        setPendingSales(updated);
        window.pendingSaleId = null;
      }

      clearSale();

    } catch (err) {
      console.error("❌ Error en saveSale:", err);
      setPaymentError("❌ " + (err.message || "Error saving sale"));
    } finally {
      setSaving(false);
    }
  }

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

  // 🆕 DEVOLUCIONES: Renderizar lista de facturas
function renderClientInvoiceList() {
  if (appMode !== 'devolucion' || !selectedClient || clientSalesHistory.length === 0) {
    return null;
  }

  return (
    <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-orange-900 flex items-center gap-2">
          📜 Historial de Ventas: {selectedClient.nombre}
        </h3>
        <button 
          onClick={() => setAppMode('venta')}
          className="text-xs text-orange-700 underline hover:text-orange-900"
        >
          ❌ Salir de Devolución
        </button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {clientSalesHistory.map((sale) => {
          const totalDevuelto = sale.total_devuelto || 0;
          const fullReturned = totalDevuelto >= sale.total;
          
          // 🆕 Verificar si todos los items ya fueron devueltos
          const allItemsReturned = sale.detalle_ventas?.every(
            d => (d.cantidad_disponible ?? d.cantidad) <= 0
          );

          return (
            <button
              key={sale.id}
              onClick={() => {
                if (fullReturned || allItemsReturned) {
                  alert('⚠️ Esta venta ya fue completamente devuelta.');
                  return;
                }
                setSelectedInvoice(sale);
              }}
              disabled={fullReturned || allItemsReturned}
              className={`w-full text-left bg-white border rounded-lg p-3 transition-all flex justify-between items-center group ${
                fullReturned || allItemsReturned
                  ? 'border-gray-300 opacity-50 cursor-not-allowed'
                  : selectedInvoice?.id === sale.id 
                    ? 'border-orange-500 ring-2 ring-orange-200' 
                    : 'border-orange-100 hover:border-orange-400 hover:bg-orange-100'
              }`}
            >
              <div>
                <div className="font-bold text-gray-800 group-hover:text-orange-700 flex items-center gap-2">
                  #{sale.id.slice(0, 8)}...
                  {sale.tiene_devoluciones && (
                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                      🔄 Parcialmente devuelto
                    </span>
                  )}
                  {(fullReturned || allItemsReturned) && (
                    <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                      ✅ Completamente devuelto
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(sale.created_at).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-gray-900">{fmt(sale.total)}</div>
                {totalDevuelto > 0 && (
                  <div className="text-xs text-orange-600">
                    Devuelto: {fmt(totalDevuelto)}
                  </div>
                )}
                <div className={`text-xs font-semibold ${
                  sale.estado_pago === 'pendiente' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {sale.estado_pago}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 🆕 DEVOLUCIONES: Renderizar detalles y formulario de devolución
function renderReturnDetails() {
  if (appMode !== 'devolucion' || !selectedInvoice) return null;

  const totalReturn = Object.entries(returnQuantities).reduce((sum, [itemId, qty]) => {
    const item = selectedInvoice.detalle_ventas.find(d => d.id === itemId);
    return sum + (Number(qty) * Number(item?.precio_unitario || 0));
  }, 0);

  return (
    <div className="bg-white border-2 border-orange-200 rounded-xl p-4 shadow-sm mb-4">
      <div className="flex justify-between items-center mb-4 border-b pb-2">
        <h3 className="font-bold text-orange-900">
          🔄 Devolución: Factura #{selectedInvoice.id.slice(0, 8)}...
        </h3>
        <button 
          onClick={() => { setSelectedInvoice(null); setReturnQuantities({}); }}
          className="text-xs text-gray-500 underline"
        >
          Cambiar factura
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <p className="text-sm text-gray-600 font-semibold">Selecciona productos a devolver:</p>
        
        {selectedInvoice.detalle_ventas.map((item) => {
          // 🆕 Usar cantidad disponible (descontando devoluciones previas)
          const maxQty = item.cantidad_disponible ?? item.cantidad;
          const alreadyReturned = item.cantidad_devuelta || 0;
          const currentReturn = Number(returnQuantities[item.id] || 0);
          
          if (maxQty <= 0) {
            // Item completamente devuelto
            return (
              <div key={item.id} className="flex items-center justify-between border p-2 rounded bg-gray-100 opacity-50">
                <div className="flex-1">
                  <span className="font-semibold text-sm line-through">{item.productos.nombre}</span>
                  <span className="text-xs text-gray-500 ml-2">✅ Completamente devuelto</span>
                </div>
              </div>
            );
          }

          return (
            <div key={item.id} className="flex items-center justify-between border p-2 rounded bg-gray-50">
              <div className="flex-1">
                <span className="font-semibold text-sm">{item.productos.nombre}</span>
                <div className="text-xs text-gray-500">
                  {fmt(item.precio_unitario)} c/u · 
                  Comprado: {item.cantidad}
                  {alreadyReturned > 0 && (
                    <span className="text-orange-600 ml-1">
                      · Ya devuelto: {alreadyReturned}
                    </span>
                  )}
                  · <span className="font-semibold text-green-700">Disponible: {maxQty}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  className="w-7 h-7 rounded bg-red-200 text-red-700 font-bold hover:bg-red-300 flex items-center justify-center"
                  onClick={() => {
                    if (currentReturn > 0) {
                      setReturnQuantities(prev => ({...prev, [item.id]: currentReturn - 1}));
                    }
                  }}
                >−</button>
                <span className="w-8 text-center font-bold">{currentReturn}</span>
                <button 
                  className="w-7 h-7 rounded bg-green-200 text-green-700 font-bold hover:bg-green-300 flex items-center justify-center"
                  onClick={() => {
                    if (currentReturn < maxQty) {
                      setReturnQuantities(prev => ({...prev, [item.id]: currentReturn + 1}));
                    }
                  }}
                >+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Motivo */}
      <div className="mb-4">
        <label className="block text-xs font-bold text-gray-700 mb-1">
          Motivo de devolución (Opcional):
        </label>
        <input
          type="text"
          className="w-full border p-2 rounded text-sm"
          placeholder="Ej. Producto dañado, No le gustó, Error en pedido..."
          value={returnReason}
          onChange={(e) => setReturnReason(e.target.value)}
        />
      </div>

      {/* Total de devolución */}
      {totalReturn > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-center">
          <div className="text-xs text-orange-600 uppercase font-semibold">Total a Devolver</div>
          <div className="text-2xl font-bold text-orange-800">{fmt(totalReturn)}</div>
          <div className="text-xs text-gray-600 mt-1">
            {selectedInvoice.estado_pago === 'pagado' 
              ? '💵 Se devolverá en efectivo' 
              : '📋 Se reducirá de la deuda'}
          </div>
        </div>
      )}

      <button
        onClick={handleProcessReturn}
        disabled={processingReturn || Object.values(returnQuantities).every(q => !q || q === 0)}
        className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white py-3 rounded-lg font-bold transition-colors text-lg"
      >
        {processingReturn ? "⏳ Procesando..." : `🔄 Confirmar Devolución (${fmt(totalReturn)})`}
      </button>
    </div>
  );
}
function renderPendingSalesModal() {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            📂 Pending Sales
          </h3>

          <div className="flex items-center gap-2">
            {/* Indicador de dispositivo actual */}
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
              {deviceInfo.isPC ? '💻 PC' : deviceInfo.isPhone ? '📱 Phone' : '📱 Tablet'}
            </span>

            <button
              className="text-white hover:bg-white/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center disabled:opacity-50"
              onClick={() => refreshPendingSales()}
              disabled={cloudPendingLoading}
              title="Refresh"
            >
              {cloudPendingLoading
                ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                : <span>🔄</span>
              }
            </button>
            
            <button
              className="text-white hover:bg-white/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center"
              onClick={() => setModalPendingSales(false)}
            >
              ✖️
            </button>
          </div>
        </div>

        {/* Stats rápidos */}
        {pendingStats.total > 0 && (
          <div className="px-4 pt-3 flex gap-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
              📋 {pendingStats.preparadas} ready
            </span>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">
              ⏳ {pendingStats.enProgreso} in progress
            </span>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-semibold">
              🔗 Synced across devices
            </span>
          </div>
        )}

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {pendingSales.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              <div className="text-4xl mb-2">📭</div>
              <div>No pending sales</div>
              <div className="text-xs mt-1">
                Sales prepared on any device will appear here
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingSales.map((v) => {
                const clientName = v.cliente_data?.nombre || 'Quick sale';
                const clientBusiness = v.cliente_data?.negocio;
                const cartCount = Array.isArray(v.cart) ? v.cart.length : 0;
                const total = Number(v.total_estimado || 0);
                const isLocked = v.locked_by && v.locked_by !== deviceInfo.id;
                const isMine = v.dispositivo_id === deviceInfo.id;
                const createdOnPC = v.dispositivo === 'pc';
                const createdOnPhone = v.dispositivo === 'phone';
                
                return (
                  <div 
                    key={v.id} 
                    className={`rounded-lg p-4 border-2 transition-all ${
                      isLocked 
                        ? 'bg-gray-100 border-gray-300 opacity-60' 
                        : v.estado === 'en_progreso'
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-gray-50 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex flex-col gap-3">
                      {/* Header con info del cliente */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                            👤 {clientName}
                            {clientBusiness && (
                              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                                {clientBusiness}
                              </span>
                            )}
                          </div>
                          
                          <div className="text-sm text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
                            <span>📦 {cartCount} products</span>
                            {total > 0 && (
                              <span className="font-semibold text-blue-700">
                                💰 ${total.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Badges de estado y dispositivo */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Dispositivo origen */}
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                          createdOnPC 
                            ? 'bg-indigo-100 text-indigo-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {createdOnPC ? '💻 From PC' : createdOnPhone ? '📱 From Phone' : '📱 Mobile'}
                        </span>
                        
                        {/* Estado */}
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                          v.estado === 'preparada'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {v.estado === 'preparada' ? '✅ Ready' : '⏳ In progress'}
                        </span>
                        
                        {/* Step */}
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                          Step {v.step}/3
                        </span>
                        
                        {/* Lock indicator */}
                        {isLocked && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">
                            🔒 In use
                          </span>
                        )}
                        
                        {/* Time */}
                        <span className="text-xs text-gray-500">
                          {new Date(v.updated_at || v.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      
                                    {/* Botones de acción */}
                      <div className="flex gap-2">
                        {isLocked ? (
                          // Si está bloqueado, mostramos botón para Desbloquear
                          <button
                            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md transition-all duration-200"
                            onClick={() => handleForceUnlockAndTake(v)}
                            title="Forzar desbloqueo y tomar esta venta"
                          >
                            🔓 Desbloquear
                          </button>
                        ) : (
                          // Si no está bloqueada, botón normal de Retomar
                          <button
                            className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:shadow-lg text-white px-4 py-2 rounded-lg font-semibold shadow-md transition-all duration-200"
                            onClick={() => handleSelectPendingSale(v)}
                          >
                            ▶️ Retomar
                          </button>
                        )}
                        
                        {puedeCancelarVentas && (
                          <button
                            className="bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                            onClick={() => handleDeletePendingSale(v.id)}
                          >
                            🗑️
                          </button>
                        )}
      </div>
                    </div>
                  </div>
                );
              })}
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
              📂 Pending ({pendingStats.total})
            </button>
            <button
              onClick={() => navigate("/clientes/nuevo", { replace: false })}
              className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg px-4 py-2 font-semibold shadow-md hover:shadow-lg transition-all duration-200"
            >
              ✨ Quick Create
            </button>
          </div>
        </div>

        {/* ── Client card ── */}
        <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-md overflow-hidden">

          {/* Name header strip */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white text-xl font-bold leading-tight truncate">
                {selectedClient.nombre} {selectedClient.apellido || ""}
              </div>
              {selectedClient.negocio && (
                <div className="text-blue-200 text-sm mt-0.5 flex items-center gap-1">
                  🏢 {selectedClient.negocio}
                </div>
              )}
              {clientHistory?.lastSaleDate && (
                <div className="text-blue-200 text-xs mt-1 flex items-center gap-1">
                  🕒 Last sale: {new Date(clientHistory.lastSaleDate).toLocaleDateString('en-US')}
                </div>
              )}
            </div>
            <button
              className="shrink-0 bg-white/20 hover:bg-white/30 active:scale-95 text-white text-sm px-3 py-1.5 rounded-xl transition-all font-semibold"
              onClick={() => {
                window.pendingSaleId = null;
                setCart([]);
                setPayments([{ forma: "efectivo", monto: 0 }]);
                setSelectedClient(null);
              }}
            >
              🔄 Change
            </button>
          </div>

          {/* Contact chips */}
          <div className="px-4 py-3 flex flex-wrap gap-2 bg-gray-50 border-b border-gray-100">
            <span className="flex items-center gap-1.5 bg-white border border-green-200 text-green-800 rounded-full px-3 py-1 text-sm font-mono font-semibold shadow-sm">
              📞 {selectedClient.telefono || "—"}
            </span>
            {selectedClient.email && (
              <span className="flex items-center gap-1.5 bg-white border border-blue-200 text-blue-700 rounded-full px-3 py-1 text-sm font-mono shadow-sm truncate max-w-[220px]">
                📧 {selectedClient.email}
              </span>
            )}
            {selectedClient.direccion && (
              <span className="flex items-center gap-1.5 bg-white border border-amber-200 text-amber-700 rounded-full px-3 py-1 text-sm shadow-sm">
                📍 {renderAddress(selectedClient.direccion)}
              </span>
            )}
            <span className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-500 rounded-full px-3 py-1 text-xs shadow-sm font-mono">
              💳 #{creditNum}
            </span>
          </div>

          {/* Credit metrics grid — only for real clients */}
          {selectedClient.id && (
            <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wide">Limit</div>
                <div className="text-lg font-bold text-blue-800 mt-1">{fmt(Number(cxcLimit ?? policyLimit(clientScore)))}</div>
              </div>
              <div className="text-center bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide">Available</div>
                <div className="text-lg font-bold text-emerald-800 mt-1">{fmt(creditAvailable)}</div>
              </div>
              <div className={`text-center border rounded-xl p-3 ${creditAvailableAfter >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-300"}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wide ${creditAvailableAfter >= 0 ? "text-emerald-600" : "text-red-600"}`}>After Sale</div>
                <div className={`text-lg font-bold mt-1 ${creditAvailableAfter >= 0 ? "text-emerald-800" : "text-red-700"}`}>{fmt(creditAvailableAfter)}</div>
              </div>
              {balanceBefore > 0 ? (
                <div className="text-center bg-red-50 border-2 border-red-300 rounded-xl p-3">
                  <div className="text-[10px] text-red-600 font-bold uppercase tracking-wide">⚠ Balance Due</div>
                  <div className="text-lg font-bold text-red-700 mt-1">{fmt(balanceBefore)}</div>
                </div>
              ) : (
                <div className="text-center bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Balance</div>
                  <div className="text-lg font-bold text-gray-600 mt-1">$0.00</div>
                </div>
              )}
            </div>
          )}

          {/* Migration mode controls */}
          {migrationMode && selectedClient?.id && (
            <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  const info = await getCxcCliente(selectedClient.id);
                  if (info) { setCxcLimit(info.limite); setCxcAvailable(info.disponible); setCxcBalance(info.saldo); }
                }}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg"
              >🔄 Refresh credit</button>
              <button
                type="button"
                onClick={() => { setAdjustAmount(""); setShowAdjustModal(true); }}
                className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg"
              >🛠️ Set Opening Balance</button>
            </div>
          )}

          {/* Credit risk panel */}
          <div className="px-4 pb-4">
            <CreditRiskPanel
              clientRisk={clientRisk}
              creditProfile={creditProfile}
              reglasCredito={reglasCredito}
              cxcBalance={cxcBalance}
              cxcLimit={cxcLimit}
              cxcAvailable={cxcAvailable}
              saleTotal={saleTotal}
              onRefresh={() => runCreditAgent(selectedClient.id, saleTotal)}
            />
          </div>
        </div>

        {/* Devolucion: invoice list + return details */}
        {renderClientInvoiceList()}
        {renderReturnDetails()}

        {/* Footer: refresh + continue */}
        <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
          <button
            type="button"
            className="text-sm text-blue-700 hover:text-blue-900 underline underline-offset-2 flex items-center gap-1"
            onClick={async () => {
              const info = await getCxcCliente(selectedClient?.id);
              if (info) { setCxcLimit(info.limite); setCxcAvailable(info.disponible); setCxcBalance(info.saldo); }
            }}
          >🔄 Refresh credit</button>
          <button
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedClient}
            onClick={() => setStep(2)}
          >
            Continue → Add Products
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
            📂 Pending ({pendingStats.total})

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
                   runCreditAgent(c.id);
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
  placeholder={
    appMode === 'devolucion' 
      ? "🔍 Escribe #devolucion para salir, o busca cliente..." 
      : "🔍 Name · Phone · Email · Address · Business..."
  }
  className={`w-full border-2 rounded-lg p-4 text-lg outline-none transition-all ${
    appMode === 'devolucion'
      ? 'border-orange-500 bg-orange-50 text-orange-900 focus:border-orange-700 focus:ring-2 focus:ring-orange-200'
      : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
  }`}
  value={clientSearch}
  onChange={(e) => {
    const value = e.target.value;
    
    // 🆕 DEVOLUCIONES: Detectar código de devolución
    if (value.trim().toLowerCase() === "#devolucion") {
      setAppMode('devolucion');
      setClientSearch("");
      toast.return("Modo devolución activado — busca el cliente para ver sus facturas");
      return;
    }

    // Salir del modo devolución si borran todo (opcional)
    if (appMode === 'devolucion' && value === "") {
      // setAppMode('venta'); // Descomentar si quieres salida automática
    }

    setClientSearch(value);
  }}
          onKeyDown={(e) => {
            // Secret migration mode code
            if (e.key === "Enter" && clientSearch.trim() === SECRET_CODE) {
              setMigrationMode((v) => !v);
              setClientSearch("");
              toast.info(`Migration mode ${!migrationMode ? "ON" : "OFF"}`);
              return;
            }
            // ↓ Move focus down the list
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setFocusedClientIdx(prev => Math.min(prev + 1, clientsSafe.length - 1));
            // ↑ Move focus up the list (−1 = no focus / back to input)
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setFocusedClientIdx(prev => Math.max(prev - 1, -1));
            // Enter → select focused item, or first item if none focused
            } else if (e.key === "Enter" && clientsSafe.length > 0) {
              const idx = focusedClientIdx >= 0 ? focusedClientIdx : 0;
              const c = clientsSafe[idx];
              if (c) {
                window.pendingSaleId = null;
                setCart([]);
                setPayments([{ forma: "efectivo", monto: 0 }]);
                setSelectedClient(c);
                runCreditAgent(c.id);
              }
            // Esc → clear search and reset focus
            } else if (e.key === "Escape") {
              setClientSearch("");
              setFocusedClientIdx(-1);
            }
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5 text-blue-700">
            <span className="font-semibold">🔍</span>
            {['Name','Phone','Email','Address','Business'].map(f => (
              <span key={f} className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-700">{f}</span>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-2 text-blue-600 shrink-0">
            <kbd className="bg-white border border-blue-300 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold">↑↓</kbd>
            <span>Navigate</span>
            <kbd className="bg-white border border-blue-300 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold">↵</kbd>
            <span>Select</span>
            <kbd className="bg-white border border-blue-300 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold">Esc</kbd>
            <span>Clear</span>
          </div>
        </div>
      )}

      <div
        ref={clientListRef}
        className="max-h-72 lg:max-h-[480px] overflow-auto space-y-1.5 bg-gray-50 rounded-xl p-2 border border-gray-200"
      >
        {/* ── EMPTY STATE: no search typed yet ── */}
        {clientsSafe.length === 0 && debouncedClientSearch.length < 2 && (
          <div className="py-2 space-y-3">
            {/* Keyboard shortcuts card */}
            <div className="bg-white rounded-xl border border-blue-100 p-3 shadow-sm">
              <p className="text-[11px] font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                ⌨️ Keyboard shortcuts
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { keys: "↑  ↓", desc: "Navigate list" },
                  { keys: "↵ Enter", desc: "Select client" },
                  { keys: "Esc", desc: "Clear search" },
                  { keys: "2+ chars", desc: "Auto-search" },
                ].map(({ keys, desc }) => (
                  <div key={desc} className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
                    <kbd className="bg-white border border-blue-300 text-blue-700 font-mono text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">{keys}</kbd>
                    <span className="text-[11px] text-gray-600 leading-tight">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Search fields card */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <p className="text-[11px] font-bold text-gray-600 mb-2">🔍 Search by any field</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "👤 Name", hint: "e.g. Maria" },
                  { label: "📞 Phone", hint: "e.g. 555-1234" },
                  { label: "🏢 Business", hint: "e.g. Panaderia" },
                  { label: "📧 Email", hint: "e.g. @gmail" },
                  { label: "📍 Address", hint: "e.g. Main St" },
                ].map(({ label, hint }) => (
                  <div key={label} className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-left min-w-[100px]">
                    <div className="text-[11px] font-semibold text-gray-700">{label}</div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">{hint}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <p className="text-center text-xs text-gray-400 py-1 flex items-center justify-center gap-1.5">
              ✍️ <span>Start typing to search your clients</span>
            </p>
          </div>
        )}

        {/* ── NO RESULTS ── */}
        {clientsSafe.length === 0 && debouncedClientSearch.length >= 2 && !clientLoading && (
          <div className="text-center py-10">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-gray-500 font-medium text-sm">No clients found</p>
            <p className="text-gray-400 text-xs mt-1">Try a different name, phone or business</p>
          </div>
        )}

        {/* ── CLIENT RESULTS with keyboard focus ── */}
        {clientsSafe.map((c, i) => {
          const balance = getClientBalance(c);
          const hasDebt = balance > 0;
          const isFocused = i === focusedClientIdx;

          return (
            <div
              key={c.id}
              data-client-idx={i}
              className={`bg-white p-3 rounded-xl cursor-pointer border-2 transition-all duration-150 shadow-sm ${
                isFocused
                  ? "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200"
                  : "border-transparent hover:border-blue-200 hover:bg-blue-50"
              }`}
              onClick={() => {
                window.pendingSaleId = null;
                setCart([]);
                setPayments([{ forma: "efectivo", monto: 0 }]);
                setSelectedClient(c);
                runCreditAgent(c.id);
              }}
              onMouseEnter={() => setFocusedClientIdx(i)}
            >
              {/* Row 1 — Name + debt badge */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {/* Focus indicator */}
                  {isFocused && (
                    <span className="text-blue-500 text-xs font-bold shrink-0">▶</span>
                  )}
                  <span className="font-bold text-gray-900 text-sm truncate">
                    {c.nombre} {c.apellido || ""}
                  </span>
                  {c.negocio && (
                    <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 hidden sm:inline">
                      🏢 {c.negocio}
                    </span>
                  )}
                </div>
                {hasDebt && (
                  <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0">
                    ⚠ {fmt(balance)}
                  </span>
                )}
              </div>

              {/* Row 2 — Contact chips */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="flex items-center gap-1 bg-green-50 border border-green-200 text-green-800 rounded px-2 py-0.5 font-mono font-semibold">
                  📞 {c.telefono || "—"}
                </span>
                {c.email && (
                  <span className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-0.5 font-mono truncate max-w-[160px]">
                    📧 {c.email}
                  </span>
                )}
                {c.negocio && (
                  <span className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded px-2 py-0.5 sm:hidden">
                    🏢 {c.negocio}
                  </span>
                )}
                {c.direccion && (
                  <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 rounded px-2 py-0.5 truncate max-w-[200px]">
                    📍 {renderAddress(c.direccion)}
                  </span>
                )}
              </div>

              {/* Row 3 — Balance / credit line (only when meaningful) */}
              {(balance > 0) && (
                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100 text-[10px] text-gray-500">
                  <span className="text-red-600 font-semibold">Balance due: {fmt(balance)}</span>
                  <span className="text-gray-400">#{getCreditNumber(c)}</span>
                </div>
              )}
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
            setClientRisk(null);
            setClientBehavior(null);
            setCreditProfile(null);
            setStep(2); // go straight to products
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

      {/* ── CART (top) ───────────────────────────────── */}
      {cartSafe.length > 0 && (
        <div className="rounded-xl shadow-lg ring-2 ring-emerald-300 bg-white border border-emerald-200 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm">🛒 Cart</span>
              <span className="bg-white/30 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                {cartSafe.length} {cartSafe.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="text-white font-bold text-xl">{fmt(saleTotal)}</div>
          </div>
          <div className="divide-y divide-emerald-100">
            {cartSafe.map((p) => {
              const unitSafe =
                p.precio_unitario > 0
                  ? p.precio_unitario
                  : unitPriceFromProduct(
                      p._pricing || { base: 0, pct: 0, bulkMin: null, bulkPrice: null },
                      p.cantidad
                    );
              const isBulk =
                p._pricing?.bulkMin && p._pricing?.bulkPrice && p.cantidad >= p._pricing.bulkMin && !p._manualDescuento;
              const basePrice = Number(p._pricing?.base || unitSafe);
              const hasDiscount = p._manualDescuento > 0;
              const isDiscountOpen = discountTarget === p.producto_id;
              return (
                <div key={p.producto_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate text-sm">{p.nombre}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                      {hasDiscount ? (
                        <>
                          <span className="line-through text-gray-400">{fmt(basePrice)}</span>
                          <span className="text-emerald-600 font-semibold">{fmt(unitSafe)} ea.</span>
                          <span className="bg-emerald-100 text-emerald-700 font-bold px-1 rounded">
                            {p._manualDescuento}% off
                          </span>
                          <button
                            className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                            title="Remove discount"
                            onClick={() => handleSetDescuento(p.producto_id, 0)}
                          >✕</button>
                        </>
                      ) : (
                        <>
                          <span>{fmt(unitSafe)} ea.</span>
                          {isBulk && <span className="text-emerald-600 font-semibold">• bulk</span>}
                          <button
                            className="text-gray-300 hover:text-blue-500 transition-colors text-[10px] border border-gray-200 hover:border-blue-400 rounded px-1 py-0.5 leading-none"
                            title="Apply discount"
                            onClick={() => { setDiscountTarget(p.producto_id); setDiscountInputVal(""); }}
                          >% off</button>
                        </>
                      )}
                    </div>
                    {isDiscountOpen && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <input
                          type="number"
                          min="0"
                          max={maxDescuentoPct === Infinity ? 100 : maxDescuentoPct}
                          step="1"
                          autoFocus
                          value={discountInputVal}
                          onChange={(e) => setDiscountInputVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSetDescuento(p.producto_id, discountInputVal);
                            if (e.key === "Escape") { setDiscountTarget(null); setDiscountInputVal(""); }
                          }}
                          placeholder="0"
                          className="w-14 border border-blue-400 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <span className="text-xs text-gray-500">
                          %{maxDescuentoPct < Infinity ? ` (max ${maxDescuentoPct}%)` : ""}
                        </span>
                        <button
                          className="bg-blue-500 text-white text-xs rounded-lg px-2 py-1 hover:bg-blue-600 active:scale-95 transition-all"
                          onClick={() => handleSetDescuento(p.producto_id, discountInputVal)}
                        >✓</button>
                        <button
                          className="text-gray-400 hover:text-gray-600 text-xs px-1"
                          onClick={() => { setDiscountTarget(null); setDiscountInputVal(""); }}
                        >✕</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      className="bg-red-500 text-white w-9 h-9 rounded-xl font-bold text-lg hover:bg-red-600 active:scale-95 transition-all shadow"
                      onClick={() => handleEditQuantity(p.producto_id, Math.max(1, p.cantidad - 1))}
                    >−</button>
                    <span className="w-8 text-center font-bold text-lg tabular-nums">{p.cantidad}</span>
                    <button
                      className="bg-emerald-500 text-white w-9 h-9 rounded-xl font-bold text-lg hover:bg-emerald-600 active:scale-95 transition-all shadow"
                      onClick={() => handleEditQuantity(p.producto_id, p.cantidad + 1)}
                    >+</button>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-emerald-700 text-sm">{fmt(p.cantidad * unitSafe)}</div>
                    <button
                      className="text-xs text-red-500 hover:text-red-700 transition-colors"
                      onClick={() => handleRemoveProduct(p.producto_id)}
                    >🗑 Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STOCK WARNING (pendiente retomado con stock insuficiente) ── */}
      {pendingStockIssues.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-orange-600 text-lg">⚠️</span>
            <span className="font-bold text-orange-800 text-sm">
              Stock insuficiente para {pendingStockIssues.length} producto{pendingStockIssues.length > 1 ? "s" : ""} de este pendiente
            </span>
          </div>
          <ul className="space-y-1">
            {pendingStockIssues.map(issue => (
              <li key={issue.producto_id} className="flex items-center justify-between text-sm">
                <span className="text-orange-900 font-medium truncate flex-1 mr-2">{issue.nombre}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  issue.available === 0
                    ? "bg-red-100 text-red-700"
                    : "bg-orange-100 text-orange-700"
                }`}>
                  {issue.available === 0
                    ? "Sin stock"
                    : `Pedido ${issue.requested} · Disponible ${issue.available}`}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-1">
            <button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2 rounded-xl active:scale-95 transition-all"
              onClick={autoAdjustCart}
            >
              Ajustar cantidades automáticamente
            </button>
            <button
              className="px-4 py-2 text-sm text-orange-700 hover:text-orange-900 font-medium transition-colors"
              onClick={() => setPendingStockIssues([])}
            >
              Ignorar
            </button>
          </div>
        </div>
      )}

      {/* ── SEARCH BAR ───────────────────────────────── */}
      <div className="flex gap-2">
        <input
          ref={productSearchRef}
          type="text"
          placeholder="🔍 Search by name, code or brand…   ↓ navigate · ↵ add first · Esc clear"
          className="flex-1 border-2 border-gray-300 rounded-xl p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (products.length > 0) setFocusedProductIdx(0);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const idx = focusedProductIdx >= 0 ? focusedProductIdx : 0;
              if (products[idx]) handleAddProduct(products[idx]);
            } else if (e.key === "Escape") {
              setProductSearch("");
              setFocusedProductIdx(-1);
            }
          }}
        />
        <button
          onClick={() => setShowScanner(true)}
          className="bg-blue-600 text-white px-4 py-3 rounded-xl font-semibold shadow-md hover:bg-blue-700 hover:shadow-lg active:scale-95 transition-all duration-200 flex items-center gap-2 whitespace-nowrap"
        >
          📷 <span className="hidden sm:inline">Scan</span>
        </button>
      </div>

      {/* ── NOT FOUND ALERT ──────────────────────────── */}
      {noProductFound && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-500 p-4 rounded-lg flex items-start justify-between gap-3">
          <span className="text-yellow-800 text-sm">
            ❌ "<b>{noProductFound}</b>" no existe en el sistema
          </span>
          <button
            className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-lg px-3 py-1.5 text-sm font-semibold shadow-md hover:shadow-lg transition-all whitespace-nowrap"
            onClick={() => navigate(`/productos/nuevo?codigo=${encodeURIComponent(noProductFound)}`)}
          >✨ Crear</button>
        </div>
      )}

      {/* ── EXISTS BUT NOT IN VAN ────────────────────── */}
      {productExistsNotInVan && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400 p-4 rounded-lg flex items-start justify-between gap-3">
          <span className="text-blue-800 text-sm">
            📦 "<b>{productExistsNotInVan}</b>" existe en el sistema pero no tiene stock en esta van
          </span>
        </div>
      )}

      {/* ── PRODUCT RESULTS ──────────────────────────── */}
      <div
        ref={productListRef}
        className="max-h-[360px] lg:max-h-[500px] overflow-auto space-y-2 bg-gray-50 rounded-xl p-2 border border-gray-200"
      >
        {productError && !searchActive && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">🚫 {productError}</div>
        )}

        {products.length === 0 && !noProductFound && (
          <div className="text-gray-400 text-center py-12">
            {searchActive ? (
              searchingInDB ? (
                <><div className="text-2xl mb-2">⏳</div><div className="text-sm">Searching inventory…</div></>
              ) : (
                <><div className="text-2xl mb-2">🔍</div><div className="text-sm">No results found</div></>
              )
            ) : (
              <>
                <div className="text-3xl mb-2">📦</div>
                <div className="text-sm">Search for a product or scan a barcode</div>
                <div className="text-xs mt-2 text-gray-300 hidden sm:block">↓ navigate list · ↵ Enter adds first result · Esc clears</div>
              </>
            )}
          </div>
        )}

        {(products || []).map((p, i) => {
          const inCart    = cartSafe.find((x) => x.producto_id === p.producto_id);
          const isFocused = i === focusedProductIdx;
          const name      = p.productos?.nombre ?? p.nombre ?? "—";
          const code      = p.productos?.codigo ?? p.codigo ?? null;
          const brand     = p.productos?.marca ?? p.marca ?? null;
          const price     = Number(p.productos?.precio ?? p.precio ?? 0);
          const stock     = Number(p.cantidad ?? p.stock ?? 0);
          const size      =
            p.productos?.tamano ?? p.tamano ??
            p.productos?.talla  ?? p.talla  ??
            p.productos?.presentacion ?? p.presentacion ?? null;

          const stockColor =
            stock === 0  ? "bg-red-100 text-red-700"
            : stock <= 3 ? "bg-amber-100 text-amber-700"
            : "bg-emerald-100 text-emerald-700";
          const stockDot = stock === 0 ? "🔴" : stock <= 3 ? "🟡" : "🟢";

          return (
            <div
              key={p.producto_id ?? p.id}
              data-product-idx={i}
              onMouseEnter={() => setFocusedProductIdx(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setFocusedProductIdx(prev => Math.min(prev + 1, products.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); if (i === 0) { productSearchRef.current?.focus(); setFocusedProductIdx(-1); } else setFocusedProductIdx(prev => Math.max(prev - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); handleAddProduct(p); }
              }}
              tabIndex={isFocused ? 0 : -1}
              className={`bg-white rounded-xl border-2 transition-all duration-150 shadow-sm overflow-hidden outline-none ${
                isFocused
                  ? "border-blue-500 ring-2 ring-blue-200"
                  : inCart
                  ? "border-emerald-300"
                  : "border-gray-200 hover:border-blue-200"
              }`}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-semibold text-sm truncate mb-1.5 ${inCart ? "text-emerald-800" : "text-gray-900"}`}
                    title={name}
                  >
                    {inCart && <span className="text-emerald-500 mr-1">✓</span>}
                    {name}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {code && (
                      <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full border border-gray-200 font-mono">#{code}</span>
                    )}
                    {brand && (
                      <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full border border-blue-200">{brand}</span>
                    )}
                    {size && (
                      <span className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded-full border border-purple-200">{size}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stockColor}`}>
                      {stockDot} {stock} in stock
                    </span>
                  </div>
                </div>
                {/* Price + action */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="font-bold text-blue-700 text-base">{fmt(price)}</div>
                  {!inCart ? (
                    <button
                      disabled={stock === 0}
                      onClick={() => handleAddProduct(p)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95 ${
                        stock === 0
                          ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                      }`}
                    >
                      {stock === 0 ? "Out of stock" : "+ Add"}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        className="bg-red-500 text-white w-9 h-9 rounded-xl font-bold text-lg hover:bg-red-600 active:scale-95 transition-all shadow"
                        onClick={() => handleEditQuantity(p.producto_id, Math.max(1, inCart.cantidad - 1))}
                      >−</button>
                      <input
                        type="number"
                        min={1}
                        max={stock}
                        value={inCart.cantidad}
                        onChange={(e) =>
                          handleEditQuantity(p.producto_id, Math.max(1, Math.min(Number(e.target.value), stock)))
                        }
                        className="w-12 h-9 border-2 border-gray-200 rounded-lg text-center font-bold text-sm focus:border-blue-500 outline-none"
                      />
                      <button
                        className="bg-emerald-500 text-white w-9 h-9 rounded-xl font-bold text-lg hover:bg-emerald-600 active:scale-95 transition-all shadow"
                        onClick={() => handleEditQuantity(p.producto_id, Math.min(stock, inCart.cantidad + 1))}
                      >+</button>
                    </div>
                  )}
                </div>
              </div>
              {/* In-cart footer row */}
              {inCart && (
                <div className="bg-emerald-50 border-t border-emerald-100 px-3 py-1.5 flex items-center justify-between">
                  <span className="text-xs text-emerald-700">
                    In cart: {inCart.cantidad} × {fmt(price)} = <b>{fmt(inCart.cantidad * price)}</b>
                  </span>
                  <button
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                    onClick={() => handleRemoveProduct(p.producto_id)}
                  >🗑 Remove</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── NOTES ────────────────────────────────────── */}
      <div>
        <textarea
          className="w-full border-2 border-gray-300 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all resize-none text-sm"
          placeholder="📝 Invoice notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* ── CREDIT SUMMARY ───────────────────────────── */}
      {selectedClient && selectedClient.id && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {balanceBefore > 0 && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-center">
              <div className="text-xs text-red-600 uppercase font-semibold tracking-wide">Outstanding Balance</div>
              <div className="text-xl font-bold text-red-700 mt-1">{fmt(balanceBefore)}</div>
            </div>
          )}
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 text-center">
            <div className="text-xs text-orange-600 uppercase font-semibold tracking-wide">Goes to A/R</div>
            <div className={`text-xl font-bold mt-1 ${amountToCredit > 0 ? "text-orange-700" : "text-emerald-700"}`}>
              {fmt(amountToCredit)}
            </div>
          </div>
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 text-center">
            <div className="text-xs text-emerald-600 uppercase font-semibold tracking-wide">Credit Available After</div>
            <div className={`text-xl font-bold mt-1 ${creditAvailableAfter >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {fmt(creditAvailableAfter)}
            </div>
          </div>
        </div>
      )}

      {/* ── NAVIGATION ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4">
        <button
          className="bg-gray-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-600 transition-colors shadow-md order-2 sm:order-1"
          onClick={() => setStep(1)}
        >← Back</button>
        <button
          className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200 flex-1 sm:flex-none order-1 sm:order-2"
          disabled={cartSafe.length === 0}
          onClick={() => setStep(3)}
        >Next → Payment</button>
      </div>

      {/* ── SCANNER MODAL ────────────────────────────── */}
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
/* ======================== Step 3: Payment ======================== */
function renderStepPayment() {
  const getPaymentLabel = (p) => {
    if (p?.toAR) return "Amount to A/R";
    const found = PAYMENT_METHODS.find(fp => fp.key === p.forma);
    return found?.label ?? p.forma ?? "Method";
  };

  const netOwed = balanceBefore + saleTotal; // prior debt + this sale

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">💳 Payment</h2>
        {taxRate > 0 && (
          <button
            onClick={() => setTaxEnabled(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
              taxEnabled
                ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                : "bg-white border-gray-300 text-gray-600 hover:border-emerald-400"
            }`}
          >
            <span>{taxEnabled ? "🧾" : "🪙"}</span>
            <span>{taxEnabled ? `${taxName} ON (${taxRate}%)` : `Apply ${taxName}`}</span>
          </button>
        )}
      </div>

      {/* ── TAX BREAKDOWN (when tax is on) ───────────── */}
      {taxEnabled && taxRate > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>Subtotal</span>
            <span className="font-semibold">{fmt(saleTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-amber-700">
            <span>{taxName} ({taxRate}%){taxIncluded ? " — included" : ""}</span>
            <span className="font-semibold">+{fmt(taxAmount)}</span>
          </div>
          <div className="flex items-center justify-between font-bold text-gray-900 border-t border-amber-300 pt-1">
            <span>Total with {taxName}</span>
            <span>{fmt(saleTotalWithTax)}</span>
          </div>
        </div>
      )}

      {/* ── SALE SUMMARY (always visible) ────────────── */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
        {/* Header: client */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-sm">{selectedClient?.nombre || "Walk-in / Quick Sale"}</div>
            {selectedClient?.id && (
              <div className="text-slate-300 text-xs font-mono mt-0.5">#{getCreditNumber(selectedClient)}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-slate-300 text-xs uppercase tracking-wide">{balanceBefore > 0 ? "Total Owed" : "Total"}</div>
            <div className="text-white font-extrabold text-xl">{fmt(totalAPagar)}</div>
          </div>
        </div>

        {/* Metrics grid */}
        {(() => {
          const showAR = !!selectedClient?.id;
          const cols = balanceBefore > 0 ? (showAR ? 4 : 3) : (showAR ? 3 : 2);
          return (
            <div className={`grid gap-0 divide-x divide-gray-100 grid-cols-${cols}`}>
              {balanceBefore > 0 && (
                <div className="p-3 text-center bg-red-50">
                  <div className="text-[10px] uppercase text-red-600 font-semibold tracking-wide">Prior Balance</div>
                  <div className="text-lg font-bold text-red-700 mt-0.5">{fmt(balanceBefore)}</div>
                </div>
              )}
              <div className="p-3 text-center bg-blue-50">
                <div className="text-[10px] uppercase text-blue-600 font-semibold tracking-wide">This Sale</div>
                <div className="text-lg font-bold text-blue-800 mt-0.5">{fmt(saleTotalWithTax)}</div>
                {taxEnabled && taxAmount > 0 && (
                  <div className="text-[10px] text-blue-500 mt-0.5">{taxName} {taxRate}%: +{fmt(taxAmount)}</div>
                )}
              </div>
              <div className="p-3 text-center bg-emerald-50">
                <div className="text-[10px] uppercase text-emerald-600 font-semibold tracking-wide">Paid Now</div>
                <div className="text-lg font-bold text-emerald-700 mt-0.5">{fmt(paid)}</div>
              </div>
              {showAR && (
                <div className={`p-3 text-center ${amountToCredit > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
                  <div className={`text-[10px] uppercase font-semibold tracking-wide ${amountToCredit > 0 ? "text-amber-600" : "text-gray-500"}`}>Goes to A/R</div>
                  <div className={`text-lg font-bold mt-0.5 ${amountToCredit > 0 ? "text-amber-700" : "text-gray-400"}`}>{fmt(amountToCredit)}</div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Change banner */}
        {change > 0 && (
          <div className="bg-green-500 px-4 py-2 flex items-center justify-between">
            <span className="text-white font-semibold text-sm">💵 Change to give back</span>
            <span className="text-white font-extrabold text-lg">{fmt(change)}</span>
          </div>
        )}

        {/* Overpayment warning */}
        {mostrarAdvertencia && (
          <div className="bg-orange-50 border-t border-orange-200 px-4 py-2">
            <div className="text-orange-700 text-sm font-semibold text-center">⚠️ Payment exceeds total owed — please review</div>
          </div>
        )}
      </div>

      {/* ── FIFO BREAKDOWN (only when prior debt exists) ─── */}
      {oldDebt > 0 && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => setShowFifo(v => !v)}
          >
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">💡 How this payment is applied</span>
            <span className={`text-gray-400 text-xs transition-transform duration-200 ${showFifo ? "rotate-180" : ""}`}>▼</span>
          </button>
          {showFifo && (
            <div className="px-4 pb-4 space-y-2">
              <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <div className="text-sm text-red-700">
                  <span className="font-bold">1️⃣ Prior balance</span>
                  <span className="text-xs ml-2 text-red-500">({fmt(oldDebt)})</span>
                </div>
                <div className="font-bold text-red-800">{fmt(paidToOldDebt)} applied</div>
              </div>
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <div className="text-sm text-blue-700">
                  <span className="font-bold">2️⃣ This sale</span>
                  <span className="text-xs ml-2 text-blue-500">({fmt(saleTotal)})</span>
                </div>
                <div className="font-bold text-blue-800">{fmt(paidForSale)} applied</div>
              </div>
              <div className="flex items-center justify-between bg-gray-50 border-2 border-gray-300 rounded-lg px-3 py-2">
                <div className="text-sm font-bold text-gray-700">Remaining on A/R</div>
                <div className={`font-bold text-lg ${amountToCredit > 0 ? "text-amber-700" : "text-emerald-700"}`}>{fmt(amountToCredit)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ACCOUNT BALANCE SUMMARY (client-facing) ──── */}
      {selectedClient?.id && (
        <div className="rounded-xl overflow-hidden border-2 border-indigo-200 shadow-sm">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-indigo-900 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <span className="text-white font-bold text-sm">Account Balance Summary</span>
            </div>
          </div>
          {/* Rows */}
          <div className="bg-white divide-y divide-gray-100">
            {balanceBefore > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-gray-600">Prior Balance</span>
                <span className="font-bold text-red-700">{fmt(balanceBefore)}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-600">+ Today's Sale</span>
              <span className="font-bold text-blue-700">+ {fmt(saleTotal)}</span>
            </div>
            {balanceBefore > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">= Total</span>
                <span className="font-bold text-gray-900">{fmt(balanceBefore + saleTotal)}</span>
              </div>
            )}
            {paid > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-gray-600">− Payment Today</span>
                <span className="font-bold text-emerald-700">− {fmt(paid)}</span>
              </div>
            )}
            {change > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-gray-600">Change returned</span>
                <span className="font-bold text-gray-500">+ {fmt(change)}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <span className="font-bold text-gray-800">New Balance</span>
              <span className={`text-2xl font-extrabold ${balanceAfter > 0 ? "text-red-700" : "text-emerald-600"}`}>
                {fmt(balanceAfter)}
              </span>
            </div>
          </div>
          {balanceAfter === 0 && (
            <div className="bg-emerald-50 border-t border-emerald-200 px-4 py-2 text-center text-emerald-700 text-sm font-bold">
              🎉 Account fully paid!
            </div>
          )}
        </div>
      )}

      {/* ── SHOW TO CLIENT (big prominent button) ─── */}
      {selectedClient?.id && (
        <button
          onClick={() => setShowBalanceSummary(true)}
          className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white py-4 rounded-xl font-bold text-base shadow-lg hover:shadow-xl active:scale-98 transition-all flex items-center justify-center gap-3"
        >
          <span className="text-xl">📱</span>
          Show Summary to Client
          <span className="text-xl">👤</span>
        </button>
      )}

      {/* ── MIN PAYMENT ALERT ─────────────────────────── */}
      {oldDebt > 0 && pagoMinimo > 0 && (
        <div className={`rounded-xl border-2 p-4 ${cubrioMinimo ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-400"}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`font-bold ${cubrioMinimo ? "text-green-800" : "text-amber-800"}`}>
                {cubrioMinimo ? "✅ Minimum payment met" : "⚠️ Minimum payment not met"}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Prior balance: <b>{fmt(oldDebt)}</b> · Min. required: <b>{fmt(pagoMinimo)}</b>
                {pagoMinimo >= oldDebt ? " (full balance)" : " (20% or $30)"}
              </div>
            </div>
            {!cubrioMinimo && (
              <div className="text-right">
                <div className="text-xs text-amber-700">Still needed</div>
                <div className="text-xl font-bold text-amber-800">{fmt(faltaParaMinimo)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CREDIT LIMIT WARNING ──────────────────────── */}
      {excesoCredito > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3 text-center">
          <div className="text-rose-700 font-semibold">❌ Credit Limit Exceeded</div>
          <div className="text-rose-600 text-sm mt-1">
            Needed: <b>{fmt(amountToCredit)}</b> · Available: <b>{fmt(creditAvailable)}</b> · Excess: <b>{fmt(excesoCredito)}</b>
          </div>
        </div>
      )}

      {/* ── PAYMENT METHODS ───────────────────────────── */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-gray-900">Payment Methods</div>
          <button
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200"
            onClick={handleAddPayment}
          >➕ Add Method</button>
        </div>

        <div className="space-y-3">
          {payments.map((p, i) => (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200" key={i}>
              <div className="flex flex-col gap-3">
                {/* Row 1: method selector + amount */}
                <div className="flex items-center gap-2">
                  {p?.toAR ? (
                    <div className="flex-1 border-2 border-amber-300 bg-amber-50 rounded-lg px-3 py-2 font-semibold text-amber-800">
                      {getPaymentLabel(p)}
                    </div>
                  ) : (
                    <select
                      value={p.forma}
                      onChange={(e) => handleChangePayment(i, "forma", e.target.value)}
                      className="flex-1 border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 outline-none transition-all"
                    >
                      {PAYMENT_METHODS.map((fp) => (
                        <option key={fp.key} value={fp.key}>{fp.label}</option>
                      ))}
                    </select>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-500">$</span>
                    <input
                      type="text"
                      value={p?.toAR ? String(Number(amountToCredit).toFixed(2)) : (p.monto === 0 ? "" : p.monto)}
                      onChange={(e) => {
                        if (p?.toAR) return;
                        handleChangePayment(i, "monto", e.target.value.trim() || 0);
                      }}
                      onFocus={(e) => { if (!p?.toAR && p.monto === 0) e.target.value = ""; }}
                      onBlur={(e) => {
                        if (p?.toAR) return;
                        const val = e.target.value.trim();
                        if (!val || val === "." || val === "0") { handleChangePayment(i, "monto", 0); }
                        else {
                          const num = parseFloat(val);
                          handleChangePayment(i, "monto", !isNaN(num) && num > 0 ? Number(num.toFixed(2)) : 0);
                        }
                      }}
                      readOnly={!!p?.toAR}
                      disabled={!!p?.toAR}
                      className={`w-28 border-2 rounded-lg px-3 py-2 text-right font-bold focus:border-blue-500 outline-none ${
                        p?.toAR ? "bg-amber-50 border-amber-300 text-amber-800 cursor-not-allowed" : "border-gray-300"
                      }`}
                      placeholder="0.00"
                    />
                  </div>

                  {payments.length > 1 && !p?.toAR && (
                    <button
                      className="bg-red-500 text-white w-9 h-9 rounded-full hover:bg-red-600 transition-colors shadow-md flex-shrink-0"
                      onClick={() => handleRemovePayment(i)}
                    >✕</button>
                  )}
                </div>

                {p?.toAR && (
                  <div className="text-sm text-amber-700">
                    Sent to A/R → <b>{fmt(amountToCredit)}</b>
                  </div>
                )}

                {/* Transfer sub-method chips */}
                {p.forma === "transferencia" && !p?.toAR && (
                  <div className="pt-1 border-t border-gray-100">
                    <div className="text-[10px] uppercase text-gray-500 font-semibold mb-1.5 tracking-wide">Via</div>
                    <div className="flex flex-wrap gap-2">
                      {TRANSFER_SUBS.map((s) => {
                        const active = p.subMetodo === s.key;
                        return (
                          <button
                            key={s.key}
                            onClick={() => handleChangePayment(i, "subMetodo", active ? null : s.key)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 shadow-sm border-2 ${
                              active
                                ? `${s.color} text-white border-transparent shadow-md`
                                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                      {p.subMetodo && (
                        <span className="text-xs text-gray-400 self-center ml-1">
                          ✓ {TRANSFER_SUBS.find(s => s.key === p.subMetodo)?.label}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Row 2: action buttons */}
                <div className="flex items-center gap-2">
                  {!p?.toAR ? (
                    <button
                      onClick={() => {
                        handleChangePayment(i, "monto", 0);
                        setPayments(prev => prev.map((x, idx) => idx === i ? { ...x, toAR: true } : x));
                      }}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-md flex items-center justify-center gap-1"
                    >📋 Send to A/R</button>
                  ) : (
                    <button
                      onClick={() => setPayments(prev => prev.map((x, idx) => idx === i ? { ...x, toAR: false } : x))}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-md flex items-center justify-center gap-1"
                    >↩️ Undo A/R</button>
                  )}
                  {!p?.toAR && p.forma === "tarjeta" && (
                    <button
                      onClick={() => handleGenerateQR(i)}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-semibold shadow-md transition-colors flex items-center justify-center gap-1"
                    >📱 QR Pay</button>
                  )}
                </div>

                {/* Card fee toggle */}
                {p.forma === "tarjeta" && (
                  <div className="pt-2 border-t border-gray-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyCardFee[i] || false}
                        onChange={(e) => setApplyCardFee(prev => ({ ...prev, [i]: e.target.checked }))}
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
                    {applyCardFee[i] && (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs text-gray-600">Fee %:</label>
                        <input
                          type="number" min="0" max="10" step="0.1"
                          value={cardFeePercentage}
                          onChange={(e) => setCardFeePercentage(Math.max(0, Math.min(10, Number(e.target.value))))}
                          className="w-16 border rounded px-2 py-1 text-sm"
                        />
                        <span className="text-xs text-gray-500">(Fee: {fmt(Number(p.monto) * (cardFeePercentage / 100))})</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PAYMENT AGREEMENTS ───────────────────────── */}
      {selectedClient?.id && (
        <ClientPaymentView
          compact
          clienteId={selectedClient.id}
          clienteName={`${selectedClient?.nombre || ""} ${selectedClient?.apellido || ""}`.trim()}
          balanceActual={balanceBefore}
          ventaHoy={saleTotal}
          montoAPagar={paid}
          pagoMinimo={pagoMinimo}
          acuerdosData={acuerdosResumen}
        />
      )}

      {/* ── NAVIGATION ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          className="bg-gray-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-600 transition-colors shadow-md order-2 sm:order-1"
          onClick={() => setStep(2)}
          disabled={saving}
        >← Back</button>
        <button
          className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-8 py-4 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-200 flex-1 sm:flex-none order-1 sm:order-2 text-lg"
          disabled={saving || (showCreditPanel && amountToCredit > 0 && amountToCredit > creditAvailable)}
          onClick={saveSale}
        >
          {saving ? "💾 Saving…" : "💾 Save Sale"}
        </button>
      </div>

      {paymentError && (
        <div className="bg-red-100 border border-red-300 rounded-xl p-4 text-red-700 font-semibold text-center">
          {paymentError}
        </div>
      )}

      {/* ── CLIENT BALANCE SUMMARY MODAL ─────────────── */}
      {showBalanceSummary && (
        <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
          style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #1e3a5f 100%)" }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-4 bg-black/30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-slate-300 text-sm font-semibold">Showing to client</span>
            </div>
            <button
              onClick={() => setShowBalanceSummary(false)}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition-colors"
            >✖ Close</button>
          </div>

          {/* Client name + date */}
          <div className="text-center pt-8 pb-4 flex-shrink-0">
            <div className="text-slate-400 text-xs uppercase tracking-[0.25em] font-bold mb-2">Account Summary</div>
            <div className="text-4xl font-black text-white tracking-tight">
              {`${selectedClient?.nombre || ""} ${selectedClient?.apellido || ""}`.trim() || "Client"}
            </div>
            <div className="text-slate-400 text-sm mt-2">
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>

          {/* Content rows */}
          <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3">
            {/* Prior balance */}
            {balanceBefore > 0 && (
              <div className="bg-white/10 backdrop-blur rounded-2xl px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-slate-300 text-xs uppercase font-bold tracking-wide">Previous Balance</div>
                  <div className="text-slate-400 text-xs mt-0.5">Amount owed before this visit</div>
                </div>
                <div className="text-3xl font-black text-red-400">{fmt(balanceBefore)}</div>
              </div>
            )}

            {/* This sale */}
            <div className="bg-white/10 backdrop-blur rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <div className="text-slate-300 text-xs uppercase font-bold tracking-wide">Today's Purchase</div>
                <div className="text-slate-400 text-xs mt-0.5">{cartSafe.length} item{cartSafe.length !== 1 ? "s" : ""}</div>
              </div>
              <div className="text-3xl font-black text-blue-300">+ {fmt(saleTotal)}</div>
            </div>

            {/* Total subtotal (prior + sale) */}
            {balanceBefore > 0 && (
              <div className="border-t border-white/20 pt-1">
                <div className="bg-white/5 border border-white/20 rounded-2xl px-5 py-3 flex items-center justify-between">
                  <div className="text-slate-300 text-sm font-bold uppercase tracking-wide">= Total</div>
                  <div className="text-2xl font-black text-white">{fmt(balanceBefore + saleTotal)}</div>
                </div>
              </div>
            )}

            {/* Payment */}
            {paid > 0 && (
              <div className="bg-white/10 backdrop-blur rounded-2xl px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-slate-300 text-xs uppercase font-bold tracking-wide">Payment Today</div>
                  <div className="text-slate-400 text-xs mt-0.5">Amount received</div>
                </div>
                <div className="text-3xl font-black text-emerald-400">− {fmt(paid)}</div>
              </div>
            )}

            {/* Divider + New balance */}
            <div className={`rounded-2xl px-5 py-6 text-center border-2 ${balanceAfter > 0 ? "bg-amber-500/20 border-amber-400/50" : "bg-emerald-500/20 border-emerald-400/50"}`}>
              <div className={`text-xs uppercase font-bold tracking-widest mb-2 ${balanceAfter > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                New Balance
              </div>
              <div className={`text-6xl font-black ${balanceAfter > 0 ? "text-amber-300" : "text-emerald-400"}`}>
                {fmt(balanceAfter)}
              </div>
              {balanceAfter === 0 ? (
                <div className="text-emerald-400 font-bold text-lg mt-3">🎉 Account fully paid!</div>
              ) : (
                <div className="text-slate-400 text-sm mt-2">Remaining on account</div>
              )}
            </div>

            {/* Change row */}
            {change > 0 && (
              <div className="bg-green-500/20 border-2 border-green-400/50 rounded-2xl px-5 py-4 flex items-center justify-between">
                <div className="text-green-300 font-bold">💵 Change to return</div>
                <div className="text-3xl font-black text-green-400">{fmt(change)}</div>
              </div>
            )}
          </div>

          <div className="text-center py-4 text-slate-500 text-xs flex-shrink-0">
            Thank you for your business!
          </div>
        </div>
      )}
    </div>
  );
}

  /* ======================== Render raíz ======================== */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-4xl mx-auto">
        
        {/* Indicador de red y sync — flota en esquina inferior derecha */}
        <NetworkIndicator
          syncing={syncingData}
          ventasPendientes={ventasPendientes}
          lastSync={lastSync}
          syncError={syncError}
          onSyncNow={sincronizarAhora}
        />

        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          {modalPendingSales && renderPendingSalesModal()}
          {showQRModal && renderQRModal()}

        <AgreementModal
            isOpen={!!pendingAgreementData?.waiting}
            onClose={() => {
              setPendingAgreementData(null);
              setSaving(false);
            }}
         onConfirm={(result) => {
  setPendingAgreementData({
    ...pendingAgreementData,
    waiting: false,
    plan: result.plan,
    numCuotas: result.numCuotas,
    isException: result.isException,
    exceptionNote: result.exceptionNote,
    skipped: result.skipped || false, // 🆕
  });
  setTimeout(() => saveSale(), 100);
}}
            montoCredito={pendingAgreementData?.montoCredito || 0}
            clientName={pendingAgreementData?.clientName || ''}
            saldoActual={pendingAgreementData?.saldoActual || 0}
            reglasCredito={reglasCredito}
          />

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
  className="w-full border rounded-lg px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
  disabled={savingAdjust} // 🆕 AGREGAR
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
  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
  disabled={savingAdjust} // 🆕 DESHABILITAR MIENTRAS GUARDA
  onClick={async () => {
    const amt = Number(adjustAmount);
    const { id: uid } = usuario || {};
    
    if (!selectedClient?.id) {
      alert("No hay cliente seleccionado");
      return;
    }
    
    if (!amt || isNaN(amt) || amt <= 0) {
      alert("Monto inválido");
      return;
    }

    setSavingAdjust(true); // 🆕 DESHABILITAR BOTÓN
    
    try {
      const { error } = await supabase.rpc("cxc_crear_ajuste_inicial", {
        p_cliente_id: selectedClient.id,
        p_monto: amt,
        p_usuario_id: uid,
        p_nota: adjustNote || null,
      });
      
      if (error) {
        throw error;
      }

      // Refrescar crédito
      try {
        const info = await getCxcCliente(selectedClient.id);
        if (info) {
          setCxcLimit(info.limite);
          setCxcAvailable(info.disponible);
          setCxcBalance(info.saldo);
        }
      } catch (refreshErr) {
        console.warn("Error refreshing credit:", refreshErr);
      }
      
      // Cerrar modal y resetear
      setShowAdjustModal(false);
      setAdjustAmount("");
      setAdjustNote("Saldo viejo importado");
      alert("✅ Opening balance saved");
      
    } catch (error) {
      alert("❌ Error: " + (error.message || error));
    } finally {
      setSavingAdjust(false); // 🆕 REHABILITAR BOTÓN
    }
  }}
>
  {savingAdjust ? "💾 Guardando..." : "Save"} {/* 🆕 TEXTO DINÁMICO */}
</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sale block / override modal ── */}
      {saleBlockModal && (
        <SaleBlockModal
          type={saleBlockModal.type}
          message={saleBlockModal.message}
          onOverride={(note) => {
            const r = saleBlockModal.resolve;
            setSaleBlockModal(null);
            r(note);
          }}
          onCancel={() => {
            const r = saleBlockModal.resolve;
            setSaleBlockModal(null);
            r(null);
          }}
        />
      )}

      {/* ── Guest contact modal (venta sin cliente) ── */}
      {guestContactModal && (
        <GuestContactModal
          onConfirm={(contact) => {
            const r = guestContactModal.resolve;
            setGuestContactModal(null);
            r(contact);
          }}
          onSkip={() => {
            const r = guestContactModal.resolve;
            setGuestContactModal(null);
            r(null);
          }}
        />
      )}

      {/* ── Channel selection modal ── */}
      {channelModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Send Receipt</h3>
            <p className="text-sm text-gray-500 mb-5">How would you like to send the receipt?</p>
            <div className="flex flex-col gap-3">
              {channelModal.hasPhone && (
                <button
                  onClick={() => { const r = channelModal.resolve; setChannelModal(null); r("sms"); }}
                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                  Send by SMS
                </button>
              )}
              {channelModal.hasEmail && (
                <button
                  onClick={() => { const r = channelModal.resolve; setChannelModal(null); r("email"); }}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Send by Email
                </button>
              )}
              <button
                onClick={() => { const r = channelModal.resolve; setChannelModal(null); r(null); }}
                className="text-gray-500 hover:text-gray-700 font-semibold py-2 rounded-xl transition-colors border border-gray-200 hover:border-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
