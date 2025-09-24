// --- Polyfill: Deno.writeAll (smtp@v0.7.0 en Deno 2) ---
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
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "*",
};

// Quita cabeceras que a veces vienen pegadas en el cuerpo por error
function stripPseudoHeaders(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/^\uFEFF/, "") // BOM
    .replace(/^\s*(MIME-Version|Content-Type|Content-Transfer-Encoding):[^\r\n]*\r?\n/gi, "")
    .replace(/^\s*--[-\w=]+(?:\r?\n|$)/gim, "")
    .trimStart();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const to: string = body.to;
    const subject: string = body.subject ?? "Order confirmation";
    const htmlRaw: string | undefined = body.html;

    if (!to || !htmlRaw) {
      return new Response(
        JSON.stringify({ ok: false, error: "`to` and `html` are required" }),
        { status: 400, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }

    // Secrets (Supabase Dashboard → Edge Functions → Secrets)
    const SMTP_HOST = Deno.env.get("SMTP_HOST")!;      // p.ej. "smtp.gmail.com"
    const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const SMTP_USER = Deno.env.get("SMTP_USER")!;      // tu Gmail completo
    const SMTP_PASS = Deno.env.get("SMTP_PASS")!;      // App Password (16 chars)
    const FROM_ADDR = Deno.env.get("EMAIL_FROM") || SMTP_USER;
    const FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") || "Tools4care";
    const FROM = `${FROM_NAME} <${FROM_ADDR}>`;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return new Response(
        JSON.stringify({ ok: false, error: "SMTP not configured" }),
        { status: 500, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }

    const client = new SmtpClient();
    await client.connectTLS({
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      username: SMTP_USER,
      password: SMTP_PASS,
    });

    // 👇 Enviamos SOLO HTML; NADA de "MIME-Version"/"Content-Type" dentro del cuerpo.
    const html = stripPseudoHeaders(String(htmlRaw));

    await client.send({
      from: FROM,
      to,
      subject,
      // la librería admite el campo `html` para enviar texto/html correctamente
      html,
    });

    await client.close();

    return new Response(
      JSON.stringify({ ok: true, id: crypto.randomUUID() }),
      { status: 200, headers: { "content-type": "application/json", ...corsHeaders } },
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 500, headers: { "content-type": "application/json", ...corsHeaders } },
    );
  }
});
