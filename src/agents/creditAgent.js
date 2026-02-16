// src/agents/creditAgent.js
// ============================================================
// AGENTE DE CRÉDITO v2 — CON ACUERDOS DE PAGO
// ============================================================
// Integra:
// - Motor de scoring original (mejorado)
// - creditRulesEngine (reglas dinámicas R1-R6)
// - paymentAgreements (acuerdos de pago)
// ============================================================

import { supabase } from "../supabaseClient";
import {
  evaluarReglasCredito,
  generarPlanPago,
  buildPaymentAgreementSMS,
  CREDIT_RULES_CONFIG,
} from "../lib/creditRulesEngine";
import {
  getAcuerdosResumen,
  getDiasDeudaMasVieja,
  actualizarVencidas,
  isAgreementSystemAvailable,
} from "../lib/paymentAgreements";


// ========================= GET CLIENT HISTORY =========================

/**
 * Obtiene historial completo del cliente (ventas + pagos)
 */
export async function getClientHistory(clienteId) {
  if (!clienteId) {
    return {
      ventas: 0, totalVentas: 0,
      pagos: 0, totalPagos: 0,
      ventasDetalles: [], pagosDetalles: [],
      lastSaleDate: null, lastPaymentDate: null,
      deudas: [], deudasVencidas: [],
    };
  }

  try {
    // Ventas
    let ventas = [];
    for (const col of ["created_at", "fecha", "date"]) {
      try {
        const { data, error } = await supabase
          .from("ventas")
          .select(`id, ${col}, total, total_venta, total_pagado, cliente_id`)
          .eq("cliente_id", clienteId)
          .order(col, { ascending: false });
        if (!error && data?.length > 0) {
          ventas = data.map((v) => ({
            ...v,
            fecha: v[col],
            total: Number(v.total_venta || v.total || 0),
          }));
          break;
        }
      } catch { /* next */ }
    }

    // Pagos (intentar cxc_pagos y pagos)
    let pagos = [];
    try {
      const { data } = await supabase
        .from("pagos")
        .select("id, fecha_pago, monto, cliente_id")
        .eq("cliente_id", clienteId)
        .order("fecha_pago", { ascending: false });
      if (data?.length > 0) {
        pagos = data.map((p) => ({
          ...p,
          fecha: p.fecha_pago,
          monto_pagado: Number(p.monto || 0),
        }));
      }
    } catch { /* ignore */ }

    if (pagos.length === 0) {
      try {
        const { data } = await supabase
          .from("cxc_pagos")
          .select("id, fecha_pago, monto, cliente_id")
          .eq("cliente_id", clienteId)
          .order("fecha_pago", { ascending: false });
        if (data?.length > 0) {
          pagos = data.map((p) => ({
            ...p,
            fecha: p.fecha_pago,
            monto_pagado: Number(p.monto || 0),
          }));
        }
      } catch { /* ignore */ }
    }

    // Deudas (ventas con saldo pendiente)
    let deudas = [];
    try {
      const { data } = await supabase
        .from("ventas")
        .select("id, created_at, total_venta, total_pagado")
        .eq("cliente_id", clienteId)
        .gt("total_venta", 0);

      if (data) {
        deudas = data
          .filter((v) => {
            const pendiente = Number(v.total_venta || 0) - Number(v.total_pagado || 0);
            return pendiente > 0.01;
          })
          .map((v) => ({
            id: v.id,
            fecha_vencimiento: v.created_at,
            monto_pendiente: Number(v.total_venta || 0) - Number(v.total_pagado || 0),
            estado: "pendiente",
          }));
      }
    } catch { /* ignore */ }

    const hoy = new Date();
    const deudasVencidas = deudas.filter((d) => {
      if (!d.fecha_vencimiento) return false;
      return new Date(d.fecha_vencimiento) < hoy;
    });

    const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
    const totalPagos = pagos.reduce((s, p) => s + Number(p.monto_pagado || 0), 0);

    return {
      ventas: ventas.length,
      totalVentas,
      pagos: pagos.length,
      totalPagos,
      ventasDetalles: ventas,
      pagosDetalles: pagos,
      lastSaleDate: ventas[0]?.fecha || null,
      lastPaymentDate: pagos[0]?.fecha || null,
      deudas,
      deudasVencidas,
    };
  } catch (err) {
    console.error("Error en getClientHistory:", err);
    return {
      ventas: 0, totalVentas: 0,
      pagos: 0, totalPagos: 0,
      ventasDetalles: [], pagosDetalles: [],
      lastSaleDate: null, lastPaymentDate: null,
      deudas: [], deudasVencidas: [],
    };
  }
}


