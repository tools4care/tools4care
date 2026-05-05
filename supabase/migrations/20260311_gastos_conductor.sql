-- Migration: gastos_conductor
-- Driver daily expenses that are deducted from cash-on-hand at close

CREATE TABLE IF NOT EXISTS gastos_conductor (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  van_id        UUID          REFERENCES vans(id) ON DELETE CASCADE,
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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_conductor' AND policyname = 'gastos_conductor_all'
  ) THEN
    EXECUTE 'CREATE POLICY "gastos_conductor_all" ON gastos_conductor FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMENT ON TABLE gastos_conductor IS
  'Daily driver expenses (fuel, tolls, food, etc.) deducted from cash-on-hand at day close';
