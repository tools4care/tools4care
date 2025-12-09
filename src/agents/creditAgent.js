/* ============================================================
   AGENTE DE CRÉDITO INTELIGENTE - VERSIÓN MEJORADA
   ============================================================
   FILOSOFÍA:
   "El mejor cliente es el que PAGA A TIEMPO, 
    no necesariamente el que usa poco crédito"
   
   PESOS DE SCORING:
   - Comportamiento de pago: 45%
   - Días de retraso: 40%
   - Uso de crédito: 10% (solo penaliza sobregiro extremo)
   - Frecuencia de compra: 5%
   
   REGLA DE ORO:
   Sin atrasos + uso < 90% = VERDE automático
   ============================================================ */

import { supabase } from "../supabaseClient";

/**
 * Obtiene historial completo del cliente (ventas + pagos últimos 90 días)
 */
/**
 * Obtiene historial completo del cliente (sin límite de tiempo) - VERSIÓN ROBUSTA
 */
export async function getClientHistory(clienteId) {
  if (!clienteId) {
    return {
      ventas: 0,
      totalVentas: 0,
      pagos: 0,
      totalPagos: 0,
      ventasDetalles: [],
      pagosDetalles: [],
      lastSaleDate: null,
      lastPaymentDate: null,
      deudas: [],
      deudasVencidas: [],
    };
  }

  try {
    // Obtener TODAS las ventas (intentando diferentes nombres de columna)
    let ventas = [];
    let ventasErr = null;
    
    // Intentar con diferentes nombres de columna para fecha
    const fechaColumns = ['fecha', 'created_at', 'date'];
    for (const fechaCol of fechaColumns) {
      try {
        const { data: ventasData, error: errorVentas } = await supabase
          .from("ventas")
          .select(`id, ${fechaCol}, total, cliente_id`)
          .eq("cliente_id", clienteId)
          .order(fechaCol, { ascending: false });
          
        if (!errorVentas && ventasData && ventasData.length > 0) {
          ventas = ventasData.map(v => ({ ...v, fecha: v[fechaCol] }));
          ventasErr = null;
          break;
        }
      } catch (e) {
        // Continuar con el siguiente intento
      }
    }
    
    if (ventasErr) {
      console.error("Error al obtener ventas:", ventasErr);
      throw ventasErr;
    }

    // Obtener TODOS los pagos (intentando diferentes nombres de columna)
    let pagos = [];
    let pagosErr = null;
    
    for (const fechaCol of fechaColumns) {
      try {
        const { data: pagosData, error: errorPagos } = await supabase
          .from("cxc_pagos")
          .select(`id, ${fechaCol}, monto_pagado, cliente_id`)
          .eq("cliente_id", clienteId)
          .order(fechaCol, { ascending: false });
          
        if (!errorPagos && pagosData && pagosData.length > 0) {
          pagos = pagosData.map(p => ({ ...p, fecha: p[fechaCol] }));
          pagosErr = null;
          break;
        }
      } catch (e) {
        // Continuar con el siguiente intento
      }
    }
    
    if (pagosErr) {
      console.error("Error al obtener pagos:", pagosErr);
      throw pagosErr;
    }

    // Obtener deudas pendientes (intentando diferentes nombres de columna)
    let deudas = [];
    let deudasErr = null;
    
    for (const fechaCol of fechaColumns) {
      try {
        const { data: deudasData, error: errorDeudas } = await supabase
          .from("cxc")
          .select(`id, ${fechaCol}, monto_pendiente, venta_id, estado`)
          .eq("cliente_id", clienteId)
          .eq("estado", "pendiente")
          .order(fechaCol, { ascending: true });
          
        if (!errorDeudas && deudasData && deudasData.length > 0) {
          deudas = deudasData.map(d => ({ ...d, fecha_vencimiento: d[fechaCol] }));
          deudasErr = null;
          break;
        }
      } catch (e) {
        // Continuar con el siguiente intento
      }
    }
    
    if (deudasErr) {
      console.error("Error al obtener deudas:", deudasErr);
      throw deudasErr;
    }

    // Filtrar deudas vencidas
    const hoy = new Date();
    const deudasVencidas = deudas.filter(d => {
      if (!d.fecha_vencimiento) return false;
      const fechaVencimiento = new Date(d.fecha_vencimiento);
      return fechaVencimiento < hoy;
    });

    // Procesar ventas
    const ventasFiltradas = ventas?.filter(v => v.fecha) || [];
    const totalVentas = ventasFiltradas.reduce((sum, v) => sum + Number(v.total || 0), 0);

    // Procesar pagos
    const pagosFiltrados = pagos?.filter(p => p.fecha) || [];
    const totalPagos = pagosFiltrados.reduce((sum, p) => sum + Number(p.monto_pagado || 0), 0);

    // Obtener la última fecha de venta y pago
    const lastSaleDate = ventasFiltradas.length > 0 ? ventasFiltradas[0].fecha : null;
    const lastPaymentDate = pagosFiltrados.length > 0 ? pagosFiltrados[0].fecha : null;

    console.log("Historial del cliente:", {
      totalVentas,
      totalPagos,
      ultimaVenta: lastSaleDate,
      ultimoPago: lastPaymentDate,
      numVentas: ventasFiltradas.length,
      numPagos: pagosFiltrados.length,
      numDeudas: deudas.length,
      numDeudasVencidas: deudasVencidas.length
    });

    return {
      ventas: ventasFiltradas.length,
      totalVentas,
      pagos: pagosFiltrados.length,
      totalPagos,
      ventasDetalles: ventasFiltradas,
      pagosDetalles: pagosFiltrados,
      lastSaleDate,
      lastPaymentDate,
      deudas,
      deudasVencidas,
    };
  } catch (err) {
    console.error("Error en getClientHistory:", err);
    return {
      ventas: 0,
      totalVentas: 0,
      pagos: 0,
      totalPagos: 0,
      ventasDetalles: [],
      pagosDetalles: [],
      lastSaleDate: null,
      lastPaymentDate: null,
      deudas: [],
      deudasVencidas: [],
    };
  }
}

