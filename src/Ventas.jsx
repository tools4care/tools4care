// src/Ventas.jsx  (puedes llamarlo Sales.jsx si prefieres)
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import { useNavigate } from "react-router-dom";

/* ========================= Config & Constantes ========================= */
const PAYMENT_METHODS = [
  { key: "efectivo", label: "💵 Cash" },
  { key: "tarjeta", label: "💳 Card" },
  { key: "transferencia", label: "🏦 Transfer" },
  { key: "otro", label: "💰 Other" },
];

const STORAGE_KEY = "pending_sales";
const SECRET_CODE = "#ajuste2025";

const COMPANY_NAME = import.meta?.env?.VITE_COMPANY_NAME || "Tools4Care";
const COMPANY_EMAIL = import.meta?.env?.VITE_COMPANY_EMAIL || "no-reply@example.com";
/** "mailto" = abre cliente del usuario; "edge" = usa Supabase Edge Function "send-receipt" */
const EMAIL_MODE = (import.meta?.env?.VITE_EMAIL_MODE || "mailto").toLowerCase();

/* ========================= Helpers de negocio ========================= */
function policyLimit(score) {
  const s = Number(score ?? 600);
  if (s < 500) return 0;
  if (s < 550) return 50;
  if (s < 600) return 100;
  if (s < 650) return 150;
  if (s < 700) return 300;
  if (s < 750) return 550;
  if (s < 800) return 750;
  return 1000;
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
/** 1) bulk si qty>=bulkMin; 2) % descuento; 3) base */
function unitPriceFromProduct({ base, pct, bulkMin, bulkPrice }, qty) {
  const q = Number(qty || 0);
  const hasBulk = bulkMin != null && bulkPrice != null && q >= Number(bulkMin);
  if (hasBulk) return r2(bulkPrice);
  const pctNum = Number(pct || 0);
  if (pctNum > 0) return r2(base * (1 - pctNum / 100));
  return r2(base);
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

/* ======= Composición de recibos ======= */
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
    toCredit,
    creditLimit,
    availableBefore,
    availableAfter,
  } = payload;

  const lines = [];
  lines.push(`${COMPANY_NAME} — Receipt`);
  lines.push(`Date: ${dateStr}`);
  if (pointOfSaleName) lines.push(`Point of sale: ${pointOfSaleName}`);
  if (clientName) lines.push(`Customer: ${clientName} (Credit #${creditNumber || "—"})`);
  lines.push("");
  lines.push("Items:");
  for (const it of items) {
    lines.push(`• ${it.name} — ${it.qty} x ${fmt(it.unit)} = ${fmt(it.subtotal)}`);
  }
  lines.push("");
  lines.push(`Sale total: ${fmt(saleTotal)}`);
  lines.push(`Paid now:   ${fmt(paid)}`);
  if (change > 0) lines.push(`Change:      ${fmt(change)}`);
  lines.push(`Previous balance: ${fmt(prevBalance)}`);
  if (toCredit > 0) lines.push(`*** Balance due (new): ${fmt(toCredit)} ***`);
  lines.push("");
  if (creditLimit > 0) {
    lines.push(`Credit limit:       ${fmt(creditLimit)}`);
    lines.push(`Available before:   ${fmt(availableBefore)}`);
    lines.push(`*** Available now:  ${fmt(availableAfter)} ***`);
  }
  lines.push("");
  lines.push(`Msg&data rates may apply. Reply STOP to opt out. HELP for help.`);
  return lines.join("\n");
}
async function askChannel({ hasPhone, hasEmail }) {
  if (!hasPhone && !hasEmail) return null;
  if (hasPhone && !hasEmail) return window.confirm("¿Enviar recibo por SMS?") ? "sms" : null;
  if (!hasPhone && hasEmail) return window.confirm("¿Enviar recibo por Email?") ? "email" : null;
  const ans = (window.prompt("¿Cómo quieres enviar el recibo? (sms / email)", "sms") || "")
    .trim()
    .toLowerCase();
  if (ans === "sms" && hasPhone) return "sms";
  if (ans === "email" && hasEmail) return "email";
  return null;
}
async function requestAndSendNotifications({ client, payload }) {
  const hasPhone = !!client?.telefono;
  const hasEmail = !!client?.email;
  if (!hasPhone && !hasEmail) return;

  const wants = await askChannel({ hasPhone, hasEmail });
  if (!wants) return;

  const subject = `${COMPANY_NAME} — Receipt ${new Date().toLocaleDateString()}`;
  const text = composeReceiptMessageEN(payload);
  const html = text;

  if (wants === "sms") {
    await sendSmsIfPossible({ phone: client.telefono, text });
  } else if (wants === "email") {
    await sendEmailSmart({ to: client.email, subject, html, text });
  }
}

