import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Users, Package, FileText, CreditCard, ShoppingBag, ArrowRight } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useVan } from "../hooks/VanContext";
import { barcodeVariants, isCodeLikeSearch } from "../utils/productSearch";
import { clientDigits, isPhoneLikeSearch, phoneSearchVariants } from "../utils/clientSearch";

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const money = (value) => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function GlobalSearch() {
  const navigate = useNavigate();
  const { van } = useVan();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [hl, setHl] = useState(-1);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else {
      setQuery("");
      setGroups([]);
    }
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setGroups([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const like = `%${term}%`;
      const codeLike = isCodeLikeSearch(term);
      const phoneLike = isPhoneLikeSearch(term);
      const productCodeFilters = barcodeVariants(term)
        .map((code) => `codigo.ilike.${codeLike ? `${code}%` : `%${code}%`}`)
        .join(",");
      const phoneFilters = phoneSearchVariants(term).map((v) => `telefono.ilike.%${v}%`);
      try {
        const clientQuery = supabase
          .from("clientes")
          .select("id,nombre,negocio,telefono,email")
          .or([
            `nombre.ilike.${like}`,
            `negocio.ilike.${like}`,
            `telefono.ilike.${like}`,
            `email.ilike.${like}`,
            ...(phoneLike ? [`telefono.ilike.%${clientDigits(term)}%`, ...phoneFilters] : []),
          ].join(","))
          .limit(6);
        const productQuery = supabase
          .from("productos")
          .select("id,nombre,codigo,marca,precio")
          .or(`nombre.ilike.${like},${productCodeFilters || `codigo.ilike.${like}`},marca.ilike.${like}`)
          .limit(6);
        let saleQuery = supabase
          .from("ventas")
          .select("id,numero_factura,fecha,total_venta,total,estado_pago,cliente_id")
          .order("fecha", { ascending: false })
          .limit(6);
        saleQuery = isUuid(term) ? saleQuery.eq("id", term) : saleQuery.ilike("numero_factura", like);
        if (van?.id) saleQuery = saleQuery.eq("van_id", van.id);

        let paymentQuery = supabase
          .from("pagos")
          .select("id,fecha_pago,monto,metodo_pago,referencia,cliente_id")
          .order("fecha_pago", { ascending: false })
          .limit(6);
        paymentQuery = paymentQuery.or(`referencia.ilike.${like},metodo_pago.ilike.${like}`);
        if (van?.id) paymentQuery = paymentQuery.eq("van_id", van.id);

        const orderQuery = supabase
          .from("orders")
          .select("id,name,email,status,amount_total,created_at")
          .or(`name.ilike.${like},email.ilike.${like},payment_intent_id.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(6);

        const [clients, products, sales, payments, orders] = await Promise.all([
          clientQuery, productQuery, saleQuery, paymentQuery, orderQuery,
        ]);
        if (cancelled) return;

        setGroups([
          {
            key: "clients", label: "Customers", icon: Users,
            rows: (clients.data || []).map((row) => ({ id: row.id, path: `/clientes?client=${row.id}`, title: row.nombre || "Customer", detail: row.negocio || row.telefono || row.email || "" })),
          },
          {
            key: "products", label: "Products", icon: Package,
            rows: (products.data || []).map((row) => ({ id: row.id, path: `/productos?product=${row.id}`, title: row.nombre || "Product", detail: [row.codigo, row.marca, money(row.precio)].filter(Boolean).join(" · ") })),
          },
          {
            key: "sales", label: "Sales / invoices", icon: FileText,
            rows: (sales.data || []).map((row) => ({ id: row.id, path: `/facturas?invoice=${row.id}`, title: row.numero_factura || `Invoice #${row.id.slice(0, 8)}`, detail: `${String(row.fecha || "").slice(0, 10)} · ${money(row.total_venta ?? row.total)} · ${row.estado_pago || ""}` })),
          },
          {
            key: "payments", label: "Payments", icon: CreditCard,
            rows: (payments.data || []).map((row) => ({ id: row.id, path: row.cliente_id ? `/clientes?client=${row.cliente_id}` : "/cxc", title: `${money(row.monto)} · ${row.metodo_pago || "Payment"}`, detail: `${String(row.fecha_pago || "").slice(0, 10)}${row.referencia ? ` · ${row.referencia}` : ""}` })),
          },
          {
            key: "orders", label: "Online orders", icon: ShoppingBag,
            rows: (orders.data || []).map((row) => ({ id: row.id, path: `/online/orders?order=${row.id}`, title: row.name || row.email || `Order #${row.id.slice(0, 8)}`, detail: `${money(row.amount_total)} · ${row.status || ""}` })),
          },
        ].filter((group) => group.rows.length));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, isPhoneLikeSearch(term) || isCodeLikeSearch(term) ? 60 : 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, van?.id]);

  const count = useMemo(() => groups.reduce((sum, group) => sum + group.rows.length, 0), [groups]);
  const flatRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  useEffect(() => setHl(-1), [groups]);
  useEffect(() => {
    if (hl >= 0) document.getElementById(`gsearch-row-${hl}`)?.scrollIntoView({ block: "nearest" });
  }, [hl]);
  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-40 right-3 bottom-[82px] lg:bottom-auto lg:top-4 lg:right-5 h-11 lg:h-10 px-3 lg:px-4 rounded-full lg:rounded-xl bg-white border border-slate-200 shadow-lg hover:shadow-xl text-slate-600 flex items-center gap-2 transition-all"
        title="Global search (Ctrl/Cmd + K)"
      >
        <Search size={18} />
        <span className="hidden lg:inline text-sm font-semibold">Search</span>
        <span className="hidden xl:inline text-[10px] font-bold bg-slate-100 text-slate-400 px-1.5 py-1 rounded">⌘K</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] bg-slate-950/55 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-white w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[82vh] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="p-4 border-b flex items-center gap-3">
              <Search size={21} className="text-blue-600 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); setHl((i) => Math.min(i < 0 ? 0 : i + 1, flatRows.length - 1)); }
                  else if (event.key === "ArrowUp") { event.preventDefault(); setHl((i) => Math.max(i - 1, 0)); }
                  else if (event.key === "Enter") {
                    event.preventDefault();
                    const target = hl >= 0 ? flatRows[hl] : flatRows[0];
                    if (target) go(target.path);
                  }
                }}
                placeholder="Search customers, invoices, products, payments or online orders…"
                className="flex-1 min-w-0 text-base outline-none bg-transparent"
              />
              {loading && <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
              <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X size={19} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              {query.trim().length < 2 ? (
                <div className="py-20 text-center text-slate-400"><Search size={36} className="mx-auto mb-3 opacity-40" /><p className="font-semibold">Type at least 2 characters</p></div>
              ) : !loading && count === 0 ? (
                <div className="py-20 text-center text-slate-400"><p className="font-semibold">No results found</p></div>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => {
                    const Icon = group.icon;
                    return (
                      <section key={group.key}>
                        <div className="flex items-center gap-2 px-2 mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Icon size={14} /> {group.label}</div>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                          {group.rows.map((row) => {
                            const flatIndex = flatRows.indexOf(row);
                            return (
                              <button
                                key={`${group.key}-${row.id}`}
                                id={`gsearch-row-${flatIndex}`}
                                onClick={() => go(row.path)}
                                className={`w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors ${
                                  flatIndex === hl ? "bg-blue-50" : "hover:bg-blue-50"
                                }`}
                              >
                                <div className="min-w-0 flex-1"><div className="font-semibold text-slate-900 truncate">{row.title}</div><div className="text-xs text-slate-500 truncate mt-0.5">{row.detail}</div></div>
                                <ArrowRight size={16} className="text-slate-400 shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
