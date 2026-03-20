// src/lib/creditRulesEngine.js
// ============================================================
// MOTOR DE REGLAS DE CRÉDITO v3 — CON PPR
// ============================================================
// PPR = Payment-to-Purchase Ratio (últimas N visitas)
// Controla: pago mínimo, límite dinámico, excepciones
// ============================================================

// ========================= CONFIGURACIÓN =========================
const CONFIG = {
  DIAS_PLAZO_MAX: 18,
  DIAS_CUOTA_INTERVAL: 7,
  MAX_CUOTAS: 8,

  // PPR
  PPR_VENTANA: 5,                    // últimas 5 visitas para calcular PPR
  PPR_EXCELENTE: 1.2,
  PPR_BUENO: 1.0,
  PPR_ESTABLE: 0.8,
  PPR_ALERTA: 0.5,

  // Pago mínimo base (% de compra nueva)
  PAGO_MIN_BASE: 0.50,              // 50% siempre

  // Pago mínimo extra de deuda vieja según PPR
  PAGO_DEUDA_PPR_EXCELENTE: 0.00,   // no requiere extra
  PAGO_DEUDA_PPR_BUENO: 0.00,       // no requiere extra
  PAGO_DEUDA_PPR_ESTABLE: 0.10,     // 10% de deuda vieja
  PAGO_DEUDA_PPR_ALERTA: 0.20,      // 20% de deuda vieja
  PAGO_DEUDA_PPR_PELIGRO: 0.30,     // 30% de deuda vieja

  // Multiplicadores de límite según PPR
  LIMITE_MULT_EXCELENTE: 1.10,      // +10%
  LIMITE_MULT_BUENO: 1.00,          // sin cambio
  LIMITE_MULT_ESTABLE: 0.90,        // -10%
  LIMITE_MULT_ALERTA: 0.75,         // -25%
  LIMITE_MULT_PELIGRO: 0.50,        // -50%

  // Penalizaciones
  PEN_ACUERDO_ROTO: 0.25,           // -25% por acuerdo roto
  MAX_ACUERDOS_ROTOS_CONGELAR: 2,
  MAX_CUOTAS_VENCIDAS: 1,
  PEN_CUOTA_VENCIDA: 0.10,          // -10% por cuota vencida
  PEN_INACTIVO_CON_DEUDA: 0.20,     // -20% si inactivo 30+ días con deuda
  DIAS_INACTIVO_TRIGGER: 30,

  // Deuda vieja
  DIAS_DEUDA_VIEJA_TRIGGER: 10,

  // Excepciones
  MAX_EXCEPCIONES_MES: 2,

  // Tolerancia
  TOLERANCIA: 0.01,
  DIAS_GRACIA_CUOTA: 2,
};

export { CONFIG as CREDIT_RULES_CONFIG };


// ========================= CÁLCULO DE PPR =========================

/**
 * Calcula el PPR (Payment-to-Purchase Ratio) de las últimas N visitas
 * @param {Array} ventas - [{fecha, total}] ordenadas desc
 * @param {Array} pagos - [{fecha, monto_pagado}] ordenadas desc
 * @param {number} ventana - últimas N visitas
 * @returns {Object}
 */
