// src/CierreDia.jsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, startOfDay, endOfDay, isToday } from "date-fns";
import { 
  DollarSign, FileText, Download, RefreshCw, CheckCircle, AlertCircle, 
  Calculator, Calendar, TrendingUp, AlertTriangle
} from "lucide-react";

/* ========================= Constantes ========================= */
const PAYMENT_METHODS = {
  efectivo: { label: "Efectivo", color: "#4CAF50", icon: "💵" },
  tarjeta: { label: "Tarjeta", color: "#2196F3", icon: "💳" },
  transferencia: { label: "Transferencia", color: "#9C27B0", icon: "🏦" },
  otro: { label: "Otro", color: "#FF9800", icon: "💰" },
};

const SECRET_CODE = "#ajuste2025";

/* ========================= Funciones de ayuda ========================= */
const fmtCurrency = (n) => {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getPaymentMethodColor = (method) => {
  return PAYMENT_METHODS[method]?.color || "#9E9E9E";
};

const getPaymentMethodLabel = (method) => {
  return PAYMENT_METHODS[method]?.label || method;
};

const getPaymentMethodIcon = (method) => {
  return PAYMENT_METHODS[method]?.icon || "💰";
};

/* ========================= Componente Principal ========================= */
export default function CierreDia() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const navigate = useNavigate();
  
  // Estados principales
  const [fecha, setFecha] = useState(new Date());
  const [ventasDia, setVentasDia] = useState([]);
  const [ventasCargando, setVentasCargando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [diaCerrado, setDiaCerrado] = useState(false);
  const [discrepancia, setDiscrepancia] = useState(0);
  const [cajaReal, setCajaReal] = useState(0);
  const [observaciones, setObservaciones] = useState("");
  
  // Totales calculados
  const totales = useMemo(() => {
    if (!ventasDia.length) return {
      totalVentas: 0,
      totalEfectivo: 0,
      totalTarjeta: 0,
      totalTransferencia: 0,
      totalOtros: 0,
      totalCaja: 0,
      diferencia: 0
    };
    
    let totalVentas = 0;
    let totalEfectivo = 0;
    let totalTarjeta = 0;
    let totalTransferencia = 0;
    let totalOtros = 0;
    
    ventasDia.forEach(venta => {
      totalVentas += Number(venta.total_venta || 0);
      
      if (venta.pago?.map) {
        totalEfectivo += Number(venta.pago.map.efectivo || 0);
        totalTarjeta += Number(venta.pago.map.tarjeta || 0);
        totalTransferencia += Number(venta.pago.map.transferencia || 0);
        totalOtros += Number(venta.pago.map.otro || 0);
      }
    });
    
    const totalCaja = totalEfectivo + totalTarjeta + totalTransferencia + totalOtros;
    const diferencia = Math.abs(totalCaja - cajaReal);
    
    return {
      totalVentas,
      totalEfectivo,
      totalTarjeta,
      totalTransferencia,
      totalOtros,
      totalCaja,
      diferencia
    };
  }, [ventasDia, cajaReal]);
  
  // Gráficos de datos
  const datosMetodosPago = useMemo(() => {
    return [
      { name: "Efectivo", value: totales.totalEfectivo, color: getPaymentMethodColor("efectivo") },
      { name: "Tarjeta", value: totales.totalTarjeta, color: getPaymentMethodColor("tarjeta") },
      { name: "Transferencia", value: totales.totalTransferencia, color: getPaymentMethodColor("transferencia") },
      { name: "Otros", value: totales.totalOtros, color: getPaymentMethodColor("otro") },
    ].filter(item => item.value > 0);
  }, [totales]);
  
  const datosVentasPorHora = useMemo(() => {
    const horas = {};
    
    ventasDia.forEach(venta => {
      if (!venta.created_at) return;
      const hora = new Date(venta.created_at).getHours();
      horas[hora] = (horas[hora] || 0) + Number(venta.total_venta || 0);
    });
    
    return Array.from({ length: 24 }, (_, i) => ({
      hora: `${i}:00`,
      ventas: horas[i] || 0
    }));
  }, [ventasDia]);

  /* ========================= Cargar datos ========================= */
  useEffect(() => {
    cargarVentasDia();
    verificarDiaCerrado();
  }, [fecha, van?.id]);
  
  const cargarVentasDia = async () => {
    if (!van?.id) return;
    
    setVentasCargando(true);
    try {
      const inicioDia = startOfDay(fecha);
      const finDia = endOfDay(fecha);
      
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id,
          created_at,
          total_venta,
          total_pagado,
          estado_pago,
          cliente_id,
          clientes:cliente_id (
            id,
            nombre,
            telefono,
            email
          ),
          pago,
          van_id,
          usuario_id
        `)
        .eq('van_id', van.id)
        .gte('created_at', inicioDia.toISOString())
        .lte('created_at', finDia.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setVentasDia(data || []);
    } catch (err) {
      setMensaje("Error al cargar las ventas del día: " + err.message);
      setTipoMensaje("error");
    } finally {
      setVentasCargando(false);
    }
  };
  
  const verificarDiaCerrado = async () => {
    if (!van?.id || !isToday(fecha)) return;
    
    try {
      const { data, error } = await supabase
        .from('cierres_dia')
        .select('cerrado')
        .eq('van_id', van.id)
        .eq('fecha', format(fecha, 'yyyy-MM-dd'))
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      setDiaCerrado(data?.cerrado || false);
    } catch (err) {
      console.error("Error verificando día cerrado:", err);
    }
  };

  /* ========================= Funciones de cierre ========================= */
  const handleCierreDia = async () => {
    if (!van?.id || !usuario?.id) {
      setMensaje("Debe seleccionar una VAN y estar logueado");
      setTipoMensaje("error");
      return;
    }
    
    if (diaCerrado) {
      setMensaje("El día ya está cerrado");
      setTipoMensaje("warning");
      return;
    }
    
    if (totales.diferencia > 0 && !observaciones.trim()) {
      setMensaje("Debe indicar una observación para la discrepancia");
      setTipoMensaje("warning");
      return;
    }
    
    setCargando(true);
    setMensaje("");
    
    try {
      // Registrar el cierre
      const { error } = await supabase
        .from('cierres_dia')
        .upsert([{
          van_id: van.id,
          fecha: format(fecha, 'yyyy-MM-dd'),
          usuario_id: usuario.id,
          total_ventas: totales.totalVentas,
          total_efectivo: totales.totalEfectivo,
          total_tarjeta: totales.totalTarjeta,
          total_transferencia: totales.totalTransferencia,
          total_otros: totales.totalOtros,
          caja_real: cajaReal,
          discrepancia: totales.diferencia,
          observaciones: observaciones,
          cerrado: true,
          created_at: new Date().toISOString()
        }]);
      
      if (error) throw error;
      
      setDiaCerrado(true);
      setMensaje("Cierre de día registrado exitosamente");
      setTipoMensaje("exito");
      
      // Opcional: Notificar al administrador
      await notificarCierreDia();
      
    } catch (err) {
      setMensaje("Error al registrar el cierre: " + err.message);
      setTipoMensaje("error");
    } finally {
      setCargando(false);
    }
  };
  
  const notificarCierreDia = async () => {
    try {
      // Aquí podrías enviar una notificación al administrador
      // Por ejemplo: un email, notificación push, etc.
      console.log("Cierre de día notificado al administrador");
    } catch (err) {
      console.error("Error al notificar cierre:", err);
    }
  };
  
  const handleReabrirDia = async () => {
    if (!van?.id || !usuario?.id) return;
    
    if (!confirm("¿Está seguro de reabrir este día? Esto permitirá modificar las ventas registradas.")) {
      return;
    }
    
    setCargando(true);
    setMensaje("");
    
    try {
      const { error } = await supabase
        .from('cierres_dia')
        .update({ 
          cerrado: false,
          reabierto_por: usuario.id,
          reabierto_el: new Date().toISOString()
        })
        .eq('van_id', van.id)
        .eq('fecha', format(fecha, 'yyyy-MM-dd'));
      
      if (error) throw error;
      
      setDiaCerrado(false);
      setMensaje("Día reabierto exitosamente");
      setTipoMensaje("exito");
      
    } catch (err) {
      setMensaje("Error al reabrir el día: " + err.message);
      setTipoMensaje("error");
    } finally {
      setCargando(false);
    }
  };
  
  const handleGenerarPDF = () => {
    if (!ventasDia.length) {
      setMensaje("No hay ventas para generar el reporte");
      setTipoMensaje("warning");
      return;
    }
    
    try {
      const doc = new jsPDF();
      const businessName = "Tools4Care";
      const reportTitle = "Cierre de Día";
      
      // Encabezado
      doc.setFontSize(20);
      doc.text(businessName, 14, 20);
      doc.setFontSize(16);
      doc.text(reportTitle, 14, 30);
      doc.setFontSize(12);
      doc.text(`Fecha: ${format(fecha, 'dd/MM/yyyy')}`, 14, 40);
      doc.text(`VAN: ${van?.nombre || van?.alias || 'Sin nombre'}`, 14, 48);
      doc.text(`Usuario: ${usuario?.nombre || 'Sin nombre'}`, 14, 56);
      
      // Línea divisoria
      doc.setLineWidth(0.5);
      doc.line(14, 64, 196, 64);
      
      // Totales
      doc.setFontSize(14);
      doc.text("Resumen del Día", 14, 74);
      doc.setFontSize(10);
      
      const totalesData = [
        ["Concepto", "Monto"],
        ["Total Ventas", fmtCurrency(totales.totalVentas)],
        ["Efectivo", fmtCurrency(totales.totalEfectivo)],
        ["Tarjetas", fmtCurrency(totales.totalTarjeta)],
        ["Transferencias", fmtCurrency(totales.totalTransferencia)],
        ["Otros", fmtCurrency(totales.totalOtros)],
        ["Total en Caja", fmtCurrency(totales.totalCaja)],
        ["Caja Real", fmtCurrency(cajaReal)],
        ["Discrepancia", fmtCurrency(totales.diferencia)]
      ];
      
      autoTable(doc, {
        startY: 82,
        head: [totalesData[0]],
        body: totalesData.slice(1),
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [25, 118, 210] }
      });
      
      // Observaciones
      if (observaciones) {
        const finalY = doc.lastAutoTable.finalY || 100;
        doc.setFontSize(12);
        doc.text("Observaciones:", 14, finalY + 10);
        doc.setFontSize(10);
        doc.text(observaciones, 14, finalY + 18, { maxWidth: 180 });
      }
      
      // Guardar PDF
      doc.save(`CierreDia_${format(fecha, 'yyyy-MM-dd')}_${van?.nombre || 'VAN'}.pdf`);
      
      setMensaje("Reporte PDF generado exitosamente");
      setTipoMensaje("exito");
    } catch (error) {
      setMensaje("Error al generar el PDF: " + error.message);
      setTipoMensaje("error");
    }
  };

  /* ========================= Renderizado ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Cierre de Día
              </h1>
              <p className="text-gray-600 mt-1 sm:mt-2 text-xs sm:text-sm md:text-base">
                {diaCerrado ? "Día cerrado - No se permiten modificaciones" : "Realice el cierre del día cuando termine sus operaciones"}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => navigate("/")}
                className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-sm text-sm sm:text-base"
              >
                ← Volver
              </button>
              <button
                onClick={cargarVentasDia}
                disabled={ventasCargando}
                className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-sm text-sm sm:text-base"
              >
                <RefreshCw size={18} className={ventasCargando ? "animate-spin" : ""} />
                <span>Actualizar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mensajes */}
        {mensaje && (
          <div className={`mb-6 p-4 rounded-xl shadow-lg transition-all duration-300 ${
            tipoMensaje === "error" ? "bg-red-50 border border-red-200 text-red-700" :
            tipoMensaje === "warning" ? "bg-yellow-50 border border-yellow-200 text-yellow-700" :
            tipoMensaje === "exito" ? "bg-green-50 border border-green-200 text-green-700" :
            "bg-blue-50 border border-blue-200 text-blue-700"
          }`}>
            <div className="flex items-center gap-2">
              {tipoMensaje === "error" ? <AlertCircle size={20} /> :
               tipoMensaje === "warning" ? <AlertTriangle size={20} /> :
               tipoMensaje === "exito" ? <CheckCircle size={20} /> :
               <FileText size={20} />}
              {mensaje}
            </div>
          </div>
        )}

        {/* Panel de control */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Selector de fecha */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <input
                type="date"
                value={format(fecha, 'yyyy-MM-dd')}
                onChange={(e) => setFecha(new Date(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
            
            {/* Caja real */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Caja Real ({diaCerrado ? "bloqueado" : "editable"})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cajaReal}
                  onChange={(e) => setCajaReal(Number(e.target.value))}
                  disabled={diaCerrado}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            {/* Observaciones */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observaciones {totales.diferencia > 0 && "(requerido)"}
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                disabled={diaCerrado}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={2}
                placeholder="Indique motivo de discrepancia (si aplica)"
              />
            </div>
          </div>
          
          {/* Botones de acción */}
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={handleGenerarPDF}
              disabled={ventasCargando || !ventasDia.length}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={18} />
              <span>Generar Reporte PDF</span>
            </button>
            
            {!diaCerrado ? (
              <button
                onClick={handleCierreDia}
                disabled={cargando || totales.diferencia > 0 && !observaciones.trim()}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cargando ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Cerrando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    <span>Cerrar Día</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleReabrirDia}
                disabled={cargando}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cargando ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Reabriendo...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    <span>Reabrir Día</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Resumen del día */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium">Total Ventas</p>
                <p className="text-2xl font-bold text-blue-800">{fmtCurrency(totales.totalVentas)}</p>
              </div>
              <DollarSign className="text-blue-600" size={24} />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 text-sm font-medium">Total en Caja</p>
                <p className="text-2xl font-bold text-green-800">{fmtCurrency(totales.totalCaja)}</p>
              </div>
              <Calculator className="text-green-600" size={24} />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-600 text-sm font-medium">Caja Real</p>
                <p className="text-2xl font-bold text-purple-800">{fmtCurrency(cajaReal)}</p>
              </div>
              <TrendingUp className="text-purple-600" size={24} />
            </div>
          </div>
          
          <div className={`bg-gradient-to-br rounded-xl p-4 border ${
            totales.diferencia === 0 
              ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200" 
              : "bg-gradient-to-br from-red-50 to-rose-50 border-red-200"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${
                  totales.diferencia === 0 ? "text-green-600" : "text-red-600"
                }`}>
                  Discrepancia
                </p>
                <p className={`text-2xl font-bold ${
                  totales.diferencia === 0 ? "text-green-800" : "text-red-800"
                }`}>
                  {fmtCurrency(totales.diferencia)}
                </p>
              </div>
              {totales.diferencia === 0 ? (
                <CheckCircle className="text-green-600" size={24} />
              ) : (
                <AlertTriangle className="text-red-600" size={24} />
              )}
            </div>
          </div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Métodos de pago */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <DollarSign size={20} />
              Métodos de Pago
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={datosMetodosPago}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {datosMetodosPago.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => fmtCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Ventas por hora */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Calendar size={20} />
              Ventas por Hora
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosVentasPorHora}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hora" />
                  <YAxis tickFormatter={(value) => `$${value}`} />
                  <Tooltip formatter={(value) => fmtCurrency(value)} />
                  <Bar dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tabla de ventas */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FileText size={20} />
              Ventas del Día ({ventasDia.length})
            </h3>
          </div>
          
          {ventasCargando ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : ventasDia.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gray-100 rounded-full p-3 w-12 h-12 mx-auto mb-3 flex items-center justify-center">
                <FileText className="text-gray-400" size={24} />
              </div>
              <p className="text-gray-500 font-medium">No hay ventas registradas para esta fecha</p>
              <p className="text-gray-400 text-sm mt-1">Verifique la fecha o intente actualizar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pagado</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ventasDia.map((venta) => (
                    <tr key={venta.id} className="hover:bg-gray-50">
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {venta.id.slice(0, 8)}...
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(venta.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {venta.clientes?.nombre || "Cliente no identificado"}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {fmtCurrency(venta.total_venta)}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                        {fmtCurrency(venta.total_pagado)}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          venta.estado_pago === "pagado" ? "bg-green-100 text-green-800" :
                          venta.estado_pago === "parcial" ? "bg-yellow-100 text-yellow-800" :
                          "bg-red-100 text-red-800"
                        }`}>
                          {venta.estado_pago || "pendiente"}
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
  );
}