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

function stripPseudoHeaders(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/^\s*(MIME-Version|Content-Type|Content-Transfer-Encoding):[^\r\n]*\r?\n/gi, "")
    .replace(/^\s*--[-\w=]+(?:\r?\n|$)/gim, "")
    .trimStart();
}

// Chunk base64 in 76-char lines (RFC 2045)
function chunkBase64(b64: string): string {
  return b64.match(/.{1,76}/g)?.join("\r\n") ?? b64;
}

// Build a full multipart/mixed MIME message with optional PDF attachments
function buildMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; base64: string }>;
}): string {
  const { from, to, subject, html, attachments } = opts;
  const boundary = `=_boundary_${crypto.randomUUID().replace(/-/g, "")}`;

  const lines: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    html,
    ``,
  ];

  for (const att of attachments ?? []) {
    lines.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      ``,
      chunkBase64(att.base64),
      ``,
    );
  }

  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const to: string = body.to;
    const subject: string = body.subject ?? "Invoice";
    const htmlRaw: string | undefined = body.html;
    const attachments: Array<{ filename: string; base64: string }> | undefined = body.attachments;

    if (!to || !htmlRaw) {
      return new Response(
        JSON.stringify({ ok: false, error: "`to` and `html` are required" }),
        { status: 400, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }

    const SMTP_HOST = Deno.env.get("SMTP_HOST")!;
    const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const SMTP_USER = Deno.env.get("SMTP_USER")!;
    const SMTP_PASS = Deno.env.get("SMTP_PASS")!;
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

    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    if (hasAttachments) {
      // Send via low-level SMTP with raw MIME to support PDF attachments
      const html = stripPseudoHeaders(String(htmlRaw));
      const mime = buildMimeMessage({ from: FROM, to, subject, html, attachments });

      // Access private smtp methods at runtime (they exist on the object)
      const c = client as any;
      await c.writeCmd(`MAIL FROM:<${FROM_ADDR}>`);
      await c.assertCode(await c.readCmd(), 250);
      await c.writeCmd(`RCPT TO:<${to}>`);
      await c.assertCode(await c.readCmd(), 250);
      await c.writeCmd("DATA");
      await c.assertCode(await c.readCmd(), 354);
      // Dot-stuff: lines starting with "." must be doubled
      const stuffed = mime.replace(/^\.$/gm, "..");
      await c.writeCmd(stuffed);
      await c.writeCmd(".");
      await c.assertCode(await c.readCmd(), 250);
    } else {
      // Simple HTML email — use library directly
      const html = stripPseudoHeaders(String(htmlRaw));
      await client.send({ from: FROM, to, subject, html });
    }

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
