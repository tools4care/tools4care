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

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

function stripPseudoHeaders(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/^﻿/, "")
    .replace(/^\s*(MIME-Version|Content-Type|Content-Transfer-Encoding):[^\r\n]*\r?\n/gi, "")
    .replace(/^\s*--[-\w=]+(?:\r?\n|$)/gim, "")
    .trimStart();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const to: string = body.to;
    const subject: string = body.subject ?? "Invoice";
    const htmlRaw: string | undefined = body.html;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    // Lets a tenant's invoice show up as coming from their own business
    // ("Barber King via Tools4Care") while the message still sends through
    // Tools4Care's own verified SMTP account — a tenant's own domain in the
    // From address would fail SPF/DKIM and land in spam. Replies go to the
    // tenant's own inbox via replyTo instead.
    const fromNameRaw: string | undefined = body.fromName;
    const replyToRaw: string | undefined = body.replyTo;

    const email = String(to || "").trim();
    const cleanSubject = String(subject || "Invoice").trim();
    if (!email || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) {
      return new Response(
        JSON.stringify({ ok: false, error: "A single valid recipient email is required" }),
        { status: 400, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }
    if (!htmlRaw || String(htmlRaw).length > 300_000) {
      return new Response(
        JSON.stringify({ ok: false, error: "`html` is required and must be under 300 KB" }),
        { status: 400, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }
    if (!cleanSubject || cleanSubject.length > 180 || /[\r\n]/.test(cleanSubject)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid subject" }),
        { status: 400, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }
    if (attachments.length > 3 || attachments.some((a: any) => !a?.filename || !a?.contentBase64 || String(a.contentBase64).length > 8_000_000)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid or oversized email attachment" }), {
        status: 400, headers: { "content-type": "application/json", ...corsHeaders },
      });
    }

    const SMTP_HOST = Deno.env.get("SMTP_HOST")!;
    const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const SMTP_USER = Deno.env.get("SMTP_USER")!;
    const SMTP_PASS = Deno.env.get("SMTP_PASS")!;
    const FROM_ADDR = Deno.env.get("EMAIL_FROM") || SMTP_USER;
    const FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") || "Tools4care";

    const cleanFromName = String(fromNameRaw || "").replace(/[\r\n<>"]/g, "").trim().slice(0, 78);
    const displayName = cleanFromName && cleanFromName.toLowerCase() !== FROM_NAME.toLowerCase()
      ? `${cleanFromName} via ${FROM_NAME}`
      : FROM_NAME;
    const FROM = `${displayName} <${FROM_ADDR}>`;

    const cleanReplyTo = String(replyToRaw || "").trim();
    const replyTo = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(cleanReplyTo) ? cleanReplyTo : undefined;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return new Response(
        JSON.stringify({ ok: false, error: "SMTP not configured", host: !!SMTP_HOST, user: !!SMTP_USER, pass: !!SMTP_PASS }),
        { status: 500, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }

    console.log(`SMTP connect → ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);

    const html = stripPseudoHeaders(String(htmlRaw));

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true,
        auth: { username: SMTP_USER, password: SMTP_PASS },
      },
    });

    await client.send({
      from: FROM,
      to: email,
      ...(replyTo ? { replyTo } : {}),
      subject: cleanSubject,
      // Send raw UTF-8 MIME parts so mail clients do not expose quoted-
      // printable tokens such as =20 and =2E in the visible HTML.
      mimeContent: [
        { mimeType: 'text/plain; charset="utf-8"', content: "Tools4Care report attached.", transferEncoding: "8bit" },
        { mimeType: 'text/html; charset="utf-8"', content: html, transferEncoding: "8bit" },
      ],
      attachments: attachments.map((attachment: any) => ({
        filename: String(attachment.filename).slice(0, 180),
        content: String(attachment.contentBase64),
        contentType: String(attachment.contentType || "application/octet-stream").slice(0, 100),
        encoding: "base64",
      })),
    });
    await client.close();

    console.log(`Email sent to ${to}`);
    return new Response(
      JSON.stringify({ ok: true, id: crypto.randomUUID() }),
      { status: 200, headers: { "content-type": "application/json", ...corsHeaders } },
    );
  } catch (err: any) {
    console.error("SMTP error:", err?.message || err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 500, headers: { "content-type": "application/json", ...corsHeaders } },
    );
  }
});
