const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const to: string = body.to;
    const subject: string = body.subject ?? "Invoice";
    const html: string | undefined = body.html;

    if (!to || !html) {
      return new Response(
        JSON.stringify({ ok: false, error: "`to` and `html` are required" }),
        { status: 400, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM_ADDR = Deno.env.get("RESEND_FROM") || Deno.env.get("EMAIL_FROM") || "noreply@tools4care.com";
    const FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") || "Tools4Care";
    const FROM = `${FROM_NAME} <${FROM_ADDR}>`;

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(
        JSON.stringify({ ok: false, error: data?.message || "Failed to send email" }),
        { status: 500, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: data.id }),
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
