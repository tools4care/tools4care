import { loadPdfLibs } from "../utils/lazyPdf";

const amount = (value) => Number(value || 0);
const roundMoney = (value) => Number(amount(value).toFixed(2));
const currency = (value) => `$${amount(value).toFixed(2)}`;
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function closeoutPaymentRows(report) {
  const system = report?.system_summary?.system_payments || {};
  const declared = report?.declared_totals || {};
  const variances = report?.variances || {};
  return [
    { key: "cash", label: "Cash", system: amount(report?.system_summary?.expected_cash), declared: amount(declared.cash), variance: amount(variances.cash) },
    { key: "card", label: "Card", system: amount(system.card), declared: amount(declared.card), variance: amount(variances.card) },
    { key: "transfer", label: "Transfer", system: amount(system.transfer), declared: amount(declared.transfer), variance: amount(variances.transfer) },
    { key: "other", label: "Check / Other", system: amount(system.other), declared: amount(declared.other), variance: amount(variances.other) },
  ];
}

export function closeoutHasVariance(variances, tolerance = 0.009) {
  return ["cash", "card", "transfer", "other"]
    .some((key) => Math.abs(amount(variances?.[key])) > tolerance);
}

export function buildStoreCloseoutThermalHtml(report, { reprint = false } = {}) {
  const summary = report?.system_summary || {};
  const breakdown = summary.payment_breakdown || {};
  const rows = closeoutPaymentRows(report);
  const isReprint = reprint || amount(report?.print_count) > 0;
  const opened = report?.opened_at ? new Date(report.opened_at).toLocaleString("en-US") : "—";
  const closed = report?.closed_at ? new Date(report.closed_at).toLocaleString("en-US") : "—";
  const statusLabel = report?.status === "adjusted" ? "ADJUSTED AFTER CLOSE" : report?.status === "reopened" ? "REOPENED" : "FINAL";
  const methodRows = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.label)}</td>
      <td class="num">${currency(row.system)}</td>
      <td class="num">${currency(row.declared)}</td>
      <td class="num ${Math.abs(row.variance) > 0.009 ? "warn" : ""}">${currency(row.variance)}</td>
    </tr>`).join("");

  const paymentDetailRows = [
    ["Cash", breakdown.cash],
    ["Card", breakdown.card],
    ["Transfer", breakdown.transfer],
    ["Check / Other", breakdown.other],
  ].map(([label, data]) => `
    <tr><td>${label}</td><td class="num">${currency(data?.gross)}</td><td class="num">-${currency(data?.refunds)}</td><td class="num">${currency(data?.ar)}</td><td class="num">${currency(data?.net)}</td></tr>`).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(report?.report_number || "Store closeout")}</title>
<style>
@page{size:80mm auto;margin:2mm 3mm}*{box-sizing:border-box}body{width:74mm;margin:0;font-family:"Courier New",monospace;font-size:10px;color:#000}.center{text-align:center}.bold{font-weight:900}.num{text-align:right;white-space:nowrap}.title{font-size:17px;letter-spacing:1px}.small{font-size:8px}.line{border-top:1px dashed #000;margin:5px 0}.double{border-top:2px solid #000;margin:6px 0}.badge{border:2px solid #000;padding:3px;text-align:center;font-weight:900;margin:4px 0}.warn{font-weight:900;text-decoration:underline}table{width:100%;border-collapse:collapse}th,td{padding:2px 1px;border-bottom:1px dotted #aaa}th{font-size:8px;text-transform:uppercase}.section{font-weight:900;text-transform:uppercase;margin-top:6px}.signature{margin-top:14px;border-top:1px solid #000;padding-top:2px}.cut{height:16mm}
</style></head><body>
<div class="center title bold">TOOLS4CARE</div>
<div class="center bold">SHIFT CLOSEOUT</div>
<div class="badge">${escapeHtml(statusLabel)}${isReprint ? " · REPRINT" : ""}</div>
<div class="center">${escapeHtml(report?.location_name || "Physical Store")}</div>
<div class="double"></div>
<div><b>Report:</b> ${escapeHtml(report?.report_number || "—")}</div>
<div><b>Register:</b> ${escapeHtml(report?.register_name || "—")}</div>
<div><b>Cashier:</b> ${escapeHtml(report?.cashier_name || "—")}</div>
<div><b>Closed by:</b> ${escapeHtml(report?.closed_by_name || "—")}</div>
<div><b>Opened:</b> ${escapeHtml(opened)}</div>
<div><b>Closed:</b> ${escapeHtml(closed)}</div>

<div class="section">Sales</div>
<div class="line"></div>
<div>Completed sales <span style="float:right">${amount(summary.completed_sales_count)}</span></div>
<div>Returns <span style="float:right">${amount(summary.return_count)}</span></div>
<div>Gross sales <span style="float:right">${currency(summary.gross_sales)}</span></div>
<div>Refunds <span style="float:right">-${currency(summary.refund_total)}</span></div>
<div>Discounts <span style="float:right">-${currency(summary.discounts)}</span></div>
<div>Tax collected <span style="float:right">${currency(summary.tax_net)}</span></div>
<div class="bold">Net sales <span style="float:right">${currency(summary.net_sales)}</span></div>

<div class="section">Payment activity</div>
<table><thead><tr><th>Method</th><th class="num">Gross</th><th class="num">Refund</th><th class="num">A/R</th><th class="num">Net</th></tr></thead><tbody>${paymentDetailRows}</tbody></table>

<div class="section">Reconciliation</div>
<table><thead><tr><th>Method</th><th class="num">System</th><th class="num">Counted</th><th class="num">Diff</th></tr></thead><tbody>${methodRows}</tbody></table>
${report?.card_batch_reference ? `<div><b>Card batch:</b> ${escapeHtml(report.card_batch_reference)}</div>` : ""}

<div class="section">Cash drawer</div>
<div class="line"></div>
<div>Opening float <span style="float:right">${currency(summary.opening_float)}</span></div>
<div>Cash received <span style="float:right">${currency(breakdown.cash?.gross)}</span></div>
<div>Cash refunds <span style="float:right">-${currency(breakdown.cash?.refunds)}</span></div>
<div>A/R cash <span style="float:right">${currency(breakdown.cash?.ar)}</span></div>
<div>Deposits <span style="float:right">${currency(summary.manual_deposits)}</span></div>
<div>Withdrawals <span style="float:right">-${currency(summary.withdrawals)}</span></div>
<div>Expenses <span style="float:right">-${currency(summary.expenses)}</span></div>
<div class="bold">Expected cash <span style="float:right">${currency(summary.expected_cash)}</span></div>
<div class="bold">Counted cash <span style="float:right">${currency(report?.declared_totals?.cash)}</span></div>
<div class="bold ${Math.abs(amount(report?.variances?.cash)) > 0.009 ? "warn" : ""}">Cash difference <span style="float:right">${currency(report?.variances?.cash)}</span></div>

${report?.notes ? `<div class="section">Notes</div><div>${escapeHtml(report.notes)}</div>` : ""}
${report?.status === "adjusted" ? `<div class="badge">LATE TRANSACTION ADDED<br>REVIEW AND REPRINT REQUIRED</div>` : ""}
<div class="signature">Cashier signature</div>
<div class="signature">Supervisor signature</div>
<div class="center small" style="margin-top:10px">Close version ${amount(report?.close_version)} · Copies ${amount(report?.print_count) + 1}</div>
<div class="center small">Keep this report with the drawer deposit.</div>
<div class="cut"></div>
</body></html>`;
}

