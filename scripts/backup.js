#!/usr/bin/env node
// =============================================================
//  Tools4Care — Backup Script
//  • Local:          node scripts/backup.js
//  • GitHub Actions: automático (sube a Supabase Storage)
//  • Cron manual:    0 2 * * * cd /ruta && npm run backup
// =============================================================

import { createClient }  from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve }  from 'path';
import { homedir }        from 'os';

// ── Config ────────────────────────────────────────────────────
const SUPABASE_URL     = process.env.VITE_SUPABASE_URL      || 'https://gvloygqbavibmpakzdma.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY   || '';
const SUPABASE_ANON    = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bG95Z3FiYXZpYm1wYWt6ZG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NTY3MTAsImV4cCI6MjA2NjUzMjcxMH0.YgDh6Gi-6jDYHP3fkOavIs6aJ9zlb_LEjEg5sLsdb7o';
const BACKUP_DIR       = process.env.T4C_BACKUP_DIR         || join(homedir(), 'Documents', 'Tools4Care-Backups');
const UPLOAD           = process.env.UPLOAD_TO_STORAGE === 'true' || process.env.CI === 'true';
const STORAGE_BUCKET   = 'backups';
const MAX_BACKUPS      = 30;

// Tablas en orden de dependencias (foreign keys)
const TABLES = [
  'vans', 'usuarios', 'usuarios_vans',
  'clientes', 'productos', 'stock_van', 'stock_almacen',
  'suplidores', 'ordenes_compra', 'abonos_compra',
  'ventas', 'detalle_ventas', 'pagos', 'devoluciones',
  'cierres_van', 'cierres_dia', 'facturas_ext',
  'movimientos_stock', 'gastos_conductor',
  'acuerdos_pago', 'cuotas_acuerdo',
  'cxc_movimientos', 'cxc_pagos',
  'rutas_barberias',
  'subscription_planes', 'subscription_clientes', 'subscription_entregas',
  'configuraciones_comisiones', 'comisiones_calculadas',
  'discount_codes', 'site_settings',
];

// ── Helpers ───────────────────────────────────────────────────
const ts  = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const log  = m => console.log(`[T4C Backup] ${m}`);
const warn = m => console.warn(`[T4C Backup] ⚠️  ${m}`);
const ok   = m => console.log(`[T4C Backup] ✅ ${m}`);

async function fetchAll(supabase, table) {
  const PAGE = 1000;
  let page = 0, all = [];
  while (true) {
    const { data, error } = await supabase
      .from(table).select('*')
      .range(page * PAGE, (page + 1) * PAGE - 1)
      .order('id', { ascending: true });
    if (error) {
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) return null;
      throw new Error(`${table}: ${error.message}`);
    }
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    page++;
  }
  return all;
}

function rotateLocal(dir) {
  try {
    const files = readdirSync(dir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort();
    while (files.length >= MAX_BACKUPS) {
      unlinkSync(join(dir, files.shift()));
    }
  } catch { /**/ }
}

async function uploadToStorage(supabase, filename, jsonStr) {
  // Crear bucket si no existe
  await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: 52428800, // 50MB
  }).catch(() => {/* ya existe */});

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filename, Buffer.from(jsonStr, 'utf8'), {
      contentType: 'application/json',
      upsert: true,
    });

  if (error) throw new Error(`Storage upload: ${error.message}`);

  // Mantener solo últimos 30 backups en Storage
  const { data: files } = await supabase.storage.from(STORAGE_BUCKET).list('', {
    sortBy: { column: 'name', order: 'asc' },
  });
  if (files?.length > MAX_BACKUPS) {
    const toDelete = files.slice(0, files.length - MAX_BACKUPS).map(f => f.name);
    await supabase.storage.from(STORAGE_BUCKET).remove(toDelete);
    log(`Storage: ${toDelete.length} backup(s) antiguos eliminados`);
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const key = SUPABASE_SERVICE || SUPABASE_ANON;
  if (!SUPABASE_SERVICE) warn('Sin SUPABASE_SERVICE_KEY — usando anon key (backup puede ser incompleto)');

  const supabase = createClient(SUPABASE_URL, key);

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  log(`Iniciando backup${UPLOAD ? ' + upload a Supabase Storage' : ' local'}...`);

  const backup = { version: '1.0', createdAt: new Date().toISOString(), tables: {} };
  let total = 0, skipped = 0;

  for (const table of TABLES) {
    try {
      const rows = await fetchAll(supabase, table);
      if (rows === null) { skipped++; continue; }
      backup.tables[table] = rows;
      total += rows.length;
      log(`  ${table}: ${rows.length} filas`);
    } catch (err) {
      warn(`  ${table}: ${err.message}`);
      skipped++;
    }
  }

  const filename  = `backup-${ts()}.json`;
  const jsonStr   = JSON.stringify(backup, null, 2);
  const sizeMB    = (Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(2);

  // Guardar local
  rotateLocal(BACKUP_DIR);
  const localPath = join(BACKUP_DIR, filename);
  writeFileSync(localPath, jsonStr, 'utf8');
  ok(`Guardado local: ${localPath}`);

  // Subir a Supabase Storage (en GitHub Actions o con flag UPLOAD_TO_STORAGE=true)
  if (UPLOAD) {
    try {
      await uploadToStorage(supabase, filename, jsonStr);
      ok(`Subido a Supabase Storage → bucket "${STORAGE_BUCKET}/${filename}"`);
    } catch (err) {
      warn(`No se pudo subir a Storage: ${err.message}`);
      warn('Revisa que SUPABASE_SERVICE_KEY tenga permisos de Storage');
    }
  }

  ok(`Backup completado: ${total} filas | ${Object.keys(backup.tables).length} tablas | ${sizeMB} MB`);
  if (skipped) warn(`${skipped} tablas omitidas`);
}

main().catch(err => {
  console.error('[T4C Backup] ❌ Error fatal:', err.message);
  process.exit(1);
});
