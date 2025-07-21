import { useUsuario } from "./UsuarioContext";
import { Navigate } from "react-router-dom";

export default function PrivateRoute({ children }) {
  const { usuario, cargando } = useUsuario();

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-screen">
        <svg className="animate-spin h-12 w-12 text-blue-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
