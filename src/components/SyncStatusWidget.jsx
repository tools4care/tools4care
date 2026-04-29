// src/components/SyncStatusWidget.jsx
// Tarjeta de backup automático — muestra backups de Supabase Storage
// con opciones de crear, descargar y restaurar desde el Dashboard

import { useState, useEffect, useCallback } from "react";
import { useOffline } from "../hooks/useOffline";
import { supabase } from "../supabaseClient";
import { useToast } from "../hooks/useToast";

const STORAGE_BUCKET = "backups";

// Tablas a respaldar en orden de dependencias
const BACKUP_TABLES = [
  "vans","usuarios","usuarios_vans",
  "clientes","productos","stock_van","stock_almacen",
  "suplidores","ordenes_compra","abonos_compra",
  "ventas","detalle_ventas","pagos","devoluciones",
  "cierres_van","cierres_dia","facturas_ext",
  "movimientos_stock","gastos_conductor",
  "acuerdos_pago","cuotas_acuerdo",
  "cxc_movimientos","cxc_pagos",
  "rutas_barberias",
  "subscription_planes","subscription_clientes","subscription_entregas",
  "configuraciones_comisiones","comisiones_calculadas",
  "discount_codes","site_settings",
];

async function fetchTableAll(table) {
  const PAGE = 1000;
  let page = 0, all = [];
  while (true) {
    const { data, error } = await supabase
      .from(table).select("*")
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) return null;
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    page++;
  }
  return all;
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function fmtFecha(ts) {
  if (!ts) return "Nunca";
  return new Date(ts).toLocaleString("es", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtHoraHasta8pm() {
  const ahora = new Date();
  const hoy8pm = new Date();
  hoy8pm.setHours(20, 0, 0, 0);
  if (ahora >= hoy8pm) hoy8pm.setDate(hoy8pm.getDate() + 1);
  const diffMs = hoy8pm - ahora;
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h > 0) return `en ${h}h ${m}m`;
  return `en ${m}m`;
}

function fmtNombreBackup(nombre) {
  // backup-2026-04-28T02-00-00.json → 28 abr, 02:00
  try {
    const raw = nombre.replace("backup-", "").replace(".json", "");
    const iso = raw.replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3");
    return new Date(iso).toLocaleString("es", {
      day: "2-digit", month: "short",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return nombre; }
}

// ── Modal de restauración ─────────────────────────────────────
function RestoreModal({ backupNombre, onClose }) {
  const { toast } = useToast();
  const [log,      setLog]      = useState([]);
  const [running,  setRunning]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [info,     setInfo]     = useState(null); // { totalRows, tables }

  useEffect(() => {
    // Cargar preview del backup
    (async () => {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(backupNombre);
      if (error || !data) { toast.error("No se pudo cargar el backup"); onClose(); return; }
      const text = await data.text();
      const obj  = JSON.parse(text);
      const tables = Object.keys(obj.tables || {});
      const totalRows = tables.reduce((s, t) => s + (obj.tables[t]?.length || 0), 0);
      setInfo({ obj, tables, totalRows, createdAt: obj.createdAt });
    })();
  }, [backupNombre]);

  const handleRestore = async () => {
    if (!info?.obj) return;
    setRunning(true);
    const { tables } = info.obj;
    const newLog = [];

    for (const table of BACKUP_TABLES) {
      const rows = tables[table];
      if (!rows?.length) continue;
      const CHUNK = 200;
      let ok = true;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase
          .from(table)
          .upsert(rows.slice(i, i + CHUNK), { onConflict: "id", ignoreDuplicates: false });
        if (error) { newLog.push({ table, ok: false, msg: error.message }); ok = false; break; }
      }
      if (ok) newLog.push({ table, ok: true, count: rows.length });
      setLog([...newLog]);
    }

    setRunning(false);
    setDone(true);
    const errors = newLog.filter(l => !l.ok).length;
    if (errors === 0) toast.success("✅ Restauración completada");
    else toast.warning(`Restauración con ${errors} errores`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">🔄 Restaurar backup</h3>
            <p className="text-xs text-gray-400 mt-0.5">{fmtNombreBackup(backupNombre)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!info && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              Cargando backup...
            </div>
          )}

          {info && !done && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">📊 Contenido del backup</p>
                <p>{info.totalRows.toLocaleString()} filas en {info.tables.length} tablas</p>
                {info.createdAt && (
                  <p className="text-xs text-blue-600 mt-1">Creado: {new Date(info.createdAt).toLocaleString("es")}</p>
                )}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
                ⚠️ Esto hace <strong>upsert</strong> — actualiza lo existente y agrega lo faltante. <strong>No elimina</strong> registros nuevos.
              </div>
            </>
          )}

          {(running || done) && log.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-0.5 bg-gray-50 rounded-xl p-3">
              {log.map((l, i) => (
                <div key={i} className={`text-xs flex justify-between ${l.ok ? "text-green-600" : "text-red-500"}`}>
                  <span className="font-mono">{l.table}</span>
                  <span>{l.ok ? `✓ ${l.count} filas` : `✗ ${l.msg}`}</span>
                </div>
              ))}
              {running && <div className="text-xs text-blue-400 animate-pulse">Restaurando...</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-all">
            {done ? "Cerrar" : "Cancelar"}
          </button>
          {!done && (
            <button onClick={handleRestore} disabled={running || !info}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-all disabled:opacity-40">
              {running ? "⏳ Restaurando..." : "🔄 Restaurar ahora"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function SyncStatusWidget({
  syncing = false,
  lastSync = null,
  historialBackups = [],
  ventasPendientes = 0,
  syncError = null,
  onSyncNow = null,
  onOpenBackupManager = null,
  backupCount = 0,
}) {
  const { isOnline } = useOffline();
  const { toast } = useToast();

  // Cloud backups state
  const [cloudBackups,   setCloudBackups]   = useState([]);
  const [loadingCloud,   setLoadingCloud]   = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0); // 0-100
  const [downloadingId,  setDownloadingId]  = useState(null);
  const [restoreTarget,  setRestoreTarget]  = useState(null); // nombre del backup a restaurar

  // Cargar lista de backups en la nube
  const cargarCloudBackups = useCallback(async () => {
    setLoadingCloud(true);
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list("", { sortBy: { column: "name", order: "desc" }, limit: 5 });
    if (!error && data) {
      setCloudBackups(data.filter(f => f.name.endsWith(".json")));
    }
    setLoadingCloud(false);
  }, []);

  useEffect(() => { if (isOnline) cargarCloudBackups(); }, [isOnline, cargarCloudBackups]);

  // Crear backup nuevo
  const handleCrearBackup = async () => {
    setCreatingBackup(true);
    setBackupProgress(0);
    try {
      const result = { version: "1.0", createdAt: new Date().toISOString(), tables: {} };
      let total = 0;

      for (let i = 0; i < BACKUP_TABLES.length; i++) {
        const table = BACKUP_TABLES[i];
        const rows = await fetchTableAll(table);
        if (rows) { result.tables[table] = rows; total += rows.length; }
        setBackupProgress(Math.round(((i + 1) / BACKUP_TABLES.length) * 100));
      }

      // Descargar localmente
      const fecha = new Date().toISOString().slice(0, 10);
      const filename = `tools4care-backup-${fecha}.json`;
      downloadJSON(result, filename);

      // Subir a Storage
      const jsonStr = JSON.stringify(result, null, 2);
      const storageName = `backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
      await supabase.storage.from(STORAGE_BUCKET).upload(
        storageName,
        new Blob([jsonStr], { type: "application/json" }),
        { upsert: true }
      );

      toast.success(`✅ Backup creado — ${total.toLocaleString()} filas descargadas`);
      await cargarCloudBackups();
    } catch (err) {
      toast.error("Error al crear backup: " + err.message);
    } finally {
      setCreatingBackup(false);
      setBackupProgress(0);
    }
  };

  // Descargar un backup de la nube
  const handleDescargar = async (nombre) => {
    setDownloadingId(nombre);
    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(nombre);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a"); a.href = url; a.download = nombre; a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup descargado");
    } catch (e) {
      toast.error("Error al descargar: " + e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const estadoSync = syncError
    ? { color: "red",    icon: "❌", texto: "Error" }
    : syncing
    ? { color: "blue",   icon: "🔄", texto: "Sincronizando..." }
    : !isOnline
    ? { color: "amber",  icon: "📵", texto: "Sin conexión" }
    : ventasPendientes > 0
    ? { color: "orange", icon: "⏳", texto: `${ventasPendientes} pendientes` }
    : { color: "green",  icon: "✅", texto: "Datos sincronizados" };

  const colorMap = {
    red:    { badge: "bg-red-100 text-red-700" },
    blue:   { badge: "bg-blue-100 text-blue-700" },
    amber:  { badge: "bg-amber-100 text-amber-700" },
    orange: { badge: "bg-orange-100 text-orange-700" },
    green:  { badge: "bg-green-100 text-green-700" },
  };
  const c = colorMap[estadoSync.color];

  return (
    <>
      <div className="bg-white rounded-3xl shadow-xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">💾 Copias de Seguridad</h2>
            <p className="text-sm text-gray-400 mt-0.5">Automáticas cada noche · Guardadas en la nube</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${c.badge}`}>
            {estadoSync.icon} {estadoSync.texto}
          </span>
        </div>

        {/* Info rápida */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded-2xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">Último sync</p>
            <p className="font-semibold text-gray-700">{fmtFecha(lastSync)}</p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">Próximo automático</p>
            <p className="font-semibold text-gray-700">
              {isOnline ? `Hoy 2 AM` : "Al reconectar"}
            </p>
          </div>
        </div>

        {/* Botón crear backup */}
        <button
          onClick={handleCrearBackup}
          disabled={creatingBackup || !isOnline}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 rounded-2xl shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creatingBackup ? (
            <>
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Creando backup... {backupProgress}%
            </>
          ) : (
            <>📥 Crear backup ahora</>
          )}
        </button>

        {/* Barra de progreso */}
        {creatingBackup && (
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${backupProgress}%` }}
            />
          </div>
        )}

        {/* Lista de backups en la nube */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              ☁️ Backups en la nube
            </p>
            <button onClick={cargarCloudBackups} className="text-xs text-blue-500 hover:text-blue-700">
              ↺ Actualizar
            </button>
          </div>

          {loadingCloud ? (
            <div className="flex items-center gap-2 py-3 text-gray-400 text-xs">
              <div className="w-3 h-3 border-2 border-gray-300 border-t-blue-400 rounded-full animate-spin" />
              Cargando...
            </div>
          ) : cloudBackups.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-xs bg-gray-50 rounded-2xl">
              <p>No hay backups en la nube aún</p>
              <p className="mt-0.5">El primero se crea esta noche automáticamente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cloudBackups.map((f, idx) => (
                <div key={f.name}
                  className={`flex items-center justify-between gap-2 rounded-2xl px-4 py-3 border ${idx === 0 ? "bg-blue-50 border-blue-100" : "bg-gray-50 border-gray-100"}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{fmtNombreBackup(f.name)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {idx === 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                          Más reciente
                        </span>
                      )}
                      {f.metadata?.size && (
                        <span className="text-xs text-gray-400">
                          {(f.metadata.size / 1024).toFixed(0)} KB
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleDescargar(f.name)}
                      disabled={downloadingId === f.name}
                      className="text-xs font-semibold px-3 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 transition-all disabled:opacity-40 shadow-sm"
                    >
                      {downloadingId === f.name ? "⏳" : "⬇️"} Guardar
                    </button>
                    <button
                      onClick={() => setRestoreTarget(f.name)}
                      className="text-xs font-bold px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-sm"
                    >
                      🔄 Restaurar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Botón sync + gestionar */}
        <div className="flex gap-2 pt-1 border-t border-gray-100">
          {onSyncNow && isOnline && (
            <button onClick={onSyncNow} disabled={syncing}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50">
              <span className={syncing ? "animate-spin" : ""}>🔄</span>
              {syncing ? "Sincronizando..." : "Sync ahora"}
            </button>
          )}
          {onOpenBackupManager && (
            <button onClick={onOpenBackupManager}
              className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-indigo-100 transition-all">
              🗂️ Ver caché local{backupCount > 0 ? ` (${backupCount})` : ""}
            </button>
          )}
        </div>
      </div>

      {/* Modal de restauración */}
      {restoreTarget && (
        <RestoreModal
          backupNombre={restoreTarget}
          onClose={() => { setRestoreTarget(null); cargarCloudBackups(); }}
        />
      )}
    </>
  );
}
