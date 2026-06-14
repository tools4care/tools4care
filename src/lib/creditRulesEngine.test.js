import { describe, it, expect } from "vitest";
import {
  calcularPPR,
  calcularPPR30Dias,
  calcularPaymentStreak,
  calcularCreditHealthScore,
  evaluarReglasCredito,
  generarPlanPago,
  calcularLimiteSugerido,
  buildPaymentAgreementSMS,
} from "./creditRulesEngine";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe("calcularPPR", () => {
  it("treats a client with no sales history as new", () => {
    const res = calcularPPR([], []);
    expect(res.clasificacion).toBe("nuevo");
    expect(res.ppr).toBe(1.0);
    expect(res.visitas).toBe(0);
  });

  it("classifies a client who pays everything they buy as bueno/excelente", () => {
    const ventas = [
      { fecha: daysAgo(1), total: 100 },
      { fecha: daysAgo(5), total: 100 },
    ];
    const pagos = [
      { fecha: daysAgo(1), monto_pagado: 100 },
      { fecha: daysAgo(5), monto_pagado: 100 },
    ];
    const res = calcularPPR(ventas, pagos);
    expect(res.ppr).toBe(1.0);
    expect(res.clasificacion).toBe("bueno");
  });

  it("classifies a client who pays nothing as peligro", () => {
    const ventas = [
      { fecha: daysAgo(1), total: 100 },
      { fecha: daysAgo(5), total: 100 },
    ];
    const res = calcularPPR(ventas, []);
    expect(res.ppr).toBe(0);
    expect(res.clasificacion).toBe("peligro");
  });

  it("caps the ppr ratio at 3.0 for clients who massively overpay", () => {
    const ventas = [{ fecha: daysAgo(1), total: 10 }];
    const pagos = [{ fecha: daysAgo(1), monto_pagado: 1000 }];
    const res = calcularPPR(ventas, pagos);
    expect(res.ppr).toBe(3.0);
  });
});

describe("calcularPaymentStreak", () => {
  it("returns zeroed streak when there are no payments", () => {
    const res = calcularPaymentStreak([]);
    expect(res.streakDias).toBe(0);
    expect(res.pagoUltimos7).toBe(false);
    expect(res.pagoUltimos3).toBe(false);
    expect(res.score).toBe(0);
  });

  it("detects a payment made within the last 3 days", () => {
    const res = calcularPaymentStreak([{ fecha: daysAgo(1), monto_pagado: 20 }]);
    expect(res.pagoUltimos3).toBe(true);
    expect(res.pagoUltimos7).toBe(true);
    expect(res.score).toBe(15);
  });

  it("detects a payment made within the last 7 but not last 3 days", () => {
    const res = calcularPaymentStreak([{ fecha: daysAgo(5), monto_pagado: 20 }]);
    expect(res.pagoUltimos3).toBe(false);
    expect(res.pagoUltimos7).toBe(true);
    expect(res.score).toBe(10);
  });

  it("counts unique days with payments in the last 14 days", () => {
    const res = calcularPaymentStreak([
      { fecha: daysAgo(1), monto_pagado: 10 },
      { fecha: daysAgo(1), monto_pagado: 5 }, // same day, shouldn't double count
      { fecha: daysAgo(10), monto_pagado: 5 },
    ]);
    expect(res.streakDias).toBe(2);
    expect(res.totalPagadoUltimos7).toBe(15);
  });
});

describe("calcularPPR30Dias", () => {
  it("treats a client with no purchases in the window as new", () => {
    const res = calcularPPR30Dias([], []);
    expect(res.clasificacion).toBe("nuevo");
    expect(res.ppr30).toBe(1.0);
  });

  it("ignores sales and payments older than 30 days", () => {
    const ventas = [{ fecha: daysAgo(45), total: 100 }];
    const pagos = [{ fecha: daysAgo(45), monto_pagado: 100 }];
    const res = calcularPPR30Dias(ventas, pagos);
    expect(res.clasificacion).toBe("nuevo");
    expect(res.totalComprado).toBe(0);
  });

  it("computes the ratio of recent payments to recent purchases", () => {
    const ventas = [{ fecha: daysAgo(5), total: 200 }];
    const pagos = [{ fecha: daysAgo(2), monto_pagado: 100 }];
    const res = calcularPPR30Dias(ventas, pagos);
    expect(res.ppr30).toBe(0.5);
    expect(res.clasificacion).toBe("alerta"); // 0.5 is the alerta threshold (>=0.5)
  });
});

describe("calcularCreditHealthScore", () => {
  it("starts at neutral and rewards a high ppr30 + recent payments", () => {
    const score = calcularCreditHealthScore({
      pprData: { ppr: 1.0, tendencia: "neutral" },
      ppr30Data: { ppr30: 1.4 },
      streakData: { pagoUltimos3: true, pagoUltimos7: true },
      acuerdos: { acuerdos_rotos: 0, cuotas_vencidas_total: 0 },
      diasInactivo: 0,
      saldoActual: 0,
    });
    // base 60 + 40 (ppr>=1.4) + 25 (pagoUltimos3) = 125 -> capped at 100
    expect(score).toBe(100);
  });

  it("penalizes broken agreements and overdue installments", () => {
    const score = calcularCreditHealthScore({
      pprData: { ppr: 0.5, tendencia: "neutral" },
      ppr30Data: { ppr30: 0.5 },
      streakData: { pagoUltimos3: false, pagoUltimos7: false },
      acuerdos: { acuerdos_rotos: 3, cuotas_vencidas_total: 2 },
      diasInactivo: 25,
      saldoActual: 100,
    });
    // base 60 - 12 (ppr 0.4-0.6) - 30 (inactivo>=21 con saldo) - 36 (rotos cap) - 10 (vencidas) = -28 -> clamped to 0
    expect(score).toBe(0);
  });

  it("clamps results between 0 and 100", () => {
    const high = calcularCreditHealthScore({
      pprData: { ppr: 2, tendencia: "mejorando" },
      ppr30Data: { ppr30: 2 },
      streakData: { pagoUltimos3: true, pagoUltimos7: true },
      acuerdos: {},
      diasInactivo: 0,
      saldoActual: 0,
    });
    expect(high).toBeLessThanOrEqual(100);
    expect(high).toBeGreaterThanOrEqual(0);
  });
});

