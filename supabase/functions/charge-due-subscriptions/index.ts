import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!STRIPE_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Missing env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    }

    const stripe   = new Stripe(STRIPE_SECRET, { apiVersion: "2024-04-10" });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const today = new Date().toISOString().slice(0, 10);

    // Find all active subscriptions due today (or overdue) that have a card on file
    const { data: subs, error: fetchErr } = await supabase
      .from("subscription_clientes")
      .select(`
        id, proxima_entrega,
        stripe_customer_id, stripe_payment_method_id, card_last4, card_brand,
        subscription_planes(nombre, precio, ciclo),
        clientes(nombre, email)
      `)
      .eq("estado", "activa")
      .not("stripe_payment_method_id", "is", null)
      .lte("proxima_entrega", today);

    if (fetchErr) throw fetchErr;

    const results: { id: string; ok: boolean; msg: string }[] = [];

    for (const sub of (subs ?? [])) {
      const precio      = Number(sub.subscription_planes?.precio ?? 0);
      const amountCents = Math.round(precio * 100);
      if (amountCents <= 0) continue;

      try {
        // Charge the saved card off-session
        const pi = await stripe.paymentIntents.create({
          amount:         amountCents,
          currency:       "usd",
          customer:       sub.stripe_customer_id,
          payment_method: sub.stripe_payment_method_id,
          off_session:    true,
          confirm:        true,
          description:    `${sub.subscription_planes?.nombre} — ${sub.clientes?.nombre}`,
        });

        // Advance next billing date based on plan cycle
        const nextDate = calcNext(sub.proxima_entrega, sub.subscription_planes?.ciclo);

        await supabase.from("subscription_clientes").update({
          ultima_entrega:  today,
          proxima_entrega: nextDate,
        }).eq("id", sub.id);

        // Record in delivery log
        await supabase.from("subscription_entregas").insert({
          suscripcion_id: sub.id,
          fecha:          today,
          estado:         "cobrado",
          notas:          `Auto-charged $${precio.toFixed(2)} · PI ${pi.id} · next ${nextDate}`,
        });

        results.push({ id: sub.id, ok: true, msg: `$${precio.toFixed(2)} charged · ${pi.id}` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Log the failure so admins can see it in the delivery history
        await supabase.from("subscription_entregas").insert({
          suscripcion_id: sub.id,
          fecha:          today,
          estado:         "cobro_fallido",
          notas:          `Charge failed: ${msg}`,
        });
        results.push({ id: sub.id, ok: false, msg });
      }
    }

    return json({ ok: true, date: today, processed: results.length, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "content-type": "application/json", ...CORS },
    });
  }
});

/* ── Advance date by plan cycle ── */
function calcNext(current: string | null, ciclo: string | null | undefined): string {
  const base = (current ?? new Date().toISOString().slice(0, 10)) + "T00:00:00";
  const d = new Date(base);
  switch (ciclo) {
    case "semana":     d.setDate(d.getDate() + 7);   break;
    case "quincena":   d.setDate(d.getDate() + 15);  break;
    case "bimestral":  d.setMonth(d.getMonth() + 2); break;
    case "trimestral": d.setMonth(d.getMonth() + 3); break;
    default:           d.setMonth(d.getMonth() + 1); // mensual
  }
  return d.toISOString().slice(0, 10);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
