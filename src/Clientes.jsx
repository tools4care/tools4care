import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext"; // Acceso a la van actual

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

  // Cargar clientes
  useEffect(() => { cargarClientes(); }, []);
  async function cargarClientes() {
    const { data, error } = await supabase.from("clientes_balance").select("*");
    if (!error) setClientes(data);
    else setMensaje("Error cargando clientes");
  }

  // Cuando seleccionas cliente, cargar resumen
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
    if (!form.nombre) return setMensaje("Nombre y apellido es requerido");
    let direccionFinal = form.direccion || { calle: "", ciudad: "", estado: "", zip: "" };

    if (!clienteSeleccionado) {
      const { error } = await supabase.from("clientes").insert([{ ...form, direccion: direccionFinal }]);
      if (error) setMensaje("Error al guardar: " + error.message);
      else {
        setMensaje("Cliente guardado con éxito");
        cargarClientes();
        resetForm();
      }
    } else {
      const { error } = await supabase.from("clientes")
        .update({ ...form, direccion: direccionFinal })
        .eq("id", clienteSeleccionado.id);
      if (error) setMensaje("Error al editar: " + error.message);
      else {
        setMensaje("Cambios guardados con éxito");
        cargarClientes();
        resetForm();
      }
    }
  }

  async function handleEliminar() {
    if (!clienteSeleccionado) return setMensaje("Selecciona un cliente primero");
    if (!window.confirm("¿Eliminar este cliente?")) return;
    const { error } = await supabase.from("clientes").delete().eq("id", clienteSeleccionado.id);
    if (error) setMensaje("Error al eliminar: " + error.message);
    else {
      setMensaje("Cliente eliminado");
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
      <h2 className="text-3xl font-bold mb-6 text-center text-blue-900">Clientes</h2>
      {/* Formulario */}
      <form onSubmit={handleGuardar} className="bg-white p-6 rounded-xl shadow-md mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="font-bold block mb-1">Nombre y Apellido *</label>
          <input name="nombre" className="border rounded-lg p-2 w-full" value={form.nombre} onChange={handleChange} required />
        </div>
        <div>
          <label className="font-bold block mb-1">Teléfono</label>
          <input name="telefono" className="border rounded-lg p-2 w-full" value={form.telefono} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">Email</label>
          <input name="email" className="border rounded-lg p-2 w-full" value={form.email} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">Negocio</label>
          <input name="negocio" className="border rounded-lg p-2 w-full" value={form.negocio} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">Calle</label>
          <input name="calle" className="border rounded-lg p-2 w-full" value={form.direccion.calle} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">Ciudad</label>
          <input name="ciudad" className="border rounded-lg p-2 w-full" value={form.direccion.ciudad} onChange={handleChange} />
        </div>
        <div>
          <label className="font-bold block mb-1">Código Postal</label>
          <input name="zip" className="border rounded-lg p-2 w-full" value={form.direccion.zip} onChange={handleChange} maxLength={5} />
        </div>
        {/* Estado: select con autocomplete */}
        <div>
          <label className="font-bold block mb-1">Estado</label>
          <input
            name="estado"
            className="border rounded-lg p-2 w-full"
            placeholder="Ej: MA"
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
            {clienteSeleccionado ? "Guardar Cambios" : "Guardar Cliente"}
          </button>
          <button type="button" className="bg-gray-400 hover:bg-gray-600 text-white font-bold px-6 py-2 rounded-xl transition" onClick={resetForm}>
            Limpiar
          </button>
          <button type="button" className="bg-red-700 hover:bg-red-900 text-white font-bold px-6 py-2 rounded-xl transition" disabled={!clienteSeleccionado} onClick={handleEliminar}>
            Eliminar Cliente
          </button>
        </div>
        {mensaje && (
          <div className="col-span-2 text-center mt-2 text-blue-700">{mensaje}</div>
        )}
      </form>
      {/* Tabla */}
      <div className="bg-white p-4 rounded-xl shadow-lg">
        <h3 className="text-2xl font-bold mb-3 text-blue-900 text-center">Lista de Clientes</h3>
        <input className="border rounded p-2 mb-4 w-full" placeholder="Buscar cliente" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-blue-100">
                <th className="p-2">ID</th>
                <th className="p-2">Nombre y Apellido</th>
                <th className="p-2">Teléfono</th>
                <th className="p-2">Negocio</th>
                <th className="p-2">Email</th>
                <th className="p-2">Dirección</th>
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
                        Abonar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400 py-4">
                    No hay resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* MODAL: Abonar, con historial de ventas/pagos */}
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

// --- MODAL DE ABONO + HISTORIAL ---
// Mejoras: validación robusta, doble submit, UX, asocia van_id al pago
function ModalAbonar({ cliente, resumen, onClose, refresh }) {
  const { van } = useVan(); // Para asociar el abono a la van actual
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Efectivo");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function guardarAbono(e) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setMensaje("");

    if (!van || !van.id) {
      setMensaje("Debes seleccionar una VAN antes de abonar.");
      setGuardando(false);
      return;
    }

    if (!monto || isNaN(monto) || Number(monto) <= 0) {
      setMensaje("Monto inválido. Debe ser mayor a 0.");
      setGuardando(false);
      return;
    }
    if (Number(monto) > Number(cliente.balance)) {
      setMensaje("El monto no puede ser mayor al balance pendiente.");
      setGuardando(false);
      return;
    }

    const { error } = await supabase.from("pagos").insert([
      {
        cliente_id: cliente.id,
        monto: Number(monto),
        metodo_pago: metodo,
        van_id: van.id, // Asociamos el abono a la van seleccionada
      }
    ]);
    setGuardando(false);
    if (!error) {
      setMensaje("¡Abono registrado!");
      setTimeout(() => {
        onClose();
        if (refresh) refresh();
      }, 900);
    } else {
      setMensaje("Error al guardar abono");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30">
      <form
        onSubmit={guardarAbono}
        className="bg-white rounded p-6 w-full max-w-md"
      >
        <h3 className="font-bold mb-3">Abono para {cliente.nombre}</h3>
        <div className="mb-2">
          <span className="font-bold">Balance actual:</span>{" "}
          <span className={Number(cliente.balance) > 0 ? "text-red-600 font-bold" : "text-green-700 font-bold"}>
            ${Number(cliente.balance).toFixed(2)}
          </span>
        </div>
        <input
          className="border rounded p-2 mb-2 w-full"
          placeholder="Monto"
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
          <option value="Efectivo">Efectivo</option>
          <option value="Tarjeta">Tarjeta</option>
          <option value="Transferencia">Transferencia</option>
        </select>
        <button
          type="submit"
          className="bg-blue-700 text-white px-4 py-2 rounded w-full"
          disabled={guardando}
        >{guardando ? "Guardando..." : "Guardar abono"}</button>
        <button
          type="button"
          className="bg-gray-400 text-white px-4 py-2 rounded w-full mt-2"
          onClick={onClose}
          disabled={guardando}
        >Cancelar</button>
        {mensaje && (
          <div className={`mt-2 text-sm ${mensaje.includes("Error") || mensaje.includes("inválido") ? "text-red-600" : "text-green-700"}`}>{mensaje}</div>
        )}

        {/* --- HISTORIAL --- */}
        <div className="mt-5">
          <h4 className="font-bold mb-2 text-blue-900">Historial reciente</h4>
          <div className="text-sm mb-2 font-bold">Ventas con deuda</div>
          <ul className="mb-3 max-h-24 overflow-y-auto">
            {resumen.ventas.length === 0 && <li className="text-gray-500">Sin ventas registradas</li>}
            {resumen.ventas.map(v => (
              <li key={v.id} className="mb-1">
                <span className="font-mono text-xs">{v.id.slice(0, 8)}</span> — <span className="font-bold">${(v.total_venta || 0).toFixed(2)}</span>
                {v.total_pagado > 0 && <> pagado: <span className="font-bold text-green-800">${v.total_pagado.toFixed(2)}</span></>}
                {v.estado_pago && <> — <span className="italic">{v.estado_pago}</span></>}
                <span className="ml-2 text-gray-400">{v.fecha?.slice(0,10)}</span>
              </li>
            ))}
          </ul>
          <div className="text-sm font-bold mb-1">Abonos previos</div>
          <ul className="max-h-24 overflow-y-auto">
            {resumen.pagos.length === 0 && <li className="text-gray-500">Sin abonos previos</li>}
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
