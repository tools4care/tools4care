import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { useToast } from "./hooks/useToast";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import {
  Package, Plus, X, ChevronDown, ChevronUp, CheckCircle,
  AlertCircle, RefreshCw, CreditCard, DollarSign, Trash2, RotateCcw,
  PenTool, ShoppingBag,
} from "lucide-react";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

const PILOT_PRODUCT_SEARCH = "DUAL COIL";

function buildContractText({ clienteNombre, productoNombre, deposito, rentaSemanal, fechaInicio }) {
  return `EQUIPMENT RENTAL AGREEMENT

Customer: ${clienteNombre || "________________"}
Equipment: ${productoNombre || "________________"}
Start date: ${fmtDate(fechaInicio)}

Terms:
1. This is a RENTAL agreement. The equipment remains the property of Tools4Care until fully purchased per the buyout terms below.
2. Security deposit: ${fmt(deposito)} (equal to one week of rent), refundable upon return of the equipment in good condition.
3. Weekly rental fee: ${fmt(rentaSemanal)}, due every week starting on the start date.
4. If a weekly payment is missed, Tools4Care may repossess this equipment, or an equivalent-value item from the customer's station, without further notice.
5. The customer may choose to purchase the equipment at any time. The longer the equipment has been rented, the lower the remaining buyout price.
6. The customer is responsible for reasonable care of the equipment during the rental period.

By signing below, the customer acknowledges and agrees to these terms.`;
}

/* ─── Status badge ─── */
function StatusBadge({ status }) {
  const map = {
    en_renta: { color: "bg-green-100 text-green-800",  icon: CheckCircle,  label: "Active Rental" },
    atrasado: { color: "bg-red-100 text-red-800",       icon: AlertCircle,  label: "Payment Overdue" },
    retirado: { color: "bg-gray-200 text-gray-700",     icon: RotateCcw,    label: "Repossessed" },
    comprado: { color: "bg-blue-100 text-blue-800",     icon: ShoppingBag,  label: "Purchased" },
    cancelado:{ color: "bg-amber-100 text-amber-800",   icon: RotateCcw,    label: "Returned" },
  };
  const s = map[status] || map.en_renta;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>
      <Icon size={10} /> {s.label}
    </span>
  );
}

