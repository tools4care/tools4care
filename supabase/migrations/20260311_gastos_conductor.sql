-- Migration: gastos_conductor
-- Driver daily expenses that are deducted from cash-on-hand at close

CREATE TABLE IF NOT EXISTS gastos_conductor (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  van_id        INTEGER       REFERENCES vans(id) ON DELETE CASCADE,
  fecha         DATE          NOT NULL,
  categoria     TEXT          NOT NULL DEFAULT 'otro',
  descripcion   TEXT          NOT NULL DEFAULT '',
  monto         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_conductor_van_fecha
  ON gastos_conductor (van_id, fecha);

-- RLS: same van-based rules as other tables
ALTER TABLE gastos_conductor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gastos_conductor_all"
  ON gastos_conductor FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE gastos_conductor IS
  'Daily driver expenses (fuel, tolls, food, etc.) deducted from cash-on-hand at day close';