export function calcularPPR(ventas = [], pagos = [], ventana = CONFIG.PPR_VENTANA) {
  if (ventas.length === 0) {
    return { ppr: 1.0, clasificacion: "nuevo", totalComprado: 0, totalPagado: 0, visitas: 0, tendencia: "neutral" };
  }

  // Tomar últimas N ventas
  const ventasRecientes = ventas.slice(0, ventana);
  const totalComprado = ventasRecientes.reduce((s, v) => s + Number(v.total || 0), 0);

  // Pagos en el mismo período
  let fechaInicio = null;
  if (ventasRecientes.length > 0) {
    const fechas = ventasRecientes.map(v => new Date(v.fecha)).filter(d => !isNaN(d));
    if (fechas.length > 0) {
      fechaInicio = new Date(Math.min(...fechas));
    }
  }

  let totalPagado = 0;
  if (fechaInicio) {
    for (const p of pagos) {
      const fp = new Date(p.fecha);
      if (!isNaN(fp) && fp >= fechaInicio) {
        totalPagado += Number(p.monto_pagado || 0);
      }
    }
  } else {
    // Sin fecha, usar todos los pagos limitados
    totalPagado = pagos.slice(0, ventana * 2).reduce((s, p) => s + Number(p.monto_pagado || 0), 0);
  }

  const ppr = totalComprado > 0 ? r2(totalPagado / totalComprado) : 1.0;

  // Clasificación
  let clasificacion;
  if (ppr >= CONFIG.PPR_EXCELENTE) clasificacion = "excelente";
  else if (ppr >= CONFIG.PPR_BUENO) clasificacion = "bueno";
  else if (ppr >= CONFIG.PPR_ESTABLE) clasificacion = "estable";
  else if (ppr >= CONFIG.PPR_ALERTA) clasificacion = "alerta";
  else clasificacion = "peligro";

  // Tendencia: comparar PPR de últimas 3 vs anteriores
  let tendencia = "neutral";
  if (ventas.length >= 6) {
    const mitad = Math.min(3, Math.floor(ventana / 2));
    const compradoReciente = ventas.slice(0, mitad).reduce((s, v) => s + Number(v.total || 0), 0);
    const compradoAnterior = ventas.slice(mitad, mitad * 2).reduce((s, v) => s + Number(v.total || 0), 0);

    let pagadoReciente = 0, pagadoAnterior = 0;
    const fechaMitad = ventas[mitad] ? new Date(ventas[mitad].fecha) : new Date();

    for (const p of pagos) {
      const fp = new Date(p.fecha);
      if (isNaN(fp)) continue;
      if (fp >= fechaMitad) pagadoReciente += Number(p.monto_pagado || 0);
      else if (fechaInicio && fp >= fechaInicio) pagadoAnterior += Number(p.monto_pagado || 0);
    }

    const pprReciente = compradoReciente > 0 ? pagadoReciente / compradoReciente : 1;
    const pprAnterior = compradoAnterior > 0 ? pagadoAnterior / compradoAnterior : 1;

    if (pprReciente > pprAnterior + 0.15) tendencia = "mejorando";
    else if (pprReciente < pprAnterior - 0.15) tendencia = "empeorando";
  }

  return {
    ppr: Math.min(ppr, 3.0), // cap at 3.0
    clasificacion,
    totalComprado: r2(totalComprado),
    totalPagado: r2(totalPagado),
    visitas: ventasRecientes.length,
    tendencia,
  };
}


// ========================= PAGO MÍNIMO DINÁMICO =========================

function calcularPagoMinimoPorPPR(pprClasificacion, montoVenta, saldoActual) {
  // Pago mínimo de la compra nueva = siempre 50%
  const pagoMinimoVenta = r2(montoVenta * CONFIG.PAGO_MIN_BASE);

  // Pago extra de deuda vieja según PPR
  let pctDeuda = 0;
  switch (pprClasificacion) {
    case "excelente": pctDeuda = CONFIG.PAGO_DEUDA_PPR_EXCELENTE; break;
    case "bueno": pctDeuda = CONFIG.PAGO_DEUDA_PPR_BUENO; break;
    case "estable": pctDeuda = CONFIG.PAGO_DEUDA_PPR_ESTABLE; break;
    case "alerta": pctDeuda = CONFIG.PAGO_DEUDA_PPR_ALERTA; break;
    case "peligro": pctDeuda = CONFIG.PAGO_DEUDA_PPR_PELIGRO; break;
    default: pctDeuda = CONFIG.PAGO_DEUDA_PPR_ESTABLE;
  }

  const pagoMinimoDeuda = r2(saldoActual * pctDeuda);
  return { pagoMinimoVenta, pagoMinimoDeuda, pctDeuda };
}


// ========================= LÍMITE DINÁMICO =========================

