// src/Sidebar.jsx
import { useNavigate, NavLink } from "react-router-dom";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { supabase } from "./supabaseClient";
import { useState } from "react";
import {
  Menu as MenuIcon,
  X as CloseIcon,
  BarChart2,
  ShoppingCart,
  Users,
  Box,
  ClipboardList,
  LogOut,
  Truck,
  UserCircle2,
  Receipt
} from "lucide-react";

// MENÚ actualizado con Facturas (y puedes reordenar como prefieras)
const menuItems = [
  { to: "/", label: "Dashboard", icon: BarChart2, exact: true },
  { to: "/ventas", label: "Ventas", icon: ShoppingCart },
  { to: "/facturas", label: "Facturas", icon: Receipt }, // <--- NUEVO
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/productos", label: "Productos", icon: Box },
  { to: "/inventario", label: "Inventario", icon: ClipboardList },
  { to: "/cierres", label: "Cierre de Van", icon: Truck }
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { usuario, setUsuario } = useUsuario();
  const { van, setVan } = useVan();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    setVan(null);
    localStorage.clear();
    navigate("/login");
  };

  function handleChangeVan() {
    setVan(null);
    localStorage.removeItem("van");
    navigate("/van");
  }

  function handleNavLinkClick() {
    setOpen(false);
  }

  return (
    <>
      {/* Botón hamburguesa SOLO en móvil */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden bg-blue-700 text-white rounded p-2 shadow focus:outline-none"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        style={{ display: open ? "none" : "block" }}
      >
        <MenuIcon size={28} />
      </button>

      {/* Overlay sólo móvil */}
      {open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar animado */}
      <aside className={`fixed z-50 top-0 left-0 h-full w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 
        ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:block`}>
        {/* Header con cerrar menú en mobile */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 lg:hidden">
          <div className="flex items-center gap-2">
            <UserCircle2 size={24} />
            <span className="font-bold text-lg">Menú</span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Cerrar menú">
            <CloseIcon size={28} />
          </button>
        </div>
        <div className="flex flex-col gap-1 p-4">
          {menuItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              to={to}
              key={to}
              className={({ isActive }) =>
                (isActive
                  ? "bg-blue-700 text-white "
                  : "text-gray-200 hover:bg-blue-800 hover:text-white ") +
                "flex items-center gap-3 rounded px-3 py-2 transition-all font-medium"
              }
              end={!!exact}
              onClick={handleNavLinkClick}
            >
              <Icon size={22} className="inline-block" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
        <div className="mt-auto p-4 text-xs border-t border-slate-800">
          <div className="flex items-center gap-1 mb-1">
            <UserCircle2 size={16} />
            <span>Usuario: </span>
            <span className="font-bold">{usuario?.email || "Sin sesión"}</span>
          </div>
          <div className="flex items-center gap-1 mb-2">
            <Truck size={16} />
            <span>VAN: </span>
            <span className="font-bold">{van?.nombre_van || "No seleccionada"}</span>
          </div>
          <button
            onClick={handleChangeVan}
            className="mt-1 w-full bg-yellow-400 text-black py-2 rounded font-bold hover:bg-yellow-500 transition"
          >
            Cambiar VAN
          </button>
          <button
            onClick={handleLogout}
            className="mt-2 w-full bg-red-600 py-2 rounded font-bold hover:bg-red-700 flex items-center justify-center gap-2"
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
