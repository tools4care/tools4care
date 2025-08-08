// src/CuentasPorCobrar.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

/* ==================== POLÍTICA DE CRÉDITO (ajústala a tu gusto) ==================== */
const CREDIT_POLICY = {
  // Reglas de calendarización por defecto (si la venta no trae plan)
  defaultInstallments: 3,
  defaultFrequencyDays: 15,

  // Bonos/penas por comportamiento
  onTimeWindowDays: 2,     // ±2 días alrededor de la fecha de vencimiento = "a tiempo"
  lateThresholdDays: 7,    // pago después de +7 días del due = atraso con penalización
  severeNoPayDays: 30,     // si pasan +30 días sin pagar esa cuota = penalización fuerte

  bonusPerOnTime: 5,
  bonusCap: 40,

  penaltyLate: 10,
  penaltySevere: 20,
  penaltyCap: 100,

  // Penalización por utilización (saldo / límite)
  utilPenaltyPer5pct: 1,   // -1 punto por cada 5% de utilización
  utilPenaltyCap: 20,

  // Límite de crédito por score (tramos). Cambia montos según tu negocio.
  limitByScore(score) {
    if (score < 500) return 0;
    if (score < 550) return 500;
    if (score < 600) return 150;
    if (score < 650) return 250;
    if (score < 700) return 350;
    if (score < 750) return 500;
    return 1000;
  },
};

const PAGE_SIZE_DEFAULT = 25;

const DIA_MS = 24 * 60 * 60 * 1000;
const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ==================== utilidades ==================== */
function construirCalendario(venta) {
  const base = new Date(venta.fecha);
  const cuotas = Number(venta.cuotas ?? CREDIT_POLICY.defaultInstallments);
  const freq = Number(venta.frecuencia_dias ?? CREDIT_POLICY.defaultFrequencyDays);
  const arr = [];
  for (let i = 1; i <= cuotas; i++) {
    arr.push({ cuota: i, dueDate: new Date(base.getTime() + i * freq * DIA_MS) });
  }
  return arr;
}

