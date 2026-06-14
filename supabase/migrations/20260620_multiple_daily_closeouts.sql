-- Allow several independent closeouts for the same VAN and calendar day.
ALTER TABLE cierres_dia ADD COLUMN IF NOT EXISTS periodo_desde timestamptz;
ALTER TABLE cierres_dia ADD COLUMN IF NOT EXISTS periodo_hasta timestamptz;
ALTER TABLE cierres_dia ADD COLUMN IF NOT EXISTS numero_cierre integer;

UPDATE cierres_dia
SET periodo_hasta = COALESCE(periodo_hasta, created_at, (fecha::text || ' 23:59:59-04')::timestamptz),
    periodo_desde = COALESCE(periodo_desde, (fecha::text || ' 00:00:00-04')::timestamptz),
    numero_cierre = COALESCE(numero_cierre, 1)
WHERE periodo_hasta IS NULL OR periodo_desde IS NULL OR numero_cierre IS NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY van_id, fecha
    ORDER BY COALESCE(periodo_hasta, created_at) ASC, id ASC
  ) AS close_number
  FROM cierres_dia
)
UPDATE cierres_dia AS c
SET numero_cierre = ranked.close_number
FROM ranked
WHERE c.id = ranked.id;

DO $$
DECLARE
  constraint_name text;
  index_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'cierres_dia'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%van_id%'
      AND pg_get_constraintdef(con.oid) ILIKE '%fecha%'
  LOOP
    EXECUTE format('ALTER TABLE cierres_dia DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  FOR index_name IN
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'cierres_dia'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%van_id%'
      AND indexdef ILIKE '%fecha%'
      AND indexname NOT IN (
        SELECT con.conname FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'cierres_dia'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', index_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cierres_dia_van_fecha_numero_unique
  ON cierres_dia(van_id, fecha, numero_cierre);

CREATE INDEX IF NOT EXISTS cierres_dia_van_periodo_hasta_idx
  ON cierres_dia(van_id, periodo_hasta DESC);

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
