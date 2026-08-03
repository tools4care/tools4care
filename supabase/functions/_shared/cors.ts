// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173", // o "*" si aceptas todos
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ev-anon",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
