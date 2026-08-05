// supabase/functions/admin-users/index.ts
// Consolidates every admin-only user/tenant operation that used to run in
// the browser with the service_role key (src/supabaseAdmin.js). The
// service_role key now lives only here, server-side, and every action is
// gated on the caller actually being an authenticated admin — checked with
// the service-role client itself, so it can't be bypassed by RLS gaps.
//
// Body: { action: string, payload: object }
// Actions: create_user | delete_user | update_permissions |
//          get_location_access | reset_password | create_tenant |
//          list_tenants | resend_tenant_invite | set_tenant_status |
//          update_tenant | delete_tenant

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ev-anon",
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

    const { action, payload } = await req.json();

    // Invitation acceptance is the only self-service action in this
    // function. It may update only the caller's own tenant.
    if (action === "complete_tenant_onboarding") {
      const { data: member } = await admin
        .from("usuarios")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!member?.tenant_id) return json({ error: "Tenant membership not found" }, 404);
      const { error } = await admin
        .from("tenants")
        .update({
          status: "active",
          active: true,
          onboarding_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.tenant_id)
        .eq("owner_user_id", user.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, tenantId: member.tenant_id });
    }

    // ── 3. All administrative actions require an admin profile ─────────
    const { data: caller } = await admin
      .from("usuarios")
      .select("rol, tenant_id, platform_admin")
      .eq("id", user.id)
      .maybeSingle();
    if ((caller?.rol || "").toLowerCase() !== "admin") {
      return json({ error: "Forbidden — admin role required" }, 403);
    }

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
        if (!caller?.platform_admin) return json({ error: "Platform administrator required" }, 403);

        const cleanBusinessName = String(businessName || "").trim();
        const cleanOwnerName = String(ownerName || "").trim();
        const cleanEmail = String(email || "").trim().toLowerCase();
        const cleanPhone = String(phone || "").trim();
        const allowedPlans = new Set(["basic", "pro", "enterprise"]);
        if (!cleanBusinessName || !cleanEmail) {
          return json({ error: "businessName and email are required" }, 400);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          return json({ error: "A valid email is required" }, 400);
        }
        if (!allowedPlans.has(plan)) return json({ error: "Invalid plan" }, 400);

        const { data: existingTenant } = await admin
          .from("tenants")
          .select("id")
          .eq("email", cleanEmail)
          .maybeSingle();
        if (existingTenant) return json({ error: "A tenant already uses this email" }, 409);

        const siteUrl = (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
        if (!siteUrl) return json({ error: "Server configuration missing PUBLIC_APP_URL" }, 500);
        const redirectTo = `${siteUrl}/set-password`;
        const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(
          cleanEmail,
          {
            data: { full_name: cleanOwnerName, business_name: cleanBusinessName },
            redirectTo,
          },
        );
        if (authError) return json({ error: "Auth error: " + authError.message }, 400);

        const userId = authData.user.id;
        const tenantId = crypto.randomUUID();
        const locationId = crypto.randomUUID();
        const slugBase = cleanBusinessName
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 42) || "business";
        const slug = `${slugBase}-${tenantId.slice(0, 8)}`;

        const { error: tenantError } = await admin.from("tenants").insert({
          id: tenantId,
          business_name: cleanBusinessName,
          owner_name: cleanOwnerName || null,
          email: cleanEmail,
          phone: cleanPhone || null,
          plan,
          slug,
          status: "pending",
          owner_user_id: userId,
          invitation_sent_at: new Date().toISOString(),
          active: true,
          created_at: new Date().toISOString(),
        });
        if (tenantError) {
          await admin.auth.admin.deleteUser(userId);
          return json({ error: "Tenant DB error: " + tenantError.message }, 400);
        }

        const rollback = async () => {
          await admin.from("usuarios_vans").delete().eq("usuario_id", userId);
          await admin.from("location_settings").delete().eq("location_id", locationId);
          await admin.from("vans").delete().eq("id", locationId);
          await admin.from("usuarios").delete().eq("id", userId);
          await admin.from("tenants").delete().eq("id", tenantId);
          await admin.auth.admin.deleteUser(userId);
        };

        // A DB trigger auto-provisions a bare "vendedor" usuarios row the
        // instant inviteUserByEmail() creates the auth.users row above (same
        // reason create_user uses upsert instead of insert, further up) — a
        // plain insert here always collides with that row, for every email,
        // not just ones already in use. upsert replaces it with the real
        // tenant-owner profile instead of erroring on the guaranteed conflict.
        const { error: ownerError } = await admin.from("usuarios").upsert({
          id: userId,
          email: cleanEmail,
          nombre: cleanOwnerName || cleanBusinessName,
          // Existing database policies treat rol=admin as a global operator.
          // Tenant owners therefore start as supervisor until every legacy
          // business table is tenant-keyed; this grants operational control
          // without leaking platform-wide administrative access.
          rol: "supervisor",
          activo: true,
          tenant_id: tenantId,
          platform_admin: false,
        }, { onConflict: "id" });
        if (ownerError) {
          await rollback();
          return json({ error: "Owner profile error: " + ownerError.message }, 400);
        }

        const { error: locationError } = await admin.from("vans").insert({
          id: locationId,
          nombre_van: cleanBusinessName,
          placa: `STORE-${tenantId.slice(0, 6).toUpperCase()}`,
          descripcion: "Initial Tools4Care store",
          activo: true,
          tipo: "store",
          tenant_id: tenantId,
        });
        if (locationError) {
          await rollback();
          return json({ error: "Initial location error: " + locationError.message }, 400);
        }

        const { error: assignmentError } = await admin.from("usuarios_vans").insert({
          usuario_id: userId,
          van_id: locationId,
          activo: true,
        });
        if (assignmentError) {
          await rollback();
          return json({ error: "Location assignment error: " + assignmentError.message }, 400);
        }

        const { error: settingsError } = await admin.from("location_settings").insert({
          location_id: locationId,
        });
        if (settingsError) {
          await rollback();
          return json({ error: "Location settings error: " + settingsError.message }, 400);
        }
        await admin.from("tenants").update({ initial_location_id: locationId }).eq("id", tenantId);

        // Also return a one-time setup link. The normal path is the invite
        // email; this fallback lets the platform admin deliver it manually.
        const { data: setupData, error: linkError } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: cleanEmail,
          options: { redirectTo },
        });

        return json({
          tenantId,
          userId,
          locationId,
          email: cleanEmail,
          setupLink: linkError ? null : setupData?.properties?.action_link || null,
          invitationSent: true,
        });
      }

      case "list_tenants": {
        if (!caller?.platform_admin) return json({ error: "Platform administrator required" }, 403);
        const { data, error } = await admin
          .from("tenants")
          .select("id,business_name,owner_name,email,phone,plan,status,active,created_at,invitation_sent_at,onboarding_completed_at,initial_location_id,owner_user_id")
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 400);

        const tenants = await Promise.all((data || []).map(async (tenant) => {
          const countOf = async (table: string) => {
            const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", tenant.id);
            return count || 0;
          };
          const [clientes, productos, ventas, usuarios] = await Promise.all([
            countOf("clientes"),
            countOf("productos"),
            countOf("ventas"),
            countOf("usuarios"),
          ]);
          let lastSignInAt: string | null = null;
          if (tenant.owner_user_id) {
            const { data: authUser } = await admin.auth.admin.getUserById(tenant.owner_user_id);
            lastSignInAt = authUser?.user?.last_sign_in_at || null;
          }
          return {
            ...tenant,
            stats: { clientes, productos, ventas, usuarios, lastSignInAt },
          };
        }));

        return json({ tenants });
      }

      case "update_tenant": {
        if (!caller?.platform_admin) return json({ error: "Platform administrator required" }, 403);
        const { tenantId, businessName, ownerName, phone, plan } = payload || {};
        if (!tenantId) return json({ error: "tenantId is required" }, 400);
        const cleanBusinessName = (businessName || "").trim();
        const cleanOwnerName = (ownerName || "").trim();
        if (!cleanBusinessName || !cleanOwnerName) return json({ error: "businessName and ownerName are required" }, 400);
        const { data: tenant, error: lookupError } = await admin
          .from("tenants")
          .select("owner_user_id")
          .eq("id", tenantId)
          .maybeSingle();
        if (lookupError || !tenant) return json({ error: "Tenant not found" }, 404);
        const { error: updateError } = await admin
          .from("tenants")
          .update({
            business_name: cleanBusinessName,
            owner_name: cleanOwnerName,
            phone: (phone || "").trim(),
            plan: plan || "basic",
            updated_at: new Date().toISOString(),
          })
          .eq("id", tenantId);
        if (updateError) return json({ error: updateError.message }, 400);
        if (tenant.owner_user_id) {
          await admin.from("usuarios").update({ nombre: cleanOwnerName }).eq("id", tenant.owner_user_id);
        }
        return json({ ok: true });
      }

      case "delete_tenant": {
        if (!caller?.platform_admin) return json({ error: "Platform administrator required" }, 403);
        const { tenantId, confirmBusinessName } = payload || {};
        if (!tenantId) return json({ error: "tenantId is required" }, 400);
        const { data: tenant, error: lookupError } = await admin
          .from("tenants")
          .select("id,business_name")
          .eq("id", tenantId)
          .maybeSingle();
        if (lookupError || !tenant) return json({ error: "Tenant not found" }, 404);
        if ((confirmBusinessName || "").trim() !== tenant.business_name) {
          return json({ error: "Business name confirmation does not match" }, 400);
        }

        const ids = async (table: string, column: string) => {
          const { data: rows, error } = await admin.from(table).select("id").eq(column, tenantId);
          if (error) throw new Error(`Reading ${table}: ${error.message}`);
          return (rows || []).map((r: { id: string }) => r.id);
        };

        const orFilter = (parts: Array<string | null>) => parts.filter(Boolean).join(",");
        const del = async (table: string, apply: (q: any) => any) => {
          const { error } = await apply(admin.from(table).delete());
          if (error) throw new Error(`Deleting from ${table}: ${error.message}`);
        };

        const ventaIds = await ids("ventas", "tenant_id");
        const clienteIds = await ids("clientes", "tenant_id");
        const vanIds = await ids("vans", "tenant_id");
        const productoIds = await ids("productos", "tenant_id");
        const { data: usuarioRows, error: usuariosError } = await admin.from("usuarios").select("id").eq("tenant_id", tenantId);
        if (usuariosError) return json({ error: `Reading usuarios: ${usuariosError.message}` }, 400);
        const usuarioIds = (usuarioRows || []).map((r: { id: string }) => r.id);

        try {
          if (ventaIds.length) await del("detalle_ventas", (q) => q.in("venta_id", ventaIds));

          if (ventaIds.length || clienteIds.length || vanIds.length) {
            await del("pagos", (q) => q.or(orFilter([
              ventaIds.length ? `venta_id.in.(${ventaIds.join(",")})` : null,
              clienteIds.length ? `cliente_id.in.(${clienteIds.join(",")})` : null,
              vanIds.length ? `van_id.in.(${vanIds.join(",")})` : null,
            ])));
          }

          if (clienteIds.length || vanIds.length) {
            await del("cxc_movimientos", (q) => q.or(orFilter([
              clienteIds.length ? `cliente_id.in.(${clienteIds.join(",")})` : null,
              vanIds.length ? `van_id.in.(${vanIds.join(",")})` : null,
            ])));
          }

          if (ventaIds.length) await del("ventas", (q) => q.eq("tenant_id", tenantId));

          if (vanIds.length || productoIds.length) {
            await del("stock_van", (q) => q.or(orFilter([
              vanIds.length ? `van_id.in.(${vanIds.join(",")})` : null,
              productoIds.length ? `producto_id.in.(${productoIds.join(",")})` : null,
            ])));
          }

          await del("productos", (q) => q.eq("tenant_id", tenantId));
          await del("clientes", (q) => q.eq("tenant_id", tenantId));

          if (usuarioIds.length || vanIds.length) {
            await del("usuarios_vans", (q) => q.or(orFilter([
              usuarioIds.length ? `usuario_id.in.(${usuarioIds.join(",")})` : null,
              vanIds.length ? `van_id.in.(${vanIds.join(",")})` : null,
            ])));
          }

          if (vanIds.length) await del("location_settings", (q) => q.in("location_id", vanIds));

          await del("vans", (q) => q.eq("tenant_id", tenantId));

          for (const uid of usuarioIds) {
            await del("usuarios", (q) => q.eq("id", uid));
            const { error: authDeleteError } = await admin.auth.admin.deleteUser(uid);
            if (authDeleteError) throw new Error(`Deleting auth user ${uid}: ${authDeleteError.message}`);
          }

          await del("tenants", (q) => q.eq("id", tenantId));
        } catch (cascadeError) {
          return json({ error: (cascadeError as Error).message }, 400);
        }

        return json({ ok: true });
      }

      case "resend_tenant_invite": {
        if (!caller?.platform_admin) return json({ error: "Platform administrator required" }, 403);
        const { tenantId } = payload || {};
        const { data: tenant, error: tenantLookupError } = await admin
          .from("tenants")
          .select("id,email,business_name,owner_name")
          .eq("id", tenantId)
          .maybeSingle();
        if (tenantLookupError || !tenant) return json({ error: "Tenant not found" }, 404);
        const siteUrl = (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
        if (!siteUrl) return json({ error: "Server configuration missing PUBLIC_APP_URL" }, 500);
        const redirectTo = `${siteUrl}/set-password`;
        const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: tenant.email,
          options: { redirectTo },
        });
        if (linkError) return json({ error: linkError.message }, 400);
        await admin.from("tenants").update({ invitation_sent_at: new Date().toISOString() }).eq("id", tenantId);
        return json({ email: tenant.email, setupLink: linkData?.properties?.action_link || null });
      }

      case "set_tenant_status": {
        if (!caller?.platform_admin) return json({ error: "Platform administrator required" }, 403);
        const { tenantId, status } = payload || {};
        if (!["active", "suspended"].includes(status)) return json({ error: "Invalid status" }, 400);
        const { data: tenant, error: lookupError } = await admin
          .from("tenants")
          .select("owner_user_id")
          .eq("id", tenantId)
          .maybeSingle();
        if (lookupError || !tenant) return json({ error: "Tenant not found" }, 404);
        const active = status === "active";
        const { error } = await admin.from("tenants").update({ status, active, updated_at: new Date().toISOString() }).eq("id", tenantId);
        if (error) return json({ error: error.message }, 400);
        if (tenant.owner_user_id) await admin.from("usuarios").update({ activo: active }).eq("id", tenant.owner_user_id);
        return json({ ok: true, status });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    return json({ error: err?.message || String(err) }, 500);
  }
});
