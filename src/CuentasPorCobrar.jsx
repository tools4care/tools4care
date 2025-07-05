import React, { useState } from "react";

// Métodos de pago posibles
const metodosPago = ["Efectivo", "Tarjeta", "Cheque", "PayPal", "Venmo", "Zelle", "Apple Pay", "Crédito"];

// MOCK DE CLIENTES CON DEUDA
const clientesDemo = [
  { id: "CL-001", nombre: "Juan", apellido: "Pérez", negocio: "Barbería Juan", telefono: "555-1111", saldo: 120, abonos: [], direccion: { ciudad: "Boston", estado: "MA" } },
  { id: "CL-003", nombre: "Carlos", apellido: "Ramírez", negocio: "BarberShop CR", telefono: "555-3333", saldo: 60, abonos: [], direccion: { ciudad: "Lynn", estado: "MA" } },
  { id: "CL-002", nombre: "Ana", apellido: "García", negocio: "Estilo Ana", telefono: "555-2222", saldo: 0, abonos: [], direccion: { ciudad: "Cambridge", estado: "MA" } }
];

// Badge visual
function DeudaBadge({ saldo }) {
  if (saldo <= 0) return <span className="px-2 py-1 bg-green-600 text-white rounded-full text-xs">Pagado</span>;
  if (saldo < 50) return <span className="px-2 py-1 bg-yellow-400 text-white rounded-full text-xs">Bajo</span>;
  return <span className="px-2 py-1 bg-red-600 text-white rounded-full text-xs">Alto</span>;
}

// Modal de abono
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 min-w-[340px] max-w-md w-full relative" onClick={e => e.stopPropagation()}>
        <button className="absolute right-4 top-3 text-gray-600 text-2xl" onClick={onClose}>&times;</button>
        <div className="mb-3 text-xl font-bold text-center">{title}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

