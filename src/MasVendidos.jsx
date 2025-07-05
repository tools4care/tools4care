import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function MasVendidos({ meses = 1 }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    async function cargar() {
      // Cambia 'detalle_ventas' por el nombre real de tu tabla de ventas si es distinto
      const desde = new Date();
      desde.setMonth(desde.getMonth() - meses);
      const { data: ventas } = await supabase
        .from("detalle_ventas")
        .select("producto_id, cantidad, productos:producto_id (nombre, codigo)")
        .gte("fecha", desde.toISOString().split("T")[0]);
      // Sumar cantidades por producto
      const totales = {};
      (ventas || []).forEach(v => {
        if (!totales[v.producto_id]) totales[v.producto_id] = { ...v.productos, vendidos: 0 };
        totales[v.producto_id].vendidos += v.cantidad;
      });
      const arr = Object.values(totales).sort((a, b) => b.vendidos - a.vendidos).slice(0, 10);
      setData(arr);
    }
    cargar();
  }, [meses]);

  if (!data.length) return <div className="text-gray-500 p-4">Sin ventas en el periodo.</div>;

  return (
    <div className="bg-white p-6 rounded-2xl shadow">
      <h4 className="font-bold mb-2 text-blue-800">
        Más vendidos {meses === 1 ? "últimos 30 días" : `últimos ${meses} meses`}
      </h4>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ left: 32, right: 20 }}>
          <XAxis type="number" />
          <YAxis type="category" dataKey="nombre" width={160} />
          <Tooltip />
          <Bar dataKey="vendidos" fill="#FF8042" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
