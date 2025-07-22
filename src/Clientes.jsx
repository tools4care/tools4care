import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext"; // Access to current van

const estadosUSA = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY"
];

const zipToCiudadEstado = (zip) => {
  const mapa = {
    "02118": { ciudad: "Boston", estado: "MA" },
    "02139": { ciudad: "Cambridge", estado: "MA" },
    "01960": { ciudad: "Peabody", estado: "MA" },
    "01915": { ciudad: "Beverly", estado: "MA" },
  };
  return mapa[zip] || { ciudad: "", estado: "" };
};

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarAbono, setMostrarAbono] = useState(false);
  const [resumen, setResumen] = useState({ ventas: [], pagos: [], balance: 0 });

  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    negocio: "",
    direccion: { calle: "", ciudad: "", estado: "", zip: "" },
  });
  const [mensaje, setMensaje] = useState("");
  const [estadoInput, setEstadoInput] = useState("");
  const [estadoOpciones, setEstadoOpciones] = useState(estadosUSA);

  // Load clients
  useEffect(() => { cargarClientes(); }, []);
  async function cargarClientes() {
    const { data, error } = await supabase.from("clientes_balance").select("*");
    if (!error) setClientes(data);
    else setMensaje("Error loading clients");
  }

  // When selecting client, load summary
  useEffect(() => {
    async function cargarResumen() {
      if (!clienteSeleccionado) return setResumen({ ventas: [], pagos: [], balance: 0 });
      const { data: ventas } = await supabase
        .from("ventas")
        .select("id, fecha, total_venta, total_pagado, estado_pago")
        .eq("cliente_id", clienteSeleccionado.id);
      const { data: pagos } = await supabase
        .from("pagos")
        .select("id, fecha_pago, monto, metodo_pago")
        .eq("cliente_id", clienteSeleccionado.id);
      const deudaVentas = (ventas || []).reduce(
        (t, v) => t + ((v.total_venta || 0) - (v.total_pagado || 0)), 0
      );
      const abonos = (pagos || []).reduce((t, p) => t + (p.monto || 0), 0);
      const balance = Math.max(deudaVentas - abonos, 0);

      setResumen({ ventas: ventas || [], pagos: pagos || [], balance });
    }
    cargarResumen();
    // eslint-disable-next-line
  }, [clienteSeleccionado, mostrarAbono]);

  function handleSelectCliente(c) {
    let direccion = { calle: "", ciudad: "", estado: "", zip: "" };
    if (typeof c.direccion === "string" && c.direccion) {
      try { direccion = JSON.parse(c.direccion); } catch {}
    }
    if (typeof c.direccion === "object" && c.direccion !== null) {
      direccion = {
        calle: c.direccion.calle || "",
        ciudad: c.direccion.ciudad || "",
        estado: c.direccion.estado || "",
        zip: c.direccion.zip || "",
      };
    }
    setClienteSeleccionado(c);
    setForm({
      nombre: c.nombre || "",
      telefono: c.telefono || "",
      email: c.email || "",
      negocio: c.negocio || "",
      direccion,
    });
    setEstadoInput(direccion.estado || "");
    setMensaje("");
  }

  function handleChange(e) {
    const { name, value } = e.target;
    if (["calle", "ciudad", "estado", "zip"].includes(name)) {
      setForm((f) => {
        let newDireccion = { ...f.direccion, [name]: value };
        if (name === "estado") {
          setEstadoInput(value.toUpperCase());
          setEstadoOpciones(estadosUSA.filter(s => s.startsWith(value.toUpperCase())));
        }
        if (name === "zip" && value.length === 5) {
          const { ciudad, estado } = zipToCiudadEstado(value);
          if (ciudad || estado) {
            newDireccion.ciudad = ciudad;
            newDireccion.estado = estado;
            setEstadoInput(estado);
            setEstadoOpciones(estadosUSA.filter(s => s.startsWith(estado)));
          }
        }
        return { ...f, direccion: newDireccion };
      });
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  function handleEstadoSelect(e) {
    const selected = e.target.value;
    setForm((f) => ({
      ...f,
      direccion: { ...f.direccion, estado: selected }
    }));
    setEstadoInput(selected);
    setEstadoOpciones(estadosUSA.filter(s => s.startsWith(selected)));
  }

  async function handleGuardar(e) {
    e.preventDefault();
    if (!form.nombre) return setMensaje("Full name is required");
    let direccionFinal = form.direccion || { calle: "", ciudad: "", estado: "", zip: "" };

    if (!clienteSeleccionado) {
      const { error } = await supabase.from("clientes").insert([{ ...form, direccion: direccionFinal }]);
      if (error) setMensaje("Error saving: " + error.message);
      else {
        setMensaje("Client saved successfully");
        cargarClientes();
        resetForm();
      }
    } else {
      const { error } = await supabase.from("clientes")
        .update({ ...form, direccion: direccionFinal })
        .eq("id", clienteSeleccionado.id);
      if (error) setMensaje("Error editing: " + error.message);
      else {
        setMensaje("Changes saved successfully");
        cargarClientes();
        resetForm();
      }
    }
  }

  async function handleEliminar() {
    if (!clienteSeleccionado) return setMensaje("Select a client first");
    if (!window.confirm("Delete this client?")) return;
    const { error } = await supabase.from("clientes").delete().eq("id", clienteSeleccionado.id);
    if (error) setMensaje("Error deleting: " + error.message);
    else {
      setMensaje("Client deleted");
      cargarClientes();
      resetForm();
    }
  }

  function resetForm() {
    setClienteSeleccionado(null);
    setForm({
      nombre: "",
      telefono: "",
      email: "",
      negocio: "",
      direccion: { calle: "", ciudad: "", estado: "", zip: "" },
    });
    setEstadoInput("");
    setEstadoOpciones(estadosUSA);
  }

  const clientesFiltrados = clientes.filter((c) => {
    let d = { calle: "", ciudad: "", estado: "", zip: "" };
    if (typeof c.direccion === "string" && c.direccion) {
      try { d = JSON.parse(c.direccion); } catch {}
    }
    if (typeof c.direccion === "object" && c.direccion !== null) {
      d = c.direccion;
    }
    const textoBusqueda = busqueda.toLowerCase();
    const telefonoCliente = (c.telefono || "").replace(/\D/g, "");
    const telefonoBusqueda = busqueda.replace(/\D/g, "");
    return (
      [
        c.nombre, c.email, c.negocio,
        d.calle, d.ciudad, d.estado, d.zip
      ].join(" ").toLowerCase().includes(textoBusqueda) ||
      (telefonoBusqueda.length > 2 && telefonoCliente.includes(telefonoBusqueda))
    );
  });

  return (
    <div className="max-w-5xl mx-auto py-7">
      <h2 className="text-3xl font-bold mb-6 text-center text-blue-900">Clients</h2>
      {/* Form */}
      <form onSubmit={handleGuardar} className="bg-white p-6 rounded-xl shadow-md mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="font-bold block mb-1">Full Name *</label>
          <input name="nombre" className="border rounded-lg p-2 w-full" value={form.nombre} onChange={handleChange} required />
        </div>
        <div>
          <label className="font-bold block mb-1">Phone</label>
          <input name="telefono" className="border rounded-lg p-2 w-full" value={form.telefono} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">Email</label>
          <input name="email" className="border rounded-lg p-2 w-full" value={form.email} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">Business</label>
          <input name="negocio" className="border rounded-lg p-2 w-full" value={form.negocio} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">Street</label>
          <input name="calle" className="border rounded-lg p-2 w-full" value={form.direccion.calle} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">City</label>
          <input name="ciudad" className="border rounded-lg p-2 w-full" value={form.direccion.ciudad} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">ZIP Code</label>
          <input name="zip" className="border rounded-lg p-2 w-full" value={form.direccion.zip} onChange={handleChange} maxLength={5} />
        </div>
        {/* State: select with autocomplete */}
        <div>
          <label className="font-bold block mb-1">State</label>
          <input
            name="estado"
            className="border rounded-lg p-2 w-full"
            placeholder="Eg: MA"
            value={estadoInput}
            onChange={handleChange}
            list="estados-lista"
            autoComplete="off"
            maxLength={2}
            style={{ textTransform: "uppercase" }}
          />
          <datalist id="estados-lista">
            {estadoOpciones.map(e => (
              <option value={e} key={e}>{e}</option>
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2 flex gap-3 mt-2">
          <button type="submit" className="bg-blue-700 hover:bg-blue-900 text-white font-bold px-6 py-2 rounded-xl transition">
            {clienteSeleccionado ? "Save Changes" : "Save Client"}
          </button>
          <button type="button" className="bg-gray-400 hover:bg-gray-600 text-white font-bold px-6 py-2 rounded-xl transition" onClick={resetForm}>
            Clear
          </button>
          <button type="button" className="bg-red-700 hover:bg-red-900 text-white font-bold px-6 py-2 rounded-xl transition" disabled={!clienteSeleccionado} onClick={handleEliminar}>
            Delete Client
          </button>
        </div>
        {mensaje && (
          <div className="col-span-2 text-center mt-2 text-blue-700">{mensaje}</div>
        )}
      </form>
      {/* Table */}
      <div className="bg-white p-4 rounded-xl shadow-lg">
        <h3 className="text-2xl font-bold mb-3 text-blue-900 text-center">Client List</h3>
        <input className="border rounded p-2 mb-4 w-full" placeholder="Search client" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-blue-100">
                <th className="p-2">ID</th>
                <th className="p-2">Full Name</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Business</th>
                <th className="p-2">Email</th>
                <th className="p-2">Address</th>
                <th className="p-2">Balance</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c) => {
                let d = { calle: "", ciudad: "", estado: "", zip: "" };
                if (typeof c.direccion === "string" && c.direccion) {
                  try { d = JSON.parse(c.direccion); } catch {}
                }
                if (typeof c.direccion === "object" && c.direccion !== null) {
                  d = c.direccion;
                }
                const isSelected = clienteSeleccionado && clienteSeleccionado.id === c.id;
                return (
                  <tr
                    key={c.id}
                    className={
                      isSelected
                        ? "bg-yellow-50 font-bold"
                        : "hover:bg-blue-50 cursor-pointer"
                    }
                    onClick={() => handleSelectCliente(c)}
                  >
                    <td className="p-2 font-mono">{c.id.slice(0, 8)}…</td>
                    <td className="p-2">{c.nombre}</td>
                    <td className="p-2">{c.telefono}</td>
                    <td className="p-2">{c.negocio}</td>
                    <td className="p-2">{c.email}</td>
                    <td className="p-2">
                      {[d.calle, d.ciudad, d.estado, d.zip].filter(Boolean).join(", ")}
                    </td>
                    <td className="p-2 text-right">
                      {typeof c.balance === "number" &&
                        <span className={c.balance > 0 ? "text-red-600 font-bold" : "text-green-700 font-bold"}>
                          ${c.balance.toFixed(2)}
                        </span>
                      }
                    </td>
                    <td>
                      <button
                        className="bg-green-600 text-white px-3 py-1 rounded text-xs"
                        onClick={e => { e.stopPropagation(); setClienteSeleccionado(c); setMostrarAbono(true); }}
                        disabled={!c.id}
                      >
                        Payment
                      </button>
                    </td>
                  </tr>
                );
              })}
              {clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400 py-4">
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* MODAL: Payment with sales/payment history */}
      {mostrarAbono && clienteSeleccionado && (
        <ModalAbonar
          cliente={clienteSeleccionado}
          resumen={resumen}
          onClose={() => setMostrarAbono(false)}
          refresh={() => { cargarClientes(); }}
        />
      )}
    </div>
  );
}

// --- PAYMENT MODAL + HISTORY ---
function ModalAbonar({ cliente, resumen, onClose, refresh }) {
  const { van } = useVan();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Cash");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function guardarAbono(e) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setMensaje("");

    if (!van || !van.id) {
      setMensaje("You must select a VAN before adding a payment.");
      setGuardando(false);
      return;
    }

    if (!monto || isNaN(monto) || Number(monto) <= 0) {
      setMensaje("Invalid amount. Must be greater than 0.");
      setGuardando(false);
      return;
    }
    if (Number(monto) > Number(cliente.balance)) {
      setMensaje("Amount cannot be greater than pending balance.");
      setGuardando(false);
      return;
    }

    const { error } = await supabase.from("pagos").insert([
      {
        cliente_id: cliente.id,
        monto: Number(monto),
        metodo_pago: metodo,
        van_id: van.id,
      }
    ]);
    setGuardando(false);
    if (!error) {
      setMensaje("Payment registered!");
      setTimeout(() => {
        onClose();
        if (refresh) refresh();
      }, 900);
    } else {
      setMensaje("Error saving payment");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30">
      <form
        onSubmit={guardarAbono}
        className="bg-white rounded p-6 w-full max-w-md"
      >
        <h3 className="font-bold mb-3">Payment for {cliente.nombre}</h3>
        <div className="mb-2">
          <span className="font-bold">Current Balance:</span>{" "}
          <span className={Number(cliente.balance) > 0 ? "text-red-600 font-bold" : "text-green-700 font-bold"}>
            ${Number(cliente.balance).toFixed(2)}
          </span>
        </div>
        <input
          className="border rounded p-2 mb-2 w-full"
          placeholder="Amount"
          type="number"
          min="1"
          step="any"
          value={monto}
          onChange={e => setMonto(e.target.value)}
          required
        />
        <select
          className="border rounded p-2 mb-2 w-full"
          value={metodo}
          onChange={e => setMetodo(e.target.value)}
        >
          <option value="Cash">Cash</option>
          <option value="Card">Card</option>
          <option value="Transfer">Transfer</option>
        </select>
        <button
          type="submit"
          className="bg-blue-700 text-white px-4 py-2 rounded w-full"
          disabled={guardando}
        >{guardando ? "Saving..." : "Save payment"}</button>
        <button
          type="button"
          className="bg-gray-400 text-white px-4 py-2 rounded w-full mt-2"
          onClick={onClose}
          disabled={guardando}
        >Cancel</button>
        {mensaje && (
          <div className={`mt-2 text-sm ${mensaje.includes("Error") || mensaje.includes("invalid") ? "text-red-600" : "text-green-700"}`}>{mensaje}</div>
        )}

        {/* --- HISTORY --- */}
        <div className="mt-5">
          <h4 className="font-bold mb-2 text-blue-900">Recent History</h4>
          <div className="text-sm mb-2 font-bold">Sales with debt</div>
          <ul className="mb-3 max-h-24 overflow-y-auto">
            {resumen.ventas.length === 0 && <li className="text-gray-500">No sales registered</li>}
            {resumen.ventas.map(v => (
              <li key={v.id} className="mb-1">
                <span className="font-mono text-xs">{v.id.slice(0, 8)}</span> — <span className="font-bold">${(v.total_venta || 0).toFixed(2)}</span>
                {v.total_pagado > 0 && <> paid: <span className="font-bold text-green-800">${v.total_pagado.toFixed(2)}</span></>}
                {v.estado_pago && <> — <span className="italic">{v.estado_pago}</span></>}
                <span className="ml-2 text-gray-400">{v.fecha?.slice(0,10)}</span>
              </li>
            ))}
          </ul>
          <div className="text-sm font-bold mb-1">Previous payments</div>
          <ul className="max-h-24 overflow-y-auto">
            {resumen.pagos.length === 0 && <li className="text-gray-500">No previous payments</li>}
            {resumen.pagos.map(p => (
              <li key={p.id} className="mb-1">
                <span className="font-mono text-xs">{p.id.slice(0, 8)}</span> — <span className="font-bold">${(p.monto || 0).toFixed(2)}</span>
                <span className="ml-2">{p.metodo_pago}</span>
                <span className="ml-2 text-gray-400">{p.fecha_pago?.slice(0,10)}</span>
              </li>
            ))}
          </ul>
        </div>
      </form>
    </div>
  );
}
