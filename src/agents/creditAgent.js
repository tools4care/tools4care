// src/agents/creditAgent.js
// ============================================================
// AGENTE DE CRÉDITO v3 — CON PPR + ACUERDOS DE PAGO
// ============================================================

import { supabase } from "../supabaseClient";
import {
  evaluarReglasCredito,
  generarPlanPago,
  buildPaymentAgreementSMS,
  CREDIT_RULES_CONFIG,
  calcularPPR,
  calcularPaymentStreak,
  calcularPPR30Dias,
  calcularLimiteSugerido,
} from "../lib/creditRulesEngine";
import {
  getAcuerdosResumen,
  getDiasDeudaMasVieja,
  actualizarVencidas,
  isAgreementSystemAvailable,
} from "../lib/paymentAgreements";


// ========================= GET CLIENT HISTORY =========================

export async function getClientHistory(clienteId) {
  if (!clienteId) {
    return { ventas: 0, totalVentas: 0, pagos: 0, totalPagos: 0, ventasDetalles: [], pagosDetalles: [], lastSaleDate: null, lastPaymentDate: null, deudas: [], deudasVencidas: [] };
  }

  try {
    let ventas = [];
    for (const col of ["created_at", "fecha", "date"]) {
      try {
        const { data, error } = await supabase.from("ventas").select(`id, ${col}, total, total_venta, total_pagado, cliente_id`).eq("cliente_id", clienteId).order(col, { ascending: false });
        if (!error && data?.length > 0) {
          ventas = data.map((v) => ({ ...v, fecha: v[col], total: Number(v.total_venta || v.total || 0) }));
          break;
        }
      } catch { /* next */ }
    }

    let pagos = [];
    try {
      const { data } = await supabase.from("pagos").select("id, fecha_pago, monto, cliente_id").eq("cliente_id", clienteId).order("fecha_pago", { ascending: false });
      if (data?.length > 0) {
        pagos = data.map((p) => ({ ...p, fecha: p.fecha_pago, monto_pagado: Number(p.monto || 0) }));
      }
    } catch { /* ignore */ }

    if (pagos.length === 0) {
      try {
        const { data } = await supabase.from("cxc_pagos").select("id, fecha_pago, monto, cliente_id").eq("cliente_id", clienteId).order("fecha_pago", { ascending: false });
        if (data?.length > 0) {
          pagos = data.map((p) => ({ ...p, fecha: p.fecha_pago, monto_pagado: Number(p.monto || 0) }));
        }
      } catch { /* ignore */ }
    }

    let deudas = [];
    try {
      const { data } = await supabase.from("ventas").select("id, created_at, total_venta, total_pagado").eq("cliente_id", clienteId).gt("total_venta", 0);
      if (data) {
        deudas = data.filter((v) => Number(v.total_venta || 0) - Number(v.total_pagado || 0) > 0.01).map((v) => ({
          id: v.id, fecha_vencimiento: v.created_at, monto_pendiente: Number(v.total_venta || 0) - Number(v.total_pagado || 0), estado: "pendiente",
        }));
      }
    } catch { /* ignore */ }

    const hoy = new Date();
    const deudasVencidas = deudas.filter((d) => d.fecha_vencimiento && new Date(d.fecha_vencimiento) < hoy);
    const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
    const totalPagos = pagos.reduce((s, p) => s + Number(p.monto_pagado || 0), 0);

    return {
      ventas: ventas.length, totalVentas, pagos: pagos.length, totalPagos,
      ventasDetalles: ventas, pagosDetalles: pagos,
      lastSaleDate: ventas[0]?.fecha || null, lastPaymentDate: pagos[0]?.fecha || null,
      deudas, deudasVencidas,
    };
  } catch (err) {
    console.error("Error en getClientHistory:", err);
    return { ventas: 0, totalVentas: 0, pagos: 0, totalPagos: 0, ventasDetalles: [], pagosDetalles: [], lastSaleDate: null, lastPaymentDate: null, deudas: [], deudasVencidas: [] };
  }
}


// ========================= ANÁLISIS HELPERS =========================

