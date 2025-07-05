import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  BadgeDollarSign,
  Clock,
  CheckCircle2,
  Hourglass,
  ChevronDown,
  ChevronUp,
  Search,
  Users,
  Calendar,
  User,
  Download,
  FileText
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ReporteDia() {
  const [ventas, setVentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [expandida, setExpandida] = useState(null);

  // Resumen
  const resumen = ventas.reduce(
    (acc, v) => {
      acc.total += Number(v.total);
      acc.pagado += v.estado_pago === "pagado" ? Number(v.total) : 0;
      acc.pendiente += v.estado_pago === "pendiente" ? Number(v.total) : 0;
      acc.count += 1;
      return acc;
    },
    { total: 0, pagado: 0, pendiente: 0, count: 0 }
  );

  useEffect(() => {
    async function cargar() {
      let query = supabase
        .from("ventas")
        .select(
          `
          id,
          fecha,
          total,
          estado_pago,
          cliente_id,
          usuario_id,
          clientes:cliente_id(nombre),
          usuarios:usuario_id(nombre, email),
          detalle_ventas(
            producto_id,
            cantidad,
            precio_unitario,
            subtotal,
            productos:producto_id(nombre, marca)
          )
          `
        )
        .order("fecha", { ascending: false })
        .gte(
          "fecha",
          filtroFecha
            ? filtroFecha + " 00:00:00"
            : new Date().toISOString().slice(0, 10) + " 00:00:00"
        )
        .lte(
          "fecha",
          filtroFecha
            ? filtroFecha + " 23:59:59"
            : new Date().toISOString().slice(0, 10) + " 23:59:59"
        );

      if (filtroEstado !== "todos") query = query.eq("estado_pago", filtroEstado);
      if (filtroCliente) query = query.eq("cliente_id", filtroCliente);
      if (filtroVendedor) query = query.eq("usuario_id", filtroVendedor);

      let { data: ventasData } = await query;

      if (busqueda) {
        ventasData = ventasData.filter((v) => {
          const cliente = v.clientes?.nombre?.toLowerCase() || "";
          const vendedor = v.usuarios?.nombre?.toLowerCase() || "";
          const productos = v.detalle_ventas
            ?.map((d) => d.productos?.nombre?.toLowerCase())
            .join(",") || "";
          const id = v.id.toLowerCase();
          return (
            cliente.includes(busqueda.toLowerCase()) ||
            vendedor.includes(busqueda.toLowerCase()) ||
            productos.includes(busqueda.toLowerCase()) ||
            id.includes(busqueda.toLowerCase())
          );
        });
      }

      setVentas(ventasData || []);
    }

    async function cargarClientes() {
      const { data } = await supabase.from("clientes").select("id, nombre");
      setClientes(data || []);
    }

    async function cargarUsuarios() {
      const { data } = await supabase.from("usuarios").select("id, nombre, email");
      setUsuarios(data || []);
    }

    cargar();
    cargarClientes();
    cargarUsuarios();
  }, [filtroEstado, filtroCliente, filtroFecha, filtroVendedor, busqueda]);

  // Helpers
  function nombreCliente(venta) {
    return venta.clientes?.nombre || "Sin cliente";
  }
  function nombreVendedor(venta) {
    return venta.usuarios?.nombre || "Sin vendedor";
  }
  function formatoHora(f) {
    const fecha = new Date(f);
    return fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  function formatoFecha(f) {
    const fecha = new Date(f);
    return fecha.toLocaleDateString();
  }
  function expandRow(id) {
    setExpandida(expandida === id ? null : id);
  }

  // Exportar a PDF
  function exportarPDF() {
    const doc = new jsPDF();
    // Logo o Título
    doc.setFontSize(18);
    doc.text("Reporte de Ventas del Día", 14, 15);

    // Resumen
    doc.setFontSize(12);
    doc.text(
      `Fecha: ${filtroFecha || new Date().toISOString().slice(0, 10)}   Total ventas: ${resumen.count}   Monto total: $${resumen.total.toFixed(
        2
      )}   Pagado: $${resumen.pagado.toFixed(2)}   Pendiente: $${resumen.pendiente.toFixed(2)}`,
      14,
      25
    );

    // Tabla ventas
    autoTable(doc, {
      startY: 30,
      head: [
        [
          "Hora",
          "Factura",
          "Cliente",
          "Vendedor",
          "Total",
          "Estado",
          "Productos"
        ]
      ],
      body: ventas.map((v) => [
        formatoHora(v.fecha),
        v.id.slice(0, 8) + "...",
        nombreCliente(v),
        nombreVendedor(v),
        "$" + Number(v.total).toFixed(2),
        v.estado_pago,
        v.detalle_ventas
          .map(
            (d) =>
              `${d.productos?.nombre || ""} (${d.cantidad} x $${d.precio_unitario})`
          )
          .join("; ")
      ]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save(`reporte_ventas_${filtroFecha || new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="max-w-5xl mx-auto mt-8 bg-white p-8 rounded-2xl shadow-xl">
      <h2 className="text-3xl font-bold mb-6 text-blue-900 flex items-center gap-3">
        <BadgeDollarSign className="text-green-600" /> Reporte de Ventas del Día
      </h2>
      {/* RESUMEN */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 text-center shadow">
          <div className="text-2xl font-bold">${resumen.total.toFixed(2)}</div>
          <div className="text-xs text-blue-800 font-semibold">Total Vendido</div>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-center shadow">
          <div className="text-2xl font-bold text-green-700">${resumen.pagado.toFixed(2)}</div>
          <div className="text-xs text-green-800 font-semibold">Pagado</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 text-center shadow">
          <div className="text-2xl font-bold text-orange-700">${resumen.pendiente.toFixed(2)}</div>
          <div className="text-xs text-orange-800 font-semibold">Pendiente</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center shadow">
          <div className="text-2xl font-bold">{resumen.count}</div>
          <div className="text-xs text-gray-800 font-semibold">Ventas</div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div>
          <label className="block text-xs font-bold mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Estado
          </label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="border p-2 rounded">
            <option value="todos">Todos</option>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 flex items-center gap-1">
            <Users className="w-4 h-4" /> Cliente
          </label>
          <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} className="border p-2 rounded w-36">
            <option value="">Todos</option>
            {clientes.map(c => <option value={c.id} key={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 flex items-center gap-1">
            <User className="w-4 h-4" /> Vendedor
          </label>
          <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} className="border p-2 rounded w-36">
            <option value="">Todos</option>
            {usuarios.map(u => <option value={u.id} key={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 flex items-center gap-1">
            <Calendar className="w-4 h-4" /> Fecha
          </label>
          <input type="date" value={filtroFecha || new Date().toISOString().slice(0, 10)}
            onChange={e => setFiltroFecha(e.target.value)}
            className="border p-2 rounded w-40" />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 flex items-center gap-1">
            <Search className="w-4 h-4" /> Buscar
          </label>
          <input
            type="text"
            className="border p-2 rounded w-40"
            placeholder="Cliente, producto, #..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        {/* Botón Exportar PDF */}
        <div>
          <button
            className="bg-blue-700 hover:bg-blue-800 text-white font-bold flex gap-2 items-center px-5 py-2 rounded-2xl shadow mt-5"
            onClick={exportarPDF}
          >
            <Download className="w-5 h-5" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* TABLA */}
      <div className="overflow-x-auto rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-blue-50">
            <tr>
              <th className="p-2">Hora</th>
              <th className="p-2">Factura</th>
              <th className="p-2">Cliente</th>
              <th className="p-2">Vendedor</th>
              <th className="p-2">Total</th>
              <th className="p-2">Estado</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {ventas.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">
                  No hay ventas en este periodo.
                </td>
              </tr>
            )}
            {ventas.map(v => (
              <>
                <tr key={v.id} className="hover:bg-blue-50 transition">
                  <td className="p-2 font-mono">{formatoHora(v.fecha)}</td>
                  <td className="p-2 text-xs">{v.id.slice(0, 8)}...</td>
                  <td className="p-2">{nombreCliente(v)}</td>
                  <td className="p-2">{nombreVendedor(v)}</td>
                  <td className="p-2 font-bold text-right">${Number(v.total).toFixed(2)}</td>
                  <td className="p-2">
                    {v.estado_pago === "pagado" ? (
                      <span className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Pagado
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 text-xs font-bold flex items-center gap-1">
                        <Hourglass className="w-4 h-4" /> Pendiente
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <button
                      className="text-blue-700 hover:text-blue-900"
                      onClick={() => expandRow(v.id)}
                      title="Ver productos"
                    >
                      {expandida === v.id ? <ChevronUp /> : <ChevronDown />}
                    </button>
                  </td>
                </tr>
                {expandida === v.id && (
                  <tr>
                    <td colSpan={7} className="bg-blue-50 px-4 py-2">
                      <b>Productos:</b>
                      <div className="mt-2">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr>
                              <th className="p-1">Producto</th>
                              <th className="p-1">Marca</th>
                              <th className="p-1">Cantidad</th>
                              <th className="p-1">Precio U.</th>
                              <th className="p-1">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {v.detalle_ventas?.map((d, i) => (
                              <tr key={i}>
                                <td className="p-1">{d.productos?.nombre || "-"}</td>
                                <td className="p-1">{d.productos?.marca || "-"}</td>
                                <td className="p-1">{d.cantidad}</td>
                                <td className="p-1">${Number(d.precio_unitario).toFixed(2)}</td>
                                <td className="p-1 font-bold">${Number(d.subtotal).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
