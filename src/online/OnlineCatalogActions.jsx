// src/online/OnlineCatalogActions.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const ENV_ONLINE_VAN_ID = import.meta.env.VITE_ONLINE_VAN_ID || null;

async function resolveOnlineVanId(passedId) {
  if (passedId) return passedId;
  if (ENV_ONLINE_VAN_ID) return ENV_ONLINE_VAN_ID;
  const { data } = await supabase
    .from("vans")
    .select("id")
    .ilike("nombre_van", "%online%")
    .maybeSingle();
  return data?.id ?? null;
}

/* ---------- Buscador de productos (mínimo y rápido) ---------- */
function ProductSearch({ onPick, placeholder = "Search product…" }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const h = setTimeout(async () => {
      const termRaw = q.trim();
      if (!termRaw) {
        setOpts([]);
        return;
      }
      setLoading(true);
      try {
        const term = `%${termRaw}%`;
        const { data, error } = await supabase
          .from("productos")
          .select("id, nombre, marca, codigo, precio")
          .or(`nombre.ilike.${term},marca.ilike.${term},codigo.ilike.${term}`)
          .limit(20);
        if (error) throw error;
        setOpts(data || []);
      } catch (e) {
        console.error(e);
        setOpts([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <div className="w-full">
      <input
        className="w-full border rounded-lg px-3 py-2"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {loading ? <div className="text-xs text-gray-500 mt-1">Searching…</div> : null}
      {opts.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-auto border rounded-lg">
          {opts.map((p) => (
            <li
              key={p.id}
              className="px-3 py-2 cursor-pointer hover:bg-gray-50"
              onClick={() => {
                onPick(p);
                setOpts([]); // UX: cerrar lista al elegir
              }}
            >
              <div className="font-medium">{p.nombre}</div>
              <div className="text-[11px] text-gray-500">
                {p.marca || "—"} · <span className="font-mono">{p.codigo}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Modal: Agregar producto a VAN Online ---------- */
function AddStockModal({ open, onClose, onlineVanId, onDone }) {
  const [picked, setPicked] = useState(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked(null);
      setQty(1);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    if (!picked) return;
    const amount = Number(qty);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Quantity must be a positive number.");
      return;
    }

    setSaving(true);
    try {
      const vanId = await resolveOnlineVanId(onlineVanId);
      if (!vanId) throw new Error("Online VAN not found.");

      // ¿ya existe?
      const { data: row, error: selErr } = await supabase
        .from("stock_van")
        .select("cantidad")
        .match({ van_id: vanId, producto_id: picked.id })
        .maybeSingle();
      if (selErr) throw selErr;

      if (row) {
        const { error } = await supabase
          .from("stock_van")
          .update({ cantidad: Number(row.cantidad || 0) + amount })
          .match({ van_id: vanId, producto_id: picked.id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("stock_van")
          .insert([{ van_id: vanId, producto_id: picked.id, cantidad: amount }]);
        if (error) throw error;
      }

      onDone && onDone();
      onClose && onClose();
    } catch (e) {
      alert(e?.message || "Could not add stock.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-4">
        <h3 className="text-lg font-semibold mb-2">Add product to Online</h3>

        {!picked ? (
          <ProductSearch onPick={setPicked} placeholder="Search by name, brand or code…" />
        ) : (
          <div className="border rounded-lg p-3 mb-3">
            <div className="font-medium">{picked.nombre}</div>
            <div className="text-xs text-gray-500">
              {picked.marca || "—"} · <span className="font-mono">{picked.codigo}</span>
            </div>
          </div>
        )}

        <div className="mt-2">
          <label className="text-sm">Quantity</label>
          <input
            type="number"
            min={1}
            className="w-full border rounded-lg px-3 py-2"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-lg border px-3 py-2" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded-lg bg-blue-600 text-white px-3 py-2 disabled:opacity-50"
            onClick={handleSave}
            disabled={!picked || saving}
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Modal: Transferir desde Almacén → Online ---------- */
function TransferModal({ open, onClose, onlineVanId, onDone }) {
  const [picked, setPicked] = useState(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [stockOrigen, setStockOrigen] = useState(null);

  useEffect(() => {
    if (open) {
      setPicked(null);
      setQty(1);
      setSaving(false);
      setStockOrigen(null);
    }
  }, [open]);

  async function fetchStockOrigen(productoId) {
    const { data, error } = await supabase
      .from("stock_almacen")
      .select("cantidad")
      .eq("producto_id", productoId)
      .maybeSingle();
    if (!error) setStockOrigen(Number(data?.cantidad || 0));
  }

  if (!open) return null;

  async function handleSave() {
    if (!picked) return;
    const amount = Number(qty);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Quantity must be a positive number.");
      return;
    }

    setSaving(true);
    try {
      const vanId = await resolveOnlineVanId(onlineVanId);
      if (!vanId) throw new Error("Online VAN not found.");

      // 1) verificar origen
      const { data: rowO, error: eSelO } = await supabase
        .from("stock_almacen")
        .select("cantidad")
        .eq("producto_id", picked.id)
        .maybeSingle();
      if (eSelO) throw eSelO;

      const have = Number(rowO?.cantidad || 0);
      if (have < amount) throw new Error("Not enough stock in Central Warehouse.");

      // 2) descuenta en origen
      const { error: e1 } = await supabase
        .from("stock_almacen")
        .update({ cantidad: have - amount })
        .eq("producto_id", picked.id);
      if (e1) throw e1;

      // 3) suma en destino (stock_van)
      const { data: rowD, error: eSelD } = await supabase
        .from("stock_van")
        .select("cantidad")
        .match({ van_id: vanId, producto_id: picked.id })
        .maybeSingle();
      if (eSelD) throw eSelD;

      if (rowD) {
        const { error } = await supabase
          .from("stock_van")
          .update({ cantidad: Number(rowD.cantidad || 0) + amount })
          .match({ van_id: vanId, producto_id: picked.id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("stock_van")
          .insert([{ van_id: vanId, producto_id: picked.id, cantidad: amount }]);
        if (error) throw error;
      }

      onDone && onDone();
      onClose && onClose();
    } catch (e) {
      alert(e?.message || "Could not transfer stock.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-4">
        <h3 className="text-lg font-semibold mb-2">Transfer stock to Online</h3>

        {!picked ? (
          <ProductSearch
            onPick={async (p) => {
              setPicked(p);
              await fetchStockOrigen(p.id);
            }}
            placeholder="Search product in Central Warehouse…"
          />
        ) : (
          <div className="border rounded-lg p-3 mb-3">
            <div className="font-medium">{picked.nombre}</div>
            <div className="text-xs text-gray-500">
              {picked.marca || "—"} · <span className="font-mono">{picked.codigo}</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Stock origin (Central): <b>{stockOrigen ?? "—"}</b>
            </div>
          </div>
        )}

        <div className="mt-2">
          <label className="text-sm">Quantity</label>
          <input
            type="number"
            min={1}
            className="w-full border rounded-lg px-3 py-2"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-lg border px-3 py-2" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded-lg bg-green-600 text-white px-3 py-2 disabled:opacity-50"
            onClick={handleSave}
            disabled={!picked || saving}
          >
            {saving ? "Transferring…" : "Transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Toolbar de acciones para el Catálogo ---------- */
export default function OnlineCatalogActions({ onlineVanId, onChanged }) {
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          className="px-3 py-2 rounded-lg bg-blue-600 text-white"
          onClick={() => setAddOpen(true)}
        >
          + Add product
        </button>
        <button
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
          onClick={() => setTransferOpen(true)}
        >
          ⇄ Transfer stock
        </button>
      </div>

      <AddStockModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onlineVanId={onlineVanId}
        onDone={onChanged}
      />

      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onlineVanId={onlineVanId}
        onDone={onChanged}
      />
    </>
  );
}
