// creditoSimulador.jsx - PARTE 1
import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  Search, TrendingUp, TrendingDown, DollarSign,
  AlertCircle, CheckCircle, XCircle, Target, Zap, Award, Shield
} from "lucide-react";

/* ==================== HELPERS ==================== */
const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Límites de crédito según tu política
const CREDIT_LIMITS_BY_SCORE = [
  { minScore: 800, maxScore: 850, limit: 800, label: "Excelente" },
  { minScore: 750, maxScore: 799, limit: 500, label: "Muy Bueno" },
  { minScore: 700, maxScore: 749, limit: 350, label: "Bueno" },
  { minScore: 650, maxScore: 699, limit: 200, label: "Aceptable" },
  { minScore: 600, maxScore: 649, limit: 150, label: "Regular" },
  { minScore: 550, maxScore: 599, limit: 80, label: "Bajo" },
  { minScore: 500, maxScore: 549, limit: 30, label: "Muy Bajo" },
  { minScore: 300, maxScore: 499, limit: 0, label: "Sin Crédito" }
];

// Función que respeta limite_manual
function getEffectiveLimit(score, limiteManual) {
  if (limiteManual !== null && limiteManual !== undefined) {
    return limiteManual;
  }
  return policyLimit(score);
}

function policyLimit(score) {
  const s = Number(score ?? 600);
  if (s < 500) return 0;
  if (s < 550) return 30;
  if (s < 600) return 80;
  if (s < 650) return 150;
  if (s < 700) return 200;
  if (s < 750) return 350;
  if (s < 800) return 500;
  return 800;
}

// Función para obtener colores SIN template literals dinámicos
const getScoreColorClasses = (score) => {
  if (score >= 800) return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (score >= 750) return "bg-green-100 text-green-700 border-green-300";
  if (score >= 700) return "bg-lime-100 text-lime-700 border-lime-300";
  if (score >= 650) return "bg-yellow-100 text-yellow-700 border-yellow-300";
  if (score >= 600) return "bg-orange-100 text-orange-700 border-orange-300";
  if (score >= 550) return "bg-amber-100 text-amber-700 border-amber-300";
  if (score >= 500) return "bg-red-100 text-red-700 border-red-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
};

// Función para obtener clases de tarjetas por rango
const getTierCardClasses = (minScore) => {
  if (minScore >= 800) return "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (minScore >= 750) return "bg-green-50 border-green-200 text-green-700";
  if (minScore >= 700) return "bg-lime-50 border-lime-200 text-lime-700";
  if (minScore >= 650) return "bg-yellow-50 border-yellow-200 text-yellow-700";
  if (minScore >= 600) return "bg-orange-50 border-orange-200 text-orange-700";
  if (minScore >= 550) return "bg-amber-50 border-amber-200 text-amber-700";
  if (minScore >= 500) return "bg-red-50 border-red-200 text-red-700";
  return "bg-gray-50 border-gray-200 text-gray-700";
};

const getScoreLabel = (score) => {
  if (score >= 800) return "Excelente";
  if (score >= 750) return "Muy Bueno";
  if (score >= 700) return "Bueno";
  if (score >= 650) return "Aceptable";
  if (score >= 600) return "Regular";
  if (score >= 550) return "Bajo";
  if (score >= 500) return "Muy Bajo";
  return "Sin Crédito";
};

