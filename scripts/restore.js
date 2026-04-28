#!/usr/bin/env node
// =============================================================
//  Tools4Care — Restore Script
//  Sube un backup JSON a Supabase (upsert — no borra datos nuevos)
//  Uso: node scripts/restore.js ~/Documents/Tools4Care-Backups/backup-2026-04-28.json
// =============================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL     || 'https://gvloygqbavibmpakzdma.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY  || '';
const SUPABASE_ANON    = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bG95Z3FiYXZpYm1wYWt6ZG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NTY3MTAsImV4cCI6MjA2NjUzMjcxMH0.YgDh6Gi-6jDYHP3fkOavIs6aJ9zlb_LEjEg5sLsdb7o';
const BACKUP_DIR       = process.env.T4C_BACKUP_DIR || join(homedir(), 'Documents', 'Tools4Care-Backups');

const CHUNK = 200; // filas por upsert

function log(msg)  { console.log(`[T4C Restore] ${msg}`); }
function warn(msg) { console.warn(`[T4C Restore] ⚠️  ${msg}`); }
function ok(msg)   { console.log(`[T4C Restore] ✅ ${msg}`); }

function findLatestBackup() {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort();
    if (!files.length) return null;
    return join(BACKUP_DIR, files[files.length - 1]);
  } catch { return null; }
}

async function upsertChunked(supabase, table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: false });
    if (error) throw new Error(`upsert ${table} chunk ${i}: ${error.message}`);
  }
}

async function main() {
  const key = SUPABASE_SERVICE || SUPABASE_ANON;
  if (!SUPABASE_SERVICE) {
    warn('SUPABASE_SERVICE_KEY no configurada — usando anon key');
    warn('Algunas tablas con RLS restrictiva pueden fallar');
  }

  // Determinar archivo a restaurar
  let filePath = process.argv[2];
  if (!filePath) {
    filePath = findLatestBackup();
    if (!filePath) {
      console.error('[T4C Restore] ❌ No se encontró backup. Uso: node scripts/restore.js <archivo.json>');
      process.exit(1);
    }
    log(`Usando backup más reciente: ${filePath}`);
  } else {
    filePath = resolve(filePath);
  }

  log(`Leyendo backup: ${filePath}`);
  const raw    = readFileSync(filePath, 'utf8');
  const backup = JSON.parse(raw);

  if (!backup.version || !backup.tables) {
    console.error('[T4C Restore] ❌ Archivo no es un backup válido de Tools4Care');
    process.exit(1);
  }

  log(`Backup creado: ${backup.createdAt}`);
  log(`Tablas encontradas: ${Object.keys(backup.tables).join(', ')}`);
  log('Iniciando restauración (upsert — no borra registros nuevos)...');

  const supabase = createClient(SUPABASE_URL, key);
  let restored = 0;
  let failed   = 0;

  for (const [table, rows] of Object.entries(backup.tables)) {
    if (!rows?.length) { log(`  ${table}: vacía — omitida`); continue; }
    try {
      await upsertChunked(supabase, table, rows);
      restored += rows.length;
      log(`  ${table}: ${rows.length} filas restauradas ✓`);
    } catch (err) {
      warn(`  ${table}: ${err.message}`);
      failed++;
    }
  }

  ok(`Restauración completada: ${restored} filas restauradas`);
  if (failed) warn(`${failed} tablas con errores (revisa los mensajes de arriba)`);
}

main().catch(err => {
  console.error('[T4C Restore] ❌ Error fatal:', err.message);
  process.exit(1);
});
