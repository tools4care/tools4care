// Shared "Daily Closeout Command Center" PDF renderer.
// Used by CierreVan.jsx (live closeout) and PreCierreVan.jsx (Search Closures
// preview) so both flows produce the exact same report, whether or not the
// period was actually closed (real cash count / variance may be unknown).

const NOTE_REQUIRED_DISCREPANCY = 1;

export const fmtCurrency = (n) => {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * @param {import('jspdf').jsPDF} doc
 * @param {Function} autoTable
 * @param {{
 *   fechasLabel: string,
 *   docTitleDate: string,
 *   vanLabel: string,
 *   locationTypeLabel?: string,
 *   reportTitle?: string,
 *   expenseLabel?: string,
 *   countedByLabel?: string,
 *   userLabel: string,
 *   totales: { totalVentas:number, totalCaja:number, totalEfectivo:number, totalTarjeta:number, totalTransferencia:number, totalOtros:number, totalCajaNeto:number, efectivoNeto:number, gastosTotal:number },
 *   real: { cash:?number, card:?number, transfer:?number, other:?number, total:?number } | null,
 *   variance: ?number,
 *   cxc: { deudaNueva:number, pagosDeuda:number, reducciones:number, cambioNeto:number },
 *   salesCount: number,
 *   gastos: Array<{fecha:string, categoria:string, descripcion:string, monto:number, factura_url?:string}>,
 *   topCustomers: Array<{name:string, sales:number, paid:number, count:number}>,
 *   largeTransactions: Array<{created_at:string, cliente:string, tipo:'sale'|'payment', metodo:string, monto:number}>,
 *   observaciones: string,
 * }} input
 */
export function renderCloseoutPdfReport(doc, autoTable, input) {
  const {
    fechasLabel, docTitleDate, vanLabel, userLabel,
    totales, real, variance, cxc, salesCount,
    gastos, topCustomers, largeTransactions, observaciones,
  } = input;
  const locationTypeLabel = input.locationTypeLabel || "VAN";
  const reportTitle = input.reportTitle || "Van Closeout";
  const expenseLabel = input.expenseLabel || "Driver expenses";
  const countedByLabel = input.countedByLabel || "driver/admin";

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const generatedAt = new Date().toLocaleString();
  const closed = real != null && real.total != null;
  const totalReal = closed ? real.total : null;
  const avgSale = salesCount ? totales.totalVentas / salesCount : 0;
  const totalPayments = totales.totalCaja;
  const collectionRate = totales.totalVentas > 0 ? (totalPayments / totales.totalVentas) * 100 : 0;
  const expenseRate = totales.totalCaja > 0 ? (totales.gastosTotal / totales.totalCaja) * 100 : 0;

  // `variance` is signed: positive = counted more than expected (over),
  // negative = counted less (short). Magnitude checks must use the absolute
  // value, or a shortage (always <= 0.01) would misreport as "Balanced".
  const absVariance = variance == null ? null : Math.abs(variance);
  const isOver = variance != null && variance > 0.005;
  const isShort = variance != null && variance < -0.005;
  const varianceText = variance == null ? "—" : `${isOver ? "+" : isShort ? "-" : ""}${fmtCurrency(absVariance)}`;

  const status = variance == null
    ? "Not yet closed"
    : absVariance <= 0.01
      ? "Balanced"
      : isOver
        ? (absVariance < NOTE_REQUIRED_DISCREPANCY ? "Minor overage" : "Over — needs review")
        : (absVariance < NOTE_REQUIRED_DISCREPANCY ? "Minor shortage" : "Short — needs review");
  const statusColor = variance == null
    ? [100, 116, 139]
    : absVariance <= 0.01
      ? [22, 163, 74]
      : isOver
        ? [217, 119, 6]
        : absVariance < NOTE_REQUIRED_DISCREPANCY ? [217, 119, 6] : [220, 38, 38];

  const recommendations = [];
  if (!closed) {
    recommendations.push("This is a live preview — the period has not been officially closed, so real cash count and variance are not recorded.");
  }
  if (variance != null && absVariance >= NOTE_REQUIRED_DISCREPANCY) {
    recommendations.push(`${isOver ? "Overage" : "Shortage"} of ${fmtCurrency(absVariance)} requires review against receipts and counted money.`);
  }
  if (totales.gastosTotal > 0) {
    recommendations.push(`Confirm ${fmtCurrency(totales.gastosTotal)} in ${expenseLabel.toLowerCase()} and receipt photos before final filing.`);
  }
  if (cxc.cambioNeto > 0) {
    recommendations.push(`A/R increased by ${fmtCurrency(cxc.cambioNeto)}. Follow up on customers with new balance.`);
  }
  if (collectionRate < 75 && totales.totalVentas > 0) {
    recommendations.push(`Collections were ${collectionRate.toFixed(1)}% of sales. Review credit exposure.`);
  }
  if (recommendations.length === 0) {
    recommendations.push("Closeout is clean. File report with receipts and continue normal operations.");
  }

  const addFooter = () => {
    const page = doc.internal.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated ${generatedAt}`, margin, pageHeight - 8);
    doc.text(`Tools4Care Financial System - Page ${page}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  };

  const ensureSpace = (y, needed = 32) => {
    if (y + needed <= pageHeight - 18) return y;
    addFooter();
    doc.addPage();
    return 18;
  };

  const sectionHeader = (title, y, color = [30, 64, 175]) => {
    y = ensureSpace(y, 18);
    doc.setFillColor(...color);
    doc.roundedRect(margin, y, contentWidth, 9, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title, margin + 4, y + 6.2);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    return y + 13;
  };

  const metricCard = (x, y, w, title, value, note, color = [30, 64, 175]) => {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, w, 25, 3, 3, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(title.toUpperCase(), x + 4, y + 6);
    doc.setTextColor(...color);
    doc.setFontSize(13);
    doc.text(String(value), x + 4, y + 15);
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(String(note || ""), x + 4, y + 21, { maxWidth: w - 8 });
  };

  const moneyTableStyles = {
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  };

  doc.setProperties({
    title: `Tools4Care ${reportTitle} ${docTitleDate || ""}`,
    subject: `Daily ${reportTitle.toLowerCase()} report`,
    author: "Tools4Care",
  });

  const drawDashboardCard = (x, y, w, h, label, value, helper, color = [37, 99, 235]) => {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, h, 4, 4, "FD");
    doc.setFillColor(...color);
    doc.roundedRect(x, y, 3, h, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(String(label).toUpperCase(), x + 7, y + 7);
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x + 7, y + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(String(helper || ""), x + 7, y + 27, { maxWidth: w - 12 });
  };

  const drawProgress = (x, y, w, label, value, total, color) => {
    const pct = total > 0 ? Math.max(0, Math.min(1, Number(value || 0) / total)) : 0;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(label, x, y);
    doc.text(fmtCurrency(value), x + w, y, { align: "right" });
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(x, y + 3, w, 4, 2, 2, "F");
    doc.setFillColor(...color);
    doc.roundedRect(x, y + 3, w * pct, 4, 2, 2, "F");
  };

  const dashboardTop = 0;
  doc.setFillColor(8, 15, 33);
  doc.rect(0, dashboardTop, pageWidth, 36, "F");
  doc.setFillColor(...statusColor);
  doc.rect(0, dashboardTop, 8, 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("Daily Closeout Command Center", margin, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text(`${fechasLabel}  |  ${locationTypeLabel} ${vanLabel}  |  ${userLabel}`, margin, 22);
  doc.setFillColor(...statusColor);
  doc.roundedRect(pageWidth - 62, 10, 48, 16, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(status.toUpperCase(), pageWidth - 38, 20, { align: "center" });

  let dashY = 43;
  const dashGap = 6;
  const dashCardW = (contentWidth - dashGap * 3) / 4;
  drawDashboardCard(margin, dashY, dashCardW, 28, "System collected", fmtCurrency(totales.totalCaja), `${collectionRate.toFixed(1)}% of sales collected`, [37, 99, 235]);
  drawDashboardCard(margin + (dashCardW + dashGap), dashY, dashCardW, 28, "Real counted", closed ? fmtCurrency(totalReal) : "—", closed ? "Manual counted money entered" : "Not recorded for this report", [5, 150, 105]);
  drawDashboardCard(margin + (dashCardW + dashGap) * 2, dashY, dashCardW, 28, "Over / short", varianceText, status, statusColor);
  drawDashboardCard(margin + (dashCardW + dashGap) * 3, dashY, dashCardW, 28, "Net cash turn-in", fmtCurrency(totales.efectivoNeto), `Cash minus ${fmtCurrency(totales.gastosTotal)} expenses`, [79, 70, 229]);

  dashY += 36;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, dashY, contentWidth * 0.52, 66, 5, 5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Money Flow", margin + 6, dashY + 9);
  drawProgress(margin + 6, dashY + 19, contentWidth * 0.52 - 12, "Cash", totales.totalEfectivo, Math.max(1, totales.totalCaja), [34, 197, 94]);
  drawProgress(margin + 6, dashY + 32, contentWidth * 0.52 - 12, "Card", totales.totalTarjeta, Math.max(1, totales.totalCaja), [99, 102, 241]);
  drawProgress(margin + 6, dashY + 45, contentWidth * 0.52 - 12, "Transfer", totales.totalTransferencia, Math.max(1, totales.totalCaja), [14, 165, 233]);
  drawProgress(margin + 6, dashY + 58, contentWidth * 0.52 - 12, "Other / check", totales.totalOtros, Math.max(1, totales.totalCaja), [245, 158, 11]);

  const rightX = margin + contentWidth * 0.55;
  const rightW = contentWidth * 0.45;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(rightX, dashY, rightW, 66, 5, 5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("A/R and Control Signals", rightX + 6, dashY + 9);
  const signalRows = [
    ["New A/R", fmtCurrency(cxc.deudaNueva), cxc.deudaNueva > 0 ? [217, 119, 6] : [5, 150, 105]],
    ["A/R collected", fmtCurrency(cxc.pagosDeuda), [5, 150, 105]],
    ["Net A/R change", `${cxc.cambioNeto >= 0 ? "+" : ""}${fmtCurrency(cxc.cambioNeto)}`, cxc.cambioNeto > 0 ? [217, 119, 6] : [5, 150, 105]],
    [expenseLabel, fmtCurrency(totales.gastosTotal), totales.gastosTotal > 0 ? [234, 88, 12] : [5, 150, 105]],
  ];
  signalRows.forEach((row, index) => {
    const rowY = dashY + 20 + index * 11;
    doc.setFillColor(...row[2]);
    doc.circle(rightX + 8, rowY - 1.5, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(row[0], rightX + 14, rowY);
    doc.setTextColor(...row[2]);
    doc.text(row[1], rightX + rightW - 6, rowY, { align: "right" });
  });

  dashY += 76;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, dashY, contentWidth * 0.5 - 3, 42, 5, 5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Top Customers Today", margin + 6, dashY + 9);
  topCustomers.slice(0, 4).forEach((c, index) => {
    const lineY = dashY + 17 + index * 6;
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`${index + 1}. ${c.name}`.slice(0, 42), margin + 6, lineY);
    doc.setFont("helvetica", "bold");
    doc.text(fmtCurrency(c.sales), margin + contentWidth * 0.5 - 10, lineY, { align: "right" });
    doc.setFont("helvetica", "normal");
  });

  const actionX = margin + contentWidth * 0.5 + 3;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(actionX, dashY, contentWidth * 0.5 - 3, 42, 5, 5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Action Queue", actionX + 6, dashY + 9);
  recommendations.slice(0, 4).forEach((item, index) => {
    const lines = doc.splitTextToSize(item, contentWidth * 0.5 - 18);
    const lineY = dashY + 17 + index * 6;
    doc.setFontSize(7);
    doc.setTextColor(index === 0 && status !== "Balanced" ? 185 : 71, index === 0 && status !== "Balanced" ? 28 : 85, index === 0 && status !== "Balanced" ? 28 : 105);
    doc.text(`${index + 1}. ${lines[0]}`, actionX + 6, lineY);
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Page 2 contains the accounting detail tables used to verify this dashboard.", margin, pageHeight - 8);
  doc.text(`Generated ${generatedAt}`, pageWidth - margin, pageHeight - 8, { align: "right" });

  doc.addPage();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 36, "F");
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 5, 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Tools4Care Daily Closeout", margin, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${fechasLabel} | ${locationTypeLabel} ${vanLabel} | ${userLabel}`, margin, 23);
  doc.text(`Report status: ${status}`, margin, 31);

  doc.setFillColor(...statusColor);
  doc.roundedRect(pageWidth - 58, 10, 44, 13, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(status, pageWidth - 36, 18.5, { align: "center" });

  let y = 45;
  const cardGap = 4;
  const cardW = (contentWidth - cardGap * 3) / 4;
  metricCard(margin, y, cardW, "System collected", fmtCurrency(totales.totalCaja), "Gross money in system", [37, 99, 235]);
  metricCard(margin + (cardW + cardGap), y, cardW, "Real counted", closed ? fmtCurrency(totalReal) : "—", closed ? `Entered by ${countedByLabel}` : "Not recorded for this report", [5, 150, 105]);
  metricCard(margin + (cardW + cardGap) * 2, y, cardW, "Variance", varianceText, status, statusColor);
  metricCard(margin + (cardW + cardGap) * 3, y, cardW, "Net A/R", `${cxc.cambioNeto >= 0 ? "+" : ""}${fmtCurrency(cxc.cambioNeto)}`, "Debt movement today", cxc.cambioNeto > 0 ? [217, 119, 6] : [5, 150, 105]);

  y += 34;
  y = sectionHeader("Decision Snapshot", y, [15, 23, 42]);
  autoTable(doc, {
    ...moneyTableStyles,
    startY: y,
    head: [["Metric", "Value", "Why it matters"]],
    body: [
      ["Sales volume", fmtCurrency(totales.totalVentas), `${salesCount} sale records - avg ${fmtCurrency(avgSale)}`],
      ["Money collected", fmtCurrency(totales.totalCaja), `${collectionRate.toFixed(1)}% of sales collected today`],
      ["Net cash to turn in", fmtCurrency(totales.efectivoNeto), `Cash after ${fmtCurrency(totales.gastosTotal)} ${expenseLabel.toLowerCase()}`],
      [expenseLabel, fmtCurrency(totales.gastosTotal), `${expenseRate.toFixed(1)}% of collected money`],
      ["A/R created", fmtCurrency(cxc.deudaNueva), "New customer debt generated by unpaid sales"],
      ["A/R collected", fmtCurrency(cxc.pagosDeuda), "Payments applied to previous debt"],
    ],
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" } },
  });

  y = doc.lastAutoTable.finalY + 8;
  y = sectionHeader("Cash Reconciliation by Method", y);
  const realCol = (v) => (v == null ? "—" : fmtCurrency(v));
  const overShortCol = (r, s) => (r == null ? "—" : fmtCurrency(r - s));
  const perMethodReal = real || { cash: null, card: null, transfer: null, other: null };
  const paymentRows = [
    ["Cash", fmtCurrency(totales.totalEfectivo), realCol(perMethodReal.cash), overShortCol(perMethodReal.cash, totales.totalEfectivo), `${totales.totalCaja ? ((totales.totalEfectivo / totales.totalCaja) * 100).toFixed(1) : "0.0"}%`],
    ["Card", fmtCurrency(totales.totalTarjeta), realCol(perMethodReal.card), overShortCol(perMethodReal.card, totales.totalTarjeta), `${totales.totalCaja ? ((totales.totalTarjeta / totales.totalCaja) * 100).toFixed(1) : "0.0"}%`],
    ["Transfer", fmtCurrency(totales.totalTransferencia), realCol(perMethodReal.transfer), overShortCol(perMethodReal.transfer, totales.totalTransferencia), `${totales.totalCaja ? ((totales.totalTransferencia / totales.totalCaja) * 100).toFixed(1) : "0.0"}%`],
    ["Other/check", fmtCurrency(totales.totalOtros), realCol(perMethodReal.other), overShortCol(perMethodReal.other, totales.totalOtros), `${totales.totalCaja ? ((totales.totalOtros / totales.totalCaja) * 100).toFixed(1) : "0.0"}%`],
    ["TOTAL", fmtCurrency(totales.totalCajaNeto), closed ? fmtCurrency(totalReal) : "—", closed ? fmtCurrency(totalReal - totales.totalCajaNeto) : "—", "100%"],
  ];
  autoTable(doc, {
    ...moneyTableStyles,
    startY: y,
    head: [["Method", "System", "Real", "Over/short", "Mix"]],
    body: paymentRows,
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    didParseCell: (data) => {
      if (data.row.index === paymentRows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [239, 246, 255];
      }
    },
  });

  y = doc.lastAutoTable.finalY + 8;
  y = sectionHeader("A/R Movement", y, [79, 70, 229]);
  autoTable(doc, {
    ...moneyTableStyles,
    startY: y,
    head: [["A/R item", "Amount", "Decision note"]],
    body: [
      ["New debt from sales", fmtCurrency(cxc.deudaNueva), "Customers bought more than they paid today"],
      ["Payments to old debt", fmtCurrency(cxc.pagosDeuda), "Cash collected against previous balances"],
      ["Returns / credits reducing A/R", fmtCurrency(cxc.reducciones), "Non-cash reductions"],
      ["Net A/R change", `${cxc.cambioNeto >= 0 ? "+" : ""}${fmtCurrency(cxc.cambioNeto)}`, cxc.cambioNeto > 0 ? "Receivables increased - follow up" : "Receivables decreased"],
    ],
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" } },
  });

  const gastosValidos = gastos.filter((g) => Number(g.monto) > 0);
  if (gastosValidos.length > 0) {
    y = doc.lastAutoTable.finalY + 8;
    y = sectionHeader(expenseLabel, y, [234, 88, 12]);
    autoTable(doc, {
      ...moneyTableStyles,
      startY: y,
      head: [["Date", "Category", "Description", "Amount"]],
      body: [
        ...gastosValidos.map((g) => [
          g.fecha || "",
          g.categoria || "other",
          `${g.descripcion || ""}${g.factura_url ? " - receipt attached" : ""}`,
          fmtCurrency(g.monto),
        ]),
        ["", "", "TOTAL EXPENSES", fmtCurrency(totales.gastosTotal)],
      ],
      headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: "bold" },
      columnStyles: { 3: { halign: "right", fontStyle: "bold" } },
    });
  }

  y = doc.lastAutoTable.finalY + 8;
  y = sectionHeader("Top Customers by Sales", y, [8, 145, 178]);
  autoTable(doc, {
    ...moneyTableStyles,
    startY: y,
    head: [["Customer", "Sales", "Paid", "Open amount", "# Sales"]],
    body: topCustomers.length
      ? topCustomers.map((c) => [c.name, fmtCurrency(c.sales), fmtCurrency(c.paid), fmtCurrency(Math.max(0, c.sales - c.paid)), c.count])
      : [["No customer sales", "$0.00", "$0.00", "$0.00", "0"]],
    headStyles: { fillColor: [8, 145, 178], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "center" } },
  });

  y = doc.lastAutoTable.finalY + 8;
  y = sectionHeader("Largest Transactions", y, [67, 56, 202]);
  autoTable(doc, {
    ...moneyTableStyles,
    startY: y,
    head: [["Time", "Customer", "Type", "Method", "Amount"]],
    body: largeTransactions.length
      ? largeTransactions.map((t) => [
          t.created_at ? new Date(t.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "",
          t.cliente || "Walk-in",
          t.tipo === "payment" ? "A/R payment" : "Sale",
          t.subMetodo || t.metodo || "",
          fmtCurrency(t.monto),
        ])
      : [["", "No transactions", "", "", "$0.00"]],
    headStyles: { fillColor: [67, 56, 202], textColor: 255, fontStyle: "bold" },
    columnStyles: { 4: { halign: "right", fontStyle: "bold" } },
  });

  y = doc.lastAutoTable.finalY + 8;
  y = sectionHeader("Action Items", y, [15, 23, 42]);
  autoTable(doc, {
    ...moneyTableStyles,
    startY: y,
    head: [["Priority", "Recommended action"]],
    body: recommendations.map((item, index) => [`${index + 1}`, item]),
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { halign: "center", fontStyle: "bold", cellWidth: 18 } },
  });

  if (observaciones && observaciones.trim()) {
    y = ensureSpace(doc.lastAutoTable.finalY + 8, 30);
    y = sectionHeader("Notes", y, [71, 85, 105]);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    const noteLines = doc.splitTextToSize(observaciones.trim(), contentWidth - 8);
    const noteHeight = Math.min(42, Math.max(16, noteLines.length * 4.5 + 8));
    doc.roundedRect(margin, y, contentWidth, noteHeight, 2, 2, "FD");
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(8);
    doc.text(noteLines.slice(0, 8), margin + 4, y + 7);
  }

  addFooter();
  return doc;
}