/* ─── Summary card ─── */
function Card({ label, value, sub, color = "blue" }) {
  const cls = {
    blue:   "from-blue-50 to-blue-100 border-blue-200 text-blue-800",
    green:  "from-green-50 to-green-100 border-green-200 text-green-800",
    amber:  "from-amber-50 to-amber-100 border-amber-200 text-amber-800",
    red:    "from-red-50 to-red-100 border-red-200 text-red-800",
  }[color];
  return (
    <div className={`bg-gradient-to-br ${cls} border rounded-xl p-4 shadow-sm`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

/* ─── Signature pad ─── */
function SignaturePad({ onSignature }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasContent, setHasContent] = useState(false);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }

  function startDraw(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + 0.1, pos.y + 0.1);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.stroke();
    drawing.current = true;
    setHasContent(true);
  }

  function drawMove(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    onSignature(canvas.toDataURL("image/png"));
  }

  function endDraw(e) {
    e.preventDefault();
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onSignature(null);
  }

  // Attach touch listeners as non-passive so preventDefault() can block page scroll while signing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", drawMove, { passive: false });
    canvas.addEventListener("touchend", endDraw, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", startDraw);
      canvas.removeEventListener("touchmove", drawMove);
      canvas.removeEventListener("touchend", endDraw);
    };
  }, []);

  return (
    <div>
      <div className="relative border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef} width={500} height={150} className="w-full touch-none"
          style={{ cursor: "crosshair", display: "block" }}
          onMouseDown={startDraw} onMouseMove={drawMove} onMouseUp={endDraw} onMouseLeave={endDraw}
        />
        {!hasContent && (
          <p className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none select-none">
            Sign here
          </p>
        )}
      </div>
      {hasContent && (
        <button type="button" onClick={clear} className="text-xs text-red-400 hover:text-red-600 mt-1 flex items-center gap-1">
          <RotateCcw size={10}/> Clear signature
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Contract & Signature — fullscreen on mobile, modal on desktop
═══════════════════════════════════════════════ */
function ContractSignModal({ contractText, onConfirm, onClose }) {
  const [firma, setFirma] = useState(null);

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 md:flex md:items-center md:justify-center md:p-4">
      <div className="bg-white h-full md:h-auto md:max-h-[85vh] md:max-w-2xl md:rounded-2xl w-full flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <PenTool size={18} className="text-white"/>
            <p className="text-white font-bold">Contract & Signature</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white">
            <X size={22}/>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600 whitespace-pre-wrap">{contractText}</pre>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Customer Signature</p>
            <SignaturePad onSignature={setFirma} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={() => onConfirm(firma)} disabled={!firma}
              className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-40">
              Accept & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Add / Update Card (for an existing rental)
═══════════════════════════════════════════════ */
function CardManageForm({ rental, onSaved, onClose }) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardReady, setCardReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!stripe || !elements || !cardReady) return;
    setSaving(true);
    setError("");
    try {
      let customerId = rental.stripe_customer_id;
      if (!customerId) {
        const { data: custData } = await supabase.functions.invoke("stripe-subscriptions", {
          body: { action: "create_customer", name: rental.clientes?.nombre, email: rental.clientes?.email, phone: rental.clientes?.telefono,
            metadata: { supabase_cliente_id: rental.cliente_id } },
        });
        if (!custData?.ok) throw new Error(custData?.error || "Could not create customer");
        customerId = custData.customer_id;
      }

      const { data: siData } = await supabase.functions.invoke("stripe-subscriptions", {
        body: { action: "create_setup_intent", customer_id: customerId },
      });
      if (!siData?.ok) throw new Error(siData?.error || "Could not create setup intent");

      const cardElement = elements.getElement(CardElement);
      const { setupIntent, error: stripeErr } = await stripe.confirmCardSetup(siData.client_secret, {
        payment_method: { card: cardElement, billing_details: { name: rental.clientes?.nombre || "" } },
      });
      if (stripeErr) throw new Error(stripeErr.message);
      const pm = setupIntent.payment_method;

      const { data: pmList } = await supabase.functions.invoke("stripe-subscriptions", {
        body: { action: "list_payment_methods", customer_id: customerId },
      });
      const card = pmList?.payment_methods?.find(p => p.id === pm) || pmList?.payment_methods?.[0];

      await supabase.from("alquileres").update({
        stripe_customer_id: customerId,
        stripe_payment_method_id: pm,
        card_last4: card?.last4 || null,
        card_brand: card?.brand || null,
      }).eq("id", rental.id);

      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 flex items-center justify-between">
          <p className="text-white font-bold">{rental.card_last4 ? "Update Card" : "Add Card"}</p>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white">
            <X size={20}/>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">{rental.clientes?.nombre}</p>
          {rental.card_last4 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Current card on file: <span className="font-semibold capitalize">{rental.card_brand} ···· {rental.card_last4}</span>. Saving a new card will replace it for future auto-charges.
            </p>
          )}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 shadow-lg">
            <div className="bg-white/10 rounded-xl px-4 py-3">
              <CardElement
                onChange={e => setCardReady(e.complete)}
                options={{ style: { base: { fontSize: "15px", color: "#ffffff", fontFamily: "monospace", letterSpacing: "0.05em", "::placeholder": { color: "#94a3b8" } }, invalid: { color: "#f87171" } }, hidePostalCode: false }}
              />
            </div>
            {error && (
              <div className="mt-3 bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-2">
                <p className="text-red-300 text-xs">{error}</p>
              </div>
            )}
            <p className="text-slate-400 text-xs mt-3">🔒 Secured by Stripe. Card data never touches our servers.</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border-2 border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={!cardReady || saving}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              {saving && <RefreshCw size={14} className="animate-spin"/>}
              {saving ? "Saving…" : "Save Card"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardManageModal({ rental, onSaved, onClose }) {
  return (
    <Elements stripe={stripePromise}>
      <CardManageForm rental={rental} onSaved={onSaved} onClose={onClose} />
    </Elements>
  );
}

/* ═══════════════════════════════════════════════
   New Rental Form (client + product + contract + card)
═══════════════════════════════════════════════ */
function NewRentalForm({ van, isAdmin, saving, onSave, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [stripeError, setStripeError] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [processingCard, setProcessingCard] = useState(false);
  const [wantsCard, setWantsCard] = useState(false);

  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [pickedClient, setPickedClient] = useState(null);

  const [productSearch, setProductSearch] = useState(PILOT_PRODUCT_SEARCH);
  const [productResults, setProductResults] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [pickedProduct, setPickedProduct] = useState(null);

  const [form, setForm] = useState({
    fecha_inicio: new Date().toISOString().slice(0, 10),
    deposito: "45",
    renta_semanal: "45",
    serial: "",
    nota: "",
  });
  const [firma, setFirma] = useState(null);
  const [showContractModal, setShowContractModal] = useState(false);

  // Client search
  useEffect(() => {
    if (pickedClient) return;
    const term = clientSearch.trim();
    if (!term) { setClientResults([]); setShowClientDropdown(false); return; }
    const timer = setTimeout(async () => {
      let q = supabase.from("clientes").select("id, nombre, telefono, email")
        .or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`)
        .order("nombre").limit(25);
      if (!isAdmin && van?.id) q = q.eq("van_id", van.id);
      const { data } = await q;
      setClientResults(data || []);
      setShowClientDropdown(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [clientSearch, pickedClient]);

  // Product search
  useEffect(() => {
    if (pickedProduct) return;
    const term = productSearch.trim();
    if (!term) { setProductResults([]); setShowProductDropdown(false); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("productos").select("id, nombre, precio, costo")
        .ilike("nombre", `%${term}%`).order("nombre").limit(15);
      setProductResults(data || []);
      setShowProductDropdown(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch, pickedProduct]);

  // Pre-select the pilot product if it's the only match for the default search term
  useEffect(() => {
    if (pickedProduct || productSearch !== PILOT_PRODUCT_SEARCH) return;
    if (productResults.length === 1) {
      pickProduct(productResults[0]);
    }
  }, [productResults]);

  function pickClient(c) {
    setPickedClient(c);
    setClientSearch(c.nombre);
    setShowClientDropdown(false);
  }
  function pickProduct(p) {
    setPickedProduct(p);
    setProductSearch(p.nombre);
    setShowProductDropdown(false);
  }

  const contractText = buildContractText({
    clienteNombre: pickedClient?.nombre,
    productoNombre: pickedProduct?.nombre,
    deposito: form.deposito,
    rentaSemanal: form.renta_semanal,
    fechaInicio: form.fecha_inicio,
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!pickedClient || !pickedProduct) return;
    if (!firma) { alert("Please collect the customer's signature before saving."); return; }

    if (wantsCard && cardReady && stripe && elements) {
      setProcessingCard(true);
      setStripeError("");
      try {
        const { data: custData } = await supabase.functions.invoke("stripe-subscriptions", {
          body: { action: "create_customer", name: pickedClient.nombre, email: pickedClient.email, phone: pickedClient.telefono,
            metadata: { supabase_cliente_id: pickedClient.id } },
        });
        if (!custData?.ok) throw new Error(custData?.error || "Could not create customer");
        const customerId = custData.customer_id;

        const { data: siData } = await supabase.functions.invoke("stripe-subscriptions", {
          body: { action: "create_setup_intent", customer_id: customerId },
        });
        if (!siData?.ok) throw new Error(siData?.error || "Could not create setup intent");

        const cardElement = elements.getElement(CardElement);
        const { setupIntent, error } = await stripe.confirmCardSetup(siData.client_secret, {
          payment_method: { card: cardElement, billing_details: { name: pickedClient.nombre || "" } },
        });
        if (error) throw new Error(error.message);
        const pm = setupIntent.payment_method;

        const { data: pmList } = await supabase.functions.invoke("stripe-subscriptions", {
          body: { action: "list_payment_methods", customer_id: customerId },
        });
        const card = pmList?.payment_methods?.find(p => p.id === pm) || pmList?.payment_methods?.[0];
        setProcessingCard(false);
        onSave({
          cliente: pickedClient, producto: pickedProduct, form, firma, contratoTexto: contractText,
          stripeInfo: { customerId, paymentMethodId: pm, last4: card?.last4, brand: card?.brand },
        });
      } catch (err) {
        setStripeError(err.message);
        setProcessingCard(false);
      }
    } else {
      onSave({ cliente: pickedClient, producto: pickedProduct, form, firma, contratoTexto: contractText, stripeInfo: null });
    }
  }

  return (
    <div className="bg-white border-2 border-emerald-200 rounded-2xl shadow-xl mb-6 overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <Package size={18} className="text-white"/>
          </div>
          <div>
            <p className="text-white font-bold">New Equipment Rental</p>
            <p className="text-emerald-100 text-xs">Rent first — buy later if they like it</p>
          </div>
        </div>
        <button type="button" onClick={onCancel} className="text-white/70 hover:text-white">
          <X size={20}/>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* STEP 1: Client */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">1. Customer</label>
          <div className="relative">
            <input
              value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setPickedClient(null); }}
              onFocus={() => { setShowProductDropdown(false); if (clientResults.length > 0) setShowClientDropdown(true); }}
              onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
              placeholder="Type name or phone to search…"
              className="w-full border-2 border-gray-200 focus:border-emerald-400 rounded-xl px-4 py-3 text-sm outline-none transition-all"
            />
            {showClientDropdown && clientResults.length > 0 && !pickedClient && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                {clientResults.map(c => (
                  <button key={c.id} type="button" onMouseDown={() => pickClient(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-sm flex justify-between items-center border-b border-gray-50 last:border-0">
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="text-xs text-gray-400">{c.telefono || ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {pickedClient && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {pickedClient.nombre?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-emerald-900">{pickedClient.nombre}</p>
                {pickedClient.telefono && <p className="text-xs text-emerald-600">📞 {pickedClient.telefono}</p>}
              </div>
              <button type="button" onClick={() => { setPickedClient(null); setClientSearch(""); }} className="text-emerald-400 hover:text-red-500 flex-shrink-0">
                <X size={14}/>
              </button>
            </div>
          )}
        </div>

        {/* STEP 2: Equipment */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">2. Equipment</label>
          <div className="relative">
            <input
              value={productSearch}
              onChange={e => { setProductSearch(e.target.value); setPickedProduct(null); }}
              onFocus={() => { setShowClientDropdown(false); if (productResults.length > 0) setShowProductDropdown(true); }}
              onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
              placeholder="Search product…"
              className="w-full border-2 border-gray-200 focus:border-emerald-400 rounded-xl px-4 py-3 text-sm outline-none transition-all"
            />
            {showProductDropdown && productResults.length > 0 && !pickedProduct && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                {productResults.map(p => (
                  <button key={p.id} type="button" onMouseDown={() => pickProduct(p)}
                    className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-sm flex justify-between items-center border-b border-gray-50 last:border-0">
                    <span className="font-medium text-gray-900">{p.nombre}</span>
                    <span className="text-xs text-gray-400">{fmt(p.precio)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {pickedProduct && (
            <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-bold text-indigo-900">{pickedProduct.nombre}</p>
                <p className="text-xs text-indigo-500">Sale price {fmt(pickedProduct.precio)}</p>
              </div>
              <button type="button" onClick={() => { setPickedProduct(null); setProductSearch(""); }} className="text-indigo-400 hover:text-red-500">
                <X size={14}/>
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <input value={form.serial} onChange={e=>setForm(f=>({...f,serial:e.target.value}))}
              placeholder="Serial / asset tag (optional)"
              className="border-2 border-gray-200 focus:border-emerald-400 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
            <input type="date" value={form.fecha_inicio} onChange={e=>setForm(f=>({...f,fecha_inicio:e.target.value}))}
              className="border-2 border-gray-200 focus:border-emerald-400 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
          </div>
        </div>

        {/* STEP 3: Terms */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">3. Rental Terms</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Security deposit (= week 1, refundable)</label>
              <input type="number" step="0.01" min="0" value={form.deposito} onChange={e=>setForm(f=>({...f,deposito:e.target.value}))}
                className="w-full border-2 border-gray-200 focus:border-emerald-400 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Weekly rental fee</label>
              <input type="number" step="0.01" min="0" value={form.renta_semanal} onChange={e=>setForm(f=>({...f,renta_semanal:e.target.value}))}
                className="w-full border-2 border-gray-200 focus:border-emerald-400 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
            </div>
          </div>
          <input value={form.nota} onChange={e=>setForm(f=>({...f,nota:e.target.value}))}
            placeholder="Notes (optional)"
            className="w-full border-2 border-gray-200 focus:border-emerald-400 rounded-xl px-4 py-3 text-sm outline-none transition-all mt-3" />
        </div>

        {/* STEP 4: Contract + signature */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">4. Contract & Signature</label>
          {firma ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
                <CheckCircle size={16}/> Contract signed
              </div>
              <button type="button" onClick={() => setShowContractModal(true)}
                className="text-xs font-bold text-emerald-700 underline">
                View / Re-sign
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowContractModal(true)}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 flex items-center justify-center gap-2 text-sm font-semibold text-gray-600 hover:border-emerald-400 hover:text-emerald-600 transition-all">
              <PenTool size={16}/> Open Contract & Sign
            </button>
          )}
          {showContractModal && (
            <ContractSignModal
              contractText={contractText}
              onConfirm={(sig) => { setFirma(sig); setShowContractModal(false); }}
              onClose={() => setShowContractModal(false)}
            />
          )}
        </div>

        {/* STEP 5: Card (optional) */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">5. Automatic Weekly Payments (optional)</label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3 cursor-pointer">
            <input type="checkbox" checked={wantsCard} onChange={e=>setWantsCard(e.target.checked)} className="w-4 h-4" />
            Connect a credit card for automatic weekly charges
          </label>
          {wantsCard && (
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-white font-semibold text-sm">{pickedClient?.nombre || "— select customer first —"}</p>
                <CreditCard size={20} className="text-slate-400"/>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-3">
                <CardElement
                  onChange={e => setCardReady(e.complete)}
                  options={{ style: { base: { fontSize: "15px", color: "#ffffff", fontFamily: "monospace", letterSpacing: "0.05em", "::placeholder": { color: "#94a3b8" } }, invalid: { color: "#f87171" } }, hidePostalCode: false }}
                />
              </div>
              {stripeError && (
                <div className="mt-3 bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-red-300 text-xs">{stripeError}</p>
                </div>
              )}
              <p className="text-slate-400 text-xs mt-3">🔒 Secured by Stripe. Card data never touches our servers.</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving || processingCard || !pickedClient || !pickedProduct || !firma}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
            {(saving || processingCard) && <RefreshCw size={14} className="animate-spin"/>}
            {processingCard ? "Saving card to Stripe…" : saving ? "Saving…" : "Start Rental"}
          </button>
          <button type="button" onClick={onCancel}
            className="px-6 py-3 rounded-xl text-sm font-semibold border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-all">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Charge button (off-session) ─── */
function ChargeButton({ rental, onDone }) {
  const [charging, setCharging] = useState(false);
  const [result, setResult] = useState(null);

  async function charge() {
    if (!confirm(`Charge ${fmt(rental.renta_semanal)} to card ···· ${rental.card_last4}?`)) return;
    setCharging(true);
    setResult(null);
    try {
      const { data } = await supabase.functions.invoke("stripe-subscriptions", {
        body: {
          action: "charge_subscription",
          customer_id: rental.stripe_customer_id,
          payment_method_id: rental.stripe_payment_method_id,
          amount_cents: Math.round(Number(rental.renta_semanal || 0) * 100),
          description: `Weekly rental — ${rental.clientes?.nombre || ""}`,
        },
      });
      if (!data?.ok) throw new Error(data?.error || "Charge failed");

      const today = new Date().toISOString().slice(0, 10);
      const base = rental.proxima_renta || today;
      const d = new Date(base + "T00:00:00");
      d.setDate(d.getDate() + 7);
      const nextDate = d.toISOString().slice(0, 10);

      await supabase.from("alquileres").update({
        ultima_renta_pagada: today,
        proxima_renta: nextDate,
        semanas_pagadas: (rental.semanas_pagadas || 0) + 1,
        total_pagado: Number(rental.total_pagado || 0) + Number(rental.renta_semanal || 0),
      }).eq("id", rental.id);

      await supabase.from("alquiler_pagos").insert({
        alquiler_id: rental.id, fecha: today, monto: rental.renta_semanal,
        tipo: "renta", metodo: "tarjeta", estado: "pagado", notas: "Charged on demand",
      });

      setResult({ ok: true, msg: `Charged ${fmt(rental.renta_semanal)} ✓` });
      onDone();
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setCharging(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={charge} disabled={charging}
        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
        <CreditCard size={11}/> {charging ? "Charging…" : "Charge Now"}
      </button>
      {result && <span className={`text-xs font-semibold ${result.ok ? "text-green-600" : "text-red-500"}`}>{result.msg}</span>}
    </div>
  );
}

/* ─── Equipment returned modal ─── */
function ReturnEquipmentModal({ rental, onConfirm, onClose }) {
  const [condition, setCondition] = useState(null); // "good" | "damaged"
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    await onConfirm(condition, note.trim());
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 flex items-center justify-between">
          <p className="text-white font-bold">Equipment Returned</p>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white"><X size={20}/></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-600">In what condition is {rental.productos?.nombre || "the equipment"} being returned?</p>
          <button type="button" onClick={() => setCondition("good")}
            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${condition === "good" ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-emerald-300"}`}>
            <p className="font-bold text-sm text-emerald-700">Good condition</p>
            <p className="text-xs text-gray-500">Refund the {fmt(rental.deposito)} deposit to the customer</p>
          </button>
          <button type="button" onClick={() => setCondition("damaged")}
            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${condition === "damaged" ? "border-red-500 bg-red-50" : "border-gray-200 hover:border-red-300"}`}>
            <p className="font-bold text-sm text-red-700">Damaged / not in good condition</p>
            <p className="text-xs text-gray-500">Keep the {fmt(rental.deposito)} deposit</p>
          </button>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Notes (optional)"
            className="w-full border-2 border-gray-200 focus:border-emerald-400 rounded-xl px-3 py-2 text-sm outline-none transition-all" rows={2} />
        </div>
        <div className="border-t border-gray-200 p-4 flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 border-2 border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={!condition || saving}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-40">
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Rental Card
═══════════════════════════════════════════════ */
function RentalCard({ r, onChangeStatus, onMarkPaid, onChargeDone, onDelete, onReturn }) {
  const [expanded, setExpanded] = useState(false);
  const [pagos, setPagos] = useState([]);
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const hasCard = r.stripe_customer_id && r.stripe_payment_method_id;
  const isOverdue = r.estado === "atrasado" || (r.proxima_renta && r.proxima_renta < new Date().toISOString().slice(0,10) && r.estado === "en_renta");

  async function toggleExpand() {
    if (!expanded) {
      setLoadingPagos(true);
      const { data } = await supabase.from("alquiler_pagos").select("id, fecha, monto, tipo, metodo, estado, notas")
        .eq("alquiler_id", r.id).order("fecha", { ascending: false }).limit(20);
      setPagos(data || []);
      setLoadingPagos(false);
    }
    setExpanded(e => !e);
  }

  const today = new Date().toISOString().slice(0,10);
  const daysUntil = r.proxima_renta ? Math.ceil((new Date(r.proxima_renta) - new Date(today)) / 86400000) : null;

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border-2 transition-all ${isOverdue ? "border-red-400" : hasCard ? "border-emerald-200" : "border-gray-100"}`}>
      <div className={`px-5 py-3 flex items-center justify-between ${isOverdue ? "bg-red-500" : "bg-gradient-to-r from-emerald-600 to-teal-600"}`}>
        <div className="flex items-center gap-2">
          <DollarSign size={16} className="text-white"/>
          <div>
            <p className="text-white/70 text-xs font-medium">Next Payment</p>
            <p className="text-white font-bold text-base leading-tight">{fmtDate(r.proxima_renta)}</p>
          </div>
        </div>
        <div className="text-right">
          {daysUntil !== null && r.estado === "en_renta" && (
            <p className="text-white font-black text-lg">
              {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? "Today!" : `in ${daysUntil}d`}
            </p>
          )}
          {r.ultima_renta_pagada && <p className="text-white/60 text-xs">Last paid: {fmtDate(r.ultima_renta_pagada)}</p>}
        </div>
      </div>

      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
              {(r.clientes?.nombre || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-base">{r.clientes?.nombre || "—"}</p>
              {r.clientes?.telefono && <p className="text-xs text-gray-500">📞 {r.clientes.telefono}</p>}
              {r.nota && <p className="text-xs text-gray-400 mt-0.5">📝 {r.nota}</p>}
            </div>
          </div>
          <StatusBadge status={r.estado}/>
        </div>

        <div className="mt-3 bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-indigo-600"/>
            <div>
              <p className="text-xs text-indigo-500 font-medium">Equipment{r.serial ? ` · ${r.serial}` : ""}</p>
              <p className="font-bold text-indigo-900 text-sm">{r.productos?.nombre || "—"}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-black text-indigo-700">{fmt(r.renta_semanal)}<span className="text-xs font-normal text-indigo-400">/wk</span></p>
            <p className="text-xs text-indigo-400">{r.semanas_pagadas || 0} weeks paid · {fmt(r.total_pagado)} total</p>
          </div>
        </div>

        <div className={`mt-2 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2 ${hasCard ? "bg-slate-800" : "bg-gray-100"}`}>
          {hasCard ? (
            <>
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-slate-300"/>
                <div>
                  <p className="text-slate-400 text-xs">Card on file</p>
                  <p className="text-white font-bold text-sm capitalize">{r.card_brand || "Card"} ···· {r.card_last4}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-semibold">Auto-charge</span>
                <button type="button" onClick={() => setShowCardModal(true)}
                  className="text-xs font-semibold text-slate-300 underline hover:text-white">
                  Update
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-500"/>
                <p className="text-xs text-gray-600 font-medium">No card on file — cash payment</p>
              </div>
              <button type="button" onClick={() => setShowCardModal(true)}
                className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full hover:bg-amber-200 transition-colors">
                Add Card
              </button>
            </>
          )}
        </div>
        {showCardModal && (
          <CardManageModal rental={r} onClose={() => setShowCardModal(false)}
            onSaved={() => { setShowCardModal(false); onChargeDone?.(); }} />
        )}

        {r.contrato_firma && (
          <p className="mt-2 text-xs text-violet-500 font-semibold flex items-center gap-1">
            <PenTool size={11}/> Contract signed {r.contrato_firmado_at ? `on ${fmtDate(r.contrato_firmado_at)}` : ""}
          </p>
        )}
      </div>

      <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
        {(r.estado === "en_renta" || r.estado === "atrasado") && (
          <>
            <button onClick={() => onMarkPaid(r)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <DollarSign size={13}/> Mark Payment Received
            </button>
            {hasCard && <ChargeButton rental={r} onDone={onChargeDone}/>}
          </>
        )}

        <select
          value=""
          onChange={e => {
            const action = e.target.value;
            if (action === "overdue") onChangeStatus(r.id, "atrasado");
            else if (action === "repossess") {
              if (confirm("Repossess this equipment (or an equivalent-value item from the customer's station)?")) onChangeStatus(r.id, "retirado");
            } else if (action === "purchased") {
              if (confirm(`Mark this rental as PURCHASED by ${r.clientes?.nombre}? This ends the rental.`)) onChangeStatus(r.id, "comprado");
            } else if (action === "returned") setShowReturnModal(true);
            else if (action === "reactivate") onChangeStatus(r.id, "en_renta");
            else if (action === "delete") setShowDeleteConfirm(true);
          }}
          className="border-2 border-gray-200 hover:border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-xs font-bold bg-white outline-none cursor-pointer"
        >
          <option value="">Actions…</option>
          {r.estado === "en_renta" && <option value="overdue">Mark Overdue</option>}
          {r.estado === "atrasado" && <option value="repossess">Repossess Equipment</option>}
          {(r.estado === "en_renta" || r.estado === "atrasado") && <option value="purchased">Customer Bought It</option>}
          {(r.estado === "en_renta" || r.estado === "atrasado") && <option value="returned">Equipment Returned</option>}
          {r.estado === "retirado" && <option value="reactivate">Re-activate Rental</option>}
          <option value="delete">Delete</option>
        </select>

        {showReturnModal && (
          <ReturnEquipmentModal
            rental={r}
            onClose={() => setShowReturnModal(false)}
            onConfirm={async (condition, note) => { await onReturn(r, condition, note); setShowReturnModal(false); }}
          />
        )}

        <button onClick={toggleExpand} className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 font-semibold">
          {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          Payment history
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Payment History</p>
          {loadingPagos && <p className="text-xs text-gray-400">Loading…</p>}
          {!loadingPagos && pagos.length === 0 && <p className="text-xs text-gray-400 italic">No payments recorded yet.</p>}
          <div className="space-y-2">
            {pagos.map(p => {
              const isFailed = p.estado === "cobro_fallido";
              return (
                <div key={p.id} className={`bg-white rounded-xl px-3 py-2 border flex items-center gap-2 ${isFailed ? "border-red-200 opacity-80" : "border-gray-100"}`}>
                  {isFailed ? <AlertCircle size={13} className="text-red-400 flex-shrink-0"/> : <CheckCircle size={13} className="text-green-500 flex-shrink-0"/>}
                  <p className="text-sm font-medium text-gray-700 w-24 flex-shrink-0">{fmtDate(p.fecha)}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 bg-gray-100 text-gray-600 capitalize">{p.tipo}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 capitalize bg-blue-100 text-blue-700">{p.metodo}</span>
                  <p className="text-sm font-bold text-gray-800 flex-shrink-0">{fmt(p.monto)}</p>
                  {p.notas && <p className="text-xs text-gray-400 flex-1 truncate">{p.notas}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-red-500"/>
            </div>
            <h3 className="font-bold text-gray-900 text-lg mb-1">Delete Rental?</h3>
            <p className="text-gray-500 text-sm mb-1">{r.clientes?.nombre} — {r.productos?.nombre}</p>
            <p className="text-gray-400 text-xs mb-5">This will permanently delete the rental record and all payment history.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 border-2 border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => { setShowDeleteConfirm(false); onDelete(r.id); }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-bold">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function Alquileres() {
  const { usuario } = useUsuario();
  const { van } = useVan();
  const { toast } = useToast();
  const isAdmin = usuario?.rol === "admin";

  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("en_renta");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [van?.id]);

  async function load() {
    setLoading(true);
    setDbError(null);
    let q = supabase.from("alquileres")
      .select("*, clientes(nombre,telefono,email), productos(nombre)")
      .order("created_at", { ascending: false });
    if (!isAdmin && van?.id) q = q.eq("van_id", van.id);
    const { data, error } = await q;
    if (error) {
      setDbError(error.message.includes("does not exist")
        ? "Tables not created yet. Run the alquileres migration in Supabase first."
        : error.message);
    }
    setRentals(data || []);
    setLoading(false);
  }

  async function saveRental({ cliente, producto, form, firma, contratoTexto, stripeInfo }) {
    setSaving(true);
    const startDate = form.fecha_inicio;
    const next = new Date(startDate + "T00:00:00");
    next.setDate(next.getDate() + 7);
    const proxima = next.toISOString().slice(0, 10);

    const { data: inserted, error } = await supabase.from("alquileres").insert({
      cliente_id: cliente.id,
      producto_id: producto.id,
      van_id: van?.id || null,
      serial: form.serial || null,
      estado: "en_renta",
      deposito: parseFloat(form.deposito) || 0,
      renta_semanal: parseFloat(form.renta_semanal) || 0,
      costo_maquina: producto.costo || null,
      fecha_inicio: startDate,
      proxima_renta: proxima,
      nota: form.nota || null,
      contrato_texto: contratoTexto,
      contrato_firma: firma,
      contrato_firmado_at: new Date().toISOString(),
      stripe_customer_id: stripeInfo?.customerId || null,
      stripe_payment_method_id: stripeInfo?.paymentMethodId || null,
      card_last4: stripeInfo?.last4 || null,
      card_brand: stripeInfo?.brand || null,
    }).select("id").single();

    if (error) {
      toast.error("Error saving rental: " + error.message);
      setSaving(false);
      return;
    }

    // Record the deposit as the first payment
    await supabase.from("alquiler_pagos").insert({
      alquiler_id: inserted.id,
      fecha: startDate,
      monto: parseFloat(form.deposito) || 0,
      tipo: "deposito",
      metodo: stripeInfo ? "tarjeta" : "efectivo",
      estado: "pagado",
      notas: "Initial security deposit",
    });

    setSaving(false);
    setShowForm(false);
    toast.success("Rental started");
    load();
  }

  async function changeStatus(id, estado) {
    await supabase.from("alquileres").update({ estado }).eq("id", id);
    load();
  }

  async function markPaid(r) {
    const monto = prompt(`Amount received from ${r.clientes?.nombre}?`, r.renta_semanal);
    if (monto === null) return;
    const amount = parseFloat(monto);
    if (!amount || amount <= 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const base = r.proxima_renta || today;
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + 7);
    const nextDate = d.toISOString().slice(0, 10);

    await supabase.from("alquileres").update({
      ultima_renta_pagada: today,
      proxima_renta: nextDate,
      semanas_pagadas: (r.semanas_pagadas || 0) + 1,
      total_pagado: Number(r.total_pagado || 0) + amount,
      estado: "en_renta",
    }).eq("id", r.id);

    await supabase.from("alquiler_pagos").insert({
      alquiler_id: r.id, fecha: today, monto: amount,
      tipo: "renta", metodo: "efectivo", estado: "pagado", notas: "Cash payment",
    });

    load();
  }

  async function deleteRental(id) {
    await supabase.from("alquileres").delete().eq("id", id);
    load();
  }

  async function returnEquipment(r, condition, note) {
    await supabase.from("alquileres").update({ estado: "cancelado" }).eq("id", r.id);

    if (condition === "good") {
      await supabase.from("alquiler_pagos").insert({
        alquiler_id: r.id, monto: -(Number(r.deposito) || 0),
        tipo: "reembolso", metodo: "efectivo", estado: "pagado",
        notas: note || "Equipment returned in good condition — deposit refunded",
      });
    } else {
      await supabase.from("alquiler_pagos").insert({
        alquiler_id: r.id, monto: 0,
        tipo: "nota", metodo: "efectivo", estado: "pagado",
        notas: note || "Equipment returned damaged — deposit retained",
      });
    }

    load();
  }

  const filtered = rentals.filter(r => filterStatus === "all" || r.estado === filterStatus);
  const today = new Date().toISOString().slice(0, 10);
  const summary = {
    active: rentals.filter(r => r.estado === "en_renta").length,
    weekly: rentals.filter(r => r.estado === "en_renta" || r.estado === "atrasado").reduce((t, r) => t + Number(r.renta_semanal || 0), 0),
    overdue: rentals.filter(r => r.estado === "atrasado" || (r.estado === "en_renta" && r.proxima_renta && r.proxima_renta < today)).length,
  };

  if (loading) return <div className="py-16 text-center text-gray-400">Loading rentals…</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50 pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Package size={22} className="text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Equipment Rentals</h1>
            <p className="text-sm text-gray-500">Rent-first program · $45 deposit + $45/week</p>
          </div>
        </div>

        {!van?.id && !isAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800 text-sm mb-6">
            ⚠️ Select a VAN first to manage rentals.
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-xl p-5">
          {dbError ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
              <p className="font-bold text-red-700 mb-1">Database setup required</p>
              <p className="text-sm text-red-600">{dbError}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card label="Active Rentals" value={summary.active} color="green" />
                <Card label="Weekly Revenue" value={fmt(summary.weekly)} color="blue" sub="from active + overdue rentals" />
                <Card label="Overdue Payments" value={summary.overdue} color="red" sub="needs follow-up or repossession" />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex gap-2 flex-wrap">
                  {[["en_renta","Active"],["atrasado","Overdue"],["retirado","Repossessed"],["comprado","Purchased"],["cancelado","Returned"],["all","All"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setFilterStatus(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus===v?"bg-emerald-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <button onClick={()=>setShowForm(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
                  <Plus size={15}/> New Rental
                </button>
              </div>

              {showForm && (
                <Elements stripe={stripePromise}>
                  <NewRentalForm van={van} isAdmin={isAdmin} saving={saving} onSave={saveRental} onCancel={()=>setShowForm(false)} />
                </Elements>
              )}

              <div className="space-y-4">
                {filtered.length===0 && <p className="text-center py-12 text-gray-400">No rentals with status "{filterStatus}"</p>}
                {filtered.map(r => (
                  <RentalCard key={r.id} r={r} onChangeStatus={changeStatus} onMarkPaid={markPaid} onChargeDone={load} onDelete={deleteRental} onReturn={returnEquipment} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
