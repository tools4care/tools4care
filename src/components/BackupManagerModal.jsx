// src/components/BackupManagerModal.jsx
// Modal para gestión completa de backups locales:
//  - Ver backups guardados (hasta 7)
//  - Descargar backup como JSON
//  - Restaurar backup existente a los caches locales
//  - Importar un archivo JSON de backup externo

import { useState, useEffect, useRef, useCallback } from 'react';
import localforage from 'localforage';
import { useToast } from '../hooks/useToast';
import {
  obtenerBackupsGuardados,
  exportarBackup,
  previsualizarBackup,
  importarBackup,
  crearBackupManual,
  limpiarBackupsAntiguos,
} from '../utils/backupManager';

// ==================== HELPERS ====================

function fmtFecha(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtMoneda(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tiempoRelativo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return `hace ${d} día${d > 1 ? 's' : ''}`;
  if (h >= 1) return `hace ${h} hora${h > 1 ? 's' : ''}`;
  return 'hace menos de 1 hora';
}

// ==================== SUB-COMPONENTES ====================

function BadgeCreatedBy({ type }) {
  if (type === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
        ✋ Manual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
      🤖 Auto
    </span>
  );
}

function ResumenPills({ resumen }) {
  if (!resumen) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
        👥 {resumen.total_clientes} clientes
      </span>
      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
        📦 {resumen.total_inventario_items} productos
      </span>
      <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">
        💰 {fmtMoneda(resumen.total_deuda)} deuda
      </span>
      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
        🧾 {resumen.total_ventas_recientes} ventas
      </span>
    </div>
  );
}

// ==================== TAB: BACKUPS GUARDADOS ====================

