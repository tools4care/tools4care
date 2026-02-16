// src/lib/paymentAgreements.js
// ============================================================
// CRUD de Acuerdos de Pago
// Se integra con Supabase y el motor de reglas de crédito
// ============================================================

import { supabase } from "../supabaseClient";
import { generarPlanPago, CREDIT_RULES_CONFIG as CFG } from "./creditRulesEngine";

// ========================= CONSULTAS =========================

/**
 * Obtiene resumen de acuerdos para un cliente (usa la vista v_acuerdos_cliente)
 * Si la vista no existe, hace el cálculo manual
 * @param {string} clienteId
 * @returns {Promise<Object|null>}
 */
export async function getAcuerdosResumen(clienteId) {
  if (!clienteId) return null;

  try {
    // Intentar con la vista
    const { data, error } = await supabase
      .from("v_acuerdos_cliente")
      .select("*")
      .eq("cliente_id", clienteId)
      .maybeSingle();

    if (!error && data) return data;

    // Fallback: calcular manualmente
    return await _calcularResumenManual(clienteId);
  } catch (err) {
    console.error("Error en getAcuerdosResumen:", err);
    return await _calcularResumenManual(clienteId);
  }
}

/**
 * Fallback cuando la vista no existe
 */
async function _calcularResumenManual(clienteId) {
  try {
    const { data: acuerdos, error } = await supabase
      .from("acuerdos_pago")
      .select(`
        id, estado, monto_total, monto_pagado, cuotas_vencidas, dias_max_atraso,
        cuotas_acuerdo (
          id, estado, monto, monto_pagado, fecha_vencimiento, dias_atraso
        )
      `)
      .eq("cliente_id", clienteId)
      .in("estado", ["activo", "roto", "completado"]);

    if (error || !acuerdos) {
      return _resumenVacio();
    }

    const activos = acuerdos.filter((a) => a.estado === "activo");
    const rotos = acuerdos.filter((a) => a.estado === "roto");
    const completados = acuerdos.filter((a) => a.estado === "completado");

    // Cuotas vencidas de acuerdos activos
    let cuotasVencidasTotal = 0;
    let proximaCuotaFecha = null;
    let proximaCuotaMonto = null;

    for (const a of activos) {
      const cuotas = a.cuotas_acuerdo || [];
      for (const c of cuotas) {
        if (c.estado === "vencida") cuotasVencidasTotal++;
        if (
          (c.estado === "pendiente" || c.estado === "parcial") &&
          (!proximaCuotaFecha || new Date(c.fecha_vencimiento) < new Date(proximaCuotaFecha))
        ) {
          proximaCuotaFecha = c.fecha_vencimiento;
          proximaCuotaMonto = Number(c.monto) - Number(c.monto_pagado || 0);
        }
      }
    }

    const deudaEnAcuerdos = activos.reduce(
      (sum, a) => sum + Math.max(0, Number(a.monto_total) - Number(a.monto_pagado)),
      0
    );
    const maxAtrasoActivo = Math.max(0, ...activos.map((a) => a.dias_max_atraso || 0));

    return {
      total_acuerdos: acuerdos.length,
      acuerdos_activos: activos.length,
      acuerdos_rotos: rotos.length,
      acuerdos_completados: completados.length,
      deuda_en_acuerdos: deudaEnAcuerdos,
      max_atraso_activo: maxAtrasoActivo,
      cuotas_vencidas_total: cuotasVencidasTotal,
      proxima_cuota_fecha: proximaCuotaFecha,
      proxima_cuota_monto: proximaCuotaMonto,
    };
  } catch (err) {
    console.error("Error en _calcularResumenManual:", err);
    return _resumenVacio();
  }
}

function _resumenVacio() {
  return {
    total_acuerdos: 0,
    acuerdos_activos: 0,
    acuerdos_rotos: 0,
    acuerdos_completados: 0,
    deuda_en_acuerdos: 0,
    max_atraso_activo: 0,
    cuotas_vencidas_total: 0,
    proxima_cuota_fecha: null,
    proxima_cuota_monto: null,
  };
}

/**
 * Obtiene acuerdos activos detallados de un cliente (con cuotas)
 * @param {string} clienteId
 * @returns {Promise<Array>}
 */
