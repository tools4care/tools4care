// src/hooks/usePermisos.js
// ─────────────────────────────────────────────────────────────────
// Centralized Role-Based Permissions Hook
// Usage:  const { isAdmin, puedeEliminarClientes, ... } = usePermisos();
// Roles:  "admin" → full access | "vendedor" → scoped access
// ─────────────────────────────────────────────────────────────────
import { useUsuario } from "../UsuarioContext";

export function usePermisos() {
  const { usuario } = useUsuario();
  const isAdmin = usuario?.rol === "admin";
  const isVendedor = !isAdmin;

  return {
    // ── Identity ──────────────────────────────────────────────
    isAdmin,
    isVendedor,
    rol: usuario?.rol ?? "vendedor",

    // ── Products ──────────────────────────────────────────────
    puedeCrearProductos:   isAdmin,  // "+ New product" button
    puedeEditarProductos:  isAdmin,  // form fields editable, save button
    puedeEliminarProductos:isAdmin,  // delete button

    // ── Clients ───────────────────────────────────────────────
    puedeCrearClientes:    true,     // both can create clients
    puedeEditarClientes:   true,     // both can edit contact info
    puedeEliminarClientes: isAdmin,  // delete client button
    puedeEditarLimiteCredito: isAdmin, // credit limit field

    // ── Sales ─────────────────────────────────────────────────
    maxDescuentoPct:    isAdmin ? Infinity : 10, // max % discount per item
    puedeCancelarVentas: isAdmin,    // cancel / void a sale

    // ── Inventory ─────────────────────────────────────────────
    puedeAgregarAlmacen: isAdmin,   // Add Stock to warehouse (not van)
    // both can: add stock to van, transfer, view

    // ── Navigation (sidebar gating) ───────────────────────────
    puedeVerSuplidores:   isAdmin,
    puedeVerComisiones:   isAdmin,
    puedeVerOnline:       isAdmin,
    puedeGestionarUsuarios: isAdmin,
    puedeCambiarVan:      isAdmin,

    // ── Van Closeout ──────────────────────────────────────────
    puedeCerrarVan: true,    // both can close their own van
  };
}