function analyzePaymentPattern(historialPagos, diasRetraso = 0, deudasVencidas = []) {
  if (historialPagos.length < 2) {
    if (diasRetraso === 0) return { patron: "puntual", puntualidad: 95, descripcion: "New client", promedioDias: 0, consistencia: 90, fiabilidad: 95 };
    else if (diasRetraso <= 5) return { patron: "normal", puntualidad: 75, descripcion: `New - ${diasRetraso}d delay`, promedioDias: diasRetraso, consistencia: 70, fiabilidad: 80 };
    else if (diasRetraso <= 15) return { patron: "tardio", puntualidad: 50, descripcion: `New - ${diasRetraso}d delay`, promedioDias: diasRetraso, consistencia: 50, fiabilidad: 60 };
    else return { patron: "problematico", puntualidad: 25, descripcion: `New - ${diasRetraso}d delay`, promedioDias: diasRetraso, consistencia: 30, fiabilidad: 30 };
  }

  const fechas = historialPagos.map((p) => new Date(p.fecha)).sort((a, b) => a - b);
  let sumaIntervalos = 0, pagosTarde = 0;
  for (let i = 1; i < fechas.length; i++) {
    const dias = (fechas[i] - fechas[i - 1]) / 86400000;
    sumaIntervalos += dias;
    if (dias > 15) pagosTarde++;
  }

  const promedioDias = Math.round(sumaIntervalos / (fechas.length - 1));
  const pctTarde = pagosTarde / (fechas.length - 1);

  let puntualidad = 100;
  if (pctTarde > 0.5) puntualidad -= 40;
  else if (pctTarde > 0.3) puntualidad -= 25;
  else if (pctTarde > 0.1) puntualidad -= 15;
  else if (pctTarde > 0) puntualidad -= 5;

  if (deudasVencidas.length > 0) {
    const maxDias = Math.max(...deudasVencidas.map((d) => Math.floor((Date.now() - new Date(d.fecha_vencimiento).getTime()) / 86400000)));
    if (maxDias > 60) puntualidad -= 30;
    else if (maxDias > 30) puntualidad -= 20;
    else if (maxDias > 15) puntualidad -= 10;
  }

  let patron, descripcion;
  if (promedioDias <= 7 && puntualidad > 85) { patron = "puntual"; descripcion = `Pays every ${promedioDias} days`; }
  else if (promedioDias <= 15 && puntualidad > 70) { patron = "normal"; descripcion = `Pays in ${promedioDias} days`; }
  else if (promedioDias <= 30 && puntualidad > 50) { patron = "tardio"; descripcion = `Late payer (${promedioDias}d)`; }
  else { patron = "problematico"; descripcion = `Problem payer (${promedioDias}d)`; }

  const consistencia = Math.max(30, Math.round(100 - (Math.abs(promedioDias - 15) / 15) * 50));
  const fiabilidad = Math.round((Math.max(0, puntualidad) + consistencia) / 2);
  return { patron, puntualidad: Math.max(0, puntualidad), descripcion, promedioDias, consistencia, fiabilidad };
}

function analyzeConsumptionTrend(ventas) {
  if (ventas.length < 4) return { tendencia: "insuficiente", cambio: 0, descripcion: "Not enough history" };
  const mitad = Math.floor(ventas.length / 2);
  const promR = ventas.slice(0, mitad).reduce((s, v) => s + Number(v.total), 0) / mitad;
  const promA = ventas.slice(mitad).reduce((s, v) => s + Number(v.total), 0) / (ventas.length - mitad);
  const cambio = promA > 0 ? ((promR - promA) / promA) * 100 : 0;

  if (cambio > 20) return { tendencia: "creciente", cambio, descripcion: `Growing (+${cambio.toFixed(0)}%)`, promedioReciente: promR, promedioAntiguo: promA };
  if (cambio < -20) return { tendencia: "decreciente", cambio, descripcion: `Declining (${cambio.toFixed(0)}%)`, promedioReciente: promR, promedioAntiguo: promA };
  return { tendencia: "estable", cambio, descripcion: "Stable", promedioReciente: promR, promedioAntiguo: promA };
}

