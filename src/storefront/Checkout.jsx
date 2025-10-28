import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { supabase } from "../supabaseClient";
import { getAnonId } from "../utils/anon";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create_payment_intent`;
const MIN_PAYMENT_CENTS = 50;

async function sendOrderEmail({ to, subject, html }) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-order-email`;
  const payload = { to, subject, html };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, data: await res.json() };
  } catch {}
  try {
    const { data, error } = await supabase.functions.invoke("send-order-email", {
      body: payload,
    });
    if (error) return { ok: false, error };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e };
  }
}

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmt = (n) =>
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function buildOrderEmail({ orderId, amounts, items, shipping, paymentIntent }) {
  const name = escapeHtml(shipping?.name || "Customer");
  const when = new Date().toLocaleString("en-US", { hour12: true });
  const addr = [
    shipping?.address1,
    shipping?.address2,
    [shipping?.city, shipping?.state, shipping?.zip].filter(Boolean).join(", "),
    shipping?.country || "US",
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>");
  const itemRows = (items || [])
    .map((it, idx) => {
      const title = escapeHtml(it.producto?.nombre || it.nombre || `#${it.producto_id}`);
      const brand = escapeHtml(it.producto?.marca || it.marca || "");
      const code = escapeHtml(it.producto?.codigo || it.codigo || "");
      const meta = [brand, code].filter(Boolean).join(" • ");
      const qty = Number(it.qty || 0);
      const unit = Number(it.producto?.precio ?? it.precio_unit ?? 0);
      const line = qty * unit;
      const zebra = idx % 2 === 1 ? "background:#fafafa;" : "";
      return `
        <tr style="${zebra}">
          <td style="padding:10px 8px;vertical-align:top">
            <div style="font-weight:600">${title}</div>
            ${meta ? `<div style="color:#6b7280;font-size:12px;margin-top:2px">${meta}</div>` : ""}
          </td>
          <td align="right" style="padding:10px 8px;white-space:nowrap;vertical-align:top">${qty}</td>
          <td align="right" style="padding:10px 8px;white-space:nowrap;vertical-align:top">$${fmt(unit)}</td>
          <td align="right" style="padding:10px 8px;white-space:nowrap;vertical-align:top"><b>$${fmt(line)}</b></td>
        </tr>`;
    })
    .join("");
  const html = `<!doctype html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;background:#f6f7f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="padding:20px 24px;background:#111827;color:#fff;font-family:sans-serif;font-size:18px;font-weight:700;">Tools4care</td></tr>
        <tr><td style="padding:24px;font-family:sans-serif;color:#111827;">
          <h1 style="margin:0 0 8px;font-size:22px;">Order #${orderId} confirmed 🎉</h1>
          <p style="margin:0 0 16px;color:#374151;font-size:14px;">Thanks, <b>${name}</b>. We received your order.</p>
          <table width="100%" style="font-size:14px;color:#111827;">
            <tr><td style="padding:8px 0;color:#6b7280;">Date</td><td align="right">${escapeHtml(when)}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Payment ID</td><td align="right">${escapeHtml(paymentIntent?.id || "-")}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
          <h3 style="margin:0 0 8px;font-size:16px;">Items</h3>
          <table width="100%" style="border-collapse:collapse;font-size:14px;border:1px solid #e5e7eb;border-radius:8px;">
            <thead><tr style="background:#f3f4f6"><th align="left" style="padding:10px 8px;color:#6b7280;">Item</th><th align="right" style="padding:10px 8px;color:#6b7280;">Qty</th><th align="right" style="padding:10px 8px;color:#6b7280;">Unit</th><th align="right" style="padding:10px 8px;color:#6b7280;">Total</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <table width="100%" style="font-size:14px;margin-top:12px;">
            <tr><td>Subtotal</td><td align="right">$${fmt(amounts.subtotal)}</td></tr>
            ${amounts.discount ? `<tr><td style="color:#b91c1c;">Discount</td><td align="right" style="color:#b91c1c;">- $${fmt(amounts.discount)}</td></tr>` : ""}
            <tr><td>Shipping</td><td align="right">$${fmt(amounts.shipping)}</td></tr>
            <tr><td>Taxes</td><td align="right">$${fmt(amounts.taxes)}</td></tr>
            <tr><td style="border-top:1px solid #e5e7eb;"><b>Total</b></td><td align="right" style="border-top:1px solid #e5e7eb;"><b>$${fmt(amounts.total)}</b></td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
          <h3 style="margin:0 0 8px;font-size:16px;">Shipping address</h3>
          <div style="color:#374151;font-size:14px;line-height:1.5;">${addr || "—"}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { html };
}
function buildAdminNotificationEmail({ orderId, amounts, items, shipping, paymentIntent }) {
  const when = new Date().toLocaleString("en-US", { hour12: true });
  const name = escapeHtml(shipping?.name || "Customer");
  const email = escapeHtml(shipping?.email || "—");
  const phone = escapeHtml(shipping?.phone || "—");
  const addr = [
    shipping?.address1,
    shipping?.address2,
    [shipping?.city, shipping?.state, shipping?.zip].filter(Boolean).join(", "),
    shipping?.country || "US",
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>");
  const itemsList = (items || [])
    .map((it) => {
      const title = escapeHtml(it.producto?.nombre || it.nombre || `#${it.producto_id}`);
      const qty = Number(it.qty || 0);
      const unit = Number(it.producto?.precio ?? it.precio_unit ?? 0);
      const line = qty * unit;
      return `<li><b>${qty}x</b> ${title} — $${fmt(unit)} = <b>$${fmt(line)}</b></li>`;
    })
    .join("");
  const html = `<!doctype html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;background:#f6f7f9;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:20px 24px;background:#059669;color:#fff;font-size:20px;font-weight:700;">New Order</td></tr>
        <tr><td style="padding:24px;color:#111827;">
          <h1 style="margin:0 0 8px;font-size:22px;color:#059669;">Order #${orderId}</h1>
          <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">${escapeHtml(when)}</p>
          <table width="100%" style="font-size:14px;margin-bottom:20px;">
            <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Payment ID</td><td style="padding:8px 0;"><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(paymentIntent?.id || "-")}</code></td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Customer</td><td style="padding:8px 0;"><b>${name}</b></td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Phone</td><td style="padding:8px 0;">${phone}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;">Address</td><td style="padding:8px 0;line-height:1.5;">${addr || "—"}</td></tr>
          </table>
          <h3 style="margin:0 0 12px;font-size:16px;">Items</h3>
          <ul style="list-style:none;padding:0;margin:0 0 20px;font-size:14px;">${itemsList || "<li>No items</li>"}</ul>
          <table width="100%" style="font-size:14px;background:#f9fafb;padding:12px;border-radius:8px;">
            <tr><td style="padding:6px 0;">Subtotal</td><td align="right" style="padding:6px 0;">$${fmt(amounts.subtotal)}</td></tr>
            ${amounts.discount ? `<tr><td style="padding:6px 0;color:#b91c1c;">Discount</td><td align="right" style="padding:6px 0;color:#b91c1c;">- $${fmt(amounts.discount)}</td></tr>` : ""}
            <tr><td style="padding:6px 0;">Shipping</td><td align="right" style="padding:6px 0;">$${fmt(amounts.shipping)}</td></tr>
            <tr><td style="padding:6px 0;">Taxes</td><td align="right" style="padding:6px 0;">$${fmt(amounts.taxes)}</td></tr>
            <tr><td style="padding:8px 0;border-top:2px solid #059669;font-weight:700;">TOTAL</td><td align="right" style="padding:8px 0;border-top:2px solid #059669;font-weight:700;color:#059669;">$${fmt(amounts.total)}</td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { html };
}

const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const isValidPhone = (s) => String(s || "").replace(/[^\d]/g, "").length >= 7;
const phoneDigits = (s) => String(s || "").replace(/\D/g, "");
function formatPhoneUS(s) {
  const d = phoneDigits(s).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","PR"];

async function ensureCart() {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;
  const col = userId ? "user_id" : "anon_id";
  const val = userId ?? getAnonId();
  const { data: found, error: selErr } = await supabase.from("carts").select("id").eq(col, val).maybeSingle();
  if (selErr && selErr.code !== "PGRST116") throw selErr;
  if (found?.id) return found.id;
  const { data: inserted, error: insErr } = await supabase.from("carts").insert({ [col]: val }).select("id").single();
  if (insErr && String(insErr.code) === "23505") {
    const { data: again } = await supabase.from("carts").select("id").eq(col, val).maybeSingle();
    if (again?.id) return again.id;
  }
  if (insErr) throw insErr;
  return inserted.id;
}

async function fetchCartItems(cartId) {
  const { data: items, error: itErr } = await supabase.from("cart_items").select("producto_id, qty").eq("cart_id", cartId);
  if (itErr) throw itErr;
  const ids = (items || []).map((i) => i.producto_id);
  if (!ids.length) return [];
  const { data: prods, error: pErr } = await supabase.from("online_products_v").select("id, codigo, nombre, marca, price_base, price_online, stock").in("id", ids);
  if (pErr) throw pErr;
  const idx = new Map((prods || []).map((p) => [p.id, p]));
  const result = [];
  for (const i of items || []) {
    const p = idx.get(i.producto_id);
    if (!p) continue;
    const unit = Number(p.price_online ?? p.price_base ?? 0);
    const stock = Number(p.stock ?? 0);
    const originalQty = Number(i.qty || 0);
    let qty = Number.isFinite(originalQty) && originalQty > 0 ? originalQty : 1;
    qty = Math.max(1, Math.min(qty, 999, stock > 0 ? stock : qty));
    if (qty !== originalQty) {
      try {
        await supabase.from("cart_items").update({ qty }).eq("cart_id", cartId).eq("producto_id", i.producto_id);
      } catch {}
    }
    result.push({
      producto_id: i.producto_id,
      qty,
      producto: { id: p.id, codigo: p.codigo, nombre: p.nombre, marca: p.marca, precio: unit, stock },
    });
  }
  return result;
}

const SHIPPING_METHODS = [
  { key: "pickup", label: "Pickup in store", calc: () => 0, note: "Free" },
  { key: "standard", label: "Standard (3–7 days)", calc: (sub) => (sub >= 75 ? 0 : 6.99), note: "Free over $75" },
  { key: "express", label: "Express (1–2 days)", calc: () => 14.99, note: null },
];

const STATE_TAX = { FL:0.06, NY:0.08875, NJ:0.06625, CA:0.0725, TX:0.0625, MA:0.0625 };

function calcShipping(methodKey, subtotal, freeShippingOverride = false) {
  if (freeShippingOverride) return 0;
  const m = SHIPPING_METHODS.find((x) => x.key === methodKey) || SHIPPING_METHODS[1];
  return Number(m.calc(subtotal) || 0);
}

function calcTax(taxableSubtotal, stateCode) {
  const rate = STATE_TAX[(stateCode || "").toUpperCase()] || 0;
  return taxableSubtotal * rate;
}

async function getOnlineVanId() {
  const { data, error } = await supabase.from("vans").select("id, nombre_van").ilike("nombre_van", "%online%").maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}

const LOCAL_CODES = [
  { code: "SAVE10", type: "percent", value: 10, active: true },
  { code: "WELCOME5", type: "amount", value: 5, active: true },
  { code: "FREESHIP", type: "free_shipping", value: 0, active: true },
];

async function resolvePromo(codeInput) {
  const code = String(codeInput || "").trim().toUpperCase();
  if (!code) return null;
  try {
    const { data, error } = await supabase.from("discount_codes").select("code, percent, active, expires_at, max_uses, times_used").ilike("code", code).maybeSingle();
    if (!error && data) {
      const now = new Date();
      const expired = data.expires_at ? new Date(data.expires_at) < now : false;
      const overUsed = typeof data.max_uses === "number" && typeof data.times_used === "number" && data.max_uses > 0 && data.times_used >= data.max_uses;
      if (data.active === false) throw new Error("This code is not active.");
      if (expired) throw new Error("This code is expired.");
      if (overUsed) throw new Error("This code has reached its limit.");
      const pct = Number(data.percent || 0);
      if (pct <= 0) throw new Error("Invalid promo code.");
      return { code: data.code.toUpperCase(), type: "percent", value: pct, freeShipping: false };
    }
  } catch {}
  const local = LOCAL_CODES.find((c) => c.code === code && c.active);
  if (!local) throw new Error("Invalid or inactive promo code.");
  return { code: local.code, type: local.type, value: Number(local.value || 0), freeShipping: local.type === "free_shipping" };
}

function computeDiscount(subtotal, promo) {
  const sub = Math.max(0, Number(subtotal) || 0);
  if (!promo) return 0;
  if (promo.type === "percent") {
    const pct = Math.max(0, Number(promo.value || 0));
    return Math.min(sub, (sub * pct) / 100);
  }
  if (promo.type === "amount") {
    const amt = Math.max(0, Number(promo.value || 0));
    return Math.min(sub, amt);
  }
  return 0;
}

export default function Checkout() {
  const { state } = useLocation();
  const cidFromNav = state?.cid ?? null;
  const [phase, setPhase] = useState("checkout");
  const [success, setSuccess] = useState(null);
  const [cartId, setCartId] = useState(null);
  const [items, setItems] = useState([]);
  const [shipping, setShipping] = useState({ name: "", email: "", phone: "", address1: "", address2: "", city: "", state: "MA", zip: "", country: "US", method: "standard" });
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState(null);
  const [promoError, setPromoError] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user;
        if (!user) return;
        const meta = user.user_metadata || {};
        const fullName =
          meta.full_name ||
          meta.name ||
          [meta.first_name || meta.given_name, meta.last_name || meta.family_name].filter(Boolean).join(" ") ||
          (user.email ? user.email.split("@")[0].replace(/[._-]/g, " ") : "");
        setShipping((s) => ({ ...s, name: s.name || fullName || "", email: s.email || user.email || "", phone: s.phone || meta.phone || s.phone || "" }));
      } catch {}
    })();
  }, []);

  const requiredOk = useMemo(() => {
    return String(shipping.name || "").trim().length > 1 && isValidEmail(shipping.email) && isValidPhone(shipping.phone);
  }, [shipping.name, shipping.email, shipping.phone]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const cid = cidFromNav || (await ensureCart());
        if (cancel) return;
        setCartId(cid);
        const list = await fetchCartItems(cid);
        if (cancel) return;
        setItems(list);
      } catch (e) {
        if (!cancel) setError(e.message || "Failed to load the cart.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => (cancel = true);
  }, [cidFromNav]);

  const subtotal = useMemo(() => items.reduce((s, it) => s + Number(it.qty) * Number(it.producto?.precio || 0), 0), [items]);
  const discount = useMemo(() => computeDiscount(subtotal, promo), [subtotal, promo]);
  const subAfterDiscount = useMemo(() => Math.max(0, subtotal - discount), [subtotal, discount]);
  const freeShippingOverride = promo?.freeShipping === true;
  const shippingCost = useMemo(() => calcShipping(shipping.method, subAfterDiscount, freeShippingOverride), [shipping.method, subAfterDiscount, freeShippingOverride]);
  const taxes = useMemo(() => calcTax(subAfterDiscount, shipping.state), [subAfterDiscount, shipping.state]);
  const total = useMemo(() => Math.max(0, subAfterDiscount + shippingCost + taxes), [subAfterDiscount, shippingCost, taxes]);
  const stockIssues = useMemo(() => items.filter((it) => Number(it.qty) > Number(it.producto?.stock ?? Infinity)), [items]);
  const hasStockIssues = stockIssues.length > 0;

  const extractPiId = (secret) => {
    if (!secret) return "";
    const m = String(secret).match(/^(pi_[^_]+)/);
    return m ? m[1] : "";
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (!items.length || hasStockIssues) {
          setClientSecret("");
          setPaymentIntentId("");
          return;
        }
        const amountCents = Math.round(total * 100);
        if (!Number.isFinite(amountCents) || amountCents < MIN_PAYMENT_CENTS) {
          setClientSecret("");
          setPaymentIntentId("");
          return;
        }
        setCreating(true);
        setError("");
        const payload = {
          amount: amountCents,
          metadata: {
            subtotal_cents: Math.round(subtotal * 100),
            discount_cents: Math.round(discount * 100),
            subtotal_after_discount_cents: Math.round(subAfterDiscount * 100),
            shipping_cents: Math.round(shippingCost * 100),
            taxes_cents: Math.round(taxes * 100),
            free_shipping_override: freeShippingOverride ? "1" : "0",
            promo_code: promo?.code || "",
            cart_id: cartId || "",
          },
          shipping: {
            name: shipping.name || "Guest",
            phone: phoneDigits(shipping.phone) || undefined,
            address: {
              line1: shipping.address1 || "N/A",
              line2: shipping.address2 || undefined,
              city: shipping.city || "N/A",
              state: shipping.state || "N/A",
              postal_code: shipping.zip || "00000",
              country: shipping.country || "US",
            },
            carrier: shipping.method,
          },
        };
        const res = await fetch(FN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ amount: payload.amount, currency: "usd", metadata: payload.metadata, shipping: payload.shipping }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(errText || `Edge Function error (${res.status})`);
        }
        const data = await res.json();
        if (cancel) return;
        if (!data?.clientSecret) throw new Error("Could not create the payment.");
        setClientSecret(data.clientSecret);
        setPaymentIntentId(extractPiId(data.clientSecret));
      } catch (e) {
        if (!cancel) setError(e.message || "Failed to prepare the payment.");
      } finally {
        if (!cancel) setCreating(false);
      }
    })();
    return () => (cancel = true);
  }, [
    items,
    subtotal,
    discount,
    subAfterDiscount,
    shippingCost,
    taxes,
    total,
    cartId,
    shipping.name,
    shipping.phone,
    shipping.address1,
    shipping.address2,
    shipping.city,
    shipping.state,
    shipping.zip,
    shipping.country,
    shipping.method,
    freeShippingOverride,
    promo?.code,
    hasStockIssues,
  ]);

  async function handlePaid(paymentIntent) {
    try {
      const cid = cartId || (await ensureCart());
      const list = await fetchCartItems(cid);
      const meta = paymentIntent?.metadata || {};
      const amounts = {
        subtotal: Number(meta.subtotal_cents ?? 0) / 100 || subtotal,
        discount: Number(meta.discount_cents ?? 0) / 100 || discount,
        sub_after_discount: Number(meta.subtotal_after_discount_cents ?? 0) / 100 || subAfterDiscount,
        shipping: Number(meta.shipping_cents ?? 0) / 100 || shippingCost,
        taxes: Number(meta.taxes_cents ?? 0) / 100 || taxes,
      };
      amounts.total = Number((amounts.sub_after_discount + amounts.shipping + amounts.taxes).toFixed(2));
      const itemsPayload = list.map((it) => ({
        producto_id: it.producto_id,
        qty: Number(it.qty || 0),
        precio_unit: Number(it.producto?.precio || 0),
        nombre: it.producto?.nombre || "",
        marca: it.producto?.marca || null,
        codigo: it.producto?.codigo || null,
      }));
      const addressJson = {
        line1: shipping.address1 || null,
        line2: shipping.address2 || null,
        city: shipping.city || null,
        state: shipping.state || null,
        postal_code: shipping.zip || null,
        country: shipping.country || "US",
      };
      let orderIdFromRpc = null;
      try {
        const { data: newOrderId, error: rpcErr } = await supabase.rpc("sp_create_order_and_discount", {
          p_payment_intent_id: paymentIntent.id,
          p_currency: paymentIntent.currency || "usd",
          p_name: shipping.name || null,
          p_email: shipping.email || null,
          p_phone: phoneDigits(shipping.phone) || null,
          p_address: addressJson,
          p_amount_subtotal: amounts.subtotal,
          p_amount_shipping: amounts.shipping,
          p_amount_taxes: amounts.taxes,
          p_amount_total: amounts.total,
          p_items: itemsPayload,
          p_discount_amount: amounts.discount || 0,
          p_promo_code: promo?.code || null,
        });
        if (!rpcErr) orderIdFromRpc = newOrderId || null;
      } catch {}
      const finalizeAndEmail = async (oid) => {
        try {
          await supabase.from("cart_items").delete().eq("cart_id", cid);
        } catch {}
        if (shipping.email) {
          const subject = `Order #${oid} confirmed`;
          const { html } = buildOrderEmail({ orderId: oid, amounts, items: list, shipping, paymentIntent });
          try {
            await sendOrderEmail({ to: String(shipping.email).trim(), subject, html });
          } catch {}
        }
        const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
        if (adminEmail) {
          const adminSubject = `New Order #${oid} - $${fmt(amounts.total)}`;
          const { html: adminHtml } = buildAdminNotificationEmail({ orderId: oid, amounts, items: list, shipping, paymentIntent });
          try {
            await sendOrderEmail({ to: String(adminEmail).trim(), subject: adminSubject, html: adminHtml });
          } catch {}
        }
        setSuccess({ paymentIntent, orderId: oid, amounts });
        setPhase("success");
      };
      const { data: order, error: e1 } = await supabase
        .from("orders")
        .insert({
          payment_intent_id: paymentIntent.id,
          amount_total: amounts.total,
          amount_subtotal: amounts.subtotal,
          amount_shipping: amounts.shipping,
          amount_taxes: amounts.taxes,
          amount_discount: amounts.discount || 0,
          currency: paymentIntent.currency || "usd",
          email: shipping?.email || null,
          phone: phoneDigits(shipping?.phone) || null,
          name: shipping?.name || null,
          address_json: addressJson,
          status: "pending",
          promo_code: promo?.code || null,
        })
        .select("id")
        .single();
      if (e1) throw new Error(e1.message);
      const orderId = order.id;
      const rows = list.map((it) => ({
        order_id: orderId,
        producto_id: it.producto_id,
        nombre: it.producto?.nombre,
        qty: it.qty,
        precio_unit: it.producto?.precio,
        marca: it.producto?.marca ?? null,
        codigo: it.producto?.codigo ?? null,
        taxable: true,
      }));
      const { error: oiErr } = await supabase.from("order_items").insert(rows);
      if (oiErr) throw oiErr;
      try {
        const onlineVanId = await getOnlineVanId();
        if (onlineVanId) {
          for (const it of list) {
            const qty = Number(it.qty || 0);
            if (qty > 0) {
              await supabase.rpc("decrement_stock_van", { p_van_id: onlineVanId, p_producto_id: it.producto_id, p_delta: qty });
            }
          }
        }
      } catch {}
      try {
        await supabase.from("cart_items").delete().eq("cart_id", cid);
      } catch {}
      const { error: upErr } = await supabase.from("orders").update({ status: "paid" }).eq("id", orderId).neq("status", "paid");
      if (upErr) throw upErr;
      await finalizeAndEmail(orderId);
    } catch (e) {
      setError(e.message || "Payment was approved, but we couldn't finalize the order.");
    }
  }

  async function applyPromo() {
    setPromoError("");
    try {
      const details = await resolvePromo(promoInput);
      setPromo(details);
    } catch (e) {
      setPromo(null);
      setPromoError(e.message || "Invalid promo code.");
    }
  }
  function clearPromo() {
    setPromo(null);
    setPromoInput("");
    setPromoError("");
  }

  if (phase === "success") {
    const { paymentIntent: pi, amounts } = success;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-2xl shadow-sm p-6 space-y-3">
          <h1 className="text-2xl font-bold text-emerald-700">Thanks for your purchase!</h1>
          <div className="text-gray-700">
            We received your payment for <b>${fmt(amounts.total)}</b>.
          </div>
          <div className="text-sm text-gray-600">
            Payment ID: <code className="bg-gray-100 px-2 py-0.5 rounded">{pi?.id}</code>
          </div>
          {success.orderId && (
            <div className="text-sm text-gray-600">
              Order #: <code className="bg-gray-100 px-2 py-0.5 rounded">{success.orderId}</code>
            </div>
          )}
          <div className="mt-4">
            <div className="border rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <b>${fmt(amounts.subtotal)}</b>
              </div>
              {amounts.discount ? (
                <div className="flex justify-between text-rose-700">
                  <span>Discount{promo?.code ? ` (${promo.code})` : ""}</span>
                  <b>- ${fmt(amounts.discount)}</b>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>Shipping</span>
                <b>${fmt(amounts.shipping)}</b>
              </div>
              <div className="flex justify-between">
                <span>Taxes</span>
                <b>${fmt(amounts.taxes)}</b>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>Total</span>
                <b>${fmt(amounts.total)}</b>
              </div>
            </div>
          </div>
          <div className="pt-2">
            <Link to="/storefront" className="text-blue-600 hover:underline">
              Back to store →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">Checkout</h1>
          <Link to="/storefront" className="text-sm text-blue-600 hover:underline">
            ← Keep shopping
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4 grid lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="font-semibold">Shipping</h2>
          <div className="grid grid-cols-1 gap-3">
            <input className="border rounded-lg px-3 py-2" placeholder="Full name" value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })} required />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input className="border rounded-lg px-3 py-2 sm:col-span-2" placeholder="Email (required)" value={shipping.email} onChange={(e) => setShipping({ ...shipping, email: e.target.value })} required type="email" />
              <input className="border rounded-lg px-3 py-2" placeholder="Phone (required)" value={shipping.phone} onChange={(e) => setShipping({ ...shipping, phone: formatPhoneUS(e.target.value) })} required type="tel" inputMode="numeric" pattern="\d*" />
            </div>
            <input className="border rounded-lg px-3 py-2" placeholder="Address line 1" value={shipping.address1} onChange={(e) => setShipping({ ...shipping, address1: e.target.value })} />
            <input className="border rounded-lg px-3 py-2" placeholder="Address line 2 (optional)" value={shipping.address2} onChange={(e) => setShipping({ ...shipping, address2: e.target.value })} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input className="border rounded-lg px-3 py-2 col-span-2" placeholder="City" value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} />
              <select className="border rounded-lg px-3 py-2" value={shipping.state} onChange={(e) => setShipping({ ...shipping, state: e.target.value })}>
                {US_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <input className="border rounded-lg px-3 py-2" placeholder="ZIP" value={shipping.zip} onChange={(e) => setShipping({ ...shipping, zip: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="font-medium text-sm">Shipping method</div>
              <div className="grid gap-2">
                {SHIPPING_METHODS.map((m) => (
                  <label key={m.key} className={`flex items-center justify-between border rounded-lg px-3 py-2 cursor-pointer ${shipping.method === m.key ? "ring-2 ring-blue-500 border-blue-300" : ""}`}>
                    <div className="flex items-center gap-2">
                      <input type="radio" name="shipmethod" checked={shipping.method === m.key} onChange={() => setShipping({ ...shipping, method: m.key })} />
                      <span>{m.label}</span>
                      {m.note && <span className="text-xs text-emerald-700">({m.note})</span>}
                    </div>
                    <b>${fmt(m.calc(subAfterDiscount))}</b>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-2">
              <div className="font-medium text-sm mb-1">Promo code</div>
              <div className="flex gap-2">
                <input className="border rounded-lg px-3 py-2 flex-1" placeholder="Enter code (e.g. SAVE10)" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} />
                {!promo ? (
                  <button onClick={applyPromo} className="rounded-lg bg-gray-900 text-white px-4 py-2 hover:bg-black/80">
                    Apply
                  </button>
                ) : (
                  <button onClick={clearPromo} className="rounded-lg border px-4 py-2 hover:bg-gray-50">
                    Remove
                  </button>
                )}
              </div>
              {promoError && <div className="text-sm text-rose-700 mt-1">{promoError}</div>}
              {promo && (
                <div className="text-sm text-emerald-700 mt-1">
                  Applied <b>{promo.code}</b>
                  {promo.type === "percent" && ` (${promo.value}% off)`}
                  {promo.type === "amount" && ` ($${fmt(promo.value)} off)`}
                  {promo.type === "free_shipping" && ` (Free shipping)`}
                </div>
              )}
              {!requiredOk && <div className="mt-2 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">Please complete <b>name</b>, a valid <b>email</b> and <b>phone</b>.</div>}
            </div>
          </div>
        </section>
        <section className="space-y-4">
          {items.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h2 className="font-semibold mb-3 flex items-center justify-between">
                <span>Items in cart</span>
                <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full">{items.length}</span>
              </h2>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {items.map((item) => {
                  const producto = item.producto || {};
                  const nombre = producto.nombre || `Product #${item.producto_id}`;
                  const marca = producto.marca || "";
                  const codigo = producto.codigo || "";
                  const qty = Number(item.qty || 0);
                  const unit = Number(producto.precio || 0);
                  const line = qty * unit;
                  const stock = Number(producto.stock ?? 0);
                  const exceedsStock = qty > stock;
                  const isLowStock = stock > 0 && stock < 5;
                  const isOutOfStock = stock === 0;
                  return (
                    <div key={item.producto_id} className={`flex gap-3 pb-3 border-b last:border-b-0 ${exceedsStock ? "bg-red-50 p-2 rounded-lg" : ""}`}>
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl">📦</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{nombre}</div>
                        {(marca || codigo) && <div className="text-xs text-gray-500 mt-0.5">{[marca, codigo].filter(Boolean).join(" • ")}</div>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-gray-600">Qty: {qty}</span>
                          <span className="text-xs text-gray-400">×</span>
                          <span className="text-sm text-gray-600">${fmt(unit)}</span>
                        </div>
                        {exceedsStock && <div className="text-xs text-red-700 font-semibold mt-1">⚠️ Exceeds stock ({stock} available)</div>}
                        {isOutOfStock && !exceedsStock && <div className="text-xs text-red-700 font-semibold mt-1">⚠️ Out of stock</div>}
                        {isLowStock && !exceedsStock && <div className="text-xs text-amber-700 mt-1">Only {stock} left</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-sm">${fmt(line)}</div>
                        {qty > 1 && <div className="text-xs text-gray-500">${fmt(unit)} each</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="font-semibold mb-2">Order summary</h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <b>${fmt(subtotal)}</b>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>Discount{promo?.code ? ` (${promo.code})` : ""}</span>
                  <b>- ${fmt(discount)}</b>
                </div>
              )}
              <div className="flex justify-between">
                <span>Shipping{freeShippingOverride ? " (overridden by promo)" : ""}</span>
                <b>${fmt(shippingCost)}</b>
              </div>
              <div className="flex justify-between">
                <span>Taxes</span>
                <b>${fmt(taxes)}</b>
              </div>
              <div className="flex justify-between border-t pt-2 text-base">
                <span>Total</span>
                <b>${fmt(total)}</b>
              </div>
            </div>
            {items.length === 0 && <div className="mt-2 text-sm text-amber-700">Your cart is empty. Add items to cart to pay.</div>}
          </div>
          {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded">{error}</div>}
    {hasStockIssues ? (
  <div className="bg-white rounded-2xl shadow-sm p-4">
    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-sm">
      Some items exceed available stock. Please reduce quantities:
      <ul className="list-disc ml-5 mt-1">
        {stockIssues.map((it) => (
          <li key={it.producto_id}>
            {it.producto?.nombre || it.producto_id}: requested {it.qty}, in stock {it.producto?.stock ?? 0}
          </li>
        ))}
      </ul>
    </div>
  </div>
) : clientSecret ? (
  <Elements
    key={clientSecret}
    options={{ clientSecret, locale: "en" }}
    stripe={stripePromise}
  >
    <PaymentBlock
      onPaid={handlePaid}
      total={total}
      clientSecret={clientSecret}
    />
  </Elements>
) : (
  <div className="bg-white rounded-2xl p-4 shadow-sm">
    {loading || creating
      ? "Preparing payment…"
      : items.length === 0
        ? "Add items to cart to pay."
        : "Update shipping/details to pay."}
  </div>
)}
        </section>
      </main>
    </div>
  );
}

function ReturnHandler({ onPaid, clientSecret: csFromProps }) {
  const stripe = useStripe();
  const { search } = useLocation();

  useEffect(() => {
    if (!stripe) return;

    const params = new URLSearchParams(search);
    const cs = csFromProps || params.get("payment_intent_client_secret");
    if (!cs) return;

    (async () => {
      const { paymentIntent, error } = await stripe.retrievePaymentIntent(cs);
      if (!error && (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing")) {
        await onPaid(paymentIntent);

        const url = new URL(window.location.href);
        url.searchParams.delete("payment_intent_client_secret");
        url.searchParams.delete("payment_intent");
        url.searchParams.delete("redirect_status");
        window.history.replaceState({}, "", url.toString());
      }
    })();
  }, [stripe, search, csFromProps, onPaid]);

  return null;
}


function PaymentBlock({ onPaid, total, clientSecret }) {
  return (
    <div className="space-y-3">
      <AppleGooglePayButton total={total} onPaid={onPaid} clientSecret={clientSecret} />
      <ReturnHandler onPaid={onPaid} clientSecret={clientSecret} />
      <PaymentForm onPaid={onPaid} />
    </div>
  );
}




function AppleGooglePayButton({ total, onPaid, clientSecret }) {
  const stripe = useStripe();
  const [pr, setPr] = useState(null);

  useEffect(() => {
    if (!stripe) return;
    if (!Number.isFinite(total)) return;
    if (!clientSecret) return;

    const paymentRequest = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: "Tools4Care", amount: Math.round(Number(total) * 100) },
      requestPayerName: true,
      requestPayerEmail: true,
      requestShipping: false,
    });

    paymentRequest.on("paymentmethod", async (ev) => {
      try {
       const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(
  clientSecret,
  { payment_method: ev.paymentMethod.id },
          { handleActions: false }
        );

        if (confirmError) {
          ev.complete("fail");
          console.error("[Apple/Google Pay] Error:", confirmError);
          return;
        }

        if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
          ev.complete("success");
          await onPaid(paymentIntent);
        } else if (paymentIntent?.status === "requires_action") {
          const { error: actionError, paymentIntent: afterAction } = await stripe.confirmCardPayment(
            clientSecret
          );
          if (actionError) {
            ev.complete("fail");
            console.error("[Apple/Google Pay] Action error:", actionError);
          } else {
            ev.complete("success");
            await onPaid(afterAction);
          }
        } else {
          ev.complete("fail");
          console.error("[Apple/Google Pay] Unexpected status:", paymentIntent?.status);
        }
      } catch (err) {
        ev.complete("fail");
        console.error("[Apple/Google Pay] Exception:", err);
      }
    });

    paymentRequest.canMakePayment().then((result) => {
      if (result) setPr(paymentRequest);
      else setPr(null);
    });

    return () => paymentRequest.off("paymentmethod");
  }, [stripe, total, clientSecret, onPaid]);

  if (!pr) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <PaymentRequestButtonElement
        options={{
          paymentRequest: pr,
          style: { paymentRequestButton: { type: "buy", theme: "dark", height: "44px" } },
        }}
      />
      <div className="mt-2 text-xs text-gray-500">
        Apple Pay / Google Pay will appear if supported by the device and browser.
      </div>
    </div>
  );
}

function PaymentForm({ onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    const pe = elements.getElement(PaymentElement);
    if (!pe) {
      setError("Payment form not available. Verify your Stripe keys belong to the same account & mode.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/checkout` },
      redirect: "if_required",
    });
    if (err) {
      setError(err.message || "Payment failed. Please try another method.");
      setLoading(false);
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      await onPaid(paymentIntent);
    } else {
      setError("The payment did not complete. Please try again.");
    }
    setLoading(false);
  };
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <PaymentElement />
      {error && <div className="p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
      <button disabled={!stripe || loading} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-2 font-semibold">
        {loading ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}