// ========================= ANÁLISIS HELPERS =========================

function analyzePaymentPattern(historialPagos, diasRetraso = 0, deudasVencidas = []) {
  if (historialPagos.length < 2) {
    if (diasRetraso === 0) {
      return { patron: "puntual", puntualidad: 95, descripcion: "New client — no delays", promedioDias: 0, consistencia: 90, fiabilidad: 95 };
    } else if (diasRetraso <= 5) {
      return { patron: "normal", puntualidad: 75, descripcion: `New client — ${diasRetraso} day slight delay`, promedioDias: diasRetraso, consistencia: 70, fiabilidad: 80 };
    } else if (diasRetraso <= 15) {
      return { patron: "tardio", puntualidad: 50, descripcion: `New client — ${diasRetraso} day delay`, promedioDias: diasRetraso, consistencia: 50, fiabilidad: 60 };
    } else {
      return { patron: "problematico", puntualidad: 25, descripcion: `New client — ${diasRetraso} day serious delay`, promedioDias: diasRetraso, consistencia: 30, fiabilidad: 30 };
    }
  }

  const fechas = historialPagos.map((p) => new Date(p.fecha)).sort((a, b) => a - b);
  let sumaIntervalos = 0;
  let pagosTarde = 0;

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
    const maxDias = Math.max(
      ...deudasVencidas.map((d) =>
        Math.floor((Date.now() - new Date(d.fecha_vencimiento).getTime()) / 86400000)
      )
    );
    if (maxDias > 60) puntualidad -= 30;
    else if (maxDias > 30) puntualidad -= 20;
    else if (maxDias > 15) puntualidad -= 10;
  }

  let patron, descripcion;
  if (promedioDias <= 7 && puntualidad > 85) { patron = "puntual"; descripcion = `Pays every ${promedioDias} days`; }
  else if (promedioDias <= 15 && puntualidad > 70) { patron = "normal"; descripcion = `Pays in ${promedioDias} days`; }
  else if (promedioDias <= 30 && puntualidad > 50) { patron = "tardio"; descripcion = `Late payer (${promedioDias} days)`; }
  else { patron = "problematico"; descripcion = `Problem payer (${promedioDias} days)`; }

  const consistencia = Math.max(30, Math.round(100 - (Math.abs(promedioDias - 15) / 15) * 50));
  const fiabilidad = Math.round((Math.max(0, puntualidad) + consistencia) / 2);

  return { patron, puntualidad: Math.max(0, puntualidad), descripcion, promedioDias, consistencia, fiabilidad };
}

