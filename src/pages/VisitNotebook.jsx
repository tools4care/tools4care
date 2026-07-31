import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("barberias").select("id,nombre,direccion").order("nombre"),
      supabase.from("productos").select("id,nombre,codigo").order("nombre").limit(1000),
    ]).then(([shopsResult, productsResult]) => {
      if (!active) return;
      setBarberias(shopsResult.data || []);
      setProducts(productsResult.data || []);
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

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
      const normalizedProduct = productText.trim().toLowerCase();
      const matchedProduct = products.find((product) =>
        product.nombre?.trim().toLowerCase() === normalizedProduct
        || product.codigo?.trim().toLowerCase() === normalizedProduct
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
    <div className="mx-auto max-w-5xl space-y-4 pb-24">
      <header className="rounded-3xl bg-gradient-to-br from-violet-700 via-purple-700 to-fuchsia-700 p-5 text-white shadow-xl">
        <button type="button" onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-purple-100">
          <ArrowLeft size={17} /> Back
        </button>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><ClipboardList size={25} /></div>
          <div>
            <h1 className="text-2xl font-black">Visit notebook</h1>
            <p className="mt-1 text-sm text-purple-100">Write each barber's requests now; prepare and sell them from the VAN later.</p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]">
        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Barbershop</span>
          <select value={barberiaId} onChange={(event) => setBarberiaId(event.target.value)} disabled={loading} className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 font-bold text-slate-900 outline-none focus:border-purple-500">
            <option value="">Choose a barbershop...</option>
            {barberias.map((shop) => <option key={shop.id} value={shop.id}>{shop.nombre}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Visit date</span>
          <input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} className="h-12 rounded-xl border-2 border-slate-200 px-3 font-bold outline-none focus:border-purple-500" />
        </label>
        {selectedShop?.direccion && <p className="text-sm text-slate-500 sm:col-span-2">{selectedShop.direccion}</p>}
      </section>

      {barberiaId && (
        <>
          <form onSubmit={addItem} className="rounded-2xl border border-purple-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Plus size={18} className="text-purple-600" /><h2 className="font-black text-slate-900">Add request</h2></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-bold text-slate-500">Existing barber/customer</span>
                <select value={selectedClientId} onChange={(event) => selectClient(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 px-3">
                  <option value="">Write a name manually</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.nombre}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-slate-500">Barber name *</span>
                <input value={barberName} onChange={(event) => { setBarberName(event.target.value); if (selectedClientId) setSelectedClientId(""); }} placeholder="Example: Carlos" className="h-12 w-full rounded-xl border border-slate-200 px-3" required />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-500">Product requested *</span>
                <input list="visit-products" value={productText} onChange={(event) => setProductText(event.target.value)} placeholder="Start typing a product or write anything" className="h-12 w-full rounded-xl border border-slate-200 px-3" required />
                <datalist id="visit-products">
                  {products.map((product) => <option key={product.id} value={product.nombre}>{product.codigo || ""}</option>)}
                </datalist>
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-slate-500">Quantity</span>
                <input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 px-3" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-slate-500">Short detail</span>
                <input value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} placeholder="Size, color, pay later..." className="h-12 w-full rounded-xl border border-slate-200 px-3" />
              </label>
            </div>
            <button type="submit" disabled={saving} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-purple-600 font-black text-white hover:bg-purple-700 disabled:opacity-50">
              <Plus size={18} /> {saving ? "Saving..." : "Add product"}
            </button>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-2xl font-black text-slate-900">{totals.lines}</div><div className="text-[10px] font-black uppercase text-slate-500">Lines</div></div>
              <div className="rounded-xl bg-purple-50 p-3"><div className="text-2xl font-black text-purple-700">{totals.units}</div><div className="text-[10px] font-black uppercase text-purple-600">Units</div></div>
              <div className="rounded-xl bg-emerald-50 p-3"><div className="text-2xl font-black text-emerald-700">{totals.picked}/{totals.lines}</div><div className="text-[10px] font-black uppercase text-emerald-600">Loaded</div></div>
            </div>
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
                  <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
                    <div className="flex min-w-0 items-center gap-2"><UserRound size={18} /><h3 className="truncate font-black">{group.name}</h3></div>
                    {group.clientId && (
                      <button type="button" onClick={() => navigate(`/ventas?client=${group.clientId}&notebook=${notebook?.id || ""}`)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black">
                        <ShoppingCart size={14} /> Start sale
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
                <button type="button" onClick={() => setNotebookStatus("ready")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 font-black text-white"><PackageCheck size={18} /> Ready to load</button>
                <button type="button" onClick={() => setNotebookStatus("completed")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-black text-white"><CheckCircle2 size={18} /> Complete visit</button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
