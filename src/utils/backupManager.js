// src/utils/backupManager.js
// Sistema de backup automático local v3.0
// Guarda hasta 7 backups rotados en IndexedDB (localforage)
// con soporte para descarga y restauración desde archivo JSON.

import localforage from 'localforage';
import {
  guardarClientesCache,
  guardarInventarioVan,
  guardarDeudaCache,
  guardarInventarioCache,
  guardarBackupLocal,
  obtenerVentasPendientes,
  obtenerPagosPendientes,
  obtenerClientesCache,
  obtenerInventarioVan,
  obtenerDeudaCache,
} from './offlineDB';

// ==================== CONSTANTES ====================

const BACKUP_MAX_COUNT    = 7;
const BACKUP_MAX_AGE_DAYS = 14;
const BACKUP_LIST_KEY     = 'backup_auto_list';
const BACKUP_SEQ_KEY      = 'backup_sequence_counter';
const BACKUP_PREFIX       = 'backup_auto_';
const BACKUP_VERSION      = '3.0';
const SUPPORTED_VERSIONS  = ['2.0', '3.0'];

// ==================== HELPERS INTERNOS ====================

/**
 * Obtiene y auto-incrementa el contador de secuencia.
 * @returns {Promise<number>}
 */
async function _obtenerSecuencia() {
  try {
    const seq = (await localforage.getItem(BACKUP_SEQ_KEY)) || 0;
    const nuevo = (seq % 999) + 1;
    await localforage.setItem(BACKUP_SEQ_KEY, nuevo);
    return nuevo;
  } catch {
    return 1;
  }
}

/**
 * Genera un backup_id único con formato "backup_YYYYMMDD_HHmmss_NNN"
 */
async function _generarBackupId(sequence) {
  const now   = new Date();
  const date  = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time  = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const seq   = String(sequence).padStart(3, '0');
  return `${BACKUP_PREFIX}${date}_${time}_${seq}`;
}

/**
 * Calcula el resumen estadístico del backup.
 */
function _calcularResumen(clientes, inventario, ventasRecientes, ventasConDeuda, ventasPendientes, pagosPendientes) {
  const conDeuda      = clientes.filter(c => Number(c.balance || 0) > 0);
  const totalDeuda    = conDeuda.reduce((s, c) => s + Number(c.balance || 0), 0);
  const topDeudores   = [...conDeuda]
    .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
    .slice(0, 5)
    .map(c => ({ id: c.id, nombre: c.nombre, negocio: c.negocio, balance: Number(c.balance || 0) }));

  return {
    total_clientes:           clientes.length,
    clientes_con_deuda:       conDeuda.length,
    total_deuda:              Number(totalDeuda.toFixed(2)),
    total_inventario_items:   inventario.length,
    total_ventas_recientes:   ventasRecientes.length,
    total_ventas_con_deuda:   ventasConDeuda.length,
    ventas_pendientes_count:  ventasPendientes.length,
    pagos_pendientes_count:   pagosPendientes.length,
    top_deudores:             topDeudores,
  };
}

/**
 * Agrega un nuevo backup_id a la lista y rota si supera BACKUP_MAX_COUNT.
 * Elimina el backup más antiguo de localforage.
 * @returns {Promise<string[]>} lista actualizada
 */
async function _rotarBackups(listaActual, nuevoId) {
  const lista = [nuevoId, ...listaActual];
  if (lista.length > BACKUP_MAX_COUNT) {
    const eliminados = lista.splice(BACKUP_MAX_COUNT);
    for (const id of eliminados) {
      await localforage.removeItem(id);
    }
  }
  return lista;
}

// ==================== BACKUP AUTOMÁTICO ====================

/**
 * Crea y guarda un nuevo backup automático en localforage.
 * Rota los backups si hay más de 7.
 *
 * @param {object} datos
 * @param {string}   datos.van_id
 * @param {string}   [datos.van_nombre]
 * @param {string}   [datos.usuario_id]
 * @param {'auto'|'manual'} [datos.created_by]
 * @param {Array}    datos.clientes
 * @param {Array}    datos.inventario
 * @param {Array}    datos.ventas_recientes
 * @param {Array}    datos.ventas_con_deuda
 * @param {Array}    [datos.ventas_pendientes_offline]
 * @param {Array}    [datos.pagos_pendientes_offline]
 * @returns {Promise<object>} metadata del backup guardado
 */
