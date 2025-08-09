// src/Sales.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import BarcodeScanner from "./BarcodeScanner";
import { useNavigate } from "react-router-dom";

const PAYMENT_METHODS = [
  { key: "efectivo", label: "Cash" },
  { key: "tarjeta", label: "Card" },
  { key: "transferencia", label: "Transfer" },
  { key: "otro", label: "Other" },
];

const STORAGE_KEY = "pending_sales";

/* --------- Política de límite (alineada con CxC) ---------
   Ejemplos:
   - score 592  -> $150 (tu caso)
   - score 600+ -> $250
   - tiers superiores escalan suavemente
*/
function policyLimit(score) {
  const s = Number(score ?? 600);
  if (s < 500) return 0;
  if (s < 600) return 150;  // 592 -> $150
  if (s < 650) return 250;  // 600 -> $250
  if (s < 700) return 350;
  if (s < 750) return 500;
  if (s < 800) return 750;
  return 1000;
}

function fmt(n) {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function getClientBalance(c) {
  if (!c) return 0;
  return Number(c.balance ?? c.saldo_total ?? c.saldo ?? 0);
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

  // Historial del cliente (para decidir si mostramos panel de crédito)
  const [clientHistory, setClientHistory] = useState({
    has: false,
    ventas: 0,
    pagos: 0,
    loading: false,
  });

  /* ---------- CLIENTES ---------- */
  useEffect(() => {
    async function loadClients() {
      if (clientSearch.trim().length === 0) {
        setClients([]);
        return;
      }
      const fields = ["nombre", "negocio", "telefono", "email"];
      const filters = fields.map((f) => `${f}.ilike.%${clientSearch}%`).join(",");
      const { data } = await supabase.from("clientes_balance").select("*").or(filters);
      setClients(data || []);
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

  /* ---------- PRODUCTOS (van) ---------- */
  useEffect(() => {
    async function loadProducts() {
      setNoProductFound("");
      if (!van) return;
      const { data, error } = await supabase
        .from("stock_van")
        .select(`
          id, producto_id, cantidad,
          productos ( nombre, precio, codigo, marca )
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

  /* ---------- TOP productos (silencioso si no existe el RPC) ---------- */
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

  const clientBalance = getClientBalance(selectedClient);
  const deudaCliente = Math.max(0, clientBalance);

  const totalAPagar = saleTotal + deudaCliente;
  const totalPagadoReal = Math.min(paid, totalAPagar);
  const amountToCredit = Math.max(0, totalAPagar - totalPagadoReal);

  const clientScore = Number(selectedClient?.score_credito ?? 600);

  // Mostrar panel de crédito sólo si tiene historial o ya tiene balance
  const showCreditPanel = !!selectedClient && (clientHistory.has || clientBalance > 0);

  // **AQUÍ** aplicamos la política alineada a CxC
  const creditLimit = showCreditPanel ? policyLimit(clientScore) : 0;
  const creditAvailable = Math.max(0, creditLimit - clientBalance);
  const creditAvailableAfter = Math.max(0, creditLimit - (clientBalance + amountToCredit));

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
    if (!exists) {
      setCart([
        ...cart,
        {
          producto_id: p.producto_id,
          nombre: p.productos?.nombre,
          precio_unitario: Number(p.productos?.precio) || 0,
          cantidad: 1,
        },
      ]);
    }
    setProductSearch("");
  }
  function handleEditQuantity(producto_id, cantidad) {
    setCart((cart) =>
      cart.map((item) => (item.producto_id === producto_id ? { ...item, cantidad } : item))
    );
  }
  function handleRemoveProduct(producto_id) {
    setCart((cart) => cart.filter((p) => p.producto_id !== producto_id));
  }

  async function handleBarcodeScanned(code) {
    setScannerOpen(false);
    if (!code) {
      setScanMessage("Could not read the code or the camera is not available.");
      return;
    }
    setScanMessage("");
    let found = products.find((p) => p.productos?.codigo?.toString().trim() === code.trim());
    if (!found && van) {
      const { data } = await supabase
        .from("stock_van")
        .select("id, producto_id, cantidad, productos(nombre, precio, codigo, marca)")
        .eq("van_id", van.id)
        .eq("productos.codigo", code);
      if (data && data.length > 0) found = data[0];
    }
    if (found && found.cantidad > 0) {
      handleAddProduct(found);
      setScanMessage(`Product "${found.productos?.nombre}" added!`);
    } else {
      setScanMessage("Product not found or out of stock in this van.");
    }
  }

  async function saveSale() {
    setSaving(true);
    setPaymentError("");
    try {
      if (!usuario?.id) throw new Error("User not synced, please re-login.");
      if (!selectedClient?.id) throw new Error("Select a client first.");

      // Validar crédito sólo si mostramos panel (tiene historial o balance)
      if (showCreditPanel && amountToCredit > 0 && amountToCredit > creditAvailable + 0.0001) {
        setPaymentError(
          `Credit exceeded: you need ${fmt(amountToCredit)}, but only ${fmt(creditAvailable)} is available.`
        );
        setSaving(false);
        return;
      }

      // Confirmación si hay parte a crédito
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

      // Mapear pagos
      const paymentMap = { efectivo: 0, tarjeta: 0, transferencia: 0, otro: 0 };
      payments.forEach((p) => {
        if (paymentMap[p.forma] !== undefined) {
          paymentMap[p.forma] += Number(p.monto || 0);
        }
      });

      const venta_a_guardar = {
        van_id: van.id,
        usuario_id: usuario.id,
        cliente_id: selectedClient?.id || null,
        total: saleTotal,
        total_venta: saleTotal,
        total_pagado: Math.min(paid, totalAPagar),
        estado_pago: amountToCredit > 0 ? "pendiente" : "pagado",
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
        pago: Math.min(paid, totalAPagar),
        pago_efectivo: Math.min(paymentMap.efectivo, totalAPagar),
        pago_tarjeta: Math.min(paymentMap.tarjeta, totalAPagar),
        pago_transferencia: Math.min(paymentMap.transferencia, totalAPagar),
        pago_otro: Math.min(paymentMap.otro, totalAPagar),
      };

      const { data: saleData, error: saleError } = await supabase
        .from("ventas")
        .insert([venta_a_guardar])
        .select()
        .maybeSingle();
      if (saleError) throw saleError;

      // Detalle
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

      // Descontar stock
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

      // Actualizar balance del cliente (sumar el monto a crédito)
      if (selectedClient?.id) {
        const newBalance = clientBalance + amountToCredit;
        await supabase.from("clientes").update({ balance: newBalance }).eq("id", selectedClient.id);
      }

      alert("Sale saved successfully\n" + (change > 0 ? `Change to give: ${fmt(change)}` : ""));
      clearSale();

      let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      saved = saved.filter((v) => v.id !== window.pendingSaleId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setPendingSales(saved);
    } catch (err) {
      setPaymentError("Error saving sale: " + (err?.message || ""));
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

  /* ---------- UI: Paso 1 Cliente ---------- */
  function renderStepClient() {
    const creditNum = getCreditNumber(selectedClient);

    return (
      <div>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-bold">Select Client</h2>
          <button
            className="text-xs bg-blue-100 px-3 py-2 rounded font-bold"
            onClick={() => setModalPendingSales(true)}
            type="button"
          >
            Pending Sales ({pendingSales.length})
          </button>
        </div>

        {selectedClient ? (
          <div className="p-3 mb-3 rounded bg-blue-50 border border-blue-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-blue-800">
                  {selectedClient.nombre} {selectedClient.apellido || ""}{" "}
                  <span className="text-gray-600 text-sm">
                    {selectedClient.negocio && `(${selectedClient.negocio})`}
                  </span>
                </div>
                <div className="text-sm">{renderAddress(selectedClient.direccion)}</div>
                <div className="text-sm flex items-center mt-1">
                  <span role="img" aria-label="phone">📞</span>
                  <span className="ml-1">{selectedClient.telefono}</span>
                </div>
                <div className="text-[11px] text-gray-600 mt-1">
                  Credit #: <span className="font-mono">{creditNum}</span>
                </div>

                {!showCreditPanel && (
                  <span className="inline-block mt-2 text-[11px] px-2 py-1 bg-gray-200 rounded-full text-gray-700">
                    New customer — no credit history yet
                  </span>
                )}
              </div>

              {showCreditPanel && (
                <div className="bg-white rounded-lg border p-3 min-w-[260px] shadow-sm">
                  <div className="text-xs text-gray-500">Credit limit</div>
                  <div className="text-lg font-bold">{fmt(creditLimit)}</div>

                  <div className="mt-2 text-xs text-gray-500">Available</div>
                  <div className="text-lg font-bold text-emerald-700">
                    {fmt(creditAvailable)}
                  </div>

                  <div className="mt-2 text-xs text-gray-500">After this sale</div>
                  <div
                    className={`text-lg font-bold ${
                      creditAvailableAfter >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {fmt(creditAvailableAfter)}
                  </div>

                  {clientBalance > 0 && (
                    <div className="mt-2 text-xs text-red-600">
                      Outstanding balance: <b>{fmt(clientBalance)}</b>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-end">
              <button
                className="text-xs text-red-600 underline"
                onClick={() => setSelectedClient(null)}
              >
                Change client
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Search by name, business, phone, email..."
              className="w-full border rounded p-2 mb-2"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-48 overflow-auto mb-2">
              {clients.length === 0 && clientSearch.length > 2 && (
                <div className="text-gray-400 text-sm px-2">No results</div>
              )}
              {clients.map((c) => (
                <div
                  key={c.id}
                  className="p-2 rounded cursor-pointer hover:bg-blue-100"
                  onClick={() => setSelectedClient(c)}
                >
                  <div className="font-bold">
                    {c.nombre} {c.apellido || ""}{" "}
                    <span className="text-gray-600 text-sm">{c.negocio && `(${c.negocio})`}</span>
                  </div>
                  <div className="text-xs">{renderAddress(c.direccion)}</div>
                  <div className="text-xs flex items-center">
                    <span role="img" aria-label="phone">📞</span>
                    <span className="ml-1">{c.telefono}</span>
                  </div>
                  {Number(getClientBalance(c)) > 0 && (
                    <div className="text-xs text-red-600">Balance: {fmt(getClientBalance(c))}</div>
                  )}
                </div>
              ))}
            </div>
            {/* Navegar al módulo de crear cliente */}
            <button
              onClick={() => navigate("/clientes/nuevo", { replace: false })}
              className="w-full bg-green-600 text-white rounded py-2 mb-2"
            >
              + Quick create client
            </button>
            <button
              onClick={() => setSelectedClient({ id: null, nombre: "Quick sale", balance: 0 })}
              className="w-full bg-blue-600 text-white rounded py-2"
            >
              Quick sale (no client)
            </button>
          </>
        )}

        <div className="flex justify-end mt-4">
          <button
            className="bg-blue-700 text-white px-4 py-2 rounded"
            disabled={!selectedClient}
            onClick={() => setStep(2)}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  /* ---------- UI: Paso 2 Productos (carrito visual) ---------- */
  function renderStepProducts() {
    return (
      <div>
        <h2 className="text-xl font-bold mb-4">Add Products</h2>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Search product by name or code..."
            className="w-full border rounded p-2"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
        <button
            className="bg-green-600 text-white px-3 py-2 rounded font-bold"
            type="button"
            onClick={() => setScannerOpen(true)}
          >
            📷 Scan
          </button>
        </div>

        {noProductFound && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 mb-2 text-yellow-800 rounded flex items-center justify-between">
            <span>
              No product found for "<b>{noProductFound}</b>"
            </span>
            <button
              className="ml-4 bg-yellow-500 text-white rounded px-3 py-1"
              onClick={() => navigate(`/productos/nuevo?codigo=${encodeURIComponent(noProductFound)}`)}
            >
              Create Product
            </button>
          </div>
        )}
        {scanMessage && (
          <div className="mb-2 text-xs text-center font-bold text-blue-700">{scanMessage}</div>
        )}

        <div className="max-h-48 overflow-auto mb-2">
          {products.map((p) => (
            <div key={p.producto_id} className="p-2 border-b flex justify-between items-center hover:bg-gray-50">
              <div onClick={() => handleAddProduct(p)} className="flex-1 cursor-pointer">
                <div className="font-semibold">{p.productos?.nombre}</div>
                <div className="text-xs text-gray-500">
                  Code: {p.productos?.codigo || "N/A"} · Stock: {p.cantidad} · Price: {fmt(p.productos?.precio)}
                </div>
              </div>
              {cart.find((x) => x.producto_id === p.producto_id) && (
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 bg-gray-200 rounded"
                    onClick={() =>
                      handleEditQuantity(
                        p.producto_id,
                        Math.max(1, (cart.find((x) => x.producto_id === p.producto_id)?.cantidad || 1) - 1)
                      )
                    }
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={p.cantidad}
                    value={cart.find((x) => x.producto_id === p.producto_id)?.cantidad || 1}
                    onChange={(e) =>
                      handleEditQuantity(
                        p.producto_id,
                        Math.max(1, Math.min(Number(e.target.value), p.cantidad))
                      )
                    }
                    className="w-14 border rounded text-center"
                  />
                  <button
                    className="px-2 py-1 bg-gray-200 rounded"
                    onClick={() =>
                      handleEditQuantity(
                        p.producto_id,
                        Math.min(p.cantidad, (cart.find((x) => x.producto_id === p.producto_id)?.cantidad || 1) + 1)
                      )
                    }
                  >
                    +
                  </button>
                  <button className="text-xs text-red-500" onClick={() => handleRemoveProduct(p.producto_id)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
          {products.length === 0 && !noProductFound && (
            <div className="text-gray-400 text-sm px-2">No products for this van or search.</div>
          )}
        </div>

        {topProducts.length > 0 && (
          <div className="bg-yellow-50 rounded border p-3 mt-4">
            <b>Top selling products</b>
            {topProducts.map((p) => (
              <div
                key={p.producto_id}
                className="p-2 border-b cursor-pointer hover:bg-yellow-100"
                onClick={() =>
                  handleAddProduct({
                    producto_id: p.producto_id,
                    productos: { nombre: p.nombre, precio: p.precio },
                    cantidad: p.cantidad_disponible,
                  })
                }
              >
                {p.nombre} · Stock: {p.cantidad_disponible} · Price: {fmt(p.precio)}
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <div className="bg-white rounded border p-3 mt-4">
            <div className="flex items-center justify-between mb-2">
              <b>Cart</b>
              <div className="text-lg font-bold text-blue-800">Total: {fmt(saleTotal)}</div>
            </div>
            <div className="divide-y">
              {cart.map((p) => (
                <div key={p.producto_id} className="py-2 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{p.nombre}</div>
                    <div className="text-xs text-gray-500">{fmt(p.precio_unitario)} each</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-1 bg-gray-200 rounded"
                      onClick={() => handleEditQuantity(p.producto_id, Math.max(1, p.cantidad - 1))}
                    >
                      −
                    </button>
                    <span className="w-8 text-center">{p.cantidad}</span>
                    <button
                      className="px-2 py-1 bg-gray-200 rounded"
                      onClick={() => handleEditQuantity(p.producto_id, p.cantidad + 1)}
                    >
                      +
                    </button>
                    <div className="w-24 text-right font-semibold">{fmt(p.cantidad * p.precio_unitario)}</div>
                    <button className="text-xs text-red-600 ml-2" onClick={() => handleRemoveProduct(p.producto_id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <textarea
            className="w-full border rounded p-2"
            placeholder="Notes for the invoice..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {selectedClient && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white border rounded p-3">
              <div className="text-xs text-gray-500">Outstanding balance</div>
              <div className="text-lg font-bold text-red-600">{fmt(clientBalance)}</div>
            </div>
            <div className="bg-white border rounded p-3">
              <div className="text-xs text-gray-500">Will go to credit</div>
              <div className={`text-lg font-bold ${amountToCredit > 0 ? "text-orange-600" : "text-emerald-700"}`}>
                {fmt(amountToCredit)}
              </div>
            </div>
            {showCreditPanel ? (
              <div className="bg-white border rounded p-3">
                <div className="text-xs text-gray-500">Available after</div>
                <div className={`text-lg font-bold ${creditAvailableAfter >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {fmt(creditAvailableAfter)}
                </div>
              </div>
            ) : (
              <div className="bg-white border rounded p-3 flex items-center justify-center text-xs text-gray-500">
                New customer — credit not displayed
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between mt-4">
          <button className="bg-gray-400 text-white px-4 py-2 rounded" onClick={() => setStep(1)}>
            Back
          </button>
          <button
            className="bg-blue-700 text-white px-4 py-2 rounded"
            disabled={cart.length === 0}
            onClick={() => setStep(3)}
          >
            Next
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
      <div>
        <h2 className="text-xl font-bold mb-4">Payment</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <div className="bg-white border rounded p-3">
            <div className="text-xs text-gray-500">Client</div>
            <div className="font-semibold">{selectedClient?.nombre || "Quick sale"}</div>
            <div className="text-[11px] text-gray-500 mt-1">
              Credit #: <span className="font-mono">{getCreditNumber(selectedClient)}</span>
            </div>
          </div>
          <div className="bg-white border rounded p-3">
            <div className="text-xs text-gray-500">Sale total</div>
            <div className="text-lg font-bold text-blue-800">{fmt(saleTotal)}</div>
          </div>
          <div className="bg-white border rounded p-3">
            <div className="text-xs text-gray-500">Outstanding</div>
            <div className="text-lg font-bold text-red-600">{fmt(deudaCliente)}</div>
          </div>
          <div className="bg-white border rounded p-3">
            <div className="text-xs text-gray-500">Will go to credit</div>
            <div className={`text-lg font-bold ${amountToCredit > 0 ? "text-orange-600" : "text-emerald-700"}`}>
              {fmt(amountToCredit)}
            </div>
          </div>
        </div>

        <div className="mb-2">
          <b>Payment methods:</b>
          {payments.map((p, i) => (
            <div className="flex items-center gap-2 mt-1" key={i}>
              <select
                value={p.forma}
                onChange={(e) => handleChangePayment(i, "forma", e.target.value)}
                className="border rounded px-2 py-1"
              >
                {PAYMENT_METHODS.map((fp) => (
                  <option key={fp.key} value={fp.key}>{fp.label}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                value={p.monto}
                onChange={(e) => handleChangePayment(i, "monto", e.target.value)}
                className="border rounded px-2 py-1 w-24"
              />
              {payments.length > 1 && (
                <button className="text-xs text-red-600" onClick={() => handleRemovePayment(i)}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button className="text-xs text-blue-700 mt-1" onClick={handleAddPayment}>+ Add payment method</button>
        </div>

        <div className="mb-2">Paid: <b>{fmt(paid)}</b></div>
        {change > 0 && <div className="mb-2 text-green-700">Change: {fmt(change)}</div>}
        {mostrarAdvertencia && (
          <div className="mb-2 text-orange-600">Paid amount exceeds total debt. Please check payments.</div>
        )}

        {showCreditPanel && amountToCredit > creditAvailable && (
          <div className="mb-3 rounded bg-red-50 border border-red-300 p-2 text-red-700">
            This sale would exceed the customer's available credit. Required: <b>{fmt(amountToCredit)}</b> · Available: <b>{fmt(creditAvailable)}</b>.
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button className="bg-gray-400 text-white px-4 py-2 rounded" onClick={() => setStep(2)} disabled={saving}>
            Back
          </button>
          <button
            className="bg-green-700 text-white px-4 py-2 rounded"
            disabled={saving || (showCreditPanel && amountToCredit > 0 && amountToCredit > creditAvailable)}
            onClick={saveSale}
          >
            {saving ? "Saving..." : "Save Sale"}
          </button>
        </div>
        {paymentError && <div className="text-red-600 mt-2">{paymentError}</div>}
      </div>
    );
  }

  function renderAddress(address) {
    if (!address) return null;
    if (typeof address === "string") {
      try { address = JSON.parse(address); } catch {}
    }
    if (typeof address === "object") {
      return (
        <span>
          <span role="img" aria-label="pin">📍</span>
          {address.calle && `${address.calle}, `}
          {address.ciudad && `${address.ciudad}, `}
          {address.estado && `${address.estado}`}
          {address.zip && `, ${address.zip}`}
        </span>
      );
    }
    return <span>{address}</span>;
  }

  function renderPendingSalesModal() {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <div className="bg-white p-6 rounded shadow-md w-full max-w-lg relative">
          <h3 className="font-bold mb-3">Pending Sales</h3>
          {pendingSales.length === 0 ? (
            <div className="text-gray-400">No pending sales.</div>
          ) : (
            <ul className="divide-y">
              {pendingSales.map((v) => (
                <li key={v.id} className="py-2 flex justify-between items-center">
                  <div>
                    <b>{v.client?.nombre || "Quick sale"}</b>
                    <div className="text-xs text-gray-500">
                      Products: {v.cart.length} | Date: {new Date(v.date).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="bg-blue-600 text-white px-3 py-1 rounded text-xs" onClick={() => handleSelectPendingSale(v)}>
                      Resume
                    </button>
                    <button className="bg-red-600 text-white px-2 py-1 rounded text-xs" onClick={() => handleDeletePendingSale(v.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button className="absolute top-3 right-3 text-lg" onClick={() => setModalPendingSales(false)}>✖</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-4 bg-white rounded shadow my-4">
      {modalPendingSales && renderPendingSalesModal()}
      {step === 1 && renderStepClient()}
      {step === 2 && renderStepProducts()}
      {step === 3 && renderStepPayment()}
    </div>
  );
}
