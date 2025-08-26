// src/online/OnlineSidebar.jsx
import { NavLink } from "react-router-dom";

const base = "block rounded-lg px-3 py-2 font-medium transition-colors";
const active = "bg-blue-600 text-white";
const idle = "text-gray-700 hover:bg-gray-100";

export default function OnlineSidebar() {
  return (
    <aside className="w-[220px] shrink-0 border-r bg-white">
      <div className="px-4 py-4">
        <div className="text-sm font-semibold text-gray-900">Tienda Online</div>
      </div>

      <nav className="px-2 pb-4 space-y-1">
        <NavLink to="/online" end className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
          Resumen
        </NavLink>

        <NavLink to="/online/orders" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
          Pedidos
        </NavLink>

        <NavLink to="/online/catalog" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
          Catálogo
        </NavLink>
      </nav>
    </aside>
  );
}
