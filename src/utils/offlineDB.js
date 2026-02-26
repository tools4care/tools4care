// src/utils/offlineDB.js
import localforage from 'localforage';

// Configurar almacén local
localforage.config({
  name: 'tools4care',
  storeName: 'ventas_offline',
  description: 'Almacenamiento offline para ventas'
});

// Tiempo máximo de cache antes de refrescar (en ms)
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

function cacheEsValido(timestamp) {
  if (!timestamp) return false;
  return (Date.now() - new Date(timestamp).getTime()) < CACHE_TTL_MS;
}

// ==================== VENTAS PENDIENTES ====================

export async function guardarVentaOffline(venta) {
  try {
    const ventasPendientes = await obtenerVentasPendientes();
    const nuevaVenta = {
      ...venta,
      _offline_id: Date.now(),
      _offline_timestamp: new Date().toISOString(),
      _sincronizada: false
    };
    ventasPendientes.push(nuevaVenta);
    await localforage.setItem('ventas_pendientes', ventasPendientes);
    return nuevaVenta;
  } catch (error) {
    console.error('Error guardando venta offline:', error);
    throw error;
  }
}

export async function obtenerVentasPendientes() {
  try {
    const ventas = await localforage.getItem('ventas_pendientes');
    return ventas || [];
  } catch (error) {
    console.error('Error obteniendo ventas pendientes:', error);
    return [];
  }
}

export async function marcarVentaSincronizada(offlineId) {
  try {
    const ventas = await obtenerVentasPendientes();
    const ventasActualizadas = ventas.filter(v => v._offline_id !== offlineId);
    await localforage.setItem('ventas_pendientes', ventasActualizadas);
    return true;
  } catch (error) {
    console.error('Error marcando venta sincronizada:', error);
    return false;
  }
}

// ==================== CACHE DE DATOS ====================

export async function guardarInventarioCache(inventario) {
  try {
    await localforage.setItem('cache_inventario', {
      data: inventario,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error guardando inventario en cache:', error);
  }
}

export async function obtenerInventarioCache() {
  try {
    const cache = await localforage.getItem('cache_inventario');
    return cache?.data || [];
  } catch (error) {
    console.error('Error obteniendo inventario de cache:', error);
    return [];
  }
}

export async function guardarClientesCache(clientes) {
  try {
    await localforage.setItem('cache_clientes', {
      data: clientes,
      timestamp: new Date().toISOString()
    });
    console.log(`✅ ${clientes.length} clientes guardados en cache`);
  } catch (error) {
    console.error('Error guardando clientes en cache:', error);
  }
}

export async function obtenerClientesCache() {
  try {
    const cache = await localforage.getItem('cache_clientes');
    return cache?.data || [];
  } catch (error) {
    console.error('Error obteniendo clientes de cache:', error);
    return [];
  }
}

export async function clientesCacheEsValido() {
  try {
    const cache = await localforage.getItem('cache_clientes');
    return cache?.timestamp ? cacheEsValido(cache.timestamp) : false;
  } catch {
    return false;
  }
}

export async function obtenerFechaCacheClientes() {
  try {
    const cache = await localforage.getItem('cache_clientes');
    return cache?.timestamp || null;
  } catch {
    return null;
  }
}

// ==================== CACHE DE DEUDAS (ventas pendientes/parciales) ====================

export async function guardarDeudaCache(ventasConDeuda) {
  try {
    await localforage.setItem('cache_deudas', {
      data: ventasConDeuda,
      timestamp: new Date().toISOString(),
      total: ventasConDeuda.length,
    });
    console.log(`✅ ${ventasConDeuda.length} ventas con deuda guardadas en caché`);
  } catch (error) {
    console.error('Error guardando deudas en cache:', error);
  }
}

export async function obtenerDeudaCache() {
  try {
    const cache = await localforage.getItem('cache_deudas');
    return cache?.data || [];
  } catch (error) {
    console.error('Error obteniendo deudas de cache:', error);
    return [];
  }
}

// ==================== CACHE DE INVENTARIO (para ventas offline) ====================

export async function guardarInventarioVan(vanId, productos) {
  try {
    await localforage.setItem(`inventario_van_${vanId}`, {
      data: productos,
      timestamp: new Date().toISOString(),
      vanId
    });
    console.log(`✅ Inventario de van ${vanId} guardado en caché (${productos.length} productos)`);
  } catch (error) {
    console.error('Error guardando inventario de van:', error);
  }
}

export async function obtenerInventarioVan(vanId) {
  try {
    const cache = await localforage.getItem(`inventario_van_${vanId}`);
    if (cache?.data) {
      console.log(`📦 Inventario de van ${vanId} cargado desde caché`);
      return cache.data;
    }
    return [];
  } catch (error) {
    console.error('Error obteniendo inventario de van:', error);
    return [];
  }
}

export async function guardarTopProductos(vanId, productos) {
  try {
    await localforage.setItem(`top_productos_${vanId}`, {
      data: productos,
      timestamp: new Date().toISOString()
    });
    console.log(`✅ Top productos guardados en caché`);
  } catch (error) {
    console.error('Error guardando top productos:', error);
  }
}

export async function obtenerTopProductos(vanId) {
  try {
    const cache = await localforage.getItem(`top_productos_${vanId}`);
    return cache?.data || [];
  } catch (error) {
    console.error('Error obteniendo top productos:', error);
    return [];
  }
}

// ==================== BACKUP LOCAL DE BD ====================

/**
 * Guarda un snapshot de los datos críticos localmente
 * Se llama 2 veces al día (al iniciar sesión y a las 8pm)
 */
export async function guardarBackupLocal(datos) {
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      clientes: datos.clientes || [],
      inventario: datos.inventario || [],
      ventas_recientes: datos.ventas_recientes || [],
    };
    await localforage.setItem('backup_local', backup);

    // Guardar también historial de últimos 3 backups
    const historial = await localforage.getItem('backup_historial') || [];
    historial.unshift({ timestamp: backup.timestamp, registros: {
      clientes: backup.clientes.length,
      inventario: backup.inventario.length,
      ventas: backup.ventas_recientes.length,
    }});
    // Solo guardar los últimos 3
    await localforage.setItem('backup_historial', historial.slice(0, 3));

    console.log(`✅ Backup local guardado: ${backup.clientes.length} clientes, ${backup.inventario.length} productos`);
    return true;
  } catch (error) {
    console.error('Error guardando backup local:', error);
    return false;
  }
}

