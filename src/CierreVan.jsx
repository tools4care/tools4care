import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import { supabase } from "./supabaseClient";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";

const METODOS_PAGO = [
  { campo: "pago_efectivo", label: "Efectivo" },
  { campo: "pago_tarjeta", label: "Tarjeta" },
  { campo: "pago_transferencia", label: "Transferencia" }
];
const EMPRESA_NOMBRE = "TOOLS4CARE";

export default function CierreVan() {
  const { usuario } = useUsuario();
  const { van } = useVan();

  const [esperados, setEsperados] = useState({});
  const [reales, setReales] = useState({});
  const [cuentasCobrar, setCuentasCobrar] = useState(0);
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [bloquear, setBloquear] = useState(false);

  const [ultimoCierre, setUltimoCierre] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState(""); // "success" o "error"

  // --- HISTORIAL ---
  const [cierres, setCierres] = useState([]);
  const [mostrarCierres, setMostrarCierres] = useState(false);
  const [buscarPorFecha, setBuscarPorFecha] = useState(false);
  const [fechaBuscada, setFechaBuscada] = useState(() => {
    const hoy = new Date();
    return hoy.toISOString().split("T")[0];
  });
  const [cierreSeleccionado, setCierreSeleccionado] = useState(null);

  // Modal de email (flujo simulado)
  const [modalEmail, setModalEmail] = useState(false);
  const [emailDestino, setEmailDestino] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [pdfParaEnviar, setPdfParaEnviar] = useState(null);

  useEffect(() => {
    setReales(
      METODOS_PAGO.reduce((acc, cur) => {
        acc[cur.campo] = "";
        return acc;
      }, {})
    );
  }, [van]);

  useEffect(() => {
    if (!van?.id) return;
    cargarDatos();
    // Dependiendo del modo de búsqueda, carga la lista correcta
    if (mostrarCierres) {
      if (buscarPorFecha) {
        cargarCierresPorFecha(fechaBuscada);
      } else {
        cargarUltimosCierres();
      }
    }
    // eslint-disable-next-line
  }, [van, mostrarCierres, buscarPorFecha, fechaBuscada]);

  async function cargarDatos() {
    setCargando(true);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio = hoy.toISOString();
    const fin = new Date(hoy.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { data: ventasPagadas, error } = await supabase
      .from("ventas")
      .select("pago_efectivo, pago_tarjeta, pago_transferencia")
      .eq("van_id", van.id)
      .eq("estado_pago", "pagado")
      .gte("fecha", inicio)
      .lt("fecha", fin);

    if (error) {
      setEsperados({});
      setCuentasCobrar(0);
      setCargando(false);
      setBloquear(true);
      return;
    }

    const totales = {};
    METODOS_PAGO.forEach(({ campo }) => {
      totales[campo] = (ventasPagadas || []).reduce((sum, v) => sum + Number(v[campo] || 0), 0);
    });
    setEsperados(totales);

    const hayCierrePendiente = Object.values(totales).some((v) => Number(v) > 0);
    setBloquear(!hayCierrePendiente);

    const { data: ventasCredito } = await supabase
      .from("ventas")
      .select("total_venta")
      .eq("van_id", van.id)
      .eq("estado_pago", "pendiente")
      .gte("fecha", inicio)
      .lt("fecha", fin);

    setCuentasCobrar((ventasCredito || []).reduce((sum, v) => sum + (v.total_venta || 0), 0));
    setCargando(false);
  }

  // --- HISTORIAL POR FECHA ---
  async function cargarCierresPorFecha(fecha) {
    if (!van?.id) return;
    const inicio = new Date(fecha + "T00:00:00");
    const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);

    let { data, error } = await supabase
      .from("cierres_van")
      .select("*")
      .eq("van_id", van?.id)
      .gte("fecha", inicio.toISOString())
      .lt("fecha", fin.toISOString())
      .order("fecha", { ascending: false });

    setCierres(data || []);
  }

  // --- HISTORIAL ÚLTIMOS 5 ---
  async function cargarUltimosCierres() {
    if (!van?.id) return;
    const { data, error } = await supabase
      .from("cierres_van")
      .select("*")
      .eq("van_id", van.id)
      .order("fecha", { ascending: false })
      .limit(5);
    setCierres(data || []);
  }

  function diferencia(valorEsperado, valorReal) {
    return Math.abs(Number(valorEsperado) - Number(valorReal || 0));
  }

  async function guardarCierre(e) {
    e.preventDefault();
    setGuardando(true);

    const payload = {
      van_id: van?.id,
      usuario_id: usuario?.id,
      comentario,
      cuentas_por_cobrar: cuentasCobrar
    };
    METODOS_PAGO.forEach(({ campo }) => {
      payload[`${campo.replace("pago_", "")}_esperado`] = esperados[campo] || 0;
      payload[`${campo.replace("pago_", "")}_real`] = Number(reales[campo] || 0);
    });

    const { data, error } = await supabase.from("cierres_van").insert([payload]).select();
    setGuardando(false);

    if (!error && data && data.length > 0) {
      setMensaje("¡Cierre registrado correctamente!");
      setTipoMensaje("success");
      setUltimoCierre({
        ...data[0],
        van: van,
        usuario: usuario,
        resumenEsperado: { ...esperados },
        resumenReales: { ...reales },
        comentario,
      });
      setReales(METODOS_PAGO.reduce((acc, cur) => { acc[cur.campo] = ""; return acc; }, {}));
      setComentario("");
      cargarDatos();
      if (mostrarCierres) {
        if (buscarPorFecha) {
          cargarCierresPorFecha(fechaBuscada);
        } else {
          cargarUltimosCierres();
        }
      }
      setTimeout(() => setMensaje(""), 2500);
    } else {
      setMensaje("Error al guardar el cierre: " + (error?.message || "Error desconocido"));
      setTipoMensaje("error");
      setTimeout(() => setMensaje(""), 4000);
    }
  }

  // PDF bonito: tabla, colores de cuadre, y fecha SIEMPRE visible
  async function descargarPDFResumen(_, cierre, triggerEmail = false) {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    let y = 18;

    pdf.setFontSize(18);
    pdf.setTextColor("#1E40AF");
    pdf.text(EMPRESA_NOMBRE, pageWidth / 2, y, { align: "center" });
    y += 8;
    pdf.setFontSize(12);
    pdf.setTextColor("#222");
    pdf.text("Resumen de Cierre de VAN", pageWidth / 2, y, { align: "center" });
    y += 8;

    // Fecha
    let fechaTexto = "-";
    if (cierre.fecha) {
      try {
        const fechaObj = new Date(cierre.fecha);
        fechaTexto = isNaN(fechaObj) ? "-" : fechaObj.toLocaleString();
      } catch {
        fechaTexto = "-";
      }
    } else {
      fechaTexto = new Date().toLocaleString();
    }

    const vanName = cierre.van?.nombre_van || cierre.nombre_van || "-";
    const usuarioName = cierre.usuario?.email || cierre.usuario_id || "-";

    pdf.setFontSize(11);
    pdf.setTextColor("#222");
    pdf.text(`Fecha: ${fechaTexto}`, 14, y);
    pdf.text(`VAN: ${vanName}`, 14, y + 7);
    pdf.text(`Usuario: ${usuarioName}`, 14, y + 14);

    y += 24;

    // Tabla
    pdf.setFontSize(12);
    pdf.setTextColor("#1E40AF");
    pdf.text("Método", 20, y);
    pdf.text("Esperado", 65, y);
    pdf.text("Contado", 110, y);
    y += 4;
    pdf.setDrawColor(80, 80, 80);
    pdf.line(14, y, pageWidth - 14, y);
    y += 6;

    pdf.setFontSize(11);

    let todoCuadra = true;
    METODOS_PAGO.forEach(({ campo, label }) => {
      const esperado = cierre.resumenEsperado
        ? cierre.resumenEsperado[campo] ?? 0
        : cierre[`${campo.replace("pago_", "")}_esperado`] ?? 0;
      const real = cierre.resumenReales
        ? cierre.resumenReales[campo] ?? 0
        : cierre[`${campo.replace("pago_", "")}_real`] ?? 0;
      const diff = Math.abs(Number(esperado) - Number(real));
      todoCuadra = todoCuadra && diff <= 1;
      // Color por cuadre
      if (diff > 1) {
        pdf.setTextColor("#C00000"); // Rojo para diferencias
      } else {
        pdf.setTextColor("#22732c"); // Verde si cuadra
      }
      pdf.text(label, 20, y);
      pdf.text(`$${Number(esperado).toFixed(2)}`, 65, y, { align: "left" });
      pdf.text(`$${Number(real).toFixed(2)}`, 110, y, { align: "left" });
      y += 8;
    });

    y += 2;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, y, pageWidth - 14, y);

    y += 10;
    pdf.setFontSize(12);
    pdf.setTextColor(todoCuadra ? "#22732c" : "#C00000");
    pdf.text("Cuentas por cobrar:", 14, y);
    pdf.setFontSize(11);
    pdf.setTextColor("#222");
    pdf.text(`$${Number(cierre.cuentas_por_cobrar).toFixed(2)}`, 65, y);

    y += 10;
    pdf.setFontSize(11);
    pdf.setTextColor("#222");
    pdf.text("Comentario:", 14, y);
    pdf.text(cierre.comentario || "—", 14, y + 6);

    y += 16;
    pdf.setFontSize(12);
    pdf.setTextColor(todoCuadra ? "#22732c" : "#C00000");
    pdf.text(
      todoCuadra
        ? "CIERRE CUADRADO ✔"
        : "¡DIFERENCIA DETECTADA! Revisa los montos.",
      14,
      y
    );

    pdf.setFontSize(9);
    pdf.setTextColor("#777");
    pdf.text(EMPRESA_NOMBRE + " - " + new Date().getFullYear(), pageWidth / 2, 287, { align: "center" });

    const fecha = cierre.fecha
      ? new Date(cierre.fecha).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const nombreArchivo = `CierreVan_${cierre.nombre_van || cierre.van_id || "van"}_${fecha}.pdf`;

    if (triggerEmail) {
      setPdfParaEnviar(pdf.output("blob"));
      setModalEmail(true);
    } else {
      pdf.save(nombreArchivo);
    }
  }

  async function enviarPorEmail(e) {
    e.preventDefault();
    setEnviandoEmail(true);
    setTimeout(() => {
      setEnviandoEmail(false);
      setModalEmail(false);
      setPdfParaEnviar(null);
      alert("PDF enviado por email a " + emailDestino + " (flujo simulado)");
    }, 1800);
  }

  // Resumen visual con colores de cuadre
  function ResumenCierre({ cierre, onClose, onDescargarPDF, onEnviarEmail }) {
    if (!cierre) return null;
    const vanName = cierre.van?.nombre_van || cierre.nombre_van || "-";
    const usuarioName = cierre.usuario?.email || cierre.usuario_id || "-";
    let todoCuadra = true;

    function getEsperadoReal(key, tipo) {
      if (cierre[`resumenEsperado`] && cierre[`resumenReales`]) {
        if (tipo === "esperado") return cierre.resumenEsperado[key] ?? 0;
        if (tipo === "real") return cierre.resumenReales[key] ?? 0;
      } else {
        if (tipo === "esperado") return cierre[`${key.replace("pago_", "")}_esperado`] ?? 0;
        if (tipo === "real") return cierre[`${key.replace("pago_", "")}_real`] ?? 0;
      }
      return 0;
    }

    // Detecta cuadre de toda la tabla
    METODOS_PAGO.forEach(({ campo }) => {
      const esperado = getEsperadoReal(campo, "esperado");
      const real = getEsperadoReal(campo, "real");
      if (Math.abs(Number(esperado) - Number(real)) > 1) {
        todoCuadra = false;
      }
    });

    // Fecha siempre presente
    let fechaTexto = "-";
    if (cierre.fecha) {
      try {
        const fechaObj = new Date(cierre.fecha);
        fechaTexto = isNaN(fechaObj) ? "-" : fechaObj.toLocaleString();
      } catch {
        fechaTexto = "-";
      }
    } else {
      fechaTexto = new Date().toLocaleString();
    }

    return (
      <div className={`mb-6 border-l-4 p-4 rounded shadow ${todoCuadra ? "bg-green-50 border-green-400" : "bg-red-50 border-red-400"}`}>
        <h3 className={`font-bold mb-2 ${todoCuadra ? "text-green-700" : "text-red-700"}`}>Cierre realizado</h3>
        <div className="mb-1 text-sm">
          <b>Fecha:</b> {fechaTexto}<br />
          <b>VAN:</b> {vanName}<br />
          <b>Usuario:</b> {usuarioName}
        </div>
        <table className="w-full mb-2 text-sm">
          <thead>
            <tr className="font-semibold">
              <td className="py-1">Método</td>
              <td className="py-1">Esperado</td>
              <td className="py-1">Contado</td>
            </tr>
          </thead>
          <tbody>
            {METODOS_PAGO.map(({ campo, label }) => {
              const esperado = getEsperadoReal(campo, "esperado");
              const real = getEsperadoReal(campo, "real");
              const dif = Math.abs(Number(esperado) - Number(real));
              return (
                <tr key={campo}
                  className={dif > 1
                    ? "bg-red-100 text-red-700 font-bold"
                    : "bg-green-100 text-green-700 font-bold"}>
                  <td>{label}</td>
                  <td>${Number(esperado).toFixed(2)}</td>
                  <td>${Number(real).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className={`text-sm mb-1 ${todoCuadra ? "text-green-800" : "text-red-800"}`}>
          <b>Cuentas por cobrar:</b> ${Number(cierre.cuentas_por_cobrar).toFixed(2)}
        </div>
        <div className="text-xs text-gray-600"><b>Comentario:</b> {cierre.comentario || "—"}</div>
        <div className="flex gap-2 mt-2">
          {onDescargarPDF && (
            <button
              className="px-3 py-1 rounded bg-green-100 text-green-700 text-xs font-semibold"
              onClick={() => onDescargarPDF(null, cierre, false)}
            >
              Descargar PDF
            </button>
          )}
          {onEnviarEmail && (
            <button
              className="px-3 py-1 rounded bg-yellow-100 text-yellow-700 text-xs font-semibold"
              onClick={() => onDescargarPDF(null, cierre, true)}
            >
              Enviar por email
            </button>
          )}
          {onClose && (
            <button
              className="px-3 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold"
              onClick={onClose}
            >
              Cerrar resumen
            </button>
          )}
        </div>
        <div className={`mt-3 font-bold ${todoCuadra ? "text-green-600" : "text-red-600"}`}>
          {todoCuadra ? "CIERRE CUADRADO ✔" : "¡DIFERENCIA DETECTADA! Revisa los montos."}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white shadow rounded p-4 mt-10">
      <h2 className="text-xl font-bold mb-4">Cierre de VAN - {van?.nombre_van || "Selecciona VAN"}</h2>
      {mensaje && (
        <div className={`mb-4 p-2 rounded text-center ${tipoMensaje === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {mensaje}
        </div>
      )}

      {/* Resumen de cierre reciente */}
      <ResumenCierre
        cierre={ultimoCierre}
        onClose={() => setUltimoCierre(null)}
        onDescargarPDF={descargarPDFResumen}
        onEnviarEmail={descargarPDFResumen}
      />
      {/* Resumen de cualquier cierre seleccionado del historial */}
      <ResumenCierre
        cierre={cierreSeleccionado}
        onClose={() => setCierreSeleccionado(null)}
        onDescargarPDF={descargarPDFResumen}
        onEnviarEmail={descargarPDFResumen}
      />

      <form onSubmit={guardarCierre}>
        {cargando ? (
          <div className="text-blue-600">Cargando montos...</div>
        ) : (
          <>
            {METODOS_PAGO.map(({ campo, label }) => {
              const dif = diferencia(esperados[campo] || 0, reales[campo]);
              const alerta = dif > 1;
              return (
                <div className="mb-3" key={campo}>
                  <label className="block font-semibold">{label} esperado:</label>
                  <input className="border p-2 w-full mb-2 bg-gray-100" value={esperados[campo] || 0} disabled />
                  <label className="block font-semibold">{label} contado:</label>
                  <input
                    className={`border p-2 w-full ${alerta ? "bg-red-100 border-red-400 animate-pulse" : ""}`}
                    type="number"
                    value={reales[campo] || ""}
                    onChange={e => setReales(r => ({ ...r, [campo]: e.target.value }))}
                    required
                    disabled={bloquear}
                  />
                  {alerta && (
                    <div className="text-xs text-red-600">
                      Diferencia de ${dif.toFixed(2)} con lo esperado.
                    </div>
                  )}
                </div>
              );
            })}
            <div className="mb-3">
              <label className="block font-semibold">Cuentas por cobrar del día:</label>
              <input className="border p-2 w-full mb-2 bg-gray-100" value={cuentasCobrar} disabled />
            </div>
            <div className="mb-3">
              <label className="block font-semibold">Comentario:</label>
              <textarea className="border p-2 w-full" value={comentario} onChange={e => setComentario(e.target.value)} disabled={bloquear} />
            </div>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded"
              type="submit"
              disabled={guardando || bloquear}
            >
              {guardando ? "Guardando..." : "Registrar Cierre"}
            </button>
            {bloquear && (
              <div className="mt-3 text-sm text-gray-500">
                No hay montos pendientes de cierre para esta VAN. Si hay nuevas ventas, se habilitará automáticamente.
              </div>
            )}
          </>
        )}
      </form>

      {/* Sección de historial y búsqueda */}
      <div className="mt-8 border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => {
              setMostrarCierres(m => !m);
              // Si ocultas, resetea a modo últimos 5
              if (mostrarCierres) setBuscarPorFecha(false);
            }}
            className="px-2 py-1 bg-gray-200 rounded text-sm"
          >
            {mostrarCierres ? "Ocultar cierres anteriores" : "Ver cierres anteriores"}
          </button>
          {mostrarCierres && (
            <div className="flex items-center ml-2">
              <input
                type="checkbox"
                checked={buscarPorFecha}
                onChange={e => setBuscarPorFecha(e.target.checked)}
                className="mr-2"
                id="filtroFecha"
              />
              <label htmlFor="filtroFecha" className="text-sm">Filtrar por fecha</label>
              {buscarPorFecha && (
                <input
                  type="date"
                  className="border p-1 rounded text-sm ml-2"
                  value={fechaBuscada}
                  onChange={e => setFechaBuscada(e.target.value)}
                />
              )}
            </div>
          )}
        </div>
        {mostrarCierres && (
          <ul className="text-sm max-h-48 overflow-y-auto mt-2">
            {cierres.length === 0 && (
              <li>
                {buscarPorFecha
                  ? "No hay cierres para esa fecha."
                  : "No hay cierres registrados."}
              </li>
            )}
            {cierres.map(c => (
              <li key={c.id} className="mb-1 border-b pb-1">
                <b>{c.fecha ? new Date(c.fecha).toLocaleString() : "-"}</b><br />
                Efectivo: <b>${c.efectivo_real ?? c.efectivo ?? "-"}</b> / Tarjeta: <b>${c.tarjeta_real ?? c.tarjeta ?? "-"}</b> / Transferencia: <b>${c.transferencia_real ?? c.transferencia ?? "-"}</b>
                <br />
                <span className="text-xs text-gray-500">Comentario: {c.comentario || "—"}</span>
                <button
                  className="ml-2 px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs"
                  onClick={() => setCierreSeleccionado(c)}
                >
                  Ver resumen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal para enviar por email (flujo simulado) */}
      {modalEmail && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-40">
          <div className="bg-white rounded p-6 shadow-md max-w-xs w-full">
            <h2 className="font-bold text-lg mb-2">Enviar cierre por email</h2>
            <form onSubmit={enviarPorEmail}>
              <input
                className="border p-2 w-full mb-3"
                placeholder="Destino (email)"
                type="email"
                value={emailDestino}
                onChange={e => setEmailDestino(e.target.value)}
                required
              />
              <div className="flex gap-2">
                <button
                  className="bg-blue-600 text-white px-3 py-1 rounded"
                  type="submit"
                  disabled={enviandoEmail}
                >
                  {enviandoEmail ? "Enviando..." : "Enviar"}
                </button>
                <button
                  className="bg-gray-200 text-gray-700 px-3 py-1 rounded"
                  type="button"
                  onClick={() => { setModalEmail(false); setPdfParaEnviar(null); }}
                  disabled={enviandoEmail}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