function TabBackupsGuardados({ vanId, vanNombre, usuarioId, onRefresh }) {
  const { confirm } = useToast();
  const [backups, setBackups]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [exportingId, setExportingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [creatingManual, setCreatingManual] = useState(false);
  const [limpiando, setLimpiando]     = useState(false);
  const [mensaje, setMensaje]         = useState(null); // { tipo: 'ok'|'error', texto }

  const cargar = useCallback(async () => {
    setLoading(true);
    const lista = await obtenerBackupsGuardados();
    setBackups(lista);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleExportar = async (backupId) => {
    try {
      setExportingId(backupId);
      await exportarBackup(backupId);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message });
    } finally {
      setExportingId(null);
    }
  };

  const handleRestaurar = async (backupId) => {
    const backup = backups.find(b => b.backup_id === backupId);
    if (!backup) return;

    const confirmar = await confirm(
      `¿Restaurar datos desde backup del ${fmtFecha(backup.timestamp)}? Esto reemplazará los datos locales de clientes, inventario y deudas. Las ventas pendientes offline NO serán afectadas.`,
      { confirmLabel: "Restaurar", danger: true }
    );
    if (!confirmar) return;

    try {
      setRestoringId(backupId);
      // Cargar el backup completo (no solo metadata) desde localforage
      const backupCompleto = await localforage.getItem(backupId);
      if (!backupCompleto) throw new Error('No se pudo cargar el backup completo');
      const result = await importarBackup(backupCompleto);
      if (result.success) {
        setMensaje({
          tipo: 'ok',
          texto: `✅ Restauración completa: ${result.restored.clientes} clientes, ${result.restored.inventario} productos, ${result.restored.deudas} deudas`,
        });
        onRefresh && onRefresh();
      } else {
        setMensaje({ tipo: 'error', texto: result.error });
      }
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message });
    } finally {
      setRestoringId(null);
    }
  };

  const handleCrearManual = async () => {
    try {
      setCreatingManual(true);
      await crearBackupManual({ van_id: vanId, van_nombre: vanNombre, usuario_id: usuarioId });
      setMensaje({ tipo: 'ok', texto: '✅ Backup manual creado correctamente' });
      await cargar();
      onRefresh && onRefresh();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message });
    } finally {
      setCreatingManual(false);
    }
  };

  const handleLimpiar = async () => {
    try {
      setLimpiando(true);
      const eliminados = await limpiarBackupsAntiguos();
      setMensaje({ tipo: 'ok', texto: `🧹 ${eliminados} backup(s) antiguo(s) eliminado(s)` });
      await cargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message });
    } finally {
      setLimpiando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <div className="animate-spin text-3xl mr-3">⏳</div>
        <span className="text-sm">Cargando backups...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mensaje de estado */}
      {mensaje && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${mensaje.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {mensaje.texto}
          <button onClick={() => setMensaje(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Lista de backups */}
      {backups.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-5xl mb-3">💾</div>
          <p className="font-semibold text-gray-500">No hay backups guardados</p>
          <p className="text-sm mt-1">El primer backup se creará automáticamente al sincronizar</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            {backups.length} de 7 backups guardados
          </p>
          {backups.map((b, idx) => (
            <div
              key={b.backup_id}
              className={`rounded-2xl border p-4 transition-all ${idx === 0 ? 'border-sky-200 bg-sky-50/40' : 'border-gray-100 bg-white'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-800">{fmtFecha(b.timestamp)}</span>
                    {idx === 0 && (
                      <span className="text-xs bg-sky-100 text-sky-700 font-semibold px-2 py-0.5 rounded-full">
                        Más reciente
                      </span>
                    )}
                    <BadgeCreatedBy type={b.created_by} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{tiempoRelativo(b.timestamp)} · {b.van_nombre}</p>
                  <ResumenPills resumen={b.resumen} />
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => handleExportar(b.backup_id)}
                    disabled={exportingId === b.backup_id}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all disabled:opacity-50"
                  >
                    {exportingId === b.backup_id ? '⏳' : '⬇️'} JSON
                  </button>
                  <button
                    onClick={() => handleRestaurar(b.backup_id)}
                    disabled={restoringId === b.backup_id}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-all disabled:opacity-50"
                  >
                    {restoringId === b.backup_id ? '⏳' : '🔄'} Restaurar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={handleCrearManual}
          disabled={creatingManual}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50"
        >
          {creatingManual ? '⏳ Creando...' : '💾 Crear backup manual'}
        </button>
        <button
          onClick={handleLimpiar}
          disabled={limpiando}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all disabled:opacity-50"
        >
          {limpiando ? '⏳' : '🧹'} Limpiar antiguos
        </button>
      </div>
    </div>
  );
}

// ==================== TAB: IMPORTAR ARCHIVO ====================

function TabImportarArchivo({ onRefresh }) {
  const fileRef               = useRef(null);
  const [dragging, setDragging]     = useState(false);
  const [preview, setPreview]       = useState(null);  // resultado de previsualizarBackup
  const [importing, setImporting]   = useState(false);
  const [resultado, setResultado]   = useState(null);  // { success, error, restored }

  const procesarArchivo = async (file) => {
    if (!file || !file.name.endsWith('.json')) {
      setPreview({ valid: false, error: 'Solo se aceptan archivos .json' });
      return;
    }
    setResultado(null);
    const prev = await previsualizarBackup(file);
    setPreview(prev);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) procesarArchivo(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) procesarArchivo(file);
  };

  const handleConfirmarRestaurar = async () => {
    if (!preview?.valid || !preview?.data) return;
    try {
      setImporting(true);
      const result = await importarBackup(preview.data);
      setResultado(result);
      if (result.success) {
        setPreview(null);
        if (fileRef.current) fileRef.current.value = '';
        onRefresh && onRefresh();
      }
    } catch (e) {
      setResultado({ success: false, error: e.message });
    } finally {
      setImporting(false);
    }
  };

  const handleCancelar = () => {
    setPreview(null);
    setResultado(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Resultado de restauración */}
      {resultado && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${resultado.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {resultado.success ? (
            <>
              ✅ <strong>Restauración exitosa</strong> —{' '}
              {resultado.restored.clientes} clientes, {resultado.restored.inventario} productos,{' '}
              {resultado.restored.deudas} deudas restaurados correctamente.
            </>
          ) : (
            <>❌ Error: {resultado.error}</>
          )}
          <button onClick={() => setResultado(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Drop Zone */}
      {!preview && (
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
              dragging
                ? 'border-sky-400 bg-sky-50'
                : 'border-gray-200 bg-gray-50 hover:border-sky-300 hover:bg-sky-50/30'
            }`}
          >
            <div className="text-5xl mb-3">📂</div>
            <p className="font-semibold text-gray-700">Arrastra tu archivo de backup aquí</p>
            <p className="text-sm text-gray-400 mt-1">o haz clic para seleccionar</p>
            <p className="text-xs text-gray-300 mt-2">Solo archivos .json exportados desde este sistema</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {/* Preview del archivo */}
      {preview && !resultado?.success && (
        <div className={`rounded-2xl border p-5 ${preview.valid ? 'border-amber-200 bg-amber-50/30' : 'border-red-200 bg-red-50/30'}`}>
          {preview.valid ? (
            <>
              <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span>📋</span> Vista previa del backup
              </h4>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-xs text-gray-400">Fecha</p>
                  <p className="text-sm font-semibold text-gray-800">{fmtFecha(preview.timestamp)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Van</p>
                  <p className="text-sm font-semibold text-gray-800">{preview.van_nombre}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Versión</p>
                  <p className="text-sm font-semibold text-gray-800">v{preview.backup_version}</p>
                </div>
              </div>
              <ResumenPills resumen={preview.resumen} />

              {/* Warning */}
              <div className="mt-4 rounded-xl bg-amber-100 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                ⚠️ <strong>Esto reemplazará</strong> los datos locales de clientes, inventario y deudas con los del backup.
                Las <strong>ventas pendientes offline no serán afectadas</strong>.
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleCancelar}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarRestaurar}
                  disabled={importing}
                  className="flex-1 text-sm font-bold px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-all disabled:opacity-50"
                >
                  {importing ? '⏳ Restaurando...' : '🔄 Confirmar restauración'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-red-600 font-semibold">❌ Archivo inválido</p>
              <p className="text-sm text-red-500 mt-1">{preview.error}</p>
              <button
                onClick={handleCancelar}
                className="mt-3 text-sm font-semibold px-4 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
              >
                Intentar otro archivo
              </button>
            </>
          )}
        </div>
      )}

      {/* Info */}
      <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600">¿Para qué sirve restaurar?</p>
        <p>Si cambias de dispositivo o reinstalás la app, puedes subir el JSON y el sistema tendrá tus clientes, inventario y deudas disponibles sin necesidad de internet.</p>
      </div>
    </div>
  );
}

// ==================== MODAL PRINCIPAL ====================

export default function BackupManagerModal({ open, onClose, vanId, vanNombre, usuarioId }) {
  const [tab, setTab]       = useState('backups'); // 'backups' | 'importar'
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => setRefreshKey(k => k + 1);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-xl max-h-[90dvh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">💾 Gestionar Backups</h2>
            <p className="text-xs text-gray-400 mt-0.5">Guardados automáticamente · Hasta 7 backups</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg transition-all"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 pb-0">
          <button
            onClick={() => setTab('backups')}
            className={`flex-1 text-sm font-semibold py-2 rounded-xl transition-all ${
              tab === 'backups'
                ? 'bg-sky-100 text-sky-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            📋 Backups guardados
          </button>
          <button
            onClick={() => setTab('importar')}
            className={`flex-1 text-sm font-semibold py-2 rounded-xl transition-all ${
              tab === 'importar'
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            📂 Importar archivo
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'backups' ? (
            <TabBackupsGuardados
              key={refreshKey}
              vanId={vanId}
              vanNombre={vanNombre}
              usuarioId={usuarioId}
              onRefresh={handleRefresh}
            />
          ) : (
            <TabImportarArchivo
              key={refreshKey}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}
