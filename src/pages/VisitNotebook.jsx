import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  Plus,
  ShoppingCart,
  Trash2,
  UserRound,
  Search,
  X,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useVan } from "../hooks/VanContext";
import { useUsuario } from "../UsuarioContext";
import { useToast } from "../hooks/useToast";

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function groupItems(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.cliente_id || `name:${item.barber_name.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { key, name: item.barber_name, clientId: item.cliente_id, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export default function VisitNotebook() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { van } = useVan();
  const { usuario } = useUsuario();
  const { toast, confirm } = useToast();

  const [barberias, setBarberias] = useState([]);
  const [barberiaId, setBarberiaId] = useState(searchParams.get("barberia") || "");
  const [visitDate, setVisitDate] = useState(searchParams.get("date") || localDate());
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [notebook, setNotebook] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [barberName, setBarberName] = useState("");
  const [productText, setProductText] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [itemNotes, setItemNotes] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [changingShop, setChangingShop] = useState(!searchParams.get("barberia"));
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const productInputRef = useRef(null);
  const barberSearchRef = useRef(null);
  const barberSectionRef = useRef(null);
  const [barberSearch, setBarberSearch] = useState("");
  const focusedShopRef = useRef("");

  useEffect(() => {
    let active = true;
    supabase.from("barberias").select("id,nombre,direccion").order("nombre").then((shopsResult) => {
      if (!active) return;
      setBarberias(shopsResult.data || []);
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadVanInventory() {
      if (!van?.id) {
        setProducts([]);
        return;
      }
      setInventoryLoading(true);
      const { data, error } = await supabase
        .from("stock_van")
        .select("producto_id,cantidad,productos:productos!inner(id,nombre,codigo,marca)")
        .eq("van_id", van.id)
        .gt("cantidad", 0)
        .order("cantidad", { ascending: false });
      if (!active) return;
      if (error) {
        setProducts([]);
        toast.error("Could not load this VAN's inventory.");
      } else {
        setProducts((data || []).map((row) => ({
          id: row.producto_id,
          nombre: row.productos?.nombre || "",
          codigo: row.productos?.codigo || "",
          marca: row.productos?.marca || "",
          stock: Number(row.cantidad || 0),
        })));
      }
      setInventoryLoading(false);
    }
    loadVanInventory();
    return () => { active = false; };
  }, [van?.id, toast]);

  useEffect(() => {
    if (!barberiaId) {
      setClients([]);
      return;
    }
    supabase
      .from("clientes")
      .select("id,nombre,telefono")
      .eq("barberia_id", barberiaId)
      .order("nombre")
      .then(({ data }) => setClients(data || []));
  }, [barberiaId]);

  useEffect(() => {
    if (!barberiaId || focusedShopRef.current === barberiaId) return;
    focusedShopRef.current = barberiaId;
    const frame = window.requestAnimationFrame(() => {
      barberSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      barberSearchRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [barberiaId, clients.length]);

  useEffect(() => {
    let active = true;
    async function loadNotebook() {
      setNotebook(null);
      setItems([]);
      setGeneralNotes("");
      if (!barberiaId || !van?.id || !visitDate) return;

      const { data, error } = await supabase
        .from("visit_notebooks")
        .select("*")
        .eq("barberia_id", barberiaId)
        .eq("van_id", van.id)
        .eq("visit_date", visitDate)
        .maybeSingle();
      if (!active) return;
      if (error) {
        toast.error("Could not open the visit notebook.");
        return;
      }
      if (!data) return;
      setNotebook(data);
      setGeneralNotes(data.general_notes || "");
      const { data: loadedItems } = await supabase
        .from("visit_notebook_items")
        .select("*")
        .eq("notebook_id", data.id)
        .order("sort_order")
        .order("created_at");
      if (active) setItems(loadedItems || []);
    }
    loadNotebook();
    return () => { active = false; };
  }, [barberiaId, van?.id, visitDate, toast]);

  const selectedShop = barberias.find((shop) => shop.id === barberiaId);
  const filteredShops = useMemo(() => {
    const term = normalizeSearch(shopSearch);
    return barberias.filter((shop) => !term || normalizeSearch(`${shop.nombre} ${shop.direccion || ""}`).includes(term)).slice(0, 8);
  }, [barberias, shopSearch]);
  const productMatches = useMemo(() => {
    const term = normalizeSearch(productText);
    if (!term) return products.slice(0, 8);
    return products.filter((product) =>
      normalizeSearch(`${product.nombre} ${product.codigo || ""} ${product.marca || ""}`).includes(term)
    ).slice(0, 8);
  }, [products, productText]);
  const visibleBarbers = useMemo(() => {
    const term = normalizeSearch(barberSearch);
    return clients.filter((client) =>
      !term || normalizeSearch(`${client.nombre} ${client.telefono || ""}`).includes(term)
    ).slice(0, term ? 12 : 8);
  }, [clients, barberSearch]);
  const grouped = useMemo(() => groupItems(items), [items]);
  const totals = useMemo(() => ({
    lines: items.length,
    units: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    picked: items.filter((item) => item.picked).length,
  }), [items]);

  async function ensureNotebook() {
    if (notebook) return notebook;
    if (!barberiaId || !van?.id) throw new Error("Choose a barbershop first.");
    const payload = {
      tenant_id: usuario?.tenant_id || null,
      barberia_id: barberiaId,
      van_id: van.id,
      usuario_id: usuario?.id || null,
      visit_date: visitDate,
      status: "open",
    };
    const { data, error } = await supabase
      .from("visit_notebooks")
      .upsert(payload, { onConflict: "barberia_id,van_id,visit_date" })
      .select()
      .single();
    if (error) throw error;
    setNotebook(data);
    return data;
  }

  function selectClient(clientId) {
    setSelectedClientId(clientId);
    const client = clients.find((candidate) => candidate.id === clientId);
    if (client) setBarberName(client.nombre || "");
    setBarberSearch(client?.nombre || "");
    window.setTimeout(() => productInputRef.current?.focus(), 0);
  }

  function chooseShop(shop) {
    setBarberiaId(shop.id);
    setShopSearch("");
    setChangingShop(false);
    setSelectedClientId("");
    setBarberName("");
    setBarberSearch("");
  }

  function chooseProduct(product) {
    setProductText(product.nombre);
    setSelectedProductId(product.id);
    window.setTimeout(() => productInputRef.current?.focus(), 0);
  }

  async function addItem(event) {
    event.preventDefault();
    if (!barberName.trim() || !productText.trim()) {
      toast.warning("Enter the barber and requested product.");
      return;
    }
    setSaving(true);
    try {
      const current = await ensureNotebook();
      const normalizedProduct = normalizeSearch(productText);
      const matchedProduct = products.find((product) =>
        normalizeSearch(product.nombre) === normalizedProduct
        || normalizeSearch(product.codigo) === normalizedProduct
      );
      const payload = {
        notebook_id: current.id,
        cliente_id: selectedClientId || null,
        barber_name: barberName.trim(),
        producto_id: matchedProduct?.id || null,
        product_text: productText.trim(),
        quantity: Math.max(0.01, Number(quantity || 1)),
        item_notes: itemNotes.trim() || null,
        sort_order: items.length,
      };
      const { data, error } = await supabase
        .from("visit_notebook_items")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      setItems((currentItems) => [...currentItems, data]);
      setProductText("");
      setSelectedProductId("");
      setQuantity("1");
      setItemNotes("");
      toast.success("Added to the visit notebook.");
    } catch (error) {
      toast.error(error.message || "Could not save the request.");
    } finally {
      setSaving(false);
    }
  }

  async function patchItem(itemId, patch) {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...patch } : item));
    const { error } = await supabase.from("visit_notebook_items").update({
      ...patch,
      updated_at: new Date().toISOString(),
    }).eq("id", itemId);
    if (error) {
      toast.error("Could not update the item.");
      const { data } = await supabase.from("visit_notebook_items").select("*").eq("notebook_id", notebook.id).order("sort_order");
      setItems(data || []);
    }
  }

  async function deleteItem(item) {
    const ok = await confirm(`Remove ${item.product_text} for ${item.barber_name}?`, {
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("visit_notebook_items").delete().eq("id", item.id);
    if (error) return toast.error("Could not remove the item.");
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
  }

  async function saveGeneralNotes() {
    if (!barberiaId || !generalNotes.trim()) return;
    try {
      const current = await ensureNotebook();
      await supabase.from("visit_notebooks").update({
        general_notes: generalNotes.trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", current.id);
    } catch (error) {
      toast.error(error.message || "Could not save the notes.");
    }
  }

  async function setNotebookStatus(status) {
    if (!notebook) return;
    const { error } = await supabase.from("visit_notebooks").update({
      status,
      updated_at: new Date().toISOString(),
    }).eq("id", notebook.id);
    if (error) return toast.error("Could not update the visit.");
    setNotebook((current) => ({ ...current, status }));
    toast.success(status === "completed" ? "Visit notebook completed." : "List marked ready for loading.");
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-3 overflow-x-hidden pb-20 sm:space-y-4 sm:pb-24">
      <header className="rounded-2xl bg-gradient-to-br from-violet-700 via-purple-700 to-fuchsia-700 p-3 text-white shadow-lg sm:rounded-3xl sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-purple-50" aria-label="Back">
            <ArrowLeft size={19} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black sm:text-2xl">Visit notebook</h1>
            <p className="truncate text-xs text-purple-100 sm:mt-1 sm:text-sm">Barber → product → save</p>
          </div>
        </div>
      </header>

      <section className="grid min-w-0 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[1fr_auto] sm:gap-3 sm:p-4">
        <div className="relative min-w-0">
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Barbershop</span>
          {selectedShop && !changingShop ? (
            <div className="flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl border-2 border-purple-200 bg-purple-50 px-3 sm:h-12">
              <span className="truncate font-black text-purple-950">{selectedShop.nombre}</span>
              <button type="button" onClick={() => setChangingShop(true)} className="shrink-0 text-xs font-black text-purple-700">Change</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
                <input value={shopSearch} onChange={(event) => setShopSearch(event.target.value)} disabled={loading} placeholder="Type the barbershop name..." className="h-12 w-full rounded-xl border-2 border-slate-200 pl-10 pr-10 font-bold outline-none focus:border-purple-500" autoFocus />
                {selectedShop && <button type="button" onClick={() => setChangingShop(false)} className="absolute right-3 top-3.5 text-slate-400"><X size={17} /></button>}
              </div>
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {filteredShops.map((shop) => (
                  <button key={shop.id} type="button" onClick={() => chooseShop(shop)} className="block w-full rounded-lg px-3 py-3 text-left hover:bg-purple-50">
                    <span className="block font-black text-slate-900">{shop.nombre}</span>
                    {shop.direccion && <span className="block truncate text-xs text-slate-500">{shop.direccion}</span>}
                  </button>
                ))}
                {!filteredShops.length && <p className="px-3 py-4 text-sm text-slate-500">No barbershop found.</p>}
              </div>
            </>
          )}
        </div>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Visit date</span>
          <input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border-2 border-slate-200 px-3 font-bold outline-none focus:border-purple-500 sm:h-12 sm:w-auto" />
        </label>
        {selectedShop?.direccion && <p className="hidden truncate text-sm text-slate-500 sm:col-span-2 sm:block">{selectedShop.direccion}</p>}
      </section>

      {barberiaId && (
        <>
          <form ref={barberSectionRef} onSubmit={addItem} className="min-w-0 scroll-mt-3 overflow-hidden rounded-2xl border border-purple-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2">
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-purple-700">1 · Choose barber</span>
                <div className="relative mb-2">
                  <Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
                  <input
                    ref={barberSearchRef}
                    value={barberSearch}
                    onChange={(event) => setBarberSearch(event.target.value)}
                    placeholder="Search barber by name..."
                    className="h-12 w-full min-w-0 rounded-xl border-2 border-purple-200 pl-10 pr-3 text-base font-bold outline-none focus:border-purple-500"
                    autoComplete="off"
                  />
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  {visibleBarbers.map((client) => (
                    <button key={client.id} type="button" onClick={() => selectClient(client.id)} className={`min-h-10 max-w-full rounded-xl border px-3 py-2 text-sm font-black ${selectedClientId === client.id ? "border-purple-600 bg-purple-600 text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                      <span className="block max-w-44 truncate">{client.nombre}</span>
                    </button>
                  ))}
                  {clients.length > 0 && visibleBarbers.length === 0 && <span className="text-sm text-slate-500">No saved barber matches. Write a new name below.</span>}
                  {!clients.length && <span className="text-sm text-slate-500">No saved barbers here yet; write the name below.</span>}
                </div>
              </div>
              <label className="min-w-0">
                <span className="mb-1 block text-xs font-bold text-slate-500">Name or new barber *</span>
                <input value={barberName} onChange={(event) => { setBarberName(event.target.value); if (selectedClientId) setSelectedClientId(""); }} placeholder="Example: Carlos" className="h-12 w-full rounded-xl border border-slate-200 px-3" required />
              </label>
              <div className="hidden items-end sm:flex">
                <button type="button" onClick={() => { setSelectedClientId(""); setBarberName(""); setBarberSearch(""); barberSearchRef.current?.focus(); }} className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-600">Clear barber</button>
              </div>
              <label className="min-w-0 sm:col-span-2">
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-purple-700">2 · Choose product</span>
                {!productText && products.length > 0 && (
                  <div className="mb-2 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
                    {products.slice(0, 6).map((product) => (
                      <button key={product.id} type="button" onClick={() => chooseProduct(product)} className="min-h-12 min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-left">
                        <span className="block truncate text-xs font-black text-slate-800">{product.nombre}</span>
                        <span className="block text-[10px] font-bold text-emerald-700">{product.stock} available</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
                  <input ref={productInputRef} value={productText} onChange={(event) => { setProductText(event.target.value); setSelectedProductId(""); }} placeholder={inventoryLoading ? "Loading VAN inventory..." : "Type name, code or brand"} className="h-12 w-full rounded-xl border-2 border-slate-200 pl-10 pr-10 text-base font-bold outline-none focus:border-purple-500" required autoComplete="off" />
                  {productText && <button type="button" onClick={() => { setProductText(""); setSelectedProductId(""); productInputRef.current?.focus(); }} className="absolute right-3 top-3.5 text-slate-400"><X size={18} /></button>}
                  {productText && !selectedProductId && (
                    <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                      {productMatches.map((product) => (
                        <button key={product.id} type="button" onClick={() => chooseProduct(product)} className="block min-h-14 w-full min-w-0 rounded-lg px-3 py-2 text-left active:bg-purple-100 hover:bg-purple-50">
                          <span className="min-w-0"><span className="block truncate font-black text-slate-900">{product.nombre}</span><span className="block text-xs text-slate-500">{[product.codigo, product.marca].filter(Boolean).join(" · ")}</span></span>
                          <span className="mt-1 inline-block rounded-lg bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">{product.stock} available</span>
                        </button>
                      ))}
                      {!productMatches.length && <p className="px-3 py-4 text-sm text-amber-700">Not found in this VAN. You may keep it as a special request.</p>}
                    </div>
                  )}
                </div>
              </label>
              <details className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <summary className="cursor-pointer text-sm font-black text-slate-600">Quantity or extra detail <span className="font-normal">(optional)</span></summary>
                <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                  <label className="min-w-0">
                    <span className="mb-1 block text-xs font-bold text-slate-500">Quantity</span>
                    <input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3" />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-xs font-bold text-slate-500">Short detail</span>
                    <input value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} placeholder="Size, color, pay later..." className="h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3" />
                  </label>
                </div>
              </details>
            </div>
            <button type="submit" disabled={saving} className="mt-3 flex h-14 w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-purple-600 px-3 font-black text-white shadow-md hover:bg-purple-700 disabled:opacity-50">
              <Plus size={18} /> <span className="truncate">{saving ? "Saving..." : "Save request"}</span>
            </button>
          </form>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="truncate text-center text-xs font-bold text-slate-600">
              {totals.lines} requests · {totals.units} units · {totals.picked}/{totals.lines} loaded
            </p>
          </section>

          {grouped.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
              <ClipboardList size={36} className="mx-auto text-slate-300" />
              <p className="mt-3 font-black text-slate-700">The notebook is empty</p>
              <p className="mt-1 text-sm text-slate-500">Add what the first barber needs.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <section key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex min-w-0 flex-col items-stretch gap-2 bg-slate-900 px-3 py-3 text-white sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <div className="flex min-w-0 items-center gap-2"><UserRound size={18} /><h3 className="truncate font-black">{group.name}</h3></div>
                    {group.clientId && (
                      <button type="button" onClick={() => navigate(`/ventas?client=${group.clientId}&notebook=${notebook?.id || ""}`)} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black sm:w-auto sm:shrink-0">
                        <ShoppingCart size={14} /> Open normal sale
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((item) => (
                      <div key={item.id} className={`flex items-start gap-3 p-4 ${item.sold ? "bg-emerald-50/60" : ""}`}>
                        <button type="button" onClick={() => patchItem(item.id, { picked: !item.picked })} className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 ${item.picked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent"}`} title="Mark loaded">
                          <Check size={17} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className={`font-black text-slate-900 ${item.sold ? "line-through opacity-60" : ""}`}>{item.quantity} × {item.product_text}</div>
                          {item.item_notes && <div className="mt-1 text-sm text-amber-700">{item.item_notes}</div>}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={() => patchItem(item.id, { sold: !item.sold, picked: item.sold ? item.picked : true })} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black ${item.sold ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                              <CheckCircle2 size={13} /> {item.sold ? "Sold" : "Mark sold"}
                            </button>
                            <button type="button" onClick={() => deleteItem(item)} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-black text-red-600"><Trash2 size={13} /> Remove</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">General visit notes</span>
              <textarea value={generalNotes} onChange={(event) => setGeneralNotes(event.target.value)} onBlur={saveGeneralNotes} rows={3} placeholder="Anything that applies to the whole barbershop..." className="w-full rounded-xl border border-slate-200 p-3" />
            </label>
            {notebook && items.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setNotebookStatus("ready")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 font-black text-white"><PackageCheck size={18} /> Requests finished</button>
                <button type="button" onClick={() => setNotebookStatus("completed")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-black text-white"><CheckCircle2 size={18} /> Complete visit</button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