function analyzeConsumptionTrend(ventas) {
  if (ventas.length < 4) return { tendencia: "insuficiente", cambio: 0, descripcion: "Not enough history" };

  const mitad = Math.floor(ventas.length / 2);
  const recientes = ventas.slice(0, mitad);
  const antiguas = ventas.slice(mitad);

  const promR = recientes.reduce((s, v) => s + Number(v.total), 0) / recientes.length;
  const promA = antiguas.reduce((s, v) => s + Number(v.total), 0) / antiguas.length;
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
      totalVencido += monto;
      diasAcum += dias;
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


// ========================= MOTOR DE SCORING =========================

/**
 * Evalúa crédito — AHORA INCLUYE ACUERDOS DE PAGO
 */
export function evaluateCredit({
  saldo = 0,
  limite = 0,
  diasRetraso = 0,
  montoVenta = 0,
  historialVentas = [],
  historialPagos = [],
  lastSaleDate = null,
  perfil = null,
  deudas = [],
  deudasVencidas = [],
  // 🆕 NUEVOS PARÁMETROS
  acuerdosResumen = null,
  reglasCredito = null,
}) {
  let score = 65;
  const disponible = Math.max(0, limite - saldo);
  const disponibleDespuesVenta = Math.max(0, disponible - montoVenta);
  const ratio = limite > 0 ? saldo / limite : 0;

  // Análisis
  const patronPago = analyzePaymentPattern(historialPagos, diasRetraso, deudasVencidas);
  const tendenciaConsumo = analyzeConsumptionTrend(historialVentas);
  const frecuencia = analyzeFrequency(historialVentas);
  const analisisDeudas = analyzeDebtAging(deudasVencidas);
  const promedioVentas = historialVentas.length > 0
    ? historialVentas.reduce((s, v) => s + Number(v.total), 0) / historialVentas.length
    : 0;
  const diasInactivo = calcDiasInactivo(lastSaleDate, historialVentas);

  // ==================== SCORING ====================

  // Días de retraso (40%)
  if (diasRetraso === 0 && analisisDeudas.totalVencido === 0) score += 30;
  else if (diasRetraso <= 5) score += 15;
  else if (diasRetraso <= 10) score += 5;
  else if (diasRetraso <= 30) score -= 20;
  else if (diasRetraso <= 60) score -= 40;
  else score -= 65;

  // Comportamiento de pago (45%)
  score += (patronPago.puntualidad / 100) * 25;
  score += (patronPago.consistencia / 100) * 15;
  score += (patronPago.fiabilidad / 100) * 5;

  // Uso de crédito (10%)
  if (ratio >= 1.5) score -= 80;
  else if (ratio >= 1.2) score -= 50;
  else if (ratio >= 1.0) score -= 20;
  else if (ratio >= 0.9) score -= 5;

  // Frecuencia (5%)
  const frecPuntos = { muy_alta: 5, alta: 4, normal: 3, baja: 0, muy_baja: -3, nueva: 3 };
  score += frecPuntos[frecuencia.frecuencia] || 0;

  // 🆕 PENALIZACIÓN POR ACUERDOS ROTOS
  if (acuerdosResumen) {
    const rotos = acuerdosResumen.acuerdos_rotos || 0;
    if (rotos >= 2) score -= 30;
    else if (rotos === 1) score -= 15;

    const cuotasVencidas = acuerdosResumen.cuotas_vencidas_total || 0;
    if (cuotasVencidas > 2) score -= 20;
    else if (cuotasVencidas > 0) score -= 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Regla de oro
  if (diasRetraso === 0 && analisisDeudas.totalVencido === 0 && ratio < 0.9) {
    score = Math.max(score, 80);
  }

  // Nivel
  let nivel, emoji, accion;
  if (score >= 80) { nivel = "bajo"; emoji = "🟢"; accion = "aprobar"; }
  else if (score >= 60) { nivel = "medio"; emoji = "🟡"; accion = "aprobar_con_cuidado"; }
  else if (score >= 40) { nivel = "alto"; emoji = "🟠"; accion = "pago_parcial"; }
  else { nivel = "critico"; emoji = "🔴"; accion = "rechazar"; }

  // Overrides
  if (ratio >= 1.5 || analisisDeudas.diasMaxVencido > 60) {
    nivel = "critico"; emoji = "🔴"; accion = "rechazar";
    score = Math.min(score, 25);
  }

  // 🆕 Override por crédito congelado
  if (reglasCredito?.nivel === "congelado") {
    nivel = "critico"; emoji = "🔴"; accion = "rechazar";
    score = Math.min(score, 10);
  }

  // Límite seguro
  let limiteSeguro = disponible * 0.7;
  if (patronPago.patron === "puntual" && diasRetraso === 0) limiteSeguro = disponible * 0.9;
  else if (patronPago.patron === "problematico" || diasRetraso > 30) limiteSeguro = disponible * 0.3;

  // 🆕 Ajustar límite seguro por penalizaciones de acuerdos
  if (reglasCredito) {
    limiteSeguro = Math.min(limiteSeguro, reglasCredito.disponibleEfectivo);
  }

  limiteSeguro = Math.max(0, Math.round(limiteSeguro));

  // 🆕 Monto máximo recomendado para venta
  const montoMaximoRecomendadoVenta = Math.min(
    limiteSeguro,
    reglasCredito?.disponibleEfectivo ?? limiteSeguro
  );

  // Recomendaciones
  const recomendaciones = [];

  // 🆕 Recomendaciones de acuerdos
  if (acuerdosResumen) {
    if (acuerdosResumen.acuerdos_rotos >= 2) {
      recomendaciones.push("🔒 CREDIT FROZEN — 2+ broken agreements. Cash only until all debt is paid.");
    } else if (acuerdosResumen.acuerdos_rotos === 1) {
      recomendaciones.push("⚠️ 1 broken agreement — credit limit reduced 25%");
    }

    if (acuerdosResumen.cuotas_vencidas_total > 0) {
      recomendaciones.push(`🚨 ${acuerdosResumen.cuotas_vencidas_total} overdue installment(s) — collect payment first`);
    }

    if (acuerdosResumen.proxima_cuota_fecha) {
      const fecha = new Date(acuerdosResumen.proxima_cuota_fecha).toLocaleDateString("en-US");
      recomendaciones.push(`📅 Next installment: $${Number(acuerdosResumen.proxima_cuota_monto || 0).toFixed(2)} due ${fecha}`);
    }
  }

  // 🆕 Recomendaciones de reglas
  if (reglasCredito) {
    for (const adv of reglasCredito.advertencias || []) {
      if (!recomendaciones.includes(adv)) recomendaciones.push(adv);
    }

    if (reglasCredito.pagoMinimoTotal > 0) {
      recomendaciones.push(`💰 Minimum payment required: $${reglasCredito.pagoMinimoTotal.toFixed(2)}`);
    }
  }

  // Recomendaciones genéricas
  if (analisisDeudas.totalVencido > 0) {
    recomendaciones.push(`🚨 Overdue debt: $${analisisDeudas.totalVencido.toFixed(2)} (${analisisDeudas.diasMaxVencido} days)`);
  }

  if (nivel === "bajo" && diasRetraso === 0) {
    recomendaciones.push("✅ Reliable client — approve sale");
  }

  if (frecuencia.frecuencia === "muy_baja" && diasInactivo > 60) {
    recomendaciones.push(`😴 Inactive ${diasInactivo} days — consider reactivation`);
  }

  if (tendenciaConsumo.tendencia === "creciente" && patronPago.patron !== "problematico") {
    recomendaciones.push("📈 Growing consumption — good client");
  }

  return {
    score, nivel, emoji, accion,
    disponible: disponibleDespuesVenta,
    limiteSeguro,
    montoMaximoRecomendadoVenta,
    ratio, promedioVentas, diasInactivo,
    diasRetraso,
    montoVenta,
    patronPago, tendenciaConsumo, frecuencia, analisisDeudas,
    recomendaciones,
    // 🆕 Datos de acuerdos
    acuerdosResumen,
    reglasCredito,
  };
}


// ========================= RUN CREDIT AGENT (PRINCIPAL) =========================

/**
 * Ejecuta análisis completo incluyendo acuerdos de pago
 * @param {string} clienteId
 * @param {number} montoVenta - Total de la venta actual
 * @param {number} [montoPagadoAhora] - Lo que va a pagar ahora
 * @returns {Promise<Object>}
 */
export async function runCreditAgent(clienteId, montoVenta = 0, montoPagadoAhora = 0) {
  if (!clienteId) {
    return { error: "Cliente requerido" };
  }

  try {
    // 1) Historial
    const historial = await getClientHistory(clienteId);

    // 2) Perfil CxC (desde la vista)
    let saldo = 0, limite = 0, diasRetraso = 0;
    try {
      const { data: det } = await supabase
        .from("v_cxc_cliente_detalle")
        .select("saldo, limite_politica, credito_disponible")
        .eq("cliente_id", clienteId)
        .maybeSingle();

      if (det) {
        saldo = Number(det.saldo ?? 0);
        limite = Number(det.limite_politica ?? 0);
      }

      // Límite manual?
      const { data: cli } = await supabase
        .from("clientes")
        .select("limite_manual")
        .eq("id", clienteId)
        .maybeSingle();

      if (cli?.limite_manual != null) {
        limite = Number(cli.limite_manual);
      }
    } catch { /* use defaults */ }

    // 3) 🆕 Acuerdos de pago (si el sistema está disponible)
    let acuerdosResumen = null;
    let diasDeuda = 0;
    let reglasCredito = null;

    const agreementAvailable = await isAgreementSystemAvailable();

    if (agreementAvailable) {
      // Actualizar vencidas primero
      await actualizarVencidas(clienteId);

      acuerdosResumen = await getAcuerdosResumen(clienteId);
      diasDeuda = await getDiasDeudaMasVieja(clienteId);

      // Evaluar reglas de crédito
      reglasCredito = evaluarReglasCredito({
        montoVenta,
        saldoActual: saldo,
        limiteBase: limite,
        diasDeuda,
        acuerdos: acuerdosResumen,
        montoPagadoAhora,
        historial: {
          totalVentas: historial.totalVentas,
          totalPagos: historial.totalPagos,
          numVentas: historial.ventas,
          numPagos: historial.pagos,
        },
      });
    }

    // 4) Scoring
    const resultado = evaluateCredit({
      saldo,
      limite,
      diasRetraso,
      montoVenta,
      historialVentas: historial.ventasDetalles,
      historialPagos: historial.pagosDetalles,
      lastSaleDate: historial.lastSaleDate,
      deudas: historial.deudas,
      deudasVencidas: historial.deudasVencidas,
      acuerdosResumen,
      reglasCredito,
    });

    return resultado;
  } catch (err) {
    console.error("Error en runCreditAgent:", err);
    return {
      error: err.message,
      score: 65, nivel: "medio", emoji: "🟡", accion: "aprobar_con_cuidado",
      recomendaciones: ["Error evaluating — review manually"],
    };
  }
}