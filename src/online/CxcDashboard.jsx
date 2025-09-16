// CxcDashboard.jsx
import React from "react";

const currency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

function useFetch(initialUrl = null, initialData = null) {
  const [data, setData] = React.useState(initialData);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const run = async (url, options) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { if (initialUrl) run(initialUrl); }, [initialUrl]);
  return { data, loading, error, run, setData };
}

function ResumenTable({ rows, onSelect }) {
  return (
    <div className="overflow-auto rounded-xl shadow bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-left p-3">Cliente</th>
            <th className="text-left p-3">Teléfono</th>
            <th className="text-right p-3">Ventas con saldo</th>
            <th className="text-right p-3">Saldo</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.cliente_id} className="border-t">
              <td className="p-3">{r.cliente}</td>
              <td className="p-3">{r.telefono || "—"}</td>
              <td className="p-3 text-right">{r.ventas_con_saldo}</td>
              <td className="p-3 text-right font-semibold">{currency(r.saldo_cliente)}</td>
              <td className="p-3 text-right">
                <button className="text-blue-700 hover:underline" onClick={() => onSelect(r)}>
                  Ver detalle
                </button>
              </td>
            </tr>
          ))}
          {(!rows || rows.length === 0) && (
            <tr><td colSpan="5" className="p-4 text-center text-slate-500">Sin datos</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AgingCard({ item }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="font-semibold">{item.cliente}</div>
      <div className="text-xs text-slate-500 mb-2">{item.cliente_id}</div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex justify-between"><span>0–30</span><span>{currency(item.d0_30)}</span></div>
        <div className="flex justify-between"><span>31–60</span><span>{currency(item.d31_60)}</span></div>
        <div className="flex justify-between"><span>61–90</span><span>{currency(item.d61_90)}</span></div>
        <div className="flex justify-between"><span>90+</span><span>{currency(item.d90_plus)}</span></div>
      </div>
      <div className="mt-2 flex justify-between font-semibold">
        <span>Total</span><span>{currency(item.total)}</span>
      </div>
    </div>
  );
}

const normalizePhone = (raw) => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
};
const openWhatsAppWith = (telefono, texto) => {
  const to = normalizePhone(telefono);
  if (!to) { alert("Este cliente no tiene teléfono válido."); return; }
  const url = `https://wa.me/${to.replace("+","")}?text=${encodeURIComponent(texto || "")}`;
  window.open(url, "_blank");
};

