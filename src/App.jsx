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
import OnlineDiscounts from "./online/Discounts";

// === Storefront público ===
import Storefront from "./storefront/Storefront";
import AuthCallback from "./storefront/AuthCallback";

// 🆕 Payment pages
import PaymentSuccess from "./PaymentSuccess";
import PaymentCancelled from "./PaymentCancelled";

import { UsuarioProvider, useUsuario } from "./UsuarioContext";
import { VanProvider, useVan } from "./hooks/VanContext";

// 👇 NUEVO: módulo de Suplidores
import Suplidores from "./Suplidores";

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
          {/* --- Público: tienda --- */}
          <Route path="/storefront" element={<Storefront />} />
          <Route path="/shop" element={<Navigate to="/storefront" replace />} />
          <Route path="/store" element={<Navigate to="/storefront" replace />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/online/checkout" element={<Navigate to="/checkout" replace />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* 🆕 Payment Success/Cancel Pages */}
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/payment-cancelled" element={<PaymentCancelled />} />

          {/* --- Público general --- */}
          <Route path="/login" element={<Login />} />

          {/* Selector de VAN (protegido) */}
          <Route
            path="/van"
            element={
              <PrivateRoute>
                <VanSelector />
              </PrivateRoute>
            }
          />

          {/* ÁREA ONLINE (protegido) */}
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
            <Route path="discounts" element={<OnlineDiscounts />} />
            <Route path="inventory" element={<Navigate to="/online/catalog" replace />} />
          </Route>

          {/* Alias antiguos */}
          <Route path="/catalog" element={<Navigate to="/online/catalog" replace />} />

          {/* Área Vans (protegido + VAN) */}
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

            {/* 👇 NUEVO: ruta al módulo de Suplidores */}
            <Route path="suplidores" element={<Suplidores />} />

            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </VanProvider>
    </UsuarioProvider>
  );
}