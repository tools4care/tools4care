// src/App.jsx
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import Login from "./Login";
import VanSelector from "./components/VanSelector";
import Dashboard from "./Dashboard";
import Clientes from "./Clientes";
import Productos from "./Productos";
import Inventario from "./Inventario";
import Ventas from "./Ventas";
import CierreVan from "./CierreVan";
import PreCierreVan from "./PreCierreVan";
import Facturas from "./Facturas";
import CuentasPorCobrar from "./CuentasPorCobrar.jsx";

// === Online ===
import OnlineLayout from "./online/OnlineLayout";
import OnlineDashboard from "./online/OnlineDashboard";
import Orders from "./admin/Orders";
import OnlineCatalog from "./online/OnlineCatalog";
import Checkout from "./storefront/Checkout";

// ➕ NUEVO: módulos del panel Online
import OnlineDiscounts from "./online/Discounts";
import OnlineInventory from "./online/Inventory";

// === Storefront público ===
import Storefront from "./storefront/Storefront";
// ✅ Callback público para confirmación de correo / magic link
import AuthCallback from "./storefront/AuthCallback";

import { UsuarioProvider, useUsuario } from "./UsuarioContext";
import { VanProvider, useVan } from "./hooks/VanContext";

function PrivateRoute({ children }) {
  const { usuario } = useUsuario();
  if (!usuario) return <Navigate to="/login" />;
  return children;
}

function PrivateRouteWithVan({ children }) {
  const { usuario } = useUsuario();
  const { van } = useVan();
  if (!usuario) return <Navigate to="/login" />;
  if (!van) return <Navigate to="/van" />;

  try {
    const raw = JSON.stringify(van).toLowerCase();
    if (raw.includes("online")) return <Navigate to="/online" replace />;
  } catch {}
  return children;
}

function LayoutPrivado() {
  return (
    <div className="min-h-screen bg-gray-50 flex lg:flex-row flex-col">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 pt-4 pb-20 px-2 sm:px-6 transition-all duration-300">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <UsuarioProvider>
      <VanProvider>
        <Routes>
          {/* --- Público: flujo tienda --- */}
          <Route path="/storefront" element={<Storefront />} />
          <Route path="/checkout" element={<Checkout />} />
          {/* Si algún código viejo navega a /online/checkout, redirigimos al checkout público */}
          <Route path="/online/checkout" element={<Navigate to="/checkout" replace />} />

          {/* ✅ Callback de autenticación (confirmación email / magic link) */}
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* --- Público general --- */}
          <Route path="/login" element={<Login />} />

          {/* Selección de VAN (protegido) */}
          <Route
            path="/van"
            element={
              <PrivateRoute>
                <VanSelector />
              </PrivateRoute>
            }
          />

          {/* ÁREA ONLINE (protegido, admin) */}
          <Route
            path="/online/*"
            element={
              <PrivateRoute>
                <OnlineLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<OnlineDashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="catalog" element={<OnlineCatalog />} />
            {/* ➕ NUEVOS módulos */}
            <Route path="discounts" element={<OnlineDiscounts />} />
            <Route path="inventory" element={<OnlineInventory />} />
            {/* checkout admin sigue existiendo vía redirect arriba */}
          </Route>

          {/* Área Vans (protegido) */}
          <Route
            path="/*"
            element={
              <PrivateRouteWithVan>
                <LayoutPrivado />
              </PrivateRouteWithVan>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/nuevo" element={<Clientes />} />
            <Route path="productos/nuevo" element={<Productos />} />
            <Route path="productos" element={<Productos />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="cierres" element={<PreCierreVan />} />
            <Route path="cierres/van" element={<CierreVan />} />
            <Route path="facturas" element={<Facturas />} />
            <Route path="cxc" element={<CuentasPorCobrar />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </VanProvider>
    </UsuarioProvider>
  );
}
