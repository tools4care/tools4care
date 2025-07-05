import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useVan } from "./hooks/VanContext";

export default function Layout() {
  const navigate = useNavigate();
  const { setVan } = useVan();

  async function logout() {
    await supabase.auth.signOut();
    setVan(null);
    navigate("/"); // Vuelve al login
  }

  return (
    <div className="flex min-h-screen">
      <nav className="w-60 bg-gray-900 text-white flex flex-col p-6">
        <NavLink to="/dashboard" className="mb-3" end>Dashboard</NavLink>
        <NavLink to="/ventas" className="mb-3">Ventas</NavLink>
        <NavLink to="/clientes" className="mb-3">Clientes</NavLink>
        <NavLink to="/productos" className="mb-3">Productos</NavLink>
        <NavLink to="/inventario" className="mb-3">Inventario</NavLink>
        <button
          onClick={logout}
          className="mt-auto bg-red-600 py-2 rounded"
        >Cerrar sesión</button>
      </nav>
      <main className="flex-1 p-6 bg-gray-100">
        <Outlet />
      </main>
    </div>
  );
}
