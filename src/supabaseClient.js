// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// ENV de Vite
const supabaseUrl =
  import.meta?.env?.VITE_SUPABASE_URL || "https://gvloygqbavibmpakzdma.supabase.co";
const supabaseAnonKey =
  import.meta?.env?.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bG95Z3FiYXZpYm1wYWt6ZG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NTY3MTAsImV4cCI6MjA2NjUzMjcxMH0.YgDh6Gi-6jDYHP3fkOavIs6aJ9zlb_LEjEg5sLsdb7o";
const functionsUrl = import.meta?.env?.VITE_SB_FUNCTIONS_URL;

/* ============================================================================
   anon-id persistente (para carritos de invitados con RLS)
============================================================================ */
const ANON_KEY = "t4c_anon_id";

export function getAnonId() {
  if (typeof window === "undefined") return null;
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      const rnd =
        (globalThis?.crypto && typeof crypto.randomUUID === "function")
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      id = `${rnd}-guest`;
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export const anonId = getAnonId();

/* ============================================================================
   Cliente Supabase con configuración de AUTH + headers globales
============================================================================ */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // ✅ CRÍTICO: Configuración de autenticación
  auth: {
    persistSession: true,        // ← Guarda sesión en localStorage
    autoRefreshToken: true,       // ← Refresca token automáticamente
    detectSessionInUrl: true,     // ← Detecta sesión en URL (para OAuth)
    storage: window.localStorage, // ← Dónde guardar la sesión
  },
  // Headers globales para RLS
  global: {
    headers: anonId ? { "x-ev-anon": anonId } : {},
  },
  // Edge Functions URL
  ...(functionsUrl
    ? { functions: { url: functionsUrl, headers: anonId ? { "x-ev-anon": anonId } : {} } }
    : {}),
});

/* ============================================================================
   Refrescar header anon
============================================================================ */
export function refreshAnonHeader() {
  const id = getAnonId();
  if (!id) return;
  try {
    // @ts-ignore
    if (supabase && supabase.headers) {
      // @ts-ignore
      supabase.headers = { ...(supabase.headers || {}), "x-ev-anon": id };
    }
  } catch {
    // silencio
  }
}

/* ============================================================================
   Parche: envolver supabase.rpc con caché "no existe"
============================================================================ */
(function patchRpc(client) {
  const LS_KEY = "rpc-availability-v1";

  function loadCache() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function saveCache(cache) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(cache));
    } catch {}
  }

  const cache = loadCache();
  const originalRpc = client.rpc.bind(client);

  client.rpc = async function wrappedRpc(name, params) {
    if (cache[name] === false) {
      return { data: null, error: { code: "RPC_NOT_AVAILABLE" } };
    }

    const { data, error } = await originalRpc(name, params);

    if (!error) return { data, error: null };

    const msg = (error.message || "").toLowerCase();
    const notFound =
      error.code === "PGRST202" ||
      msg.includes("could not find the function") ||
      msg.includes("no matches were found in the schema cache") ||
      (msg.includes("function") && msg.includes("does not exist"));

    if (notFound) {
      cache[name] = false;
      saveCache(cache);
      return { data: null, error: { code: "RPC_NOT_AVAILABLE" } };
    }

    return { data: null, error };
  };
})(supabase);