/**
 * Obtiene perfil de crédito con manejo de errores mejorado - VERSIÓN ROBUSTA
 */
export async function getCreditProfile(clienteId) {
  if (!clienteId) return null;

  try {
    // Intentar obtener el perfil desde la vista
    const { data, error } = await supabase
      .from("v_cxc_cliente_detalle")
      .select("*")
      .eq("cliente_id", clienteId)
      .single();

    if (error) {
      // Si no funciona con la vista, intentar con la tabla directamente
      if (error.code === "PGRST116") {
        console.warn("Vista no encontrada, intentando con tabla...");
        const { data: tableData, error: tableError } = await supabase
          .from("cxc_clientes")
          .select("*")
          .eq("id", clienteId)
          .single();
          
        if (tableError) {
          console.error("Error al obtener perfil de crédito desde tabla:", tableError);
          return null;
        }
        
        console.log("Perfil de crédito obtenido desde tabla:", {
          id: tableData.id,
          limite: tableData.limite,
          saldo: tableData.saldo,
          dias_retraso: tableData.dias_retraso,
          ultima_venta: tableData.ultima_venta,
          ultimo_pago: tableData.ultimo_pago
        });
        
        return tableData;
      }
      
      console.error("Error al obtener perfil de crédito:", error);
      return null;
    }

    // Verificar que el perfil tenga los campos necesarios
    if (!data) {
      console.warn("Perfil de crédito vacío para el cliente:", clienteId);
      return null;
    }

    console.log("Perfil de crédito obtenido desde vista:", {
      id: data.cliente_id,
      limite: data.limite,
      saldo: data.saldo,
      dias_retraso: data.dias_retraso,
      ultima_venta: data.ultima_venta,
      ultimo_pago: data.ultimo_pago
    });

    return data;
  } catch (err) {
    console.error("Error en getCreditProfile:", err);
    return null;
  }
}
/**
 * Analiza envejecimiento de deudas - CRÍTICO PARA EVALUACIÓN
 */