function analyzeFrequency(ventas) {
  if (ventas.length === 0) return { frecuencia: "nueva", diasEntreFechas: null, descripcion: "New client" };
  const fechas = ventas.map((v) => new Date(v.fecha)).sort((a, b) => a - b);
  if (fechas.length < 2) return { frecuencia: "nueva", diasEntreFechas: null, descripcion: "Single purchase" };
  let sum = 0;
  for (let i = 1; i < fechas.length; i++) sum += (fechas[i] - fechas[i - 1]) / 86400000;
  const dias = Math.round(sum / (fechas.length - 1));
  if (dias <= 7) return { frecuencia: "muy_alta", diasEntreFechas: dias, descripcion: "Weekly buyer" };
  if (dias <= 15) return { frecuencia: "alta", diasEntreFechas: dias, descripcion: "Biweekly buyer" };
  if (dias <= 30) return { frecuencia: "normal", diasEntreFechas: dias, descripcion: "Monthly buyer" };
  if (dias <= 60) return { frecuencia: "baja", diasEntreFechas: dias, descripcion: "Occasional buyer" };
  return { frecuencia: "muy_baja", diasEntreFechas: dias, descripcion: "Sporadic buyer" };
}

function analyzeDebtAging(deudasVencidas) {
  if (!deudasVencidas?.length) return { totalVencido: 0, diasMaxVencido: 0, promedioVencido: 0, deudasCriticas: 0, montoCritico: 0 };
  const hoy = Date.now();
  let totalVencido = 0, diasMax = 0, diasAcum = 0, criticas = 0, montoCrit = 0;
  for (const d of deudasVencidas) {
    const dias = Math.floor((hoy - new Date(d.fecha_vencimiento).getTime()) / 86400000);
    const monto = Number(d.monto_pendiente || 0);
    if (dias > 0) {
      totalVencido += monto; diasAcum += dias;
      if (dias > diasMax) diasMax = dias;
      if (dias > 30 || monto > 200) { criticas++; montoCrit += monto; }
    }
  }
  return { totalVencido, diasMaxVencido: diasMax, promedioVencido: deudasVencidas.length ? diasAcum / deudasVencidas.length : 0, deudasCriticas: criticas, montoCritico: montoCrit };
}

function calcDiasInactivo(lastSaleDate, ventas) {
  const fecha = lastSaleDate ? new Date(lastSaleDate) : ventas.length ? new Date(ventas[0].fecha) : null;
  if (!fecha || isNaN(fecha)) return 0;
  return Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 86400000));
}


// ========================= BALANCE TREND =========================

function calcularTendenciaBalance(ventas, pagos) {
  // Calcular balance en puntos del tiempo para ver si sube o baja
  if (ventas.length < 3) return { tendencia: "neutral", cambioBalance: 0 };

  // Simular balance en últimas 5 visitas
  const recientes = ventas.slice(0, 5);
  let balances = [];
  let bal = 0;

  // Reconstruir balance de la más antigua a la más reciente
  for (let i = recientes.length - 1; i >= 0; i--) {
    const v = recientes[i];
    bal += Number(v.total || 0);

    // Buscar pagos cercanos a esta venta
    const fv = new Date(v.fecha);
    const pagosEnPeriodo = pagos.filter(p => {
      const fp = new Date(p.fecha);
      const diff = Math.abs(fp - fv) / 86400000;
      return diff <= 10;
    });

    for (const p of pagosEnPeriodo) {
      bal -= Number(p.monto_pagado || 0);
    }
    balances.push(bal);
  }

  if (balances.length < 2) return { tendencia: "neutral", cambioBalance: 0 };

  // Comparar primera mitad vs segunda mitad
  const mitad = Math.floor(balances.length / 2);
  const promPrimera = balances.slice(0, mitad).reduce((s, b) => s + b, 0) / mitad;
  const promSegunda = balances.slice(mitad).reduce((s, b) => s + b, 0) / (balances.length - mitad);

  const cambio = promPrimera > 0 ? ((promSegunda - promPrimera) / promPrimera) * 100 : 0;

  if (cambio > 15) return { tendencia: "subiendo", cambioBalance: cambio };
  if (cambio < -15) return { tendencia: "bajando", cambioBalance: cambio };
  return { tendencia: "neutral", cambioBalance: cambio };
}


// ========================= SCORING v3 =========================

