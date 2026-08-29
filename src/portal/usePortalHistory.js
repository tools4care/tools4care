import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const PAGE_SIZE = 20;

function usePortalHistory({ table, columns, dateColumn, clienteId, dateFrom = "", dateTo = "" }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const rowsRef = useRef([]);

  const load = useCallback(async (reset = false) => {
    if (!clienteId || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    const offset = reset ? 0 : rowsRef.current.length;
    let query = supabase.from(table).select(columns).eq("cliente_id", clienteId).order(dateColumn, { ascending: false });
    if (dateFrom) query = query.gte(dateColumn, `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte(dateColumn, `${dateTo}T23:59:59.999`);
    const { data, error: queryError } = await query.range(offset, offset + PAGE_SIZE - 1);
    loadingRef.current = false;
    setLoading(false);
    if (queryError) {
      setError(queryError.message || "We couldn't load this history.");
      return;
    }
    const nextRows = reset ? (data || []) : [...rowsRef.current, ...(data || [])];
    rowsRef.current = nextRows;
    setRows(nextRows);
    setHasMore((data || []).length === PAGE_SIZE);
  }, [clienteId, columns, dateColumn, table, dateFrom, dateTo]);

  useEffect(() => {
    rowsRef.current = [];
    setRows([]);
    setHasMore(true);
    load(true);
  }, [load]);
  return { rows, loading, error, hasMore, loadMore: () => load(false), refresh: () => load(true) };
}

export function usePagosCliente(clienteId) {
  return usePortalHistory({ table: "pagos", columns: "id,monto,metodo_pago,fecha_pago,referencia", dateColumn: "fecha_pago", clienteId });
}

export function useComprasCliente(clienteId, dateFrom = "", dateTo = "") {
  return usePortalHistory({ table: "ventas", columns: "id,total,total_venta,total_pagado,fecha,created_at,numero_factura,estado_pago", dateColumn: "fecha", clienteId, dateFrom, dateTo });
}