function analyzeDebtAging(deudas) {
  if (!deudas || deudas.length === 0) {
    return {
      totalVencido: 0,
      diasMaxVencido: 0,
      promedioVencido: 0,
      deudasCriticas: 0,
      montoCritico: 0,
    };
  }

  const hoy = new Date();
  let totalVencido = 0;
  let diasMaxVencido = 0;
  let diasAcumulado = 0;
  let deudasCriticas = 0;
  let montoCritico = 0;

  deudas.forEach(deuda => {
    const diasVencido = Math.floor((hoy - new Date(deuda.fecha_vencimiento)) / (1000 * 60 * 60 * 24));
    const monto = Number(deuda.monto_pendiente);
    
    if (diasVencido > 0) {
      totalVencido += monto;
      diasAcumulado += diasVencido;
      
      if (diasVencido > diasMaxVencido) {
        diasMaxVencido = diasVencido;
      }
      
      // Deudas críticas: más de 30 días vencidas o montos importantes (> 20% del límite)
      if (diasVencido > 30 || monto > 10000) { // 10000 es un monto importante, ajustar según negocio
        deudasCriticas++;
        montoCritico += monto;
      }
    }
  });

  return {
    totalVencido,
    diasMaxVencido,
    promedioVencido: deudas.length > 0 ? diasAcumulado / deudas.length : 0,
    deudasCriticas,
    montoCritico,
  };
}

/**
 * Analiza patrón de pago - ENFOQUE PRINCIPAL MEJORADO
 */
function analyzePaymentPattern(historialPagos, diasRetraso = 0, deudasVencidas = []) {
  // Cliente sin historial pero sin atrasos = EXCELENTE
  if (historialPagos.length < 2) {
    if (diasRetraso === 0) {
      return {
        patron: "puntual",
        puntualidad: 95, // MUY ALTO para beneficiar
        descripcion: "Cliente nuevo - sin atrasos registrados",
        promedioDias: 0,
        consistencia: 90, // ALTA consistencia por defecto
        fiabilidad: 95,
      };
    } else if (diasRetraso <= 5) {
      return {
        patron: "normal",
        puntualidad: 75,
        descripcion: `Pagador nuevo con ${diasRetraso} días de retraso leve`,
        promedioDias: diasRetraso,
        consistencia: 70,
        fiabilidad: 80,
      };
    } else if (diasRetraso <= 15) {
      return {
        patron: "tardio",
        puntualidad: 50,
        descripcion: `Pagador nuevo con ${diasRetraso} días de retraso`,
        promedioDias: diasRetraso,
        consistencia: 50,
        fiabilidad: 60,
      };
    } else {
      return {
        patron: "problematico",
        puntualidad: 25,
        descripcion: `Pagador nuevo con ${diasRetraso} días de retraso grave`,
        promedioDias: diasRetraso,
        consistencia: 30,
        fiabilidad: 30,
      };
    }
  }

  const fechasOrdenadas = historialPagos
    .map((p) => new Date(p.fecha))
    .sort((a, b) => a - b);

  let sumaIntervalos = 0;
  let pagosTarde = 0;
  let sumaRetrasos = 0;
  
  // Analizar cada pago comparado con el anterior
  for (let i = 1; i < fechasOrdenadas.length; i++) {
    const dias = (fechasOrdenadas[i] - fechasOrdenadas[i - 1]) / (1000 * 60 * 60 * 24);
    sumaIntervalos += dias;
    
    // Si tardó más de 15 días, considerar como pago tardío
    if (dias > 15) {
      pagosTarde++;
      sumaRetrasos += dias - 15;
    }
  }

  const promedioDias = Math.round(sumaIntervalos / (fechasOrdenadas.length - 1));
  const porcentajePagosTarde = pagosTarde / (fechasOrdenadas.length - 1);
  
  // Ajustar puntualidad según historial de atrasos
  let puntualidad = 100;
  if (porcentajePagosTarde > 0.5) {
    puntualidad -= 40; // Más de la mitad de los pagos tarde
  } else if (porcentajePagosTarde > 0.3) {
    puntualidad -= 25; // Más del 30% de los pagos tarde
  } else if (porcentajePagosTarde > 0.1) {
    puntualidad -= 15; // Más del 10% de los pagos tarde
  } else if (porcentajePagosTarde > 0) {
    puntualidad -= 5; // Algunos pagos tarde
  }
  
  // Penalizar por deudas vencidas importantes
  if (deudasVencidas.length > 0) {
    const maxDiasVencido = Math.max(...deudasVencidas.map(d => 
      Math.floor((new Date() - new Date(d.fecha_vencimiento)) / (1000 * 60 * 60 * 24))
    ));
    
    if (maxDiasVencido > 60) {
      puntualidad -= 30; // Deuda muy vencida
    } else if (maxDiasVencido > 30) {
      puntualidad -= 20; // Deuda vencida
    } else if (maxDiasVencido > 15) {
      puntualidad -= 10; // Deuda ligeramente vencida
    }
  }

  let patron, descripcion;
  if (promedioDias <= 7 && puntualidad > 85) {
    patron = "puntual";
    descripcion = `Pagador puntual (paga cada ${promedioDias} días)`;
  } else if (promedioDias <= 15 && puntualidad > 70) {
    patron = "normal";
    descripcion = `Pagador normal (paga en ${promedioDias} días)`;
  } else if (promedioDias <= 30 && puntualidad > 50) {
    patron = "tardio";
    descripcion = `Pagador tardío (paga en ${promedioDias} días)`;
  } else {
    patron = "problematico";
    descripcion = `Pagador problemático (paga cada ${promedioDias} días)`;
  }

  const desviacion = Math.abs(promedioDias - 15) / 15;
  const consistencia = Math.max(30, Math.round(100 - desviacion * 50));
  
  // Fiabilidad combinada de puntualidad y consistencia
  const fiabilidad = Math.round((puntualidad + consistencia) / 2);

  return {
    patron,
    puntualidad: Math.max(0, puntualidad),
    descripcion,
    promedioDias,
    consistencia,
    fiabilidad,
  };
}