export default function CuentasPorCobrar() {
  const [clientes, setClientes] = useState(clientesDemo);
  const [busqueda, setBusqueda] = useState("");
  const [clienteAbono, setClienteAbono] = useState(null);
  const [abono, setAbono] = useState("");
  const [metodo, setMetodo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [mensaje, setMensaje] = useState("");

  // FILTRADO
  const clientesFiltrados = clientes.filter(c =>
    [c.id, c.nombre, c.apellido, c.negocio, c.telefono, c.direccion.ciudad, c.direccion.estado]
      .join(" ")
      .toLowerCase()
      .includes(busqueda.toLowerCase())
    && c.saldo > 0 // Solo clientes con saldo pendiente
  );

  // TOTAL DEUDA
  const totalPendiente = clientes.reduce((acc, c) => acc + (c.saldo > 0 ? c.saldo : 0), 0);

  // REGISTRAR ABONO
  const registrarAbono = () => {
    if (!clienteAbono || !abono || Number(abono) <= 0) {
      setMensaje("Monto de abono inválido.");
      return;
    }
    if (!metodo) {
      setMensaje("Debes seleccionar el método de pago.");
      return;
    }
    if (Number(abono) > clienteAbono.saldo) {
      setMensaje("No puedes abonar más de la deuda.");
      return;
    }
    setClientes(prev =>
      prev.map(c =>
        c.id === clienteAbono.id
          ? {
              ...c,
              saldo: Number((c.saldo - abono).toFixed(2)),
              abonos: [
                ...c.abonos,
                {
                  fecha: new Date().toLocaleString(),
                  monto: Number(abono),
                  metodo,
                  referencia: referencia || ""
                }
              ]
            }
          : c
      )
    );
    setClienteAbono(null);
    setAbono("");
    setMetodo("");
    setReferencia("");
    setMensaje("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-blue-100 via-white to-blue-200 flex flex-col items-center py-7">
      <div className="w-full max-w-5xl">
        <h2 className="text-4xl font-extrabold mb-8 text-blue-900 text-center tracking-tight drop-shadow shadow-blue-100">Cuentas por Cobrar</h2>

        {/* --- Resumen total --- */}
        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6 mb-8 max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-lg font-bold text-blue-700 mr-3">Total pendiente:</span>
            <span className="text-2xl font-bold text-red-600">${totalPendiente.toFixed(2)}</span>
          </div>
          <input
            className="border-2 border-blue-200 rounded-xl p-3 w-full sm:w-80 shadow-sm bg-blue-50 focus:border-blue-400 focus:bg-white transition"
            placeholder="Buscar cliente, teléfono, negocio, ID..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        {/* --- Tabla de cuentas por cobrar --- */}
        <div className="overflow-x-auto rounded-2xl border border-blue-200 shadow-xl bg-white max-w-4xl mx-auto">
          <table className="min-w-full text-base text-gray-700 table-fixed">
            <thead className="sticky top-0 z-10 bg-blue-200 shadow-inner">
              <tr>
                <th className="p-4 text-blue-900 font-bold text-md border-b border-blue-300">ID</th>
                <th className="p-4 text-blue-900 font-bold text-md border-b border-blue-300">Nombre</th>
                <th className="p-4 text-blue-900 font-bold text-md border-b border-blue-300">Negocio</th>
                <th className="p-4 text-blue-900 font-bold text-md border-b border-blue-300">Teléfono</th>
                <th className="p-4 text-blue-900 font-bold text-md border-b border-blue-300">Ciudad/Estado</th>
                <th className="p-4 text-blue-900 font-bold text-md border-b border-blue-300">Saldo</th>
                <th className="p-4 text-blue-900 font-bold text-md border-b border-blue-300">Estatus</th>
                <th className="p-4 text-blue-900 font-bold text-md border-b border-blue-300">Acción</th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.length === 0
                ? <tr><td colSpan={8} className="text-center text-gray-400 py-10 text-lg">¡No tienes cuentas pendientes!</td></tr>
                : clientesFiltrados.map((c) => (
                  <tr
                    key={c.id}
                    className={`
                      hover:bg-blue-100 transition border-b border-blue-100
                    `}
                  >
                    <td className="p-4 font-mono font-semibold">{c.id}</td>
                    <td className="p-4">{c.nombre} {c.apellido}</td>
                    <td className="p-4">{c.negocio}</td>
                    <td className="p-4">{c.telefono}</td>
                    <td className="p-4">{c.direccion.ciudad}, {c.direccion.estado}</td>
                    <td className="p-4 font-bold text-red-700">${c.saldo.toFixed(2)}</td>
                    <td className="p-4"><DeudaBadge saldo={c.saldo} /></td>
                    <td className="p-4">
                      <button
                        className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-xl font-bold shadow transition"
                        onClick={() => { setClienteAbono(c); setAbono(""); setMetodo(""); setReferencia(""); setMensaje(""); }}>
                        Registrar pago
                      </button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* --- Modal de abono --- */}
        <Modal open={!!clienteAbono} onClose={() => setClienteAbono(null)} title={`Registrar pago a ${clienteAbono?.nombre || ""}`}>
          <div className="mb-4">
            <div className="mb-1 text-blue-800 font-bold">Saldo pendiente: <span className="text-red-600">${clienteAbono?.saldo?.toFixed(2)}</span></div>
            <input
              className="border rounded p-2 mb-3 w-full"
              type="number"
              min="1"
              max={clienteAbono?.saldo || ""}
              step="0.01"
              placeholder="Monto del abono"
              value={abono}
              onChange={e => setAbono(e.target.value)}
            />
            <select
              className="border rounded p-2 mb-3 w-full"
              value={metodo}
              onChange={e => setMetodo(e.target.value)}
            >
              <option value="">Seleccionar método de pago</option>
              {metodosPago.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input
              className="border rounded p-2 mb-3 w-full"
              type="text"
              placeholder="Referencia/comprobante (opcional)"
              value={referencia}
              onChange={e => setReferencia(e.target.value)}
            />
          </div>
          <button
            className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-xl font-bold w-full mb-2"
            onClick={registrarAbono}
          >Registrar pago</button>
          {mensaje && <div className="text-red-600 text-center mt-2">{mensaje}</div>}

          {clienteAbono?.abonos?.length > 0 && (
            <div className="mt-4">
              <h4 className="font-bold text-blue-900 mb-2">Historial de abonos</h4>
              <ul className="text-xs text-gray-700 space-y-1">
                {clienteAbono.abonos.map((a, i) =>
                  <li key={i}>
                    <b>${a.monto}</b> – {a.fecha} <span className="text-gray-500">[{a.metodo}{a.referencia ? ` | Ref: ${a.referencia}` : ""}]</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