export async function guardarBackupAutomatico(datos) {
  try {
    const {
      van_id,
      van_nombre        = `Van ${van_id}`,
      usuario_id        = null,
      created_by        = 'auto',
      clientes          = [],
      inventario        = [],
      ventas_recientes  = [],
      ventas_con_deuda  = [],
      ventas_pendientes_offline = [],
      pagos_pendientes_offline  = [],
    } = datos;

    const sequence  = await _obtenerSecuencia();
    const backup_id = await _generarBackupId(sequence);
    const resumen   = _calcularResumen(
      clientes, inventario, ventas_recientes, ventas_con_deuda,
      ventas_pendientes_offline, pagos_pendientes_offline
    );

    const backup = {
      backup_id,
      backup_version: BACKUP_VERSION,
      backup_sequence: sequence,
      timestamp: new Date().toISOString(),
      van_id,
      van_nombre,
      usuario_id,
      created_by,
      clientes,
      inventario,
      ventas_recientes,
      ventas_con_deuda,
      ventas_pendientes_offline,
      pagos_pendientes_offline,
      resumen,
    };

    // Guardar el backup completo
    await localforage.setItem(backup_id, backup);

    // Actualizar lista y rotar
    const listaActual = (await localforage.getItem(BACKUP_LIST_KEY)) || [];
    const nuevaLista  = await _rotarBackups(listaActual, backup_id);
    await localforage.setItem(BACKUP_LIST_KEY, nuevaLista);

    // Mantener compatibilidad con exportarBackupJSON() antiguo
    await guardarBackupLocal({
      clientes,
      inventario,
      ventas_recientes,
      ventas_con_deuda,
      backup_version: BACKUP_VERSION,
      van_id,
    });

    console.log(`✅ [BackupManager] Backup guardado: ${backup_id} (${clientes.length} clientes, ${inventario.length} productos, $${resumen.total_deuda} deuda)`);

    // Retornar solo la metadata (sin los arrays pesados)
    return _extraerMeta(backup);
  } catch (error) {
    console.error('❌ [BackupManager] Error guardando backup:', error);
    throw error;
  }
}

/**
 * Extrae solo la metadata de un backup (sin los arrays de datos).
 */
function _extraerMeta(backup) {
  const { clientes, inventario, ventas_recientes, ventas_con_deuda, ventas_pendientes_offline, pagos_pendientes_offline, ...meta } = backup;
  return meta;
}

// ==================== CONSULTAR BACKUPS ====================

/**
 * Retorna la lista de backups guardados (solo metadata, newest first).
 * @returns {Promise<object[]>}
 */
export async function obtenerBackupsGuardados() {
  try {
    const lista = (await localforage.getItem(BACKUP_LIST_KEY)) || [];
    const metas = await Promise.all(
      lista.map(async (id) => {
        try {
          const backup = await localforage.getItem(id);
          if (!backup) return null;
          return _extraerMeta(backup);
        } catch {
          return null;
        }
      })
    );
    return metas.filter(Boolean);
  } catch (error) {
    console.error('❌ [BackupManager] Error obteniendo backups:', error);
    return [];
  }
}

/**
 * Retorna el timestamp del último backup automático, o null.
 * @returns {Promise<string|null>}
 */
export async function obtenerFechaUltimoBackupAuto() {
  try {
    const lista = (await localforage.getItem(BACKUP_LIST_KEY)) || [];
    if (!lista.length) return null;
    const ultimo = await localforage.getItem(lista[0]);
    return ultimo?.timestamp || null;
  } catch {
    return null;
  }
}

// ==================== EXPORTAR / DESCARGAR ====================

/**
 * Descarga un backup específico como archivo JSON.
 * @param {string} backupId
 */
