// src/CierreDia.jsx - Fixed version using only existing columns

import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";
import { useUsuario } from "./UsuarioContext";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, startOfDay, endOfDay, isToday } from "date-fns";
import {
  DollarSign, FileText, Download, RefreshCw, CheckCircle, AlertCircle,
  Calculator, Calendar, TrendingUp, AlertTriangle, X, Plus, Minus, Send, MoreHorizontal, CreditCard,
  Eye, Printer, Share2, FileBarChart, PieChart as PieChartIcon, BarChart3, TrendingUp as TrendingUpIcon
} from "lucide-react";

/* ========================= Constants ========================= */
const PAYMENT_METHODS = {
  efectivo: { label: "Cash", color: "#4CAF50", icon: "💵" },
  tarjeta: { label: "Card", color: "#2196F3", icon: "💳" },
  transferencia: { label: "Transfer", color: "#9C27B0", icon: "🏦" },
  otro: { label: "Other", color: "#FF9800", icon: "💰" },
};

// Transfer types
const TRANSFER_TYPES = [
  { value: "zelle", label: "Zelle", color: "#0066CC" },
  { value: "cashapp", label: "Cash App", color: "#00C244" },
  { value: "venmo", label: "Venmo", color: "#3D95CE" },
  { value: "applepay", label: "Apple Pay", color: "#000000" },
];

