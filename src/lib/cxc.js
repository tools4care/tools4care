// src/lib/cxc.js
import { supabase } from "../supabaseClient";

/**
 * Lee CxC de un cliente aplicando límite manual cuando exista.
 * Retorna:
 *  {
 *    saldo: number,
 *    limite: number,                 // efectivo (manual o política)
 *    disponible: number,             // limite - saldo (si manual) o la vista
 *    limite_manual_aplicado: boolean // true si se usó limite_manual
 *  }
 */
export async function getCxcCliente(clienteId) {
  if (!clienteId) return null;

  // 1) Vista canónica (política base)
  const { data: det, error: errDet } = await supabase
    .from("v_cxc_cliente_detalle")
    .select("saldo, limite_politica, credito_disponible")
    .eq("cliente_id", clienteId)
    .maybeSingle();

  if (errDet || !det) return null;

  const saldo = Number(det.saldo ?? 0);
  const limitePolitica = Number(det.limite_politica ?? 0);
  const disponibleVista = Number(det.credito_disponible ?? (limitePolitica - saldo));

  // 2) ¿Hay límite manual?
  const { data: cli, error: errCli } = await supabase
    .from("clientes")
    .select("limite_manual")
    .eq("id", clienteId)
    .maybeSingle();

  if (errCli) {
    // Si falla, devolvemos lo de la vista
    return {
      saldo,
      limite: limitePolitica,
      disponible: disponibleVista,
      limite_manual_aplicado: false,
    };
  }

  const limiteManual = cli?.limite_manual;
  const hayManual = limiteManual !== null && limiteManual !== undefined;

  // Si hay límite manual, lo usamos y recomputamos disponible = limite - saldo
  const limiteEfectivo = hayManual ? Number(limiteManual) : limitePolitica;
  const disponible = hayManual ? Number(limiteEfectivo - saldo) : disponibleVista;

  return {
    saldo,
    limite: limiteEfectivo,
    disponible,
    limite_manual_aplicado: Boolean(hayManual),
  };
}

/**
 * Suscripción Realtime a cambios del campo limite_manual del cliente activo.
 * cb() se ejecuta en cada cambio (tú vuelves a llamar getCxcCliente en tu componente).
 * Devuelve { unsubscribe: () => void }
 */
export function subscribeClienteLimiteManual(clienteId, cb) {
  if (!clienteId) return { unsubscribe: () => {} };

  const channel = supabase
    .channel(`clientes-limite-manual-${clienteId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "clientes",
        filter: `id=eq.${clienteId}`,
      },
      () => {
        try { cb && cb(); } catch (e) { /* no-op */ }
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      try {
        channel.unsubscribe?.();
        supabase.removeChannel?.(channel);
      } catch {}
    },
  };
}
