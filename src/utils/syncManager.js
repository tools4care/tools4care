// src/utils/syncManager.js
import { supabase } from '../supabaseClient';
import { obtenerVentasPendientes, marcarVentaSincronizada, obtenerPagosPendientes, marcarPagoSincronizado } from './offlineDB';

/**
 * Sincroniza todas las ventas pendientes con Supabase
 */
export async function sincronizarVentasPendientes() {
  console.log('🔄 Iniciando sincronización de ventas pendientes...');

  try {
    // Obtener ventas pendientes de IndexedDB
    const ventasPendientes = await obtenerVentasPendientes();
    
    if (ventasPendientes.length === 0) {
      console.log('✅ No hay ventas pendientes para sincronizar');
      return {
        success: true,
        sincronizadas: 0,
        errores: 0,
        message: 'No hay ventas pendientes'
      };
    }

    console.log(`📦 Sincronizando ${ventasPendientes.length} venta(s)...`);

    let sincronizadas = 0;
    let errores = 0;
    const resultados = [];

    // Sincronizar cada venta
    for (const venta of ventasPendientes) {
      try {
        // ── Insertar venta con todos los campos que usa el insert online ──
        const { data: ventaData, error: ventaError } = await supabase
          .from('ventas')
          .insert({
            cliente_id: venta.cliente_id,
            van_id: venta.van_id,
            usuario_id: venta.usuario_id,
            // Totales — usar total_venta como columna principal
            total_venta: venta.total_venta ?? venta.total ?? 0,
            total: venta.total ?? venta.total_venta ?? 0,
            total_pagado: venta.total_pagado ?? 0,
            // Estado y método de pago
            estado_pago: venta.estado_pago || 'pendiente',
            metodo_pago: venta.metodo_pago || null,
            // Desglose por forma de pago
            pago_efectivo: venta.pago_efectivo ?? 0,
            pago_tarjeta: venta.pago_tarjeta ?? 0,
            pago_transferencia: venta.pago_transferencia ?? 0,
            pago_otro: venta.pago_otro ?? 0,
            // JSON de pago (si existe)
            pago: venta.pago ?? null,
            notas: venta.notas || null,
            // Usar created_at original de la transacción offline
            created_at: venta.created_at || venta._offline_timestamp || new Date().toISOString(),
          })
          .select()
          .single();

        if (ventaError) throw ventaError;

        const ventaId = ventaData.id;

        // ── Insertar items de la venta ──
        if (venta.items && venta.items.length > 0) {
          const { error: itemsError } = await supabase
            .from('detalle_ventas')
            .insert(
              venta.items.map(item => ({
                venta_id: ventaId,
                producto_id: item.producto_id,
                cantidad: item.cantidad,
                precio_unitario: item.precio_unit ?? item.precio_unitario ?? 0,
                descuento: item.descuento_pct ?? 0,
              }))
            );

          if (itemsError) {
            // Roll back the orphaned venta so it stays in the pending queue and retries next sync
            await supabase.from('ventas').delete().eq('id', ventaId);
            throw new Error(`detalle_ventas insert failed: ${itemsError.message}`);
          }
        }

        // ── Actualizar stock — single atomic UPDATE (no read-modify-write race) ──
        for (const item of venta.items || []) {
          try {
            await supabase.rpc('decrementar_stock_van', {
              p_van_id:      venta.van_id,
              p_producto_id: item.producto_id,
              p_cantidad:    item.cantidad,
            });
          } catch (stockErr) {
            // Stock update failure is non-fatal — sale is already saved; admin can reconcile
            console.error(`Stock update failed producto ${item.producto_id}:`, stockErr?.message);
          }
        }

        // ── Si había pagos en la venta, insertarlos también ──
        if (venta.payments && venta.payments.length > 0 && venta.total_pagado > 0) {
          for (const pago of venta.payments) {
            if (!Number(pago.monto)) continue;
            try {
              const { error: rpcError } = await supabase.rpc('cxc_registrar_pago', {
                p_cliente_id: venta.cliente_id,
                p_monto: Number(pago.monto),
                p_metodo: pago.forma || 'efectivo',
                p_van_id: venta.van_id,
                p_fecha: venta.created_at || new Date().toISOString(),
              });
              if (rpcError) {
                console.warn(`⚠️ RPC pago falló, insertando directo:`, rpcError.message);
                await supabase.from('pagos').insert([{
                  cliente_id: venta.cliente_id,
                  monto: Number(pago.monto),
                  metodo_pago: pago.forma || 'efectivo',
                  fecha_pago: venta.created_at || new Date().toISOString(),
                }]);
              }
            } catch (pagoErr) {
              console.warn(`⚠️ Error insertando pago de venta offline:`, pagoErr);
            }
          }
        }

        // ── Marcar como sincronizada ──
        await marcarVentaSincronizada(venta._offline_id);

        sincronizadas++;
        resultados.push({ id: venta._offline_id, success: true, ventaId });
        console.log(`✅ Venta ${venta._offline_id} sincronizada → ID ${ventaId} | ${venta.estado_pago} | $${venta.total_venta ?? venta.total}`);

      } catch (error) {
        errores++;
        resultados.push({
          id: venta._offline_id,
          success: false,
          error: error.message
        });
        console.error(`❌ Error sincronizando venta ${venta._offline_id}:`, error);
      }
    }

    console.log(`✅ Sincronización completada: ${sincronizadas} exitosas, ${errores} errores`);

    return {
      success: errores === 0,
      sincronizadas,
      errores,
      resultados,
      message: `${sincronizadas} venta(s) sincronizada(s)${errores > 0 ? `, ${errores} error(es)` : ''}`
    };

  } catch (error) {
    console.error('❌ Error en sincronización:', error);
    return {
      success: false,
      sincronizadas: 0,
      errores: 1,
      error: error.message,
      message: 'Error al sincronizar ventas'
    };
  }
}

