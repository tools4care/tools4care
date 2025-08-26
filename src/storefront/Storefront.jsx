// src/storefront/Storefront.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { addToCart, ensureCart, cartCount } from "./cartApi";

/* ---------- helpers ---------- */
function Price({ value, currency = "USD" }) {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
const norm = (s = "") =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/* ---------- componente ---------- */
export default function Storefront() {
  const [q, setQ] = useState("");
  const [allRows, setAllRows] = useState([]);   // catálogo completo (visible + stock)
  const [rows, setRows] = useState([]);         // lista filtrada para el grid principal
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);

  // filtros extra
  const [brand, setBrand] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("relevance"); // relevance | price_asc | price_desc | name_asc
  const navigate = useNavigate();

  const offersRef = useRef(null);

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

  // Cargar catálogo una sola vez
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const selects =
          "id,codigo,nombre,marca,price_base,price_online,visible,visible_online,descripcion,stock,in_online_inventory";
        const { data, error } = await supabase
          .from("online_products_v")
          .select(selects)
          .eq("visible", true)
          .eq("visible_online", true)
          .eq("in_online_inventory", true)
          .gt("stock", 0)
          .order("nombre", { ascending: true });

        if (error) throw error;
        setAllRows(data || []);
      } catch (err) {
        alert(err?.message || "No se pudieron cargar los productos.");
        setAllRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Aplicar filtros/búsqueda localmente
  useEffect(() => {
    const nq = norm(q);
    let list = [...allRows];

    if (nq) {
      list = list.filter((p) => {
        const hay = [p.nombre, p.marca, p.codigo].some((f) => norm(f).includes(nq));
        return hay;
      });
    }

    if (brand !== "all") {
      list = list.filter((p) => (p.marca || "").toLowerCase() === brand);
    }

    list = list.filter((p) => {
      const price = Number(p.price_online ?? p.price_base ?? 0);
      if (minPrice !== "" && price < Number(minPrice)) return false;
      if (maxPrice !== "" && price > Number(maxPrice)) return false;
      return true;
    });

    if (sort === "price_asc") list.sort((a, b) => (a.price_online ?? a.price_base ?? 0) - (b.price_online ?? b.price_base ?? 0));
    if (sort === "price_desc") list.sort((a, b) => (b.price_online ?? b.price_base ?? 0) - (a.price_online ?? a.price_base ?? 0));
    if (sort === "name_asc") list.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

    setRows(list);
  }, [q, brand, minPrice, maxPrice, sort, allRows]);

  const total = useMemo(() => rows.length, [rows]);

  async function handleAdd(p) {
    try {
      const newCount = await addToCart(p, 1);
      setCount(newCount);
    } catch (e) {
      alert(e?.message || "No se pudo agregar al carrito.");
    }
  }

  // Checkout público
  function goCheckout() {
    navigate("/checkout");
  }

  // Datos derivados para secciones
  const offers = useMemo(
    () =>
      allRows
        .filter((p) => p.price_online != null && p.price_base != null && Number(p.price_online) < Number(p.price_base))
        .slice(0, 8),
    [allRows]
  );

  const novedades = useMemo(
    () => [...allRows].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 12),
    [allRows]
  );

  const brands = useMemo(() => {
    const set = new Set();
    allRows.forEach((p) => p.marca && set.add(String(p.marca).toLowerCase()));
    return ["all", ...Array.from(set).sort()];
  }, [allRows]);

  /* ---------- UI ---------- */

  function ProductCard({ p }) {
    const price = p.price_online ?? p.price_base ?? 0;
    const hasOffer = p.price_online != null && p.price_base != null && Number(p.price_online) < Number(p.price_base);
    const outOfStock = Number(p.stock || 0) <= 0;
    return (
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-3">
          <div className="relative">
            <div className="h-36 bg-gray-100 rounded-xl flex items-center justify-center text-xs text-gray-400">
              sin imagen
            </div>
            {hasOffer && (
              <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                Oferta
              </span>
            )}
          </div>

          <div className="mt-3 text-xs text-green-700">Stock: {Number(p.stock || 0)}</div>

          <div className="mt-2 font-medium leading-tight line-clamp-2 min-h-[40px]">{p.nombre}</div>
          <div className="text-xs text-gray-500">{p.marca || "—"}</div>
          <div className="text-xs text-gray-500">{p.codigo}</div>

          <div className="mt-2 font-semibold">
            <Price value={price} />
            {hasOffer ? (
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
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            className="flex items-center gap-2 text-lg font-semibold"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="Inicio"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" className="text-blue-600">
              <path fill="currentColor" d="M12 2l3.5 7H22l-6 4.5L19 21l-7-4.5L5 21l3-7.5L2 9h6.5z" />
            </svg>
            <span>Tools4care Storefront</span>
          </button>

          {/* search */}
          <div className="flex-1 flex items-center gap-2">
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Buscar por código, nombre o marca…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* auth clientes (NO empleados) */}
          <a
            href="/store/register"
            className="hidden sm:inline-flex items-center px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
            title="Crear cuenta"
          >
            Crear cuenta
          </a>
          <a
            href="/store/login"
            className="hidden sm:inline-flex items-center px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
            title="Entrar"
          >
            Entrar
          </a>

          {/* cart button */}
          <button
            type="button"
            onClick={goCheckout}
            className="relative ml-1 inline-flex items-center justify-center rounded-lg border px-3 py-2 hover:bg-gray-50"
            title="Ir al checkout"
            aria-label="Carrito"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" className="text-gray-700">
              <path
                fill="currentColor"
                d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2m10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2M7.16 14h9.69c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.34 5H6.21l-.94-2H2v2h2l3.6 7.59L6.25 13a2 2 0 0 0 .09 1c.24.61.82 1 1.49 1Z"
              />
            </svg>
            <span className="absolute -top-1 -right-1 text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5">
              {count}
            </span>
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              Tools4care: Ofertas de la semana y nuevos ingresos
            </h1>
            <p className="mt-2 text-white/90">
              Descubre precios especiales y productos recién agregados. ¡Aprovecha antes de que se agoten!
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => offersRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-lg bg-white text-gray-900 px-4 py-2 font-semibold hover:bg-gray-100"
              >
                Ver ofertas
              </button>
              <a
                href="#catalogo"
                className="rounded-lg border border-white/30 px-4 py-2 hover:bg-white/10"
              >
                Ver catálogo
              </a>
            </div>
          </div>
          <div className="bg-white/10 rounded-2xl p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-2xl font-bold">{allRows.length}</div>
                <div className="text-xs">Productos</div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-2xl font-bold">{offers.length}</div>
                <div className="text-xs">Ofertas</div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-2xl font-bold">{novedades.length}</div>
                <div className="text-xs">Novedades</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OFERTAS */}
      <section ref={offersRef} className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">Ofertas destacadas</h2>
          <a href="#catalogo" className="text-sm text-blue-600 hover:underline">
            Ver todo el catálogo →
          </a>
        </div>
        {offers.length ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {offers.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className="mt-4 text-gray-500">No hay ofertas por ahora.</div>
        )}
      </section>

      {/* NOVEDADES */}
      <section className="max-w-7xl mx-auto px-4 pb-2">
        <h2 className="text-xl font-bold">Novedades</h2>
        {novedades.length ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {novedades.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className="mt-4 text-gray-500">Sin novedades.</div>
        )}
      </section>

      {/* CATÁLOGO + FILTROS */}
      <section id="catalogo" className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xl font-bold">Catálogo</h2>
          <div className="text-sm text-gray-600">
            {loading ? "Cargando…" : `${total} producto${total === 1 ? "" : "s"}`}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-3 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="sm:col-span-2">
              <input
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Buscar por código, nombre o marca…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                title="Marca"
              >
                {["all", ...new Set(allRows.map((p) => (p.marca || "").toLowerCase()))]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .sort()
                  .map((b) => (
                    <option key={b} value={b}>
                      {b === "all" ? "Todas las marcas" : b}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Min $"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
              <input
                type="number"
                min="0"
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Max $"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>

            <div>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                title="Ordenar"
              >
                <option value="relevance">Relevancia</option>
                <option value="price_asc">Precio: menor a mayor</option>
                <option value="price_desc">Precio: mayor a menor</option>
                <option value="name_asc">Nombre A → Z</option>
              </select>
            </div>
          </div>
        </div>

        {!rows.length && !loading && (
          <div className="text-gray-500">No hay productos con los filtros actuales.</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {rows.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      <footer className="mt-10 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Tools4care — hecho con 💙
      </footer>
    </div>
  );
}
