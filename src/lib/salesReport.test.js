import { describe, it, expect } from "vitest";
import { aggregateByVendor, aggregateByDay } from "./salesReport";

// Fake dataset modeled after the "3 vendedores, mismo día" scenario:
// Ana: 5 ventas, Carlos: 3 ventas, Luis: 2 ventas + 1 devolución (anulación).
const fakeVentas = [
  { usuario_id: "ana", fecha: "2026-07-08", total: 20, tipo: "venta" },
  { usuario_id: "ana", fecha: "2026-07-08", total: 15, tipo: "venta" },
  { usuario_id: "ana", fecha: "2026-07-08", total: 30, tipo: "venta" },
  { usuario_id: "ana", fecha: "2026-07-08", total: 10, tipo: "venta" },
  { usuario_id: "ana", fecha: "2026-07-08", total: 25, tipo: "venta" },
  { usuario_id: "carlos", fecha: "2026-07-08", total: 40, tipo: "venta" },
  { usuario_id: "carlos", fecha: "2026-07-08", total: 20, tipo: "venta" },
  { usuario_id: "carlos", fecha: "2026-07-08", total: 60, tipo: "venta" },
  { usuario_id: "luis", fecha: "2026-07-08", total: 50, tipo: "venta" },
  { usuario_id: "luis", fecha: "2026-07-08", total: 30, tipo: "venta" },
  { usuario_id: "luis", fecha: "2026-07-08", total: 30, tipo: "devolucion" }, // anulación de la venta anterior
];

describe("aggregateByVendor — priority 8: reporte por vendedor", () => {
  const report = aggregateByVendor(fakeVentas);
  const byId = Object.fromEntries(report.map((r) => [r.usuario_id, r]));

  it("sums gross sales per vendor correctly", () => {
    expect(byId.ana.bruto).toBe(100); // 20+15+30+10+25
    expect(byId.carlos.bruto).toBe(120); // 40+20+60
  });

  it("counts the number of sales rows per vendor, including returns", () => {
    expect(byId.ana.cantidad).toBe(5);
    expect(byId.carlos.cantidad).toBe(3);
    expect(byId.luis.cantidad).toBe(3); // 2 sales + 1 return row
  });

  it("tracks returns separately from gross, and reflects them in net", () => {
    expect(byId.luis.bruto).toBe(80); // 50+30, the return is not counted as gross
    expect(byId.luis.devoluciones).toBe(30);
    expect(byId.luis.neto).toBe(50); // 80 - 30
  });

  it("vendors with no returns have identical bruto and neto", () => {
    expect(byId.ana.neto).toBe(byId.ana.bruto);
    expect(byId.carlos.neto).toBe(byId.carlos.bruto);
  });

  it("groups an unknown/missing usuario_id under a single 'desconocido' bucket", () => {
    const report2 = aggregateByVendor([{ fecha: "2026-07-08", total: 10, tipo: "venta" }]);
    expect(report2[0].usuario_id).toBe("desconocido");
  });
});

describe("aggregateByDay — priority 9: reporte del día", () => {
  it("totals every vendor's sales together for the day", () => {
    const [day] = aggregateByDay(fakeVentas);
    expect(day.fecha).toBe("2026-07-08");
    expect(day.bruto).toBe(300); // 100 + 120 + 80
    expect(day.devoluciones).toBe(30);
    expect(day.neto).toBe(270);
    expect(day.cantidad).toBe(11);
  });

  it("keeps separate days apart and sorts them ascending", () => {
    const twoDays = [
      { usuario_id: "ana", fecha: "2026-07-09", total: 50, tipo: "venta" },
      { usuario_id: "ana", fecha: "2026-07-07", total: 20, tipo: "venta" },
    ];
    const days = aggregateByDay(twoDays);
    expect(days.map((d) => d.fecha)).toEqual(["2026-07-07", "2026-07-09"]);
  });

  it("an empty day (no sales at all) is simply absent from the report, not a zeroed entry", () => {
    const days = aggregateByDay([]);
    expect(days).toEqual([]);
  });
});
