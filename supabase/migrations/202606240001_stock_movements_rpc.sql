-- Production stock operations: atomic adjustments/transfers + basic movement audit.

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  tipo text NOT NULL,
  cantidad numeric NOT NULL,
  ubicacion text,
  van_id uuid NULL,
  motivo text,
  fecha timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid NULL,
  referencia_tipo text NULL,
  referencia_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS producto_id uuid;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS cantidad numeric;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS ubicacion text;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS van_id uuid NULL;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS fecha timestamptz DEFAULT now();
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS usuario_id uuid NULL;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS referencia_tipo text NULL;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS referencia_id uuid NULL;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_movimientos_stock_fecha ON movimientos_stock(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_producto_fecha ON movimientos_stock(producto_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_van_fecha ON movimientos_stock(van_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_tipo_fecha ON movimientos_stock(tipo, fecha DESC);

ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'movimientos_stock'
      AND policyname = 'auth manage movimientos_stock'
  ) THEN
    CREATE POLICY "auth manage movimientos_stock"
      ON movimientos_stock FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ajustar_stock(
  p_producto_id uuid,
  p_delta numeric,
  p_ubicacion text,
  p_van_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id uuid DEFAULT NULL
)
RETURNS TABLE(producto_id uuid, cantidad numeric, ubicacion text, van_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_id uuid;
  v_current numeric;
  v_next numeric;
  v_ubicacion text := lower(coalesce(p_ubicacion, ''));
BEGIN
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'producto_id is required'; END IF;
  IF COALESCE(p_delta, 0) = 0 THEN RAISE EXCEPTION 'delta must be non-zero'; END IF;
  IF v_ubicacion NOT IN ('warehouse', 'almacen', 'van') THEN
    RAISE EXCEPTION 'Invalid location: %', p_ubicacion;
  END IF;

  IF v_ubicacion = 'van' THEN
    IF p_van_id IS NULL THEN RAISE EXCEPTION 'van_id is required for van stock'; END IF;

    SELECT id, cantidad INTO v_row_id, v_current
    FROM stock_van
    WHERE van_id = p_van_id AND producto_id = p_producto_id
    FOR UPDATE;

    v_next := GREATEST(0, COALESCE(v_current, 0) + p_delta);

    IF v_row_id IS NULL THEN
      IF v_next > 0 THEN
        INSERT INTO stock_van(van_id, producto_id, cantidad)
        VALUES (p_van_id, p_producto_id, v_next);
      END IF;
    ELSIF v_next <= 0 THEN
      DELETE FROM stock_van WHERE id = v_row_id;
    ELSE
      UPDATE stock_van SET cantidad = v_next WHERE id = v_row_id;
    END IF;

    INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, referencia_tipo, referencia_id)
    VALUES (
      p_producto_id,
      CASE WHEN p_delta > 0 THEN 'AJUSTE_POSITIVO' ELSE 'AJUSTE_NEGATIVO' END,
      p_delta,
      'van',
      p_van_id,
      p_motivo,
      now(),
      p_usuario_id,
      p_referencia_tipo,
      p_referencia_id
    );

    RETURN QUERY SELECT p_producto_id, v_next, 'van'::text, p_van_id;
    RETURN;
  END IF;

  SELECT id, cantidad INTO v_row_id, v_current
  FROM stock_almacen
  WHERE producto_id = p_producto_id
  FOR UPDATE;

  v_next := GREATEST(0, COALESCE(v_current, 0) + p_delta);

  IF v_row_id IS NULL THEN
    IF v_next > 0 THEN
      INSERT INTO stock_almacen(producto_id, cantidad)
      VALUES (p_producto_id, v_next);
    END IF;
  ELSIF v_next <= 0 THEN
    DELETE FROM stock_almacen WHERE id = v_row_id;
  ELSE
    UPDATE stock_almacen SET cantidad = v_next WHERE id = v_row_id;
  END IF;

  INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, referencia_tipo, referencia_id)
  VALUES (
    p_producto_id,
    CASE WHEN p_delta > 0 THEN 'AJUSTE_POSITIVO' ELSE 'AJUSTE_NEGATIVO' END,
    p_delta,
    'almacen',
    NULL,
    p_motivo,
    now(),
    p_usuario_id,
    p_referencia_tipo,
    p_referencia_id
  );

  RETURN QUERY SELECT p_producto_id, v_next, 'almacen'::text, NULL::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION transferir_stock(
  p_producto_id uuid,
  p_cantidad numeric,
  p_origen_tipo text,
  p_origen_van_id uuid DEFAULT NULL,
  p_destino_tipo text DEFAULT NULL,
  p_destino_van_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(producto_id uuid, origen_cantidad numeric, destino_cantidad numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origen text := lower(coalesce(p_origen_tipo, ''));
  v_destino text := lower(coalesce(p_destino_tipo, ''));
  v_origin_row uuid;
  v_dest_row uuid;
  v_origin_current numeric;
  v_dest_current numeric;
  v_origin_next numeric;
  v_dest_next numeric;
BEGIN
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'producto_id is required'; END IF;
  IF COALESCE(p_cantidad, 0) <= 0 THEN RAISE EXCEPTION 'cantidad must be positive'; END IF;
  IF v_origen IN ('warehouse') THEN v_origen := 'almacen'; END IF;
  IF v_destino IN ('warehouse') THEN v_destino := 'almacen'; END IF;
  IF v_origen NOT IN ('almacen', 'van') OR v_destino NOT IN ('almacen', 'van') THEN
    RAISE EXCEPTION 'Invalid transfer locations';
  END IF;
  IF v_origen = v_destino AND COALESCE(p_origen_van_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_destino_van_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'Origin and destination must be different';
  END IF;
  IF v_origen = 'van' AND p_origen_van_id IS NULL THEN RAISE EXCEPTION 'origin van_id is required'; END IF;
  IF v_destino = 'van' AND p_destino_van_id IS NULL THEN RAISE EXCEPTION 'destination van_id is required'; END IF;

  IF v_origen = 'van' THEN
    SELECT id, cantidad INTO v_origin_row, v_origin_current
    FROM stock_van
    WHERE van_id = p_origen_van_id AND producto_id = p_producto_id
    FOR UPDATE;
  ELSE
    SELECT id, cantidad INTO v_origin_row, v_origin_current
    FROM stock_almacen
    WHERE producto_id = p_producto_id
    FOR UPDATE;
  END IF;

  IF v_origin_row IS NULL OR COALESCE(v_origin_current, 0) < p_cantidad THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %', COALESCE(v_origin_current, 0), p_cantidad;
  END IF;

  v_origin_next := COALESCE(v_origin_current, 0) - p_cantidad;

  IF v_origen = 'van' THEN
    IF v_origin_next <= 0 THEN
      DELETE FROM stock_van WHERE id = v_origin_row;
    ELSE
      UPDATE stock_van SET cantidad = v_origin_next WHERE id = v_origin_row;
    END IF;
  ELSE
    IF v_origin_next <= 0 THEN
      DELETE FROM stock_almacen WHERE id = v_origin_row;
    ELSE
      UPDATE stock_almacen SET cantidad = v_origin_next WHERE id = v_origin_row;
    END IF;
  END IF;

  IF v_destino = 'van' THEN
    SELECT id, cantidad INTO v_dest_row, v_dest_current
    FROM stock_van
    WHERE van_id = p_destino_van_id AND producto_id = p_producto_id
    FOR UPDATE;

    v_dest_next := COALESCE(v_dest_current, 0) + p_cantidad;

    IF v_dest_row IS NULL THEN
      INSERT INTO stock_van(van_id, producto_id, cantidad)
      VALUES (p_destino_van_id, p_producto_id, v_dest_next);
    ELSE
      UPDATE stock_van SET cantidad = v_dest_next WHERE id = v_dest_row;
    END IF;
  ELSE
    SELECT id, cantidad INTO v_dest_row, v_dest_current
    FROM stock_almacen
    WHERE producto_id = p_producto_id
    FOR UPDATE;

    v_dest_next := COALESCE(v_dest_current, 0) + p_cantidad;

    IF v_dest_row IS NULL THEN
      INSERT INTO stock_almacen(producto_id, cantidad)
      VALUES (p_producto_id, v_dest_next);
    ELSE
      UPDATE stock_almacen SET cantidad = v_dest_next WHERE id = v_dest_row;
    END IF;
  END IF;

  INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, metadata)
  VALUES
    (p_producto_id, 'TRANSFER_OUT', -p_cantidad, v_origen, CASE WHEN v_origen = 'van' THEN p_origen_van_id ELSE NULL END, p_motivo, now(), p_usuario_id,
      jsonb_build_object('destino_tipo', v_destino, 'destino_van_id', p_destino_van_id)),
    (p_producto_id, 'TRANSFER_IN', p_cantidad, v_destino, CASE WHEN v_destino = 'van' THEN p_destino_van_id ELSE NULL END, p_motivo, now(), p_usuario_id,
      jsonb_build_object('origen_tipo', v_origen, 'origen_van_id', p_origen_van_id));

  RETURN QUERY SELECT p_producto_id, v_origin_next, v_dest_next;
END;
$$;

CREATE OR REPLACE FUNCTION establecer_stock(
  p_producto_id uuid,
  p_cantidad numeric,
  p_ubicacion text,
  p_van_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(producto_id uuid, cantidad numeric, ubicacion text, van_id uuid, delta numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_id uuid;
  v_current numeric := 0;
  v_next numeric;
  v_delta numeric;
  v_ubicacion text := lower(coalesce(p_ubicacion, ''));
BEGIN
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'producto_id is required'; END IF;
  IF COALESCE(p_cantidad, -1) < 0 THEN RAISE EXCEPTION 'cantidad must be zero or greater'; END IF;
  IF v_ubicacion IN ('warehouse') THEN v_ubicacion := 'almacen'; END IF;
  IF v_ubicacion NOT IN ('almacen', 'van') THEN RAISE EXCEPTION 'Invalid location: %', p_ubicacion; END IF;
  IF v_ubicacion = 'van' AND p_van_id IS NULL THEN RAISE EXCEPTION 'van_id is required for van stock'; END IF;

  v_next := ROUND(p_cantidad, 4);

  IF v_ubicacion = 'van' THEN
    SELECT id, cantidad INTO v_row_id, v_current
    FROM stock_van
    WHERE van_id = p_van_id AND producto_id = p_producto_id
    FOR UPDATE;

    v_delta := v_next - COALESCE(v_current, 0);

    IF v_row_id IS NULL THEN
      IF v_next > 0 THEN
        INSERT INTO stock_van(van_id, producto_id, cantidad)
        VALUES (p_van_id, p_producto_id, v_next);
      END IF;
    ELSIF v_next <= 0 THEN
      DELETE FROM stock_van WHERE id = v_row_id;
    ELSE
      UPDATE stock_van SET cantidad = v_next WHERE id = v_row_id;
    END IF;

    INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, metadata)
    VALUES (p_producto_id, 'CONTEO_FISICO', v_delta, 'van', p_van_id, p_motivo, now(), p_usuario_id,
      jsonb_build_object('cantidad_anterior', COALESCE(v_current, 0), 'cantidad_nueva', v_next));

    RETURN QUERY SELECT p_producto_id, v_next, 'van'::text, p_van_id, v_delta;
    RETURN;
  END IF;

  SELECT id, cantidad INTO v_row_id, v_current
  FROM stock_almacen
  WHERE producto_id = p_producto_id
  FOR UPDATE;

  v_delta := v_next - COALESCE(v_current, 0);

  IF v_row_id IS NULL THEN
    IF v_next > 0 THEN
      INSERT INTO stock_almacen(producto_id, cantidad)
      VALUES (p_producto_id, v_next);
    END IF;
  ELSIF v_next <= 0 THEN
    DELETE FROM stock_almacen WHERE id = v_row_id;
  ELSE
    UPDATE stock_almacen SET cantidad = v_next WHERE id = v_row_id;
  END IF;

  INSERT INTO movimientos_stock(producto_id, tipo, cantidad, ubicacion, van_id, motivo, fecha, usuario_id, metadata)
  VALUES (p_producto_id, 'CONTEO_FISICO', v_delta, 'almacen', NULL, p_motivo, now(), p_usuario_id,
    jsonb_build_object('cantidad_anterior', COALESCE(v_current, 0), 'cantidad_nueva', v_next));

  RETURN QUERY SELECT p_producto_id, v_next, 'almacen'::text, NULL::uuid, v_delta;
END;
$$;

GRANT EXECUTE ON FUNCTION ajustar_stock(uuid, numeric, text, uuid, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION transferir_stock(uuid, numeric, text, uuid, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION establecer_stock(uuid, numeric, text, uuid, text, uuid) TO authenticated;
