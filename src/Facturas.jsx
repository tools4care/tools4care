import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";

// ... (define formatAddress, formatPhone, descargarPDFFactura igual que antes)

export default function Facturas() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  const [facturas, setFacturas] = useState([]);
  const [filtros, setFiltros] = useState({
    cliente: "",
    numeroFactura: "",
    fechaInicio: "",
    fechaFin: "",
    estado: "",
    van: "",
  });
  const [loading, setLoading] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);

  // Paginación
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);
  const [totalVentas, setTotalVentas] = useState(0);

  // Cargar vans para admins (una sola vez)
  const [listaVans, setListaVans] = useState([]);
  useEffect(() => {
    async function fetchVans() {
      if (usuario?.rol === "admin") {
        const { data } = await supabase.from("vans").select("*").order("nombre_van", { ascending: true });
        setListaVans(data || []);
      }
    }
    fetchVans();
  }, [usuario]);

  // Preselección automática VAN filtro (no-admin)
  useEffect(() => {
    if (usuario && usuario.rol !== "admin" && van) {
      setFiltros(f => ({ ...f, van: van.id }));
    }
    if (usuario && usuario.rol === "admin") {
      setFiltros(f => ({ ...f, van: "" }));
    }
    // eslint-disable-next-line
  }, [usuario, van]);

  // Cargar ventas paginadas y filtradas
  useEffect(() => {
    cargarFacturas();
    // eslint-disable-next-line
  }, [pagina, porPagina, filtros.van]);

  async function cargarFacturas() {
    setLoading(true);

    let query = supabase
      .from("facturas_ext")
      .select("*", { count: "exact" });

    // Filtros extendidos
    if (filtros.cliente) {
      query = query.or(
        [
          `cliente_nombre.ilike.%${filtros.cliente}%`,
          `cliente_nombre_real.ilike.%${filtros.cliente}%`,
          `cliente_telefono_real.ilike.%${filtros.cliente}%`,
          `cliente_email_real.ilike.%${filtros.cliente}%`,
          `telefono.ilike.%${filtros.cliente}%`,
          `email.ilike.%${filtros.cliente}%`
        ].join(',')
      );
    }
    if (filtros.numeroFactura) {
      query = query.ilike("numero_factura", `%${filtros.numeroFactura}%`);
    }
    if (filtros.fechaInicio) {
      query = query.gte("fecha", filtros.fechaInicio);
    }
    if (filtros.fechaFin) {
      query = query.lte("fecha", filtros.fechaFin);
    }
    if (filtros.estado) {
      query = query.eq("estado_pago", filtros.estado);
    }
    // Filtro VAN
    if (filtros.van) {
      query = query.eq("van_id", filtros.van);
    } else if (usuario?.rol !== "admin" && van?.id) {
      query = query.eq("van_id", van.id);
    }

    // Paginación
    const desde = (pagina - 1) * porPagina;
    const hasta = desde + porPagina - 1;
    query = query.order("fecha", { ascending: false }).range(desde, hasta);

    const { data, error, count } = await query;
    setFacturas(data || []);
    setTotalVentas(count || 0);
    setLoading(false);
  }

  function handleInput(e) {
    setFiltros(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleFiltrar() {
    setPagina(1);
    cargarFacturas();
  }

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h2 className="text-2xl font-bold mb-6 text-blue-900 text-center">Facturas (Ventas)</h2>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input name="cliente" value={filtros.cliente} onChange={handleInput} className="border p-2 rounded" placeholder="Buscar nombre, teléfono o email" />
        <input name="numeroFactura" value={filtros.numeroFactura} onChange={handleInput} className="border p-2 rounded" placeholder="Factura" />
        <input name="fechaInicio" type="date" value={filtros.fechaInicio} onChange={handleInput} className="border p-2 rounded" />
        <input name="fechaFin" type="date" value={filtros.fechaFin} onChange={handleInput} className="border p-2 rounded" />
        <select name="estado" value={filtros.estado} onChange={handleInput} className="border p-2 rounded">
          <option value="">Todos</option>
          <option value="pagado">Pagado</option>
          <option value="pendiente">Pendiente</option>
          <option value="anulada">Anulada</option>
        </select>
        {/* Selector VAN solo para admin */}
        {usuario?.rol === "admin" && (
          <select
            name="van"
            value={filtros.van}
            onChange={handleInput}
            className="border p-2 rounded min-w-[120px]"
          >
            <option value="">Todas las VAN</option>
            {listaVans.map(v => (
              <option key={v.id} value={v.id}>
                {v.nombre_van}
              </option>
            ))}
          </select>
        )}
        <button className="bg-blue-700 text-white px-4 py-2 rounded font-bold" onClick={handleFiltrar} type="button">Filtrar</button>
        <select value={porPagina} onChange={e => { setPorPagina(Number(e.target.value)); setPagina(1); }} className="border p-2 rounded">
          {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} por página</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-blue-600">Cargando facturas…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm rounded shadow">
            <thead>
              <tr className="bg-blue-100">
                <th className="p-2">Número</th>
                <th className="p-2">Fecha</th>
                <th className="p-2">Cliente</th>
                <th className="p-2">Total</th>
                <th className="p-2">VAN</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-4">
                    Sin resultados.
                  </td>
                </tr>
              )}
              {facturas.map(f => (
                <tr
                  key={f.id}
                  className="hover:bg-blue-50 cursor-pointer"
                  onClick={() => setFacturaSeleccionada(f)}
                >
                  <td className="p-2 font-mono">{f.numero_factura || f.id?.slice(0,8)}</td>
                  <td className="p-2">{f.fecha ? new Date(f.fecha).toLocaleDateString("es-DO") : ""}</td>
                  <td className="p-2">{f.cliente_nombre_real || f.cliente_nombre || f.cliente_id || "-"}</td>
                  <td className="p-2">${Number(f.total_venta || 0).toFixed(2)}</td>
                  <td className="p-2">{f.van_id || "-"}</td>
                  <td className="p-2">
                    <span className={
                      f.estado_pago === "pagado"
                        ? "bg-green-100 text-green-700 px-2 py-1 rounded"
                        : f.estado_pago === "pendiente"
                        ? "bg-yellow-100 text-yellow-700 px-2 py-1 rounded"
                        : "bg-gray-100 text-gray-700 px-2 py-1 rounded"
                    }>
                      {f.estado_pago}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PAGINADOR */}
      <div className="flex justify-center my-4 gap-2">
        <button
          className="px-3 py-1 bg-gray-200 rounded"
          onClick={() => setPagina(p => Math.max(1, p - 1))}
          disabled={pagina === 1}
        >Anterior</button>
        <span>Página {pagina} de {Math.ceil(totalVentas / porPagina) || 1}</span>
        <button
          className="px-3 py-1 bg-gray-200 rounded"
          onClick={() => setPagina(p => p + 1)}
          disabled={pagina >= Math.ceil(totalVentas / porPagina)}
        >Siguiente</button>
      </div>

      {/* MODAL DETALLE FACTURA */}
      {facturaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="font-bold text-lg mb-2">Detalles de la factura</h3>
            <div className="text-xs text-gray-700 mb-2">
              <div><b>ID:</b> {facturaSeleccionada.id}</div>
              <div><b>Fecha:</b> {facturaSeleccionada.fecha ? new Date(facturaSeleccionada.fecha).toLocaleDateString("es-DO") : ""}</div>
              <div><b>Cliente:</b> {facturaSeleccionada.cliente_nombre_real || facturaSeleccionada.cliente_nombre || "-"}</div>
              <div><b>Teléfono:</b> {facturaSeleccionada.cliente_telefono_real || facturaSeleccionada.telefono || "-"}</div>
              <div><b>Email:</b> {facturaSeleccionada.cliente_email_real || facturaSeleccionada.email || "-"}</div>
              <div><b>Total:</b> ${Number(facturaSeleccionada.total_venta || 0).toFixed(2)}</div>
              <div><b>VAN:</b> {facturaSeleccionada.van_id || "-"}</div>
              <div><b>Estado:</b> <span className={facturaSeleccionada.estado_pago === "pagado" ? "text-green-600" : "text-yellow-600"}>{facturaSeleccionada.estado_pago}</span></div>
            </div>
            <button
              className="w-full mb-2 bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded"
              // onClick={() => descargarPDFFactura(facturaSeleccionada)} // Usa tu función si la tienes
            >Descargar PDF</button>
            <button
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded"
              onClick={() => setFacturaSeleccionada(null)}
            >Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Usa tus funciones: formatAddress, formatPhone, descargarPDFFactura igual que antes