export async function getAcuerdosActivos(clienteId) {
  if (!clienteId) return [];

  try {
    const { data, error } = await supabase
      .from("acuerdos_pago")
      .select(`
        *,
        cuotas_acuerdo (
          id, numero_cuota, monto, monto_pagado, fecha_vencimiento, fecha_pago, estado, dias_atraso
        )
      `)
      .eq("cliente_id", clienteId)
      .in("estado", ["activo", "roto"])
      .order("fecha_acuerdo", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error en getAcuerdosActivos:", err);
    return [];
  }
}

/**
 * Calcula los días desde la deuda más vieja sin pagar
 * @param {string} clienteId
 * @returns {Promise<number>}
 */
export async function getDiasDeudaMasVieja(clienteId) {
  if (!clienteId) return 0;

  try {
    // Buscar la cuota/movimiento más viejo sin pagar
    const { data, error } = await supabase
      .from("cuotas_acuerdo")
      .select(`
        fecha_vencimiento,
        acuerdos_pago!inner (cliente_id, estado)
      `)
      .eq("acuerdos_pago.cliente_id", clienteId)
      .eq("acuerdos_pago.estado", "activo")
      .in("estado", ["pendiente", "vencida", "parcial"])
      .order("fecha_vencimiento", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      // Fallback: usar cxc_movimientos
      return await _diasDeudaFallback(clienteId);
    }

    const fecha = new Date(data.fecha_vencimiento);
    const dias = Math.floor((Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, dias);
  } catch (err) {
    console.error("Error en getDiasDeudaMasVieja:", err);
    return await _diasDeudaFallback(clienteId);
  }
}

/**
 * Fallback: calcula días de deuda usando cxc_movimientos
 */
async function _diasDeudaFallback(clienteId) {
  try {
    const { data, error } = await supabase
      .from("cxc_movimientos")
      .select("fecha")
      .eq("cliente_id", clienteId)
      .eq("tipo", "venta")
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return 0;

    const fecha = new Date(data.fecha);
    const dias = Math.floor((Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, dias);
  } catch {
    return 0;
  }
}


// ========================= CREAR ACUERDO =========================

/**
 * Crea un acuerdo de pago con sus cuotas
 * @param {Object} params
 * @param {string} params.clienteId
 * @param {string} [params.ventaId]
 * @param {string} [params.vanId]
 * @param {string} [params.usuarioId]
 * @param {number} params.montoCredito - Lo que quedó sin pagar de la venta
 * @param {number} [params.numCuotas] - Número de cuotas (auto si no se da)
 * @param {boolean} [params.excepcionVendedor] - Si fue aprobada con excepción
 * @param {string} [params.excepcionNota] - Nota de la excepción
 * @returns {Promise<{ok: boolean, acuerdo?: Object, error?: string}>}
 */
export async function crearAcuerdo({
  clienteId,
  ventaId = null,
  vanId = null,
  usuarioId = null,
  montoCredito,
  numCuotas = null,
  excepcionVendedor = false,
  excepcionNota = null,
}) {
  if (!clienteId || !montoCredito || montoCredito <= 0) {
    return { ok: false, error: "Cliente y monto son requeridos" };
  }

  try {
    // Generar plan de pago
    const plan = generarPlanPago(montoCredito, { numCuotas });

    // 1) Insertar acuerdo
    const { data: acuerdo, error: errAcuerdo } = await supabase
      .from("acuerdos_pago")
      .insert([
        {
          cliente_id: clienteId,
          venta_id: ventaId,
          van_id: vanId,
          usuario_id: usuarioId,
          monto_total: plan.monto_total,
          num_cuotas: plan.num_cuotas,
          dias_plazo: plan.dias_plazo,
          fecha_limite: plan.fecha_limite,
          excepcion_vendedor: excepcionVendedor,
          excepcion_nota: excepcionNota,
        },
      ])
      .select()
      .single();

    if (errAcuerdo) throw errAcuerdo;

    // 2) Insertar cuotas
    const cuotasInsert = plan.cuotas.map((c) => ({
      acuerdo_id: acuerdo.id,
      numero_cuota: c.numero_cuota,
      monto: c.monto,
      fecha_vencimiento: c.fecha_vencimiento,
    }));

    const { data: cuotas, error: errCuotas } = await supabase
      .from("cuotas_acuerdo")
      .insert(cuotasInsert)
      .select();

    if (errCuotas) {
      // Rollback: eliminar acuerdo
      await supabase.from("acuerdos_pago").delete().eq("id", acuerdo.id);
      throw errCuotas;
    }

    console.log(`✅ Acuerdo creado: ${acuerdo.id} — ${plan.num_cuotas} cuotas de ${plan.monto_total}`);

    return {
      ok: true,
      acuerdo: {
        ...acuerdo,
        cuotas: cuotas || cuotasInsert,
        plan, // incluir plan para SMS
      },
    };
  } catch (err) {
    console.error("Error creando acuerdo:", err);
    return { ok: false, error: err.message || "Error desconocido" };
  }
}


// ========================= REGISTRAR PAGO =========================

/**
 * Aplica un pago a los acuerdos del cliente (cuotas más antiguas primero)
 * Primero intenta la función SQL, luego fallback manual
 * @param {string} clienteId
 * @param {number} monto
 * @returns {Promise<{ok: boolean, aplicado?: number, cuotas_pagadas?: number}>}
 */
export async function aplicarPagoAAcuerdos(clienteId, monto) {
  if (!clienteId || !monto || monto <= 0) {
    return { ok: false, error: "Cliente y monto requeridos" };
  }

  try {
    // Intentar con función SQL
    const { data, error } = await supabase.rpc("fn_aplicar_pago_a_acuerdo", {
      p_cliente_id: clienteId,
      p_monto: monto,
    });

    if (!error && data) {
      return {
        ok: true,
        aplicado: Number(data.aplicado || 0),
        cuotas_pagadas: Number(data.cuotas_pagadas || 0),
        restante: Number(data.restante || 0),
      };
    }

    // Fallback manual
    return await _aplicarPagoManual(clienteId, monto);
  } catch (err) {
    console.error("Error en aplicarPagoAAcuerdos:", err);
    return await _aplicarPagoManual(clienteId, monto);
  }
}

/**
 * Fallback: aplicar pagos manualmente desde JS
 */
async function _aplicarPagoManual(clienteId, monto) {
  try {
    // Obtener cuotas pendientes ordenadas por fecha
    const { data: cuotas, error } = await supabase
      .from("cuotas_acuerdo")
      .select(`
        id, acuerdo_id, monto, monto_pagado, estado,
        acuerdos_pago!inner (cliente_id, estado)
      `)
      .eq("acuerdos_pago.cliente_id", clienteId)
      .in("acuerdos_pago.estado", ["activo", "roto"])
      .in("estado", ["pendiente", "vencida", "parcial"])
      .order("fecha_vencimiento", { ascending: true });

    if (error || !cuotas || cuotas.length === 0) {
      return { ok: true, aplicado: 0, cuotas_pagadas: 0, restante: monto };
    }

    let restante = monto;
    let totalAplicado = 0;
    let cuotasPagadas = 0;

    for (const cuota of cuotas) {
      if (restante <= 0) break;

      const pendiente = Number(cuota.monto) - Number(cuota.monto_pagado || 0);
      if (pendiente <= 0) continue;

      const aplica = Math.min(restante, pendiente);
      const nuevoPagado = Number(cuota.monto_pagado || 0) + aplica;
      const nuevoEstado = nuevoPagado >= Number(cuota.monto) ? "pagada" : "parcial";

      const updateData = {
        monto_pagado: Number(nuevoPagado.toFixed(2)),
        estado: nuevoEstado,
      };
      if (nuevoEstado === "pagada") {
        updateData.fecha_pago = new Date().toISOString();
      }

      await supabase.from("cuotas_acuerdo").update(updateData).eq("id", cuota.id);

      // Actualizar acuerdo padre
      await supabase
        .from("acuerdos_pago")
        .update({
          monto_pagado: supabase.rpc ? undefined : undefined, // solo si hay RPC
        })
        .eq("id", cuota.acuerdo_id);

      // Recalcular monto_pagado del acuerdo
      const { data: hermanas } = await supabase
        .from("cuotas_acuerdo")
        .select("monto_pagado")
        .eq("acuerdo_id", cuota.acuerdo_id);

      if (hermanas) {
        const totalPagadoAcuerdo = hermanas.reduce(
          (s, c) => s + Number(c.monto_pagado || 0),
          0
        );
        await supabase
          .from("acuerdos_pago")
          .update({ monto_pagado: Number(totalPagadoAcuerdo.toFixed(2)) })
          .eq("id", cuota.acuerdo_id);
      }

      restante -= aplica;
      totalAplicado += aplica;
      if (nuevoEstado === "pagada") cuotasPagadas++;
    }

    // Verificar si algún acuerdo se completó
    const acuerdoIds = [...new Set(cuotas.map((c) => c.acuerdo_id))];
    for (const aid of acuerdoIds) {
      const { data: acuerdo } = await supabase
        .from("acuerdos_pago")
        .select("monto_total, monto_pagado")
        .eq("id", aid)
        .single();

      if (acuerdo && Number(acuerdo.monto_pagado) >= Number(acuerdo.monto_total) - 0.01) {
        await supabase
          .from("acuerdos_pago")
          .update({ estado: "completado" })
          .eq("id", aid);
      }
    }

    return {
      ok: true,
      aplicado: Number(totalAplicado.toFixed(2)),
      cuotas_pagadas: cuotasPagadas,
      restante: Number(restante.toFixed(2)),
    };
  } catch (err) {
    console.error("Error en _aplicarPagoManual:", err);
    return { ok: false, error: err.message };
  }
}


// ========================= ACTUALIZAR VENCIDAS =========================

/**
 * Marca cuotas vencidas y acuerdos rotos
 * Llamar antes de evaluar crédito o al cargar cliente
 * @param {string} clienteId
 */
export async function actualizarVencidas(clienteId) {
  if (!clienteId) return;

  try {
    // Intentar función SQL (más eficiente)
    await supabase.rpc("fn_actualizar_cuotas_vencidas");
  } catch {
    // Fallback manual
    try {
      const hoy = new Date();

      // Obtener cuotas pendientes vencidas del cliente
      const { data: cuotas } = await supabase
        .from("cuotas_acuerdo")
        .select(`
          id, fecha_vencimiento,
          acuerdos_pago!inner (id, cliente_id, estado)
        `)
        .eq("acuerdos_pago.cliente_id", clienteId)
        .eq("acuerdos_pago.estado", "activo")
        .in("estado", ["pendiente", "parcial"]);

      if (!cuotas) return;

      for (const c of cuotas) {
        const vencimiento = new Date(c.fecha_vencimiento);
        if (vencimiento < hoy) {
          const diasAtraso = Math.floor(
            (hoy.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24)
          );

          await supabase
            .from("cuotas_acuerdo")
            .update({
              estado: "vencida",
              dias_atraso: diasAtraso,
            })
            .eq("id", c.id);

          // Si tiene más de 5 días de atraso, marcar acuerdo como roto
          if (diasAtraso > CFG.DIAS_GRACIA_CUOTA + 3) {
            await supabase
              .from("acuerdos_pago")
              .update({ estado: "roto" })
              .eq("id", c.acuerdos_pago.id);
          }
        }
      }
    } catch (err) {
      console.error("Error actualizando vencidas (fallback):", err);
    }
  }
}


// ========================= HELPER: verificar si tabla existe =========================

/**
 * Verifica si el sistema de acuerdos está disponible (tablas creadas)
 * Cachea el resultado por 5 minutos
 */
let _tablaExisteCache = null;
let _tablaExisteCacheTime = 0;

export async function isAgreementSystemAvailable() {
  const now = Date.now();
  if (_tablaExisteCache !== null && now - _tablaExisteCacheTime < 5 * 60 * 1000) {
    return _tablaExisteCache;
  }

  try {
    const { error } = await supabase
      .from("acuerdos_pago")
      .select("id")
      .limit(1);

    _tablaExisteCache = !error;
    _tablaExisteCacheTime = now;
    return _tablaExisteCache;
  } catch {
    _tablaExisteCache = false;
    _tablaExisteCacheTime = now;
    return false;
  }
}