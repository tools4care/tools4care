// supabase/functions/send-order-email/index.ts
// Gmail SMTP (App Password) + polyfill Deno.writeAll + limpieza de texto

// --- Polyfill para Deno 2 (requerido por deno_smtp 0.7.0) ---
if (typeof (Deno as any).writeAll !== "function") {
  (Deno as any).writeAll = async (writer: Deno.Writer, data: Uint8Array) => {
    let off = 0;
    while (off < data.length) {
      const n = await writer.write(data.subarray(off));
      if (!Number.isFinite(n) || n <= 0) throw new Error("write failed");
      off += n;
    }
  };
}

import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "*",
  "content-type": "application/json",
};

// Quita cabeceras pegadas por error en el cuerpo (texto o html)
function stripHeaderLines(s?: string): string | undefined {
  if (!s) return undefined;
  return s
    .replace(
      /^\s*(?:MIME-Version:.*\r?\n|Content-Type:.*\r?\n|Content-Transfer-Encoding:.*\r?\n)+/gim,
      "",
    )
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Puede ser string o array; normalizamos a array
    const toRaw = body.to;
    const to: string[] = Array.isArray(toRaw)
      ? toRaw.filter(Boolean)
      : [String(toRaw || "")].filter(Boolean);

    const subject: string = body.subject ?? "Order confirmation";
    const textIn: string | undefined = body.text;
    const htmlIn: string | undefined = body.html;

    if (!to.length) {
      return new Response(
        JSON.stringify({ ok: false, error: "`to` is required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Limpiamos por si alguien pegó cabeceras en el cuerpo
    const text = stripHeaderLines(textIn);
    const html = stripHeaderLines(htmlIn);

    // --- Secrets / configuración ---
    const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
    // Si no te pasan puerto, asumimos 465 (TLS). Puedes poner 587 para STARTTLS.
    const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const SMTP_USER = Deno.env.get("SMTP_USER")!;
    const SMTP_PASS = Deno.env.get("SMTP_PASS")!;
    const FROM_ADDR = Deno.env.get("EMAIL_FROM") || SMTP_USER;
    const FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") || "Tools4care";
    const FROM = `${FROM_NAME} <${FROM_ADDR}>`;

    if (!SMTP_USER || !SMTP_PASS) {
      return new Response(
        JSON.stringify({ ok: false, error: "SMTP not configured" }),
        { status: 500, headers: corsHeaders },
      );
    }

    const client = new SmtpClient();

    // Preferimos TLS 465; si falla, intentamos 587 STARTTLS automáticamente
    let connected = false;
    try {
      await client.connectTLS({
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        username: SMTP_USER,
        password: SMTP_PASS,
      });
      connected = true;
    } catch {
      // Fallback STARTTLS en 587
      try {
        await client.connect({
          hostname: SMTP_HOST,
          port: 587,
          username: SMTP_USER,
          password: SMTP_PASS,
        });
        await client.startTLS();
        connected = true;
      } catch (e) {
        await client.close().catch(() => {});
        throw e;
      }
    }

    if (!connected) throw new Error("SMTP connection failed");

    // Construimos el mensaje: si hay html lo mandamos en 'html' (correcto)
    // y añadimos 'content' (texto plano) solo si existe
    const msg: {
      from: string;
      to: string | string[];
      subject: string;
      content?: string;
      html?: string;
    } = {
      from: FROM,
      to,
      subject,
    };

    if (html) msg.html = html;
    if (text) msg.content = text;
    if (!html && !text) msg.content = "Thanks for your order!";

    await client.send(msg);
    await client.close().catch(() => {});

    return new Response(
      JSON.stringify({ ok: true, id: crypto.randomUUID() }),
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    console.error("[send-order-email] error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 500, headers: corsHeaders },
    );
  }
});
