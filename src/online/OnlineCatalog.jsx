// src/online/OnlineCatalog.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

function Price({ v }) {
  const n = Number(v || 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function OnlineCatalog() {
  const [q, setQ] = useState("");
  const [onlyVisible, setOnlyVisible] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const SELECTS =
    "id,codigo,nombre,marca,price_base,price_online,visible,visible_online,descripcion,stock";

  async function fetchList() {
    setLoading(true);
    try {
      const base = supabase
        .from("online_products_v")
        .select(SELECTS)
        .order("nombre", { ascending: true });

      // La vista ya garantiza stock>0 en VAN Online.
      // Filtros adicionales de UI:
      if (onlyVisible) base.eq("visible_online", true);

      if (q.trim()) {
        const term = `%${q.trim()}%`;
        // multi-campo sin duplicados
        const [byNombre, byMarca, byCodigo] = await Promise.all([
          base.clone().ilike("nombre", term),
          base.clone().ilike("marca", term),
          base.clone().ilike("codigo", term),
        ]);
        const map = new Map();
        (byNombre.data || []).forEach((r) => map.set(r.id, r));
        (byMarca.data || []).forEach((r) => map.set(r.id, r));
        (byCodigo.data || []).forEach((r) => map.set(r.id, r));
        setRows(Array.from(map.values()));
        return;
      }

      const { data, error } = await base;
      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      alert(err?.message || "No se pudo cargar el catálogo.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, onlyVisible]);

  const total = useMemo(() => rows.length, [rows]);

  // --- Mutaciones sobre online_product_meta (por id de producto) ---
  async function updateMeta(producto_id, patch) {
    const { error } = await supabase
      .from("online_product_meta")
      .update(patch)
      .eq("producto_id", producto_id);
    if (error) throw error;
  }

  async function onToggleVisible(producto_id, field, value) {
    try {
      await updateMeta(producto_id, { [field]: value });
      // refrescamos SOLO esa fila desde la vista (que ya refleja flags)
      const { data, error } = await supabase
        .from("online_products_v")
        .select(SELECTS)
        .eq("id", producto_id)
        .single();
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === producto_id ? data : r)));
    } catch (e) {
      alert(e?.message || "No se pudo actualizar.");
    }
  }

  async function onUpdateField(producto_id, patch) {
    try {
      await updateMeta(producto_id, patch);
      const { data, error } = await supabase
        .from("online_products_v")
        .select(SELECTS)
        .eq("id", producto_id)
        .single();
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === producto_id ? data : r)));
    } catch (e) {
      alert(e?.message || "No se pudo actualizar.");
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-2">Catálogo</h1>
      <p className="text-sm text-gray-600 mb-4">
        *Este listado proviene de <code>online_products_v</code> y solo incluye
        productos con <b>stock &gt; 0</b> en la VAN Online.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <input
          className="border rounded-lg px-3 py-2 flex-1"
          placeholder="Buscar por nombre, marca o código…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyVisible}
            onChange={(e) => setOnlyVisible(e.target.checked)}
          />
          Mostrar solo visibles online
        </label>
        <button
          onClick={fetchList}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg"
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
        <div className="text-sm text-gray-600">{total} ítems</div>
      </div>

      {!rows.length && !loading && (
        <div className="text-gray-500">No hay productos (con stock en la VAN Online).</div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {rows.map((r) => (
          <div key={r.id} className="bg-white border rounded-xl p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">{r.nombre}</div>
                <div className="text-xs text-gray-500">{r.marca || "—"}</div>
                <div className="text-xs text-gray-500">{r.codigo}</div>
                <div className="mt-1 text-xs text-green-700">
                  Stock online: {Number(r.stock || 0)}
                </div>
              </div>

              <div className="text-right">
                <div className="font-semibold">
                  <Price v={r.price_online ?? r.price_base} />
                </div>
                {r.price_online && r.price_online !== r.price_base ? (
                  <div className="text-xs text-gray-500 line-through">
                    <Price v={r.price_base} />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!r.visible}
                  onChange={(e) =>
                    onToggleVisible(r.id, "visible", e.target.checked)
                  }
                />
                Visible (admin)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!r.visible_online}
                  onChange={(e) =>
                    onToggleVisible(r.id, "visible_online", e.target.checked)
                  }
                />
                Visible online
              </label>

              <input
                className="border rounded-lg px-2 py-1 text-sm"
                placeholder="Precio online"
                defaultValue={r.price_online ?? ""}
                onBlur={(e) =>
                  onUpdateField(r.id, {
                    precio_online:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />

              <input
                className="border rounded-lg px-2 py-1 text-sm"
                placeholder="Descripción"
                defaultValue={r.descripcion || ""}
                onBlur={(e) =>
                  onUpdateField(r.id, { descripcion: e.target.value || "N/A" })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
