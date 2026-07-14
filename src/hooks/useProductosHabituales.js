import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Productos que el cliente compra con frecuencia (ratio >= 30% de sus pedidos).
// Ver supabase/migrations/202607130001_add_productos_habituales_view.sql para
// el umbral y por que "repetir el ultimo pedido" no se usa aqui: los datos
// reales muestran 84% de solapamiento cero entre pedidos consecutivos.
export function useProductosHabituales(clienteId) {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clienteId) {
      setProductos([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("v_productos_habituales_cliente")
      .select("producto_id, producto_nombre, veces_comprado, total_ordenes, ratio_recompra, dias_desde_ultima_compra, vencido")
      .eq("cliente_id", clienteId)
      .order("ratio_recompra", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (cancelled) return;
        setProductos(error ? [] : data || []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clienteId]);

  return { productos, loading };
}
