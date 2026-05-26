// supabase/functions/recalcular-scores/index.ts
// Recalculates credit scores for all clients using service_role (bypasses RLS).
// Only callable by authenticated users with rol = 'admin' or 'supervisor'.
//
// Body: { updates: [{ id: string, score: number }] }
// Returns: { updated: number, skipped: number, errors: number }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 1. Authenticate the caller ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    // Use anon client just to verify the JWT and get user info
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── 2. Check role — only admin / supervisor can recalculate ─────────────
    // Use service role for the role check too (no RLS issues on usuarios)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: usuario } = await supabaseAdmin
      .from("usuarios")
      .select("rol")
      .eq("id", user.id)
      .maybeSingle();

    const rol = usuario?.rol?.toLowerCase() ?? "";
    if (!["admin", "supervisor"].includes(rol)) {
      return json({ error: "Forbidden — admin or supervisor role required" }, 403);
    }

    // ── 3. Parse body ───────────────────────────────────────────────────────
    const body = await req.json();
    const updates: { id: string; score: number }[] = body?.updates ?? [];

    if (!Array.isArray(updates) || updates.length === 0) {
      return json({ error: "No updates provided" }, 400);
    }

    // ── 4. Batch update using service_role (bypasses RLS) ───────────────────
    let updated = 0;
    let skipped = 0;
    let errors  = 0;

    // Process in batches of 20 to avoid timeout
    const BATCH = 20;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);

      await Promise.all(
        batch.map(async ({ id, score }) => {
          if (!id || typeof score !== "number") { skipped++; return; }

          // The view exposes COALESCE(score_credito, 600) AS score_base
          // so we must write to score_credito, not score_base
          const { error: upErr } = await supabaseAdmin
            .from("clientes")
            .update({ score_credito: score })
            .eq("id", id);

          if (upErr) {
            console.error(`Score update failed for ${id}:`, upErr.message);
            errors++;
          } else {
            updated++;
          }
        })
      );
    }

    return json({ updated, skipped, errors, total: updates.length });

  } catch (err) {
    console.error("recalcular-scores error:", err);
    return json({ error: String(err) }, 500);
  }
});
