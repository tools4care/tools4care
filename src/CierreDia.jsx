import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import dayjs from "dayjs";

export default function CierreDia() {
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [cxcHoy, setCxcHoy] = useState([]);
  const [fecha, setFecha] = useState(dayjs().format("YYYY-MM-DD"));

  useEffect(() => {
    async function cargar() {
      // Ventas creadas hoy
      const { data: vts } = await supabase
        .from("ventas")
        .select("id, total, forma_pago, estado_pago, created_at")
        .gte("created_at", `${fecha} 00:00:00`)
        .lte("created_at", `${fecha} 23:59:59`);
      setVentas(vts || []);

      // Pagos recibidos hoy
      const { data: pgs } = await supabase
        .from("pagos_venta")
        .select("id, venta_id, monto, tipo_pago, ref_pago, created_at")
        .gte("created_at", `${fecha} 00:00:00`)
        .lte("created_at", `${fecha} 23:59:59`);
      setPagos(pgs || []);

      // Cuentas por cobrar generadas hoy
      const { data: cxc } = await supabase
        .from("cuentas_por_cobrar")
        .select("id, venta_id, balance, created_at")
        .gte("created_at", `${fecha} 00:00:00`)
        .lte("created_at", `${fecha} 23:59:59`);
      setCxcHoy(cxc || []);
    }
    cargar();
  }, [fecha]);

  // --- Totales ---
  const totalVentas = ventas.reduce((sum, v) => sum + (v.total || 0), 0);
  const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0);
  const totalCredito = ventas.filter(v => v.estado_pago === "pendiente").reduce((sum, v) => sum + (v.total || 0), 0);

  // --- Pagos recibidos agrupados por tipo ---
  const pagosPorTipo = {};
  pagos.forEach(p => {
    pagosPorTipo[p.tipo_pago] = (pagosPorTipo[p.tipo_pago] || 0) + (p.monto || 0);
  });

  // --- Diferencia entre ventas y (pagos + crédito) ---
  const diferencia = (totalPagado + totalCredito) - totalVentas;

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow mt-6">
      <h2 className="text-2xl font-bold mb-4 text-blue-900">Cierre del Día</h2>
      <div className="mb-6 flex gap-4 items-center">
        <label className="font-bold">Fecha:</label>
        <input
          type="date"
          value={fecha}
          className="border p-2 rounded"
          onChange={e => setFecha(e.target.value)}
        />
      </div>

      {/* --- RESUMEN SUPERIOR --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-xl shadow text-center">
          <div className="text-xl text-blue-900 font-bold">Ventas Totales</div>
          <div className="text-2xl text-green-600 font-bold">${totalVentas.toFixed(2)}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-xl shadow text-center">
          <div className="text-xl text-green-900 font-bold">Cobrado Hoy</div>
          <div className="text-2xl text-green-800 font-bold">${totalPagado.toFixed(2)}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-xl shadow text-center">
          <div className="text-xl text-yellow-700 font-bold">Ventas a Crédito</div>
          <div className="text-2xl text-yellow-700 font-bold">${totalCredito.toFixed(2)}</div>
        </div>
      </div>

      {/* --- ALERTA DE DIFERENCIA --- */}
      {Math.abs(diferencia) > 0.01 && (
        <div className="mb-6 text-red-600 font-bold bg-red-50 p-4 rounded-xl shadow">
          Atención: Hay una diferencia de ${diferencia.toFixed(2)} entre ventas y suma de pagos+crédito. Revisa tus registros.
        </div>
      )}

      {/* --- DESGLOSE POR MÉTODO DE PAGO --- */}
      <div className="mb-6">
        <h3 className="text-lg font-bold mb-2">Pagos recibidos hoy por tipo:</h3>
        <ul className="grid grid-cols-2 gap-2">
          {Object.keys(pagosPorTipo).map(tipo => (
            <li key={tipo}>
              <span className="font-semibold capitalize">{tipo}:</span>{" "}
              <span>${pagosPorTipo[tipo].toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* --- CUENTAS POR COBRAR CREADAS HOY --- */}
      <div className="mb-6">
        <h3 className="text-lg font-bold mb-2">Cuentas por cobrar creadas hoy</h3>
        <ul>
          {cxcHoy.map(c => (
            <li key={c.id}>Venta #{c.venta_id} - Balance: <b>${c.balance?.toFixed(2) || 0}</b></li>
          ))}
        </ul>
        <div className="mt-2 text-gray-700">
          <b>Total generado a crédito hoy:</b> ${cxcHoy.reduce((sum, c) => sum + (c.balance || 0), 0).toFixed(2)}
        </div>
      </div>

      {/* --- TABLA DE VENTAS DEL DÍA (opcional, puedes quitar si quieres simple) --- */}
      <div className="mb-2">
        <h3 className="text-lg font-bold mb-2">Detalle de Ventas</h3>
        <table className="min-w-full bg-white border text-xs">
          <thead>
            <tr>
              <th className="p-1 border">Hora</th>
              <th className="p-1 border">Venta #</th>
              <th className="p-1 border">Total</th>
              <th className="p-1 border">Forma Pago</th>
              <th className="p-1 border">Estado</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map(v => (
              <tr key={v.id}>
                <td className="p-1 border">{dayjs(v.created_at).format("HH:mm:ss")}</td>
                <td className="p-1 border">{v.id}</td>
                <td className="p-1 border">${v.total?.toFixed(2)}</td>
                <td className="p-1 border">{v.forma_pago || "-"}</td>
                <td className="p-1 border">{v.estado_pago}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
