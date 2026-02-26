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
        // Insertar venta en Supabase
        const { data: ventaData, error: ventaError } = await supabase
          .from('ventas')
          .insert({
            cliente_id: venta.cliente_id,
            van_id: venta.van_id,
            usuario_id: venta.usuario_id,
            total: venta.total,
            estado_pago: venta.estado_pago || 'pendiente',
            notas: venta.notas,
            fecha_venta: venta.fecha_venta || new Date().toISOString(),
          })
          .select()
          .single();

        if (ventaError) throw ventaError;

        const ventaId = ventaData.id;

        // Insertar items de la venta
        if (venta.items && venta.items.length > 0) {
          const { error: itemsError } = await supabase
            .from('detalle_ventas')
            .insert(
              venta.items.map(item => ({
                venta_id: ventaId,
                producto_id: item.producto_id,
                cantidad: item.cantidad,
                precio_unitario: item.precio_unitario || 0,
                descuento: 0,
              }))
            );

          if (itemsError) throw itemsError;
        }

        // Actualizar stock en Supabase
        for (const item of venta.items || []) {
          const { data: stockData } = await supabase
            .from('stock_van')
            .select('cantidad')
            .eq('van_id', venta.van_id)
            .eq('producto_id', item.producto_id)
            .single();

          if (stockData) {
            await supabase
              .from('stock_van')
              .update({ cantidad: stockData.cantidad - item.cantidad })
              .eq('van_id', venta.van_id)
              .eq('producto_id', item.producto_id);
          }
        }

        // Eliminar de IndexedDB después de sincronizar exitosamente
        await marcarVentaSincronizada(venta._offline_id);

        sincronizadas++;
        resultados.push({
          id: venta._offline_id,
          success: true,
          ventaId
        });

        console.log(`✅ Venta ${venta._offline_id} sincronizada exitosamente`);

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