describe("generarPlanPago", () => {
  it("uses a single installment for small amounts", () => {
    const plan = generarPlanPago(25);
    expect(plan.num_cuotas).toBe(1);
    expect(plan.cuotas).toHaveLength(1);
    expect(plan.cuotas[0].monto).toBe(25);
  });

  it("splits larger amounts into more installments", () => {
    const plan = generarPlanPago(300);
    expect(plan.num_cuotas).toBe(4);
  });

  it("ensures the installments sum to the total amount (last installment absorbs rounding)", () => {
    const plan = generarPlanPago(100, { numCuotas: 3 });
    const sum = plan.cuotas.reduce((s, c) => s + c.monto, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it("never exceeds the configured maximum number of installments", () => {
    const plan = generarPlanPago(100000);
    expect(plan.num_cuotas).toBeLessThanOrEqual(8);
  });
});

describe("evaluarReglasCredito", () => {
  it("freezes credit after 3+ broken agreements", () => {
    const res = evaluarReglasCredito({
      montoVenta: 50,
      saldoActual: 100,
      limiteBase: 200,
      acuerdos: { acuerdos_rotos: 3, acuerdos_activos: 0, cuotas_vencidas_total: 0 },
    });
    expect(res.permitido).toBe(false);
    expect(res.nivel).toBe("congelado");
    expect(res.limiteEfectivo).toBe(0);
    expect(res.requiereExcepcion).toBe(true);
  });

  it("freezes credit after long inactivity with an active balance and low ppr30", () => {
    const res = evaluarReglasCredito({
      montoVenta: 50,
      saldoActual: 100,
      limiteBase: 200,
      diasInactivo: 25,
      acuerdos: { acuerdos_rotos: 0, acuerdos_activos: 0, cuotas_vencidas_total: 0 },
      // 30-day ppr = 10/200 = 0.05, well below the 0.25 freeze threshold,
      // and the last payment was 25 days ago (no payment in last 7 days).
      ventasDetalle: [{ fecha: daysAgo(25), total: 200 }],
      pagosDetalle: [{ fecha: daysAgo(25), monto_pagado: 10 }],
    });
    expect(res.permitido).toBe(false);
    expect(res.nivel).toBe("congelado");
  });

  it("allows a normal sale for a new client with no balance and no debt", () => {
    const res = evaluarReglasCredito({
      montoVenta: 50,
      saldoActual: 0,
      limiteBase: 200,
      montoPagadoAhora: 50,
    });
    expect(res.permitido).toBe(true);
    expect(res.requiereExcepcion).toBe(false);
    // New client (ppr "nuevo" -> ppr30 1.0) -> health 82 -> mult 1.15
    expect(res.limiteEfectivo).toBe(230);
  });

  it("requires an exception when requested credit exceeds availability", () => {
    const res = evaluarReglasCredito({
      montoVenta: 500,
      saldoActual: 0,
      limiteBase: 200,
      montoPagadoAhora: 0,
    });
    expect(res.requiereExcepcion).toBe(true);
    expect(res.advertencias.some((a) => a.includes("credit"))).toBe(true);
  });

  it("suggests a payment plan for the amount going to credit", () => {
    const res = evaluarReglasCredito({
      montoVenta: 100,
      saldoActual: 0,
      limiteBase: 500,
      montoPagadoAhora: 40,
    });
    expect(res.acuerdoSugerido).not.toBeNull();
    expect(res.acuerdoSugerido.monto_total).toBe(60);
  });
});

describe("calcularLimiteSugerido", () => {
  it("returns 0 for a client with no purchase history", () => {
    const res = calcularLimiteSugerido([]);
    expect(res.limiteSugerido).toBe(0);
  });

  it("suggests a limit based on 3x average purchase", () => {
    const ventas = [
      { total: 100 }, { total: 100 }, { total: 100 },
    ];
    const res = calcularLimiteSugerido(ventas);
    expect(res.base).toBe(300); // 100 avg * 3
    expect(res.limiteSugerido).toBe(300); // default multipliers = 1.0
  });

  it("boosts the limit for clients with an excellent ppr classification", () => {
    const ventas = [{ total: 100 }, { total: 100 }];
    const res = calcularLimiteSugerido(ventas, { clasificacion: "excelente" });
    expect(res.multPPR).toBe(1.2);
    expect(res.limiteSugerido).toBe(360); // base 300 * 1.2
  });
});

describe("buildPaymentAgreementSMS", () => {
  it("includes the sale, paid, credit amounts and installment schedule", () => {
    const sms = buildPaymentAgreementSMS({
      clientName: "Jane Doe",
      montoVenta: 100,
      montoPagado: 40,
      montoCredito: 60,
      cuotas: [{ numero_cuota: 1, monto: 30, fecha_display: "Mon, Jun 15" }],
      companyName: "Tools4Care",
    });
    expect(sms).toContain("Jane Doe");
    expect(sms).toContain("Sale: $100.00");
    expect(sms).toContain("Paid: $40.00");
    expect(sms).toContain("Credit: $60.00");
    expect(sms).toContain("#1: $30.00");
  });
});
