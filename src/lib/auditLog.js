import { supabase } from "../supabaseClient";

// Fire-and-forget audit trail insert. Never throws — a failed audit write
// must not block or fail the underlying business action.
export async function logAudit({ usuario, van, accion, entidadTipo, entidadId, before, after, nota, extra }) {
  try {
    await supabase.from("audit_log").insert([{
      usuario_id: usuario?.id || null,
      usuario_nombre: usuario?.nombre || usuario?.email || null,
      van_id: van?.id || null,
      accion,
      entidad_tipo: entidadTipo || null,
      entidad_id: entidadId || null,
      detalles: { before: before ?? null, after: after ?? null, ...(extra || {}) },
      nota: nota || null,
    }]);
  } catch (e) {
    console.warn("audit log failed:", e?.message || e);
  }
}
