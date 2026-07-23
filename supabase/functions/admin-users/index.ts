// supabase/functions/admin-users/index.ts
// Consolidates every admin-only user/tenant operation that used to run in
// the browser with the service_role key (src/supabaseAdmin.js). The
// service_role key now lives only here, server-side, and every action is
// gated on the caller actually being an authenticated admin — checked with
// the service-role client itself, so it can't be bypassed by RLS gaps.
//
// Body: { action: string, payload: object }
// Actions: create_user | delete_user | update_permissions |
//          get_location_access | reset_password | create_tenant

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── 1. Authenticate the caller ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── 2. Service-role client — never exposed to the browser ──────────
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 3. Only admins may use any action here ──────────────────────────
    const { data: caller } = await admin.from("usuarios").select("rol").eq("id", user.id).maybeSingle();
    if ((caller?.rol || "").toLowerCase() !== "admin") {
      return json({ error: "Forbidden — admin role required" }, 403);
    }

    const { action, payload } = await req.json();

    switch (action) {
      case "create_user": {
        const { email, password, nombre, rol } = payload || {};
        if (!email || !password) return json({ error: "email and password are required" }, 400);

        const { data: authData, error: createErr } = await admin.auth.admin.createUser({
          email: String(email).trim(),
          password: String(password),
          email_confirm: true,
          user_metadata: { full_name: nombre || "" },
        });
        if (createErr) return json({ error: "Auth error: " + createErr.message }, 400);

        const { error: dbErr } = await admin.from("usuarios").upsert({
          id: authData.user.id,
          email: String(email).trim(),
          nombre: nombre || null,
          rol: rol || "vendedor",
          activo: true,
        }, { onConflict: "id" });
        if (dbErr) {
          return json({ error: "User created in auth but DB insert failed: " + dbErr.message }, 400);
        }

        return json({ id: authData.user.id, email: String(email).trim(), nombre: nombre || null, rol: rol || "vendedor", activo: true });
      }

      case "delete_user": {
        const { id } = payload || {};
        if (!id) return json({ error: "id is required" }, 400);

        const { error: authDelErr } = await admin.auth.admin.deleteUser(id);
        if (authDelErr && authDelErr.status !== 404) {
          return json({ error: "Auth error: " + authDelErr.message }, 400);
        }

        await Promise.all([
          admin.from("usuarios_vans").delete().eq("usuario_id", id),
          admin.from("usuario_sesion").delete().eq("usuario_id", id),
          admin.from("ventas_pendientes").delete().eq("usuario_id", id),
          admin.from("configuraciones_comisiones").delete().eq("vendedor_id", id),
          admin.from("comisiones_calculadas").delete().eq("vendedor_id", id),
          admin.from("ventas").update({ usuario_id: null }).eq("usuario_id", id),
          admin.from("cierres_dia").update({ usuario_id: null }).eq("usuario_id", id),
          admin.from("cierres_van").update({ usuario_id: null }).eq("usuario_id", id),
          admin.from("acuerdos_pago").update({ usuario_id: null }).eq("usuario_id", id),
          admin.from("cxc_movimientos").update({ usuario_id: null }).eq("usuario_id", id),
          admin.from("cliente_credito_movimientos").update({ usuario_id: null }).eq("usuario_id", id),
          admin.from("audit_log").update({ usuario_id: null }).eq("usuario_id", id),
        ]);

        const { error: dbDelErr } = await admin.from("usuarios").delete().eq("id", id);
        if (dbDelErr) return json({ error: "DB error: " + dbDelErr.message }, 400);

        return json({ ok: true });
      }

      case "update_permissions": {
        const { id, descuento_max, modulos, locationIds, isAdminRole } = payload || {};
        if (!id) return json({ error: "id is required" }, 400);

        const { error: updErr } = await admin.from("usuarios").update({ descuento_max, modulos }).eq("id", id);
        if (updErr) return json({ error: updErr.message }, 400);

        const { error: delAssignErr } = await admin.from("usuarios_vans").delete().eq("usuario_id", id);
        if (delAssignErr) {
          return json({ error: "User settings were saved, but location access could not be updated: " + delAssignErr.message }, 400);
        }

        if (!isAdminRole && Array.isArray(locationIds) && locationIds.length > 0) {
          const { error: insErr } = await admin.from("usuarios_vans").insert(
            locationIds.map((van_id: string) => ({ usuario_id: id, van_id, activo: true })),
          );
          if (insErr) {
            return json({ error: "User settings were saved, but location access could not be updated: " + insErr.message }, 400);
          }
        }

        return json({ ok: true, descuento_max, modulos });
      }

      case "get_location_access": {
        const { id } = payload || {};
        if (!id) return json({ error: "id is required" }, 400);

        const [locationResult, assignmentResult] = await Promise.all([
          admin.from("v_vans_app").select("id, nombre, placa, tipo, activo").eq("activo", true).order("nombre"),
          admin.from("usuarios_vans").select("van_id, activo").eq("usuario_id", id),
        ]);
        if (locationResult.error || assignmentResult.error) {
          return json({ error: "Could not load location access." }, 400);
        }
        return json({
          locations: locationResult.data || [],
          selectedLocationIds: (assignmentResult.data || [])
            .filter((row: any) => row.activo !== false)
            .map((row: any) => row.van_id),
        });
      }

      case "reset_password": {
        const { id, email, password } = payload || {};
        if (!id || !password) return json({ error: "id and password are required" }, 400);

        const { error: updErr } = await admin.auth.admin.updateUserById(id, { password });
        if (updErr) {
          const notFound = updErr.status === 404 || (updErr.message || "").toLowerCase().includes("not found");
          if (!notFound) return json({ error: updErr.message }, 400);

          // No auth.users record for this id (e.g. a row created directly in
          // `usuarios`) — create one with the same id so it links up.
          const { error: createErr } = await admin.auth.admin.createUser({
            id, email, password, email_confirm: true,
          });
          if (createErr) return json({ error: createErr.message }, 400);
        }
        return json({ ok: true });
      }

      case "create_tenant": {
        const { businessName, ownerName, email, phone, plan } = payload || {};
        if (!businessName || !email) return json({ error: "businessName and email are required" }, 400);

        const { data: authData, error: authError } = await admin.auth.admin.createUser({
          email,
          password: crypto.randomUUID().slice(0, 16),
          email_confirm: true,
        });
        if (authError) return json({ error: "Auth error: " + authError.message }, 400);

        const userId = authData.user.id;
        const { error: tenantError } = await admin.from("tenants").insert({
          id: userId,
          business_name: businessName,
          owner_name: ownerName || null,
          email,
          phone: phone || null,
          plan,
          active: true,
          created_at: new Date().toISOString(),
        });
        if (tenantError) {
          // Roll back the auth user so we don't leave an orphaned record.
          await admin.auth.admin.deleteUser(userId);
          return json({ error: "Tenant DB error: " + tenantError.message }, 400);
        }

        const { error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
        if (linkError) console.warn("Magic link warning:", linkError.message);

        return json({ userId, email });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    return json({ error: err?.message || String(err) }, 500);
  }
});