/* ========================= Componente ========================= */
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
  const [products, setProducts] = useState([]); // lista para buscador
  const [topProducts, setTopProducts] = useState([]); // top 10
  const [allProducts, setAllProducts] = useState([]); // inventario completo
  const [allProductsLoading, setAllProductsLoading] = useState(false);
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

  // ---- CxC de cliente actual (vista oficial)
  const [cxcLimit, setCxcLimit] = useState(null);
  const [cxcAvailable, setCxcAvailable] = useState(null);
  const [cxcBalance, setCxcBalance] = useState(null);

  // ---- Modo Migración (secreto)
  const [migrationMode, setMigrationMode] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("Saldo viejo importado");

  /* ---------- Debounce del buscador de cliente ---------- */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedClientSearch(clientSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [clientSearch]);

  /* ---------- Cargar pendientes ---------- */
  useEffect(() => {
    setPendingSales(readPendingLS());
  }, []);

  /* ---------- CLIENTES (búsqueda + saldo real) ---------- */
  useEffect(() => {
    async function loadClients() {
      const term = debouncedClientSearch;
      if (!term) {
        setClients([]);
        return;
      }
      setClientLoading(true);
      try {
        const orParts = [
          `nombre.ilike.%${term}%`,
          `apellido.ilike.%${term}%`,
          `negocio.ilike.%${term}%`,
          `telefono.ilike.%${term}%`,
          `email.ilike.%${term}%`,
          `direccion.ilike.%${term}%`,
        ].join(",");

        let { data: baseData, error: e1 } = await supabase
          .from("clientes_balance")
          .select("*")
          .or(orParts);

        if (e1) {
          const fallbackOr = [
            `nombre.ilike.%${term}%`,
            `negocio.ilike.%${term}%`,
            `telefono.ilike.%${term}%`,
            `email.ilike.%${term}%`,
          ].join(",");
          const r2 = await supabase.from("clientes_balance").select("*").or(fallbackOr);
          baseData = r2.data || [];
        }

        const tokens = term.split(/\s+/).filter(Boolean);
        let andData = [];
        if (tokens.length >= 2) {
          const first = tokens[0];
          const rest = tokens.slice(1).join(" ");
          const { data: dAnd } = await supabase
            .from("clientes_balance")
            .select("*")
            .ilike("nombre", `%${first}%`)
            .ilike("apellido", `%${rest}%`);
          andData = dAnd || [];
        }

        const byId = new Map();
        for (const x of [...(baseData || []), ...andData]) byId.set(x.id, x);
        const merged = Array.from(byId.values());

        const ids = merged.map((c) => c.id).filter(Boolean);
        let enriched = merged;
        if (ids.length > 0) {
          const { data: cxcRows } = await supabase
            .from("v_cxc_cliente_detalle")
            .select("cliente_id, saldo")
            .in("cliente_id", ids);
          const map = new Map((cxcRows || []).map((r) => [r.cliente_id, Number(r.saldo || 0)]));
          enriched = merged.map((c) => ({
            ...c,
            _saldo_real: map.has(c.id) ? map.get(c.id) : Number(c.balance || 0),
          }));
        }

        setClients(enriched);
      } catch {
        setClients([]);
      } finally {
        setClientLoading(false);
      }
    }
    loadClients();
  }, [debouncedClientSearch]);

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
    async function fetchCxC() {
      setCxcLimit(null);
      setCxcAvailable(null);
      setCxcBalance(null);
      const id = selectedClient?.id;
      if (!id) return;

      try {
        const { data, error } = await supabase
          .from("v_cxc_cliente_detalle")
          .select("limite_politica, credito_disponible, saldo, cliente_id")
          .eq("cliente_id", id)
          .maybeSingle();
        if (!error && data) {
          const lim = Number(data.limite_politica);
          const disp = Number(data.credito_disponible);
          const sal = Number(data.saldo);
          if (!Number.isNaN(lim)) setCxcLimit(lim);
          if (!Number.isNaN(disp)) setCxcAvailable(disp);
          if (!Number.isNaN(sal)) setCxcBalance(sal);
        }
      } catch {}
    }
    fetchCxC();
  }, [selectedClient?.id]);

  /* ---------- TOP productos ---------- */
  useEffect(() => {
    async function loadTopProducts() {
      setProductError("");
      setTopProducts([]);
      if (!van?.id) return;

      // 1) RPC original
      try {
        const { data, error } = await supabase.rpc("productos_mas_vendidos_por_van", {
          van_id_param: van.id,
        });
        if (error) throw error;

        if (Array.isArray(data) && data.length > 0) {
          const top10 = data.slice(0, 10).map((p) => ({
            producto_id: p.producto_id,
            cantidad: p.cantidad_disponible ?? p.cantidad ?? 0,
            productos: {
              nombre: p.nombre,
              precio: p.precio,
              codigo: p.codigo,
              descuento_pct: p.descuento_pct ?? null,
              bulk_min_qty: p.bulk_min_qty ?? null,
              bulk_unit_price: p.bulk_unit_price ?? null,
              marca: p.marca ?? "",
            },
          }));
          setTopProducts(top10);
          return;
        }
        console.warn("RPC productos_mas_vendidos_por_van devolvió vacío.");
      } catch (err) {
        console.warn("RPC productos_mas_vendidos_por_van falló. Fallback a join.", err?.message || err);
      }

      // 2) Join directo stock_van -> productos
      try {
        const { data, error } = await supabase
          .from("stock_van")
          .select(
            "producto_id,cantidad, productos:productos!inner(id,nombre,precio,codigo,descuento_pct,bulk_min_qty,bulk_unit_price,marca)"
          )
          .eq("van_id", van.id)
          .gt("cantidad", 0)
          .order("cantidad", { ascending: false })
          .limit(10);

        if (error) throw error;

        if (Array.isArray(data) && data.length > 0) {
          const rows = data.map((row) => ({
            producto_id: row.producto_id,
            cantidad: row.cantidad ?? 0,
            productos: {
              nombre: row.productos?.nombre,
              precio: row.productos?.precio,
              codigo: row.productos?.codigo,
              descuento_pct: row.productos?.descuento_pct ?? null,
              bulk_min_qty: row.productos?.bulk_min_qty ?? null,
              bulk_unit_price: row.productos?.bulk_unit_price ?? null,
              marca: row.productos?.marca ?? "",
            },
          }));
          setTopProducts(rows);
          return;
        }
        console.warn("Join stock_van→productos devolvió vacío. Fallback a 2 pasos.");
      } catch (err) {
        console.warn("Join stock_van→productos falló. Fallback a 2 pasos.", err?.message || err);
      }

      // 3) 2 pasos (stock luego productos .in())
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
          .select("id,nombre,precio,codigo,descuento_pct,bulk_min_qty,bulk_unit_price,marca")
          .in("id", ids);
        if (e2) throw e2;

        const map = new Map((prods || []).map((p) => [p.id, p]));
        const rows = (stock || []).map((s) => {
          const p = map.get(s.producto_id) || {};
          return {
            producto_id: s.producto_id,
            cantidad: s.cantidad ?? 0,
            productos: {
              nombre: p.nombre,
              precio: p.precio,
              codigo: p.codigo,
              descuento_pct: p.descuento_pct ?? null,
              bulk_min_qty: p.bulk_min_qty ?? null,
              bulk_unit_price: p.bulk_unit_price ?? null,
              marca: p.marca ?? "",
            },
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
  }, [van?.id]);

  /* ---------- INVENTARIO COMPLETO para búsqueda ---------- */
  useEffect(() => {
    async function loadAllProducts() {
      setAllProducts([]);
      setAllProductsLoading(true);
      if (!van?.id) return setAllProductsLoading(false);

      // A) Join directo
      try {
        const { data, error } = await supabase
          .from("stock_van")
          .select(
            "producto_id,cantidad, productos:productos!inner(id,nombre,precio,codigo,descuento_pct,bulk_min_qty,bulk_unit_price,marca)"
          )
          .eq("van_id", van.id)
          .gt("cantidad", 0)
          .order("productos.nombre", { ascending: true });

        if (error) throw error;

        const rows = (data || []).map((row) => ({
          producto_id: row.producto_id,
          cantidad: row.cantidad ?? 0,
          productos: {
            nombre: row.productos?.nombre,
            precio: row.productos?.precio,
            codigo: row.productos?.codigo,
            descuento_pct: row.productos?.descuento_pct ?? null,
            bulk_min_qty: row.productos?.bulk_min_qty ?? null,
            bulk_unit_price: row.productos?.bulk_unit_price ?? null,
            marca: row.productos?.marca ?? "",
          },
        }));
        setAllProducts(rows);
        setAllProductsLoading(false);
        return;
      } catch (err) {
        console.warn("Inventario completo (join) falló. Fallback a 2 pasos.", err?.message || err);
      }

      // B) 2 pasos
      try {
        const { data: stock, error: e1 } = await supabase
          .from("stock_van")
          .select("producto_id,cantidad")
          .eq("van_id", van.id)
          .gt("cantidad", 0);
        if (e1) throw e1;

        const ids = (stock || []).map((r) => r.producto_id);
        if (ids.length === 0) {
          setAllProducts([]);
          setAllProductsLoading(false);
          return;
        }

        const { data: prods, error: e2 } = await supabase
          .from("productos")
          .select("id,nombre,precio,codigo,descuento_pct,bulk_min_qty,bulk_unit_price,marca")
          .in("id", ids);
        if (e2) throw e2;

        const map = new Map((prods || []).map((p) => [p.id, p]));
        const rows = (stock || []).map((s) => {
          const p = map.get(s.producto_id) || {};
          return {
            producto_id: s.producto_id,
            cantidad: s.cantidad ?? 0,
            productos: {
              nombre: p.nombre,
              precio: p.precio,
              codigo: p.codigo,
              descuento_pct: p.descuento_pct ?? null,
              bulk_min_qty: p.bulk_min_qty ?? null,
              bulk_unit_price: p.bulk_unit_price ?? null,
              marca: p.marca ?? "",
            },
          };
        });

        rows.sort((a, b) =>
          String(a.productos?.nombre || "").localeCompare(String(b.productos?.nombre || ""))
        );

        setAllProducts(rows);
      } catch (err2) {
        console.error("Inventario completo (2 pasos) falló:", err2?.message || err2);
        setAllProducts([]);
      } finally {
        setAllProductsLoading(false);
      }
    }

    loadAllProducts();
  }, [van?.id]);

  /* ---------- Filtro del buscador ---------- */
  useEffect(() => {
    const filter = productSearch.trim().toLowerCase();
    const searchActive = filter.length > 0;
    const base = searchActive ? allProducts : topProducts;

    const filtered = !searchActive
      ? base
      : base.filter((row) => {
          const n = (row.productos?.nombre || "").toLowerCase();
          const c = (row.productos?.codigo || "").toLowerCase();
          const m = (row.productos?.marca || "").toLowerCase();
          return n.includes(filter) || c.includes(filter) || m.includes(filter);
        });

    setProducts(filtered);
    setNoProductFound(searchActive && filtered.length === 0 ? productSearch.trim() : "");
  }, [productSearch, topProducts, allProducts]);

  /* ---------- Totales & crédito ---------- */
  const cartSafe = Array.isArray(cart) ? cart : [];

  const saleTotal = cartSafe.reduce((t, p) => t + p.cantidad * p.precio_unitario, 0);
  const paid = payments.reduce((s, p) => s + Number(p.monto || 0), 0);

  // Saldo previo (positivo = debe; negativo = crédito a favor)
  const balanceBeforeRaw =
    cxcBalance != null && !Number.isNaN(Number(cxcBalance))
      ? Number(cxcBalance)
      : Number(getClientBalance(selectedClient));
  const balanceBefore = Number.isFinite(balanceBeforeRaw) ? balanceBeforeRaw : 0;

  const existingCredit = Math.max(0, -balanceBefore);
  const oldDebt = Math.max(0, balanceBefore);

  const saleAfterApplyingCredit = Math.max(0, saleTotal - existingCredit);
  const totalAPagar = oldDebt + saleAfterApplyingCredit;

  const paidForSale = Math.min(paid, saleAfterApplyingCredit);
  const paidToOldDebt = Math.min(oldDebt, Math.max(0, paid - paidForSale));
  const paidApplied = paidForSale + paidToOldDebt;

  const change = Math.max(0, paid - totalAPagar);
  const mostrarAdvertencia = paid > totalAPagar;

  const balanceAfter = balanceBefore + saleTotal - paidApplied;
  const amountToCredit = Math.max(0, balanceAfter) - Math.max(0, balanceBefore);

  // Panel crédito
  const clientScore = Number(selectedClient?.score_credito ?? 600);
  const showCreditPanel = !!selectedClient && (clientHistory.has || balanceBefore !== 0);

  const computedLimit = policyLimit(clientScore);
  const creditLimit = showCreditPanel ? Number(cxcLimit ?? computedLimit) : 0;

  const creditAvailable = showCreditPanel
    ? Number(
        cxcAvailable != null && !Number.isNaN(Number(cxcAvailable))
          ? cxcAvailable
          : Math.max(0, creditLimit - Math.max(0, balanceBefore))
      )
    : 0;

  const creditAvailableAfter = Math.max(0, creditLimit - Math.max(0, balanceAfter));

  /* ---------- Guardar venta pendiente local ---------- */
  useEffect(() => {
    if ((cartSafe.length > 0 || selectedClient) && step < 4) {
      const id = window.pendingSaleId || (window.pendingSaleId = Date.now());
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
  }

  /* ======================== Handlers de productos ======================== */
  function handleAddProduct(p) {
    const exists = cartSafe.find((x) => x.producto_id === p.producto_id);
    const meta = {
      base: Number(p.productos?.precio) || 0,
      pct: Number(p.productos?.descuento_pct) || 0,
      bulkMin: p.productos?.bulk_min_qty != null ? Number(p.productos.bulk_min_qty) : null,
      bulkPrice: p.productos?.bulk_unit_price != null ? Number(p.productos.bulk_unit_price) : null,
    };
    if (!exists) {
      const qty = 1;
      setCart((prev) => [
        ...prev,
        {
          producto_id: p.producto_id,
          nombre: p.productos?.nombre,
          _pricing: meta,
          precio_unitario: unitPriceFromProduct(meta, qty),
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
        const meta = item._pricing || { base: item.precio_unitario, pct: 0 };
        return {
          ...item,
          cantidad: qty,
          precio_unitario: unitPriceFromProduct(meta, qty),
        };
      })
    );
  }
  function handleRemoveProduct(producto_id) {
    setCart((cart) => cart.filter((p) => p.producto_id !== producto_id));
  }

  /* ===================== Guardar venta (RPC única) ===================== */
  async function saveSale() {
    setSaving(true);
    setPaymentError("");

    const currentPendingId = window.pendingSaleId;

    try {
      if (!usuario?.id) throw new Error("User not synced, please re-login.");
      if (!van?.id) throw new Error("Select a VAN first.");
      if (!selectedClient) throw new Error("Select a client or choose Quick sale.");
      if (cartSafe.length === 0) throw new Error("Add at least one product.");

      if (showCreditPanel && amountToCredit > 0 && amountToCredit > creditAvailable + 0.0001) {
        setPaymentError(
          `❌ Credit exceeded: you need ${fmt(amountToCredit)}, but only ${fmt(creditAvailable)} is available.`
        );
        setSaving(false);
        return;
      }

      if (amountToCredit > 0) {
        const ok = window.confirm(
          `This sale will leave ${fmt(amountToCredit)} on the customer's account (credit).\n` +
            (showCreditPanel
              ? `Credit limit: ${fmt(creditLimit)}\nAvailable before: ${fmt(
                  creditAvailable
                )}\nAvailable after: ${fmt(creditAvailableAfter)}\n\n`
              : `\n(No credit history yet)\n\n`) +
            `Do you want to continue?`
        );
        if (!ok) {
          setSaving(false);
          return;
        }
      }

      // Recalcular en el momento de guardar
      const existingCreditNow = Math.max(0, -balanceBefore);
      const oldDebtNow = Math.max(0, balanceBefore);
      const saleAfterCreditNow = Math.max(0, saleTotal - existingCreditNow);
      const totalAPagarNow = oldDebtNow + saleAfterCreditNow;

      const paidForSaleNow = Math.min(paid, saleAfterCreditNow);
      const payOldDebtNow = Math.min(oldDebtNow, Math.max(0, paid - paidForSaleNow));
      const changeNow = Math.max(0, paid - totalAPagarNow);

      // Desglose de pagos
      const paymentMap = { efectivo: 0, tarjeta: 0, transferencia: 0, otro: 0 };
      payments.forEach((p) => {
        if (paymentMap[p.forma] !== undefined) {
          paymentMap[p.forma] += Number(p.monto || 0);
        }
      });

      // Items para la RPC
      const itemsForRpc = cartSafe.map((p) => {
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
          precio_unit: base,
          descuento_pct,
        };
      });

      // JSON de pago para guardar en ventas.pago
      const pagoJson = {
        metodos: payments,
        map: paymentMap,
        total_ingresado: paid,
        aplicado_venta: paidForSaleNow,
        aplicado_deuda: payOldDebtNow,
        cambio: changeNow,
      };

      // Llamada principal (transacción en DB)
      const t0 = performance.now();
      const { data, error } = await supabase.rpc("create_venta", {
        p_cliente_id: selectedClient?.id || null,
        p_van_id: van.id || null,
        p_usuario: usuario.id,
        p_items: itemsForRpc,
        p_pago: pagoJson,
        p_notas: notes || null,
      });
      if (error) throw error;
      const elapsedMs = Math.round(performance.now() - t0);

      // Pago a deuda previa (si aplica), en paralelo con notificación
      const applyDebtPromise =
        payOldDebtNow > 0 && selectedClient?.id
          ? supabase.rpc("cxc_registrar_pago", {
              p_cliente_id: selectedClient.id,
              p_monto: Number(payOldDebtNow),
              p_metodo: "mix",
              p_van_id: van.id,
            })
          : Promise.resolve({});

      // Payload para recibo
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
        prevBalance: Math.max(0, balanceBefore),
        toCredit: amountToCredit,
        creditLimit,
        availableBefore: creditAvailable,
        availableAfter: creditAvailableAfter,
      };

      // Limpiar pendientes y notificar
      const updated = removePendingFromLSById(currentPendingId);
      setPendingSales(updated);

      alert(
        `✅ Sale saved successfully` +
          (changeNow > 0 ? `\n💰 Change to give: ${fmt(changeNow)}` : "") +
          `\n⏱️ ${elapsedMs} ms`
      );

      await Promise.all([
        applyDebtPromise,
        requestAndSendNotifications({ client: selectedClient, payload }),
      ]);

      clearSale();
    } catch (err) {
      setPaymentError("❌ Error saving sale: " + (err?.message || ""));
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  /* ======================== Modal: ventas pendientes ======================== */
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
                        <div className="font-bold text-gray-900">
                          👤 {v.client?.nombre || "Quick sale"}
                        </div>
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
    const creditNum = getCreditNumber(selectedClient);

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
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
              onClick={() => setModalPendingSales(true)}
              type="button"
            >
              📂 Pending ({pendingSales.length})
            </button>
            <button
              onClick={() => navigate("/clientes/nuevo", { replace: false })}
              className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg px-4 py-2 font-semibold shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              ✨ Quick Create Client
            </button>
          </div>
        </div>

        {selectedClient ? (
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

                {!showCreditPanel && (
                  <div className="mt-3">
                    <span className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
                      ✨ New customer — no credit history yet
                    </span>
                  </div>
                )}

                {migrationMode && selectedClient?.id && (
                  <div className="mt-3">
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

              {showCreditPanel && (
                <div className="bg-white rounded-lg border shadow-sm p-4 min-w-0 lg:min-w-[280px]">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="text-xs text-gray-500 uppercase font-semibold">
                        Credit Limit
                      </div>
                      <div className="text-xl font-bold text-gray-900">
                        {fmt(creditLimit)}
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

                    {balanceBefore !== 0 && (
                      <div
                        className={`rounded-lg p-2 border ${
                          balanceBefore > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
                        }`}
                      >
                        <div
                          className={`text-xs font-semibold ${
                            balanceBefore > 0 ? "text-red-700" : "text-green-700"
                          }`}
                        >
                          {balanceBefore > 0 ? "Outstanding Balance" : "Credit in Favor"}
                        </div>
                        <div
                          className={`text-lg font-bold ${
                            balanceBefore > 0 ? "text-red-700" : "text-green-700"
                          }`}
                        >
                          {fmt(Math.abs(balanceBefore))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                className="text-sm text-red-600 underline hover:text-red-800 transition-colors"
                onClick={() => setSelectedClient(null)}
              >
                🔄 Change client
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                placeholder="🔍 Search by name, last name, business, phone, email or address..."
                className="w-full border-2 border-gray-300 rounded-lg p-4 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && clientSearch.trim() === SECRET_CODE) {
                    setMigrationMode((v) => !v);
                    setClientSearch("");
                    alert(`Migration mode ${!migrationMode ? "ON" : "OFF"}`);
                  }
                  if (e.key === "Enter" && clients.length > 0) setSelectedClient(clients[0]);
                }}
                autoFocus
              />
              {clientLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  Buscando…
                </div>
              )}
            </div>

            <div className="max-h-64 overflow-auto space-y-2 bg-gray-50 rounded-lg p-2">
              {clients.length === 0 && debouncedClientSearch.length > 2 && !clientLoading && (
                <div className="text-gray-400 text-center py-8">🔍 No results found</div>
              )}
              {clients.map((c) => (
                <div
                  key={c.id}
                  className="bg-white p-4 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-200 border-2 border-transparent transition-all duration-200 shadow-sm"
                  onClick={() => setSelectedClient(c)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 flex items-center gap-2">
                        👤 {c.nombre} {c.apellido || ""}
                        {c.negocio && (
                          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                            {c.negocio}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">📍 {renderAddress(c.direccion)}</div>
                      <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                        📞 {c.telefono} {c.email ? ` · ✉️ ${c.email}` : ""}
                      </div>
                    </div>
                    {Number(getClientBalance(c)) > 0 && (
                      <div className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-semibold">
                        💰 {fmt(getClientBalance(c))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setSelectedClient({ id: null, nombre: "Quick sale", balance: 0 })}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg py-4 font-semibold shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                ⚡ Quick Sale (No Client)
              </button>
            </div>
          </div>
        )}

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

        <div className="flex">
          <input
            type="text"
            placeholder="🔍 Search in the van inventory…"
            className="flex-1 border-2 border-gray-300 rounded-lg p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
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

  // Fallbacks por si alguna consulta trae el dato plano y no en "productos"
  const name  = p.productos?.nombre ?? p.nombre ?? "—";
  const code  = p.productos?.codigo ?? p.codigo ?? "N/A";
  const brand = p.productos?.marca ?? p.marca ?? "—";
  const price = p.productos?.precio ?? p.precio ?? 0;
  const stock = p.cantidad ?? p.stock ?? 0;

  return (
    <div
      key={p.producto_id ?? p.id}
      className={`bg-white p-4 rounded-lg border-2 transition-all duration-200 shadow-sm ${
        inCart ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
      }`}
    >
      <div onClick={() => handleAddProduct(p)} className="flex-1 cursor-pointer">
        {/* ======= LÍNEA PRINCIPAL: NOMBRE (siempre visible) ======= */}
        <div className="font-semibold text-gray-900 flex items-center gap-2">
          📦 <span className="truncate" title={name}>{name}</span>
          {/* Chip opcional con la marca */}
          {brand && brand !== "—" && (
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
              {brand}
            </span>
          )}
          {inCart && <span className="text-green-600">✅</span>}
        </div>

        {/* ======= Línea secundaria: código / stock / marca / precio ======= */}
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

        {/* Carrito */}
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
              {cartSafe.map((p) => (
                <div key={p.producto_id} className="bg-gray-50 p-4 rounded-lg border">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm text-gray-600">
                        {fmt(p.precio_unitario)} each
                        {p._pricing?.bulkMin && p._pricing?.bulkPrice && p.cantidad >= p._pricing.bulkMin && (
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
                        <div className="font-bold text-lg text-blue-800">{fmt(p.cantidad * p.precio_unitario)}</div>
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
              ))}
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
            {balanceBefore >= 0 ? (
              <div className="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-lg p-4 text-center">
                <div className="text-xs text-red-600 uppercase font-semibold">Outstanding Balance</div>
                <div className="text-xl font-bold text-red-700">{fmt(balanceBefore)}</div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4 text-center">
                <div className="text-xs text-green-600 uppercase font-semibold">Credit in Favor</div>
                <div className="text-xl font-bold text-green-700">{fmt(Math.abs(balanceBefore))}</div>
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
      </div>
    );
  }

  /* ======================== Paso 3: Pago ======================== */
  function renderStepPayment() {
    function handleChangePayment(index, field, value) {
      setPayments((arr) => arr.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
    }
    function handleAddPayment() {
      setPayments([...payments, { forma: "efectivo", monto: 0 }]);
    }
    function handleRemovePayment(index) {
      setPayments((ps) => (ps.length === 1 ? ps : ps.filter((_, i) => i !== index)));
    }

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">💳 Payment</h2>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 text-center">
            <div className="text-xs text-blue-600 uppercase font-semibold">Client</div>
            <div className="font-bold text-gray-900 text-sm mt-1">{selectedClient?.nombre || "Quick sale"}</div>
            <div className="text-xs text-gray-500 mt-1 font-mono">#{getCreditNumber(selectedClient)}</div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4 text-center">
            <div className="text-xs text-green-600 uppercase font-semibold">Sale Total</div>
            <div className="text-lg font-bold text-green-700">{fmt(saleTotal)}</div>
          </div>

          <div className="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-lg p-4 text-center">
            <div className="text-xs text-red-600 uppercase font-semibold">Outstanding</div>
            <div className="text-lg font-bold text-red-700">{fmt(Math.max(0, balanceBefore))}</div>
          </div>

          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-200 rounded-lg p-4 text-center">
            <div className="text-xs text-orange-600 uppercase font-semibold">To Credit</div>
            <div className={`text-lg font-bold ${amountToCredit > 0 ? "text-orange-700" : "text-emerald-700"}`}>
              {fmt(amountToCredit)}
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-gray-900 flex items-center gap-2">💳 Payment Methods</div>
            <button
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-3 py-1 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200"
              onClick={handleAddPayment}
            >
              ➕ Add Method
            </button>
          </div>

          <div className="space-y-3">
            {payments.map((p, i) => (
              <div className="bg-gray-50 rounded-lg p-4 border" key={i}>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <select
                      value={p.forma}
                      onChange={(e) => handleChangePayment(i, "forma", e.target.value)}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 outline-none transition-all"
                    >
                      {PAYMENT_METHODS.map((fp) => (
                        <option key={fp.key} value={fp.key}>
                          {fp.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={p.monto}
                      onChange={(e) => handleChangePayment(i, "monto", e.target.value)}
                      className="w-full sm:w-32 border-2 border-gray-300 rounded-lg px-3 py-2 text-right font-bold focus:border-blue-500 outline-none transition-all"
                      placeholder="0.00"
                    />

                    {payments.length > 1 && (
                      <button
                        className="bg-red-500 text-white w-10 h-10 rounded-full hover:bg-red-600 transition-colors shadow-md"
                        onClick={() => handleRemovePayment(i)}
                      >
                        ✖️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Summary */}
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

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          {modalPendingSales && renderPendingSalesModal()}
          {step === 1 && renderStepClient()}
          {step === 2 && renderStepProducts()}
          {step === 3 && renderStepPayment()}
        </div>

        {/* Fixed bottom summary for mobile */}
        {cartSafe.length > 0 && step === 2 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4 shadow-lg sm:hidden">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">🛒 {cartSafe.length} items</div>
              <div className="text-xl font-bold text-blue-800">{fmt(saleTotal)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Ajuste inicial (modo migración) */}
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
                    if (!selectedClient?.id) return;
                    if (!amt || isNaN(amt) || amt <= 0) {
                      alert("Monto inválido");
                      return;
                    }
                    const { error } = await supabase.rpc("cxc_crear_ajuste_inicial", {
                      p_cliente_id: selectedClient.id,
                      p_monto: amt,
                      p_usuario_id: usuario?.id,
                      p_nota: adjustNote || null,
                    });
                    if (error) {
                      alert("Error: " + error.message);
                      return;
                    }
                    try {
                      const { data } = await supabase
                        .from("v_cxc_cliente_detalle")
                        .select("limite_politica, credito_disponible, saldo")
                        .eq("cliente_id", selectedClient.id)
                        .maybeSingle();
                      if (data) {
                        setCxcLimit(Number(data.limite_politica));
                        setCxcAvailable(Number(data.credito_disponible));
                        setCxcBalance(Number(data.saldo));
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
