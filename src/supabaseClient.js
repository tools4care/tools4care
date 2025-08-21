// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://gvloygqbavibmpakzdma.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bG95Z3FiYXZpYm1wYWt6ZG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NTY3MTAsImV4cCI6MjA2NjUzMjcxMH0.YgDh6Gi-6jDYHP3fkOavIs6aJ9zlb_LEjEg5sLsdb7o";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    // Si ya sabemos que NO existe, evitamos la llamada (y el 404 en Network)
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
      cache[name] = false;  // cachea ausencia para futuras llamadas
      saveCache(cache);
      return { data: null, error: { code: "RPC_NOT_AVAILABLE" } };
    }

    // Otros errores reales: propágalos (puedes descomentar el warn si quieres)
    // console.warn(`[rpc:${name}]`, error);
    return { data: null, error };
  };
})(supabase);
