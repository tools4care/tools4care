import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import BarcodeScanner from "./BarcodeScanner";

const PAYMENT_METHODS = [
  { key: "efectivo", label: "Cash" },
  { key: "tarjeta", label: "Card" },
  { key: "transferencia", label: "Transfer" },
  { key: "otro", label: "Other" },
];

const STORAGE_KEY = "pending_sales";

export default function Sales() {
  const { van } = useVan();
  const { usuario } = useUsuario();

  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showCreateClient, setShowCreateClient] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [notes, setNotes] = useState("");

  const [payments, setPayments] = useState([{ forma: "efectivo", monto: 0 }]);
  const [paymentError, setPaymentError] = useState("");
  const [saving, setSaving] = useState(false);

  const [pendingSales, setPendingSales] = useState([]);
  const [modalPendingSales, setModalPendingSales] = useState(false);

  const [step, setStep] = useState(1);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    setPendingSales(saved);
  }, []);

  useEffect(() => {
    async function loadClients() {
      if (clientSearch.trim().length === 0) {
        setClients([]);
        return;
      }
      const fields = ["nombre", "negocio", "telefono", "email"];
      const filters = fields.map(f => `${f}.ilike.%${clientSearch}%`).join(",");
      const { data } = await supabase
        .from("clientes_balance")
        .select("*")
        .or(filters);
      setClients(data || []);
    }
    loadClients();
  }, [clientSearch]);

  useEffect(() => {
    async function loadProducts() {
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
        row =>
          row.cantidad > 0 &&
          (
            (row.productos?.nombre || "").toLowerCase().includes(filter) ||
            (row.productos?.codigo || "").toLowerCase().includes(filter) ||
            (row.productos?.marca || "").toLowerCase().includes(filter)
          )
      );
      setProducts(filtered);
    }
    loadProducts();
  }, [van, productSearch]);

  useEffect(() => {
    async function loadTopProducts() {
      if (!van) return;
      const { data, error } = await supabase.rpc("productos_mas_vendidos_por_van", { van_id_param: van.id });
      setTopProducts(error ? [] : data || []);
    }
    loadTopProducts();
  }, [van]);

  const saleTotal = cart.reduce((t, p) => t + (p.cantidad * p.precio_unitario), 0);
  const paid = payments.reduce((s, p) => s + Number(p.monto || 0), 0);
  const pendingBalance = saleTotal - paid;
  const change = paid > saleTotal ? (paid - saleTotal) : 0;
  const clientBalance = selectedClient?.balance || 0;

  useEffect(() => {
    if (
      (cart.length > 0 || selectedClient) &&
      step < 4
    ) {
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
      saved = saved.filter(v => v.id !== id);
      saved.unshift(newPending);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 10)));
      setPendingSales(saved.slice(0, 10));
    }
  }, [selectedClient, cart, payments, notes, step]);

  function clearSale() {
    setClientSearch("");
    setClients([]);
    setSelectedClient(null);
    setShowCreateClient(false);
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
    const exists = cart.find(x => x.producto_id === p.producto_id);
    if (!exists) {
      setCart([...cart, {
        producto_id: p.producto_id,
        nombre: p.productos?.nombre,
        precio_unitario: Number(p.productos?.precio) || 0,
        cantidad: 1
      }]);
    }
    setProductSearch("");
  }
  function handleEditQuantity(producto_id, cantidad) {
    setCart(cart =>
      cart.map(item =>
        item.producto_id === producto_id ? { ...item, cantidad } : item
      )
    );
  }
  function handleRemoveProduct(producto_id) {
    setCart(cart => cart.filter(p => p.producto_id !== producto_id));
  }

  async function handleBarcodeScanned(code) {
    setScannerOpen(false);
    if (!code) {
      setScanMessage("Could not read the code or the camera is not available.");
      return;
    }
    setScanMessage("");

    let found = products.find(
      p => p.productos?.codigo?.toString().trim() === code.trim()
    );

    if (!found && van) {
      const { data } = await supabase
        .from("stock_van")
        .select("id, producto_id, cantidad, productos(nombre, precio, codigo, marca)")
        .eq("van_id", van.id)
        .eq("productos.codigo", code);

      if (data && data.length > 0) {
        found = data[0];
      }
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

      const paymentMap = {
        efectivo: 0,
        tarjeta: 0,
        transferencia: 0,
        otro: 0,
      };
      payments.forEach(p => {
        if (paymentMap[p.forma] !== undefined) {
          paymentMap[p.forma] += Number(p.monto || 0);
        }
      });

      const { data: saleData, error: saleError } = await supabase
        .from("ventas")
        .insert([{
          van_id: van.id,
          usuario_id: usuario.id,
          cliente_id: selectedClient?.id || null,
          total: saleTotal,
          total_venta: saleTotal,
          total_pagado: paid,
          estado_pago: pendingBalance > 0 ? "pendiente" : "pagado",
          forma_pago: payments.map(p => p.forma).join(","),
          metodo_pago: payments.map(p => `${p.forma}:${p.monto}`).join(","),
          productos: cart.map(p => ({
            producto_id: p.producto_id,
            nombre: p.nombre,
            cantidad: p.cantidad,
            precio_unitario: p.precio_unitario,
            subtotal: p.cantidad * p.precio_unitario,
          })),
          notas: notes,
          pago: paid,
          pago_efectivo: paymentMap.efectivo,
          pago_tarjeta: paymentMap.tarjeta,
          pago_transferencia: paymentMap.transferencia,
          pago_otro: paymentMap.otro,
        }])
        .select()
        .maybeSingle();

      if (saleError) throw saleError;

      for (let p of cart) {
        await supabase.from("detalle_ventas").insert([{
          venta_id: saleData.id,
          producto_id: p.producto_id,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
          subtotal: p.cantidad * p.precio_unitario,
        }]);
      }

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

      alert("Sale saved successfully");
      clearSale();

      let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      saved = saved.filter(v => v.id !== window.pendingSaleId);
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
    let saved = pendingSales.filter(v => v.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    setPendingSales(saved);
  }

  function renderStepClient() {
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
          <div className="p-3 mb-2 rounded bg-blue-50 border border-blue-200 flex items-center justify-between">
            <div>
              <div className="font-bold text-blue-800">
                {selectedClient.nombre} {selectedClient.apellido || ""}{" "}
                <span className="text-gray-600 text-sm">{selectedClient.negocio && `(${selectedClient.negocio})`}</span>
              </div>
              <div className="text-sm">{renderAddress(selectedClient.direccion)}</div>
              <div className="text-sm flex items-center mt-1">
                <span role="img" aria-label="phone">📞</span>
                <span className="ml-1">{selectedClient.telefono}</span>
              </div>
              {Number(clientBalance) > 0 && (
                <div className="text-sm text-red-600 mt-1">
                  <b>Outstanding balance:</b> ${Number(clientBalance).toFixed(2)}
                </div>
              )}
            </div>
            <button
              className="text-xs text-red-600 underline ml-3"
              onClick={() => setSelectedClient(null)}
            >
              Change client
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Search by name, business, phone, email..."
              className="w-full border rounded p-2 mb-2"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-48 overflow-auto mb-2">
              {clients.length === 0 && clientSearch.length > 2 && (
                <div className="text-gray-400 text-sm px-2">No results</div>
              )}
              {clients.map(c => (
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
                  {Number(c.balance) > 0 && (
                    <div className="text-xs text-red-600">
                      Balance: ${Number(c.balance).toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowCreateClient(true)}
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
        {showCreateClient && (
          <QuickCreateClient
            onClose={() => setShowCreateClient(false)}
            onCreate={c => {
              setSelectedClient(c);
              setShowCreateClient(false);
              setStep(2);
            }}
          />
        )}
      </div>
    );
  }

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
            onChange={e => setProductSearch(e.target.value)}
          />
          <button
            className="bg-green-600 text-white px-3 py-2 rounded font-bold"
            type="button"
            onClick={() => setScannerOpen(true)}
          >
            📷 Scan
          </button>
        </div>
        {scanMessage && (
          <div className="mb-2 text-xs text-center font-bold text-blue-700">{scanMessage}</div>
        )}
        <div className="max-h-48 overflow-auto mb-2">
          {products.map(p => (
            <div key={p.producto_id} className="p-2 border-b flex justify-between items-center">
              <div onClick={() => handleAddProduct(p)} className="flex-1 cursor-pointer">
                <div className="font-bold">{p.productos?.nombre}</div>
                <div className="text-xs text-gray-500">
                  Code: {p.productos?.codigo || "N/A"} | Stock: {p.cantidad} | Price: ${p.productos?.precio?.toFixed(2)}
                </div>
              </div>
              {cart.find(x => x.producto_id === p.producto_id) && (
                <div className="flex items-center gap-2">
                  <button onClick={() =>
                    handleEditQuantity(p.producto_id, Math.max(1, (cart.find(x => x.producto_id === p.producto_id)?.cantidad || 1) - 1))
                  }>-</button>
                  <input
                    type="number"
                    min={1}
                    max={p.cantidad}
                    value={cart.find(x => x.producto_id === p.producto_id)?.cantidad || 1}
                    onChange={e =>
                      handleEditQuantity(
                        p.producto_id,
                        Math.max(1, Math.min(Number(e.target.value), p.cantidad))
                      )
                    }
                    className="w-12 border rounded"
                  />
                  <button onClick={() =>
                    handleEditQuantity(p.producto_id, Math.min(p.cantidad, (cart.find(x => x.producto_id === p.producto_id)?.cantidad || 1) + 1))
                  }>+</button>
                  <button
                    className="text-xs text-red-500"
                    onClick={() => handleRemoveProduct(p.producto_id)}
                  >Remove</button>
                </div>
              )}
            </div>
          ))}
          {products.length === 0 && (
            <div className="text-gray-400 text-sm px-2">No products for this van or search.</div>
          )}
        </div>
        {/* Top products */}
        {topProducts.length > 0 && (
          <div className="bg-yellow-50 rounded border p-3 mt-4">
            <b>Top selling products</b>
            {topProducts.map(p => (
              <div
                key={p.producto_id}
                className="p-2 border-b cursor-pointer hover:bg-yellow-100"
                onClick={() => handleAddProduct({
                  producto_id: p.producto_id,
                  productos: { nombre: p.nombre, precio: p.precio },
                  cantidad: p.cantidad_disponible,
                })}
              >
                {p.nombre} - Stock: {p.cantidad_disponible} - Price: ${p.precio.toFixed(2)}
              </div>
            ))}
          </div>
        )}
        {/* Cart */}
        {cart.length > 0 && (
          <div className="bg-gray-50 rounded border p-3 mt-4">
            <b>Cart</b>
            {cart.map(p => (
              <div key={p.producto_id} className="flex justify-between">
                <span>{p.nombre}</span>
                <span>{p.cantidad} x ${p.precio_unitario.toFixed(2)}</span>
                <button className="text-xs text-red-500" onClick={() => handleRemoveProduct(p.producto_id)}>Remove</button>
              </div>
            ))}
            <div className="font-bold mt-2">Total: ${saleTotal.toFixed(2)}</div>
          </div>
        )}
        {/* Notes area */}
        <div className="mt-4">
          <textarea
            className="w-full border rounded p-2"
            placeholder="Notes for the invoice..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
        <div className="flex justify-between mt-4">
          <button
            className="bg-gray-400 text-white px-4 py-2 rounded"
            onClick={() => setStep(1)}
          >
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
        {/* SCANNER MODAL */}
        {scannerOpen && (
          <BarcodeScanner
            onResult={handleBarcodeScanned}
            onClose={() => setScannerOpen(false)}
          />
        )}
      </div>
    );
  }

  function renderStepPayment() {
    function handleChangePayment(index, field, value) {
      setPayments(arr =>
        arr.map((p, i) => i === index ? { ...p, [field]: value } : p)
      );
    }
    function handleAddPayment() {
      setPayments([...payments, { forma: "efectivo", monto: 0 }]);
    }
    function handleRemovePayment(index) {
      setPayments(payments => payments.length === 1 ? payments : payments.filter((_, i) => i !== index));
    }

    return (
      <div>
        <h2 className="text-xl font-bold mb-4">Payment</h2>
        <div className="mb-2">
          Client: <b>{selectedClient?.nombre || "Quick sale"}</b>
        </div>
        <div className="font-semibold mb-2">
          Total to pay: <span className="text-green-700">${saleTotal.toFixed(2)}</span>
        </div>
        {Number(clientBalance) > 0 && (
          <div className="mb-2 text-red-600">
            <b>Client's outstanding balance: ${Number(clientBalance).toFixed(2)}</b>
          </div>
        )}
        <div className="mb-2">
          <b>Payment methods:</b>
          {payments.map((p, i) => (
            <div className="flex items-center gap-2 mt-1" key={i}>
              <select
                value={p.forma}
                onChange={e => handleChangePayment(i, "forma", e.target.value)}
                className="border rounded px-2 py-1"
              >
                {PAYMENT_METHODS.map(fp => (
                  <option key={fp.key} value={fp.key}>{fp.label}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                value={p.monto}
                onChange={e => handleChangePayment(i, "monto", e.target.value)}
                className="border rounded px-2 py-1 w-24"
              />
              {payments.length > 1 && (
                <button className="text-xs text-red-600" onClick={() => handleRemovePayment(i)}>Remove</button>
              )}
            </div>
          ))}
          <button className="text-xs text-blue-700 mt-1" onClick={handleAddPayment}>+ Add payment method</button>
        </div>
        <div className="mb-2">
          Paid: <b>${paid.toFixed(2)}</b>
        </div>
        {change > 0 && (
          <div className="mb-2 text-green-700">
            Change: ${change.toFixed(2)}
          </div>
        )}
        {pendingBalance > 0 && (
          <div className="mb-2 text-orange-600">
            Pending balance (debt): ${pendingBalance.toFixed(2)}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button
            className="bg-gray-400 text-white px-4 py-2 rounded"
            onClick={() => setStep(2)}
            disabled={saving}
          >
            Back
          </button>
          <button
            className="bg-green-700 text-white px-4 py-2 rounded"
            disabled={saving}
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
      try { address = JSON.parse(address); } catch { }
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
              {pendingSales.map(v => (
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
    <div className="w-full max-w-lg mx-auto p-4 bg-white rounded shadow my-4">
      {modalPendingSales && renderPendingSalesModal()}
      {step === 1 && renderStepClient()}
      {step === 2 && renderStepProducts()}
      {step === 3 && renderStepPayment()}
    </div>
  );
}

// --- QuickCreateClient as before ---
function QuickCreateClient({ onClose, onCreate }) {
  const [form, setForm] = useState({ nombre: "", apellido: "", telefono: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("clientes")
      .insert([form])
      .select()
      .maybeSingle();
    setLoading(false);
    if (err) {
      setError("Could not create client");
      return;
    }
    onCreate(data);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-20">
      <form
        className="bg-white p-6 rounded shadow-md w-full max-w-md"
        onSubmit={handleCreate}
      >
        <h3 className="font-bold mb-2">New Client</h3>
        {["nombre", "apellido", "telefono", "email"].map(field => (
          <input
            key={field}
            type={field === "email" ? "email" : "text"}
            placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
            className="w-full border rounded p-2 mb-2"
            value={form[field]}
            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
            required={field !== "telefono"}
          />
        ))}
        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            className="flex-1 bg-gray-400 text-white py-2 rounded"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 bg-blue-700 text-white py-2 rounded"
            disabled={loading}
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
