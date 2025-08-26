import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

// Estructura de cada regla: { min_qty, unit_price? , discount_pct? }
// Validaciones:
// - min_qty >=1, entero
// - unit_price >=0 o discount_pct entre 0 y 90
// - NO ambas unit_price y discount_pct a la vez
// - min_qty únicos y orden ascendente
// - Respeta margen mínimo (warning si rompe)

function normalizeNumber(v, decimals = 2) {
  if (v === "" || v == null || isNaN(Number(v))) return "";
  return Number(v).toFixed(decimals);
}

export default function PricingRulesEditor({ productId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState([]);
  const [product, setProduct] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id,name,base_price,base_cost,min_margin_pct,pricing_rules")
        .eq("id", productId)
        .single();
      if (error) {
        setErrorMsg(error.message);
      } else if (active) {
        setProduct(data);
        setRules(Array.isArray(data?.pricing_rules) ? data.pricing_rules : []);
      }
      setLoading(false);
    })();
    return () => (active = false);
  }, [productId]);

  const marginFloorUnit = useMemo(() => {
    if (!product) return null;
    const mm = Number(product.min_margin_pct || 0) / 100;
    return Number(product.base_cost) * (1 + mm);
  }, [product]);

  const sortedRules = useMemo(() => {
    const clone = [...rules];
    clone.sort((a, b) => Number(a.min_qty || 0) - Number(b.min_qty || 0));
    return clone;
  }, [rules]);

  function addRule() {
    setRules((prev) => [...prev, { min_qty: 1, unit_price: "", discount_pct: "" }]);
  }

  function removeRule(idx) {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRule(idx, field, value) {
    setRules((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, [field]: field === "min_qty" ? value.replace(/\D/g, "") : value } : r
      )
    );
  }

  function sanitizeAndSort() {
    const cleaned = rules
      .map((r) => {
        const min_qty = Math.max(1, parseInt(r.min_qty || "1", 10));
        let unit_price = r.unit_price !== "" && r.unit_price != null ? Number(r.unit_price) : null;
        let discount_pct =
          r.discount_pct !== "" && r.discount_pct != null ? Number(r.discount_pct) : null;

        // No permitir ambas
        if (unit_price != null && discount_pct != null) {
          // prioriza unit_price y limpia discount
          discount_pct = null;
        }

        // Redondeos
        if (unit_price != null) unit_price = Number(unit_price.toFixed(2));
        if (discount_pct != null) discount_pct = Number(discount_pct.toFixed(2));

        return { min_qty, ...(unit_price != null ? { unit_price } : {}), ...(discount_pct != null ? { discount_pct } : {}) };
      })
      // elimina reglas vacías (sin unit_price y sin discount_pct)
      .filter((r) => ("unit_price" in r) || ("discount_pct" in r));

    // Orden ascendente por min_qty y únicos
    const setSeen = new Set();
    const unique = [];
    for (const r of cleaned.sort((a, b) => a.min_qty - b.min_qty)) {
      if (!setSeen.has(r.min_qty)) {
        unique.push(r);
        setSeen.add(r.min_qty);
      }
    }
    return unique;
  }

  function validate(list) {
    const errs = [];

    // Conflictos básicos
    for (const r of list) {
      if (r.min_qty < 1) errs.push(`min_qty debe ser >= 1 (en ${r.min_qty}).`);
      if ("unit_price" in r && (r.unit_price < 0 || isNaN(r.unit_price)))
        errs.push(`unit_price inválido en min_qty ${r.min_qty}.`);
      if ("discount_pct" in r) {
        if (isNaN(r.discount_pct) || r.discount_pct < 0 || r.discount_pct > 90)
          errs.push(`discount_pct debe estar entre 0 y 90 (min_qty ${r.min_qty}).`);
      }
      if ("unit_price" in r && "discount_pct" in r)
        errs.push(`No uses unit_price y discount_pct juntos (min_qty ${r.min_qty}).`);
    }

    // Orden y duplicados ya están saneados en sanitizeAndSort()

    // Chequeo de margen (warning, no bloqueo): si hay product
    const warnings = [];
    if (product) {
      for (const r of list) {
        let u = null;
        if ("unit_price" in r) u = r.unit_price;
        else if ("discount_pct" in r) u = product.base_price * (1 - r.discount_pct / 100);
        if (u != null && marginFloorUnit != null && u < marginFloorUnit) {
          warnings.push(
            `Regla min_qty ${r.min_qty}: $${u.toFixed(2)} < piso por margen ($${marginFloorUnit.toFixed(2)}).`
          );
        }
      }
    }

    return { errs, warnings };
  }

  async function save() {
    setErrorMsg("");
    setSaving(true);
    try {
      const list = sanitizeAndSort();
      const { errs } = validate(list);
      if (errs.length) {
        setErrorMsg("Corrige las reglas: \n- " + errs.join("\n- "));
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from("products")
        .update({ pricing_rules: list })
        .eq("id", productId);
      if (error) throw error;
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Cargando reglas...</div>;
  if (!product) return <div>No se pudo cargar el producto. {errorMsg}</div>;

  const { warnings } = validate(sanitizeAndSort());

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>Precio por Cantidad</h3>
        <small>
          Base: ${Number(product.base_price).toFixed(2)} | Costo: ${Number(product.base_cost).toFixed(2)} | Margen mín.: {Number(product.min_margin_pct || 0)}%
        </small>
      </div>

      <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
            <th style={{ padding: 8 }}>Desde (qty)</th>
            <th style={{ padding: 8 }}>Unit Price ($)</th>
            <th style={{ padding: 8 }}>o Descuento (%)</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedRules.map((r, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={r.min_qty ?? ""}
                  onChange={(e) => updateRule(idx, "min_qty", e.target.value)}
                  style={{ width: 100 }}
                />
              </td>
              <td style={{ padding: 8 }}>
                <input
                  type="number"
                  step="0.01"
                  value={r.unit_price ?? ""}
                  onChange={(e) => updateRule(idx, "unit_price", e.target.value)}
                  onBlur={(e) =>
                    updateRule(idx, "unit_price", e.target.value === "" ? "" : normalizeNumber(e.target.value))
                  }
                  placeholder="p.ej. 11.00"
                  style={{ width: 140 }}
                />
              </td>
              <td style={{ padding: 8 }}>
                <input
                  type="number"
                  step="0.01"
                  value={r.discount_pct ?? ""}
                  onChange={(e) => updateRule(idx, "discount_pct", e.target.value)}
                  onBlur={(e) =>
                    updateRule(idx, "discount_pct", e.target.value === "" ? "" : normalizeNumber(e.target.value))
                  }
                  placeholder="p.ej. 15"
                  style={{ width: 140 }}
                />
              </td>
              <td style={{ padding: 8 }}>
                <button onClick={() => removeRule(idx)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {warnings.length > 0 && (
        <div style={{ marginTop: 10, background: "#fff7ed", color: "#9a3412", padding: 8, borderRadius: 6 }}>
          <strong>Advertencias de margen:</strong>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          <small>Se permitirá guardar, pero en tiempo de venta el RPC ajustará al piso de margen.</small>
        </div>
      )}

      {errorMsg && (
        <div style={{ marginTop: 10, background: "#fef2f2", color: "#991b1b", padding: 8, borderRadius: 6 }}>
          {errorMsg}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button onClick={addRule}>Añadir regla</button>
        <button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
      </div>
    </div>
  );
}