/**
 * Sincroniza todos los pagos pendientes offline con Supabase
 * Se llama automáticamente cuando vuelve la conexión
 */
export async function sincronizarPagosPendientes() {
  console.log('🔄 Iniciando sincronización de pagos pendientes...');

  try {
    const pagosPendientes = await obtenerPagosPendientes();

    if (pagosPendientes.length === 0) {
      console.log('✅ No hay pagos pendientes para sincronizar');
      return { success: true, sincronizados: 0, errores: 0 };
    }

    console.log(`💳 Sincronizando ${pagosPendientes.length} pago(s) offline...`);

    let sincronizados = 0;
    let errores = 0;

    for (const pago of pagosPendientes) {
      try {
        // Intentar via RPC cxc_registrar_pago primero
        const { error: rpcError } = await supabase.rpc('cxc_registrar_pago', {
          p_cliente_id: pago.cliente_id,
          p_monto: pago.monto,
          p_metodo: pago.metodo_pago,
          p_van_id: pago.van_id,
          p_fecha: pago.fecha_pago,
        });

        if (rpcError) {
          // Fallback: insertar directamente en tabla pagos
          const { error: insError } = await supabase.from('pagos').insert([{
            cliente_id: pago.cliente_id,
            monto: pago.monto,
            metodo_pago: pago.metodo_pago,
            fecha_pago: pago.fecha_pago,
          }]);
          if (insError) throw insError;
        }

        await marcarPagoSincronizado(pago._offline_id);
        sincronizados++;
        console.log(`✅ Pago offline ${pago._offline_id} sincronizado: $${pago.monto} (${pago._cliente_nombre || pago.cliente_id})`);

      } catch (error) {
        errores++;
        console.error(`❌ Error sincronizando pago ${pago._offline_id}:`, error);
      }
    }

    console.log(`✅ Pagos sync: ${sincronizados} exitosos, ${errores} errores`);
    return { success: errores === 0, sincronizados, errores };

  } catch (error) {
    console.error('❌ Error en sincronización de pagos:', error);
    return { success: false, sincronizados: 0, errores: 1, error: error.message };
  }
}