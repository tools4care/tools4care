// src/lib/creditRulesEngine.js
// ============================================================
// MOTOR DE REGLAS DE CRÉDITO DINÁMICO
// Ciclo: 18 días | Visitas: semanal/quincenal
// ============================================================
//
// REGLAS:
// R1: Pago mínimo 50% de compra nueva
// R2: Deuda vieja > 10 días → pagar 40% antes de comprar
// R3: Acuerdo roto → límite baja 25%
// R4: 2+ acuerdos rotos → crédito congelado
// R5: Máximo 2-3 cuotas en 18 días
// R6: Excepción del vendedor con registro
// ============================================================

/**
 * @typedef {Object} AcuerdoResumen
 * @property {number} acuerdos_activos
 * @property {number} acuerdos_rotos
 * @property {number} acuerdos_completados
 * @property {number} deuda_en_acuerdos
 * @property {number} cuotas_vencidas_total
 * @property {number} max_atraso_activo
 * @property {string|null} proxima_cuota_fecha
 * @property {number|null} proxima_cuota_monto
 */

/**
 * @typedef {Object} CreditRulesResult
 * @property {boolean} permitido - ¿Se puede hacer la venta a crédito?
 * @property {string} nivel - 'verde' | 'amarillo' | 'rojo' | 'congelado'
 * @property {number} pagoMinimoVenta - Mínimo que debe pagar de esta venta
 * @property {number} pagoMinimoDeudaVieja - Mínimo que debe pagar de deuda anterior
 * @property {number} pagoMinimoTotal - Suma de ambos mínimos
 * @property {number} limiteEfectivo - Límite ajustado después de penalizaciones
 * @property {number} disponibleEfectivo - Disponible real después de reglas
 * @property {number} penalizacionPct - % de penalización aplicada al límite
 * @property {string[]} reglas - Reglas que se activaron
 * @property {string[]} advertencias - Warnings para el vendedor
 * @property {Object|null} acuerdoSugerido - Sugerencia de plan de pago
 * @property {boolean} requiereExcepcion - Si necesita override del vendedor
 * @property {string|null} motivoBloqueo - Razón del bloqueo si aplica
 */

// ========================= CONFIGURACIÓN =========================
const CONFIG = {
  // Ciclo de visitas
  DIAS_PLAZO_MAX: 18,
  DIAS_CUOTA_INTERVAL: 7,        // cada 7 días por defecto
  MAX_CUOTAS: 8,

  // Regla R1: Pago mínimo de compra nueva
  PCT_PAGO_MINIMO_VENTA: 0.50,   // 50%

  // Regla R2: Pago mínimo de deuda vieja
  DIAS_DEUDA_VIEJA_TRIGGER: 10,  // si deuda tiene > 10 días
  PCT_PAGO_MINIMO_DEUDA: 0.40,   // debe pagar 40% de deuda vieja

  // Regla R3: Penalización por acuerdo roto
  PCT_PENALIZACION_ACUERDO_ROTO: 0.25, // reduce 25% del límite

  // Regla R4: Congelamiento
  MAX_ACUERDOS_ROTOS_PARA_CONGELAR: 2,

  // Regla R5: Cuotas vencidas
  MAX_CUOTAS_VENCIDAS_PERMITIDAS: 1,  // máximo 1 cuota vencida antes de bloquear

  // Tolerancias
  TOLERANCIA_MONTO: 0.01,         // $0.01 de tolerancia en comparaciones
  DIAS_GRACIA_CUOTA: 2,           // 2 días de gracia después del vencimiento
};

export { CONFIG as CREDIT_RULES_CONFIG };

// ========================= MOTOR PRINCIPAL =========================

