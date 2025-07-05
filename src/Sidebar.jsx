import { useNavigate, useLocation, NavLink } from "react-router-dom";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { supabase } from "./supabaseClient";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { usuario, setUsuario } = useUsuario();
  const { van, setVan } = useVan();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    setVan(null);
    localStorage.clear();
    navigate("/login");
  };

  // 👇 NUEVA función para cambiar de VAN
  function handleChangeVan() {
    setVan(null);
    localStorage.removeItem("van");
    navigate("/van");
  }

  return (
    <div className="w-64 bg-slate-900 text-white min-h-screen flex flex-col">
      <div className="flex flex-col gap-2 p-4">
        <NavLink
          to="/"
          className={({ isActive }) => isActive ? "bg-blue-700 rounded text-white px-3 py-2" : "text-left px-3 py-2"}
          end
        >Dashboard</NavLink>
        <NavLink
          to="/ventas"
          className={({ isActive }) => isActive ? "bg-blue-700 rounded text-white px-3 py-2" : "text-left px-3 py-2"}
        >Ventas</NavLink>
        <NavLink
          to="/clientes"
          className={({ isActive }) => isActive ? "bg-blue-700 rounded text-white px-3 py-2" : "text-left px-3 py-2"}
        >Clientes</NavLink>
        <NavLink
          to="/productos"
          className={({ isActive }) => isActive ? "bg-blue-700 rounded text-white px-3 py-2" : "text-left px-3 py-2"}
        >Productos</NavLink>
        <NavLink
          to="/inventario"
          className={({ isActive }) => isActive ? "bg-blue-700 rounded text-white px-3 py-2" : "text-left px-3 py-2"}
        >Inventario</NavLink>
      </div>
      <div className="mt-auto p-4 text-xs border-t border-slate-700">
        <div>Usuario: <span className="font-bold">{usuario?.email || "Sin sesión"}</span></div>
        <div>VAN: <span className="font-bold">{van?.nombre_van || "No seleccionada"}</span></div>
        <button
          onClick={handleChangeVan}
          className="mt-2 w-full bg-yellow-400 text-black py-2 rounded font-bold hover:bg-yellow-500"
        >
          Cambiar VAN
        </button>
        <button
          onClick={handleLogout}
          className="mt-2 w-full bg-red-600 py-2 rounded font-bold"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
