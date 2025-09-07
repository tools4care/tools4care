// supabase/functions/send-order-email/index.ts
// Gmail SMTP (App Password) + polyfill de Deno.writeAll

// --- Polyfill: Deno.writeAll (necesario para la lib smtp en Deno 2) ---
if (typeof (Deno as any).writeAll !== "function") {
  (Deno as any).writeAll = async (writer: Deno.Writer, data: Uint8Array) => {
    let offset = 0;
    while (offset < data.length) {
      const n = await writer.write(data.subarray(offset));
      if (!Number.isFinite(n) || n <= 0) throw new Error("write failed");
      offset += n;
    }
  };
}

import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const to: string = body.to;
    const subject: string = body.subject ?? "Order confirmation";
    const text: string = body.text ?? "Thanks for your order!";
    const html: string | undefined = body.html;

    if (!to) {
      return new Response(JSON.stringify({ ok: false, error: "`to` is required" }), {
        status: 400,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
    }

    // Secrets (ya cargadas en Supabase -> Edge Functions -> Secrets)
    const SMTP_HOST = Deno.env.get("SMTP_HOST")!;      // "smtp.gmail.com"
    const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const SMTP_USER = Deno.env.get("SMTP_USER")!;      // tu Gmail completo
    const SMTP_PASS = Deno.env.get("SMTP_PASS")!;      // App Password (16 chars, sin espacios)
    const FROM_ADDR = Deno.env.get("EMAIL_FROM") || SMTP_USER;
    const FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") || "Tools4care";
    const FROM = `${FROM_NAME} <${FROM_ADDR}>`;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return new Response(JSON.stringify({ ok: false, error: "SMTP not configured" }), {
        status: 500,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
    }

    const mimeBody =
      html
        ? `MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8

${html}`
        : `MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8

${text}`;

    const client = new SmtpClient();

    // Gmail con TLS en 465
    await client.connectTLS({
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      username: SMTP_USER,
      password: SMTP_PASS,
    });

    await client.send({
      from: FROM,
      to,
      subject,
      content: mimeBody,
    });

    await client.close();

    return new Response(
      JSON.stringify({ ok: true, id: crypto.randomUUID() }),
      { status: 200, headers: { "content-type": "application/json", ...corsHeaders } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }
});