/**
 * Analiza tendencia de consumo
 */
function analyzeConsumptionTrend(ventasDetalles) {
  if (ventasDetalles.length < 4) {
    return {
      tendencia: "insuficiente",
      cambio: 0,
      descripcion: "Historial insuficiente para evaluar tendencia",
    };
  }

  const mitad = Math.floor(ventasDetalles.length / 2);
  const recientes = ventasDetalles.slice(0, mitad);
  const antiguas = ventasDetalles.slice(mitad);

  const promedioReciente = recientes.reduce((s, v) => s + Number(v.total), 0) / recientes.length;
  const promedioAntiguo = antiguas.reduce((s, v) => s + Number(v.total), 0) / antiguas.length;

  const cambio = ((promedioReciente - promedioAntiguo) / promedioAntiguo) * 100;

  let tendencia, descripcion;
  if (cambio > 20) {
    tendencia = "creciente";
    descripcion = `Consumo creciente (+${cambio.toFixed(0)}%)`;
  } else if (cambio < -20) {
    tendencia = "decreciente";
    descripcion = `Consumo decreciente (${cambio.toFixed(0)}%)`;
  } else {
    tendencia = "estable";
    descripcion = "Consumo estable";
  }

  return {
    tendencia,
    cambio,
    descripcion,
    promedioReciente,
    promedioAntiguo,
  };
}

/**
 * Analiza frecuencia de compra - MEJORADA
 */
function analyzeFrequency(ventasDetalles) {
  if (ventasDetalles.length === 0) {
    return {
      frecuencia: "nueva",
      diasEntreFechas: null,
      descripcion: "Cliente nuevo - sin compras",
    };
  }

  const fechas = ventasDetalles.map((v) => new Date(v.fecha)).sort((a, b) => a - b);
  let sumaIntervalos = 0;

  for (let i = 1; i < fechas.length; i++) {
    const dias = (fechas[i] - fechas[i - 1]) / (1000 * 60 * 60 * 24);
    sumaIntervalos += dias;
  }

  const diasEntreFechas = Math.round(sumaIntervalos / (fechas.length - 1));

  let frecuencia, descripcion;
  if (diasEntreFechas <= 7) {
    frecuencia = "muy_alta";
    descripcion = "Compra semanal - cliente muy activo";
  } else if (diasEntreFechas <= 15) {
    frecuencia = "alta";
    descripcion = "Compra quincenal - cliente activo";
  } else if (diasEntreFechas <= 30) {
    frecuencia = "normal";
    descripcion = "Compra mensual - cliente regular";
  } else if (diasEntreFechas <= 60) {
    frecuencia = "baja";
    descripcion = "Compra bimestral - cliente ocasional";
  } else {
    frecuencia = "muy_baja";
    descripcion = "Compra trimestral - cliente esporádico";
  }

  return {
    frecuencia,
    diasEntreFechas,
    descripcion,
  };
}

