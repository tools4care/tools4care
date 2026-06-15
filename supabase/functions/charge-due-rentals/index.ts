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

    // Find all active rentals due today (or overdue) that have a card on file
    const { data: rentals, error: fetchErr } = await supabase
      .from("alquileres")
      .select(`
        id, proxima_renta, renta_semanal, semanas_pagadas, total_pagado,
        stripe_customer_id, stripe_payment_method_id, card_last4, card_brand,
        clientes(nombre, email)
      `)
      .eq("estado", "en_renta")
      .not("stripe_payment_method_id", "is", null)
      .lte("proxima_renta", today);

    if (fetchErr) throw fetchErr;

    const results: { id: string; ok: boolean; msg: string }[] = [];

    for (const r of (rentals ?? [])) {
      const renta       = Number(r.renta_semanal ?? 0);
      const amountCents = Math.round(renta * 100);
      if (amountCents <= 0) continue;

      try {
        const pi = await stripe.paymentIntents.create({
          amount:         amountCents,
          currency:       "usd",
          customer:       r.stripe_customer_id,
          payment_method: r.stripe_payment_method_id,
          off_session:    true,
          confirm:        true,
          description:    `Weekly rental — ${r.clientes?.nombre ?? ""}`,
        });

        const nextDate = calcNextWeek(r.proxima_renta);

        await supabase.from("alquileres").update({
          ultima_renta_pagada: today,
          proxima_renta:       nextDate,
          semanas_pagadas:     (r.semanas_pagadas ?? 0) + 1,
          total_pagado:        Number(r.total_pagado ?? 0) + renta,
        }).eq("id", r.id);

        await supabase.from("alquiler_pagos").insert({
          alquiler_id: r.id,
          fecha:       today,
          monto:       renta,
          tipo:        "renta",
          metodo:      "tarjeta",
          estado:      "pagado",
          notas:       `Auto-charged $${renta.toFixed(2)} · PI ${pi.id} · next ${nextDate}`,
        });

        results.push({ id: r.id, ok: true, msg: `$${renta.toFixed(2)} charged · ${pi.id}` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);

        await supabase.from("alquiler_pagos").insert({
          alquiler_id: r.id,
          fecha:       today,
          monto:       renta,
          tipo:        "renta",
          metodo:      "tarjeta",
          estado:      "cobro_fallido",
          notas:       `Charge failed: ${msg}`,
        });

        // Missed payment -> flag for repossession
        await supabase.from("alquileres").update({ estado: "atrasado" }).eq("id", r.id);

        results.push({ id: r.id, ok: false, msg });
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

/* ── Advance date by 1 week ── */
function calcNextWeek(current: string | null): string {
  const base = (current ?? new Date().toISOString().slice(0, 10)) + "T00:00:00";
  const d = new Date(base);
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