function calcularMultiplicadorLimite(pprData, acuerdos, diasInactivo, saldoActual) {
  let mult = 1.0;

  // PPR multiplicador
  switch (pprData.clasificacion) {
    case "excelente": mult *= CONFIG.LIMITE_MULT_EXCELENTE; break;
    case "bueno": mult *= CONFIG.LIMITE_MULT_BUENO; break;
    case "estable": mult *= CONFIG.LIMITE_MULT_ESTABLE; break;
    case "alerta": mult *= CONFIG.LIMITE_MULT_ALERTA; break;
    case "peligro": mult *= CONFIG.LIMITE_MULT_PELIGRO; break;
  }

  // Penalización por acuerdos rotos
  const rotos = acuerdos?.acuerdos_rotos || 0;
  if (rotos > 0) {
    mult *= Math.max(0.25, 1 - (rotos * CONFIG.PEN_ACUERDO_ROTO));
  }

  // Penalización por cuotas vencidas
  const cuotasVencidas = acuerdos?.cuotas_vencidas_total || 0;
  if (cuotasVencidas > 0) {
    mult *= Math.max(0.5, 1 - (cuotasVencidas * CONFIG.PEN_CUOTA_VENCIDA));
  }

  // Penalización por inactividad con deuda
  if (diasInactivo >= CONFIG.DIAS_INACTIVO_TRIGGER && saldoActual > 0) {
    mult *= (1 - CONFIG.PEN_INACTIVO_CON_DEUDA);
  }

  // Bonus por tendencia mejorando
  if (pprData.tendencia === "mejorando") {
    mult *= 1.05; // +5% bonus
  }

  return r2(Math.max(0, Math.min(1.5, mult)));
}


// ========================= MOTOR PRINCIPAL =========================

/**
 * Evalúa reglas de crédito con PPR
 */