/* ==================== LÓGICA DE SCORE ==================== */
function calculateScoreImpact(currentSaldo, currentScore, scenario) {
  const SCORE_MIN = 300;
  const SCORE_MAX = 850;
  
  let newSaldo = currentSaldo;
  let scoreDelta = 0;
  let description = "";

  switch (scenario.type) {
    case "PAGO_COMPLETO":
      newSaldo = 0;
      scoreDelta = Math.min(150, currentSaldo > 0 ? 100 + (currentSaldo / 100) : 0);
      description = `Liquidar toda la deuda mejora significativamente tu historial crediticio`;
      break;

    case "PAGO_PARCIAL":
      const montoPago = scenario.amount || 0;
      newSaldo = Math.max(0, currentSaldo - montoPago);
      const percentPaid = currentSaldo > 0 ? (montoPago / currentSaldo) : 0;
      scoreDelta = Math.round(percentPaid * 80);
      description = `Reducir ${Math.round(percentPaid * 100)}% de la deuda (${fmt(montoPago)}) mejora tu score`;
      break;

    case "NUEVA_COMPRA":
      const montoCompra = scenario.amount || 0;
      newSaldo = currentSaldo + montoCompra;
      scoreDelta = -Math.round(montoCompra / 50);
      description = `Nueva compra de ${fmt(montoCompra)} aumenta tu saldo y reduce ligeramente tu score`;
      break;

    case "SIN_PAGAR":
      const periodos = scenario.periods || 1;
      const unidad = scenario.unit || "weeks";
      scoreDelta = unidad === "weeks" 
        ? -Math.round(periodos * 8)
        : -Math.round(periodos * 35);
      newSaldo = currentSaldo;
      description = `${periodos} ${unidad === "weeks" ? "semana" : "mes"}${periodos > 1 ? (unidad === "weeks" ? "s" : "es") : ""} sin actividad afecta negativamente tu historial`;
      break;

    case "HISTORIAL_PERFECTO":
      const periodo = scenario.periods || 1;
      const unit = scenario.unit || "weeks";
      scoreDelta = unit === "weeks"
        ? Math.round(periodo * 4)
        : Math.round(periodo * 15);
      description = `${periodo} ${unit === "weeks" ? "semana" : "mes"}${periodo > 1 ? (unit === "weeks" ? "s" : "es") : ""} de pagos puntuales fortalece tu crédito`;
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

  const [scenarios, setScenarios] = useState([
    { id: 1, type: "PAGO_COMPLETO", label: "💳 Pago Total", active: false },
    { id: 2, type: "PAGO_PARCIAL", label: "💵 Pago Parcial", amount: 50, active: false },
    { id: 3, type: "NUEVA_COMPRA", label: "🛒 Nueva Compra", amount: 100, active: false },
    { id: 4, type: "SIN_PAGAR", label: "⚠️ Sin Actividad", periods: 2, unit: "weeks", active: false },
    { id: 5, type: "HISTORIAL_PERFECTO", label: "⭐ Pagos Puntuales", periods: 4, unit: "weeks", active: false }
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
          .select("cliente_id, cliente_nombre, saldo, score_base, limite_politica, credito_disponible, telefono, direccion, nombre_negocio, limite_manual")
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
      prev.map(s => s.id === id ? { ...s, [field]: field === "unit" ? value : Number(value) } : s)
    );
  };

  // Calcular impactos
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

  const currentLimit = useMemo(() => {
    if (!selectedClient) return 0;
    return getEffectiveLimit(
      selectedClient.score_base || 0, 
      selectedClient.limite_manual
    );
  }, [selectedClient]);

  const projectedLimit = useMemo(() => {
    if (selectedClient?.limite_manual !== null && selectedClient?.limite_manual !== undefined) {
      return selectedClient.limite_manual;
    }
    return policyLimit(finalScore);
  }, [finalScore, selectedClient]);

  const hasManualLimit = useMemo(() => {
    return selectedClient?.limite_manual !== null && selectedClient?.limite_manual !== undefined;
  }, [selectedClient]);

  const currentAvailable = useMemo(() => {
    if (!selectedClient) return 0;
    return Math.max(0, currentLimit - Number(selectedClient.saldo || 0));
  }, [selectedClient, currentLimit]);

  const projectedAvailable = useMemo(() => {
    return Math.max(0, projectedLimit - finalSaldo);
  }, [projectedLimit, finalSaldo]);

  // Datos para gráficas
  const scoreProgression = useMemo(() => {
    if (!selectedClient) return [];

    const data = [
      { name: "Actual", score: selectedClient.score_base || 500, limit: currentLimit }
    ];

    let currentScore = selectedClient.score_base || 500;
    impacts.forEach((impact, idx) => {
      currentScore = impact.newScore;
      const limit = hasManualLimit 
        ? selectedClient.limite_manual 
        : policyLimit(currentScore);
      data.push({
        name: `Paso ${idx + 1}`,
        score: currentScore,
        limit: limit
      });
    });

    return data;
  }, [selectedClient, impacts, currentLimit, hasManualLimit]);

  const saldoProgression = useMemo(() => {
    if (!selectedClient) return [];

    const data = [
      { 
        name: "Actual", 
        saldo: Number(selectedClient.saldo || 0),
        disponible: currentAvailable
      }
    ];

    let currentSaldo = Number(selectedClient.saldo || 0);
    impacts.forEach((impact, idx) => {
      currentSaldo = impact.newSaldo;
      const limit = hasManualLimit 
        ? selectedClient.limite_manual 
        : policyLimit(impact.newScore);
      const disponible = Math.max(0, limit - currentSaldo);
      data.push({
        name: `Paso ${idx + 1}`,
        saldo: currentSaldo,
        disponible: disponible
      });
    });

    return data;
  }, [selectedClient, impacts, currentAvailable, hasManualLimit]);

  // ============= VISTA DE BÚSQUEDA =============
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
              const scoreClasses = getScoreColorClasses(client.score_base || 0);
              const effectiveLimit = getEffectiveLimit(
                client.score_base || 0, 
                client.limite_manual
              );
              const hasManual = client.limite_manual !== null && client.limite_manual !== undefined;
              
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
                      <div className={`inline-flex px-3 py-1 rounded-full text-sm font-bold border ${scoreClasses}`}>
                        {client.score_base || 0}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Saldo: {fmt(client.saldo)}</div>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <div className="text-xs text-indigo-600 font-semibold">
                          Límite: {fmt(effectiveLimit)}
                        </div>
                        {hasManual && (
                          <Shield className="text-amber-500" size={12} title="Límite manual" />
                        )}
                      </div>
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
            <p className="text-gray-500 mb-4">Escribe al menos 2 caracteres para buscar</p>
            
            <div className="mt-6 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-6">
              <h4 className="font-bold text-gray-900 mb-4 flex items-center justify-center gap-2">
                <Award className="text-indigo-600" size={20} />
                Política de Límites de Crédito
              </h4>
              <div className="space-y-2">
                {CREDIT_LIMITS_BY_SCORE.map((tier, idx) => {
                  const cardClasses = getTierCardClasses(tier.minScore);
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 ${cardClasses}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-xl font-bold">
                          {tier.minScore}-{tier.maxScore}
                        </div>
                        <div className="text-sm text-gray-600">{tier.label}</div>
                      </div>
                      <div className="text-xl font-bold">
                        {tier.limit === 0 ? "Sin crédito" : fmt(tier.limit)}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-amber-800">
                  <Shield size={16} />
                  <span className="text-xs font-semibold">
                    Los clientes con límite manual mantienen su límite personalizado
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============= PARTE 2 CONTINÚA... =============// creditoSimulador.jsx - PARTE 2 (Continuación)

  // ============= VISTA DE SIMULACIÓN CON CLIENTE SELECCIONADO =============
  const currentScoreClasses = getScoreColorClasses(selectedClient.score_base || 0);
  const finalScoreClasses = getScoreColorClasses(finalScore);

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header con info del cliente */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="font-bold text-lg text-gray-900 flex items-center gap-2">
                {selectedClient.cliente_nombre}
                {hasManualLimit && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300 text-xs font-semibold">
                    <Shield size={12} />
                    Límite Manual
                  </span>
                )}
              </div>
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
              <div className={`text-2xl font-bold ${currentScoreClasses.split(' ')[1]}`}>
                {selectedClient.score_base || 0}
              </div>
              <div className="text-xs text-gray-600">{getScoreLabel(selectedClient.score_base || 0)}</div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-indigo-200">
              <div className="text-xs text-gray-500 uppercase flex items-center gap-1">
                Límite
                {hasManualLimit && <Shield className="text-amber-500" size={12} />}
              </div>
              <div className="text-lg font-bold text-indigo-600">{fmt(currentLimit)}</div>
              {hasManualLimit && (
                <div className="text-xs text-amber-600">Manual</div>
              )}
            </div>

            <div className="bg-white rounded-lg p-3 border border-indigo-200">
              <div className="text-xs text-gray-500 uppercase">Saldo</div>
              <div className="text-lg font-bold text-red-600">{fmt(selectedClient.saldo)}</div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-indigo-200">
              <div className="text-xs text-gray-500 uppercase">Disponible</div>
              <div className="text-lg font-bold text-green-600">{fmt(currentAvailable)}</div>
            </div>
          </div>

          {hasManualLimit && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2">
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <Shield size={14} />
                <span className="font-semibold">
                  Este cliente tiene un límite manual de {fmt(selectedClient.limite_manual)} 
                  {policyLimit(selectedClient.score_base || 0) !== selectedClient.limite_manual && (
                    <> (política sugiere {fmt(policyLimit(selectedClient.score_base || 0))})</>
                  )}
                </span>
              </div>
            </div>
          )}
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
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={scenario.active}
                    onChange={() => toggleScenario(scenario.id)}
                    className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500 mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{scenario.label}</div>
                    {scenario.active && (
                      <div className="mt-2 space-y-2">
                        {(scenario.type === "PAGO_PARCIAL" || scenario.type === "NUEVA_COMPRA") && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600 min-w-[60px]">Monto:</label>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={scenario.amount || 0}
                              onChange={(e) => updateScenarioValue(scenario.id, "amount", e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                            />
                          </div>
                        )}
                        {(scenario.type === "SIN_PAGAR" || scenario.type === "HISTORIAL_PERFECTO") && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="text-sm text-gray-600 min-w-[60px]">Período:</label>
                              <input
                                type="number"
                                min="1"
                                max="12"
                                value={scenario.periods || 1}
                                onChange={(e) => updateScenarioValue(scenario.id, "periods", e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-sm text-gray-600 min-w-[60px]">Unidad:</label>
                              <select
                                value={scenario.unit || "weeks"}
                                onChange={(e) => updateScenarioValue(scenario.id, "unit", e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none bg-white"
                              >
                                <option value="weeks">Semanas</option>
                                <option value="months">Meses</option>
                              </select>
                            </div>
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
                {impacts.map((impact, idx) => {
                  const impactLimit = hasManualLimit 
                    ? selectedClient.limite_manual 
                    : policyLimit(impact.newScore);
                  
                  return (
                    <div key={idx} className="bg-white border-2 border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 mb-1">{impact.label}</div>
                          <div className="text-sm text-gray-600">{impact.description}</div>
                        </div>
                        <div className="ml-4 text-right space-y-1">
                          {impact.scoreDelta !== 0 && (
                            <div className={`flex items-center gap-1 font-bold ${
                              impact.scoreDelta > 0 ? "text-green-600" : "text-red-600"
                            }`}>
                              {impact.scoreDelta > 0 ? (
                                <TrendingUp size={16} />
                              ) : (
                                <TrendingDown size={16} />
                              )}
                              {impact.scoreDelta > 0 ? "+" : ""}{impact.scoreDelta} pts
                            </div>
                          )}
                          <div className="text-xs text-indigo-600 font-semibold flex items-center gap-1 justify-end">
                            {hasManualLimit && <Shield size={10} />}
                            Límite: {fmt(impactLimit)}
                          </div>
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
                  );
                })}
              </div>
            </div>

            {/* Resultado final */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 rounded-xl p-6">
              <h4 className="font-bold text-gray-900 mb-4 text-center text-xl">📊 Resultado Proyectado</h4>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-2">Score Actual</div>
                  <div className={`inline-flex px-6 py-3 rounded-full text-3xl font-bold border-2 ${currentScoreClasses}`}>
                    {selectedClient.score_base || 0}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{getScoreLabel(selectedClient.score_base || 0)}</div>
                  <div className="text-xs font-semibold text-indigo-600 mt-1 flex items-center justify-center gap-1">
                    {hasManualLimit && <Shield size={10} />}
                    Límite: {fmt(currentLimit)}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-2">Score Proyectado</div>
                  <div className={`inline-flex px-6 py-3 rounded-full text-3xl font-bold border-2 ${finalScoreClasses}`}>
                    {finalScore}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{getScoreLabel(finalScore)}</div>
                  <div className="text-xs font-semibold text-indigo-600 mt-1 flex items-center justify-center gap-1">
                    {hasManualLimit && <Shield size={10} />}
                    Límite: {fmt(projectedLimit)}
                  </div>
                </div>
              </div>

              <div className="text-center mb-4">
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
                  
                  Score: {finalScore > (selectedClient.score_base || 0) ? "+" : ""}
                  {finalScore - (selectedClient.score_base || 0)} puntos
                </div>
                
                {!hasManualLimit && projectedLimit !== currentLimit && (
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm mt-2 ${
                    projectedLimit > currentLimit
                      ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-300"
                      : "bg-orange-100 text-orange-700 border-2 border-orange-300"
                  }`}>
                    {projectedLimit > currentLimit ? "↑" : "↓"} Límite: {fmt(Math.abs(projectedLimit - currentLimit))}
                  </div>
                )}
                
                {hasManualLimit && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm mt-2 bg-amber-100 text-amber-700 border-2 border-amber-300">
                    <Shield size={14} />
                    Límite manual se mantiene
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                    {fmt(projectedAvailable)}
                  </div>
                  <div className={`text-xs ${
                    projectedAvailable > currentAvailable ? "text-green-600" : "text-red-600"
                  }`}>
                    {projectedAvailable > currentAvailable ? "↑" : "↓"}
                    {fmt(Math.abs(projectedAvailable - currentAvailable))}
                  </div>
                </div>
              </div>
            </div>

            {/* Gráficas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Progresión del Score y Límite */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                <h5 className="font-bold text-gray-900 mb-3 text-center flex items-center justify-center gap-2">
                  📈 Evolución del Score y Límite
                  {hasManualLimit && <Shield className="text-amber-500" size={14} />}
                </h5>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={scoreProgression}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" fontSize={12} stroke="#6b7280" />
                    <YAxis yAxisId="left" domain={[300, 850]} fontSize={12} stroke="#6b7280" />
                    <YAxis yAxisId="right" orientation="right" fontSize={12} stroke="#6366f1" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="score"
                      stroke="#6366f1"
                      strokeWidth={3}
                      dot={{ fill: '#6366f1', r: 5 }}
                      activeDot={{ r: 7 }}
                      name="Score"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="limit"
                      stroke={hasManualLimit ? "#f59e0b" : "#10b981"}
                      strokeWidth={hasManualLimit ? 3 : 2}
                      strokeDasharray={hasManualLimit ? "0" : "5 5"}
                      dot={{ fill: hasManualLimit ? '#f59e0b' : '#10b981', r: 4 }}
                      name="Límite ($)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Progresión del Saldo y Disponible */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                <h5 className="font-bold text-gray-900 mb-3 text-center">💰 Saldo vs Disponible</h5>
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
                    <Bar dataKey="saldo" fill="#ef4444" radius={[8, 8, 0, 0]} name="Saldo" />
                    <Bar dataKey="disponible" fill="#10b981" radius={[8, 8, 0, 0]} name="Disponible" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Comparativa detallada */}
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
              <h5 className="font-bold text-gray-900 mb-6 text-center text-xl">
                🎯 Comparativa Detallada
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
                      <div className={`px-4 py-3 rounded-lg border-2 ${currentScoreClasses}`}>
                        <div className="text-3xl font-bold">{selectedClient.score_base || 0}</div>
                        <div className="text-xs mt-1">{getScoreLabel(selectedClient.score_base || 0)}</div>
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-2">Proyectado</div>
                      <div className={`px-4 py-3 rounded-lg border-2 ${finalScoreClasses}`}>
                        <div className="text-3xl font-bold">{finalScore}</div>
                        <div className="text-xs mt-1">{getScoreLabel(finalScore)}</div>
                      </div>
                    </div>
                  </div>

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

                {/* Límite de Crédito */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Award className="text-indigo-600" size={20} />
                      <span className="font-semibold text-gray-700">Límite de Crédito</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Cambio: {fmt(projectedLimit - currentLimit)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-3">
                      <div className="text-xs text-indigo-600 uppercase font-semibold mb-1">Actual</div>
                      <div className="text-2xl font-bold text-indigo-700">{fmt(currentLimit)}</div>
                    </div>
                    
                    <div className={`border-2 rounded-lg p-3 ${
                      projectedLimit > currentLimit
                        ? "bg-emerald-50 border-emerald-200"
                        : projectedLimit < currentLimit
                        ? "bg-orange-50 border-orange-200"
                        : "bg-gray-50 border-gray-200"
                    }`}>
                      <div className={`text-xs uppercase font-semibold mb-1 ${
                        projectedLimit > currentLimit
                          ? "text-emerald-600"
                          : projectedLimit < currentLimit
                          ? "text-orange-600"
                          : "text-gray-600"
                      }`}>
                        Proyectado
                      </div>
                      <div className={`text-2xl font-bold ${
                        projectedLimit > currentLimit
                          ? "text-emerald-700"
                          : projectedLimit < currentLimit
                          ? "text-orange-700"
                          : "text-gray-700"
                      }`}>
                        {fmt(projectedLimit)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Crédito Disponible */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="text-green-600" size={20} />
                      <span className="font-semibold text-gray-700">Crédito Disponible</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Cambio: {fmt(projectedAvailable - currentAvailable)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
                      <div className="text-xs text-green-600 uppercase font-semibold mb-1">Actual</div>
                      <div className="text-2xl font-bold text-green-700">
                        {fmt(currentAvailable)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {currentLimit > 0 ? Math.round((currentAvailable / currentLimit) * 100) : 0}% del límite
                      </div>
                    </div>
                    
                    <div className={`border-2 rounded-lg p-3 ${
                      projectedAvailable > currentAvailable
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-orange-50 border-orange-200"
                    }`}>
                      <div className={`text-xs uppercase font-semibold mb-1 ${
                        projectedAvailable > currentAvailable
                          ? "text-emerald-600"
                          : "text-orange-600"
                      }`}>
                        Proyectado
                      </div>
                      <div className={`text-2xl font-bold ${
                        projectedAvailable > currentAvailable
                          ? "text-emerald-700"
                          : "text-orange-700"
                      }`}>
                        {fmt(projectedAvailable)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {projectedLimit > 0 ? Math.round((projectedAvailable / projectedLimit) * 100) : 0}% del límite
                      </div>
                    </div>
                  </div>

                  {/* Medidor visual de disponibilidad */}
                  <div className="mt-3 bg-gray-100 rounded-full h-4 overflow-hidden border-2 border-gray-200">
                    <div className="flex h-full">
                      <div
                        className="bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
                        style={{
                          width: projectedLimit > 0 ? `${Math.min(100, ((finalSaldo / projectedLimit) * 100))}%` : "0%"
                        }}
                      />
                      <div
                        className="bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-500"
                        style={{
                          width: projectedLimit > 0 ? `${Math.max(0, 100 - ((finalSaldo / projectedLimit) * 100))}%` : "0%"
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Usado: {fmt(finalSaldo)}</span>
                    <span>Disponible: {fmt(projectedAvailable)}</span>
                  </div>
                </div>

                {/* Resumen del impacto */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-3 font-semibold">Resumen del Impacto</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Score</div>
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
                        <div className="text-xs text-gray-500 mb-1">Límite</div>
                        <div className={`text-lg font-bold ${
                          projectedLimit > currentLimit
                            ? "text-green-600"
                            : projectedLimit < currentLimit
                            ? "text-red-600"
                            : "text-gray-600"
                        }`}>
                          {projectedLimit > currentLimit ? "↑" : projectedLimit < currentLimit ? "↓" : "→"}
                          {fmt(Math.abs(projectedLimit - currentLimit))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Disponible</div>
                        <div className={`text-lg font-bold ${
                          projectedAvailable > currentAvailable
                            ? "text-green-600"
                            : "text-red-600"
                        }`}>
                          {projectedAvailable > currentAvailable ? "↑" : "↓"}
                          {fmt(Math.abs(projectedAvailable - currentAvailable))}
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
            <p className="text-sm text-gray-400 mt-2">Activa los checkboxes de arriba para ver el impacto en tiempo real</p>
          </div>
        )}
      </div>
    </div>
  );
}