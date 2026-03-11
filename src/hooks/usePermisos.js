// src/hooks/usePermisos.js
// ─────────────────────────────────────────────────────────────────
// Centralized Role-Based Permissions Hook
// Usage:  const { isAdmin, puedeEliminarClientes, puedeVerModulo, ... } = usePermisos();
//
// Roles:
//   "admin"      → full access — all features, user management, online, commissions
//   "supervisor" → operational access — products, prices, clients, suppliers (no user mgmt / online / commissions)
//   "vendedor"   → sales only — max 10% discount, view-only products, no deletes
//
// Per-user overrides (stored in usuarios table):
//   descuento_max  → custom max discount %; null = use role default
//   modulos        → array of allowed module keys; null = use role defaults
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

  // ── Per-user module visibility ──────────────────────────────────
  // If usuario.modulos is set, use it as the explicit allowlist.
  // Otherwise fall back to role defaults.
  function puedeVerModulo(key) {
    if (usuario?.modulos != null) return usuario.modulos.includes(key);
    // Role defaults
    if (key === "suplidores") return isPrivileged;
    if (key === "comisiones") return isAdmin;
    if (key === "online")     return isAdmin;
    if (key === "usuarios")   return isAdmin;
    return true; // all base modules visible by default
  }

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
    // Per-user override takes priority; falls back to role default (vendedor = 10%)
    maxDescuentoPct:     usuario?.descuento_max != null ? usuario.descuento_max : (isVendedor ? 10 : Infinity),
    puedeCancelarVentas: isPrivileged,

    // ── Inventory ─────────────────────────────────────────────
    puedeAgregarAlmacen: isPrivileged,   // Add Stock to warehouse (not van)
    // all roles: add stock to van, transfer, view

    // ── Module visibility (sidebar gating) ────────────────────
    puedeVerModulo,
    puedeVerSuplidores:     puedeVerModulo("suplidores"),
    puedeVerComisiones:     puedeVerModulo("comisiones"),
    puedeVerOnline:         isAdmin,      // online store stays admin-only
    puedeGestionarUsuarios: isAdmin,      // user management stays admin-only
    puedeCambiarVan:        isAdmin,      // admin only

    // ── Van Closeout ──────────────────────────────────────────
    puedeCerrarVan: true,    // all roles can close their own van
  };
}