export function evaluateCredit({
  saldo = 0, limite = 0, diasRetraso = 0, montoVenta = 0,
  historialVentas = [], historialPagos = [], lastSaleDate = null,
  deudas = [], deudasVencidas = [],
  acuerdosResumen = null, reglasCredito = null,
  pprData = null,
  streakData = null,   // nuevo: racha de pagos recientes
  ppr30Data = null,    // nuevo: PPR últimos 30 días corridos
  limiteSugeridoData = null, // nuevo: límite dinámico sugerido
}) {
  let score = 50; // base más neutro
  const disponible = Math.max(0, limite - saldo);
  const disponibleDespuesVenta = Math.max(0, disponible - montoVenta);
  const ratio = limite > 0 ? saldo / limite : 0;

  const patronPago = analyzePaymentPattern(historialPagos, diasRetraso, deudasVencidas);
  const tendenciaConsumo = analyzeConsumptionTrend(historialVentas);
  const frecuencia = analyzeFrequency(historialVentas);
  const analisisDeudas = analyzeDebtAging(deudasVencidas);
  const promedioVentas = historialVentas.length > 0 ? historialVentas.reduce((s, v) => s + Number(v.total), 0) / historialVentas.length : 0;
  const diasInactivo = calcDiasInactivo(lastSaleDate, historialVentas);
  const tendenciaBalance = calcularTendenciaBalance(historialVentas, historialPagos);

  // ==================== SCORING v3 ====================

  // 1. PPR por visitas (30 puntos) — sin cambio
  if (pprData) {
    const ppr = pprData.ppr;
    if (ppr >= 1.2) score += 30;
    else if (ppr >= 1.0) score += 22;
    else if (ppr >= 0.8) score += 15;
    else if (ppr >= 0.5) score += 5;
    else score -= 10;
  } else {
    score += 15;
  }

  // 1b. PAYMENT STREAK — hasta +15 pts
  // Premia clientes que pagan frecuente aunque sea poco (van-based POS)
  if (streakData) {
    score += streakData.score; // 0, +10 o +15

    // Si el PPR por visitas dice "peligro" pero el PPR 30 días dice "estable/bueno",
    // significa que el cliente está pagando entre visitas — suavizar la penalización
    if (pprData?.clasificacion === "peligro" && ppr30Data &&
        (ppr30Data.clasificacion === "estable" || ppr30Data.clasificacion === "bueno" || ppr30Data.clasificacion === "excelente")) {
      score += 8; // corrección por contexto: PPR-visitas penalizó de más
    }
  }

  // 2. Cumplimiento de cuotas (25 puntos)
  if (acuerdosResumen) {
    const completados = acuerdosResumen.acuerdos_completados || 0;
    const total = completados + (acuerdosResumen.acuerdos_activos || 0) + (acuerdosResumen.acuerdos_rotos || 0);
    if (total > 0) {
      const pctCompletado = completados / total;
      score += Math.round(pctCompletado * 20);
    } else {
      score += 12; // sin acuerdos = neutro
    }

    // Cuotas vencidas penalizan fuerte
    const cuotasVencidas = acuerdosResumen.cuotas_vencidas_total || 0;
    score -= cuotasVencidas * 8;

    // Acuerdos rotos penalizan
    const rotos = acuerdosResumen.acuerdos_rotos || 0;
    score -= rotos * 12;
  } else {
    score += 12;
  }

  // 3. Tendencia de balance (20 puntos)
  if (tendenciaBalance.tendencia === "bajando") score += 20;
  else if (tendenciaBalance.tendencia === "neutral") score += 10;
  else score -= 5; // balance subiendo

  // 4. Frecuencia y antigüedad (15 puntos)
  const frecPuntos = { muy_alta: 15, alta: 12, normal: 8, baja: 3, muy_baja: 0, nueva: 5 };
  score += frecPuntos[frecuencia.frecuencia] || 0;

  // 5. Uso de crédito (10 puntos)
  if (ratio < 0.5) score += 10;
  else if (ratio < 0.8) score += 5;
  else if (ratio < 1.0) score += 0;
  else if (ratio < 1.2) score -= 10;
  else score -= 25;

  // PPR tendencia bonus/penalty
  if (pprData?.tendencia === "mejorando") score += 5;
  else if (pprData?.tendencia === "empeorando") score -= 5;

  // Inactividad con deuda
  if (diasInactivo >= 30 && saldo > 0) score -= 10;
  if (diasInactivo >= 60 && saldo > 0) score -= 10;

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Regla de oro: si paga bien y no tiene problemas, mínimo 80
  if (pprData && pprData.ppr >= 1.0 && (!acuerdosResumen || (acuerdosResumen.cuotas_vencidas_total === 0 && acuerdosResumen.acuerdos_rotos === 0)) && ratio < 0.9) {
    score = Math.max(score, 80);
  }

  // Override por congelamiento
  if (reglasCredito?.nivel === "congelado") {
    score = Math.min(score, 10);
  }

  // Nivel
  let nivel, emoji, accion, nivelRiesgo;
  if (score >= 80) { nivel = "bajo"; nivelRiesgo = "bajo"; emoji = "🟢"; accion = "aprobar"; }
  else if (score >= 60) { nivel = "medio"; nivelRiesgo = "medio"; emoji = "🟡"; accion = "aprobar_con_cuidado"; }
  else if (score >= 40) { nivel = "alto"; nivelRiesgo = "alto"; emoji = "🟠"; accion = "pago_parcial"; }
  else { nivel = "critico"; nivelRiesgo = "alto"; emoji = "🔴"; accion = "rechazar"; }

  if (ratio >= 1.5 || analisisDeudas.diasMaxVencido > 60) {
    nivel = "critico"; nivelRiesgo = "alto"; emoji = "🔴"; accion = "rechazar";
    score = Math.min(score, 25);
  }

  // Límite seguro
  let limiteSeguro = disponible * 0.7;
  if (pprData && pprData.ppr >= 1.0) limiteSeguro = disponible * 0.9;
  else if (pprData && pprData.ppr < 0.5) limiteSeguro = disponible * 0.3;
  if (reglasCredito) limiteSeguro = Math.min(limiteSeguro, reglasCredito.disponibleEfectivo);
  limiteSeguro = Math.max(0, Math.round(limiteSeguro));

  const montoMaximoRecomendadoVenta = Math.min(limiteSeguro, reglasCredito?.disponibleEfectivo ?? limiteSeguro);

  // Descripción del nivel
  let descripcion = "";
  let descripcionNivel = "";
  if (score >= 80) { descripcion = "Excellent client - reliable payment history"; descripcionNivel = "Low Risk - Excellent Client"; }
  else if (score >= 60) { descripcion = "Good client - monitor payment patterns"; descripcionNivel = "Medium Risk - Good Client"; }
  else if (score >= 40) { descripcion = "Caution - require partial payment upfront"; descripcionNivel = "High Risk - Require Payment"; }
  else { descripcion = "High risk - cash only recommended"; descripcionNivel = "Critical Risk - Cash Only"; }

  // Recomendaciones
  const recomendaciones = [];

  // Health Score y estado del límite
  const hs = reglasCredito?.healthScore;
  if (hs !== undefined) {
    if (hs >= 90) {
      recomendaciones.push(`⭐ Health ${hs}/100 — Cliente ejemplar. Considera AUMENTAR el límite de crédito.`);
    } else if (hs >= 75) {
      recomendaciones.push(`🟢 Health ${hs}/100 — Buen pagador. Mantener o aumentar límite.`);
    } else if (hs >= 60) {
      recomendaciones.push(`🟡 Health ${hs}/100 — Estable. Monitorear tendencia.`);
    } else if (hs >= 45) {
      recomendaciones.push(`🟠 Health ${hs}/100 — Atrasado. Límite reducido 20%. Exigir pago mínimo.`);
    } else if (hs >= 30) {
      recomendaciones.push(`🔴 Health ${hs}/100 — Riesgo. Límite reducido 40%. Solo ventas pequeñas.`);
    } else if (hs >= 15) {
      recomendaciones.push(`🚨 Health ${hs}/100 — Crítico. Límite reducido 65%. Requiere pago antes de vender.`);
    } else {
      recomendaciones.push(`⛔ Health ${hs}/100 — Near-freeze. Solo deuda vieja. No extender crédito.`);
    }
  }

  // PPR-based recommendations
  if (pprData) {
    const pprEfectivo = ppr30Data?.ppr30 ?? pprData.ppr;
    if (pprEfectivo < 0.5) {
      recomendaciones.push(`🔴 PPR ${pprEfectivo.toFixed(2)} — Paga solo ${Math.round(pprEfectivo * 100)}% de lo que compra. Deuda creciendo.`);
    } else if (pprEfectivo < 0.8) {
      recomendaciones.push(`🟠 PPR ${pprEfectivo.toFixed(2)} — Paga menos de lo que compra. Exigir más en cada visita.`);
    } else if (pprEfectivo >= 1.2) {
      recomendaciones.push(`⭐ PPR ${pprEfectivo.toFixed(2)} — Paga MÁS de lo que compra. Excelente comportamiento.`);
    } else if (pprEfectivo >= 1.0) {
      recomendaciones.push(`✅ PPR ${pprEfectivo.toFixed(2)} — Paga todo lo que compra. Buen cliente.`);
    }

    if (pprData.tendencia === "empeorando") {
      recomendaciones.push("📉 Tendencia empeorando — monitorear en próximas visitas");
    } else if (pprData.tendencia === "mejorando") {
      recomendaciones.push("📈 Tendencia mejorando — señal de recuperación");
    }
  }

  // Streak recommendations
  if (streakData) {
    if (streakData.pagoUltimos3) {
      recomendaciones.push(`🔥 Pagó en últimos 3 días ($${streakData.totalPagadoUltimos7.toFixed(2)} esta semana) — constancia premiada`);
    } else if (streakData.pagoUltimos7) {
      recomendaciones.push(`✅ Pagó en últimos 7 días ($${streakData.totalPagadoUltimos7.toFixed(2)} esta semana)`);
    }
  }

  // Balance trend
  if (tendenciaBalance.tendencia === "subiendo") {
    recomendaciones.push("⬆️ Balance trending up — enforce minimum payments");
  } else if (tendenciaBalance.tendencia === "bajando") {
    recomendaciones.push("⬇️ Balance trending down — client is reducing debt");
  }

  // Agreement recommendations
  if (acuerdosResumen) {
    if (acuerdosResumen.acuerdos_rotos >= 2) {
      recomendaciones.push("🔒 CREDIT FROZEN — 2+ broken agreements. Cash only.");
    } else if (acuerdosResumen.acuerdos_rotos === 1) {
      recomendaciones.push("⚠️ 1 broken agreement — credit limit reduced");
    }
    if (acuerdosResumen.cuotas_vencidas_total > 0) {
      recomendaciones.push(`🚨 ${acuerdosResumen.cuotas_vencidas_total} overdue installment(s) — collect first`);
    }
    if (acuerdosResumen.proxima_cuota_fecha) {
      const fecha = new Date(acuerdosResumen.proxima_cuota_fecha).toLocaleDateString("en-US");
      recomendaciones.push(`📅 Next installment: $${Number(acuerdosResumen.proxima_cuota_monto || 0).toFixed(2)} due ${fecha}`);
    }
  }

  // Minimum payment
  if (reglasCredito?.pagoMinimoTotal > 0) {
    recomendaciones.push(`💰 Minimum payment: $${reglasCredito.pagoMinimoTotal.toFixed(2)}`);
  }

  if (nivel === "bajo" && diasRetraso === 0) {
    recomendaciones.push("✅ Reliable client — approve sale");
  }

  if (tendenciaConsumo.tendencia === "creciente" && patronPago.patron !== "problematico") {
    recomendaciones.push("📈 Growing consumption — good client");
  }

  return {
    score, nivel, nivelRiesgo, emoji, accion, descripcion, descripcionNivel,
    decision: accion === "aprobar" ? "aprobar" : accion === "aprobar_con_cuidado" ? "aprobar" : "revisar",
    disponible: disponibleDespuesVenta, limiteSeguro, montoMaximoRecomendadoVenta,
    ratio, promedioVentas, diasInactivo, diasRetraso, montoVenta,
    patronPago, tendenciaConsumo, frecuencia, analisisDeudas, tendenciaBalance,
    recomendaciones,
    // PPR
    ppr: pprData,
    ppr30: ppr30Data,
    // Racha de pagos
    streak: streakData,
    // Límite sugerido para admin
    limiteSugerido: limiteSugeridoData,
    // Acuerdos
    acuerdosResumen, reglasCredito,
    // Alias for CreditRiskPanel
    montoMaximo: reglasCredito?.montoMaximo ?? montoMaximoRecomendadoVenta,
  };
}