/**
 * Calcula días de inactividad CON MÚLTIPLES FUENTES
 */
function calcularDiasInactivo(lastSaleDate, perfil, historialVentas) {
  const hoy = new Date();
  let ultimaVenta = null;
  
  if (lastSaleDate) {
    ultimaVenta = new Date(lastSaleDate);
  }
  
  if (!ultimaVenta && perfil?.ultima_venta) {
    ultimaVenta = new Date(perfil.ultima_venta);
  }
  
  if (!ultimaVenta && historialVentas.length > 0) {
    ultimaVenta = new Date(historialVentas[0].fecha);
  }
  
  if (!ultimaVenta || isNaN(ultimaVenta.getTime())) {
    return 0;
  }
  
  const dias = Math.floor((hoy - ultimaVenta) / (1000 * 60 * 60 * 24));
  return Math.max(0, dias);
}

/**
 * MOTOR PRINCIPAL - ENFOCADO EN COMPORTAMIENTO DE PAGO MEJORADO
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
}) {
  // ==================== SCORE BASE ALTO PARA BUENOS PAGADORES ====================
  let score = 65; // Base alta
  const disponible = Math.max(0, limite - saldo);
  const disponibleDespuesVenta = Math.max(0, disponible - montoVenta);
  const ratio = limite > 0 ? saldo / limite : 0;

  // ==================== ANÁLISIS ====================
  const patronPago = analyzePaymentPattern(historialPagos, diasRetraso, deudasVencidas);
  const tendenciaConsumo = analyzeConsumptionTrend(historialVentas);
  const frecuencia = analyzeFrequency(historialVentas);
  const analisisDeudas = analyzeDebtAging(deudasVencidas);

  const promedioVentas =
    historialVentas.length > 0
      ? historialVentas.reduce((s, v) => s + Number(v.total), 0) / historialVentas.length
      : 0;

  const diasInactivo = calcularDiasInactivo(lastSaleDate, perfil, historialVentas);

  // ==================== SCORING - ENFOQUE EN PAGO MEJORADO ====================

  // 1. DÍAS DE RETRASO (40% del score) - MÁS PESO
  if (diasRetraso === 0 && analisisDeudas.totalVencido === 0) {
    score += 30; // GRAN BONUS por estar al día
  } else if (diasRetraso <= 5 && analisisDeudas.diasMaxVencido <= 5) {
    score += 15; // Retraso leve tolerado
  } else if (diasRetraso <= 10 && analisisDeudas.diasMaxVencido <= 10) {
    score += 5; // Retraso moderado
  } else if (diasRetraso <= 30 || analisisDeudas.diasMaxVencido <= 30) {
    score -= 20; // Serio
  } else if (diasRetraso <= 60 || analisisDeudas.diasMaxVencido <= 60) {
    score -= 40; // Muy serio
  } else {
    score -= 65; // Crítico
  }

  // 2. COMPORTAMIENTO DE PAGO (45% del score) - MÁXIMO PESO
  // Puntualidad vale 25 puntos
  const puntosPuntualidad = (patronPago.puntualidad / 100) * 25;
  score += puntosPuntualidad;
  
  // Consistencia vale 15 puntos
  const puntosConsistencia = (patronPago.consistencia / 100) * 15;
  score += puntosConsistencia;

  // Fiabilidad combinada 5 puntos
  const puntosFiabilidad = (patronPago.fiabilidad / 100) * 5;
  score += puntosFiabilidad;

  // 3. USO DE CRÉDITO (10% del score) - MENOS PESO
  // Solo penaliza si hay sobregiro o uso extremo
  if (ratio < 0.9) {
    score += 0; // Cualquier uso < 90% es aceptable
  } else if (ratio < 1.0) {
    score -= 5; // 90-100% precaución leve
  } else if (ratio < 1.2) {
    score -= 20; // Sobregiro moderado
  } else if (ratio < 1.5) {
    score -= 50; // Sobregiro crítico
  } else {
    score -= 80; // Sobregiro extremo
  }

  // 4. FRECUENCIA (5%)
  const puntosFrec = {
    muy_alta: 5,
    alta: 4,
    normal: 3,
    baja: 0,
    muy_baja: -3,
    nueva: 3, // Neutral para nuevos
  };
  score += puntosFrec[frecuencia.frecuencia] || 0;

  // Normalizar
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ==================== REGLA DE ORO ====================
  // Sin atrasos + uso < 90% = AUTOMÁTICAMENTE VERDE
  if (diasRetraso === 0 && analisisDeudas.totalVencido === 0 && ratio < 0.9) {
    score = Math.max(score, 80); // Mínimo 80 puntos
  }

  // ==================== UMBRALES ====================
  let nivel, emoji, accion;
  
  if (score >= 80) {
    nivel = "bajo";
    emoji = "🟢";
    accion = "aprobar";
  } else if (score >= 60) {
    nivel = "medio";
    emoji = "🟡";
    accion = diasRetraso > 20 || analisisDeudas.diasMaxVencido > 30 || ratio > 0.95 ? "pago_parcial" : "aprobar_con_cuidado";
  } else if (score >= 40) {
    nivel = "alto";
    emoji = "🟠";
    accion = "pago_parcial";
  } else {
    nivel = "critico";
    emoji = "🔴";
    accion = "rechazar";
  }

  // Override para sobregiro extremo
  if (ratio >= 1.5) {
    nivel = "critico";
    emoji = "🔴";
    accion = "rechazar";
    score = Math.min(score, 25);
  }

  // Override para deudas muy vencidas
  if (analisisDeudas.diasMaxVencido > 60) {
    nivel = "critico";
    emoji = "🔴";
    accion = "rechazar";
    score = Math.min(score, 30);
  }

  // ==================== LÍMITE SEGURO MEJORADO ====================
  let limiteSeguro = disponible * 0.7;

  if (patronPago.patron === "puntual" && diasRetraso === 0 && analisisDeudas.totalVencido === 0) {
    limiteSeguro = disponible * 0.9; // Generoso con buenos pagadores
  } else if (patronPago.patron === "problematico" || diasRetraso > 30 || analisisDeudas.diasMaxVencido > 30) {
    limiteSeguro = disponible * 0.3; // Restrictivo con malos pagadores
  } else if (analisisDeudas.deudasCriticas > 0) {
    limiteSeguro = disponible * 0.5; // Precaución con deudas críticas
  }

  limiteSeguro = Math.max(0, Math.round(limiteSeguro));

  // ==================== RECOMENDACIONES MEJORADAS ====================
  const recomendaciones = [];

  // Deudas
  if (analisisDeudas.totalVencido > 0) {
    const diasMaxVencido = analisisDeudas.diasMaxVencido;
    const montoVencido = analisisDeudas.totalVencido;
    
    recomendaciones.push(`🚨 DEUDA VENCIDA: ${diasMaxVencido} días - $${montoVencido.toFixed(2)}`);
    
    if (diasMaxVencido > 60) {
      recomendaciones.push("🔴 Gestión de cobro urgente requerida");
      recomendaciones.push("⚠️ No aprobar nuevas ventas hasta regularizar");
    } else if (diasMaxVencido > 30) {
      recomendaciones.push("🟠 Gestión de cobro prioritaria");
      recomendaciones.push("⚠️ Aprobar con pago inicial obligatorio");
    } else {
      recomendaciones.push("🟡 Recordatorio de pago pendiente");
    }
  }

  if (analisisDeudas.deudasCriticas > 0) {
    recomendaciones.push(`⚠️ ${analisisDeudas.deudasCriticas} deudas críticas detectadas`);
    recomendaciones.push(`💰 Monto crítico: $${analisisDeudas.montoCritico.toFixed(2)}`);
  }

  // Sobregiro
  if (ratio >= 1.0) {
    const porcentajeSobregiro = ((ratio - 1) * 100).toFixed(0);
    recomendaciones.push(`🚨 SOBREGIRO: ${porcentajeSobregiro}% sobre límite`);
    recomendaciones.push("💰 Requiere pago inmediato");
    recomendaciones.push("⚠️ No aprobar nuevas ventas hasta regularizar");
  }

  // Comportamiento de pago
  if (nivel === "bajo") {
    if (diasRetraso === 0 && analisisDeudas.totalVencido === 0) {
      recomendaciones.push("✅ Cliente confiable - aprobar venta");
    }
    if (patronPago.patron === "puntual") {
      recomendaciones.push("⭐ Excelente historial de pago");
    }
    if (ratio < 0.5) {
      recomendaciones.push("📊 Uso moderado de crédito");
    }
  }

  if (nivel === "medio") {
    if (diasRetraso > 0 || analisisDeudas.totalVencido > 0) {
      recomendaciones.push(`⏰ Atrasos detectados - gestionar`);
    }
    if (ratio > 0.8) {
      recomendaciones.push(`📈 Alto uso de crédito (${(ratio * 100).toFixed(0)}%)`);
    }
  }

  if (nivel === "alto" || nivel === "critico") {
    if (diasRetraso > 15 || analisisDeudas.diasMaxVencido > 15) {
      recomendaciones.push(`🚨 Atrasos significativos - gestión urgente`);
    }
    if (patronPago.patron === "problematico") {
      recomendaciones.push("📉 Patrón de pago problemático");
    }
    recomendaciones.push("💰 Solicitar pago antes de aprobar");
    recomendaciones.push("⚠️ Considerar suspender crédito");
  }

  // Frecuencia de compra
  if (frecuencia.frecuencia === "muy_baja" && diasInactivo > 60) {
    recomendaciones.push(`😴 Cliente inactivo (${diasInactivo} días) - campaña de reactivación`);
  }

  if (tendenciaConsumo.tendencia === "creciente" && patronPago.patron !== "problematico") {
    recomendaciones.push("📈 Consumo creciente - buen cliente");
  }

  if (tendenciaConsumo.tendencia === "decreciente" && patronPago.patron === "puntual") {
    recomendaciones.push("📉 Consumo decreciente - investigar causas");
  }

  // ==================== RESULTADO FINAL ====================
  return {
    score,
    nivel,
    emoji,
    accion,
    disponible: disponibleDespuesVenta,
    limiteSeguro,
    ratio,
    promedioVentas,
    diasInactivo,
    patronPago,
    tendenciaConsumo,
    frecuencia,
    analisisDeudas,
    recomendaciones,
  };
}

/**
 * Ejecuta análisis completo
 */
