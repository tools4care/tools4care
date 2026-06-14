-- Expenses belong to one closeout only, so a second closeout on the same day
-- does not deduct the same expense again.
ALTER TABLE gastos_conductor ADD COLUMN IF NOT EXISTS cierre_id uuid REFERENCES cierres_dia(id) ON DELETE SET NULL;

UPDATE gastos_conductor AS g
SET cierre_id = (
  SELECT c.id
  FROM cierres_dia c
  WHERE c.van_id = g.van_id AND c.fecha = g.fecha
  ORDER BY COALESCE(c.periodo_hasta, c.created_at) DESC
  LIMIT 1
)
WHERE g.cierre_id IS NULL
  AND EXISTS (SELECT 1 FROM cierres_dia c WHERE c.van_id = g.van_id AND c.fecha = g.fecha);

CREATE INDEX IF NOT EXISTS gastos_conductor_cierre_id_idx ON gastos_conductor(cierre_id);
