// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Login from "./Login";
import VanSelector from "./components/VanSelector";
import Dashboard from "./Dashboard";
import Clientes from "./Clientes";
import Productos from "./Productos";
import Inventario from "./Inventario";
import Ventas from "./Ventas";
import CierreVan from "./CierreVan";

// 🛒 Storefront lo enruta main.jsx (no hace falta importarlo aquí)

// --- ÁREA ONLINE ---
import OnlineDashboard from "./online/OnlineDashboard";
import Orders from "./admin/Orders";

// ===== Guards (usan Providers de main.jsx) =====
import { useUsuario } from "./UsuarioContext";
import { useVan } from "./hooks/VanContext";

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

// Layout Vans (requiere VAN)
function VansShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 bg-gray-50">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/productos" element={<Productos />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/ventas" element={<Ventas />} />
          <Route path="/cierres" element={<CierreVan />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Login */}
      <Route path="/login" element={<Login />} />

      {/* Selector de VAN */}
      <Route
        path="/van"
        element={
          <PrivateRoute>
            <VanSelector />
          </PrivateRoute>
        }
      />

      {/* ✅ Online directo (sin Outlet/guard por ahora para validar) */}
      <Route path="/online" element={<OnlineDashboard />} />
      <Route path="/online/orders" element={<Orders />} />

      {/* Área Vans (login + VAN) */}
      <Route
        path="/*"
        element={
          <PrivateRouteWithVan>
            <VansShell />
          </PrivateRouteWithVan>
        }
      />
    </Routes>
  );
}
