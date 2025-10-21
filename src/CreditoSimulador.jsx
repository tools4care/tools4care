// creditoSimulador.jsx
import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  Search, TrendingUp, TrendingDown, DollarSign,
  AlertCircle, CheckCircle, XCircle, Target, Zap
} from "lucide-react";

/* ==================== HELPERS ==================== */
const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Colores por rango de score
const getScoreColor = (score) => {
  if (score >= 750) return { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" };
  if (score >= 650) return { bg: "bg-green-100", text: "text-green-700", border: "border-green-300" };
  if (score >= 550) return { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300" };
  if (score >= 400) return { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" };
  return { bg: "bg-red-100", text: "text-red-700", border: "border-red-300" };
};

const getScoreLabel = (score) => {
  if (score >= 750) return "Excelente";
  if (score >= 650) return "Muy Bueno";
  if (score >= 550) return "Bueno";
  if (score >= 400) return "Regular";
  return "Malo";
};

/* ==================== LÓGICA DE SCORE ==================== */
function calculateScoreImpact(currentSaldo, currentScore, scenario) {
  // Parámetros base
  const SCORE_MIN = 300;
  const SCORE_MAX = 850;
  
  let newSaldo = currentSaldo;
  let scoreDelta = 0;
  let description = "";

  switch (scenario.type) {
    case "PAGO_COMPLETO":
      newSaldo = 0;
      scoreDelta = Math.min(150, currentSaldo > 0 ? 100 + (currentSaldo / 100) : 0);
      description = `Pagar toda la deuda aumenta significativamente el score (${scoreDelta > 100 ? 'impacto mayor' : 'impacto moderado'})`;
      break;

    case "PAGO_PARCIAL":
      const montoPago = scenario.amount || 0;
      newSaldo = Math.max(0, currentSaldo - montoPago);
      const percentPaid = currentSaldo > 0 ? (montoPago / currentSaldo) : 0;
      scoreDelta = Math.round(percentPaid * 80);
      description = `Reducir ${Math.round(percentPaid * 100)}% de la deuda mejora el score en ${scoreDelta} puntos`;
      break;

    case "NUEVA_COMPRA":
      const montoCompra = scenario.amount || 0;
      newSaldo = currentSaldo + montoCompra;
      scoreDelta = -Math.round(montoCompra / 50);
      description = `Nueva deuda de ${fmt(montoCompra)} reduce el score`;
      break;

    case "MORA":
      const mesesMora = scenario.months || 1;
      scoreDelta = -Math.round(mesesMora * 35);
      newSaldo = currentSaldo * (1 + mesesMora * 0.05);
      description = `${mesesMora} mes${mesesMora > 1 ? 'es' : ''} sin pagar genera intereses y reduce score severamente`;
      break;

    case "HISTORIAL_PERFECTO":
      const mesesPerfecto = scenario.months || 1;
      scoreDelta = Math.round(mesesPerfecto * 15);
      description = `${mesesPerfecto} mes${mesesPerfecto > 1 ? 'es' : ''} de pagos puntuales aumenta la confianza crediticia`;
      break;

    case "LIMITE_AUMENTADO":
      const nuevoLimite = scenario.newLimit || 0;
      scoreDelta = Math.round((nuevoLimite - (scenario.currentLimit || 0)) / 100);
      description = `Aumento de límite refleja mejor capacidad crediticia`;
      break;

    default:
      description = "Sin cambios";
  }

  const newScore = Math.max(SCORE_MIN, Math.min(SCORE_MAX, currentScore + scoreDelta));

  return {
    newScore,
    scoreDelta,
    newSaldo,
    description,
    saldoDelta: newSaldo - currentSaldo
  };
}

/* ==================== COMPONENTE PRINCIPAL ==================== */
export default function SimuladorCredito({ onClose }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  // Escenarios de simulación
  const [scenarios, setScenarios] = useState([
    { id: 1, type: "PAGO_COMPLETO", label: "💳 Pago Total", active: false },
    { id: 2, type: "PAGO_PARCIAL", label: "💵 Pago Parcial", amount: 500, active: false },
    { id: 3, type: "NUEVA_COMPRA", label: "🛒 Nueva Compra", amount: 1000, active: false },
    { id: 4, type: "MORA", label: "⏰ Mora", months: 1, active: false },
    { id: 5, type: "HISTORIAL_PERFECTO", label: "⭐ Pagos Puntuales", months: 6, active: false }
  ]);

  // Buscar clientes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const { data, error } = await supabase
          .from("v_cxc_cliente_detalle_ext")
          .select("cliente_id, cliente_nombre, saldo, score_base, limite_politica, credito_disponible, telefono, direccion, nombre_negocio")
          .or(
            `cliente_nombre.ilike.%${searchQuery}%,` +
            `telefono.ilike.%${searchQuery}%,` +
            `direccion.ilike.%${searchQuery}%,` +
            `nombre_negocio.ilike.%${searchQuery}%`
          )
          .limit(10);

        if (!error) {
          setSearchResults(data || []);
        }
      } catch (e) {
        console.error("Error buscando clientes:", e);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectClient = (client) => {
    setSelectedClient(client);
    setSearchResults([]);
    setSearchQuery("");
  };

  const toggleScenario = (id) => {
    setScenarios(prev =>
      prev.map(s => s.id === id ? { ...s, active: !s.active } : s)
    );
  };

  const updateScenarioValue = (id, field, value) => {
    setScenarios(prev =>
      prev.map(s => s.id === id ? { ...s, [field]: Number(value) } : s)
    );
  };

  // Calcular impactos de escenarios activos
  const impacts = useMemo(() => {
    if (!selectedClient) return [];

    let currentScore = selectedClient.score_base || 500;
    let currentSaldo = Number(selectedClient.saldo || 0);

    const results = scenarios
      .filter(s => s.active)
      .map(scenario => {
        const impact = calculateScoreImpact(currentSaldo, currentScore, scenario);
        currentScore = impact.newScore;
        currentSaldo = impact.newSaldo;
        return {
          ...scenario,
          ...impact
        };
      });

    return results;
  }, [selectedClient, scenarios]);

  // Score final después de todos los escenarios
  const finalScore = useMemo(() => {
    if (!selectedClient) return 0;
    if (impacts.length === 0) return selectedClient.score_base || 500;
    return impacts[impacts.length - 1].newScore;
  }, [selectedClient, impacts]);

  const finalSaldo = useMemo(() => {
    if (!selectedClient) return 0;
    if (impacts.length === 0) return Number(selectedClient.saldo || 0);
    return impacts[impacts.length - 1].newSaldo;
  }, [selectedClient, impacts]);

  // Datos para gráficas
  const scoreProgression = useMemo(() => {
    if (!selectedClient) return [];

    const data = [
      { name: "Actual", score: selectedClient.score_base || 500 }
    ];

    let currentScore = selectedClient.score_base || 500;
    impacts.forEach((impact, idx) => {
      currentScore = impact.newScore;
      data.push({
        name: `Paso ${idx + 1}`,
        score: currentScore
      });
    });

    return data;
  }, [selectedClient, impacts]);

  const saldoProgression = useMemo(() => {
    if (!selectedClient) return [];

    const data = [
      { name: "Actual", saldo: Number(selectedClient.saldo || 0) }
    ];

    let currentSaldo = Number(selectedClient.saldo || 0);
    impacts.forEach((impact, idx) => {
      currentSaldo = impact.newSaldo;
      data.push({
        name: `Paso ${idx + 1}`,
        saldo: currentSaldo
      });
    });

    return data;
  }, [selectedClient, impacts]);

  if (!selectedClient) {
    return (
      <div className="p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">🔍 Buscar Cliente</h3>
        
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono, dirección o negocio..."
            className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            autoFocus
          />
        </div>

        {searching && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-indigo-600 mx-auto"></div>
            <p className="text-gray-500 mt-3">Buscando...</p>
          </div>
        )}

        {!searching && searchResults.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {searchResults.map(client => {
              const scoreColors = getScoreColor(client.score_base || 0);
              return (
                <button
                  key={client.cliente_id}
                  onClick={() => selectClient(client)}
                  className="w-full text-left p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900">{client.cliente_nombre}</div>
                      {client.nombre_negocio && (
                        <div className="text-sm text-gray-600">🏪 {client.nombre_negocio}</div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {client.telefono && `📞 ${client.telefono}`}
                        {client.direccion && ` • 📍 ${client.direccion}`}
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <div className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${scoreColors.bg} ${scoreColors.text} border ${scoreColors.border}`}>
                        {client.score_base || 0}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Saldo: {fmt(client.saldo)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-gray-500">No se encontraron clientes</p>
          </div>
        )}

        {searchQuery.trim().length < 2 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">👥</div>
            <p className="text-gray-500">Escribe al menos 2 caracteres para buscar</p>
          </div>
        )}
      </div>
    );
  }

  // Vista de simulación con cliente seleccionado
  const currentColors = getScoreColor(selectedClient.score_base || 0);
  const finalColors = getScoreColor(finalScore);

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header con info del cliente */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="font-bold text-lg text-gray-900">{selectedClient.cliente_nombre}</div>
              {selectedClient.nombre_negocio && (
                <div className="text-sm text-gray-600">🏪 {selectedClient.nombre_negocio}</div>
              )}
            </div>
            <button
              onClick={() => setSelectedClient(null)}
              className="text-sm px-3 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-700 font-semibold border border-gray-300"
            >
              ← Cambiar cliente
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-3 border border-indigo-200">
              <div className="text-xs text-gray-500 uppercase">Score Actual</div>
              <div className={`text-2xl font-bold ${currentColors.text}`}>
                {selectedClient.score_base || 0}
              </div>
              <div className="text-xs text-gray-600">{getScoreLabel(selectedClient.score_base || 0)}</div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-indigo-200">
              <div className="text-xs text-gray-500 uppercase">Saldo</div>
              <div className="text-lg font-bold text-red-600">{fmt(selectedClient.saldo)}</div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-indigo-200">
              <div className="text-xs text-gray-500 uppercase">Límite</div>
              <div className="text-lg font-bold text-gray-900">{fmt(selectedClient.limite_politica)}</div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-indigo-200">
              <div className="text-xs text-gray-500 uppercase">Disponible</div>
              <div className="text-lg font-bold text-green-600">{fmt(selectedClient.credito_disponible)}</div>
            </div>
          </div>
        </div>

        {/* Escenarios de simulación */}
        <div>
          <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Zap className="text-yellow-500" size={20} />
            Simular Escenarios
          </h4>
          
          <div className="space-y-3">
            {scenarios.map(scenario => (
              <div
                key={scenario.id}
                className={`border-2 rounded-xl p-4 transition-all ${
                  scenario.active
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-300 bg-white hover:border-indigo-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={scenario.active}
                    onChange={() => toggleScenario(scenario.id)}
                    className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{scenario.label}</div>
                    {scenario.active && (
                      <div className="mt-2 flex items-center gap-2">
                        {(scenario.type === "PAGO_PARCIAL" || scenario.type === "NUEVA_COMPRA") && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600">Monto:</label>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={scenario.amount || 0}
                              onChange={(e) => updateScenarioValue(scenario.id, "amount", e.target.value)}
                              className="w-32 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                            />
                          </div>
                        )}
                        {(scenario.type === "MORA" || scenario.type === "HISTORIAL_PERFECTO") && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600">Meses:</label>
                            <input
                              type="number"
                              min="1"
                              max="12"
                              value={scenario.months || 1}
                              onChange={(e) => updateScenarioValue(scenario.id, "months", e.target.value)}
                              className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resultados de la simulación */}
        {impacts.length > 0 && (
          <>
            {/* Impactos individuales */}
            <div>
              <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Target className="text-blue-500" size={20} />
                Impactos Simulados
              </h4>
              
              <div className="space-y-2">
                {impacts.map((impact, idx) => (
                  <div key={idx} className="bg-white border-2 border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 mb-1">{impact.label}</div>
                        <div className="text-sm text-gray-600">{impact.description}</div>
                      </div>
                      <div className="ml-4 text-right">
                        {impact.scoreDelta !== 0 && (
                          <div className={`flex items-center gap-1 font-bold ${
                            impact.scoreDelta > 0 ? "text-green-600" : "text-red-600"
                          }`}>
                            {impact.scoreDelta > 0 ? (
                              <TrendingUp size={16} />
                            ) : (
                              <TrendingDown size={16} />
                            )}
                            {impact.scoreDelta > 0 ? "+" : ""}{impact.scoreDelta}
                          </div>
                        )}
                        {impact.saldoDelta !== 0 && (
                          <div className={`text-sm ${
                            impact.saldoDelta < 0 ? "text-green-600" : "text-red-600"
                          }`}>
                            Saldo: {fmt(impact.newSaldo)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resultado final */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 rounded-xl p-6">
              <h4 className="font-bold text-gray-900 mb-4 text-center text-xl">📊 Resultado Proyectado</h4>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-2">Score Actual</div>
                  <div className={`inline-flex px-6 py-3 rounded-full text-3xl font-bold ${currentColors.bg} ${currentColors.text} border-2 ${currentColors.border}`}>
                    {selectedClient.score_base || 0}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{getScoreLabel(selectedClient.score_base || 0)}</div>
                </div>

                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-2">Score Proyectado</div>
                  <div className={`inline-flex px-6 py-3 rounded-full text-3xl font-bold ${finalColors.bg} ${finalColors.text} border-2 ${finalColors.border}`}>
                    {finalScore}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{getScoreLabel(finalScore)}</div>
                </div>
              </div>

              <div className="text-center">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-lg ${
                  finalScore > (selectedClient.score_base || 0)
                    ? "bg-green-100 text-green-700 border-2 border-green-300"
                    : finalScore < (selectedClient.score_base || 0)
                    ? "bg-red-100 text-red-700 border-2 border-red-300"
                    : "bg-gray-100 text-gray-700 border-2 border-gray-300"
                }`}>
                  {finalScore > (selectedClient.score_base || 0) && <CheckCircle size={20} />}
                  {finalScore < (selectedClient.score_base || 0) && <XCircle size={20} />}
                  {finalScore === (selectedClient.score_base || 0) && <AlertCircle size={20} />}
                  
                  Cambio: {finalScore > (selectedClient.score_base || 0) ? "+" : ""}
                  {finalScore - (selectedClient.score_base || 0)} puntos
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-white rounded-lg p-3 border-2 border-purple-200">
                  <div className="text-xs text-gray-500 uppercase">Saldo Final</div>
                  <div className="text-xl font-bold text-red-600">{fmt(finalSaldo)}</div>
                  <div className={`text-xs ${finalSaldo < Number(selectedClient.saldo || 0) ? "text-green-600" : "text-red-600"}`}>
                    {finalSaldo < Number(selectedClient.saldo || 0) ? "↓" : "↑"} 
                    {fmt(Math.abs(finalSaldo - Number(selectedClient.saldo || 0)))}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-3 border-2 border-purple-200">
                  <div className="text-xs text-gray-500 uppercase">Crédito Disponible</div>
                  <div className="text-xl font-bold text-green-600">
                    {fmt(Math.max(0, Number(selectedClient.limite_politica || 0) - finalSaldo))}
                  </div>
                  <div className="text-xs text-gray-500">
                    Límite: {fmt(selectedClient.limite_politica)}
                  </div>
                </div>
              </div>
            </div>

            {/* Gráficas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Progresión del Score */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                <h5 className="font-bold text-gray-900 mb-3 text-center">📈 Evolución del Score</h5>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={scoreProgression}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" fontSize={12} stroke="#6b7280" />
                    <YAxis domain={[300, 850]} fontSize={12} stroke="#6b7280" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#6366f1"
                      strokeWidth={3}
                      dot={{ fill: '#6366f1', r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Progresión del Saldo */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                <h5 className="font-bold text-gray-900 mb-3 text-center">💰 Evolución del Saldo</h5>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={saldoProgression}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" fontSize={12} stroke="#6b7280" />
                    <YAxis fontSize={12} stroke="#6b7280" />
                    <Tooltip
                      formatter={(value) => fmt(value)}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="saldo" fill="#ef4444" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 🆕 COMPARATIVA MEJORADA */}
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
              <h5 className="font-bold text-gray-900 mb-6 text-center text-xl">
                🎯 Comparativa: Actual vs Proyectado
              </h5>
              
              <div className="space-y-6">
                {/* Score Comparison */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="text-indigo-600" size={20} />
                      <span className="font-semibold text-gray-700">Credit Score</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Cambio: {finalScore > (selectedClient.score_base || 0) && "+"}
                      {finalScore - (selectedClient.score_base || 0)} pts
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-2">Actual</div>
                      <div className={`px-4 py-3 rounded-lg ${currentColors.bg} ${currentColors.text} border-2 ${currentColors.border}`}>
                        <div className="text-3xl font-bold">{selectedClient.score_base || 0}</div>
                        <div className="text-xs mt-1">{getScoreLabel(selectedClient.score_base || 0)}</div>
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-2">Proyectado</div>
                      <div className={`px-4 py-3 rounded-lg ${finalColors.bg} ${finalColors.text} border-2 ${finalColors.border}`}>
                        <div className="text-3xl font-bold">{finalScore}</div>
                        <div className="text-xs mt-1">{getScoreLabel(finalScore)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Barra visual de cambio */}
                  <div className="mt-3">
                    <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className={`absolute top-0 left-0 h-full transition-all duration-500 ${
                          finalScore >= (selectedClient.score_base || 0)
                            ? "bg-gradient-to-r from-green-400 to-emerald-500"
                            : "bg-gradient-to-r from-red-400 to-rose-500"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.abs((finalScore / 850) * 100))}%`
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                          {finalScore >= (selectedClient.score_base || 0) ? "↑" : "↓"} 
                          {Math.abs(finalScore - (selectedClient.score_base || 0))} puntos
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Saldo Comparison */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="text-red-600" size={20} />
                      <span className="font-semibold text-gray-700">Saldo Pendiente</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Diferencia: {fmt(Math.abs(finalSaldo - Number(selectedClient.saldo || 0)))}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3">
                      <div className="text-xs text-red-600 uppercase font-semibold mb-1">Actual</div>
                      <div className="text-2xl font-bold text-red-700">{fmt(selectedClient.saldo)}</div>
                    </div>
                    
                    <div className={`border-2 rounded-lg p-3 ${
                      finalSaldo < Number(selectedClient.saldo || 0)
                        ? "bg-green-50 border-green-200"
                        : finalSaldo > Number(selectedClient.saldo || 0)
                        ? "bg-red-50 border-red-200"
                        : "bg-gray-50 border-gray-200"
                    }`}>
                      <div className={`text-xs uppercase font-semibold mb-1 ${
                        finalSaldo < Number(selectedClient.saldo || 0)
                          ? "text-green-600"
                          : finalSaldo > Number(selectedClient.saldo || 0)
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}>
                        Proyectado
                      </div>
                      <div className={`text-2xl font-bold ${
                        finalSaldo < Number(selectedClient.saldo || 0)
                          ? "text-green-700"
                          : finalSaldo > Number(selectedClient.saldo || 0)
                          ? "text-red-700"
                          : "text-gray-700"
                      }`}>
                        {fmt(finalSaldo)}
                      </div>
                    </div>
                  </div>

                  {/* Barra de comparación visual */}
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-6 bg-red-200 rounded-lg overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
                          style={{
                            width: `${Math.min(100, ((Number(selectedClient.saldo || 0) / Number(selectedClient.limite_politica || 1)) * 100))}%`
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-600 w-16">Actual</span>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            finalSaldo < Number(selectedClient.saldo || 0)
                              ? "bg-gradient-to-r from-green-500 to-emerald-600"
                              : "bg-gradient-to-r from-red-500 to-red-600"
                          }`}
                          style={{
                            width: `${Math.min(100, ((finalSaldo / Number(selectedClient.limite_politica || 1)) * 100))}%`
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-600 w-16">Proyec.</span>
                    </div>
                  </div>
                </div>

                {/* Crédito Disponible Comparison */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="text-green-600" size={20} />
                      <span className="font-semibold text-gray-700">Crédito Disponible</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Límite: {fmt(selectedClient.limite_politica)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
                      <div className="text-xs text-green-600 uppercase font-semibold mb-1">Actual</div>
                      <div className="text-2xl font-bold text-green-700">
                        {fmt(selectedClient.credito_disponible)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {Math.round((Number(selectedClient.credito_disponible || 0) / Number(selectedClient.limite_politica || 1)) * 100)}% disponible
                      </div>
                    </div>
                    
                    <div className={`border-2 rounded-lg p-3 ${
                      (Number(selectedClient.limite_politica || 0) - finalSaldo) > Number(selectedClient.credito_disponible || 0)
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-orange-50 border-orange-200"
                    }`}>
                      <div className={`text-xs uppercase font-semibold mb-1 ${
                        (Number(selectedClient.limite_politica || 0) - finalSaldo) > Number(selectedClient.credito_disponible || 0)
                          ? "text-emerald-600"
                          : "text-orange-600"
                      }`}>
                        Proyectado
                      </div>
                      <div className={`text-2xl font-bold ${
                        (Number(selectedClient.limite_politica || 0) - finalSaldo) > Number(selectedClient.credito_disponible || 0)
                          ? "text-emerald-700"
                          : "text-orange-700"
                      }`}>
                        {fmt(Math.max(0, Number(selectedClient.limite_politica || 0) - finalSaldo))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {Math.round((Math.max(0, Number(selectedClient.limite_politica || 0) - finalSaldo) / Number(selectedClient.limite_politica || 1)) * 100)}% disponible
                      </div>
                    </div>
                  </div>

                  {/* Medidor visual de disponibilidad */}
                  <div className="mt-3 bg-gray-100 rounded-full h-4 overflow-hidden border-2 border-gray-200">
                    <div className="flex h-full">
                      <div
                        className="bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
                        style={{
                          width: `${Math.min(100, ((finalSaldo / Number(selectedClient.limite_politica || 1)) * 100))}%`
                        }}
                      />
                      <div
                        className="bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-500"
                        style={{
                          width: `${Math.max(0, 100 - ((finalSaldo / Number(selectedClient.limite_politica || 1)) * 100))}%`
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Usado: {fmt(finalSaldo)}</span>
                    <span>Disponible: {fmt(Math.max(0, Number(selectedClient.limite_politica || 0) - finalSaldo))}</span>
                  </div>
                </div>

                {/* Resumen del impacto */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-2">Resumen del Impacto</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-xs text-gray-500">Score</div>
                        <div className={`text-lg font-bold ${
                          finalScore > (selectedClient.score_base || 0)
                            ? "text-green-600"
                            : finalScore < (selectedClient.score_base || 0)
                            ? "text-red-600"
                            : "text-gray-600"
                        }`}>
                          {finalScore > (selectedClient.score_base || 0) ? "↑" : finalScore < (selectedClient.score_base || 0) ? "↓" : "→"} 
                          {Math.abs(finalScore - (selectedClient.score_base || 0))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Saldo</div>
                        <div className={`text-lg font-bold ${
                          finalSaldo < Number(selectedClient.saldo || 0)
                            ? "text-green-600"
                            : finalSaldo > Number(selectedClient.saldo || 0)
                            ? "text-red-600"
                            : "text-gray-600"
                        }`}>
                          {finalSaldo < Number(selectedClient.saldo || 0) ? "↓" : finalSaldo > Number(selectedClient.saldo || 0) ? "↑" : "→"}
                          {fmt(Math.abs(finalSaldo - Number(selectedClient.saldo || 0)))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Disponible</div>
                        <div className={`text-lg font-bold ${
                          (Number(selectedClient.limite_politica || 0) - finalSaldo) > Number(selectedClient.credito_disponible || 0)
                            ? "text-green-600"
                            : "text-red-600"
                        }`}>
                          {(Number(selectedClient.limite_politica || 0) - finalSaldo) > Number(selectedClient.credito_disponible || 0) ? "↑" : "↓"}
                          {fmt(Math.abs((Number(selectedClient.limite_politica || 0) - finalSaldo) - Number(selectedClient.credito_disponible || 0)))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {impacts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <p className="text-gray-500 font-semibold">Selecciona uno o más escenarios para simular</p>
            <p className="text-sm text-gray-400 mt-2">Activa los checkboxes de arriba para ver el impacto</p>
          </div>
        )}
      </div>
    </div>
  );
}