function DetalleCliente({ api, cliente, onClose }) {
  const { data: detalle, loading, error, run } = useFetch();
  const { data: recData, run: runRec } = useFetch();
  const [mensaje, setMensaje] = React.useState("");

  React.useEffect(() => {
    if (cliente?.cliente_id) {
      run(`${api}/cxc/clientes/${cliente.cliente_id}/pendientes`);
      setMensaje("");
    }
  }, [cliente?.cliente_id]);

  const generarSugerencia = async () => {
    await runRec(`${api}/cxc/clientes/${cliente.cliente_id}/recordatorio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
  };

  React.useEffect(() => {
    if (recData?.mensaje_sugerido) setMensaje(recData.mensaje_sugerido);
  }, [recData]);

  const copyToClipboard = async () => {
    try { await navigator.clipboard.writeText(mensaje || ""); alert("Message copied ✅"); }
    catch { alert("No se pudo copiar automáticamente."); }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center p-3 z-50">
      <div className="bg-white w-full md:max-w-3xl rounded-2xl shadow-lg">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="font-bold text-lg">{cliente.cliente}</div>
            <div className="text-sm text-slate-500">{cliente.telefono || "No phone"}</div>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900">✕</button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            {loading && <div className="text-sm text-slate-500">Loading detail…</div>}
            {error && <div className="text-sm text-red-600">Error: {error}</div>}
            {!loading && !error && (
              <div className="overflow-auto rounded border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-2">Factura</th>
                      <th className="text-left p-2">Fecha</th>
                      <th className="text-right p-2">Pendiente</th>
                      <th className="text-right p-2">Días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle?.map((d) => (
                      <tr key={d.numero_factura} className="border-t">
                        <td className="p-2">{d.numero_factura}</td>
                        <td className="p-2">{d.fecha?.slice(0,10)}</td>
                        <td className="p-2 text-right">{currency(d.pendiente)}</td>
                        <td className="p-2 text-right">{d.dias}</td>
                      </tr>
                    ))}
                    {(!detalle || detalle.length === 0) && (
                      <tr><td colSpan="4" className="p-3 text-center text-slate-500">Sin pendientes</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border rounded-xl p-3 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Mensaje de recordatorio</div>
              {!recData && (
                <button onClick={generarSugerencia} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm">
                  Generar sugerencia
                </button>
              )}
            </div>

            {recData && (
              <>
                <textarea className="w-full border rounded-lg p-2 text-sm h-28" value={mensaje} onChange={e=>setMensaje(e.target.value)} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={copyToClipboard} className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm">Copiar</button>
                  <button onClick={() => openWhatsAppWith(recData?.telefono, mensaje)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm">WhatsApp</button>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Total: {currency(recData?.saldo_total)} • Tel: {recData?.telefono || "—"}
                </div>
              </>
            )}

            {!recData && <div className="text-xs text-slate-500">Haz clic en “Generar sugerencia”.</div>}
          </div>

          <div className="flex gap-2 justify-end">
            {!recData && (
              <button onClick={generarSugerencia} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg">
                Generar recordatorio
              </button>
            )}
            <button onClick={onClose} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CxcDashboard({ apiBase }) {
  const [minSaldo, setMinSaldo] = React.useState(0.05);
  const [limit, setLimit] = React.useState(50);
  const [showAging, setShowAging] = React.useState(false);
  const [selected, setSelected] = React.useState(null);

  const resumenUrl = `${apiBase}/cxc/resumen?min_saldo=${minSaldo}&limit=${limit}`;
  const agingUrl   = `${apiBase}/cxc/aging?min_total=${minSaldo}&limit=${limit}`;

  const { data: resumen, loading: l1, error: e1, run: runResumen } = useFetch(resumenUrl);
  const { data: aging,   loading: l2, error: e2, run: runAging   } = useFetch();

  const reload = () => runResumen(resumenUrl);
  const loadAging = () => { setShowAging(true); runAging(agingUrl); };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className={`px-3 py-2 rounded-lg ${!showAging ? "bg-blue-600 text-white" : "bg-white border"}`} onClick={()=>setShowAging(false)}>Resumen</button>
        <button className={`px-3 py-2 rounded-lg ${showAging ? "bg-blue-600 text-white" : "bg-white border"}`} onClick={loadAging}>Aging</button>
      </div>

      {!showAging && (
        <>
          <div className="flex flex-wrap gap-3 items-end bg-white p-3 rounded-xl shadow">
            <div>
              <label className="block text-sm font-medium">Mín. saldo</label>
              <input type="number" step="0.01" value={minSaldo} onChange={(e)=>setMinSaldo(e.target.value)} className="border rounded px-3 py-2 w-40" />
            </div>
            <div>
              <label className="block text-sm font-medium">Límite</label>
              <input type="number" value={limit} onChange={(e)=>setLimit(e.target.value)} className="border rounded px-3 py-2 w-40" />
            </div>
            <button onClick={reload} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Recargar</button>
          </div>
          {l1 && <div className="text-sm text-slate-500">Cargando…</div>}
          {e1 && <div className="text-sm text-red-600">Error: {e1}</div>}
          {!l1 && !e1 && <ResumenTable rows={resumen} onSelect={setSelected} />}
        </>
      )}

      {showAging && (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="text-sm text-slate-600">Min total: {currency(minSaldo)}</div>
            <button onClick={loadAging} className="px-3 py-2 rounded-lg bg-white border">Refrescar</button>
          </div>
          {l2 && <div className="text-sm text-slate-500">Cargando aging…</div>}
          {e2 && <div className="text-sm text-red-600">Error: {e2}</div>}
          {!l2 && !e2 && (
            <div className="grid md:grid-cols-3 gap-3">
              {aging?.map((a)=> <AgingCard key={a.cliente_id} item={a} />)}
              {(!aging || aging.length===0) && <div className="text-sm text-slate-500">Sin datos</div>}
            </div>
          )}
      </div>
      )}

      {selected && <DetalleCliente api={apiBase} cliente={selected} onClose={()=>setSelected(null)} />}
    </div>
  );
}