export function printStoreCloseoutThermal(report, options = {}) {
  if (typeof document === "undefined") return false;
  const html = buildStoreCloseoutThermalHtml(report, options);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => iframe.remove(), 2500);
      }
    }, 200);
  };
  return true;
}

export async function downloadStoreCloseoutPdf(report) {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const summary = report?.system_summary || {};
  const rows = closeoutPaymentRows(report);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Tools4Care — Shift Closeout", 14, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${report?.location_name || "Physical Store"} · ${report?.register_name || "Store Register"}`, 14, 25);
  doc.text(`Report ${report?.report_number || "—"} · Version ${amount(report?.close_version)}`, 14, 31);
  doc.text(`Cashier: ${report?.cashier_name || "—"} · Closed by: ${report?.closed_by_name || "—"}`, 14, 37);
  doc.text(`Opened: ${report?.opened_at ? new Date(report.opened_at).toLocaleString() : "—"}`, 14, 43);
  doc.text(`Closed: ${report?.closed_at ? new Date(report.closed_at).toLocaleString() : "—"}`, 14, 49);

  autoTable(doc, {
    startY: 57,
    head: [["Sales summary", "Amount"]],
    body: [
      ["Gross sales", currency(summary.gross_sales)],
      ["Refunds", `-${currency(summary.refund_total)}`],
      ["Discounts", `-${currency(summary.discounts)}`],
      ["Tax collected", currency(summary.tax_net)],
      ["Net sales", currency(summary.net_sales)],
      ["Completed sales / Returns", `${amount(summary.completed_sales_count)} / ${amount(summary.return_count)}`],
    ],
    theme: "grid",
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [["Method", "System", "Counted / verified", "Difference"]],
    body: rows.map((row) => [row.label, currency(row.system), currency(row.declared), currency(row.variance)]),
    theme: "grid",
  });
  let y = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.text(`Card batch reference: ${report?.card_batch_reference || "—"}`, 14, y);
  y += 8;
  doc.text("Notes", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(report?.notes || "No closing notes.", 14, y + 6, { maxWidth: 180 });
  doc.line(14, 250, 85, 250);
  doc.line(115, 250, 196, 250);
  doc.text("Cashier signature", 14, 256);
  doc.text("Supervisor signature", 115, 256);
  doc.save(`${report?.report_number || "store-closeout"}.pdf`);
}

export const storeCloseoutMoney = {
  amount,
  currency,
  roundMoney,
};