export async function obtenerBackupLocal() {
  try {
    return await localforage.getItem('backup_local') || null;
  } catch {
    return null;
  }
}

export async function obtenerHistorialBackups() {
  try {
    return await localforage.getItem('backup_historial') || [];
  } catch {
    return [];
  }
}

export async function obtenerFechaUltimoBackup() {
  try {
    const backup = await localforage.getItem('backup_local');
    return backup?.timestamp || null;
  } catch {
    return null;
  }
}

// ==================== PAGOS PENDIENTES OFFLINE ====================

/**
 * Guarda un pago en la cola offline cuando no hay conexión.
 * Se sincronizará automáticamente cuando vuelva la conexión.
 */
export async function guardarPagoOffline(pago) {
  try {
    const pagosPendientes = await obtenerPagosPendientes();
    const nuevoPago = {
      ...pago,
      _offline_id: Date.now(),
      _offline_timestamp: new Date().toISOString(),
      _sincronizada: false,
    };
    pagosPendientes.push(nuevoPago);
    await localforage.setItem('pagos_pendientes', pagosPendientes);
    console.log(`💾 Pago offline guardado: $${pago.monto} para cliente ${pago.cliente_id}`);
    return nuevoPago;
  } catch (error) {
    console.error('Error guardando pago offline:', error);
    throw error;
  }
}

export async function obtenerPagosPendientes() {
  try {
    const pagos = await localforage.getItem('pagos_pendientes');
    return pagos || [];
  } catch (error) {
    console.error('Error obteniendo pagos pendientes:', error);
    return [];
  }
}

export async function marcarPagoSincronizado(offlineId) {
  try {
    const pagos = await obtenerPagosPendientes();
    const pagosActualizados = pagos.filter(p => p._offline_id !== offlineId);
    await localforage.setItem('pagos_pendientes', pagosActualizados);
    return true;
  } catch (error) {
    console.error('Error marcando pago sincronizado:', error);
    return false;
  }
}

// ==================== EXPORT CSV ====================

/**
 * Descarga los clientes cacheados como CSV
 */
export async function exportarClientesCSV() {
  const clientes = await obtenerClientesCache();
  if (!clientes.length) throw new Error('No hay clientes en caché para exportar');

  const headers = ['ID', 'Nombre', 'Negocio', 'Teléfono', 'Email', 'Dirección', 'Balance'];
  const rows = clientes.map(c => [
    c.id ?? '',
    `"${(c.nombre ?? '').replace(/"/g, '""')}"`,
    `"${(c.negocio ?? '').replace(/"/g, '""')}"`,
    c.telefono ?? '',
    c.email ?? '',
    `"${(c.direccion ?? '').replace(/"/g, '""')}"`,
    Number(c.balance ?? 0).toFixed(2),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Descarga el inventario cacheado de una van como CSV
 */
export async function exportarInventarioCSV(vanId) {
  const inventario = await obtenerInventarioVan(vanId);
  if (!inventario.length) throw new Error('No hay inventario en caché para exportar');

  const headers = ['Código', 'Nombre', 'Marca', 'Cantidad', 'Precio'];
  const rows = inventario.map(i => {
    const p = i.productos || {};
    return [
      p.codigo ?? '',
      `"${(p.nombre ?? '').replace(/"/g, '""')}"`,
      `"${(p.marca ?? '').replace(/"/g, '""')}"`,
      i.cantidad ?? 0,
      Number(p.precio ?? 0).toFixed(2),
    ];
  });

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventario_van${vanId}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporta las deudas pendientes de clientes como CSV
 */
export async function exportarDeudasCSV() {
  // Usar clientes con balance para obtener deuda total por cliente
  const clientes = await obtenerClientesCache();
  const conDeuda = clientes.filter(c => Number(c.balance || 0) > 0);
  if (!conDeuda.length) throw new Error('No hay clientes con deuda en caché');

  const headers = ['ID', 'Nombre', 'Negocio', 'Teléfono', 'Balance (Deuda)'];
  const rows = conDeuda.map(c => [
    c.id ?? '',
    `"${(c.nombre ?? '').replace(/"/g, '""')}"`,
    `"${(c.negocio ?? '').replace(/"/g, '""')}"`,
    c.telefono ?? '',
    Number(c.balance ?? 0).toFixed(2),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deudas_clientes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Descarga el backup completo como JSON
 * Incluye: clientes, inventario, ventas recientes, ventas con deuda
 */
export async function exportarBackupJSON() {
  const backup = await obtenerBackupLocal();
  if (!backup) throw new Error('No hay backup local disponible');

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_tools4care_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== LIMPIEZA ====================

export async function limpiarDatosOffline() {
  try {
    await localforage.clear();
    return true;
  } catch (error) {
    console.error('Error limpiando datos offline:', error);
    return false;
  }
}
