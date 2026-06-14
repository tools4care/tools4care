CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid,
  usuario_nombre text,
  van_id uuid,
  accion text NOT NULL,        -- 'credit_limit_change' | 'price_edit' | 'discount_applied' | 'sale_return'
  entidad_tipo text,            -- 'cliente' | 'producto' | 'venta'
  entidad_id uuid,
  detalles jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { before, after, ...extra }
  nota text
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_accion ON audit_log(accion);
CREATE INDEX IF NOT EXISTS idx_audit_log_entidad ON audit_log(entidad_tipo, entidad_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'auth manage audit log'
  ) THEN
    EXECUTE 'CREATE POLICY "auth manage audit log"
      ON audit_log FOR ALL TO authenticated
      USING (true) WITH CHECK (true)';
  END IF;
END $$;
