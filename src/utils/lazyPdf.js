// Lazily loads jsPDF + jspdf-autotable only when a PDF is actually generated.
// Keeps these heavy libraries (~570KB combined) out of the initial bundle.
export async function loadPdfLibs() {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable };
}