export function evaluarReglasCredito({
  montoVenta = 0,
  saldoActual = 0,
  limiteBase = 0,
  diasDeuda = 0,
  acuerdos = null,
  montoPagadoAhora = 0,
  historial = {},
  // Nuevos params para PPR
  ventasDetalle = [],
  pagosDetalle = [],
  diasInactivo = 0,
}) {
  const reglas = [];
  const advertencias = [];
  let permitido = true;
  let requiereExcepcion = false;
  let motivoBloqueo = null;

  const acuerdosRotos = acuerdos?.acuerdos_rotos || 0;
  const acuerdosActivos = acuerdos?.acuerdos_activos || 0;
  const cuotasVencidas = acuerdos?.cuotas_vencidas_total || 0;

  // ==================== CALCULAR PPR ====================
  const pprData = calcularPPR(ventasDetalle, pagosDetalle);
  reglas.push(`PPR: ${pprData.ppr.toFixed(2)} (${pprData.clasificacion}) — ${pprData.visitas} visits`);

  // ==================== R4: CONGELAMIENTO ====================
  if (acuerdosRotos >= CONFIG.MAX_ACUERDOS_ROTOS_CONGELAR) {
    return {
      permitido: false,
      nivel: "congelado",
      ppr: pprData,
      pagoMinimoVenta: montoVenta,
      pagoMinimoDeudaVieja: saldoActual,
      pagoMinimoTotal: r2(montoVenta + saldoActual),
      limiteEfectivo: 0,
      disponibleEfectivo: 0,
      multiplicadorLimite: 0,
      penalizacionPct: 100,
      reglas: [...reglas, `R4: FROZEN (${acuerdosRotos} broken agreements)`],
      advertencias: ["🔒 CREDIT FROZEN — Cash only until all debt is paid"],
      acuerdoSugerido: null,
      requiereExcepcion: true,
      motivoBloqueo: `Credit FROZEN: ${acuerdosRotos} broken agreements`,
      montoMaximo: 0,
    };
  }

  // ==================== PPR PELIGRO + sin pagos recientes ====================
  if (pprData.clasificacion === "peligro" && pprData.visitas >= 3) {
    advertencias.push("🔴 PPR < 0.5 — Client pays much less than they buy. Require higher payment.");
    reglas.push("PPR-DANGER: Cliente paga menos del 50% de lo que compra");
  }

  // ==================== CALCULAR PAGO MÍNIMO ====================
  const { pagoMinimoVenta, pagoMinimoDeuda, pctDeuda } = calcularPagoMinimoPorPPR(
    pprData.clasificacion, montoVenta, saldoActual
  );

  // Si tiene cuotas vencidas, el mínimo de deuda es al menos la cuota
  let pagoMinimoDeudaFinal = pagoMinimoDeuda;
  if (cuotasVencidas > 0 && acuerdos?.proxima_cuota_monto) {
    const cuotaPendiente = Number(acuerdos.proxima_cuota_monto);
    pagoMinimoDeudaFinal = Math.max(pagoMinimoDeudaFinal, cuotaPendiente);
    reglas.push(`R5: Overdue installment $${cuotaPendiente.toFixed(2)} added to minimum`);
  }

  // Deuda vieja trigger
  if (saldoActual > CONFIG.TOLERANCIA && diasDeuda > CONFIG.DIAS_DEUDA_VIEJA_TRIGGER && pctDeuda > 0) {
    reglas.push(`R2: Old debt ${diasDeuda}d → must pay ${(pctDeuda * 100).toFixed(0)}% = $${pagoMinimoDeudaFinal.toFixed(2)}`);
    advertencias.push(`⚠️ Old debt (${diasDeuda}d): Pay at least $${pagoMinimoDeudaFinal.toFixed(2)} of $${saldoActual.toFixed(2)}`);
  }

  const pagoMinimoTotal = r2(pagoMinimoVenta + pagoMinimoDeudaFinal);
  reglas.push(`Pago mínimo total: $${pagoMinimoTotal.toFixed(2)} (venta: $${pagoMinimoVenta.toFixed(2)} + deuda: $${pagoMinimoDeudaFinal.toFixed(2)})`);

  // ==================== CALCULAR LÍMITE DINÁMICO ====================
  const multiplicador = calcularMultiplicadorLimite(pprData, acuerdos, diasInactivo, saldoActual);
  const limiteEfectivo = r2(limiteBase * multiplicador);
  const disponibleEfectivo = r2(Math.max(0, limiteEfectivo - saldoActual));
  const penalizacionPct = r2((1 - multiplicador) * 100);

  reglas.push(`Limit: $${limiteBase.toFixed(2)} × ${multiplicador} = $${limiteEfectivo.toFixed(2)} (available: $${disponibleEfectivo.toFixed(2)})`);

  if (penalizacionPct > 0) {
    advertencias.push(`📉 Credit limit reduced ${penalizacionPct.toFixed(0)}% (PPR: ${pprData.ppr.toFixed(2)}, ${pprData.clasificacion})`);
  }

  // ==================== CUOTAS VENCIDAS ====================
  if (cuotasVencidas > CONFIG.MAX_CUOTAS_VENCIDAS) {
    requiereExcepcion = true;
    advertencias.push(`🚨 ${cuotasVencidas} overdue installments — collect payment first`);
    reglas.push(`R5: ${cuotasVencidas} overdue installments`);
  }

  // ==================== VERIFICAR CRÉDITO ====================
  const creditoNecesario = Math.max(0, montoVenta - montoPagadoAhora);
  if (creditoNecesario > disponibleEfectivo + CONFIG.TOLERANCIA) {
    requiereExcepcion = true;
    advertencias.push(`❌ Needs $${creditoNecesario.toFixed(2)} credit, only $${disponibleEfectivo.toFixed(2)} available`);
  }

  // ==================== VERIFICAR PAGO MÍNIMO ====================
  if (montoPagadoAhora > 0 && montoPagadoAhora < pagoMinimoTotal - CONFIG.TOLERANCIA) {
    const faltante = r2(pagoMinimoTotal - montoPagadoAhora);
    requiereExcepcion = true;
    advertencias.push(`💰 Min payment: $${pagoMinimoTotal.toFixed(2)} (short $${faltante.toFixed(2)})`);
  }

  // ==================== NIVEL ====================
  let nivel;
  if (!permitido) nivel = "congelado";
  else if (pprData.clasificacion === "peligro" || acuerdosRotos > 0 || cuotasVencidas > 1) nivel = "rojo";
  else if (requiereExcepcion || pprData.clasificacion === "alerta") nivel = "amarillo";
  else if (pprData.clasificacion === "excelente" || pprData.clasificacion === "bueno") nivel = "verde";
  else nivel = "amarillo";

  // ==================== MONTO MÁXIMO RECOMENDADO ====================
  const montoMaximo = r2(Math.max(0, disponibleEfectivo));

  // ==================== ACUERDO SUGERIDO ====================
  const montoACredito = Math.max(0, montoVenta - montoPagadoAhora);
  let acuerdoSugerido = null;
  if (montoACredito > CONFIG.TOLERANCIA) {
    acuerdoSugerido = generarPlanPago(montoACredito);
  }

  return {
    permitido,
    nivel,
    ppr: pprData,
    pagoMinimoVenta,
    pagoMinimoDeudaVieja: pagoMinimoDeudaFinal,
    pagoMinimoTotal,
    limiteEfectivo,
    disponibleEfectivo,
    multiplicadorLimite: multiplicador,
    penalizacionPct,
    reglas,
    advertencias,
    acuerdoSugerido,
    requiereExcepcion,
    motivoBloqueo,
    montoMaximo,
  };
}