/* ========================= Report Component ========================= */
const ReportPreview = ({
  fecha,
  ventasDia,
  pagosDirectos,
  totales,
  cashReal,
  cardReal,
  transferReal,
  otherReal,
  van,
  usuario,
  onGeneratePDF,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState("summary");

  // Datos para gráficos
  const datosMetodosPago = [
    { method: "Cash", value: totales.totalEfectivo, color: PAYMENT_METHODS.efectivo.color },
    { method: "Card", value: totales.totalTarjeta, color: PAYMENT_METHODS.tarjeta.color },
    { method: "Transfer", value: totales.totalTransferencia, color: PAYMENT_METHODS.transferencia.color },
    { method: "Other", value: totales.totalOtros, color: PAYMENT_METHODS.otro.color },
  ].filter(item => item.value > 0);

  // Datos para gráfico de radar
  const radarData = [
    { subject: "Cash", A: totales.totalEfectivo, fullMark: totales.totalCaja },
    { subject: "Card", A: totales.totalTarjeta, fullMark: totales.totalCaja },
    { subject: "Transfer", A: totales.totalTransferencia, fullMark: totales.totalCaja },
    { subject: "Other", A: totales.totalOtros, fullMark: totales.totalCaja },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Day Closure Report</h2>
              <p className="text-blue-100 mt-1">Professional financial summary</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onGeneratePDF}
                className="bg-white text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
              >
                <Printer size={18} />
                <span>Generate PDF</span>
              </button>
              <button
                onClick={onClose}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
              >
                <X size={18} />
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 px-6 mt-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("summary")}
            className={`pb-2 px-1 font-medium ${activeTab === "summary" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={`pb-2 px-1 font-medium ${activeTab === "details" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("analysis")}
            className={`pb-2 px-1 font-medium ${activeTab === "analysis" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            Analysis
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow">
          {/* Summary Tab */}
          {activeTab === "summary" && (
            <div>
              {/* Business Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Business</h3>
                    <p className="text-lg font-semibold">Tools4Care</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Date</h3>
                    <p className="text-lg font-semibold">{format(new Date(fecha), 'MM/dd/yyyy')}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">VAN</h3>
                    <p className="text-lg font-semibold">{van?.nombre || van?.alias || 'No name'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Prepared by</h3>
                    <p className="text-lg font-semibold">{usuario?.nombre || 'No name'}</p>
                  </div>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-green-600 text-sm font-medium">Total Sales</p>
                      <p className="text-2xl font-bold text-green-800">{totales.totalVentas > 0 ? fmtCurrency(totales.totalVentas) : "$0.00"}</p>
                    </div>
                    <DollarSign className="text-green-600" size={24} />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-blue-600 text-sm font-medium">Total in System</p>
                      <p className="text-2xl font-bold text-blue-800">{totales.totalCaja > 0 ? fmtCurrency(totales.totalCaja) : "$0.00"}</p>
                    </div>
                    <Calculator className="text-blue-600" size={24} />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-purple-600 text-sm font-medium">Total Real</p>
                      <p className="text-2xl font-bold text-purple-800">{fmtCurrency(cashReal + cardReal + transferReal + otherReal)}</p>
                    </div>
                    <TrendingUp className="text-purple-600" size={24} />
                  </div>
                </div>

                <div className={`bg-gradient-to-br rounded-xl p-4 border ${
                  totales.diferencia === 0
                    ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200"
                    : "bg-gradient-to-br from-red-50 to-rose-50 border-red-200"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className={`text-sm font-medium ${
                        totales.diferencia === 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        Discrepancy
                      </p>
                      <p className={`text-2xl font-bold ${
                        totales.diferencia === 0 ? "text-green-800" : "text-red-800"
                      }`}>
                        {totales.diferencia > 0 ? fmtCurrency(totales.diferencia) : "$0.00"}
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

              {/* Payment Methods Chart */}
              <div className="bg-white rounded-xl shadow border border-gray-200 p-4 mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Payment Methods Distribution</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={datosMetodosPago}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ method, percent }) => `${method}: ${(percent * 100).toFixed(0)}%`}
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

              {/* Payment Methods Table */}
              <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden mb-6">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-800">Payment Methods Breakdown</h3>
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Percentage</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Real Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {datosMetodosPago.map((item) => {
                      const realAmount = item.method === "Cash" ? cashReal :
                                        item.method === "Card" ? cardReal :
                                        item.method === "Transfer" ? transferReal : otherReal;
                      const difference = Math.abs(item.value - realAmount);

                      return (
                        <tr key={item.method}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div
                                className="w-3 h-3 rounded-full mr-2"
                                style={{ backgroundColor: item.color }}
                              ></div>
                              <span className="font-medium text-gray-900">{item.method}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                            {fmtCurrency(item.value)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                                <div
                                  className="h-2 rounded-full"
                                  style={{
                                    width: `${(item.value / totales.totalCaja) * 100}%`,
                                    backgroundColor: item.color
                                  }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-600">
                                {((item.value / totales.totalCaja) * 100).toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                            {fmtCurrency(realAmount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-sm font-semibold ${
                              difference === 0 ? "text-green-600" : "text-red-600"
                            }`}>
                              {fmtCurrency(difference)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Details Tab */}
          {activeTab === "details" && (
            <div>
              {/* Sales Table */}
              {ventasDia.length > 0 && (
                <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden mb-6">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800">Sales of the Day ({ventasDia.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
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
                              {venta.clientes?.nombre || "Unidentified client"}
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
                                {venta.estado_pago || "pending"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Direct Payments Table */}
              {pagosDirectos.length > 0 && (
                <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden mb-6">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800">Direct Payments of the Day ({pagosDirectos.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {pagosDirectos.map((pago) => (
                          <tr key={pago.id} className="hover:bg-gray-50">
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {pago.id.slice(0, 8)}...
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(pago.fecha_pago).toLocaleString()}
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {pago.clientes?.nombre || "Unidentified client"}
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                pago.metodo_pago === "efectivo" ? "bg-green-100 text-green-800" :
                                pago.metodo_pago === "tarjeta" ? "bg-blue-100 text-blue-800" :
                                pago.metodo_pago === "transferencia" ? "bg-purple-100 text-purple-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                {getPaymentMethodLabel(pago.metodo_pago)}
                              </span>
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                              {fmtCurrency(pago.monto)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Totals Summary */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Totals Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="text-sm text-gray-600 mb-1">Total Sales</div>
                    <div className="text-2xl font-bold text-green-800">{totales.totalVentas > 0 ? fmtCurrency(totales.totalVentas) : "$0.00"}</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="text-sm text-gray-600 mb-1">Total in System</div>
                    <div className="text-2xl font-bold text-blue-800">{totales.totalCaja > 0 ? fmtCurrency(totales.totalCaja) : "$0.00"}</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="text-sm text-gray-600 mb-1">Total Real</div>
                    <div className="text-2xl font-bold text-purple-800">{fmtCurrency(cashReal + cardReal + transferReal + otherReal)}</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="text-sm text-gray-600 mb-1">Discrepancy</div>
                    <div className={`text-2xl font-bold ${
                      totales.diferencia === 0 ? "text-green-800" : "text-red-800"
                    }`}>
                      {totales.diferencia > 0 ? fmtCurrency(totales.diferencia) : "$0.00"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analysis Tab */}
          {activeTab === "analysis" && (
            <div>
              {/* Radar Chart */}
              <div className="bg-white rounded-xl shadow border border-gray-200 p-4 mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Payment Methods Analysis</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" />
                      <PolarRadiusAxis angle={90} domain={[0, totales.totalCaja]} />
                      <Radar
                        name="Amount"
                        dataKey="A"
                        stroke="#8884d8"
                        fill="#8884d8"
                        fillOpacity={0.6}
                      />
                      <Tooltip formatter={(value) => fmtCurrency(value)} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Insights */}
              <div className="bg-white rounded-xl shadow border border-gray-200 p-4 mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Financial Insights</h3>
                <div className="space-y-4">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <TrendingUpIcon className="h-5 w-5 text-blue-500" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-blue-700">
                          <strong>Payment Method Distribution:</strong> {datosMetodosPago.length > 0 ?
                          `${datosMetodosPago.reduce((max, item) => max.value > item.value ? max : item).method} is the dominant payment method` :
                          'No payment data available'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-green-700">
                          <strong>Financial Health:</strong> {totales.diferencia === 0 ?
                          `Your accounts are balanced with no discrepancies` :
                          `You have a discrepancy of ${fmtCurrency(totales.diferencia)} that needs attention`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-amber-700">
                          <strong>Recommendation:</strong> {totales.diferencia > 0 ?
                          `Review and reconcile the discrepancy of ${fmtCurrency(totales.diferencia)}` :
                          'Proceed with the day closure as all accounts are balanced'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Items */}
              <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-6 border border-purple-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Next Steps</h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-5 w-5 text-purple-500">
                      <CheckCircle />
                    </div>
                    <p className="ml-3 text-sm text-gray-700">Review all transactions and payment methods</p>
                  </div>
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-5 w-5 text-purple-500">
                      <CheckCircle />
                    </div>
                    <p className="ml-3 text-sm text-gray-700">Verify discrepancies and make adjustments if needed</p>
                  </div>
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-5 w-5 text-purple-500">
                      <CheckCircle />
                    </div>
                    <p className="ml-3 text-sm text-gray-700">Complete day closure when ready</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ========================= Main Component ========================= */
export default function CierreDia() {
  const { van } = useVan();
  const { usuario } = useUsuario();
  const navigate = useNavigate();

  // Main states - fecha inicializada como cadena en formato yyyy-MM-dd
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [ventasDia, setVentasDia] = useState([]);
  const [pagosDirectos, setPagosDirectos] = useState([]);
  const [ventasCargando, setVentasCargando] = useState(false);
  const [pagosCargando, setPagosCargando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [diaCerrado, setDiaCerrado] = useState(false);
  const [discrepancia, setDiscrepancia] = useState(0);
  const [observaciones, setObservaciones] = useState("");

  // Payment method input states
  const [cashInput, setCashInput] = useState("");
  const [cardInput, setCardInput] = useState("");
  const [transferInput, setTransferInput] = useState("");
  const [otherInput, setOtherInput] = useState("");

  // Payment method real values
  const [cashReal, setCashReal] = useState(0);
  const [cardReal, setCardReal] = useState(0);
  const [transferReal, setTransferReal] = useState(0);
  const [otherReal, setOtherReal] = useState(0);

  // States for breakdown modals
  const [showCashBreakdownModal, setShowCashBreakdownModal] = useState(false);
  const [showCardBreakdownModal, setShowCardBreakdownModal] = useState(false);
  const [showTransferBreakdownModal, setShowTransferBreakdownModal] = useState(false);
  const [showOtherBreakdownModal, setShowOtherBreakdownModal] = useState(false);

  // State for report preview modal
  const [showReportPreview, setShowReportPreview] = useState(false);

  const [cashCounts, setCashCounts] = useState({});
  const [cardCounts, setCardCounts] = useState({});
  const [transferCounts, setTransferCounts] = useState({});
  const [otherCounts, setOtherCounts] = useState({});

  const [cashTotal, setCashTotal] = useState(0);
  const [cardTotal, setCardTotal] = useState(0);
  const [transferTotal, setTransferTotal] = useState(0);
  const [otherTotal, setOtherTotal] = useState(0);

  // US denominations only
  const DENOMINATIONS = [
    { value: 100, label: "$100 Bill" },
    { value: 50, label: "$50 Bill" },
    { value: 20, label: "$20 Bill" },
    { value: 10, label: "$10 Bill" },
    { value: 5, label: "$5 Bill" },
    { value: 1, label: "$1 Bill" },
  ];

  /* ========================= Helper Functions ========================= */
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

  const getTransferTypeColor = (type) => {
    return TRANSFER_TYPES.find(t => t.value === type)?.color || "#9E9E9E";
  };

  const getTransferTypeLabel = (type) => {
    return TRANSFER_TYPES.find(t => t.value === type)?.label || type;
  };

  /* ========================= Data Loading ========================= */
  useEffect(() => {
    cargarVentasDia();
    cargarPagosDirectos();
    verificarDiaCerrado();
  }, [fecha, van?.id]);

  // Sync input states with real values
  useEffect(() => {
    setCashReal(cashInput === "" ? 0 : Number(cashInput));
  }, [cashInput]);

  useEffect(() => {
    setCardReal(cardInput === "" ? 0 : Number(cardInput));
  }, [cardInput]);

  useEffect(() => {
    setTransferReal(transferInput === "" ? 0 : Number(transferInput));
  }, [transferInput]);

  useEffect(() => {
    setOtherReal(otherInput === "" ? 0 : Number(otherInput));
  }, [otherInput]);

  const cargarVentasDia = async () => {
    if (!van?.id) return;
    setVentasCargando(true);
    try {
      const fechaObj = new Date(fecha);
      const inicioDia = startOfDay(fechaObj);
      const finDia = endOfDay(fechaObj);

      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id, created_at, total_venta, total_pagado, estado_pago,
          cliente_id, clientes:cliente_id (id, nombre), pago, van_id, usuario_id
        `)
        .eq('van_id', van.id)
        .gte('created_at', inicioDia.toISOString())
        .lte('created_at', finDia.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVentasDia(data || []);
    } catch (err) {
      setMensaje("Error loading sales for the day: " + err.message);
      setTipoMensaje("error");
    } finally {
      setVentasCargando(false);
    }
  };

  const cargarPagosDirectos = async () => {
    if (!van?.id) return;
    setPagosCargando(true);
    try {
      const fechaObj = new Date(fecha);
      const inicioDia = startOfDay(fechaObj);
      const finDia = endOfDay(fechaObj);

      const { data, error } = await supabase
        .from('pagos')
        .select(`
          id, fecha_pago, monto, metodo_pago,
          cliente_id, clientes:cliente_id (id, nombre), van_id, usuario_id
        `)
        .eq('van_id', van.id)
        .gte('fecha_pago', inicioDia.toISOString())
        .lte('fecha_pago', finDia.toISOString())
        .order('fecha_pago', { ascending: false });

      if (error) throw error;
      setPagosDirectos(data || []);
    } catch (err) {
      setMensaje("Error loading direct payments: " + err.message);
      setTipoMensaje("error");
    } finally {
      setPagosCargando(false);
    }
  };

  const verificarDiaCerrado = async () => {
    if (!van?.id) return;
    try {
      const { data, error } = await supabase
        .from('cierres_dia')
        .select('cerrado')
        .eq('van_id', van.id)
        .eq('fecha', fecha)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setDiaCerrado(data?.cerrado || false);
    } catch (err) {
      console.error("Error checking closed day:", err);
    }
  };

  /* ========================= Closure Functions ========================= */

  const handleCierreDia = async () => {
    if (!van?.id || !usuario?.id) {
      setMensaje("You must select a VAN and be logged in");
      setTipoMensaje("error");
      return;
    }

    if (diaCerrado) {
      setMensaje("The day is already closed");
      setTipoMensaje("warning");
      return;
    }

    if (totales.diferencia > 0 && !observaciones.trim()) {
      setMensaje("You must provide a note for the discrepancy");
      setTipoMensaje("warning");
      return;
    }

    setCargando(true);
    setMensaje("");

    try {
      // ✅ SOLUCIÓN: Incluir caja_real que es NOT NULL en la base de datos
      const totalReal = cashReal + cardReal + transferReal + otherReal;
      
      const detallesReales = `\n\n--- Real Amounts ---\nCash: ${fmtCurrency(cashReal)}\nCard: ${fmtCurrency(cardReal)}\nTransfer: ${fmtCurrency(transferReal)}\nOther: ${fmtCurrency(otherReal)}\nTotal Real: ${fmtCurrency(totalReal)}`;
      
      const observacionesCompletas = observaciones.trim() + detallesReales;
      
      const { error } = await supabase
        .from('cierres_dia')
        .upsert([{
          van_id: van.id,
          fecha: fecha,
          usuario_id: usuario.id,
          total_ventas: totales.totalVentas,
          total_efectivo: totales.totalEfectivo,
          total_tarjeta: totales.totalTarjeta,
          total_transferencia: totales.totalTransferencia,
          total_otros: totales.totalOtros,
          caja_real: totalReal, // ✅ Campo requerido (NOT NULL)
          discrepancia: totales.diferencia,
          observaciones: observacionesCompletas,
          cerrado: true,
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;
      setDiaCerrado(true);
      setMensaje("Day closure successfully registered");
      setTipoMensaje("success");
    } catch (err) {
      setMensaje("Error registering closure: " + err.message);
      setTipoMensaje("error");
    } finally {
      setCargando(false);
    }
  };

  const handleReabrirDia = async () => {
    if (!van?.id || !usuario?.id) return;
    if (!confirm("Are you sure you want to reopen this day?")) return;

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
        .eq('fecha', fecha);

      if (error) throw error;
      setDiaCerrado(false);
      setMensaje("Day successfully reopened");
      setTipoMensaje("success");
    } catch (err) {
      setMensaje("Error reopening day: " + err.message);
      setTipoMensaje("error");
    } finally {
      setCargando(false);
    }
  };

  /* ========================= PDF Generation ========================= */
  const handleGenerarPDF = () => {
    if (!ventasDia.length && !pagosDirectos.length) {
      setMensaje("No sales or payments to generate report");
      setTipoMensaje("warning");
      return;
    }

    try {
      const doc = new jsPDF();
      const businessName = "Tools4Care";
      const reportTitle = "Day Closure Report";

      // Header
      doc.setFillColor(25, 118, 210);
      doc.rect(0, 0, 210, 30, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.text(businessName, 14, 20);
      doc.setFontSize(16);
      doc.text(reportTitle, 14, 30);
      doc.setTextColor(0, 0, 0);

      // Business information
      doc.setFillColor(240, 240, 240);
      doc.rect(14, 35, 182, 25, "F");
      doc.setFontSize(10);
      doc.text(`Date: ${format(new Date(fecha), 'MM/dd/yyyy')}`, 14, 45);
      doc.text(`VAN: ${van?.nombre || van?.alias || 'No name'}`, 14, 52);
      doc.text(`User: ${usuario?.nombre || 'No name'}`, 14, 59);

      // Executive Summary
      doc.setFillColor(25, 118, 210);
      doc.rect(14, 65, 182, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Executive Summary", 14, 73);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      const summaryData = [
        ["Metric", "Value"],
        ["Total Sales", totales.totalVentas > 0 ? fmtCurrency(totales.totalVentas) : "$0.00"],
        ["Total in System", totales.totalCaja > 0 ? fmtCurrency(totales.totalCaja) : "$0.00"],
        ["Total Real", fmtCurrency(cashReal + cardReal + transferReal + otherReal)],
        ["Discrepancy", totales.diferencia > 0 ? fmtCurrency(totales.diferencia) : "$0.00"]
      ];

      autoTable(doc, {
        startY: 78,
        head: [summaryData[0]],
        body: summaryData.slice(1),
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: "bold" }
      });

      // Payment Methods
      const paymentY = doc.lastAutoTable.finalY + 10;
      doc.setFillColor(25, 118, 210);
      doc.rect(14, paymentY, 182, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Payment Methods Breakdown", 14, paymentY + 8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      const paymentData = [
        ["Method", "System Amount", "Real Amount", "Difference", "Percentage"],
        ["Cash", fmtCurrency(totales.totalEfectivo), fmtCurrency(cashReal),
          fmtCurrency(Math.abs(totales.totalEfectivo - cashReal)),
          `${((totales.totalEfectivo / totales.totalCaja) * 100).toFixed(1)}%`],
        ["Card", fmtCurrency(totales.totalTarjeta), fmtCurrency(cardReal),
          fmtCurrency(Math.abs(totales.totalTarjeta - cardReal)),
          `${((totales.totalTarjeta / totales.totalCaja) * 100).toFixed(1)}%`],
        ["Transfer", fmtCurrency(totales.totalTransferencia), fmtCurrency(transferReal),
          fmtCurrency(Math.abs(totales.totalTransferencia - transferReal)),
          `${((totales.totalTransferencia / totales.totalCaja) * 100).toFixed(1)}%`],
        ["Other", fmtCurrency(totales.totalOtros), fmtCurrency(otherReal),
          fmtCurrency(Math.abs(totales.totalOtros - otherReal)),
          `${((totales.totalOtros / totales.totalCaja) * 100).toFixed(1)}%`],
        ["", "", "", "", ""],
        ["Total", fmtCurrency(totales.totalCaja), fmtCurrency(cashReal + cardReal + transferReal + otherReal),
          fmtCurrency(totales.diferencia), "100%"]
      ];

      autoTable(doc, {
        startY: paymentY + 12,
        head: [paymentData[0]],
        body: paymentData.slice(1),
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: "bold" }
      });

      // Notes
      if (observaciones) {
        const notesY = doc.lastAutoTable.finalY + 10;
        doc.setFillColor(25, 118, 210);
        doc.rect(14, notesY, 182, 10, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Notes", 14, notesY + 8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(observaciones, 14, notesY + 18, { maxWidth: 180 });
      }

      // Footer
      const footerY = 270;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on ${new Date().toLocaleString()}`, 14, footerY);
      doc.text(`Tools4Care Financial System`, 14, footerY + 6);

      doc.save(`DayClosure_${fecha}_${van?.nombre || 'VAN'}.pdf`);
      setMensaje("PDF report generated successfully");
      setTipoMensaje("success");
    } catch (error) {
      setMensaje("Error generating PDF: " + error.message);
      setTipoMensaje("error");
    }
  };

  /* ========================= Cash Breakdown Functions ========================= */
  const openCashBreakdownModal = () => {
    const initialCounts = {};
    DENOMINATIONS.forEach(denom => {
      initialCounts[denom.value] = 0;
    });
    setCashCounts(initialCounts);
    calculateCashTotal(initialCounts);
    setShowCashBreakdownModal(true);
  };

  const updateCashCount = (value, count) => {
    const numericCount = parseInt(count) || 0;
    const newCounts = { ...cashCounts, [value]: numericCount };
    setCashCounts(newCounts);
    calculateCashTotal(newCounts);
  };

  const calculateCashTotal = (counts) => {
    let total = 0;
    Object.entries(counts).forEach(([value, count]) => {
      total += Number(value) * Number(count);
    });
    setCashTotal(total);
  };

  const applyCashBreakdown = () => {
    const formattedValue = cashTotal.toFixed(2);
    setCashInput(formattedValue);
    setShowCashBreakdownModal(false);
    setMensaje(`Cash updated to ${fmtCurrency(cashTotal)}`);
    setTipoMensaje("success");
  };

  const addCashCount = (value) => {
    const newCounts = { ...cashCounts, [value]: (cashCounts[value] || 0) + 1 };
    setCashCounts(newCounts);
    calculateCashTotal(newCounts);
  };

  const subtractCashCount = (value) => {
    const currentCount = cashCounts[value] || 0;
    if (currentCount > 0) {
      const newCounts = { ...cashCounts, [value]: currentCount - 1 };
      setCashCounts(newCounts);
      calculateCashTotal(newCounts);
    }
  };

  /* ========================= Card Breakdown Functions ========================= */
  const openCardBreakdownModal = () => {
    const initialCounts = {};
    DENOMINATIONS.forEach(denom => {
      initialCounts[denom.value] = 0;
    });
    setCardCounts(initialCounts);
    calculateCardTotal(initialCounts);
    setShowCardBreakdownModal(true);
  };

  const updateCardCount = (value, count) => {
    const numericCount = parseInt(count) || 0;
    const newCounts = { ...cardCounts, [value]: numericCount };
    setCardCounts(newCounts);
    calculateCardTotal(newCounts);
  };

  const calculateCardTotal = (counts) => {
    let total = 0;
    Object.entries(counts).forEach(([value, count]) => {
      total += Number(value) * Number(count);
    });
    setCardTotal(total);
  };

  const applyCardBreakdown = () => {
    const formattedValue = cardTotal.toFixed(2);
    setCardInput(formattedValue);
    setShowCardBreakdownModal(false);
    setMensaje(`Card payments updated to ${fmtCurrency(cardTotal)}`);
    setTipoMensaje("success");
  };

  const addCardCount = (value) => {
    const newCounts = { ...cardCounts, [value]: (cardCounts[value] || 0) + 1 };
    setCardCounts(newCounts);
    calculateCardTotal(newCounts);
  };

  const subtractCardCount = (value) => {
    const currentCount = cardCounts[value] || 0;
    if (currentCount > 0) {
      const newCounts = { ...cardCounts, [value]: currentCount - 1 };
      setCardCounts(newCounts);
      calculateCardTotal(newCounts);
    }
  };

  /* ========================= Transfer Breakdown Functions ========================= */
  const openTransferBreakdownModal = () => {
    const initialCounts = {};
    TRANSFER_TYPES.forEach(type => {
      initialCounts[type.value] = 0;
    });
    setTransferCounts(initialCounts);
    calculateTransferTotal(initialCounts);
    setShowTransferBreakdownModal(true);
  };

  const updateTransferCount = (type, count) => {
    const numericCount = parseInt(count) || 0;
    const newCounts = { ...transferCounts, [type]: numericCount };
    setTransferCounts(newCounts);
    calculateTransferTotal(newCounts);
  };

  const calculateTransferTotal = (counts) => {
    let total = 0;
    Object.entries(counts).forEach(([type, count]) => {
      total += Number(count);
    });
    setTransferTotal(total);
  };

  const applyTransferBreakdown = () => {
    const formattedValue = transferTotal.toFixed(2);
    setTransferInput(formattedValue);
    setShowTransferBreakdownModal(false);
    setMensaje(`Transfer payments updated to ${fmtCurrency(transferTotal)}`);
    setTipoMensaje("success");
  };

  const addTransferCount = (type) => {
    const newCounts = { ...transferCounts, [type]: (transferCounts[type] || 0) + 1 };
    setTransferCounts(newCounts);
    calculateTransferTotal(newCounts);
  };

  const subtractTransferCount = (type) => {
    const currentCount = transferCounts[type] || 0;
    if (currentCount > 0) {
      const newCounts = { ...transferCounts, [type]: currentCount - 1 };
      setTransferCounts(newCounts);
      calculateTransferTotal(newCounts);
    }
  };

  /* ========================= Other Breakdown Functions ========================= */
  const openOtherBreakdownModal = () => {
    const initialCounts = {};
    DENOMINATIONS.forEach(denom => {
      initialCounts[denom.value] = 0;
    });
    setOtherCounts(initialCounts);
    calculateOtherTotal(initialCounts);
    setShowOtherBreakdownModal(true);
  };

  const updateOtherCount = (value, count) => {
    const numericCount = parseInt(count) || 0;
    const newCounts = { ...otherCounts, [value]: numericCount };
    setOtherCounts(newCounts);
    calculateOtherTotal(newCounts);
  };

  const calculateOtherTotal = (counts) => {
    let total = 0;
    Object.entries(counts).forEach(([value, count]) => {
      total += Number(value) * Number(count);
    });
    setOtherTotal(total);
  };

  const applyOtherBreakdown = () => {
    const formattedValue = otherTotal.toFixed(2);
    setOtherInput(formattedValue);
    setShowOtherBreakdownModal(false);
    setMensaje(`Other payments updated to ${fmtCurrency(otherTotal)}`);
    setTipoMensaje("success");
  };

  const addOtherCount = (value) => {
    const newCounts = { ...otherCounts, [value]: (otherCounts[value] || 0) + 1 };
    setOtherCounts(newCounts);
    calculateOtherTotal(newCounts);
  };

  const subtractOtherCount = (value) => {
    const currentCount = otherCounts[value] || 0;
    if (currentCount > 0) {
      const newCounts = { ...otherCounts, [value]: currentCount - 1 };
      setOtherCounts(newCounts);
      calculateOtherTotal(newCounts);
    }
  };

  /* ========================= Calculated Totals ========================= */
  const totales = useMemo(() => {
    if (!ventasDia.length && !pagosDirectos.length) return {
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

    pagosDirectos.forEach(pago => {
      const monto = Number(pago.monto || 0);
      switch(pago.metodo_pago) {
        case "efectivo": totalEfectivo += monto; break;
        case "tarjeta": totalTarjeta += monto; break;
        case "transferencia": totalTransferencia += monto; break;
        default: totalOtros += monto;
      }
    });

    const totalCaja = totalEfectivo + totalTarjeta + totalTransferencia + totalOtros;
    const totalReal = cashReal + cardReal + transferReal + otherReal;
    const diferencia = Math.abs(totalCaja - totalReal);

    return {
      totalVentas,
      totalEfectivo,
      totalTarjeta,
      totalTransferencia,
      totalOtros,
      totalCaja,
      diferencia
    };
  }, [ventasDia, pagosDirectos, cashReal, cardReal, transferReal, otherReal]);

  /* ========================= Chart Data ========================= */
  const datosMetodosPago = useMemo(() => {
    return [
      { name: "Cash", value: totales.totalEfectivo, color: getPaymentMethodColor("efectivo") },
      { name: "Card", value: totales.totalTarjeta, color: getPaymentMethodColor("tarjeta") },
      { name: "Transfer", value: totales.totalTransferencia, color: getPaymentMethodColor("transferencia") },
      { name: "Other", value: totales.totalOtros, color: getPaymentMethodColor("otro") },
    ].filter(item => item.value > 0);
  }, [totales]);

  const datosVentasPorHora = useMemo(() => {
    const horas = {};
    [...ventasDia, ...pagosDirectos].forEach(transaccion => {
      if (!transaccion.created_at && !transaccion.fecha_pago) return;
      const fecha = transaccion.created_at || transaccion.fecha_pago;
      const hora = new Date(fecha).getHours();
      horas[hora] = (horas[hora] || 0) + Number(
        transaccion.total_venta || transaccion.monto || 0
      );
    });
    return Array.from({ length: 24 }, (_, i) => ({
      hora: `${i}:00`,
      ventas: horas[i] || 0
    }));
  }, [ventasDia, pagosDirectos]);

  /* ========================= Rendering ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-2 sm:p-4">
      <div className="w-full max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Day Closure
              </h1>
              <p className="text-gray-600 mt-1 sm:mt-2 text-xs sm:text-sm md:text-base">
                {diaCerrado ? "Day closed - No modifications allowed" : "Perform day closure when you finish your operations"}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => navigate("/")}
                className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-sm text-sm sm:text-base"
              >
                ← Back
              </button>
              <button
                onClick={() => setShowReportPreview(true)}
                disabled={ventasCargando || pagosCargando || (!ventasDia.length && !pagosDirectos.length)}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileBarChart size={18} />
                <span>View Report</span>
              </button>
              <button
                onClick={() => { cargarVentasDia(); cargarPagosDirectos(); }}
                disabled={ventasCargando || pagosCargando}
                className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-sm text-sm sm:text-base"
              >
                <RefreshCw size={18} className={(ventasCargando || pagosCargando) ? "animate-spin" : ""} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {mensaje && (
          <div className={`mb-6 p-4 rounded-xl shadow-lg transition-all duration-300 ${
            tipoMensaje === "error" ? "bg-red-50 border border-red-200 text-red-700" :
            tipoMensaje === "warning" ? "bg-yellow-50 border border-yellow-200 text-yellow-700" :
            tipoMensaje === "success" ? "bg-green-50 border border-green-200 text-green-700" :
            "bg-blue-50 border border-blue-200 text-blue-700"
          }`}>
            <div className="flex items-center gap-2">
              {tipoMensaje === "error" ? <AlertCircle size={20} /> :
               tipoMensaje === "warning" ? <AlertTriangle size={20} /> :
               tipoMensaje === "success" ? <CheckCircle size={20} /> :
               <FileText size={20} />}
              {mensaje}
            </div>
          </div>
        )}

        {/* Payment Methods Panel */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Payment Methods Count</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Cash */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-green-600">
                    <DollarSign size={20} />
                  </div>
                  <span className="font-medium text-gray-700">Cash</span>
                </div>
                <button
                  onClick={openCashBreakdownModal}
                  disabled={diaCerrado}
                  className="bg-green-100 hover:bg-green-200 text-green-700 p-2 rounded-lg transition-colors"
                  title="Quick cash count"
                >
                  <Calculator size={16} />
                </button>
              </div>

              <div className="mb-2">
                <p className="text-sm text-gray-600">System Total</p>
                <p className="text-lg font-bold text-green-800">{totales.totalEfectivo > 0 ? fmtCurrency(totales.totalEfectivo) : "$0.00"}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600">What I Have</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    disabled={diaCerrado}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder={cashReal === 0 ? "0.00" : fmtCurrency(cashReal)}
                  />
                </div>
              </div>
            </div>

            {/* Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-blue-600">
                    <CreditCard size={20} />
                  </div>
                  <span className="font-medium text-gray-700">Card</span>
                </div>
                <button
                  onClick={openCardBreakdownModal}
                  disabled={diaCerrado}
                  className="bg-blue-100 hover:bg-blue-200 text-blue-700 p-2 rounded-lg transition-colors"
                  title="Quick card count"
                >
                  <Calculator size={16} />
                </button>
              </div>

              <div className="mb-2">
                <p className="text-sm text-gray-600">System Total</p>
                <p className="text-lg font-bold text-blue-800">{totales.totalTarjeta > 0 ? fmtCurrency(totales.totalTarjeta) : "$0.00"}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600">What I Have</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={cardInput}
                    onChange={(e) => setCardInput(e.target.value)}
                    disabled={diaCerrado}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={cardReal === 0 ? "0.00" : fmtCurrency(cardReal)}
                  />
                </div>
              </div>
            </div>

            {/* Transfer */}
            <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-purple-600">
                    <Send size={20} />
                  </div>
                  <span className="font-medium text-gray-700">Transfer</span>
                </div>
                <button
                  onClick={openTransferBreakdownModal}
                  disabled={diaCerrado}
                  className="bg-purple-100 hover:bg-purple-200 text-purple-700 p-2 rounded-lg transition-colors"
                  title="Quick transfer count"
                >
                  <Calculator size={16} />
                </button>
              </div>

              <div className="mb-2">
                <p className="text-sm text-gray-600">System Total</p>
                <p className="text-lg font-bold text-purple-800">{totales.totalTransferencia > 0 ? fmtCurrency(totales.totalTransferencia) : "$0.00"}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600">What I Have</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={transferInput}
                    onChange={(e) => setTransferInput(e.target.value)}
                    disabled={diaCerrado}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder={transferReal === 0 ? "0.00" : fmtCurrency(transferReal)}
                  />
                </div>
              </div>
            </div>

            {/* Other */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-amber-600">
                    <MoreHorizontal size={20} />
                  </div>
                  <span className="font-medium text-gray-700">Other</span>
                </div>
                <button
                  onClick={openOtherBreakdownModal}
                  disabled={diaCerrado}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-700 p-2 rounded-lg transition-colors"
                  title="Quick other count"
                >
                  <Calculator size={16} />
                </button>
              </div>

              <div className="mb-2">
                <p className="text-sm text-gray-600">System Total</p>
                <p className="text-lg font-bold text-amber-800">{totales.totalOtros > 0 ? fmtCurrency(totales.totalOtros) : "$0.00"}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600">What I Have</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={otherInput}
                    onChange={(e) => setOtherInput(e.target.value)}
                    disabled={diaCerrado}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder={otherReal === 0 ? "0.00" : fmtCurrency(otherReal)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Control panel */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Date selector */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => {
                  const selectedDate = e.target.value;
                  setFecha(selectedDate);
                  cargarVentasDia();
                  cargarPagosDirectos();
                  verificarDiaCerrado();
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>

            {/* Notes */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes {totales.diferencia > 0 && "(required)"}
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                disabled={diaCerrado}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={2}
                placeholder="Indicate reason for discrepancy (if applicable)"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={handleGenerarPDF}
              disabled={ventasCargando || pagosCargando || (!ventasDia.length && !pagosDirectos.length)}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={18} />
              <span>Generate PDF Report</span>
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
                    <span>Closing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    <span>Close Day</span>
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
                    <span>Reopening...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    <span>Reopen Day</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Day summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium">Total Sales</p>
                <p className="text-2xl font-bold text-blue-800">{totales.totalVentas > 0 ? fmtCurrency(totales.totalVentas) : "$0.00"}</p>
              </div>
              <DollarSign className="text-blue-600" size={24} />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 text-sm font-medium">Total in System</p>
                <p className="text-2xl font-bold text-green-800">{totales.totalCaja > 0 ? fmtCurrency(totales.totalCaja) : "$0.00"}</p>
              </div>
              <Calculator className="text-green-600" size={24} />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-600 text-sm font-medium">Total Real</p>
                <p className="text-2xl font-bold text-purple-800">{fmtCurrency(cashReal + cardReal + transferReal + otherReal)}</p>
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
                  Discrepancy
                </p>
                <p className={`text-2xl font-bold ${
                  totales.diferencia === 0 ? "text-green-800" : "text-red-800"
                }`}>
                  {totales.diferencia > 0 ? fmtCurrency(totales.diferencia) : "$0.00"}
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

        {/* Loading indicator */}
        {(ventasCargando || pagosCargando) && (
          <div className="flex justify-center items-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading data...</span>
          </div>
        )}

        {/* Charts */}
        {!ventasCargando && !pagosCargando && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Payment methods */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign size={20} />
                Payment Methods
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

            {/* Sales by hour */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Calendar size={20} />
                Activity by Hour
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
        )}

        {/* Sales table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FileText size={20} />
              Sales of the Day ({ventasDia.length})
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
              <p className="text-gray-500 font-medium">No sales registered for this date</p>
              <p className="text-gray-400 text-sm mt-1">Check the date or try refreshing</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
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
                        {venta.clientes?.nombre || "Unidentified client"}
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
                          {venta.estado_pago || "pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Direct payments table */}
        {pagosDirectos.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <DollarSign size={20} />
                Direct Payments of the Day ({pagosDirectos.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pagosDirectos.map((pago) => (
                    <tr key={pago.id} className="hover:bg-gray-50">
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {pago.id.slice(0, 8)}...
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(pago.fecha_pago).toLocaleString()}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {pago.clientes?.nombre || "Unidentified client"}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          pago.metodo_pago === "efectivo" ? "bg-green-100 text-green-800" :
                          pago.metodo_pago === "tarjeta" ? "bg-blue-100 text-blue-800" :
                          pago.metodo_pago === "transferencia" ? "bg-purple-100 text-purple-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {getPaymentMethodLabel(pago.metodo_pago)}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                        {fmtCurrency(pago.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Final summary */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200 mt-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Final Day Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Total Transactions</div>
              <div className="text-2xl font-bold text-blue-800">{ventasDia.length + pagosDirectos.length}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Total Money in System</div>
              <div className="text-2xl font-bold text-green-800">{totales.totalCaja > 0 ? fmtCurrency(totales.totalCaja) : "$0.00"}</div>
            </div>
            <div className={`bg-white rounded-lg p-4 shadow-sm ${
              totales.diferencia === 0 ? "border-green-200" : "border-red-200"
            }`}>
              <div className="text-sm text-gray-600 mb-1">Closure Status</div>
              <div className={`text-2xl font-bold ${
                totales.diferencia === 0 ? "text-green-800" : "text-red-800"
              }`}>
                {totales.diferencia === 0 ? "Balanced" : "Discrepancy"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Report Preview Modal */}
      {showReportPreview && (
        <ReportPreview
          fecha={fecha}
          ventasDia={ventasDia}
          pagosDirectos={pagosDirectos}
          totales={totales}
          cashReal={cashReal}
          cardReal={cardReal}
          transferReal={transferReal}
          otherReal={otherReal}
          van={van}
          usuario={usuario}
          onGeneratePDF={handleGenerarPDF}
          onClose={() => setShowReportPreview(false)}
        />
      )}

      {/* Cash breakdown modal */}
      {showCashBreakdownModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Quick Cash Count</h3>
              <button
                onClick={() => setShowCashBreakdownModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-grow">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-gray-700">Enter the count for each denomination:</p>
                  <div className="text-xl font-bold text-green-700">
                    Total: {fmtCurrency(cashTotal)}
                  </div>
                </div>

                <div className="space-y-3">
                  {DENOMINATIONS.map((denom) => (
                    <div key={denom.value} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-700">{denom.label}</span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => subtractCashCount(denom.value)}
                          className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors"
                        >
                          <Minus size={16} />
                        </button>

                        <input
                          type="text"
                          value={String(cashCounts[denom.value] || 0).padStart(1, '0')}
                          onChange={(e) => updateCashCount(denom.value, e.target.value)}
                          className="w-16 text-center border border-gray-300 rounded-lg py-1 px-2"
                        />

                        <button
                          onClick={() => addCashCount(denom.value)}
                          className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      <div className="font-medium text-gray-900">
                        {fmtCurrency((cashCounts[denom.value] || 0) * denom.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-between">
              <button
                onClick={() => setShowCashBreakdownModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={applyCashBreakdown}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <CheckCircle size={18} />
                Apply to Cash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card breakdown modal - Similar structure */}
      {showCardBreakdownModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Quick Card Count</h3>
              <button onClick={() => setShowCardBreakdownModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-grow">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-gray-700">Enter the count for each denomination:</p>
                  <div className="text-xl font-bold text-blue-700">Total: {fmtCurrency(cardTotal)}</div>
                </div>
                <div className="space-y-3">
                  {DENOMINATIONS.map((denom) => (
                    <div key={denom.value} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-700">{denom.label}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => subtractCardCount(denom.value)} className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors">
                          <Minus size={16} />
                        </button>
                        <input type="text" value={String(cardCounts[denom.value] || 0).padStart(1, '0')} onChange={(e) => updateCardCount(denom.value, e.target.value)} className="w-16 text-center border border-gray-300 rounded-lg py-1 px-2" />
                        <button onClick={() => addCardCount(denom.value)} className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors">
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="font-medium text-gray-900">{fmtCurrency((cardCounts[denom.value] || 0) * denom.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between">
              <button onClick={() => setShowCardBreakdownModal(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={applyCardBreakdown} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                <CheckCircle size={18} />Apply to Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer breakdown modal */}
      {showTransferBreakdownModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Quick Transfer Count</h3>
              <button onClick={() => setShowTransferBreakdownModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-grow">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-gray-700">Enter the count for each transfer type:</p>
                  <div className="text-xl font-bold text-purple-700">Total: {fmtCurrency(transferTotal)}</div>
                </div>
                <div className="space-y-3">
                  {TRANSFER_TYPES.map((type) => (
                    <div key={type.value} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: type.color }}></div>
                        <span className="font-medium text-gray-700">{type.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => subtractTransferCount(type.value)} className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors">
                          <Minus size={16} />
                        </button>
                        <input type="text" value={String(transferCounts[type.value] || 0).padStart(1, '0')} onChange={(e) => updateTransferCount(type.value, e.target.value)} className="w-16 text-center border border-gray-300 rounded-lg py-1 px-2" />
                        <button onClick={() => addTransferCount(type.value)} className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors">
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="font-medium text-gray-900">{fmtCurrency((transferCounts[type.value] || 0) * 1)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between">
              <button onClick={() => setShowTransferBreakdownModal(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={applyTransferBreakdown} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                <CheckCircle size={18} />Apply to Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Other breakdown modal */}
      {showOtherBreakdownModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Quick Other Count</h3>
              <button onClick={() => setShowOtherBreakdownModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-grow">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-gray-700">Enter the count for each denomination:</p>
                  <div className="text-xl font-bold text-amber-700">Total: {fmtCurrency(otherTotal)}</div>
                </div>
                <div className="space-y-3">
                  {DENOMINATIONS.map((denom) => (
                    <div key={denom.value} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-700">{denom.label}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => subtractOtherCount(denom.value)} className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors">
                          <Minus size={16} />
                        </button>
                        <input type="text" value={String(otherCounts[denom.value] || 0).padStart(1, '0')} onChange={(e) => updateOtherCount(denom.value, e.target.value)} className="w-16 text-center border border-gray-300 rounded-lg py-1 px-2" />
                        <button onClick={() => addOtherCount(denom.value)} className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors">
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="font-medium text-gray-900">{fmtCurrency((otherCounts[denom.value] || 0) * denom.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between">
              <button onClick={() => setShowOtherBreakdownModal(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={applyOtherBreakdown} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                <CheckCircle size={18} />Apply to Other
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}