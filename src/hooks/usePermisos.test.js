// Tests the REAL src/hooks/usePermisos.js (not a reimplementation). Its only external
// dependency, useUsuario() from ../UsuarioContext, is mocked so this runs with fake
// data and no Supabase/DB connection. Uses react-dom/server (renderToStaticMarkup) to
// execute the hook synchronously in Node — no jsdom/browser environment needed.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../UsuarioContext", () => ({
  useUsuario: vi.fn(),
}));
import { useUsuario } from "../UsuarioContext";
import { usePermisos } from "./usePermisos";

function runPermisos(usuario) {
  useUsuario.mockReturnValue({ usuario });
  let captured;
  function Harness() {
    captured = usePermisos();
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness));
  return captured;
}

describe("usePermisos — priority 10: permisos por rol", () => {
  it("vendedor: sales-only access, 10% discount cap, cannot cancel sales or manage users", () => {
    const p = runPermisos({ rol: "vendedor" });
    expect(p.isVendedor).toBe(true);
    expect(p.maxDescuentoPct).toBe(10);
    expect(p.puedeCancelarVentas).toBe(false);
    expect(p.puedeEliminarProductos).toBe(false);
    expect(p.puedeEliminarClientes).toBe(false);
    expect(p.puedeGestionarUsuarios).toBe(false);
    expect(p.puedeVerComisiones).toBe(false);
    expect(p.puedeVerOnline).toBe(false);
    expect(p.puedeCambiarVan).toBe(false);
    expect(p.puedeCerrarVan).toBe(true); // every role can close their own van
  });

  it("supervisor: operational access, uncapped discount, still no user management", () => {
    const p = runPermisos({ rol: "supervisor" });
    expect(p.isSupervisor).toBe(true);
    expect(p.maxDescuentoPct).toBe(Infinity);
    expect(p.puedeCancelarVentas).toBe(true);
    expect(p.puedeEliminarProductos).toBe(true);
    expect(p.puedeAgregarAlmacen).toBe(true);
    expect(p.puedeGestionarUsuarios).toBe(false);
    expect(p.puedeVerComisiones).toBe(false); // comisiones stays admin-only
  });

  it("admin: full access including user management and commissions", () => {
    const p = runPermisos({ rol: "admin" });
    expect(p.isAdmin).toBe(true);
    expect(p.puedeGestionarUsuarios).toBe(true);
    expect(p.puedeVerComisiones).toBe(true);
    expect(p.puedeVerOnline).toBe(true);
    expect(p.puedeCambiarVan).toBe(true);
    expect(p.puedeCancelarVentas).toBe(true);
  });

  it("a per-user descuento_max override takes priority over the role default", () => {
    const p = runPermisos({ rol: "vendedor", descuento_max: 25 });
    expect(p.maxDescuentoPct).toBe(25);
  });

  it("a per-user modulos allowlist restricts module visibility even for an admin", () => {
    const p = runPermisos({ rol: "admin", modulos: ["ventas"] });
    expect(p.puedeVerModulo("ventas")).toBe(true);
    expect(p.puedeVerModulo("usuarios")).toBe(false);
    expect(p.puedeVerModulo("comisiones")).toBe(false);
  });

  it("defaults to vendedor-level permissions when no usuario is loaded yet", () => {
    const p = runPermisos(null);
    expect(p.rol).toBe("vendedor");
    expect(p.isVendedor).toBe(true);
    expect(p.maxDescuentoPct).toBe(10);
  });
});
