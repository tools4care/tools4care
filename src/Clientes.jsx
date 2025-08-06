import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useLocation, useNavigate } from "react-router-dom";

// --- Utilidades para autollenado y estados ---
const estadosUSA = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY"
];

const zipToCiudadEstado = (zip) => {
  const mapa = {
    "02118": { ciudad: "Boston", estado: "MA" },
    "02139": { ciudad: "Cambridge", estado: "MA" },
    "01960": { ciudad: "Peabody", estado: "MA" },
    "01915": { ciudad: "Beverly", estado: "MA" },
  };
  return mapa[zip] || { ciudad: "", estado: "" };
};

// ---------- COMPONENTE PRINCIPAL ----------
export default function Clientes() {
  const location = useLocation();
  const navigate = useNavigate();

  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarStats, setMostrarStats] = useState(false);
  const [mostrarEdicion, setMostrarEdicion] = useState(false);
  const [mostrarAbono, setMostrarAbono] = useState(false);
  const [resumen, setResumen] = useState({ ventas: [], pagos: [], balance: 0 });
  const [mensaje, setMensaje] = useState("");
  const [estadoInput, setEstadoInput] = useState("");
  const [estadoOpciones, setEstadoOpciones] = useState(estadosUSA);
  const [mesSeleccionado, setMesSeleccionado] = useState(null);

  // --- Formulario ---
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    negocio: "",
    direccion: { calle: "", ciudad: "", estado: "", zip: "" },
  });

  useEffect(() => { cargarClientes(); }, []);
  async function cargarClientes() {
    const { data, error } = await supabase.from("clientes_balance").select("*");
    if (!error) setClientes(data);
    else setMensaje("Error loading clients");
  }

  useEffect(() => {
    async function cargarResumen() {
      if (!clienteSeleccionado) return setResumen({ ventas: [], pagos: [], balance: 0 });
      const { data: ventas } = await supabase
        .from("ventas")
        .select("id, fecha, total_venta, total_pagado, estado_pago")
        .eq("cliente_id", clienteSeleccionado.id);
      const { data: pagos } = await supabase
        .from("pagos")
        .select("id, fecha_pago, monto, metodo_pago")
        .eq("cliente_id", clienteSeleccionado.id);

      const deudaVentas = (ventas || []).reduce(
        (t, v) => t + Math.max(0, (v.total_venta || 0) - (v.total_pagado || 0)), 0
      );
      const abonos = (pagos || []).reduce((t, p) => t + (p.monto || 0), 0);
      const balance = Math.max(deudaVentas - abonos, 0);

      setResumen({ ventas: ventas || [], pagos: pagos || [], balance });
      setMesSeleccionado(null);
    }
    if (clienteSeleccionado && (mostrarStats || mostrarEdicion || mostrarAbono)) cargarResumen();
  }, [clienteSeleccionado, mostrarStats, mostrarEdicion, mostrarAbono]);

  function abrirNuevoCliente() {
    setForm({
      nombre: "",
      telefono: "",
      email: "",
      negocio: "",
      direccion: { calle: "", ciudad: "", estado: "", zip: "" },
    });
    setEstadoInput("");
    setEstadoOpciones(estadosUSA);
    setClienteSeleccionado(null);
    setMostrarEdicion(true);
    setMensaje("");
  }

  useEffect(() => {
    if (location.pathname.endsWith("/clientes/nuevo")) {
      abrirNuevoCliente();
    } else {
      setMostrarEdicion(false);
    }
    // eslint-disable-next-line
  }, [location.pathname]);

  function handleEditCliente() {
    let direccion = { calle: "", ciudad: "", estado: "", zip: "" };
    const c = clienteSeleccionado;
    if (typeof c.direccion === "string" && c.direccion) {
      try { direccion = JSON.parse(c.direccion); } catch {}
    }
    if (typeof c.direccion === "object" && c.direccion !== null) {
      direccion = {
        calle: c.direccion.calle || "",
        ciudad: c.direccion.ciudad || "",
        estado: c.direccion.estado || "",
        zip: c.direccion.zip || "",
      };
    }
    setForm({
      nombre: c.nombre || "",
      telefono: c.telefono || "",
      email: c.email || "",
      negocio: c.negocio || "",
      direccion,
    });
    setEstadoInput(direccion.estado || "");
    setEstadoOpciones(estadosUSA);
    setMostrarEdicion(true);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    if (["calle", "ciudad", "estado", "zip"].includes(name)) {
      setForm((f) => {
        let newDireccion = { ...f.direccion, [name]: value };
        if (name === "estado") {
          setEstadoInput(value.toUpperCase());
          setEstadoOpciones(estadosUSA.filter(s => s.startsWith(value.toUpperCase())));
        }
        if (name === "zip" && value.length === 5) {
          const { ciudad, estado } = zipToCiudadEstado(value);
          if (ciudad || estado) {
            newDireccion.ciudad = ciudad;
            newDireccion.estado = estado;
            setEstadoInput(estado);
            setEstadoOpciones(estadosUSA.filter(s => s.startsWith(estado)));
          }
        }
        return { ...f, direccion: newDireccion };
      });
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  async function handleGuardar(e) {
    e.preventDefault();
    if (!form.nombre) return setMensaje("Full name is required");
    let direccionFinal = form.direccion || { calle: "", ciudad: "", estado: "", zip: "" };

    if (!clienteSeleccionado) {
      const { error } = await supabase.from("clientes").insert([{ ...form, direccion: direccionFinal }]);
      if (error) setMensaje("Error saving: " + error.message);
      else {
        setMensaje("Client saved successfully");
        setMostrarEdicion(false);
        cargarClientes();
        navigate("/clientes");
      }
    } else {
      const { error } = await supabase.from("clientes")
        .update({ ...form, direccion: direccionFinal })
        .eq("id", clienteSeleccionado.id);
      if (error) setMensaje("Error editing: " + error.message);
      else {
        setMensaje("Changes saved successfully");
        setMostrarEdicion(false);
        cargarClientes();
        navigate("/clientes");
      }
    }
  }

  async function handleEliminar(cliente) {
    if (!cliente || !window.confirm("Delete this client?")) return;
    const { error } = await supabase.from("clientes").delete().eq("id", cliente.id);
    if (error) setMensaje("Error deleting: " + error.message);
    else {
      setMensaje("Client deleted");
      setMostrarStats(false);
      setClienteSeleccionado(null);
      cargarClientes();
    }
  }

  const clientesFiltrados = clientes.filter((c) => {
    let d = { calle: "", ciudad: "", estado: "", zip: "" };
    if (typeof c.direccion === "string" && c.direccion) {
      try { d = JSON.parse(c.direccion); } catch {}
    }
    if (typeof c.direccion === "object" && c.direccion !== null) {
      d = c.direccion;
    }
    const textoBusqueda = busqueda.toLowerCase();
    const telefonoCliente = (c.telefono || "").replace(/\D/g, "");
    const telefonoBusqueda = busqueda.replace(/\D/g, "");
    return (
      [
        c.nombre, c.email, c.negocio,
        d.calle, d.ciudad, d.estado, d.zip
      ].join(" ").toLowerCase().includes(textoBusqueda) ||
      (telefonoBusqueda.length > 2 && telefonoCliente.includes(telefonoBusqueda))
    );
  });

  const mesesUnicos = Array.from(new Set((resumen.ventas || []).map(v => v.fecha?.slice(0, 7)).filter(Boolean))).sort();
  const ventasFiltradas = mesSeleccionado
    ? resumen.ventas.filter(v => v.fecha?.startsWith(mesSeleccionado))
    : resumen.ventas;

  const comprasPorMes = {};
  let lifetimeTotal = 0;
  (resumen.ventas || []).forEach(v => {
    if (!v.fecha || !v.total_venta) return;
    const mes = v.fecha.slice(0, 7);
    comprasPorMes[mes] = (comprasPorMes[mes] || 0) + Number(v.total_venta || 0);
    lifetimeTotal += Number(v.total_venta || 0);
  });

  const mesesGrafico = [];
  const hoy = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mesesGrafico.unshift(label);
  }
  const dataChart = mesesGrafico.map(mes => ({
    mes,
    compras: comprasPorMes[mes] || 0
  }));

  function formatDateUS(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return "";
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  }

  async function generatePDF() {
    if (!clienteSeleccionado) return;
    const doc = new jsPDF();
    const businessName = "Tools4Care";
    const businessAddress = "108 Lafayette St, Salem, MA 01970";
    const businessPhone = "(978) 594-1624";
    const reportTitle = "Sales Report";

    doc.setFontSize(18);
    doc.text(businessName, 14, 20);
    doc.setFontSize(11);
    doc.text(businessAddress, 14, 27);
    doc.text(`Phone: ${businessPhone}`, 14, 34);
    doc.setLineWidth(0.5);
    doc.line(14, 38, 196, 38);

    doc.setFontSize(14);
    doc.text("Client Information:", 14, 46);
    doc.setFontSize(12);
    doc.text(`Full Name: ${clienteSeleccionado.nombre || ""}`, 14, 53);
    doc.text(`Business Name: ${clienteSeleccionado.negocio || ""}`, 14, 60);
    const direccionCliente = clienteSeleccionado.direccion || {};
    const direccionTexto = [
      direccionCliente.calle,
      direccionCliente.ciudad,
      direccionCliente.estado,
      direccionCliente.zip
    ].filter(Boolean).join(", ");
    doc.text(`Address: ${direccionTexto}`, 14, 67);
    doc.text(`Phone: ${clienteSeleccionado.telefono || ""}`, 14, 74);

    doc.setLineWidth(0.5);
    doc.line(14, 78, 196, 78);

    doc.setFontSize(16);
    doc.text(reportTitle, 14, 86);
    const todayStr = new Date().toLocaleDateString("en-US");
    doc.setFontSize(11);
    doc.text(`Date: ${todayStr}`, 14, 93);

    const ventasData = Object.entries(comprasPorMes)
      .map(([mes, total]) => [mes, `$${total.toFixed(2)}`])
      .sort((a,b) => b[0].localeCompare(a[0]));

    autoTable(doc, {
      startY: 100,
      head: [["Month", "Total Sales"]],
      body: ventasData,
      theme: "grid",
      styles: { fontSize: 10 },
      headStyles: { fillColor: [25, 118, 210] },
    });

    const finalY = doc.lastAutoTable.finalY || 110;
    doc.setFontSize(12);
    doc.text(`Lifetime Total Sales: $${lifetimeTotal.toFixed(2)}`, 14, finalY + 10);

    doc.save(`SalesReport_${clienteSeleccionado.nombre || "Client"}.pdf`);
  }

  // --- UI principal ---
  return (
    <div className="max-w-5xl mx-auto py-7 px-2">
      <h2 className="text-3xl font-bold mb-6 text-center text-blue-900">Clients</h2>

      <button
        className="bg-blue-700 text-white px-6 py-2 rounded-xl font-bold mb-5"
        onClick={() => navigate("/clientes/nuevo")}
      >
        New Client
      </button>

      <div className="bg-white p-2 md:p-4 rounded-xl shadow-lg">
        <h3 className="text-2xl font-bold mb-3 text-blue-900 text-center">Client List</h3>
        <input
          className="border rounded p-2 mb-4 w-full"
          placeholder="Search client"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-blue-100">
                <th className="p-2">ID</th>
                <th className="p-2">Full Name</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Business</th>
                <th className="p-2">Email</th>
                <th className="p-2">Address</th>
                <th className="p-2">Balance</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c) => {
                let d = { calle: "", ciudad: "", estado: "", zip: "" };
                if (typeof c.direccion === "string" && c.direccion) {
                  try { d = JSON.parse(c.direccion); } catch {}
                }
                if (typeof c.direccion === "object" && c.direccion !== null) {
                  d = c.direccion;
                }
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-blue-50 cursor-pointer"
                    onClick={() => {
                      setClienteSeleccionado({ ...c, direccion: d });
                      setMostrarStats(true);
                    }}
                  >
                    <td className="p-2 font-mono">{c.id.slice(0, 8)}…</td>
                    <td className="p-2">{c.nombre}</td>
                    <td className="p-2">{c.telefono}</td>
                    <td className="p-2">{c.negocio}</td>
                    <td className="p-2">{c.email}</td>
                    <td className="p-2">
                      {[d.calle, d.ciudad, d.estado, d.zip].filter(Boolean).join(", ")}
                    </td>
                    <td className="p-2 text-right">
                      {typeof c.balance === "number" &&
                        <span className={c.balance > 0 ? "text-red-600 font-bold" : "text-green-700 font-bold"}>
                          ${c.balance.toFixed(2)}
                        </span>
                      }
                    </td>
                    <td className="p-2 flex flex-col gap-2 md:flex-row">
                      <button
                        className="bg-green-600 text-white px-3 py-1 rounded text-xs w-full md:w-auto"
                        onClick={e => { e.stopPropagation(); setClienteSeleccionado({ ...c, direccion: d }); setMostrarAbono(true); }}
                      >
                        Register Payment
                      </button>
                    </td>
                  </tr>
                );
              })}
              {clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400 py-4">
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Estadística y Detalle */}
      {mostrarStats && clienteSeleccionado && (
        <ClienteStatsModal
          open={mostrarStats}
          cliente={clienteSeleccionado}
          resumen={resumen}
          mesSeleccionado={mesSeleccionado}
          setMesSeleccionado={setMesSeleccionado}
          onClose={() => setMostrarStats(false)}
          onEdit={() => { setMostrarStats(false); handleEditCliente(); }}
          onDelete={handleEliminar}
          generatePDF={generatePDF}
        />
      )}

      {/* Modal edición */}
      {mostrarEdicion && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2">
          <form
            onSubmit={handleGuardar}
            className="bg-white p-6 rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-xl font-bold mb-4 text-blue-800">{clienteSeleccionado ? "Edit Client" : "New Client"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold block mb-1">Full Name *</label>
                <input name="nombre" className="border rounded-lg p-2 w-full" value={form.nombre} onChange={handleChange} required />
              </div>
              <div>
                <label className="font-bold block mb-1">Phone</label>
                <input name="telefono" className="border rounded-lg p-2 w-full" value={form.telefono} onChange={handleChange} />
              </div>
              <div>
                <label className="font-bold block mb-1">Email</label>
                <input name="email" className="border rounded-lg p-2 w-full" value={form.email} onChange={handleChange} />
              </div>
              <div>
                <label className="font-bold block mb-1">Business</label>
                <input name="negocio" className="border rounded-lg p-2 w-full" value={form.negocio} onChange={handleChange} />
              </div>
              <div>
                <label className="font-bold block mb-1">ZIP Code</label>
                <input name="zip" className="border rounded-lg p-2 w-full" value={form.direccion.zip} onChange={handleChange} maxLength={5} />
              </div>
              <div>
                <label className="font-bold block mb-1">Street</label>
                <input name="calle" className="border rounded-lg p-2 w-full" value={form.direccion.calle} onChange={handleChange} />
              </div>
              <div>
                <label className="font-bold block mb-1">City</label>
                <input name="ciudad" className="border rounded-lg p-2 w-full" value={form.direccion.ciudad} onChange={handleChange} />
              </div>
              <div>
                <label className="font-bold block mb-1">State</label>
                <input
                  name="estado"
                  className="border rounded-lg p-2 w-full"
                  placeholder="Eg: MA"
                  value={estadoInput}
                  onChange={handleChange}
                  list="estados-lista"
                  autoComplete="off"
                  maxLength={2}
                  style={{ textTransform: "uppercase" }}
                />
                <datalist id="estados-lista">
                  {estadoOpciones.map(e => (
                    <option value={e} key={e}>{e}</option>
                  ))}
                </datalist>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="submit" className="bg-blue-700 text-white font-bold px-6 py-2 rounded-xl transition">
                Save Client
              </button>
              <button
                type="button"
                className="bg-gray-400 text-white font-bold px-6 py-2 rounded-xl transition"
                onClick={() => { setMostrarEdicion(false); navigate("/clientes"); }}
              >
                Cancel
              </button>
            </div>
            {mensaje && (
              <div className="col-span-2 text-center mt-2 text-blue-700">{mensaje}</div>
            )}
          </form>
        </div>
      )}

      {/* Modal Abono */}
      {mostrarAbono && clienteSeleccionado && (
        <ModalAbonar
          cliente={clienteSeleccionado}
          resumen={resumen}
          onClose={() => setMostrarAbono(false)}
          refresh={cargarClientes}
        />
      )}
    </div>
  );
}