function calcularScoreDinamico({ score_base = 600, pagos = [], calendario = [], saldo_total = 0, limite_credito }) {
  const base = Number(score_base || 600);
  const pagosOrdenados = [...pagos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const today = Date.now();

  let plus = 0;
  let minus = 0;
  let idxPago = 0;

  calendario.forEach((c) => {
    const dueT = c.dueDate.getTime();
    let pagoEnVentana = false;
    let pagoMuyTarde = false;

    // Heurística: asigno pagos secuenciales a cuotas secuenciales
    while (idxPago < pagosOrdenados.length) {
      const p = pagosOrdenados[idxPago];
      const pT = new Date(p.fecha).getTime();
      const diffDias = Math.round((pT - dueT) / DIA_MS);

      if (Math.abs(diffDias) <= CREDIT_POLICY.onTimeWindowDays) {
        pagoEnVentana = true;
        idxPago++;
        break;
      }
      if (pT < dueT - CREDIT_POLICY.onTimeWindowDays * DIA_MS) {
        idxPago++; // probablemente correspondía a una cuota anterior
        continue;
      }
      if (pT > dueT + CREDIT_POLICY.lateThresholdDays * DIA_MS) {
        pagoMuyTarde = true;
        idxPago++;
        break;
      }
      // tarde leve (entre +3 y +7 días): ni suma ni penaliza fuerte
      idxPago++;
      break;
    }

    if (pagoEnVentana) plus += CREDIT_POLICY.bonusPerOnTime;
    else if (pagoMuyTarde) minus += CREDIT_POLICY.penaltyLate;
    else {
      // sin pago asignado; si pasó > severeNoPayDays desde el due => penalización
      if (today > dueT + CREDIT_POLICY.severeNoPayDays * DIA_MS) {
        minus += CREDIT_POLICY.penaltySevere;
      }
    }
  });

  plus = Math.min(CREDIT_POLICY.bonusCap, plus);
  minus = Math.min(CREDIT_POLICY.penaltyCap, minus);

  // penalización por utilización
  const util = limite_credito > 0 ? saldo_total / limite_credito : 0;
  const utilPenalty = Math.min(
    CREDIT_POLICY.utilPenaltyCap,
    Math.round(((util * 100) / 5) * CREDIT_POLICY.utilPenaltyPer5pct)
  );
  minus += utilPenalty;

  let out = base + plus - minus;
  out = Math.max(300, Math.min(850, Math.round(out)));
  return out;
}

/* ==================== componente ==================== */
export default function CuentasPorCobrar() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  // filtros
  const [search, setSearch] = useState("");
  const [scoreRange, setScoreRange] = useState(null);
  const [agingBucket, setAgingBucket] = useState(null);

  // paginación
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);

  // guardar score calculado en DB (opcional)
  const [guardarDB, setGuardarDB] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    try {
      // 1) CLIENTES (¡sin pedir columnas que no existen!)
      const { data: cli, error: eCli } = await supabase
        .from("clientes")
        .select("id, nombre, score_credito");
      if (eCli) throw eCli;

      // 2) BALANCES (vista): columnas dinámicas
      const { data: bal, error: eBal } = await supabase.from("clientes_balance").select("*");
      if (eBal) throw eBal;

      const sample = (bal && bal[0]) || {};
      const idKey = ["id_cliente", "cliente_id", "id", "uuid"].find((k) => k in sample) || null;
      const balanceKey = ["saldo_total", "balance", "saldo"].find((k) => k in sample) || null;
      const bucketKeys = {
        b0_30: ["bucket_0_30", "b0_30", "dias_0_30"].find((k) => k in sample) || null,
        b31_60: ["bucket_31_60", "b31_60", "dias_31_60"].find((k) => k in sample) || null,
        b61_90: ["bucket_61_90", "b61_90", "dias_61_90"].find((k) => k in sample) || null,
        b90_mas: ["bucket_90_mas", "b90_mas", "dias_90_mas", "dias_90_plus"].find((k) => k in sample) || null,
      };

      const balIndex = new Map();
      (bal || []).forEach((row) => {
        if (!idKey) return;
        const k = row[idKey];
        if (k != null) balIndex.set(String(k), row);
      });

      // 3) VENTAS (solo columnas que sí tienes: fecha, cliente_id, estado_pago)
      const { data: ven, error: eVen } = await supabase
        .from("ventas")
        .select("id, cliente_id, fecha, estado_pago");
      if (eVen) throw eVen;

      // 4) ABONOS (si la tabla existe)
      let abonos = [];
      try {
        const res = await supabase.from("abonos").select("id, cliente_id, venta_id, monto, fecha");
        if (!res.error) abonos = res.data || [];
      } catch (_) {
        abonos = [];
      }

      // index auxiliares
      const ventasPorCliente = new Map();
      (ven || []).forEach((v) => {
        const cid = String(v.cliente_id);
        if (!ventasPorCliente.has(cid)) ventasPorCliente.set(cid, []);
        ventasPorCliente.get(cid).push(v);
      });

      const abonosPorCliente = new Map();
      (abonos || []).forEach((a) => {
        const cid = String(a.cliente_id);
        if (!abonosPorCliente.has(cid)) abonosPorCliente.set(cid, []);
        abonosPorCliente.get(cid).push(a);
      });

      // 5) FUSIÓN + POLÍTICA DE CRÉDITO
      const merged = (cli || []).map((c) => {
        const id = String(c.id);
        const b = balIndex.get(id) || {};

        const saldo_total = Number(balanceKey ? (b[balanceKey] ?? 0) : 0);
        const bucket_0_30 = Number(bucketKeys.b0_30 ? (b[bucketKeys.b0_30] ?? 0) : 0);
        const bucket_31_60 = Number(bucketKeys.b31_60 ? (b[bucketKeys.b31_60] ?? 0) : 0);
        const bucket_61_90 = Number(bucketKeys.b61_90 ? (b[bucketKeys.b61_90] ?? 0) : 0);
        const bucket_90_mas = Number(bucketKeys.b90_mas ? (b[bucketKeys.b90_mas] ?? 0) : 0);

        const ventas = ventasPorCliente.get(id) || [];
        const calendario = ventas
          .filter((v) => v.estado_pago !== "pagada")
          .flatMap((v) => construirCalendario(v));

        const pagos = (abonosPorCliente.get(id) || []).map((a) => ({
          fecha: a.fecha,
          monto: Number(a.monto || 0),
        }));

        const score_base = Number(c.score_credito ?? 600);

        // 1) Límite por política a partir del score_base (antes de ajuste)
        const limite_politica_inicial = CREDIT_POLICY.limitByScore(score_base);

        // 2) Score dinámico en función de comportamiento y utilización
        const score_calculado = calcularScoreDinamico({
          score_base,
          pagos,
          calendario,
          saldo_total,
          limite_credito: limite_politica_inicial,
        });

        // 3) Opcional: re-evaluar límite con el score_calculado (más realista)
        const limite_politica = CREDIT_POLICY.limitByScore(score_calculado);

        const credito_disponible = Math.max(0, limite_politica - saldo_total);

        return {
          id: c.id,
          nombre: c.nombre ?? "",
          score_base,
          score_calculado,
          limite_politica,
          credito_disponible,
          saldo_total,
          bucket_0_30,
          bucket_31_60,
          bucket_61_90,
          bucket_90_mas,
        };
      });

      setRows(merged);
    } catch (err) {
      console.error("CxC cargar() error:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // FILTROS
  const filtered = rows.filter((r) => {
    const okSearch = !search || (r.nombre || "").toLowerCase().includes(search.toLowerCase());
    const okScore =
      !scoreRange ||
      (r.score_calculado >= Number(scoreRange.min) && r.score_calculado <= Number(scoreRange.max));
    const okAging =
      !agingBucket ||
      (agingBucket === "0_30" && r.bucket_0_30 > 0) ||
      (agingBucket === "31_60" && r.bucket_31_60 > 0) ||
      (agingBucket === "61_90" && r.bucket_61_90 > 0) ||
      (agingBucket === "90_mas" && r.bucket_90_mas > 0);
    return okSearch && okScore && okAging;
  });

  // KPIs
  const totalAR = filtered.reduce((t, r) => t + (r.saldo_total || 0), 0);
  const avgScore = filtered.length
    ? filtered.reduce((t, r) => t + (r.score_calculado || 0), 0) / filtered.length
    : 0;

  // PAGINACIÓN
  const [pageSafe, totalPages, paged] = useMemo(() => {
    const totalRows = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const p = Math.min(page, totalPages);
    const slice = filtered.slice((p - 1) * pageSize, p * pageSize);
    return [p, totalPages, slice];
  }, [filtered, page, pageSize]);

  function resetPage() {
    setPage(1);
  }

  async function recalcularScoresYGuardar() {
    if (!guardarDB) return; // solo guardamos si activaste el switch
    const chunk = 50;
    for (let i = 0; i < rows.length; i += chunk) {
      for (const r of rows.slice(i, i + chunk)) {
        await supabase.from("clientes").update({ score_credito: r.score_calculado }).eq("id", r.id);
      }
    }
    await cargar();
  }

  return (
    <div className="max-w-7xl mx-auto p-4">
      {/* Header + acciones */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold">Cuentas por Cobrar</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={guardarDB} onChange={(e) => setGuardarDB(e.target.checked)} />
            Guardar scores en DB
          </label>
          <button
            onClick={recalcularScoresYGuardar}
            className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Recalcular scores
          </button>
          <button onClick={cargar} className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200">
            Recargar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <input
          type="text"
          placeholder="Buscar cliente…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          className="border rounded p-2 w-64"
        />
        <button
          onClick={() => { setScoreRange({ min: 400, max: 549 }); resetPage(); }}
          className={`border px-3 py-2 rounded ${scoreRange?.min === 400 ? "bg-blue-200" : ""}`}
        >
          Score 400–549
        </button>
        <button
          onClick={() => { setScoreRange(null); resetPage(); }}
          className={`border px-3 py-2 rounded ${!scoreRange ? "bg-blue-200" : ""}`}
        >
          Todos los scores
        </button>

        <button
          onClick={() => { setAgingBucket("0_30"); resetPage(); }}
          className={`border px-3 py-2 rounded ${agingBucket === "0_30" ? "bg-green-200" : ""}`}
        >
          0–30 días
        </button>
        <button
          onClick={() => { setAgingBucket("31_60"); resetPage(); }}
          className={`border px-3 py-2 rounded ${agingBucket === "31_60" ? "bg-green-200" : ""}`}
        >
          31–60 días
        </button>
        <button
          onClick={() => { setAgingBucket("61_90"); resetPage(); }}
          className={`border px-3 py-2 rounded ${agingBucket === "61_90" ? "bg-green-200" : ""}`}
        >
          61–90 días
        </button>
        <button
          onClick={() => { setAgingBucket("90_mas"); resetPage(); }}
          className={`border px-3 py-2 rounded ${agingBucket === "90_mas" ? "bg-green-200" : ""}`}
        >
          90+ días
        </button>
        <button
          onClick={() => { setAgingBucket(null); resetPage(); }}
          className={`border px-3 py-2 rounded ${!agingBucket ? "bg-green-200" : ""}`}
        >
          Todos los aging
        </button>

        <span className="mx-2 h-6 w-px bg-gray-300" />
        <label className="text-sm">
          Page size:&nbsp;
          <select
            className="border rounded p-1"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); resetPage(); }}
          >
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="border rounded p-4 text-center bg-white">
          <p className="text-sm text-gray-500">Total CXC</p>
          <p className="text-xl font-bold">{fmtMoney(totalAR)}</p>
        </div>
        <div className="border rounded p-4 text-center bg-white">
          <p className="text-sm text-gray-500">Score promedio (calculado)</p>
          <p className="text-xl font-bold">{filtered.length ? (filtered.reduce((t, r) => t + r.score_calculado, 0) / filtered.length).toFixed(0) : 0}</p>
        </div>
        <div className="border rounded p-4 text-center bg-white">
          <p className="text-sm text-gray-500">Clientes</p>
          <p className="text-xl font-bold">{filtered.length}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto bg-white border rounded">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-700">
              <th className="border px-4 py-2 text-left">Cliente</th>
              <th className="border px-4 py-2 text-right">Saldo</th>
              <th className="border px-4 py-2 text-right">Score base</th>
              <th className="border px-4 py-2 text-right">Score calculado</th>
              <th className="border px-4 py-2 text-right">Límite (política)</th>
              <th className="border px-4 py-2 text-right">Crédito disp.</th>
              <th className="border px-4 py-2 text-right">0–30</th>
              <th className="border px-4 py-2 text-right">31–60</th>
              <th className="border px-4 py-2 text-right">61–90</th>
              <th className="border px-4 py-2 text-right">90+</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="text-center py-6">Cargando…</td></tr>
            )}
            {!loading && paged.length === 0 && (
              <tr><td colSpan={10} className="text-center py-6">Sin resultados.</td></tr>
            )}
            {!loading && paged.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="border px-4 py-2">{r.nombre}</td>
                <td className="border px-4 py-2 text-right">{fmtMoney(r.saldo_total)}</td>
                <td className="border px-4 py-2 text-right">{r.score_base}</td>
                <td className="border px-4 py-2 text-right font-semibold">{r.score_calculado}</td>
                <td className="border px-4 py-2 text-right">{fmtMoney(r.limite_politica)}</td>
                <td className="border px-4 py-2 text-right">{fmtMoney(r.credito_disponible)}</td>
                <td className="border px-4 py-2 text-right">{fmtMoney(r.bucket_0_30)}</td>
                <td className="border px-4 py-2 text-right">{fmtMoney(r.bucket_31_60)}</td>
                <td className="border px-4 py-2 text-right">{fmtMoney(r.bucket_61_90)}</td>
                <td className="border px-4 py-2 text-right">{fmtMoney(r.bucket_90_mas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between mt-4">
        <button
          className="px-3 py-2 bg-gray-200 rounded disabled:opacity-50"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={pageSafe === 1}
        >
          ← Anterior
        </button>
        <div className="text-sm">
          Página {pageSafe} de {totalPages} · {paged.length} / {filtered.length}
        </div>
        <button
          className="px-3 py-2 bg-gray-200 rounded disabled:opacity-50"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={pageSafe === totalPages}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