export async function runCreditAgent(clienteId, montoVenta = 0) {
  if (!clienteId) {
    return { error: "Cliente requerido" };
  }

  try {
    const historial = await getClientHistory(clienteId);
    const perfil = await getCreditProfile(clienteId);

    if (!perfil) {
      return {
        error: "No se encontró perfil de crédito",
        score: 75, // Alto para nuevos sin problemas
        nivel: "bajo",
        emoji: "🟢",
        accion: "aprobar",
        disponible: 0,
        limiteSeguro: 0,
        ratio: 0,
        diasInactivo: 0,
        recomendaciones: ["Cliente nuevo - establecer historial"],
      };
    }

    const limite = Number(String(perfil.limite).replace(/[^0-9.-]+/g, "")) || 0;
    const saldo = Number(String(perfil.saldo).replace(/[^0-9.-]+/g, "")) || 0;

    const resultado = evaluateCredit({
      saldo,
      limite,
      diasRetraso: perfil.dias_retraso || 0,
      montoVenta,
      historialVentas: historial.ventasDetalles || [],
      historialPagos: historial.pagosDetalles || [],
      lastSaleDate: historial.lastSaleDate || null,
      perfil: perfil,
      deudas: historial.deudas || [],
      deudasVencidas: historial.deudasVencidas || [],
    });

    return resultado;
  } catch (err) {
    console.error("Error en runCreditAgent:", err);
    return {
      error: err.message,
      score: 65,
      nivel: "medio",
      emoji: "🟡",
      accion: "aprobar_con_cuidado",
      recomendaciones: ["Error al evaluar - revisar manualmente"],
    };
  }
}