export async function exportarBackup(backupId) {
  const backup = await localforage.getItem(backupId);
  if (!backup) throw new Error(`Backup no encontrado: ${backupId}`);

  const fecha = backup.timestamp
    ? new Date(backup.timestamp).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `backup_tools4care_${fecha}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Descarga el backup más reciente como JSON.
 */
export async function exportarBackupReciente() {
  const lista = (await localforage.getItem(BACKUP_LIST_KEY)) || [];
  if (!lista.length) throw new Error('No hay backups guardados');
  await exportarBackup(lista[0]);
}

// ==================== IMPORTAR / RESTAURAR ====================

/**
 * Valida y previsualiza un archivo JSON de backup.
 * NO escribe nada en localforage.
 *
 * @param {File} file
 * @returns {Promise<{valid: boolean, error?: string, data?: object, resumen?: object, timestamp?: string, van_nombre?: string, backup_version?: string}>}
 */
export async function previsualizarBackup(file) {
  try {
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { valid: false, error: 'El archivo no es un JSON válido' };
    }

    // Validar estructura mínima
    if (!parsed.clientes || !Array.isArray(parsed.clientes)) {
      return { valid: false, error: 'El archivo no contiene datos de clientes válidos' };
    }
    if (!parsed.inventario || !Array.isArray(parsed.inventario)) {
      return { valid: false, error: 'El archivo no contiene datos de inventario válidos' };
    }
    if (!parsed.van_id) {
      return { valid: false, error: 'El archivo no contiene información de la van' };
    }

    const version = parsed.backup_version || parsed.version || '?';
    if (!SUPPORTED_VERSIONS.includes(version)) {
      return {
        valid: false,
        error: `Versión de backup no soportada: ${version}. Se esperaba ${SUPPORTED_VERSIONS.join(' o ')}`,
      };
    }

    // Calcular resumen si no existe (v2.0 no lo tiene)
    const resumen = parsed.resumen || _calcularResumen(
      parsed.clientes || [],
      parsed.inventario || [],
      parsed.ventas_recientes || [],
      parsed.ventas_con_deuda || [],
      [], []
    );

    return {
      valid:          true,
      backup_id:      parsed.backup_id || null,
      timestamp:      parsed.timestamp || null,
      van_nombre:     parsed.van_nombre || `Van ${parsed.van_id}`,
      backup_version: version,
      resumen,
      data:           parsed,
    };
  } catch (error) {
    return { valid: false, error: `Error leyendo archivo: ${error.message}` };
  }
}

/**
 * Restaura datos desde un backup parseado hacia los caches de localforage.
 * NO restaura ventas_pendientes ni pagos_pendientes (serían duplicados).
 *
 * @param {object} backupData - Objeto parsed del backup (desde previsualizarBackup().data)
 * @returns {Promise<{success: boolean, error?: string, restored?: object}>}
 */
export async function importarBackup(backupData) {
  try {
    const {
      van_id,
      clientes          = [],
      inventario        = [],
      ventas_recientes  = [],
      ventas_con_deuda  = [],
    } = backupData;

    if (!van_id) throw new Error('El backup no contiene van_id');

    // Restaurar en paralelo donde sea posible
    await Promise.all([
      guardarClientesCache(clientes),
      guardarInventarioCache(inventario),
      guardarDeudaCache(ventas_con_deuda),
    ]);

    // Restaurar inventario de la van específica
    await guardarInventarioVan(van_id, inventario);

    // Mantener backup_local actualizado para compatibilidad
    await guardarBackupLocal({
      clientes,
      inventario,
      ventas_recientes,
      ventas_con_deuda,
      backup_version: backupData.backup_version || BACKUP_VERSION,
      van_id,
    });

    console.log(`✅ [BackupManager] Restauración completa: ${clientes.length} clientes, ${inventario.length} productos, ${ventas_con_deuda.length} deudas`);

    return {
      success: true,
      restored: {
        clientes:         clientes.length,
        inventario:       inventario.length,
        ventas_recientes: ventas_recientes.length,
        deudas:           ventas_con_deuda.length,
      },
    };
  } catch (error) {
    console.error('❌ [BackupManager] Error en restauración:', error);
    return { success: false, error: error.message };
  }
}

// ==================== HOUSEKEEPING ====================

/**
 * Elimina backups más viejos que BACKUP_MAX_AGE_DAYS días.
 * También limpia huérfanos (claves backup_auto_* no en la lista).
 * @returns {Promise<number>} cantidad de backups eliminados
 */
export async function limpiarBackupsAntiguos() {
  try {
    const lista       = (await localforage.getItem(BACKUP_LIST_KEY)) || [];
    const corte       = Date.now() - BACKUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const nuevaLista  = [];
    let eliminados    = 0;

    for (const id of lista) {
      const backup = await localforage.getItem(id);
      if (!backup) { eliminados++; continue; } // huérfano
      const ts = backup.timestamp ? new Date(backup.timestamp).getTime() : 0;
      if (ts < corte) {
        await localforage.removeItem(id);
        eliminados++;
      } else {
        nuevaLista.push(id);
      }
    }

    await localforage.setItem(BACKUP_LIST_KEY, nuevaLista);
    if (eliminados > 0) {
      console.log(`🧹 [BackupManager] ${eliminados} backup(s) antiguo(s) eliminado(s)`);
    }
    return eliminados;
  } catch (error) {
    console.error('❌ [BackupManager] Error limpiando backups:', error);
    return 0;
  }
}

/**
 * Crea un backup manual usando los datos actualmente en cache.
 * Útil cuando el usuario quiere un backup sin hacer un sync completo.
 *
 * @param {object} opts
 * @param {string} opts.van_id
 * @param {string} [opts.van_nombre]
 * @param {string} [opts.usuario_id]
 * @returns {Promise<object>} metadata del backup creado
 */
export async function crearBackupManual({ van_id, van_nombre, usuario_id }) {
  const [clientes, inventario, deudas, ventasPend, pagosPend] = await Promise.all([
    obtenerClientesCache(),
    obtenerInventarioVan(van_id),
    obtenerDeudaCache(),
    obtenerVentasPendientes(),
    obtenerPagosPendientes(),
  ]);

  return guardarBackupAutomatico({
    van_id,
    van_nombre,
    usuario_id,
    created_by:               'manual',
    clientes,
    inventario,
    ventas_recientes:         [],
    ventas_con_deuda:         deudas,
    ventas_pendientes_offline: ventasPend,
    pagos_pendientes_offline:  pagosPend,
  });
}
