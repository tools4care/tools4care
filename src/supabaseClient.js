// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://gvloygqbavibmpakzdma.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bG95Z3FiYXZpYm1wYWt6ZG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NTY3MTAsImV4cCI6MjA2NjUzMjcxMH0.YgDh6Gi-6jDYHP3fkOavIs6aJ9zlb_LEjEg5sLsdb7o";

/* ========= anon-id persistente (para carritos de invitados con RLS) ========= */
const ANON_KEY = "anon-id";
function getAnonId() {
  if (typeof window === "undefined") return null;
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}
export const anonId = getAnonId();

/* ========= Cliente Supabase con header global x-anon-id ===================== */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: anonId ? { "x-anon-id": anonId } : {},
  },
});

/* Opcional: refrescar header si alguna vez borras el storage */
export function refreshAnonHeader() {
  const id = getAnonId();
  if (!id) return;
  // @ts-ignore: set/merge global headers en runtime
  supabase.headers = { ...(supabase.headers || {}), "x-anon-id": id };
}

/* ========= Parche único: envolver supabase.rpc con caché "no existe" =========
   - Evita llamadas repetidas a RPC inexistentes (y sus 404 en Network/Consola)
   - Devuelve { error: { code: "RPC_NOT_AVAILABLE" } } para activar tus fallbacks
   - Para limpiar la caché: localStorage.removeItem("rpc-availability-v1")
============================================================================= */
(function patchRpc(client) {
  const LS_KEY = "rpc-availability-v1";

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveCache(cache) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch {}
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
