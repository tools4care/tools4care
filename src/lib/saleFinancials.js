// src/lib/saleFinancials.js
// Pure financial calculations used by the sales (Ventas) screen.
// Extracted so the logic that touches money can be unit-tested
// independently from the React component.

// ============ CRÉDITO ROTATIVO — PAGO MÍNIMO ============
export const PAGO_MINIMO_PCT = 0.20; // 20% del balance anterior
export const PAGO_MINIMO_FIJO = 30.0; // o $30, lo que sea MAYOR
export const PAGO_MINIMO_SKIP_SI_BALANCE_MENOR_A = 10; // si debe menos de $10, no exigir mínimo

export function r2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function calcularPagoMinimo(balanceAnterior) {
  if (!balanceAnterior || balanceAnterior < PAGO_MINIMO_SKIP_SI_BALANCE_MENOR_A) return 0;
  // El mínimo nunca puede exceder lo que el cliente debe
  const minCalc = Math.max(balanceAnterior * PAGO_MINIMO_PCT, PAGO_MINIMO_FIJO);
  return Number(Math.min(balanceAnterior, minCalc).toFixed(2));
}

export function policyLimit(score) {
  const s = Number(score ?? 600);
  if (s < 500) return 0;
  if (s < 550) return 30;
  if (s < 600) return 80;
  if (s < 650) return 150;
  if (s < 700) return 200;
  if (s < 750) return 350;
  if (s < 800) return 500;
  return 800;
}

export function getClientBalance(c) {
  if (!c) return 0;
  const rawBalance = Number(c?._saldo_real ?? c?.balance ?? c?.saldo_total ?? c?.saldo ?? 0);
  // This helper represents debt owed by the customer. A negative ledger
  // balance is an overpayment/credit, never a negative debt to display.
  return Math.max(0, Number.isFinite(rawBalance) ? rawBalance : 0);
}

/**
 * Computes every money-related derived value for the sale checkout step:
 * FIFO allocation of payments (old debt first, then the new sale), store
 * credit application, change, resulting CxC balance, and credit
 * limit/availability.
 *
 * Pure function — no Supabase/React dependencies — so it can be unit
 * tested directly.
 */
export function computeSaleFinancials({
  saleTotalWithTax,
  paid,
  cxcBalance,
  selectedClient,
  cxcLimit,
  cxcAvailable,
  clientHistoryHas,
  clientStoreCredit,
  isOffline,
}) {
  const balanceBeforeRaw =
    cxcBalance != null && !Number.isNaN(Number(cxcBalance))
      ? Number(cxcBalance)
      : Number(getClientBalance(selectedClient));
  const balanceBefore = Math.max(0, Number.isFinite(balanceBeforeRaw) ? balanceBeforeRaw : 0);
  const oldDebt = balanceBefore;
  const grossTotalDue = oldDebt + saleTotalWithTax;
  const storeCreditApplied = selectedClient?.id && !isOffline
    ? Math.min(Math.max(0, Number(clientStoreCredit || 0)), grossTotalDue)
    : 0;
  const totalAPagar = Math.max(0, grossTotalDue - storeCreditApplied);
  const effectivePaid = paid + storeCreditApplied;

  // FIFO: primero se paga la deuda vieja, luego la venta nueva
  const paidToOldDebt = Math.min(effectivePaid, oldDebt);
  const paidForSale = Math.min(saleTotalWithTax, Math.max(0, effectivePaid - paidToOldDebt));
  const paidApplied = paidToOldDebt + paidForSale;

  // Pago mínimo requerido esta visita
  const pagoMinimo = calcularPagoMinimo(oldDebt);
  const creditAppliedToDebt = Math.min(storeCreditApplied, oldDebt);
  const cubrioMinimo = pagoMinimo === 0 || paid + creditAppliedToDebt >= pagoMinimo;
  const faltaParaMinimo = Math.max(0, pagoMinimo - paid - creditAppliedToDebt);

  const change = Math.max(0, paid - totalAPagar);
  const mostrarAdvertencia = paid > totalAPagar;

  const balanceAfter = Math.max(0, balanceBefore + saleTotalWithTax - paidApplied);
  const amountToCredit = Math.max(0, balanceAfter - balanceBefore);

  const clientScore = Number(selectedClient?.score_credito ?? 600);
  const showCreditPanel = !!selectedClient && !!selectedClient.id &&
    (clientHistoryHas || balanceBefore !== 0);
  const computedLimit = policyLimit(clientScore);
  const creditLimit = showCreditPanel ? Number(cxcLimit ?? computedLimit) : 0;
  const creditAvailable = showCreditPanel
    ? Number(
        cxcAvailable != null && !Number.isNaN(Number(cxcAvailable))
          ? cxcAvailable
          : Math.max(0, creditLimit - balanceBefore)
      )
    : 0;
  const creditAvailableAfter = Math.max(
    0,
    Number((creditAvailable - amountToCredit).toFixed(2))
  );
  const excesoCredito = amountToCredit > creditAvailable ? amountToCredit - creditAvailable : 0;

  return {
    balanceBefore, oldDebt, grossTotalDue, storeCreditApplied, totalAPagar,
    paidToOldDebt, paidForSale, paidApplied,
    pagoMinimo, cubrioMinimo, faltaParaMinimo,
    change, mostrarAdvertencia, balanceAfter, amountToCredit,
    clientScore, showCreditPanel, computedLimit,
    creditLimit, creditAvailable, creditAvailableAfter, excesoCredito,
  };
}
