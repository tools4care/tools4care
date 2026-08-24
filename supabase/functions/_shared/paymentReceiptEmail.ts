type PaymentReceiptEmailInput = {
  customerName?: string | null;
  amount: number;
  balanceAfter: number;
  reference: string;
  paymentChannel?: string;
  creditScore?: number | null;
  creditLimit?: number | null;
  availableCredit?: number | null;
  isTest?: boolean;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function detailRow(label: string, value: string, emphasize = false) {
  return `<tr>
    <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;">${escapeHtml(label)}</td>
    <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:${emphasize ? "#047857" : "#0f172a"};font-size:14px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
  </tr>`;
}

export function buildPaymentReceiptEmail(input: PaymentReceiptEmailInput) {
  const date = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "long",
    timeStyle: "short",
  });
  const customerName = escapeHtml(input.customerName || "Valued customer");
  const reference = String(input.reference || "—");
  const creditRows = [
    typeof input.creditScore === "number" && Number.isFinite(input.creditScore) ? detailRow("Credit score", String(input.creditScore)) : "",
    typeof input.creditLimit === "number" && Number.isFinite(input.creditLimit) ? detailRow("Credit limit", money(input.creditLimit)) : "",
    typeof input.availableCredit === "number" && Number.isFinite(input.availableCredit) ? detailRow("Available credit", money(input.availableCredit), true) : "",
  ].join("");
  const testBanner = input.isTest
    ? `<tr><td style="padding:0 32px 20px;"><div style="padding:12px 16px;border:1px solid #fbbf24;border-radius:10px;background:#fffbeb;color:#92400e;font-size:13px;font-weight:700;text-align:center;">TEST EMAIL — No card was charged and no account balance was changed.</div></td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:Arial,'Helvetica Neue',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Tools4Care payment of ${escapeHtml(money(input.amount))} was received and applied.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe4ee;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
        <tr><td style="height:6px;background:#2563eb;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 32px 20px;background:#0f172a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.04em;">TOOLS<span style="color:#60a5fa;">4</span>CARE</td>
            <td align="right" style="color:#94a3b8;font-size:12px;font-weight:700;letter-spacing:.08em;">PAYMENT RECEIPT</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:30px 32px 18px;text-align:center;">
          <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:24px;background:#dcfce7;color:#047857;font-size:27px;font-weight:800;">&#10003;</div>
          <h1 style="margin:14px 0 6px;color:#0f172a;font-size:26px;line-height:1.25;">Payment received</h1>
          <p style="margin:0;color:#64748b;font-size:14px;">Your payment was approved and applied to your account.</p>
          <p style="margin:18px 0 0;color:#2563eb;font-size:38px;line-height:1;font-weight:800;">${escapeHtml(money(input.amount))}</p>
        </td></tr>
        ${testBanner}
        <tr><td style="padding:4px 32px 28px;">
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Hello <strong>${customerName}</strong>,</p>
          <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">This email confirms that Tools4Care received your card payment. Your account balance was updated automatically.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #e2e8f0;">
            ${detailRow("Status", "Approved", true)}
            ${detailRow("Date", `${date} ET`)}
            ${detailRow("Payment method", input.paymentChannel || "Card")}
            ${detailRow("Remaining balance", money(input.balanceAfter), input.balanceAfter <= 0)}
            ${creditRows}
          </table>
          <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">
            <p style="margin:0 0 5px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Payment reference</p>
            <p style="margin:0;color:#334155;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.5;overflow-wrap:anywhere;word-break:break-all;">${escapeHtml(reference)}</p>
          </div>
        </td></tr>
        <tr><td style="padding:22px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 8px;color:#334155;font-size:13px;line-height:1.5;"><strong>Need help?</strong> Reply to this email or call <a href="tel:+19785941624" style="color:#2563eb;text-decoration:none;">(978) 594-1624</a>.</p>
          <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.5;">For your security, Tools4Care will never ask you to send your full card number by email. Keep this message as your payment confirmation.</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#94a3b8;font-size:11px;">Tools4Care &bull; Secure account payment notification</p>
    </td></tr>
  </table>
</body>
</html>`;
}