// ========================= RUN CREDIT AGENT =========================

export async function runCreditAgent(clienteId, montoVenta = 0, montoPagadoAhora = 0) {
  if (!clienteId) return { error: "Cliente requerido" };

  try {
    const historial = await getClientHistory(clienteId);

    let saldo = 0, limite = 0, diasRetraso = 0;
    try {
      const { data: det } = await supabase.from("v_cxc_cliente_detalle").select("saldo, limite_politica, credito_disponible").eq("cliente_id", clienteId).maybeSingle();
      if (det) { saldo = Number(det.saldo ?? 0); limite = Number(det.limite_politica ?? 0); }
      const { data: cli } = await supabase.from("clientes").select("limite_manual").eq("id", clienteId).maybeSingle();
      if (cli?.limite_manual != null) limite = Number(cli.limite_manual);
    } catch { /* defaults */ }

    // PPR por visitas (original — sin cambio)
    const pprData = calcularPPR(historial.ventasDetalles, historial.pagosDetalles);
    const diasInactivo = calcDiasInactivo(historial.lastSaleDate, historial.ventasDetalles);

    // NUEVO: PPR 30 días corridos y racha de pagos
    const ppr30Data   = calcularPPR30Dias(historial.ventasDetalles, historial.pagosDetalles);
    const streakData  = calcularPaymentStreak(historial.pagosDetalles);
    const limiteSugeridoData = calcularLimiteSugerido(historial.ventasDetalles, pprData, streakData);

    // Acuerdos
    let acuerdosResumen = null, diasDeuda = 0, reglasCredito = null;
    const agreementAvailable = await isAgreementSystemAvailable();

    if (agreementAvailable) {
      await actualizarVencidas(clienteId);
      acuerdosResumen = await getAcuerdosResumen(clienteId);
      diasDeuda = await getDiasDeudaMasVieja(clienteId);

      reglasCredito = evaluarReglasCredito({
        montoVenta, saldoActual: saldo, limiteBase: limite, diasDeuda,
        acuerdos: acuerdosResumen, montoPagadoAhora,
        historial: { totalVentas: historial.totalVentas, totalPagos: historial.totalPagos, numVentas: historial.ventas, numPagos: historial.pagos },
        ventasDetalle: historial.ventasDetalles,
        pagosDetalle: historial.pagosDetalles,
        diasInactivo,
      });

      // ====== RUTA DE REHABILITACIÓN ======
      // Si está congelado (2+ acuerdos rotos) PERO ha pagado en los últimos 7 días
      // y el PPR30 muestra señales de recuperación → modo PROBATORIO (50% del límite)
      // El 50% de compra nueva NUNCA cambia — solo afecta el límite disponible
      if (
        reglasCredito?.nivel === "congelado" &&
        streakData.pagoUltimos7 &&
        ppr30Data.clasificacion !== "peligro"
      ) {
        const limiteProba = Math.round(limite * 0.5 * 100) / 100;
        const disponibleProba = Math.max(0, Math.round((limiteProba - saldo) * 100) / 100);

        reglasCredito = {
          ...reglasCredito,
          nivel: "probatorio",
          limiteEfectivo: limiteProba,
          disponibleEfectivo: disponibleProba,
          montoMaximo: disponibleProba,
          permitido: true,
          requiereExcepcion: true, // sigue requiriendo excepción pero no bloquea
          advertencias: [
            "🟡 MODO PROBATORIO — Crédito congelado pero cliente está pagando activamente.",
            `Límite reducido al 50%: $${limiteProba.toFixed(2)}. Regla 50% compra nueva se mantiene.`,
            "Para rehabilitación completa: liquidar deuda total.",
          ],
        };
      }
    }

    const resultado = evaluateCredit({
      saldo, limite, diasRetraso, montoVenta,
      historialVentas: historial.ventasDetalles,
      historialPagos: historial.pagosDetalles,
      lastSaleDate: historial.lastSaleDate,
      deudas: historial.deudas, deudasVencidas: historial.deudasVencidas,
      acuerdosResumen, reglasCredito, pprData,
      streakData, ppr30Data, limiteSugeridoData,
    });

    return resultado;
  } catch (err) {
    console.error("Error en runCreditAgent:", err);
    return {
      error: err.message, score: 50, nivel: "medio", nivelRiesgo: "medio", emoji: "🟡",
      accion: "aprobar_con_cuidado", decision: "revisar",
      recomendaciones: ["Error evaluating — review manually"],
    };
  }
}