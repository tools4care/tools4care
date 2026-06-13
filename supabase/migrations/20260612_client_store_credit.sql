ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS saldo_a_favor numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS cliente_credito_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('devolucion', 'aplicado_venta', 'ajuste')),
  monto numeric(12,2) NOT NULL,
  saldo_resultante numeric(12,2) NOT NULL,
  venta_id uuid REFERENCES ventas(id) ON DELETE SET NULL,
  usuario_id uuid,
  van_id uuid,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_credito_movimientos_cliente_fecha
  ON cliente_credito_movimientos(cliente_id, created_at DESC);

ALTER TABLE cliente_credito_movimientos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cliente_credito_movimientos'
      AND policyname = 'auth manage client store credit'
  ) THEN
    EXECUTE 'CREATE POLICY "auth manage client store credit"
      ON cliente_credito_movimientos FOR ALL TO authenticated
      USING (true) WITH CHECK (true)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION agregar_credito_favor_cliente(
  p_cliente_id uuid,
  p_monto numeric,
  p_tipo text DEFAULT 'devolucion',
  p_venta_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_van_id uuid DEFAULT NULL,
  p_nota text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo numeric(12,2);
BEGIN
  IF COALESCE(p_monto, 0) <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero';
  END IF;

  UPDATE clientes
  SET saldo_a_favor = ROUND(COALESCE(saldo_a_favor, 0) + p_monto, 2)
  WHERE id = p_cliente_id
  RETURNING saldo_a_favor INTO v_saldo;

  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found'; END IF;

  INSERT INTO cliente_credito_movimientos
    (cliente_id, tipo, monto, saldo_resultante, venta_id, usuario_id, van_id, nota)
  VALUES
    (p_cliente_id, p_tipo, ROUND(p_monto, 2), v_saldo, p_venta_id, p_usuario_id, p_van_id, p_nota);

  RETURN v_saldo;
END;
$$;

CREATE OR REPLACE FUNCTION aplicar_credito_favor_cliente(
  p_cliente_id uuid,
  p_monto numeric,
  p_venta_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_van_id uuid DEFAULT NULL,
  p_nota text DEFAULT NULL
)
RETURNS TABLE(aplicado numeric, saldo_resultante numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disponible numeric(12,2);
  v_aplicado numeric(12,2);
  v_saldo numeric(12,2);
BEGIN
  IF COALESCE(p_monto, 0) <= 0 THEN
    RETURN QUERY SELECT 0::numeric, COALESCE((SELECT saldo_a_favor FROM clientes WHERE id = p_cliente_id), 0)::numeric;
    RETURN;
  END IF;

  SELECT COALESCE(saldo_a_favor, 0)
  INTO v_disponible
  FROM clientes
  WHERE id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found'; END IF;

  v_aplicado := LEAST(v_disponible, ROUND(p_monto, 2));
  v_saldo := ROUND(v_disponible - v_aplicado, 2);

  UPDATE clientes SET saldo_a_favor = v_saldo WHERE id = p_cliente_id;

  IF v_aplicado > 0 THEN
    INSERT INTO cliente_credito_movimientos
      (cliente_id, tipo, monto, saldo_resultante, venta_id, usuario_id, van_id, nota)
    VALUES
      (p_cliente_id, 'aplicado_venta', -v_aplicado, v_saldo, p_venta_id, p_usuario_id, p_van_id, p_nota);
  END IF;

  RETURN QUERY SELECT v_aplicado::numeric, v_saldo::numeric;
END;
$$;

GRANT EXECUTE ON FUNCTION agregar_credito_favor_cliente(uuid, numeric, text, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION aplicar_credito_favor_cliente(uuid, numeric, uuid, uuid, uuid, text) TO authenticated;
