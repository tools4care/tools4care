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
import { UsuarioProvider, useUsuario } from "./UsuarioContext";
import { VanProvider, useVan } from "./hooks/VanContext";

// Ruta privada SOLO para login
function PrivateRoute({ children }) {
  const { usuario } = useUsuario();
  if (!usuario) return <Navigate to="/login" />;
  return children;
}

// Ruta privada que exige usuario y VAN seleccionada
function PrivateRouteWithVan({ children }) {
  const { usuario } = useUsuario();
  const { van } = useVan();
  if (!usuario) return <Navigate to="/login" />;
  if (!van) return <Navigate to="/van" />;
  return children;
}

// Layout para rutas privadas (Sidebar + contenido principal)
function LayoutPrivado() {
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
          {/* Redirección para rutas no encontradas */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <UsuarioProvider>
      <VanProvider>
        <Routes>
          {/* Login SIN sidebar */}
          <Route path="/login" element={<Login />} />
          {/* Selector de Van SIN sidebar */}
          <Route
            path="/van"
            element={
              <PrivateRoute>
                <VanSelector />
              </PrivateRoute>
            }
          />
          {/* Resto del sistema CON sidebar */}
          <Route
            path="/*"
            element={
              <PrivateRouteWithVan>
                <LayoutPrivado />
              </PrivateRouteWithVan>
            }
          />
        </Routes>
      </VanProvider>
    </UsuarioProvider>
  );
}
