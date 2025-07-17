// src/components/Sidebar.jsx
import { Link, useLocation } from "react-router-dom";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
// ICONOS Lucide
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Users,
  Package,
  Boxes,
  Repeat,
  LogOut
} from "lucide-react";

const ICON_SIZE = 22;

export default function Sidebar() {
  const { usuario } = useUsuario();
  const { van, setVan } = useVan();
  const location = useLocation();

  // Menú de la app
  const menu = [
    {
      to: "/",
      icon: <LayoutDashboard size={ICON_SIZE} className="text-blue-400" />,
      text: "Dashboard",
    },
    {
      to: "/ventas",
      icon: <ShoppingCart size={ICON_SIZE} className="text-green-500" />,
      text: "Ventas",
    },
    {
      to: "/facturas",
      icon: <FileText size={ICON_SIZE} className="text-purple-500" />,
      text: "Facturas",
    },
    {
      to: "/clientes",
      icon: <Users size={ICON_SIZE} className="text-yellow-500" />,
      text: "Clientes",
    },
    {
      to: "/productos",
      icon: <Package size={ICON_SIZE} className="text-pink-500" />,
      text: "Productos",
    },
    {
      to: "/inventario",
      icon: <Boxes size={ICON_SIZE} className="text-teal-500" />,
      text: "Inventario",
    },
    {
      to: "/cierre-van",
      icon: <Repeat size={ICON_SIZE} className="text-cyan-600" />,
      text: "Cierre de Van",
    },
  ];

  function handleLogout() {
    // Aquí va tu lógica de logout (si tienes Supabase, etc)
    localStorage.clear();
    window.location.href = "/login";
  }

  // Mostrar botón de "Cambiar VAN" solo si es admin
  const mostrarCambiarVan = usuario?.rol === "admin";

  return (
    <aside className="bg-[#162941] text-white min-h-screen w-[220px] flex flex-col justify-between py-5 px-3">
      <div>
        <div className="font-bold text-lg mb-6 ml-2 tracking-wide">
          TOOLS4CARE
        </div>
        <nav className="flex flex-col gap-2">
          {menu.map(({ to, icon, text }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium hover:bg-[#23395d] transition ${
                location.pathname === to ? "bg-[#23395d]" : ""
              }`}
            >
              {icon}
              <span>{text}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {mostrarCambiarVan && (
          <button
            onClick={() => {
              setVan(null);
              localStorage.removeItem("van");
              window.location.href = "/vanselector";
            }}
            className="w-full bg-yellow-400 hover:bg-yellow-500 text-black py-2 px-3 rounded-lg font-semibold transition mb-2"
          >
            Cambiar VAN
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full bg-red-600 hover:bg-red-700 py-2 px-3 rounded-lg font-semibold flex items-center gap-2 justify-center"
        >
          <LogOut size={20} /> Cerrar sesión
        </button>

        <div className="text-xs mt-5 text-gray-300">
          <div className="mb-1">Usuario:</div>
          <div className="font-semibold">{usuario?.email || "-"}</div>
          <div className="mb-1 mt-2 text-gray-400">VAN:</div>
          <div className="font-semibold">{van?.nombre_van || "-"}</div>
        </div>
      </div>
    </aside>
  );
}
