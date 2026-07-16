import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, PackageCheck, RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient";

const dateTime = (value) => value
  ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  : "—";

export default function InventoryTransferReceipts({ locationId, onReceived }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [receivingId, setReceivingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!locationId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError("");
    const result = await supabase.rpc("get_pending_inventory_receipts", {
      p_location_id: locationId,
      p_limit: 30,
    });
    if (result.error) setError(result.error.message || "Could not load pending receipts.");
    else setRows(Array.isArray(result.data) ? result.data : []);
    setLoading(false);
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  async function receive(transferId) {
    setReceivingId(transferId);
    setError("");
    const result = await supabase.rpc("acknowledge_inventory_transfer", {
      p_transfer_id: transferId,
    });
    if (result.error) {
      setError(result.error.message || "Could not acknowledge this transfer.");
    } else {
      await load();
      await onReceived?.();
    }
    setReceivingId(null);
  }

  if (!locationId || (!loading && rows.length === 0 && !error)) return null;

  return (
    <section className="max-w-4xl mx-auto px-4 mt-4">
      <div className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><PackageCheck size={21} /></span>
            <div><h2 className="font-black text-emerald-950">Inventory Awaiting Receipt</h2><p className="text-xs font-semibold text-emerald-700">A receiver must confirm merchandise delivered to this location.</p></div>
          </div>
          <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-emerald-200 bg-white p-2 text-emerald-700 disabled:opacity-50" title="Refresh receipts"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button>
        </div>
        {error && <div className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
        <div className="divide-y divide-slate-100">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="truncate font-black text-slate-900">{row.product_name} · {Number(row.quantity)} units</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-500">From {row.origin_name} · sent by {row.initiated_by_name} · {dateTime(row.initiated_at)}</div>
                {row.reason && <div className="mt-1 text-xs text-slate-400">{row.reason}</div>}
              </div>
              <button type="button" onClick={() => receive(row.id)} disabled={receivingId === row.id} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                <CheckCircle2 size={17} /> {receivingId === row.id ? "Receiving…" : "Confirm Received"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
