// src/hooks/usePermisos.js
// ─────────────────────────────────────────────────────────────────
// Centralized Role-Based Permissions Hook
// Usage:  const { isAdmin, puedeEliminarClientes, ... } = usePermisos();
//
// Roles:
//   "admin"      → full access — all features, user management, online, commissions
//   "supervisor" → operational access — products, prices, clients, suppliers (no user mgmt / online / commissions)
//   "vendedor"   → sales only — max 10% discount, view-only products, no deletes
// ─────────────────────────────────────────────────────────────────
import { useUsuario } from "../UsuarioContext";

export function usePermisos() {
  const { usuario } = useUsuario();
  const rol = usuario?.rol ?? "vendedor";

  const isAdmin      = rol === "admin";
  const isSupervisor = rol === "supervisor";
  const isVendedor   = !isAdmin && !isSupervisor;

  // Admin + Supervisor share most operational permissions
  const isPrivileged = isAdmin || isSupervisor;

  return {
    // ── Identity ──────────────────────────────────────────────
    isAdmin,
    isSupervisor,
    isVendedor,
    rol,

    // ── Products ──────────────────────────────────────────────
    puedeCrearProductos:    isPrivileged,  // "+ New product" button
    puedeEditarProductos:   isPrivileged,  // form fields editable, save button
    puedeEliminarProductos: isPrivileged,  // delete button

    // ── Clients ───────────────────────────────────────────────
    puedeCrearClientes:       true,        // all roles can create clients
    puedeEditarClientes:      true,        // all roles can edit contact info
    puedeEliminarClientes:    isPrivileged, // delete client button
    puedeEditarLimiteCredito: isPrivileged, // credit limit field

    // ── Sales ─────────────────────────────────────────────────
    maxDescuentoPct:     isVendedor ? 10 : Infinity,  // vendedor capped at 10%
    puedeCancelarVentas: isPrivileged,                // cancel / void a sale

    // ── Inventory ─────────────────────────────────────────────
    puedeAgregarAlmacen: isPrivileged,   // Add Stock to warehouse (not van)
    // all roles: add stock to van, transfer, view

    // ── Navigation (sidebar gating) ───────────────────────────
    puedeVerSuplidores:     isPrivileged, // admin + supervisor
    puedeVerComisiones:     isAdmin,      // admin only
    puedeVerOnline:         isAdmin,      // admin only
    puedeGestionarUsuarios: isAdmin,      // admin only
    puedeCambiarVan:        isAdmin,      // admin only

    // ── Van Closeout ──────────────────────────────────────────
    puedeCerrarVan: true,    // all roles can close their own van
  };
}
