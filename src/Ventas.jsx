import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import BarcodeScanner from "./BarcodeScanner"; // 👈

const FORMAS_PAGO = [
  { key: "efectivo", label: "Efectivo" },
  { key: "tarjeta", label: "Tarjeta" },
  { key: "transferencia", label: "Transferencia" },
  { key: "otro", label: "Otro" },
];

export default function Ventas() {
  const { van } = useVan();
  const { usuario } = useUsuario();

  // Paso 1: Cliente
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clientes, setClientes] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarCrearCliente, setMostrarCrearCliente] = useState(false);

  // Paso 2: Productos
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [productosMasVendidos, setProductosMasVendidos] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false); // 👈
  const [mensajeEscaneo, setMensajeEscaneo] = useState(""); // 👈

  // Paso 3: Pagos
  const [pagos, setPagos] = useState([{ forma: "efectivo", monto: 0 }]);
  const [errorPago, setErrorPago] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Flujo
  const [paso, setPaso] = useState(1);

  // --- Buscar clientes ---
  useEffect(() => {
    async function cargarClientes() {
      if (busquedaCliente.trim().length === 0) {
        setClientes([]);
        return;
      }
      const campos = ["nombre", "negocio", "telefono", "email"];
      const filtros = campos.map(campo => `${campo}.ilike.%${busquedaCliente}%`).join(",");
      const { data } = await supabase
        .from("clientes")
        .select("*")
        .or(filtros);

      setClientes(data || []);
    }
    cargarClientes();
  }, [busquedaCliente]);

  // --- Cargar productos en stock para la van ---
 useEffect(() => {
  async function cargarProductos() {
    if (!van) return;

    // AÑADE la propiedad 'marca' a la consulta si la tienes en tu tabla productos
    const { data, error } = await supabase
      .from("stock_van")
      .select(`
        id, producto_id, cantidad,
        productos ( nombre, precio, codigo, marca )
      `)
      .eq("van_id", van.id);

    if (error) {
      setProductos([]);
      return;
    }

    const filtro = busquedaProducto.trim().toLowerCase();
    const filtrados = (data || []).filter(
      row =>
        row.cantidad > 0 &&
        (
          (row.productos?.nombre || "").toLowerCase().includes(filtro) ||
          (row.productos?.codigo || "").toLowerCase().includes(filtro) ||
          (row.productos?.marca || "").toLowerCase().includes(filtro)
        )
    );
    setProductos(filtrados);
  }
  cargarProductos();
}, [van, busquedaProducto]);


  // --- Cargar productos más vendidos (top 5) para la van ---
  useEffect(() => {
    async function cargarMasVendidos() {
      if (!van) return;
      const { data, error } = await supabase.rpc("productos_mas_vendidos_por_van", { van_id_param: van.id });
      setProductosMasVendidos(error ? [] : data || []);
    }
    cargarMasVendidos();
  }, [van]);

  // Cálculos totales
  const totalVenta = carrito.reduce((t, p) => t + (p.cantidad * p.precio_unitario), 0);
  const pagado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);
  const saldoPendiente = totalVenta - pagado;
  const devuelto = pagado > totalVenta ? (pagado - totalVenta) : 0;
  const saldoCliente = clienteSeleccionado?.balance || 0;

  // Funciones para manejar carrito
  function handleAgregarProducto(p) {
    const existe = carrito.find(x => x.producto_id === p.producto_id);
    if (!existe) {
      setCarrito([...carrito, {
        producto_id: p.producto_id,
        nombre: p.productos?.nombre,
        precio_unitario: Number(p.productos?.precio) || 0,
        cantidad: 1
      }]);
    }
  }
  function handleEditarCantidad(producto_id, cantidad) {
    setCarrito(carrito =>
      carrito.map(item =>
        item.producto_id === producto_id ? { ...item, cantidad } : item
      )
    );
  }
  function handleQuitarProducto(producto_id) {
    setCarrito(carrito => carrito.filter(p => p.producto_id !== producto_id));
  }

  // --- INTEGRACIÓN SCANNER ---
  async function handleCodigoEscaneado(codigo) {
    setMensajeEscaneo(""); // limpia mensaje previo

    // Buscar el producto por código (en productos ya cargados)
    let productoEncontrado = productos.find(
      p => p.productos?.codigo?.toString().trim() === codigo.trim()
    );

    // Si no está cargado en el filtro, buscar en Supabase directo (puede no estar listado por búsqueda actual)
    if (!productoEncontrado && van) {
      const { data, error } = await supabase
        .from("stock_van")
        .select("id, producto_id, cantidad, productos(nombre, precio, codigo)")
        .eq("van_id", van.id)
        .eq("productos.codigo", codigo);

      if (data && data.length > 0) {
        productoEncontrado = data[0];
      }
    }

    if (productoEncontrado && productoEncontrado.cantidad > 0) {
      handleAgregarProducto(productoEncontrado);
      setMensajeEscaneo(`Producto "${productoEncontrado.productos?.nombre}" agregado!`);
    } else {
      setMensajeEscaneo("Producto no encontrado o sin stock en esta van.");
    }
  }

  // Guardar venta completa
  async function guardarVenta() {
    setGuardando(true);
    setErrorPago("");
    try {
      if (!usuario?.id) throw new Error("Usuario no sincronizado, reintenta login.");

      // Sumar pagos por tipo
      const pagosMap = {
        efectivo: 0,
        tarjeta: 0,
        transferencia: 0,
        otro: 0,
      };
      pagos.forEach(p => {
        if (pagosMap[p.forma] !== undefined) {
          pagosMap[p.forma] += Number(p.monto || 0);
        }
      });

      // 1. Insertar venta
      const { data: ventaData, error: ventaError } = await supabase
        .from("ventas")
        .insert([{
          van_id: van.id,
          usuario_id: usuario.id, // ID de la tabla usuarios, no de Auth!
          cliente_id: clienteSeleccionado?.id || null,
          total: totalVenta,
          total_venta: totalVenta,
          total_pagado: pagado,
          estado_pago: saldoPendiente > 0 ? "pendiente" : "pagado",
          forma_pago: pagos.map(p => p.forma).join(","),
          metodo_pago: pagos.map(p => `${p.forma}:${p.monto}`).join(","),
          productos: carrito.map(p => ({
            producto_id: p.producto_id,
            nombre: p.nombre,
            cantidad: p.cantidad,
            precio_unitario: p.precio_unitario,
            subtotal: p.cantidad * p.precio_unitario,
          })),
          notas: "",
          pago: pagado,
          // 👇 Campos individuales para cierre de VAN
          pago_efectivo: pagosMap.efectivo,
          pago_tarjeta: pagosMap.tarjeta,
          pago_transferencia: pagosMap.transferencia,
          pago_otro: pagosMap.otro,
        }])
        .select()
        .maybeSingle();

      if (ventaError) throw ventaError;

      // 2. Insertar detalle_ventas
      for (let p of carrito) {
        await supabase.from("detalle_ventas").insert([{
          venta_id: ventaData.id,
          producto_id: p.producto_id,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
          subtotal: p.cantidad * p.precio_unitario,
        }]);
      }

      // 3. Actualizar stock
      for (let p of carrito) {
        const { data: stockData, error: stockError } = await supabase
          .from("stock_van")
          .select("cantidad")
          .eq("van_id", van.id)
          .eq("producto_id", p.producto_id)
          .single();

        if (!stockError) {
          const nuevoStock = (stockData?.cantidad || 0) - p.cantidad;
          await supabase
            .from("stock_van")
            .update({ cantidad: nuevoStock })
            .eq("van_id", van.id)
            .eq("producto_id", p.producto_id);
        }
      }

      // 4. Actualizar saldo cliente si hay deuda
      if (saldoPendiente > 0 && clienteSeleccionado?.id) {
        const { data: clienteActualizado, error: errorCliente } = await supabase
          .from("clientes")
          .select("balance")
          .eq("id", clienteSeleccionado.id)
          .single();

        if (!errorCliente) {
          const balanceActual = clienteActualizado?.balance || 0;
          await supabase
            .from("clientes")
            .update({ balance: balanceActual + saldoPendiente })
            .eq("id", clienteSeleccionado.id);
        }
      }

      alert("Venta guardada correctamente");

      // Limpiar estado
      setClienteSeleccionado(null);
      setCarrito([]);
      setPagos([{ forma: "efectivo", monto: 0 }]);
      setPaso(1);
      setBusquedaCliente("");
      setBusquedaProducto("");
      setProductos([]);
      setProductosMasVendidos([]);
      setMensajeEscaneo("");

    } catch (err) {
      setErrorPago("Error guardando venta: " + (err?.message || ""));
      console.error(err);
    } finally {
      setGuardando(false);
    }
  }

  // Paso 1: Selección de cliente
  function renderPasoCliente() {
    return (
      <div>
        <h2 className="text-xl font-bold mb-4">Selecciona Cliente</h2>
        {clienteSeleccionado ? (
          <div className="p-3 mb-2 rounded bg-blue-50 border border-blue-200 flex items-center justify-between">
            <div>
              <div className="font-bold text-blue-800">
                {clienteSeleccionado.nombre} {clienteSeleccionado.apellido || ""}{" "}
                <span className="text-gray-600 text-sm">{clienteSeleccionado.negocio && `(${clienteSeleccionado.negocio})`}</span>
              </div>
              <div className="text-sm">{renderDireccion(clienteSeleccionado.direccion)}</div>
              <div className="text-sm flex items-center mt-1">
                <span role="img" aria-label="phone">📞</span>
                <span className="ml-1">{clienteSeleccionado.telefono}</span>
              </div>
              {Number(saldoCliente) > 0 && (
                <div className="text-sm text-red-600 mt-1">
                  <b>Balance pendiente:</b> ${Number(saldoCliente).toFixed(2)}
                </div>
              )}
            </div>
            <button
              className="text-xs text-red-600 underline ml-3"
              onClick={() => setClienteSeleccionado(null)}
            >
              Cambiar cliente
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Buscar por nombre, negocio, teléfono, email..."
              className="w-full border rounded p-2 mb-2"
              value={busquedaCliente}
              onChange={e => setBusquedaCliente(e.target.value)}
              autoFocus
            />
            <div className="max-h-48 overflow-auto mb-2">
              {clientes.length === 0 && busquedaCliente.length > 2 && (
                <div className="text-gray-400 text-sm px-2">Sin resultados</div>
              )}
              {clientes.map(c => (
                <div
                  key={c.id}
                  className="p-2 rounded cursor-pointer hover:bg-blue-100"
                  onClick={() => setClienteSeleccionado(c)}
                >
                  <div className="font-bold">
                    {c.nombre} {c.apellido || ""}{" "}
                    <span className="text-gray-600 text-sm">{c.negocio && `(${c.negocio})`}</span>
                  </div>
                  <div className="text-xs">{renderDireccion(c.direccion)}</div>
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
              onClick={() => setMostrarCrearCliente(true)}
              className="w-full bg-green-600 text-white rounded py-2 mb-2"
            >
              + Crear cliente rápido
            </button>
            <button
              onClick={() => setClienteSeleccionado({ id: null, nombre: "Venta rápida", balance: 0 })}
              className="w-full bg-blue-600 text-white rounded py-2"
            >
              Venta rápida (sin cliente)
            </button>
          </>
        )}
        <div className="flex justify-end mt-4">
          <button
            className="bg-blue-700 text-white px-4 py-2 rounded"
            disabled={!clienteSeleccionado}
            onClick={() => setPaso(2)}
          >
            Siguiente
          </button>
        </div>
        {mostrarCrearCliente && (
          <CrearClienteRapido
            onClose={() => setMostrarCrearCliente(false)}
            onCreate={c => {
              setClienteSeleccionado(c);
              setMostrarCrearCliente(false);
              setPaso(2);
            }}
          />
        )}
      </div>
    );
  }

  // Paso 2: Selección de productos y carrito (AQUÍ VA EL SCANNER)
  function renderPasoProductos() {
    return (
      <div>
        <h2 className="text-xl font-bold mb-4">Agregar Productos</h2>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Buscar producto por nombre o código..."
            className="w-full border rounded p-2"
            value={busquedaProducto}
            onChange={e => setBusquedaProducto(e.target.value)}
          />
          <button
            className="bg-green-600 text-white px-3 py-2 rounded font-bold"
            type="button"
            onClick={() => setScannerOpen(true)}
          >
            📷 Escanear
          </button>
        </div>
        {mensajeEscaneo && (
          <div className="mb-2 text-xs text-center font-bold text-blue-700">{mensajeEscaneo}</div>
        )}
        <div className="max-h-48 overflow-auto mb-2">
          {productos.map(p => (
            <div key={p.producto_id} className="p-2 border-b flex justify-between items-center">
              <div onClick={() => handleAgregarProducto(p)} className="flex-1 cursor-pointer">
                <div className="font-bold">{p.productos?.nombre}</div>
                <div className="text-xs text-gray-500">
                  Código: {p.productos?.codigo || "N/A"} | Disponible: {p.cantidad} | Precio: ${p.productos?.precio?.toFixed(2)}
                </div>
              </div>
              {carrito.find(x => x.producto_id === p.producto_id) && (
                <div className="flex items-center gap-2">
                  <button onClick={() =>
                    handleEditarCantidad(p.producto_id, Math.max(1, (carrito.find(x => x.producto_id === p.producto_id)?.cantidad || 1) - 1))
                  }>-</button>
                  <input
                    type="number"
                    min={1}
                    max={p.cantidad}
                    value={carrito.find(x => x.producto_id === p.producto_id)?.cantidad || 1}
                    onChange={e =>
                      handleEditarCantidad(
                        p.producto_id,
                        Math.max(1, Math.min(Number(e.target.value), p.cantidad))
                      )
                    }
                    className="w-12 border rounded"
                  />
                  <button onClick={() =>
                    handleEditarCantidad(p.producto_id, Math.min(p.cantidad, (carrito.find(x => x.producto_id === p.producto_id)?.cantidad || 1) + 1))
                  }>+</button>
                  <button
                    className="text-xs text-red-500"
                    onClick={() => handleQuitarProducto(p.producto_id)}
                  >Quitar</button>
                </div>
              )}
            </div>
          ))}
          {productos.length === 0 && (
            <div className="text-gray-400 text-sm px-2">Sin productos para esta van o búsqueda.</div>
          )}
        </div>
        {/* Productos más vendidos */}
        {productosMasVendidos.length > 0 && (
          <div className="bg-yellow-50 rounded border p-3 mt-4">
            <b>Productos más vendidos</b>
            {productosMasVendidos.map(p => (
              <div
                key={p.producto_id}
                className="p-2 border-b cursor-pointer hover:bg-yellow-100"
                onClick={() => handleAgregarProducto({
                  producto_id: p.producto_id,
                  productos: { nombre: p.nombre, precio: p.precio },
                  cantidad: p.cantidad_disponible,
                })}
              >
                {p.nombre} - Disponible: {p.cantidad_disponible} - Precio: ${p.precio.toFixed(2)}
              </div>
            ))}
          </div>
        )}
        {/* Carrito */}
        {carrito.length > 0 && (
          <div className="bg-gray-50 rounded border p-3 mt-4">
            <b>Carrito</b>
            {carrito.map(p => (
              <div key={p.producto_id} className="flex justify-between">
                <span>{p.nombre}</span>
                <span>{p.cantidad} x ${p.precio_unitario.toFixed(2)}</span>
                <button className="text-xs text-red-500" onClick={() => handleQuitarProducto(p.producto_id)}>Quitar</button>
              </div>
            ))}
            <div className="font-bold mt-2">Total: ${totalVenta.toFixed(2)}</div>
          </div>
        )}
        <div className="flex justify-between mt-4">
          <button
            className="bg-gray-400 text-white px-4 py-2 rounded"
            onClick={() => setPaso(1)}
          >
            Atrás
          </button>
          <button
            className="bg-blue-700 text-white px-4 py-2 rounded"
            disabled={carrito.length === 0}
            onClick={() => setPaso(3)}
          >
            Siguiente
          </button>
        </div>
        {/* SCANNER MODAL */}
        {scannerOpen && (
          <BarcodeScanner
            onResult={handleCodigoEscaneado}
            onClose={() => setScannerOpen(false)}
          />
        )}
      </div>
    );
  }

  // Paso 3: Pagos y guardado
  function renderPasoPago() {
    function handleChangePago(index, campo, valor) {
      setPagos(arr =>
        arr.map((p, i) => i === index ? { ...p, [campo]: valor } : p)
      );
    }
    function handleAgregarPago() {
      setPagos([...pagos, { forma: "efectivo", monto: 0 }]);
    }
    function handleQuitarPago(index) {
      setPagos(pagos => pagos.length === 1 ? pagos : pagos.filter((_, i) => i !== index));
    }

    return (
      <div>
        <h2 className="text-xl font-bold mb-4">Pago</h2>
        <div className="font-semibold mb-2">
          Total a pagar: <span className="text-green-700">${totalVenta.toFixed(2)}</span>
        </div>
        {Number(saldoCliente) > 0 && (
          <div className="mb-2 text-red-600">
            <b>Saldo pendiente del cliente: ${Number(saldoCliente).toFixed(2)}</b>
          </div>
        )}
        <div className="mb-2">
          <b>Formas de pago:</b>
          {pagos.map((p, i) => (
            <div className="flex items-center gap-2 mt-1" key={i}>
              <select
                value={p.forma}
                onChange={e => handleChangePago(i, "forma", e.target.value)}
                className="border rounded px-2 py-1"
              >
                {FORMAS_PAGO.map(fp => (
                  <option key={fp.key} value={fp.key}>{fp.label}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                value={p.monto}
                onChange={e => handleChangePago(i, "monto", e.target.value)}
                className="border rounded px-2 py-1 w-24"
              />
              {pagos.length > 1 && (
                <button className="text-xs text-red-600" onClick={() => handleQuitarPago(i)}>Quitar</button>
              )}
            </div>
          ))}
          <button className="text-xs text-blue-700 mt-1" onClick={handleAgregarPago}>+ Agregar forma de pago</button>
        </div>
        <div className="mb-2">
          Pagado: <b>${pagado.toFixed(2)}</b>
        </div>
        {devuelto > 0 && (
          <div className="mb-2 text-green-700">
            Devuelto al cliente: ${devuelto.toFixed(2)}
          </div>
        )}
        {saldoPendiente > 0 && (
          <div className="mb-2 text-orange-600">
            Saldo pendiente (deuda): ${saldoPendiente.toFixed(2)}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button
            className="bg-gray-400 text-white px-4 py-2 rounded"
            onClick={() => setPaso(2)}
            disabled={guardando}
          >
            Atrás
          </button>
          <button
            className="bg-green-700 text-white px-4 py-2 rounded"
            disabled={guardando}
            onClick={guardarVenta}
          >
            {guardando ? "Guardando..." : "Guardar Venta"}
          </button>
        </div>
        {errorPago && <div className="text-red-600 mt-2">{errorPago}</div>}
      </div>
    );
  }

  // Render dirección util
  function renderDireccion(direccion) {
    if (!direccion) return null;
    if (typeof direccion === "string") {
      try { direccion = JSON.parse(direccion); } catch { }
    }
    if (typeof direccion === "object") {
      return (
        <span>
          <span role="img" aria-label="pin">📍</span>
          {direccion.calle && `${direccion.calle}, `}
          {direccion.ciudad && `${direccion.ciudad}, `}
          {direccion.estado && `${direccion.estado}`}
          {direccion.zip && `, ${direccion.zip}`}
        </span>
      );
    }
    return <span>{direccion}</span>;
  }

  return (
    <div className="w-full max-w-lg mx-auto p-4 bg-white rounded shadow my-4">
      {paso === 1 && renderPasoCliente()}
      {paso === 2 && renderPasoProductos()}
      {paso === 3 && renderPasoPago()}
    </div>
  );
}

// --- CrearClienteRapido igual que antes ---
function CrearClienteRapido({ onClose, onCreate }) {
  const [form, setForm] = useState({ nombre: "", apellido: "", telefono: "", email: "" });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function handleCrear(e) {
    e.preventDefault();
    setCargando(true);
    setError("");
    const { data, error: err } = await supabase
      .from("clientes")
      .insert([form])
      .select()
      .maybeSingle();
    setCargando(false);
    if (err) {
      setError("No se pudo crear el cliente");
      return;
    }
    onCreate(data);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-20">
      <form
        className="bg-white p-6 rounded shadow-md w-full max-w-md"
        onSubmit={handleCrear}
      >
        <h3 className="font-bold mb-2">Nuevo Cliente</h3>
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
            disabled={cargando}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 bg-blue-700 text-white py-2 rounded"
            disabled={cargando}
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
