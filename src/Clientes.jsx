// src/Clientes.jsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Search, Plus, Edit, Trash2, DollarSign, FileText, User, Phone, Mail,
  MapPin, Building2, Calendar, TrendingUp, Download, X, Check, ChevronsLeft,
  ChevronLeft, ChevronRight, ChevronsRight
} from "lucide-react";

/* -------------------- Utilidades -------------------- */
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

// Traer CxC desde la vista canónica
async function fetchCxc(clienteId) {
  if (!clienteId) return null;
  const { data, error } = await supabase
    .from("v_cxc_cliente_detalle")
    .select("saldo, limite_politica, credito_disponible, score_base")
    .eq("cliente_id", clienteId);

  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return {
    saldo: Number(row.saldo ?? 0),
    limite: Number(row.limite_politica ?? 0),
    disponible: Number(row.credito_disponible ?? 0),
    score: Number(row.score_base ?? 600),
  };
}

/* -------------------- COMPONENTE PRINCIPAL -------------------- */
export default function Clientes() {
  const location = useLocation();
  const navigate = useNavigate();

  // Tabla
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRows, setTotalRows] = useState(0);

  // Totales header (globales)
  const [totales, setTotales] = useState({ totalClients: 0, withDebt: 0, totalOutstanding: 0 });

  // Detalles / modales
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarStats, setMostrarStats] = useState(false);
  const [mostrarEdicion, setMostrarEdicion] = useState(false);
  const [mostrarAbono, setMostrarAbono] = useState(false);
  const [resumen, setResumen] = useState({ ventas: [], pagos: [], balance: 0, cxc: null });

  const [mensaje, setMensaje] = useState("");
  const [estadoInput, setEstadoInput] = useState("");
  const [estadoOpciones, setEstadoOpciones] = useState(estadosUSA);
  const [mesSeleccionado, setMesSeleccionado] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Mapa con CxC por cliente en página actual
  const [cxcByClient, setCxcByClient] = useState({});

  // --- Formulario ---
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    negocio: "",
    direccion: { calle: "", ciudad: "", estado: "", zip: "" },
  });

  /* -------------------- Debounce búsqueda -------------------- */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(busqueda.trim()), 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  /* -------------------- Totales globales (cards) -------------------- */
  async function cargarTotales() {
    // Total de clientes
    const { count: totalClients } = await supabase.from("clientes").select("*", { count: "exact", head: true });
    // Clientes con deuda
    const { count: withDebt } = await supabase
      .from("v_cxc_cliente_detalle")
      .select("*", { count: "exact", head: true })
      .gt("saldo", 0);
    // Suma de saldos (simple y segura)
    const { data: saldosRows } = await supabase.from("v_cxc_cliente_detalle").select("saldo");
    const totalOutstanding = (saldosRows || []).reduce((s, r) => s + Number(r.saldo || 0), 0);

    setTotales({
      totalClients: totalClients || 0,
      withDebt: withDebt || 0,
      totalOutstanding,
    });
  }

  /* -------------------- Cargar página -------------------- */
  const fetchPage = async (opts = {}) => {
    const { p = page, ps = pageSize, q = debounced } = opts;
    setIsLoading(true);
    setMensaje("");

    const from = (p - 1) * ps;
    const to = from + ps - 1;

    // Filtro server-side (nombre/email/negocio/telefono)
    let query = supabase
      .from("clientes_balance")
      .select("*", { count: "exact" })
      .range(from, to);

    if (q) {
      const like = `%${q}%`;
      query = query.or(
        [
          `nombre.ilike.${like}`,
          `email.ilike.${like}`,
          `negocio.ilike.${like}`,
          `telefono.ilike.${like}`,
        ].join(",")
      );
    }

    const { data, error, count } = await query;

    if (error) {
      setMensaje("Error loading clients");
      setIsLoading(false);
      return;
    }

    setClientes(data || []);
    setTotalRows(count || 0);

    // CxC para la página actual
    const entries = await Promise.allSettled(
      (data || []).map(async (c) => {
        const info = await fetchCxc(c.id);
        return [c.id, info];
      })
    );

    const map = {};
    for (const r of entries) {
      if (r.status === "fulfilled") {
        const [id, info] = r.value;
        if (info) map[id] = info;
      }
    }
    setCxcByClient(map);
    setIsLoading(false);
  };

  // Primera carga y cada que cambia pageSize / debounced / page
  useEffect(() => {
    fetchPage({ p: 1, ps: pageSize, q: debounced });
    setPage(1);
  }, [debounced, pageSize]);

  useEffect(() => {
    fetchPage({ p: page, ps: pageSize, q: debounced });
  }, [page]);

  // Totales globales (una vez y tras pagos)
  useEffect(() => { cargarTotales(); }, []);

  // Abrir modal de nuevo cliente también por ruta
  useEffect(() => {
    if (location.pathname.endsWith("/clientes/nuevo")) {
      abrirNuevoCliente(); // abre modal inmediatamente
    } else {
      setMostrarEdicion(false);
    }
    // eslint-disable-next-line
  }, [location.pathname]);

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
    setIsLoading(true);
    if (!form.nombre) {
      setMensaje("Full name is required");
      setIsLoading(false);
      return;
    }
    let direccionFinal = form.direccion || { calle: "", ciudad: "", estado: "", zip: "" };

    if (!clienteSeleccionado) {
      const { error } = await supabase.from("clientes").insert([{ ...form, direccion: direccionFinal }]);
      if (error) setMensaje("Error saving: " + error.message);
      else {
        setMensaje("Client saved successfully");
        setMostrarEdicion(false);
        navigate("/clientes");        // vuelve a la ruta base
        await fetchPage({ p: 1, ps: pageSize, q: debounced });
        await cargarTotales();
      }
    } else {
      const { error } = await supabase.from("clientes")
        .update({ ...form, direccion: direccionFinal })
        .eq("id", clienteSeleccionado.id);
      if (error) setMensaje("Error editing: " + error.message);
      else {
        setMensaje("Changes saved successfully");
        setMostrarEdicion(false);
        navigate("/clientes");
        await fetchPage({ p: page, ps: pageSize, q: debounced });
      }
    }
    setIsLoading(false);
  }

  async function handleEliminar(cliente) {
    if (!cliente || !window.confirm("Delete this client?")) return;
    setIsLoading(true);
    const { error } = await supabase.from("clientes").delete().eq("id", cliente.id);
    if (error) setMensaje("Error deleting: " + error.message);
    else {
      setMensaje("Client deleted");
      setMostrarStats(false);
      setClienteSeleccionado(null);
      // recarga manteniendo página si quedan filas
      const lastPage = Math.max(1, Math.ceil((totalRows - 1) / pageSize));
      const newPage = Math.min(page, lastPage);
      setPage(newPage);
      await fetchPage({ p: newPage, ps: pageSize, q: debounced });
      await cargarTotales();
    }
    setIsLoading(false);
  }

  // Cargar ventas/pagos y CxC del cliente cuando abres stats/edición/abono
  useEffect(() => {
    async function cargarResumen() {
      if (!clienteSeleccionado) {
        setResumen({ ventas: [], pagos: [], balance: 0, cxc: null });
        return;
      }
      const [ventasRes, pagosRes, cxcInfo] = await Promise.all([
        supabase
          .from("ventas")
          .select("id, fecha, total_venta, total_pagado, estado_pago")
          .eq("cliente_id", clienteSeleccionado.id),
        supabase
          .from("pagos")
          .select("id, fecha_pago, monto, metodo_pago")
          .eq("cliente_id", clienteSeleccionado.id),
        fetchCxc(clienteSeleccionado.id),
      ]);

      const ventas = ventasRes.data || [];
      const pagos = pagosRes.data || [];
      const balanceCxC = cxcInfo ? cxcInfo.saldo : 0;

      setResumen({ ventas, pagos, balance: balanceCxC, cxc: cxcInfo });
      setMesSeleccionado(null);
    }
    if (clienteSeleccionado && (mostrarStats || mostrarEdicion || mostrarAbono)) cargarResumen();
  }, [clienteSeleccionado, mostrarStats, mostrarEdicion, mostrarAbono]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(totalRows / pageSize)), [totalRows, pageSize]);

  // Totales de la página actual para mostrar en cada fila (saldo real)
  const totalBalancePage = clientes.reduce((sum, c) => {
    const cx = cxcByClient[c.id];
    const saldo = cx ? cx.saldo : (c.balance || 0);
    return sum + (saldo || 0);
  }, 0);

  /* -------------------- PDF helper (igual) -------------------- */
  const comprasPorMes = useMemo(() => {
    const m = {};
    (resumen.ventas || []).forEach(v => {
      if (!v.fecha || !v.total_venta) return;
      const mes = v.fecha.slice(0, 7);
      m[mes] = (m[mes] || 0) + Number(v.total_venta || 0);
    });
    return m;
  }, [resumen.ventas]);

  const lifetimeTotal = Object.values(comprasPorMes).reduce((a, b) => a + b, 0);

  const dataChart = useMemo(() => {
    const meses = [];
    const hoy = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      meses.unshift(label);
    }
    return meses.map(mes => ({
      mes: mes.slice(5),
      fullMes: mes,
      compras: comprasPorMes[mes] || 0
    }));
  }, [comprasPorMes]);

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
    const dir = clienteSeleccionado.direccion || {};
    const dirTxt = [dir.calle, dir.ciudad, dir.estado, dir.zip].filter(Boolean).join(", ");
    doc.text(`Address: ${dirTxt}`, 14, 67);
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

  /* -------------------- UI -------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Client Management
              </h1>
              <p className="text-gray-600 mt-2">Manage your clients and track their payments</p>
            </div>
            <button
              onClick={() => { abrirNuevoCliente(); navigate("/clientes/nuevo"); }}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Plus size={20} />
              New Client
            </button>
          </div>

          {/* Stats Cards (globales) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Total Clients</p>
                  <p className="text-3xl font-bold text-gray-800">{totales.totalClients}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <User className="text-blue-600" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Clients with Debt</p>
                  <p className="text-3xl font-bold text-orange-600">{totales.withDebt}</p>
                </div>
                <div className="bg-orange-100 p-3 rounded-full">
                  <TrendingUp className="text-orange-600" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Total Outstanding</p>
                  <p className="text-3xl font-bold text-red-600">
                    ${totales.totalOutstanding.toFixed(2)}
                  </p>
                </div>
                <div className="bg-red-100 p-3 rounded-full">
                  <DollarSign className="text-red-600" size={24} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Search */}
          <div className="p-6 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm"
                placeholder="Search clients by name, phone, email or business..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )}

          {/* Table */}
          {!isLoading && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client Info</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Address</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Balance</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {clientes.map((c) => {
                      let d = { calle: "", ciudad: "", estado: "", zip: "" };
                      if (typeof c.direccion === "string" && c.direccion) {
                        try { d = JSON.parse(c.direccion); } catch {}
                      }
                      if (typeof c.direccion === "object" && c.direccion !== null) {
                        d = c.direccion;
                      }
                      const cxc = cxcByClient[c.id];
                      const saldo = typeof cxc?.saldo === "number" ? cxc.saldo : (c.balance || 0);

                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-blue-50 cursor-pointer transition-colors duration-150"
                          onClick={() => {
                            setClienteSeleccionado({ ...c, direccion: d });
                            setMostrarStats(true);
                          }}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="bg-blue-100 rounded-full p-2 mr-3">
                                <User size={16} className="text-blue-600" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900">{c.nombre}</div>
                                {c.negocio && (
                                  <div className="text-sm text-gray-500 flex items-center gap-1">
                                    <Building2 size={12} />
                                    {c.negocio}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              {c.telefono && (
                                <div className="text-sm text-gray-900 flex items-center gap-2">
                                  <Phone size={12} className="text-gray-400" />
                                  {c.telefono}
                                </div>
                              )}
                              {c.email && (
                                <div className="text-sm text-gray-500 flex items-center gap-2">
                                  <Mail size={12} className="text-gray-400" />
                                  {c.email}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900 flex items-start gap-2">
                              <MapPin size={12} className="text-gray-400 mt-0.5 flex-shrink-0" />
                              <div>
                                {[d.calle, d.ciudad, d.estado, d.zip].filter(Boolean).join(", ") || "No address"}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                                saldo > 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                              }`}
                            >
                              ${Number(saldo).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors duration-150"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const info = await fetchCxc(c.id);
                                setClienteSeleccionado({ ...c, direccion: d });
                                setResumen((r) => ({ ...r, balance: info ? info.saldo : (c.balance || 0), cxc: info }));
                                setMostrarAbono(true);
                              }}
                            >
                              <DollarSign size={14} />
                              Payment
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {clientes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="bg-gray-100 rounded-full p-3">
                              <Search className="text-gray-400" size={24} />
                            </div>
                            <p className="text-gray-500 font-medium">No clients found</p>
                            <p className="text-gray-400 text-sm">Try adjusting your search criteria</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer: paginación */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                <div className="text-sm text-gray-600">
                  Showing <span className="font-semibold">{clientes.length}</span> of{" "}
                  <span className="font-semibold">{totalRows}</span> • Page{" "}
                  <span className="font-semibold">{page}</span> / {pageCount}
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600">Page size</label>
                  <select
                    className="px-3 py-2 border rounded-lg"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>

                  <div className="flex items-center gap-1">
                    <button
                      className="p-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
                      disabled={page <= 1}
                      onClick={() => setPage(1)}
                    >
                      <ChevronsLeft size={18} />
                    </button>
                    <button
                      className="p-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      className="p-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
                      disabled={page >= pageCount}
                      onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button
                      className="p-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
                      disabled={page >= pageCount}
                      onClick={() => setPage(pageCount)}
                    >
                      <ChevronsRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Mensajes */}
        {mensaje && (
          <div
            className={`fixed top-4 right-4 px-6 py-4 rounded-xl shadow-lg z-50 transition-all duration-300 ${
              mensaje.includes("Error") || mensaje.includes("invalid")
                ? "bg-red-500 text-white"
                : "bg-green-500 text-white"
            }`}
          >
            <div className="flex items-center gap-2">
              {mensaje.includes("Error") ? <X size={20} /> : <Check size={20} />}
              {mensaje}
            </div>
          </div>
        )}
      </div>

      {/* Modal Stats */}
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

      {/* Modal edición (abre también al navegar a /clientes/nuevo) */}
      {mostrarEdicion && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleGuardar}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          >
            <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <h3 className="text-2xl font-bold">
                {clienteSeleccionado ? "Edit Client" : "New Client"}
              </h3>
              <p className="text-blue-100 mt-1">
                {clienteSeleccionado ? "Update client information" : "Add a new client to your system"}
              </p>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 font-semibold text-gray-700 mb-2">
                    <User size={16} />
                    Full Name *
                  </label>
                  <input
                    name="nombre"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    value={form.nombre}
                    onChange={handleChange}
                    required
                    placeholder="Enter full name"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 font-semibold text-gray-700 mb-2">
                    <Phone size={16} />
                    Phone
                  </label>
                  <input
                    name="telefono"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    value={form.telefono}
                    onChange={handleChange}
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 font-semibold text-gray-700 mb-2">
                    <Mail size={16} />
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="email@example.com"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 font-semibold text-gray-700 mb-2">
                    <Building2 size={16} />
                    Business
                  </label>
                  <input
                    name="negocio"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    value={form.negocio}
                    onChange={handleChange}
                    placeholder="Business name"
                  />
                </div>

                <div className="md:col-span-2">
                  <h4 className="flex items-center gap-2 font-semibold text-gray-700 mb-4">
                    <MapPin size={16} />
                    Address Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="font-medium text-gray-600 mb-1 block">ZIP Code</label>
                      <input
                        name="zip"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        value={form.direccion.zip}
                        onChange={handleChange}
                        maxLength={5}
                        placeholder="02118"
                      />
                    </div>

                    <div>
                      <label className="font-medium text-gray-600 mb-1 block">State</label>
                      <input
                        name="estado"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        placeholder="MA"
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

                    <div>
                      <label className="font-medium text-gray-600 mb-1 block">City</label>
                      <input
                        name="ciudad"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        value={form.direccion.ciudad}
                        onChange={handleChange}
                        placeholder="Boston"
                      />
                    </div>

                    <div>
                      <label className="font-medium text-gray-600 mb-1 block">Street</label>
                      <input
                        name="calle"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        value={form.direccion.calle}
                        onChange={handleChange}
                        placeholder="123 Main St"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 flex gap-3">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Save Client
                  </>
                )}
              </button>
              <button
                type="button"
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
                onClick={() => { setMostrarEdicion(false); navigate("/clientes"); }}
                disabled={isLoading}
              >
                <X size={16} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Abono */}
      {mostrarAbono && clienteSeleccionado && (
        <ModalAbonar
          cliente={clienteSeleccionado}
          resumen={resumen}
          onClose={() => setMostrarAbono(false)}
          refresh={async () => {
            await fetchPage({ p: page, ps: pageSize, q: debounced });
            await cargarTotales();
          }}
          setResumen={setResumen}
        />
      )}
    </div>
  );
}

/* -------------------- MODAL: ESTADÍSTICAS -------------------- */
function ClienteStatsModal({
  open, cliente, resumen, mesSeleccionado, setMesSeleccionado, onClose, onEdit, onDelete, generatePDF
}) {
  if (!open || !cliente) return null;

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
    mes: mes.slice(5),
    fullMes: mes,
    compras: comprasPorMes[mes] || 0
  }));

  const mesesUnicos = Object.keys(comprasPorMes).sort().reverse();
  const ventasFiltradas = mesSeleccionado
    ? (resumen.ventas || []).filter(v => v.fecha?.startsWith(mesSeleccionado))
    : (resumen.ventas || []);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white relative">
          <button
            className="absolute right-4 top-4 text-white/80 hover:text-white transition-colors p-1"
            onClick={onClose}
          >
            <X size={24} />
          </button>

          <div className="flex items-start gap-4">
            <div className="bg-white/20 rounded-full p-3">
              <User size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-bold">{cliente.nombre}</h3>
              <div className="mt-2 space-y-1 text-blue-100">
                {cliente.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={14} />
                    {cliente.email}
                  </div>
                )}
                {cliente.telefono && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} />
                    {cliente.telefono}
                  </div>
                )}
                {cliente.negocio && (
                  <div className="flex items-center gap-2">
                    <Building2 size={14} />
                    {cliente.negocio}
                  </div>
                )}
                {cliente.direccion && (
                  <div className="flex items-center gap-2">
                    <MapPin size={14} />
                    {[cliente.direccion.calle, cliente.direccion.ciudad, cliente.direccion.estado, cliente.direccion.zip].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-600 text-sm font-medium">Lifetime Sales</p>
                  <p className="text-2xl font-bold text-green-700">${lifetimeTotal.toFixed(2)}</p>
                </div>
                <TrendingUp className="text-green-600" size={20} />
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600 text-sm font-medium">Total Orders</p>
                  <p className="text-2xl font-bold text-blue-700">{(resumen.ventas || []).length}</p>
                </div>
                <FileText className="text-blue-600" size={20} />
              </div>
            </div>

            <div className={`bg-gradient-to-br ${resumen.balance > 0 ? 'from-red-50 to-rose-50 border-red-200' : 'from-green-50 to-emerald-50 border-green-200'} border rounded-xl p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`${resumen.balance > 0 ? 'text-red-600' : 'text-green-600'} text-sm font-medium`}>Current Balance</p>
                  <p className={`text-2xl font-bold ${resumen.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>${Number(resumen.balance).toFixed(2)}</p>
                </div>
                <DollarSign className={`${resumen.balance > 0 ? 'text-red-600' : 'text-green-600'}`} size={20} />
              </div>
            </div>
          </div>

          {/* Filtro por mes */}
          <div className="mb-6">
            <label className="flex items-center gap-2 font-semibold text-gray-700 mb-2">
              <Calendar size={16} />
              Filter by Month
            </label>
            <select
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
              value={mesSeleccionado || ""}
              onChange={e => setMesSeleccionado(e.target.value || null)}
            >
              <option value="">All months</option>
              {mesesUnicos.map(mes => (
                <option key={mes} value={mes}>{mes}</option>
              ))}
            </select>
          </div>

          {/* Chart */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h4 className="font-bold mb-4 text-gray-800 flex items-center gap-2">
              <BarChart size={20} />
              Sales Trend (Last 12 Months)
            </h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dataChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" fontSize={12} stroke="#6b7280" tickLine={false} />
                <YAxis fontSize={12} stroke="#6b7280" tickLine={false} />
                <Tooltip
                  formatter={v => [`${Number(v).toFixed(2)}`, "Sales"]}
                  labelStyle={{ color: '#374151' }}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar dataKey="compras" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla ventas */}
          <div className="bg-gray-50 rounded-xl p-6">
            <h4 className="font-bold mb-4 text-gray-800 flex items-center gap-2">
              <FileText size={20} />
              Sales History {mesSeleccionado ? `for ${mesSeleccionado}` : "(all)"}
            </h4>
            {ventasFiltradas.length === 0 ? (
              <div className="text-center py-8">
                <div className="bg-gray-200 rounded-full p-3 w-12 h-12 mx-auto mb-3 flex items-center justify-center">
                  <FileText className="text-gray-400" size={24} />
                </div>
                <p className="text-gray-500 font-medium">No sales found</p>
                <p className="text-gray-400 text-sm">This client hasn't made any purchases yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">Order ID</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">Date</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600 text-sm">Total</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600 text-sm">Paid</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-600 text-sm">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasFiltradas.map((v) => (
                      <tr key={v.id} className="border-b border-gray-100 hover:bg-white transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                            {v.id.slice(0, 8)}…
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">{v.fecha?.slice(0, 10)}</td>
                        <td className="py-3 px-4 text-right font-semibold">${(v.total_venta || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-green-600">${(v.total_pagado || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              v.estado_pago === "Paid"
                                ? "bg-green-100 text-green-800"
                                : v.estado_pago === "Partial"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {v.estado_pago || "Pending"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- MODAL: ABONO -------------------- */
function ModalAbonar({ cliente, resumen, onClose, refresh, setResumen }) {
  const { van } = useVan();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Cash");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  // Resumen (visual sin cambios)
  const comprasPorMes = {};
  let totalLifetime = 0;
  (resumen.ventas || []).forEach(v => {
    if (!v.fecha || !v.total_venta) return;
    const mes = v.fecha.slice(0, 7);
    comprasPorMes[mes] = (comprasPorMes[mes] || 0) + Number(v.total_venta || 0);
    totalLifetime += Number(v.total_venta || 0);
  });

  const saldoActual = Number(resumen?.balance ?? cliente?.balance ?? 0);

  async function guardarAbono(e) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setMensaje("");

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
    if (saldoActual <= 0) {
      setMensaje(`This client has no pending balance. You must return ${montoNum.toFixed(2)} to the client.`);
      setGuardando(false);
      return;
    }

    // Pago real con RPC (aplica FIFO y baja el saldo)
    const { error } = await supabase.rpc("cxc_registrar_pago", {
      p_cliente_id: cliente.id,
      p_monto: Math.min(montoNum, saldoActual),
      p_metodo: metodo,
      p_van_id: van.id,
    });

    setGuardando(false);

    if (error) {
      setMensaje("Error saving payment: " + (error.message || ""));
      return;
    }

    // Refrescar saldo en modal y lista + tarjetas
    const info = await fetchCxc(cliente.id);
    if (info && setResumen) {
      setResumen((r) => ({ ...r, balance: info.saldo, cxc: info }));
    }
    if (typeof refresh === "function") await refresh();

    setMensaje("Payment registered!");
    setTimeout(() => { onClose(); }, 900);
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <DollarSign size={20} />
            Payment for {cliente.nombre}
          </h3>
          <p className="text-green-100 mt-1">Record a new payment from this client</p>
        </div>

        <form onSubmit={guardarAbono} className="p-6">
          {/* Current Balance */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-700">Current Balance:</span>
              <span className={`text-xl font-bold ${saldoActual > 0 ? "text-red-600" : "text-green-600"}`}>
                ${saldoActual.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="font-semibold text-gray-700 mb-2 block">Payment Amount</label>
              <input
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-lg"
                placeholder="0.00"
                type="number"
                min="1"
                step="any"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="font-semibold text-gray-700 mb-2 block">Payment Method</label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-white"
                value={metodo}
                onChange={e => setMetodo(e.target.value)}
              >
                <option value="Cash">💵 Cash</option>
                <option value="Card">💳 Card</option>
                <option value="Transfer">🏦 Transfer</option>
              </select>
            </div>
          </div>

          {/* Messages */}
          {mensaje && (
            <div className={`mb-4 p-4 rounded-xl ${
              mensaje.includes("Error") || mensaje.includes("invalid")
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-green-50 text-green-700 border border-green-200"
            }`}>
              <div className="flex items-center gap-2">
                {mensaje.includes("Error") ? <X size={16} /> : <Check size={16} />}
                <span className="text-sm font-medium">{mensaje}</span>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <h4 className="font-bold mb-3 text-gray-800 flex items-center gap-2">
              <TrendingUp size={16} />
              Purchase History Summary
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Monthly Purchases:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {Object.keys(comprasPorMes).length === 0 ? (
                    <p className="text-gray-500 text-sm italic">No sales registered</p>
                  ) : (
                    Object.entries(comprasPorMes).sort((a,b) => b[0].localeCompare(a[0])).map(([mes, total]) => (
                      <div key={mes} className="flex justify-between items-center py-1">
                        <span className="text-sm text-gray-600">{mes}</span>
                        <span className="font-semibold text-blue-600">${total.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Recent Payments:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {resumen.pagos.length === 0 ? (
                    <p className="text-gray-500 text-sm italic">No previous payments</p>
                  ) : (
                    resumen.pagos.map(p => (
                      <div key={p.id} className="flex justify-between items-center py-1">
                        <span className="text-sm text-gray-600">{p.fecha_pago?.slice(0,10)}</span>
                        <span className="font-semibold text-green-600">${(p.monto || 0).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="border-top border-gray-200 pt-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-700">Lifetime Total:</span>
                <span className="text-xl font-bold text-green-700">${totalLifetime.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              {guardando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Record Payment
                </>
              )}
            </button>
            <button
              type="button"
              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
              onClick={onClose}
              disabled={guardando}
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
