import { useState, useEffect } from "react";
import BarcodeScanner from "./BarcodeScanner"; // Tu componente de scanner
import { supabase } from "./supabaseClient";

export default function AgregarStockModal({
  abierto, cerrar, tipo, ubicacionId, onSuccess, modoSuma
}) {
  const [busqueda, setBusqueda] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [scannerAbierto, setScannerAbierto] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [productos, setProductos] = useState([]);
  const [mensaje, setMensaje] = useState("");

  // Cargar todos los productos al abrir el modal
  useEffect(() => {
    if (!abierto) return;
    setBusqueda("");
    setCantidad(1);
    setProductoSeleccionado(null);
    setMensaje("");
    async function cargarProductos() {
      const { data } = await supabase.from("productos").select("*");
      setProductos(data || []);
    }
    cargarProductos();
  }, [abierto]);

  // Buscar producto automáticamente cuando cambia la búsqueda (por escaneo o input manual)
  useEffect(() => {
    if (!busqueda.trim()) {
      setProductoSeleccionado(null);
      setMensaje("");
      return;
    }
    const encontrado = productos.find(
      p =>
        (p.codigo && p.codigo.toString().toLowerCase() === busqueda.toLowerCase()) ||
        (p.nombre && p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    );
    if (encontrado) {
      setProductoSeleccionado(encontrado);
      setMensaje("");
    } else {
      setProductoSeleccionado(null);
      setMensaje("Producto no encontrado. Puedes verificar el código o crearlo.");
    }
  }, [busqueda, productos]);

  // Handler del scanner
  function handleBarcodeDetected(codigo) {
    setBusqueda(codigo);
    setScannerAbierto(false);
  }

  async function agregarStock() {
    if (!productoSeleccionado || cantidad <= 0) return;
    // Aquí tu lógica de agregar stock (ajusta según tu backend)
    // Ejemplo: sumando a stock_almacen o stock_van
    let tabla = tipo === "almacen" ? "stock_almacen" : "stock_van";
    let datos = {
      producto_id: productoSeleccionado.id,
      cantidad,
    };
    if (tipo === "van") datos.van_id = ubicacionId;
    // Aquí puedes mejorar con UPSERT si lo necesitas
    await supabase.from(tabla).insert([datos]);
    if (onSuccess) onSuccess();
    cerrar();
  }

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white p-6 rounded-xl shadow-xl min-w-[350px] max-w-xs w-full">
        <h3 className="font-bold mb-2">Agregar Stock</h3>
        <div className="mb-2 flex gap-2">
          <input
            className="border rounded p-2 w-full"
            placeholder="Escanea o escribe código, nombre..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            autoFocus
          />
          <button
            className="bg-gray-200 rounded px-2"
            title="Escanear código"
            type="button"
            onClick={() => setScannerAbierto(true)}
          >
            <span role="img" aria-label="scan">📷</span>
          </button>
        </div>

        {/* Info producto seleccionado */}
        {productoSeleccionado ? (
          <div className="bg-blue-50 rounded p-2 mb-2 text-xs">
            <b>Producto:</b> {productoSeleccionado.nombre} <br />
            <b>Marca:</b> {productoSeleccionado.marca} <br />
            <b>Código:</b> {productoSeleccionado.codigo}
          </div>
        ) : (
          mensaje && <div className="bg-yellow-100 text-yellow-900 rounded p-2 mb-2 text-xs">{mensaje}</div>
        )}

        <input
          className="border rounded p-2 w-full mb-2"
          type="number"
          value={cantidad}
          min={1}
          onChange={e => setCantidad(Number(e.target.value))}
        />

        <div className="flex gap-2">
          <button
            className="bg-blue-600 text-white px-4 py-1 rounded flex-1"
            onClick={agregarStock}
            disabled={!productoSeleccionado || cantidad <= 0}
          >
            Agregar
          </button>
          <button className="bg-gray-300 px-4 py-1 rounded flex-1" onClick={cerrar}>
            Cancelar
          </button>
        </div>

        {/* Scanner modal */}
        {scannerAbierto && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 relative">
              <h4 className="font-bold mb-2">Escanea código de barras</h4>
              <BarcodeScanner
                onDetected={handleBarcodeDetected}
                cerrar={() => setScannerAbierto(false)}
              />
              <button
                onClick={() => setScannerAbierto(false)}
                className="absolute top-2 right-2 px-3 py-1 rounded bg-red-600 text-white"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
