// src/Sales.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import BarcodeScanner from "./BarcodeScanner";
import { useNavigate } from "react-router-dom";

const PAYMENT_METHODS = [
  { key: "efectivo", label: "💵 Cash", icon: "💵" },
  { key: "tarjeta", label: "💳 Card", icon: "💳" },
  { key: "transferencia", label: "🏦 Transfer", icon: "🏦" },
  { key: "otro", label: "💰 Other", icon: "💰" },
];

const STORAGE_KEY = "pending_sales";

// Código secreto para activar/desactivar el modo migración
const SECRET_CODE = "#ajuste2025";

/* --------- Política de límite (alineada con CxC) --------- */
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

/* ---------- NUEVO: helpers de pricing ---------- */
function r2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Prioridad:
 *  1) bulk override si qty >= bulkMin y hay bulkPrice
 *  2) % descuento (si existe)
 *  3) precio base
 */
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
  // Primero el saldo real enriquecido, luego los campos locales
  return Number(c._saldo_real ?? c.balance ?? c.saldo_total ?? c.saldo ?? 0);
}

function getCreditNumber(c) {
  return c?.credito_id || c?.id || "—";
}

export default function Sales() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const navigate = useNavigate();

  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);

  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
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
  const [cxcLimit, setCxcLimit] = useState(null);        // limite_politica
  const [cxcAvailable, setCxcAvailable] = useState(null); // credito_disponible
  const [cxcBalance, setCxcBalance] = useState(null);     // saldo (real)

  // ---- Modo Migración (secreto)
  const [migrationMode, setMigrationMode] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("Saldo viejo importado");

  /* ---------- NUEVO: Cargar pendientes al entrar (sin abrir modal) ---------- */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      setPendingSales(Array.isArray(saved) ? saved : []);
    } catch {
      setPendingSales([]);
    }
  }, []);

  /* ---------- CLIENTES (búsqueda + saldo real) ---------- */
  useEffect(() => {
    async function loadClients() {
      if (clientSearch.trim().length === 0) {
        setClients([]);
        return;
      }

      const fields = ["nombre", "negocio", "telefono", "email"];
      const filters = fields.map((f) => `${f}.ilike.%${clientSearch}%`).join(",");

      // Traemos los clientes
      const { data, error } = await supabase
        .from("clientes_balance")
        .select("*")
        .or(filters);

      if (error || !data) {
        setClients([]);
        return;
      }

      // Enriquecemos con saldo real desde la vista CxC (para que el “pill” rojo sea correcto)
      const ids = data.map((c) => c.id).filter(Boolean);
      if (ids.length === 0) {
        setClients(data.map((c) => ({ ...c, _saldo_real: Number(c.balance || 0) })));
        return;
      }

      const { data: cxcRows } = await supabase
        .from("v_cxc_cliente_detalle")
        .select("cliente_id, saldo")
        .in("cliente_id", ids);

      const map = new Map((cxcRows || []).map((r) => [r.cliente_id, Number(r.saldo || 0)]));
      const enriched = data.map((c) => ({
        ...c,
        _saldo_real: map.has(c.id) ? map.get(c.id) : Number(c.balance || 0),
      }));

      setClients(enriched);
    }
    loadClients();
  }, [clientSearch]);

  /* ---------- Cargar historial al seleccionar cliente ---------- */
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

  /* ---------- Traer límite/disponible/saldo desde CxC ---------- */
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
          return;
        }
      } catch (_) {}
    }
    fetchCxC();
  }, [selectedClient?.id]);

  /* ---------- PRODUCTOS (van) ---------- */
  useEffect(() => {
    async function loadProducts() {
      setNoProductFound("");
      if (!van) return;
      const { data, error } = await supabase
        .from("stock_van")
        .select(`
          id, producto_id, cantidad,
          productos ( nombre, precio, codigo, marca, descuento_pct, bulk_min_qty, bulk_unit_price )
        `)
        .eq("van_id", van.id);

      if (error) {
        setProducts([]);
        return;
      }
      const filter = productSearch.trim().toLowerCase();
      const filtered = (data || []).filter(
        (row) =>
          row.cantidad > 0 &&
          (((row.productos?.nombre || "").toLowerCase().includes(filter) ||
            (row.productos?.codigo || "").toLowerCase().includes(filter) ||
            (row.productos?.marca || "").toLowerCase().includes(filter)))
      );
      setProducts(filtered);
      if (productSearch.trim() && filtered.length === 0) {
        setNoProductFound(productSearch.trim());
      }
    }
    loadProducts();
  }, [van, productSearch]);

  /* ---------- TOP productos ---------- */
  useEffect(() => {
    async function loadTopProducts() {
      if (!van) return;
      try {
        const { data, error } = await supabase.rpc("productos_mas_vendidos_por_van", {
          van_id_param: van.id,
        });
        setTopProducts(error ? [] : data || []);
      } catch {
        setTopProducts([]);
      }
    }
    loadTopProducts();
  }, [van]);

  /* ---------- Totales & crédito ---------- */
  const saleTotal = cart.reduce((t, p) => t + p.cantidad * p.precio_unitario, 0);
  const paid = payments.reduce((s, p) => s + Number(p.monto || 0), 0);

  const clientBalanceLocal = getClientBalance(selectedClient);
  // Prioriza el saldo REAL de CxC; si no existe, usa local
  const clientBalance = Number(
    cxcBalance != null && !Number.isNaN(Number(cxcBalance))
      ? cxcBalance
      : clientBalanceLocal
  );
  const deudaCliente = Math.max(0, clientBalance);

  const totalAPagar = saleTotal + deudaCliente;
  const totalPagadoReal = Math.min(paid, totalAPagar);
  const amountToCredit = Math.max(0, totalAPagar - totalPagadoReal);

  const clientScore = Number(selectedClient?.score_credito ?? 600);

  // Mostrar panel de crédito si hay historial o saldo actual > 0
  const showCreditPanel = !!selectedClient && (clientHistory.has || clientBalance > 0);

  // Límite y disponible: primero lo que venga de CxC; si no, política local
  const computedLimit = policyLimit(clientScore);
  const creditLimit = showCreditPanel ? Number(cxcLimit ?? computedLimit) : 0;

  // Disponible: prioridad al valor exacto de CxC
  const calculatedAvailable = Math.max(0, creditLimit - clientBalance);
  const creditAvailable = showCreditPanel
    ? Number(
        cxcAvailable != null && !Number.isNaN(Number(cxcAvailable))
          ? cxcAvailable
          : calculatedAvailable
      )
    : 0;

  const creditAvailableAfter = Math.max(
    0,
    creditLimit - (clientBalance + amountToCredit)
  );

  const change = paid > totalAPagar ? paid - totalAPagar : 0;
  const mostrarAdvertencia = paid > totalAPagar;

  /* ---------- Guardar venta pendiente local ---------- */
  useEffect(() => {
    if ((cart.length > 0 || selectedClient) && step < 4) {
      let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      const id = window.pendingSaleId || (window.pendingSaleId = Date.now());
      const newPending = {
        id,
        client: selectedClient,
        cart,
        payments,
        notes,
        step,
        date: new Date().toISOString(),
      };
      saved = saved.filter((v) => v.id !== id);
      saved.unshift(newPending);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 10)));
      setPendingSales(saved.slice(0, 10));
    }
  }, [selectedClient, cart, payments, notes, step]);

  function clearSale() {
    setClientSearch("");
    setClients([]);
    setSelectedClient(null);
    setProductSearch("");
    setProducts([]);
    setCart([]);
    setTopProducts([]);
    setScannerOpen(false);
    setScanMessage("");
    setNotes("");
    setPayments([{ forma: "efectivo", monto: 0 }]);
    setPaymentError("");
    setSaving(false);
    setStep(1);
    window.pendingSaleId = null;
  }

  function handleAddProduct(p) {
    const exists = cart.find((x) => x.producto_id === p.producto_id);
    // meta para poder recalcular precio al cambiar qty
    const meta = {
      base: Number(p.productos?.precio) || 0,
      pct: Number(p.productos?.descuento_pct) || 0,
      bulkMin: p.productos?.bulk_min_qty != null ? Number(p.productos.bulk_min_qty) : null,
      bulkPrice: p.productos?.bulk_unit_price != null ? Number(p.productos.bulk_unit_price) : null,
    };
    if (!exists) {
      const qty = 1;
      setCart([
        ...cart,
        {
          producto_id: p.producto_id,
          nombre: p.productos?.nombre,
          // NUEVO: guarda meta
          _pricing: meta,
          // unitario efectivo
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

  async function handleBarcodeScanned(code) {
    setScannerOpen(false);
    if (!code) {
      setScanMessage("⚠️ Could not read the code or the camera is not available.");
      return;
    }
    setScanMessage("");
    let found = products.find((p) => p.productos?.codigo?.toString().trim() === code.trim());
    if (!found && van) {
      const { data } = await supabase
        .from("stock_van")
        .select("id, producto_id, cantidad, productos(nombre, precio, codigo, marca, descuento_pct, bulk_min_qty, bulk_unit_price)")
        .eq("van_id", van.id)
        .eq("productos.codigo", code);
      if (data && data.length > 0) found = data[0];
    }
    if (found && found.cantidad > 0) {
      handleAddProduct(found);
      setScanMessage(`✅ Product "${found.productos?.nombre}" added!`);
    } else {
      setScanMessage("❌ Product not found or out of stock in this van.");
    }
  }

  async function saveSale() {
    setSaving(true);
    setPaymentError("");
    try {
      if (!usuario?.id) throw new Error("User not synced, please re-login.");
      if (!van?.id) throw new Error("Select a VAN first.");
      // ✅ Permitir Quick sale (sin id de cliente), solo exigimos haber elegido cliente o quick sale
      if (!selectedClient) throw new Error("Select a client or choose Quick sale.");
      if (cart.length === 0) throw new Error("Add at least one product.");

      if (showCreditPanel && amountToCredit > 0 && amountToCredit > creditAvailable + 0.0001) {
        setPaymentError(
          `❌ Credit exceeded: you need ${fmt(amountToCredit)}, but only ${fmt(creditAvailable)} is available.`
        );
        setSaving(false);
        return;
      }

      // Confirmación si deja crédito
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

      // Distribución de pagos: primero a la venta nueva, luego (si hay extra) a deudas anteriores
      const paymentMap = { efectivo: 0, tarjeta: 0, transferencia: 0, otro: 0 };
      payments.forEach((p) => {
        if (paymentMap[p.forma] !== undefined) {
          paymentMap[p.forma] += Number(p.monto || 0);
        }
      });

      // Lo máximo que puede aplicarse a ESTA venta
      const paidForSale = Math.min(paid, saleTotal);
      const payOldDebt = Math.max(0, paid - paidForSale);

      const venta_a_guardar = {
        van_id: van.id,
        usuario_id: usuario.id,
        cliente_id: selectedClient?.id || null,
        total: saleTotal,
        total_venta: saleTotal,
        total_pagado: paidForSale, // <= nunca mayor que total_venta
        estado_pago: paidForSale >= saleTotal ? "pagado" : paidForSale > 0 ? "parcial" : "pendiente",
        forma_pago: payments.map((p) => p.forma).join(","),
        metodo_pago: payments.map((p) => `${p.forma}:${p.monto}`).join(","),
        productos: cart.map((p) => ({
          producto_id: p.producto_id,
          nombre: p.nombre,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
          subtotal: p.cantidad * p.precio_unitario,
        })),
        notas: notes,
        pago: paidForSale, // pago aplicado a esta venta
        pago_efectivo: Math.min(paymentMap.efectivo, paidForSale),
        pago_tarjeta: Math.min(paymentMap.tarjeta, paidForSale),
        pago_transferencia: Math.min(paymentMap.transferencia, paidForSale),
        pago_otro: Math.min(paymentMap.otro, paidForSale),
      };

      // 1) Crear la venta
      const { data: saleData, error: saleError } = await supabase
        .from("ventas")
        .insert([venta_a_guardar])
        .select()
        .maybeSingle();
      if (saleError) throw saleError;

      // 2) Insertar detalle de venta
      for (let p of cart) {
        await supabase.from("detalle_ventas").insert([
          {
            venta_id: saleData.id,
            producto_id: p.producto_id,
            cantidad: p.cantidad,
            precio_unitario: p.precio_unitario,
            subtotal: p.cantidad * p.precio_unitario,
          },
        ]);
      }

      // 3) Descontar stock
      for (let p of cart) {
        const { data: stockData, error: stockError } = await supabase
          .from("stock_van")
          .select("cantidad")
          .eq("van_id", van.id)
          .eq("producto_id", p.producto_id)
          .single();

        if (!stockError) {
          const newStock = (stockData?.cantidad || 0) - p.cantidad;
          await supabase
            .from("stock_van")
            .update({ cantidad: newStock })
            .eq("van_id", van.id)
            .eq("producto_id", p.producto_id);
        }
      }

      // 4) Si hubo pago extra (más allá de la nueva venta), aplícalo a deudas anteriores (FIFO) vía RPC
      // ✅ Solo si hay cliente real (con id)
      if (payOldDebt > 0 && selectedClient?.id) {
        try {
          const { error: rpcError } = await supabase.rpc("cxc_registrar_pago", {
            p_cliente_id: selectedClient.id,
            p_monto: payOldDebt,
            p_metodo: "mix",
            p_van_id: van.id,
          });
          if (rpcError) {
            console.warn("RPC apply old debt failed:", rpcError?.message);
          }
        } catch (e) {
        }
      }

      alert(
        "✅ Sale saved successfully\n" +
          (change > 0 ? `💰 Change to give: ${fmt(change)}` : "")
      );
      clearSale();

      // Limpiar venta pendiente local
      let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      saved = saved.filter((v) => v.id !== window.pendingSaleId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setPendingSales(saved);
    } catch (err) {
      setPaymentError("❌ Error saving sale: " + (err?.message || ""));
      console.error(err);
    } finally {
      setSaving(false);
    }
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
    let saved = pendingSales.filter((v) => v.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    setPendingSales(saved);
  }

  /* ---------- UI: Progress Bar ---------- */
  function renderProgressBar() {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-800">📋 Sales</h1>
          <div className="text-sm text-gray-500">Step {step} of 3</div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((step) / 3) * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-600">
          <span className={step >= 1 ? "text-blue-600 font-semibold" : ""}>👤 Client</span>
          <span className={step >= 2 ? "text-blue-600 font-semibold" : ""}>🛒 Products</span>
          <span className={step >= 3 ? "text-blue-600 font-semibold" : ""}>💳 Payment</span>
        </div>
      </div>
    );
  }

  /* ---------- UI: Paso 1 Cliente ---------- */
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
                    <span>💳</span>
                    <span className="text-xs">Credit #: <span className="font-mono font-semibold">{creditNum}</span></span>
                  </div>
                </div>

                {!showCreditPanel && (
                  <div className="mt-3">
                    <span className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
                      ✨ New customer — no credit history yet
                    </span>
                  </div>
                )}

                {/* Botón oculto para modo migración */}
                {migrationMode && selectedClient?.id && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => { setAdjustAmount(""); setShowAdjustModal(true); }}
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
                      <div className="text-xs text-gray-500 uppercase font-semibold">Credit Limit</div>
                      <div className="text-xl font-bold text-gray-900">{fmt(creditLimit)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 uppercase font-semibold">Available</div>
                      <div className="text-xl font-bold text-emerald-600">{fmt(creditAvailable)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 uppercase font-semibold">After Sale</div>
                      <div className={`text-xl font-bold ${creditAvailableAfter >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {fmt(creditAvailableAfter)}
                      </div>
                    </div>

                    {clientBalance > 0 && (
                      <div className="bg-red-50 rounded-lg p-2 border border-red-200">
                        <div className="text-xs text-red-700 font-semibold">Outstanding Balance</div>
                        <div className="text-lg font-bold text-red-700">{fmt(clientBalance)}</div>
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
                placeholder="🔍 Search by name, business, phone, email..."
                className="w-full border-2 border-gray-300 rounded-lg p-4 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && clientSearch.trim() === SECRET_CODE) {
                    setMigrationMode((v) => !v);
                    setClientSearch("");
                    alert(`Migration mode ${!migrationMode ? "ON" : "OFF"}`);
                  }
                }}
                autoFocus
              />
            </div>
            
            <div className="max-h-64 overflow-auto space-y-2 bg-gray-50 rounded-lg p-2">
              {clients.length === 0 && clientSearch.length > 2 && (
                <div className="text-gray-400 text-center py-8">
                  🔍 No results found
                </div>
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
                      <div className="text-sm text-gray-600 mt-1">
                        📍 {renderAddress(c.direccion)}
                      </div>
                      <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                        📞 {c.telefono}
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
                onClick={() => navigate("/clientes/nuevo", { replace: false })}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg py-4 font-semibold shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                ✨ Quick Create Client
              </button>
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

  /* ---------- UI: Paso 2 Productos ---------- */
  function renderStepProducts() {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          🛒 Add Products
        </h2>
        
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="🔍 Search product by name or code..."
            className="flex-1 border-2 border-gray-300 rounded-lg p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
          <button
            className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 whitespace-nowrap"
            type="button"
            onClick={() => setScannerOpen(true)}
          >
            📷 Scan
          </button>
        </div>

        {noProductFound && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-500 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-yellow-800">
              ❌ No product found for "<b>{noProductFound}</b>"
            </span>
            <button
              className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-lg px-4 py-2 font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap"
              onClick={() => navigate(`/productos/nuevo?codigo=${encodeURIComponent(noProductFound)}`)}
            >
              ✨ Create Product
            </button>
          </div>
        )}

        {scanMessage && (
          <div className="text-center font-semibold text-blue-700 bg-blue-50 py-3 px-4 rounded-lg border border-blue-200">
            {scanMessage}
          </div>
        )}

        <div className="max-h-64 overflow-auto space-y-2 bg-gray-50 rounded-lg p-2">
          {products.length === 0 && !noProductFound && (
            <div className="text-gray-400 text-center py-8">
              📦 No products available for this van or search
            </div>
          )}
          {products.map((p) => {
            const inCart = cart.find((x) => x.producto_id === p.producto_id);
            return (
              <div 
                key={p.producto_id} 
                className={`bg-white p-4 rounded-lg border-2 transition-all duration-200 shadow-sm ${
                  inCart ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                <div 
                  onClick={() => handleAddProduct(p)} 
                  className="flex-1 cursor-pointer"
                >
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    📦 {p.productos?.nombre}
                    {inCart && <span className="text-green-600">✅</span>}
                  </div>
                  <div className="text-sm text-gray-600 mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <span>🔢 Code: {p.productos?.codigo || "N/A"}</span>
                    <span>📊 Stock: {p.cantidad}</span>
                    <span className="font-semibold text-blue-600">💰 {fmt(p.productos?.precio)}</span>
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
                      max={p.cantidad}
                      value={inCart.cantidad}
                      onChange={(e) => handleEditQuantity(p.producto_id, Math.max(1, Math.min(Number(e.target.value), p.cantidad)))}
                      className="w-16 h-10 border-2 border-gray-300 rounded-lg text-center font-bold text-lg focus:border-blue-500 outline-none"
                    />
                    <button
                      className="bg-green-500 text-white w-10 h-10 rounded-full font-bold hover:bg-green-600 transition-colors shadow-md"
                      onClick={() => handleEditQuantity(p.producto_id, Math.min(p.cantidad, inCart.cantidad + 1))}
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

        {topProducts.length > 0 && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg border-2 border-yellow-300 p-4 shadow-sm">
            <div className="font-bold text-yellow-800 mb-3 flex items-center gap-2">
              🔥 Top Selling Products
            </div>
            <div className="space-y-2">
              {topProducts.map((p) => (
                <div
                  key={p.producto_id}
                  className="bg-white p-3 rounded-lg cursor-pointer hover:bg-yellow-100 border border-yellow-200 transition-all duration-200 shadow-sm"
                  onClick={() =>
                    handleAddProduct({
                      producto_id: p.producto_id,
                      productos: {
                        nombre: p.nombre,
                        precio: p.precio,
                        codigo: p.codigo,
                        // por si la vista no trae campos nuevos
                        descuento_pct: p.descuento_pct ?? null,
                        bulk_min_qty: p.bulk_min_qty ?? null,
                        bulk_unit_price: p.bulk_unit_price ?? null,
                      },
                      cantidad: p.cantidad_disponible,
                    })
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900">📦 {p.nombre}</div>
                    <div className="text-sm text-gray-600">
                      📊 {p.cantidad_disponible} · 💰 {fmt(p.precio)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {cart.length > 0 && (
          <div className="bg-white rounded-xl border-2 border-blue-200 p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900 flex items-center gap-2">
                🛒 Shopping Cart
                <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full">
                  {cart.length} items
                </span>
              </div>
              <div className="text-2xl font-bold text-blue-800">
                {fmt(saleTotal)}
              </div>
            </div>
            
            <div className="space-y-3">
              {cart.map((p) => (
                <div key={p.producto_id} className="bg-gray-50 p-4 rounded-lg border">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{p.nombre}</div>
                      <div className="text-sm text-gray-600">
                        {fmt(p.precio_unitario)} each
                        {p._pricing?.bulkMin && p._pricing?.bulkPrice && p.cantidad >= p._pricing.bulkMin && (
                          <span className="ml-2 text-emerald-700 font-semibold">• bulk</span>
                        )}
                      </div>
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
                        <div className="font-bold text-lg text-blue-800">
                          {fmt(p.cantidad * p.precio_unitario)}
                        </div>
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
            <div className="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-lg p-4 text-center">
              <div className="text-xs text-red-600 uppercase font-semibold">Outstanding Balance</div>
              <div className="text-xl font-bold text-red-700">{fmt(clientBalance)}</div>
            </div>
            <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-200 rounded-lg p-4 text-center">
              <div className="text-xs text-orange-600 uppercase font-semibold">Will Go to Credit</div>
              <div className={`text-xl font-bold ${amountToCredit > 0 ? "text-orange-700" : "text-emerald-700"}`}>
                {fmt(amountToCredit)}
              </div>
            </div>
            {showCreditPanel ? (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4 text-center">
                <div className="text-xs text-green-600 uppercase font-semibold">Available After</div>
                <div className={`text-xl font-bold ${creditAvailableAfter >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {fmt(creditAvailableAfter)}
                </div>
              </div>
            ) : (
              <div className="bg-gray-100 border-2 border-gray-200 rounded-lg p-4 flex items-center justify-center">
                <span className="text-xs text-gray-600 text-center">
                  ✨ New customer<br/>Credit not displayed
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-4 gap-3">
          <button 
            className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors shadow-md"
            onClick={() => setStep(1)}
          >
            ← Back
          </button>
          <button
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200 flex-1 sm:flex-none"
            disabled={cart.length === 0}
            onClick={() => setStep(3)}
          >
            Next Step →
          </button>
        </div>

        {scannerOpen && <BarcodeScanner onResult={handleBarcodeScanned} onClose={() => setScannerOpen(false)} />}
      </div>
    );
  }

  /* ---------- UI: Paso 3 Pago ---------- */
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
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          💳 Payment
        </h2>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 text-center">
            <div className="text-xs text-blue-600 uppercase font-semibold">Client</div>
            <div className="font-bold text-gray-900 text-sm mt-1">
              {selectedClient?.nombre || "Quick sale"}
            </div>
            <div className="text-xs text-gray-500 mt-1 font-mono">
              #{getCreditNumber(selectedClient)}
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4 text-center">
            <div className="text-xs text-green-600 uppercase font-semibold">Sale Total</div>
            <div className="text-lg font-bold text-green-700">{fmt(saleTotal)}</div>
          </div>
          
          <div className="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-lg p-4 text-center">
            <div className="text-xs text-red-600 uppercase font-semibold">Outstanding</div>
            <div className="text-lg font-bold text-red-700">{fmt(deudaCliente)}</div>
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
            <div className="font-bold text-gray-900 flex items-center gap-2">
              💳 Payment Methods
            </div>
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
                        <option key={fp.key} value={fp.key}>{fp.label}</option>
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
            <div className="text-red-700 font-semibold text-center">
              ❌ Credit Limit Exceeded
            </div>
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

  function renderAddress(address) {
    if (!address) return "No address";
    if (typeof address === "string") {
      try { address = JSON.parse(address); } catch {}
    }
    if (typeof address === "object") {
      return [
        address.calle,
        address.ciudad,
        address.estado,
        address.zip
      ].filter(Boolean).join(", ");
    }
    return address;
  }

  function renderPendingSalesModal() {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center gap-2">
              📂 Pending Sales
            </h3>
            <button 
              className="text-white hover:bg-white/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center"
              onClick={() => setModalPendingSales(false)}
            >
              ✖️
            </button>
          </div>
          
          <div className="p-4 overflow-y-auto max-h-[60vh]">
            {pendingSales.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                📭 No pending sales
              </div>
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
                          📦 {v.cart.length} products · 📅 {new Date(v.date).toLocaleDateString()} {new Date(v.date).toLocaleTimeString()}
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-4xl mx-auto">
        {/* Header with progress */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4">
          {renderProgressBar()}
        </div>

        {/* Main content */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          {modalPendingSales && renderPendingSalesModal()}
          {step === 1 && renderStepClient()}
          {step === 2 && renderStepProducts()}
          {step === 3 && renderStepPayment()}
        </div>

        {/* Fixed bottom summary for mobile */}
        {cart.length > 0 && step === 2 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4 shadow-lg sm:hidden">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                🛒 {cart.length} items
              </div>
              <div className="text-xl font-bold text-blue-800">
                {fmt(saleTotal)}
              </div>
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
              <button onClick={() => setShowAdjustModal(false)} className="opacity-80 hover:opacity-100">✖️</button>
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
                <button
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white rounded-lg px-4 py-2"
                  onClick={() => setShowAdjustModal(false)}
                >
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
                      p_nota: adjustNote || null
                    });
                    if (error) {
                      alert("Error: " + error.message);
                      return;
                    }
                    // refresca el panel de crédito con la vista oficial
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