/**
 * Evalúa si un cliente puede tomar crédito y cuánto debe pagar
 *
 * @param {Object} params
 * @param {number} params.montoVenta - Total de la venta actual
 * @param {number} params.saldoActual - Saldo/deuda actual del cliente
 * @param {number} params.limiteBase - Límite de crédito (manual o política)
 * @param {number} params.diasDeuda - Días desde la deuda más vieja sin pagar
 * @param {AcuerdoResumen|null} params.acuerdos - Resumen de acuerdos
 * @param {number} params.montoPagadoAhora - Lo que el cliente va a pagar en esta visita
 * @param {Object} [params.historial] - Historial de comportamiento
 * @returns {CreditRulesResult}
 */
export function evaluarReglasCredito({
  montoVenta = 0,
  saldoActual = 0,
  limiteBase = 0,
  diasDeuda = 0,
  acuerdos = null,
  montoPagadoAhora = 0,
  historial = {},
}) {
  const reglas = [];
  const advertencias = [];
  let permitido = true;
  let requiereExcepcion = false;
  let motivoBloqueo = null;

  // --- Datos del acuerdo ---
  const acuerdosRotos = acuerdos?.acuerdos_rotos || 0;
  const acuerdosActivos = acuerdos?.acuerdos_activos || 0;
  const cuotasVencidas = acuerdos?.cuotas_vencidas_total || 0;
  const deudaEnAcuerdos = acuerdos?.deuda_en_acuerdos || 0;
  const maxAtrasoActivo = acuerdos?.max_atraso_activo || 0;

  // ==================== R4: CONGELAMIENTO ====================
  // 2+ acuerdos rotos → crédito congelado
  if (acuerdosRotos >= CONFIG.MAX_ACUERDOS_ROTOS_PARA_CONGELAR) {
    permitido = false;
    motivoBloqueo = `Credit FROZEN: ${acuerdosRotos} broken payment agreements. Client must pay ALL outstanding debt before new credit.`;
    reglas.push(`R4: Crédito congelado (${acuerdosRotos} acuerdos rotos)`);

    return {
      permitido: false,
      nivel: 'congelado',
      pagoMinimoVenta: montoVenta, // debe pagar 100%
      pagoMinimoDeudaVieja: saldoActual, // debe pagar todo
      pagoMinimoTotal: montoVenta + saldoActual,
      limiteEfectivo: 0,
      disponibleEfectivo: 0,
      penalizacionPct: 100,
      reglas,
      advertencias: ['🔒 CRÉDITO CONGELADO — Solo venta de contado'],
      acuerdoSugerido: null,
      requiereExcepcion: true,
      motivoBloqueo,
    };
  }

  // ==================== R3: PENALIZACIÓN POR ACUERDOS ROTOS ====================
  let penalizacionPct = 0;
  if (acuerdosRotos > 0) {
    penalizacionPct = Math.min(
      acuerdosRotos * CONFIG.PCT_PENALIZACION_ACUERDO_ROTO * 100,
      75 // máximo 75% de penalización
    );
    reglas.push(`R3: Penalización ${penalizacionPct}% por ${acuerdosRotos} acuerdo(s) roto(s)`);
    advertencias.push(`⚠️ Limit reduced ${penalizacionPct}% due to ${acuerdosRotos} broken agreement(s)`);
  }

  const limiteEfectivo = Math.max(0, limiteBase * (1 - penalizacionPct / 100));
  const disponibleEfectivo = Math.max(0, limiteEfectivo - saldoActual);

  // ==================== R5: CUOTAS VENCIDAS ====================
  if (cuotasVencidas > CONFIG.MAX_CUOTAS_VENCIDAS_PERMITIDAS) {
    requiereExcepcion = true;
    advertencias.push(
      `🚨 ${cuotasVencidas} overdue installment(s). Client should pay before taking more credit.`
    );
    reglas.push(`R5: ${cuotasVencidas} cuotas vencidas (máx permitido: ${CONFIG.MAX_CUOTAS_VENCIDAS_PERMITIDAS})`);
  }

  // ==================== R1: PAGO MÍNIMO DE VENTA NUEVA ====================
  const pagoMinimoVenta = r2(montoVenta * CONFIG.PCT_PAGO_MINIMO_VENTA);
  reglas.push(`R1: Pago mínimo venta = ${pct(CONFIG.PCT_PAGO_MINIMO_VENTA)} de ${fmt(montoVenta)} = ${fmt(pagoMinimoVenta)}`);

  // ==================== R2: PAGO MÍNIMO DE DEUDA VIEJA ====================
  let pagoMinimoDeudaVieja = 0;

  if (saldoActual > CONFIG.TOLERANCIA_MONTO && diasDeuda > CONFIG.DIAS_DEUDA_VIEJA_TRIGGER) {
    pagoMinimoDeudaVieja = r2(saldoActual * CONFIG.PCT_PAGO_MINIMO_DEUDA);
    reglas.push(
      `R2: Deuda vieja ${fmt(saldoActual)} tiene ${diasDeuda} días (> ${CONFIG.DIAS_DEUDA_VIEJA_TRIGGER}). ` +
      `Mínimo a pagar: ${pct(CONFIG.PCT_PAGO_MINIMO_DEUDA)} = ${fmt(pagoMinimoDeudaVieja)}`
    );
    advertencias.push(
      `⚠️ Old debt (${diasDeuda} days): Must pay at least ${fmt(pagoMinimoDeudaVieja)} of ${fmt(saldoActual)} before new credit`
    );
  }

  // Si tiene acuerdo activo con cuota próxima, el mínimo de deuda vieja
  // es al menos la cuota vencida/próxima
  if (acuerdos?.proxima_cuota_monto && cuotasVencidas > 0) {
    const cuotaVencida = Number(acuerdos.proxima_cuota_monto);
    if (cuotaVencida > pagoMinimoDeudaVieja) {
      pagoMinimoDeudaVieja = r2(cuotaVencida);
      reglas.push(`R2+: Cuota vencida ${fmt(cuotaVencida)} es mayor que el 40%, se usa como mínimo`);
    }
  }

  const pagoMinimoTotal = r2(pagoMinimoVenta + pagoMinimoDeudaVieja);

  // ==================== VERIFICAR CRÉDITO DISPONIBLE ====================
  const creditoNecesario = Math.max(0, montoVenta - montoPagadoAhora);

  if (creditoNecesario > disponibleEfectivo + CONFIG.TOLERANCIA_MONTO) {
    requiereExcepcion = true;
    advertencias.push(
      `❌ Needs ${fmt(creditoNecesario)} credit but only ${fmt(disponibleEfectivo)} available (limit: ${fmt(limiteEfectivo)})`
    );
  }

  // ==================== VERIFICAR PAGO MÍNIMO ====================
  if (montoPagadoAhora < pagoMinimoTotal - CONFIG.TOLERANCIA_MONTO) {
    const faltante = r2(pagoMinimoTotal - montoPagadoAhora);
    requiereExcepcion = true;
    advertencias.push(
      `💰 Minimum payment: ${fmt(pagoMinimoTotal)} (paying ${fmt(montoPagadoAhora)}, short ${fmt(faltante)})`
    );
  }

  // ==================== DETERMINAR NIVEL ====================
  let nivel;
  if (!permitido) {
    nivel = 'congelado';
  } else if (requiereExcepcion) {
    nivel = cuotasVencidas > 1 || acuerdosRotos > 0 ? 'rojo' : 'amarillo';
  } else if (saldoActual > 0 || acuerdosActivos > 0) {
    nivel = 'amarillo';
  } else {
    nivel = 'verde';
  }

  // ==================== SUGERENCIA DE ACUERDO ====================
  const montoACredito = Math.max(0, montoVenta - montoPagadoAhora);
  let acuerdoSugerido = null;

  if (montoACredito > CONFIG.TOLERANCIA_MONTO) {
    acuerdoSugerido = generarPlanPago(montoACredito);
  }

  return {
    permitido,
    nivel,
    pagoMinimoVenta,
    pagoMinimoDeudaVieja,
    pagoMinimoTotal,
    limiteEfectivo,
    disponibleEfectivo,
    penalizacionPct,
    reglas,
    advertencias,
    acuerdoSugerido,
    requiereExcepcion,
    motivoBloqueo,
  };
}


