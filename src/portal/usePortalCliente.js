import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const CACHE_KEY = "tools4care_portal_balance_v1";

export function usePortalCliente(session) {
  const [state, setState] = useState({ cliente: null, resumen: null, loading: true, error: "", unlinked: false });

  const refresh = useCallback(async () => {
    if (!session?.user?.id) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const { data: link, error: linkError } = await supabase.from("cliente_usuarios").select("cliente_id").eq("user_id", session.user.id).maybeSingle();
      if (linkError) throw linkError;
      if (!link) {
        setState({ cliente: null, resumen: null, loading: false, error: "", unlinked: true });
        return;
      }
      const [{ data: cliente, error: clienteError }, { data: resumen, error: resumenError }] = await Promise.all([
        supabase.from("clientes").select("id,nombre,negocio,email,telefono,direccion,limite_manual").eq("id", link.cliente_id).maybeSingle(),
        supabase.from("v_cxc_cliente_detalle").select("cliente_id,saldo,limite_politica,credito_disponible,score_base").eq("cliente_id", link.cliente_id).maybeSingle(),
      ]);
      if (clienteError) throw clienteError;
      if (resumenError) throw resumenError;
      const next = { cliente, resumen, loading: false, error: "", unlinked: false };
      localStorage.setItem(CACHE_KEY, JSON.stringify({ cliente, resumen, savedAt: new Date().toISOString() }));
      setState(next);
    } catch (fetchError) {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      setState({ cliente: cached?.cliente || null, resumen: cached?.resumen || null, loading: false, error: fetchError.message || "We couldn't refresh your account.", unlinked: false });
    }
  }, [session?.user?.id]);

  useEffect(() => { refresh(); }, [refresh]);
  return { ...state, refresh };
}
