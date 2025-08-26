// src/storefront/Storefront.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { addToCart, ensureCart, cartCount } from "./cartApi";

function Price({ value, currency = "USD" }) {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Storefront() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const navigate = useNavigate();

  // Cargar conteo inicial del carrito
  useEffect(() => {
    (async () => {
      try {
        const cid = await ensureCart();
        const c = await cartCount(cid);
        setCount(c);
      } catch {}
    })();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    try {
      const selects =
        "id,codigo,nombre,marca,price_base,price_online,visible,visible_online,descripcion,stock,in_online_inventory";

      const baseQuery = () =>
        supabase
          .from("online_products_v")
          .select(selects)
          .eq("visible", true)
          .eq("visible_online", true)
          .eq("in_online_inventory", true)
          .gt("stock", 0)
          .order("nombre", { ascending: true });

      if (q.trim()) {
        const term = `%${q.trim()}%`;
        const [byNombre, byMarca, byCodigo] = await Promise.all([
          baseQuery().ilike("nombre", term),
          baseQuery().ilike("marca", term),
          baseQuery().ilike("codigo", term),
        ]);
        const merge = new Map();
        (byNombre.data || []).forEach((r) => merge.set(r.id, r));
        (byMarca.data || []).forEach((r) => merge.set(r.id, r));
        (byCodigo.data || []).forEach((r) => merge.set(r.id, r));
        setRows(Array.from(merge.values()));
        return;
      }

      const { data, error } = await baseQuery();
      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      alert(err?.message || "No se pudieron cargar los productos.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const total = useMemo(() => rows.length, [rows]);

  async function handleAdd(p) {
    try {
      const newCount = await addToCart(p, 1);
      setCount(newCount);
    } catch (e) {
      alert(e?.message || "No se pudo agregar al carrito.");
    }
  }

  // Navega al checkout dentro de /online/*
  function goCheckout() {
    navigate("/online/checkout"); // si Storefront ya está bajo /online, puedes usar navigate("checkout")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="font-semibold text-lg">🛍️ Storefront</span>
          <input
            className="flex-1 border rounded-lg px-3 py-2"
            placeholder="Buscar por código, nombre o marca…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            onClick={goCheckout}
            className="ml-auto px-3 py-2 border rounded-lg"
            title="Ir al checkout"
            aria-label="Carrito"
          >
            🧺 {count}
          </button>
          <div className="text-sm text-gray-600">
            {loading ? "Cargando…" : `${total} producto${total === 1 ? "" : "s"}`}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {!rows.length && !loading && (
          <div className="text-gray-500">No hay productos visibles.</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {rows.map((p) => {
            const price = p.price_online ?? p.price_base ?? 0;
            const outOfStock = Number(p.stock || 0) <= 0;

            return (
              <div
                key={p.id}
                className="bg-white rounded-xl shadow-sm border overflow-hidden"
              >
                <div className="p-3">
                  <div className="h-36 bg-gray-100 rounded-xl flex items-center justify-center text-xs text-gray-400">
                    sin imagen
                  </div>

                  <div className="mt-3 text-xs text-green-700">
                    Stock: {Number(p.stock || 0)}
                  </div>

                  <div className="mt-2 font-medium leading-tight">{p.nombre}</div>
                  <div className="text-xs text-gray-500">{p.marca || "—"}</div>
                  <div className="text-xs text-gray-500">{p.codigo}</div>

                  <div className="mt-2 font-semibold">
                    <Price value={price} />
                    {p.price_online && p.price_online !== p.price_base ? (
                      <span className="ml-2 text-xs text-gray-500 line-through">
                        <Price value={p.price_base} />
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    disabled={outOfStock}
                    className={`mt-3 w-full rounded-lg px-3 py-2 text-sm ${
                      outOfStock
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                    onClick={() => handleAdd(p)}
                  >
                    {outOfStock ? "Sin stock" : "Agregar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