// ========================= PLAN DE PAGO =========================

export function generarPlanPago(monto, opciones = {}) {
  let numCuotas = opciones.numCuotas || null;

  if (!numCuotas) {
    if (monto <= 30) numCuotas = 1;
    else if (monto <= 80) numCuotas = 2;
    else if (monto <= 200) numCuotas = 3;
    else if (monto <= 400) numCuotas = 4;
    else numCuotas = 5;
  }
  numCuotas = Math.max(1, Math.min(numCuotas, CONFIG.MAX_CUOTAS));

  const diasPlazo = opciones.diasPlazo || Math.max(CONFIG.DIAS_PLAZO_MAX, numCuotas * CONFIG.DIAS_CUOTA_INTERVAL);
  const montoPorCuota = r2(monto / numCuotas);
  const hoy = new Date();
  const cuotas = [];

  for (let i = 0; i < numCuotas; i++) {
    const diasOffset = Math.round(((i + 1) / numCuotas) * diasPlazo);
    const fechaVencimiento = new Date(hoy);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasOffset);

    const esUltima = i === numCuotas - 1;
    const montoCuota = esUltima ? r2(monto - montoPorCuota * (numCuotas - 1)) : montoPorCuota;

    cuotas.push({
      numero_cuota: i + 1,
      monto: montoCuota,
      fecha_vencimiento: fechaVencimiento.toISOString(),
      fecha_display: fechaVencimiento.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      dias_desde_hoy: diasOffset,
    });
  }

  const fechaLimite = new Date(hoy);
  fechaLimite.setDate(fechaLimite.getDate() + diasPlazo);

  return { monto_total: monto, num_cuotas: numCuotas, dias_plazo: diasPlazo, fecha_limite: fechaLimite.toISOString(), cuotas };
}


// ========================= SMS BUILDER =========================

export function buildPaymentAgreementSMS({ clientName, montoVenta, montoPagado, montoCredito, cuotas = [], companyName = "Tools4Care" }) {
  const lines = [];
  lines.push(`${companyName} - Payment Agreement`);
  lines.push(`Customer: ${clientName}`);
  lines.push(`Date: ${new Date().toLocaleDateString("en-US")}`);
  lines.push("");
  lines.push(`Sale: $${Number(montoVenta).toFixed(2)}`);
  lines.push(`Paid: $${Number(montoPagado).toFixed(2)}`);
  lines.push(`Credit: $${Number(montoCredito).toFixed(2)}`);
  lines.push("");
  lines.push("PAYMENT SCHEDULE:");
  for (const c of cuotas) {
    lines.push(`  #${c.numero_cuota}: $${Number(c.monto).toFixed(2)} - ${c.fecha_display}`);
  }
  lines.push("");
  lines.push("Late payments may reduce your credit limit.");
  lines.push("Reply STOP to opt out.");
  return lines.join("\n");
}


// ========================= PAYMENT STREAK =========================
/**
 * Premia a clientes que pagan con frecuencia aunque sean montos pequeños.
 * Clave para van-based POS donde los clientes pagan deuda en partes distintos días.
 */