// ========================= PLAN DE PAGO =========================

/**
 * Genera un plan de cuotas para un monto dado
 * @param {number} monto - Monto total a financiar
 * @param {Object} [opciones]
 * @param {number} [opciones.numCuotas] - Número de cuotas (auto si no se da)
 * @param {number} [opciones.diasPlazo] - Plazo total en días
 * @returns {Object} Plan de pagos con cuotas
 */
export function generarPlanPago(monto, opciones = {}) {
  let numCuotas = opciones.numCuotas || null;

  // Auto-determinar número de cuotas según monto (si no se especifica)
  if (!numCuotas) {
    if (monto <= 30) numCuotas = 1;
    else if (monto <= 80) numCuotas = 2;
    else if (monto <= 200) numCuotas = 3;
    else if (monto <= 400) numCuotas = 4;
    else numCuotas = 5;
  }
  // Forzar entre 1 y MAX_CUOTAS
  numCuotas = Math.max(1, Math.min(numCuotas, CONFIG.MAX_CUOTAS));

  // Plazo: se adapta al número de cuotas (mínimo 18 días, o cuotas × 7 días)
  const diasPlazo = opciones.diasPlazo || Math.max(CONFIG.DIAS_PLAZO_MAX, numCuotas * CONFIG.DIAS_CUOTA_INTERVAL);

  const montoPorCuota = r2(monto / numCuotas);
  const hoy = new Date();
  const cuotas = [];

  for (let i = 0; i < numCuotas; i++) {
    const diasOffset = Math.round(((i + 1) / numCuotas) * diasPlazo);
    const fechaVencimiento = new Date(hoy);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasOffset);

    // Ajustar último pago para cubrir centavos
    const esUltima = i === numCuotas - 1;
    const montoCuota = esUltima
      ? r2(monto - montoPorCuota * (numCuotas - 1))
      : montoPorCuota;

    cuotas.push({
      numero_cuota: i + 1,
      monto: montoCuota,
      fecha_vencimiento: fechaVencimiento.toISOString(),
      fecha_display: fechaVencimiento.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      dias_desde_hoy: diasOffset,
    });
  }

  const fechaLimite = new Date(hoy);
  fechaLimite.setDate(fechaLimite.getDate() + diasPlazo);

  return {
    monto_total: monto,
    num_cuotas: numCuotas,
    dias_plazo: diasPlazo,
    fecha_limite: fechaLimite.toISOString(),
    cuotas,
  };
}


