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
import PreCierreVan from "./PreCierreVan"; // <-- NUEVO
import Facturas from "./Facturas";
import { UsuarioProvider, useUsuario } from "./UsuarioContext";
import { VanProvider, useVan } from "./hooks/VanContext";
import CuentasPorCobrar from "./CuentasPorCobrar.jsx";

// --- Guards ---
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
  return children;
}

// --- Layout ---
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
          {/* Público */}
          <Route path="/login" element={<Login />} />

          {/* Selección de VAN */}
          <Route
            path="/van"
            element={
              <PrivateRoute>
                <VanSelector />
              </PrivateRoute>
            }
          />

          {/* Privado */}
          <Route
            path="/*"
            element={
              <PrivateRouteWithVan>
                <LayoutPrivado />
              </PrivateRouteWithVan>
            }
          >
            {/* Hijos */}
            <Route path="" element={<Dashboard />} />

            {/* Clientes */}
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/nuevo" element={<Clientes />} />

            {/* Productos */}
            <Route path="productos/nuevo" element={<Productos />} />
            <Route path="productos" element={<Productos />} />

            <Route path="inventario" element={<Inventario />} />
            <Route path="ventas" element={<Ventas />} />

            {/* Pre-cierre primero */}
            <Route path="cierres" element={<PreCierreVan />} />
            {/* Cierre real */}
            <Route path="cierres/van" element={<CierreVan />} />

            <Route path="facturas" element={<Facturas />} />
            <Route path="cxc" element={<CuentasPorCobrar />} />

            {/* Catch-all (dejar al final) */}
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </VanProvider>
    </UsuarioProvider>
  );
}
