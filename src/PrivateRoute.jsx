// src/PrivateRoute.jsx
import { Navigate } from "react-router-dom";
import { useUsuario } from "./UsuarioContext";


export default function PrivateRoute({ children }) {
  const { usuario } = useUsuario();

  if (usuario === undefined) return <div>Cargando...</div>; // Si tienes loading puedes agregarlo
  if (!usuario) return <Navigate to="/login" />;

  return children;
}