// ---------- COMPONENTE: MODAL DE ESTADÍSTICAS ----------
function ClienteStatsModal({ open, cliente, resumen, mesSeleccionado, setMesSeleccionado, onClose, onEdit, onDelete, generatePDF }) {
  if (!open || !cliente) return null;

  // Agrupar ventas por mes
  const comprasPorMes = {};
  let lifetimeTotal = 0;
  (resumen.ventas || []).forEach(v => {
    if (!v.fecha || !v.total_venta) return;
    const mes = v.fecha.slice(0, 7); // yyyy-mm
    comprasPorMes[mes] = (comprasPorMes[mes] || 0) + Number(v.total_venta || 0);
    lifetimeTotal += Number(v.total_venta || 0);
  });

  // Últimos 12 meses para gráfico
  const mesesGrafico = [];
  const hoy = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mesesGrafico.unshift(label);
  }
  const dataChart = mesesGrafico.map(mes => ({
    mes,
    compras: comprasPorMes[mes] || 0
  }));

  // Opciones para selector mes
  const mesesUnicos = Object.keys(comprasPorMes).sort().reverse();

  // Filtrar ventas por mes seleccionado
  const ventasFiltradas = mesSeleccionado
    ? resumen.ventas.filter(v => v.fecha?.startsWith(mesSeleccionado))
    : resumen.ventas;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-2">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
        <button
          className="absolute right-4 top-3 text-2xl text-gray-400 hover:text-gray-800"
          onClick={onClose}
        >×</button>
        <div className="font-bold text-lg text-blue-800 mb-1">{cliente.nombre}</div>
        <div className="mb-1 text-sm">
          <div><b>Email:</b> {cliente.email}</div>
          <div><b>Phone:</b> {cliente.telefono}</div>
          <div><b>Business:</b> {cliente.negocio}</div>
          <div><b>Address:</b> {[cliente?.direccion?.calle, cliente?.direccion?.ciudad, cliente?.direccion?.estado, cliente?.direccion?.zip].filter(Boolean).join(", ")}</div>
        </div>

        {/* Botón para generar PDF */}
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded mb-4"
          onClick={generatePDF}
        >
          Download Sales Report (PDF)
        </button>

        {/* Selector mes */}
        <div className="mb-3">
          <label className="font-bold">Filter sales by month:</label>
          <select
            className="border rounded p-2 w-full"
            value={mesSeleccionado || ""}
            onChange={e => setMesSeleccionado(e.target.value || null)}
          >
            <option value="">All months</option>
            {mesesUnicos.map(mes => (
              <option key={mes} value={mes}>{mes}</option>
            ))}
          </select>
        </div>

        <div className="font-bold mb-2">Purchases by Month (last 12 months):</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataChart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" fontSize={10} angle={-45} textAnchor="end" height={40} />
            <YAxis fontSize={12} />
            <Tooltip formatter={v => `$${v.toFixed(2)}`} />
            <Bar dataKey="compras" fill="#1976D2" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-3 mb-1">
          <b>Lifetime Total: <span className="text-green-700">${lifetimeTotal.toFixed(2)}</span></b>
        </div>

        <div className="mt-5 mb-3">
          <h4 className="font-bold mb-2 text-blue-900">Sales / Invoices {mesSeleccionado ? `for ${mesSeleccionado}` : "(all)"}</h4>
          {ventasFiltradas.length === 0 ? (
            <div className="text-gray-500">No sales or invoices found.</div>
          ) : (
            <table className="min-w-full text-sm border border-gray-300 rounded">
              <thead>
                <tr className="bg-blue-100">
                  <th className="border px-2 py-1">ID</th>
                  <th className="border px-2 py-1">Date</th>
                  <th className="border px-2 py-1">Total</th>
                  <th className="border px-2 py-1">Paid</th>
                  <th className="border px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {ventasFiltradas.map((v) => (
                  <tr key={v.id} className="border-b cursor-default hover:bg-blue-50">
                    <td className="border px-2 py-1 font-mono">{v.id.slice(0, 8)}…</td>
                    <td className="border px-2 py-1">{v.fecha?.slice(0, 10)}</td>
                    <td className="border px-2 py-1">${(v.total_venta || 0).toFixed(2)}</td>
                    <td className="border px-2 py-1">${(v.total_pagado || 0).toFixed(2)}</td>
                    <td className="border px-2 py-1 italic">{v.estado_pago || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex gap-3 mt-3">
          <button className="bg-yellow-500 text-white font-bold px-4 py-1 rounded" onClick={onEdit}>Edit</button>
          <button className="bg-red-700 text-white font-bold px-4 py-1 rounded" onClick={() => onDelete(cliente)}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ---------- COMPONENTE: MODAL DE ABONO ----------
function ModalAbonar({ cliente, resumen, onClose, refresh }) {
  const { van } = useVan();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Cash");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  // Agrupar compras por mes y lifetime
  const comprasPorMes = {};
  let totalLifetime = 0;
  (resumen.ventas || []).forEach(v => {
    if (!v.fecha || !v.total_venta) return;
    const mes = v.fecha.slice(0, 7); // yyyy-mm
    comprasPorMes[mes] = (comprasPorMes[mes] || 0) + Number(v.total_venta || 0);
    totalLifetime += Number(v.total_venta || 0);
  });

  async function guardarAbono(e) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setMensaje("");

    const balance = Number(cliente.balance) || 0;
    const montoNum = Number(monto);

    if (!van || !van.id) {
      setMensaje("You must select a VAN before adding a payment.");
      setGuardando(false);
      return;
    }

    if (!monto || isNaN(montoNum) || montoNum <= 0) {
      setMensaje("Invalid amount. Must be greater than 0.");
      setGuardando(false);
      return;
    }

    if (balance <= 0) {
      setMensaje(`This client has no pending balance. You must return $${montoNum.toFixed(2)} to the client.`);
      setGuardando(false);
      return;
    }

    if (montoNum > balance) {
      setMensaje(
        `Payment exceeds the client's pending balance by $${(montoNum - balance).toFixed(2)}. Only $${balance.toFixed(2)} will be recorded. You must return the extra to the client.`
      );
      const { error } = await supabase.from("pagos").insert([
        {
          cliente_id: cliente.id,
          monto: balance,
          metodo_pago: metodo,
          van_id: van.id,
        }
      ]);
      setGuardando(false);
      if (!error) {
        setMensaje("Payment registered up to the pending balance. Extra returned to client.");
        setTimeout(() => {
          onClose();
          if (refresh) refresh();
        }, 1000);
      } else {
        setMensaje("Error saving payment");
      }
      return;
    }

    const { error } = await supabase.from("pagos").insert([
      {
        cliente_id: cliente.id,
        monto: montoNum,
        metodo_pago: metodo,
        van_id: van.id,
      }
    ]);
    setGuardando(false);
    if (!error) {
      setMensaje("Payment registered!");
      setTimeout(() => {
        onClose();
        if (refresh) refresh();
      }, 900);
    } else {
      setMensaje("Error saving payment");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30 p-4">
      <form
        onSubmit={guardarAbono}
        className="bg-white rounded p-6 w-full max-w-lg overflow-y-auto max-h-[90vh]"
      >
        <h3 className="font-bold mb-3">Payment for {cliente.nombre}</h3>
        <div className="mb-2">
          <span className="font-bold">Current Balance:</span>{" "}
          <span className={Number(cliente.balance) > 0 ? "text-red-600 font-bold" : "text-green-700 font-bold"}>
            ${Number(cliente.balance).toFixed(2)}
          </span>
        </div>
        <input
          className="border rounded p-2 mb-2 w-full"
          placeholder="Amount"
          type="number"
          min="1"
          step="any"
          value={monto}
          onChange={e => setMonto(e.target.value)}
          required
        />
        <select
          className="border rounded p-2 mb-2 w-full"
          value={metodo}
          onChange={e => setMetodo(e.target.value)}
        >
          <option value="Cash">Cash</option>
          <option value="Card">Card</option>
          <option value="Transfer">Transfer</option>
        </select>
        <button
          type="submit"
          className="bg-blue-700 text-white px-4 py-2 rounded w-full"
          disabled={guardando}
        >{guardando ? "Saving..." : "Save payment"}</button>
        <button
          type="button"
          className="bg-gray-400 text-white px-4 py-2 rounded w-full mt-2"
          onClick={onClose}
          disabled={guardando}
        >Cancel</button>
        {mensaje && (
          <div className={`mt-2 text-sm ${mensaje.includes("Error") || mensaje.includes("invalid") ? "text-red-600" : "text-green-700"}`}>{mensaje}</div>
        )}

        {/* --- HISTORIAL DE COMPRAS POR MES Y TOTAL --- */}
        <div className="mt-5 mb-3">
          <h4 className="font-bold mb-2 text-blue-900">Customer Purchase History</h4>
          <div className="text-sm mb-2 font-bold">Monthly Purchases:</div>
          <ul className="mb-3 max-h-28 overflow-y-auto">
            {Object.keys(comprasPorMes).length === 0 && <li className="text-gray-500">No sales registered</li>}
            {Object.entries(comprasPorMes).sort((a,b) => b[0].localeCompare(a[0])).map(([mes, total]) => (
              <li key={mes} className="mb-1">
                <span className="font-mono">{mes}</span>: <span className="font-bold">${total.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="font-bold">Lifetime Total: <span className="text-green-700">${totalLifetime.toFixed(2)}</span></div>
        </div>

        {/* --- HISTORY --- */}
        <div className="mt-5">
          <h4 className="font-bold mb-2 text-blue-900">Recent History</h4>
          <div className="text-sm mb-2 font-bold">Sales with debt</div>
          <ul className="mb-3 max-h-24 overflow-y-auto">
            {resumen.ventas.length === 0 && <li className="text-gray-500">No sales registered</li>}
            {resumen.ventas.map(v => (
              <li key={v.id} className="mb-1">
                <span className="font-mono text-xs">{v.id.slice(0, 8)}</span> — <span className="font-bold">${(v.total_venta || 0).toFixed(2)}</span>
                {v.total_pagado > 0 && <> paid: <span className="font-bold text-green-800">${v.total_pagado.toFixed(2)}</span></>}
                {v.estado_pago && <> — <span className="italic">{v.estado_pago}</span></>}
                <span className="ml-2 text-gray-400">{v.fecha?.slice(0,10)}</span>
              </li>
            ))}
          </ul>
          <div className="text-sm font-bold mb-1">Previous payments</div>
          <ul className="max-h-24 overflow-y-auto">
            {resumen.pagos.length === 0 && <li className="text-gray-500">No previous payments</li>}
            {resumen.pagos.map(p => (
              <li key={p.id} className="mb-1">
                <span className="font-mono text-xs">{p.id.slice(0, 8)}</span> — <span className="font-bold">${(p.monto || 0).toFixed(2)}</span>
                <span className="ml-2">{p.metodo_pago}</span>
                <span className="ml-2 text-gray-400">{p.fecha_pago?.slice(0,10)}</span>
              </li>
            ))}
          </ul>
        </div>
      </form>
    </div>
  );
}