export function calcularPaymentStreak(pagos = []) {
  if (!pagos.length) {
    return { streakDias: 0, pagoUltimos7: false, pagoUltimos3: false, totalPagadoUltimos7: 0, score: 0 };
  }

  const ahora = Date.now();
  const MS_DIA = 86400000;

  const pagosOrdenados = [...pagos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const ultimos7 = pagosOrdenados.filter(p => {
    const ms = ahora - new Date(p.fecha).getTime();
    return ms >= 0 && ms <= 7 * MS_DIA;
  });
  const ultimos3 = pagosOrdenados.filter(p => {
    const ms = ahora - new Date(p.fecha).getTime();
    return ms >= 0 && ms <= 3 * MS_DIA;
  });

  // Días únicos con pago en últimas 2 semanas
  const diasUnicos = new Set(
    pagosOrdenados
      .filter(p => (ahora - new Date(p.fecha).getTime()) <= 14 * MS_DIA)
      .map(p => new Date(p.fecha).toDateString())
  );

  const totalPagadoUltimos7 = ultimos7.reduce((s, p) => s + Number(p.monto_pagado || 0), 0);

  // +10 si hizo algún pago en últimos 7 días, +5 adicionales si fue en últimos 3
  let score = 0;
  if (ultimos7.length > 0) score += 10;
  if (ultimos3.length > 0) score += 5;

  return {
    streakDias: diasUnicos.size,        // días únicos con pago en 14d
    pagoUltimos7: ultimos7.length > 0,
    pagoUltimos3: ultimos3.length > 0,
    totalPagadoUltimos7: r2(totalPagadoUltimos7),
    score,                               // 0, 10 o 15 pts
  };
}


// ========================= PPR 30 DÍAS =========================
/**
 * PPR basado en ventana de 30 días corridos (no por visitas).
 * Complementa calcularPPR() para detectar si el cliente está pagando
 * su deuda activamente entre visitas (pagos parciales frecuentes).
 */
export function calcularPPR30Dias(ventas = [], pagos = []) {
  const ahora = Date.now();
  const VENTANA = 30 * 86400000; // 30 días en ms

  const ventas30 = ventas.filter(v => {
    const ms = ahora - new Date(v.fecha).getTime();
    return ms >= 0 && ms <= VENTANA;
  });
  const pagos30 = pagos.filter(p => {
    const ms = ahora - new Date(p.fecha).getTime();
    return ms >= 0 && ms <= VENTANA;
  });

  const totalComprado = ventas30.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalPagado   = pagos30.reduce((s, p)  => s + Number(p.monto_pagado || 0), 0);

  if (totalComprado === 0) {
    return { ppr30: 1.0, clasificacion: "nuevo", totalComprado: 0, totalPagado: r2(totalPagado) };
  }

  const ppr30 = r2(Math.min(totalPagado / totalComprado, 3.0));

  let clasificacion;
  if      (ppr30 >= CONFIG.PPR_EXCELENTE) clasificacion = "excelente";
  else if (ppr30 >= CONFIG.PPR_BUENO)     clasificacion = "bueno";
  else if (ppr30 >= CONFIG.PPR_ESTABLE)   clasificacion = "estable";
  else if (ppr30 >= CONFIG.PPR_ALERTA)    clasificacion = "alerta";
  else                                     clasificacion = "peligro";

  return { ppr30, clasificacion, totalComprado: r2(totalComprado), totalPagado: r2(totalPagado) };
}


// ========================= LÍMITE SUGERIDO DINÁMICO =========================
/**
 * Sugiere un límite basado en el comportamiento real de compra.
 * NO reemplaza limite_manual ni limite_politica.
 * Sirve como referencia para el admin al ajustar manualmente.
 *
 * Fórmula: promedio_compra × 3 × mult_ppr × mult_racha
 */
export function calcularLimiteSugerido(ventas = [], pprData = null, streak = null) {
  if (!ventas.length) return { limiteSugerido: 0, base: 0, motivo: "Sin historial de compras" };

  const recientes = ventas.slice(0, 10);
  const promedioCompra = recientes.reduce((s, v) => s + Number(v.total || 0), 0) / recientes.length;

  // Base = 3 compras típicas a crédito
  const base = r2(promedioCompra * 3);

  // Multiplicador por PPR (no toca la regla del 50%)
  const multPPR = { excelente: 1.2, bueno: 1.0, estable: 0.8, alerta: 0.6, peligro: 0.4, nuevo: 1.0 }[pprData?.clasificacion ?? "nuevo"] ?? 1.0;

  // Bonus por racha de pagos recientes
  const multStreak = streak?.pagoUltimos3 ? 1.1 : streak?.pagoUltimos7 ? 1.05 : 1.0;

  const limiteSugerido = r2(Math.max(0, base * multPPR * multStreak));

  return {
    limiteSugerido,
    base,
    multPPR,
    multStreak,
    promedioCompra: r2(promedioCompra),
    motivo: `Prom $${r2(promedioCompra)} × 3 × PPR(${multPPR}) × Racha(${multStreak})`,
  };
}


// ========================= HELPERS =========================

function r2(n) { return Math.round(Number(n || 0) * 100) / 100; }