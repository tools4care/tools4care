// src/BottomNav.jsx
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  ShoppingCart,
  Users,
  Box,
  MoreHorizontal,
  ClipboardList,
  LogOut,
  Truck,
  UserCircle2,
  FileText,
  CreditCard,
  RefreshCcw,
} from "lucide-react";
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";
import { supabase } from "./supabaseClient";

const items = [
  { to: "/", label: "Home", icon: Home, color: "#2563eb" },
  { to: "/ventas", label: "Sales", icon: ShoppingCart, color: "#059669" },
  { to: "/productos", label: "Products", icon: Box, color: "#a21caf" },
  { to: "/clientes", label: "Customers", icon: Users, color: "#f59e42" },
  { to: "/cxc", label: "Accounts", icon: CreditCard, color: "#0ea5e9" },
  { action: "more", label: "More", icon: MoreHorizontal, color: "#64748b" },
];

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false);
  const { usuario, setUsuario } = useUsuario();
  const { van } = useVan();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    navigate("/login");
  };

  const handleNav = (path) => {
    setShowMore(false);
    navigate(path);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow z-50 flex justify-around items-center h-16 lg:hidden">
        {items.map(({ to, label, icon: Icon, action, color }) =>
          action === "more" ? (
            <button
              key="more"
              onClick={() => setShowMore(true)}
              className="flex flex-col items-center justify-center px-2 text-gray-500 hover:text-blue-600 transition"
            >
              <Icon size={22} color={color} />
              <span className="text-xs">{label}</span>
            </button>
          ) : (
            <NavLink
              to={to}
              key={to}
              className={({ isActive }) =>
                (isActive ? "text-blue-600" : "text-gray-500 hover:text-blue-600") +
                " flex flex-col items-center justify-center px-2 transition"
              }
              end={to === "/"}
            >
              <Icon size={22} color={color} />
              <span className="text-xs">{label}</span>
            </NavLink>
          )
        )}
      </nav>

      {showMore && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setShowMore(false)}>
          <div className="bg-white w-full rounded-t-2xl p-6 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="text-center font-semibold text-lg mb-1">More Options</div>

            <div className="flex flex-col gap-2">
              <button className="w-full flex items-center gap-2 py-2 px-3 rounded hover:bg-blue-50 text-left" onClick={() => handleNav("/inventario")}>
                <ClipboardList size={18} color="#6366f1" /> Inventory
              </button>
              <button className="w-full flex items-center gap-2 py-2 px-3 rounded hover:bg-blue-50 text-left" onClick={() => handleNav("/facturas")}>
                <FileText size={18} color="#a21caf" /> Invoicing
              </button>
              <button className="w-full flex items-center gap-2 py-2 px-3 rounded hover:bg-blue-50 text-left" onClick={() => handleNav("/cierres")}>
                <Truck size={18} color="#059669" /> Van Closeout
              </button>
              <button className="w-full flex items-center gap-2 py-2 px-3 rounded hover:bg-blue-50 text-left" onClick={() => handleNav("/cxc")}>
                <CreditCard size={18} color="#0ea5e9" /> Accounts Receivable
              </button>

              {/* ✅ NUEVO: acceso a Suplidores */}
              <button className="w-full flex items-center gap-2 py-2 px-3 rounded hover:bg-blue-50 text-left" onClick={() => handleNav("/suplidores")}>
                <UserCircle2 size={18} color="#4f46e5" /> Suppliers
              </button>

              {/* Igual a OnlineSidebar: solo navegar a /van */}
              <NavLink
                to="/van"
                onClick={() => setShowMore(false)}
                className="w-full flex items-center gap-2 py-2 px-3 rounded hover:bg-amber-50 text-left text-gray-700"
              >
                <RefreshCcw size={18} color="#b45309" /> Change VAN
              </NavLink>

              <button className="w-full flex items-center gap-2 py-2 px-3 rounded hover:bg-red-50 text-left" onClick={handleLogout}>
                <LogOut size={18} color="#dc2626" /> Log out
              </button>
            </div>

            <div className="mt-2 pt-2 border-t text-xs text-gray-500">
              <div className="flex items-center gap-1 mb-1">
                <UserCircle2 size={14} color="#2563eb" /> User:
                <b className="ml-1">{usuario?.email || "No session"}</b>
              </div>
              <div className="flex items-center gap-1">
                <Truck size={14} color="#059669" /> VAN:
                <b className="ml-1">{van?.nombre_van || van?.nombre || "Not selected"}</b>
              </div>
            </div>

            <button className="mt-3 w-full text-gray-400 font-medium text-sm" onClick={() => setShowMore(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