// ========================= SMS BUILDER =========================

/**
 * Construye mensaje SMS con el acuerdo de pago
 * @param {Object} params
 * @returns {string}
 */
export function buildPaymentAgreementSMS({
  clientName,
  montoVenta,
  montoPagado,
  montoCredito,
  cuotas = [],
  companyName = 'Tools4Care',
}) {
  const lines = [];
  lines.push(`${companyName} — Payment Agreement`);
  lines.push(`Customer: ${clientName}`);
  lines.push(`Date: ${new Date().toLocaleDateString('en-US')}`);
  lines.push('');
  lines.push(`Sale total: $${Number(montoVenta).toFixed(2)}`);
  lines.push(`Paid today: $${Number(montoPagado).toFixed(2)}`);
  lines.push(`Balance (credit): $${Number(montoCredito).toFixed(2)}`);
  lines.push('');
  lines.push('📅 PAYMENT SCHEDULE:');

  for (const c of cuotas) {
    lines.push(`  #${c.numero_cuota}: $${Number(c.monto).toFixed(2)} — Due ${c.fecha_display}`);
  }

  lines.push('');
  lines.push('⚠️ Late payments may reduce your credit limit.');
  lines.push('Thank you for your business!');
  lines.push('');
  lines.push('Msg&data rates may apply. Reply STOP to opt out.');

  return lines.join('\n');
}


// ========================= HELPERS =========================

function r2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function fmt(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function pct(n) {
  return `${(Number(n) * 100).toFixed(0)}%`;
}